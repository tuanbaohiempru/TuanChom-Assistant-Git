
// Load biến môi trường từ file .env (QUAN TRỌNG)
require('dotenv').config();

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { GoogleGenAI } = require("@google/genai");

// Lấy API Key từ biến môi trường
const API_KEY = process.env.API_KEY;

// Cấu hình timeout 300s (5 phút) và memory cao hơn để xử lý tác vụ AI nặng
exports.geminiGateway = onCall({ 
    cors: true, 
    maxInstances: 10,
    timeoutSeconds: 300, 
    memory: '512MiB'
}, async (request) => {
    
    // 1. Kiểm tra API Key tồn tại
    if (!API_KEY) {
        console.error("ERROR: API_KEY is missing in environment variables. Check functions/.env");
        throw new HttpsError('failed-precondition', 'Server chưa cấu hình API Key. Vui lòng kiểm tra file .env trong thư mục functions.');
    }

    const { endpoint, model, contents, message, history, systemInstruction, config } = request.data;
    
    console.log(`[Gemini Request] Endpoint: ${endpoint}, Model: ${model || 'default'}`);

    try {
        const ai = new GoogleGenAI({ apiKey: API_KEY });
        const targetModel = model || 'gemini-3-flash-preview'; 

        // --- Helper: Format System Instruction & Config ---
        const cleanConfig = { ...(config || {}) };
        
        // 1. Clean undefined/null values from config to prevent SDK errors
        Object.keys(cleanConfig).forEach(key => {
            if (cleanConfig[key] === undefined || cleanConfig[key] === null) {
                delete cleanConfig[key];
            }
        });

        // 2. Handle System Instruction specifically
        if (systemInstruction) {
            if (typeof systemInstruction === 'string') {
                cleanConfig.systemInstruction = { parts: [{ text: systemInstruction }] };
            } else if (Array.isArray(systemInstruction)) {
                cleanConfig.systemInstruction = { parts: systemInstruction };
            } else {
                cleanConfig.systemInstruction = systemInstruction;
            }
        }

        let resultText = '';

        if (endpoint === 'chat') {
            const chat = ai.chats.create({
                model: targetModel,
                config: cleanConfig,
                history: Array.isArray(history) ? history : []
            });
            
            // Ensure message is not empty/null
            const msgContent = message || contents || " "; 
            const result = await chat.sendMessage({ message: msgContent });
            resultText = result.text;
        } else {
            // Generate Content
            // IMPORTANT: Normalize contents. The SDK can handle strings, but explicit parts are safer.
            let formattedContents = contents;
            if (typeof contents === 'string') {
                formattedContents = { parts: [{ text: contents }] };
            }

            const result = await ai.models.generateContent({
                model: targetModel,
                contents: formattedContents,
                config: cleanConfig
            });
            resultText = result.text;
        }

        // Safety check for empty response
        if (!resultText) {
            console.warn("[Gemini Warning] Empty response text received.");
            return { text: "" };
        }

        return { text: resultText };

    } catch (error) {
        // Log full error details for debugging
        console.error("[Gemini API Error Details]", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
        
        let clientMessage = error.message || 'Lỗi không xác định từ AI Server';
        let code = 'internal';

        // Map errors to friendly messages
        if (clientMessage.includes('API key')) {
            clientMessage = 'API Key không hợp lệ hoặc hết hạn.';
            code = 'permission-denied';
        } else if (error.status === 404 || clientMessage.includes('not found')) {
            clientMessage = `Model '${model || 'mặc định'}' không tồn tại.`;
            code = 'not-found';
        } else if (error.status === 429) {
            clientMessage = 'Hệ thống đang quá tải (Quota Exceeded).';
            code = 'resource-exhausted';
        } else if (error.status === 400 || clientMessage.includes('INVALID_ARGUMENT')) {
            clientMessage = `Dữ liệu không hợp lệ: ${clientMessage}`;
            code = 'invalid-argument';
        } else if (clientMessage.includes('deadline')) {
             clientMessage = 'Hết thời gian chờ (Deadline Exceeded).';
             code = 'deadline-exceeded';
        } else if (clientMessage.includes('topic') || clientMessage.includes('fetch failed')) {
             // Catching the specific transport error reported
             clientMessage = 'Lỗi kết nối AI (Transport Error). Vui lòng thử lại sau vài giây.';
             code = 'unavailable';
        }

        throw new HttpsError(code, clientMessage);
    }
});

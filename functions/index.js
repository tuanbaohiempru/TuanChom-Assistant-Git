
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
        throw new HttpsError('failed-precondition', 'Server chưa cấu hình API Key.');
    }

    // Ensure data exists
    if (!request.data) {
        throw new HttpsError('invalid-argument', 'Request body is missing.');
    }

    const { endpoint, model, contents, message, history, systemInstruction, config } = request.data;
    
    console.log(`[Gemini Request] Endpoint: ${endpoint}, Model: ${model || 'default'}`);

    try {
        const ai = new GoogleGenAI({ apiKey: API_KEY });
        const targetModel = model || 'gemini-3-flash-preview'; 

        // --- Helper: Format System Instruction & Config ---
        const cleanConfig = { ...(config || {}) };
        
        // 1. Clean undefined/null values
        Object.keys(cleanConfig).forEach(key => {
            if (cleanConfig[key] === undefined || cleanConfig[key] === null) {
                delete cleanConfig[key];
            }
        });

        // 2. Handle System Instruction specifically
        if (systemInstruction) {
            try {
                if (typeof systemInstruction === 'string') {
                    cleanConfig.systemInstruction = { parts: [{ text: systemInstruction }] };
                } else if (Array.isArray(systemInstruction)) {
                    cleanConfig.systemInstruction = { parts: systemInstruction };
                } else {
                    cleanConfig.systemInstruction = systemInstruction;
                }
            } catch (e) {
                console.warn("Error parsing system instruction:", e);
                // Ignore if fails
            }
        }

        let resultText = '';

        if (endpoint === 'chat') {
            // Validate history
            const validHistory = Array.isArray(history) ? history : [];
            
            const chat = ai.chats.create({
                model: targetModel,
                config: cleanConfig,
                history: validHistory
            });
            
            // Ensure message is string
            const msgContent = message || (typeof contents === 'string' ? contents : " "); 
            const result = await chat.sendMessage({ message: msgContent });
            resultText = result.text;
        } else {
            // Generate Content
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

        if (!resultText) {
            console.warn("[Gemini Warning] Empty response text.");
            return { text: "" };
        }

        return { text: resultText };

    } catch (error) {
        // Safe logging
        console.error("[Gemini API Error]", error);
        
        const clientMessage = error.message || 'Lỗi không xác định từ AI Server';
        let code = 'internal';

        // Enhanced Error Mapping
        if (clientMessage.includes('API key')) {
            code = 'permission-denied';
        } else if (error.status === 404 || clientMessage.includes('not found')) {
            code = 'not-found';
        } else if (error.status === 429) {
            code = 'resource-exhausted';
        } else if (error.status === 400 || clientMessage.includes('INVALID_ARGUMENT')) {
            code = 'invalid-argument';
        } else if (clientMessage.includes('deadline')) {
             code = 'deadline-exceeded';
        } else if (clientMessage.includes('topic') || clientMessage.includes('fetch failed') || clientMessage.includes('undici')) {
             // Catch known transport issues
             code = 'unavailable';
        }

        throw new HttpsError(code, clientMessage, error);
    }
});

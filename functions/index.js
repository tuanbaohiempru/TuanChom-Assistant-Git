
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
    
    // Log để kiểm tra API Key đã được load chưa (Chỉ log 4 ký tự cuối để bảo mật)
    const keyStatus = API_KEY ? `Loaded (ends with ...${API_KEY.slice(-4)})` : 'MISSING';
    console.log(`[Gemini Init] API Key Status: ${keyStatus}`);

    // 1. Kiểm tra API Key tồn tại
    if (!API_KEY) {
        console.error("ERROR: API_KEY is missing in environment variables. Check functions/.env");
        throw new HttpsError('failed-precondition', 'Server chưa cấu hình API Key. Vui lòng kiểm tra file .env trong thư mục functions.');
    }

    const { endpoint, model, contents, message, history, systemInstruction, config } = request.data;
    
    // Log request để debug
    console.log(`[Gemini Request] Endpoint: ${endpoint}, Model: ${model || 'default'}`);

    try {
        const ai = new GoogleGenAI({ apiKey: API_KEY });
        
        // Cập nhật: Sử dụng gemini-3-flash-preview làm mặc định (thay cho 1.5-flash cũ)
        const targetModel = model || 'gemini-3-flash-preview'; 

        let resultText = '';

        if (endpoint === 'chat') {
            // Ensure systemInstruction is formatted correctly for chat config
            // If it's an array (parts), wrapping it in { parts: ... } is safer for the Node SDK
            let formattedSystemInstruction = systemInstruction;
            if (Array.isArray(systemInstruction)) {
                formattedSystemInstruction = { parts: systemInstruction };
            }

            const chat = ai.chats.create({
                model: targetModel,
                config: {
                    systemInstruction: formattedSystemInstruction, // Correctly formatted
                    ...config
                },
                history: history || []
            });
            // Chat: dùng sendMessage với object { message: ... }
            const result = await chat.sendMessage({ message: message || contents || "Hello" });
            resultText = result.text;
        } else {
            // Generate Content: dùng generateContent
            const result = await ai.models.generateContent({
                model: targetModel,
                contents: contents,
                config: {
                    systemInstruction: systemInstruction,
                    ...config
                }
            });
            resultText = result.text;
        }

        return { text: resultText };

    } catch (error) {
        console.error("[Gemini API Error Details]", JSON.stringify(error, null, 2));
        
        // Phân loại lỗi để trả về Client dễ hiểu hơn
        let clientMessage = error.message || 'Lỗi không xác định từ AI Server';
        let code = 'internal';

        if (clientMessage.includes('API key')) {
            clientMessage = 'API Key không hợp lệ hoặc hết hạn. Vui lòng kiểm tra lại.';
            code = 'permission-denied';
        } else if (error.status === 404 || clientMessage.includes('not found')) {
            clientMessage = `Model '${model || 'mặc định'}' không tồn tại. Hãy thử đổi model khác.`;
            code = 'not-found';
        } else if (error.status === 429) {
            clientMessage = 'Hệ thống đang quá tải (Quota Exceeded). Vui lòng thử lại sau.';
            code = 'resource-exhausted';
        } else if (error.status === 400) {
            clientMessage = 'Yêu cầu không hợp lệ (400). Kiểm tra lịch sử chat hoặc định dạng file.';
            code = 'invalid-argument';
        } else if (clientMessage.includes('deadline')) {
             clientMessage = 'Hết thời gian chờ (Deadline Exceeded). AI đang xử lý quá nhiều dữ liệu.';
             code = 'deadline-exceeded';
        }

        throw new HttpsError(code, clientMessage);
    }
});

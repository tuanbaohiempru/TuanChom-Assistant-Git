
// Load biến môi trường từ file .env (QUAN TRỌNG)
require('dotenv').config();

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { GoogleGenAI } = require("@google/genai");

// Lấy API Key từ biến môi trường
const API_KEY = process.env.API_KEY;

exports.geminiGateway = onCall({ cors: true, maxInstances: 10 }, async (request) => {
    
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
        
        // Sử dụng gemini-2.0-flash-exp nếu được yêu cầu, nếu không thì fallback
        const targetModel = model || 'gemini-2.0-flash-exp'; 

        let resultText = '';

        if (endpoint === 'chat') {
            const chat = ai.chats.create({
                model: targetModel,
                config: {
                    systemInstruction: systemInstruction,
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
        }

        throw new HttpsError(code, clientMessage);
    }
});

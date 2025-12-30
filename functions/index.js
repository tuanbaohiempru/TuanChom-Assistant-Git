
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { GoogleGenAI } = require("@google/genai");

// Lấy API Key từ biến môi trường (File .env)
const API_KEY = process.env.API_KEY;

exports.geminiGateway = onCall({ cors: true, maxInstances: 10 }, async (request) => {
    // 1. Kiểm tra API Key tồn tại
    if (!API_KEY) {
        console.error("ERROR: API_KEY is missing in environment variables.");
        throw new HttpsError('failed-precondition', 'Server chưa cấu hình API Key. Vui lòng kiểm tra file functions/.env');
    }

    const { endpoint, model, contents, message, history, systemInstruction, config } = request.data;
    
    // Log request để debug
    console.log(`[Gemini Request] Endpoint: ${endpoint}`);

    try {
        const ai = new GoogleGenAI({ apiKey: API_KEY });
        
        // Sử dụng gemini-3-flash-preview làm mặc định (Model mới nhất, nhanh và rẻ)
        const targetModel = model || 'gemini-3-flash-preview'; 

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
            // Chat: dùng sendMessage
            const result = await chat.sendMessage({ message: message || contents });
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
        let clientMessage = error.message;
        let code = 'internal';

        if (error.message && error.message.includes('API key not valid')) {
            clientMessage = 'API Key không hợp lệ. Vui lòng kiểm tra lại file functions/.env.';
            code = 'permission-denied';
        } else if (error.status === 404 || (error.message && error.message.includes('not found'))) {
            clientMessage = `Model '${model || 'mặc định'}' không tồn tại hoặc Key chưa được cấp quyền.`;
            code = 'not-found';
        } else if (error.status === 429) {
            clientMessage = 'Hệ thống đang quá tải (Quota Exceeded). Vui lòng thử lại sau.';
            code = 'resource-exhausted';
        }

        throw new HttpsError(code, clientMessage);
    }
});


const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { GoogleGenAI } = require("@google/genai");

// Lấy API Key từ biến môi trường của Functions
// Khi deploy, bạn cần set: firebase functions:config:set gemini.key="YOUR_API_KEY"
// Hoặc dùng secret manager của Google Cloud
const API_KEY = process.env.API_KEY;

/**
 * Universal Proxy for Gemini API
 * Accepts: { endpoint: 'chat'|'generateContent', model, contents, systemInstruction, history, config }
 */
exports.geminiGateway = onCall({ cors: true, maxInstances: 10 }, async (request) => {
    // 1. Validate API Key
    if (!API_KEY) {
        console.error("CRITICAL: API_KEY is missing in environment variables.");
        throw new HttpsError('failed-precondition', 'Server Misconfiguration: API Key not found.');
    }

    // 2. Validate Auth (Optional: Uncomment to enforce login)
    // if (!request.auth) {
    //    throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
    // }

    const { endpoint, model, contents, message, history, systemInstruction, config } = request.data;
    
    // Initialize SDK
    const ai = new GoogleGenAI({ apiKey: API_KEY });
    // Use the requested model or fallback
    const targetModel = model || 'gemini-3-flash-preview';

    console.log(`[Gemini] Request: ${endpoint} | Model: ${targetModel}`);

    try {
        let resultText = '';

        if (endpoint === 'chat') {
            // Chat Mode
            const chat = ai.chats.create({
                model: targetModel,
                config: {
                    systemInstruction: systemInstruction,
                    ...config
                },
                history: history || []
            });

            const result = await chat.sendMessage({ message: message || contents });
            resultText = result.text;

        } else {
            // Generate Content Mode (Single turn)
            const result = await ai.models.generateContent({
                model: targetModel,
                contents: contents, // Can be string or array of parts
                config: {
                    systemInstruction: systemInstruction,
                    ...config
                }
            });
            resultText = result.text;
        }

        return { text: resultText };

    } catch (error) {
        console.error("[Gemini API Error]", error);
        
        // Return a user-friendly error message
        let errorMessage = 'Error calling AI service';
        if (error.message.includes('API key not valid')) {
            errorMessage = 'Invalid API Key configured on server.';
        } else if (error.status === 429) {
            errorMessage = 'AI Service is busy (Quota exceeded). Please try again later.';
        } else {
            errorMessage = error.message;
        }

        throw new HttpsError('internal', errorMessage);
    }
});

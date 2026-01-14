
// Load biến môi trường từ file .env
require('dotenv').config();

// Sử dụng Cloud Functions V2
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const { GoogleGenAI } = require("@google/genai");
const pdfParse = require('pdf-parse'); // Library to extract text from PDF
const fs = require('fs');
const os = require('os');
const path = require('path');

// Cấu hình Global cho V2: Timeout 300s (5 phút), RAM 512MB
setGlobalOptions({ maxInstances: 10, timeoutSeconds: 300, memory: '512MiB' });

const API_KEY = process.env.API_KEY;

// Helper: Download file an toàn hơn sử dụng ArrayBuffer
const downloadFile = async (url, outputPath) => {
    try {
        console.log(`[Download] Starting: ${url.substring(0, 50)}...`);
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        fs.writeFileSync(outputPath, buffer);
        console.log(`[Download] Success: ${outputPath} (${buffer.length} bytes)`);
    } catch (e) {
        console.error(`[Download] Failed:`, e);
        throw new Error(`Download failed: ${e.message}`);
    }
};

exports.geminiGateway = onCall(async (request) => {
    const data = request.data; 

    if (!API_KEY) {
        throw new HttpsError('failed-precondition', 'Server chưa cấu hình API Key.');
    }

    if (!data) {
        throw new HttpsError('invalid-argument', 'Request body is missing.');
    }

    const { endpoint, model, contents, message, history, systemInstruction, config, url, fileUrls } = data;
    const ai = new GoogleGenAI({ apiKey: API_KEY });
    const DEFAULT_MODEL = 'gemini-3-flash-preview'; 

    // --- ENDPOINT: EXTRACT TEXT FROM PDF (Replacement for Cache) ---
    if (endpoint === 'extractText') {
        if (!url) {
            throw new HttpsError('invalid-argument', 'Missing URL for extraction.');
        }

        const tempDir = os.tmpdir();
        const tempFilePath = path.join(tempDir, `extract_${Date.now()}.pdf`);

        try {
            console.log(`[Extraction] Processing: ${url}`);
            // 1. Download File
            await downloadFile(url, tempFilePath);

            // 2. Read Buffer
            const dataBuffer = fs.readFileSync(tempFilePath);

            // 3. Extract Text using pdf-parse
            const pdfData = await pdfParse(dataBuffer);
            
            // Clean up text slightly (remove excessive newlines)
            const cleanText = pdfData.text.replace(/\n\s*\n/g, '\n').trim();

            console.log(`[Extraction] Success. Length: ${cleanText.length} chars.`);

            return { text: cleanText };

        } catch (error) {
            console.error("[Extraction Error]", error);
            throw new HttpsError('internal', `Failed to extract text: ${error.message}`);
        } finally {
            if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        }
    }

    // --- ENDPOINT: CHAT / GENERATE ---
    try {
        const targetModel = model || DEFAULT_MODEL;
        const cleanConfig = { ...(config || {}) };
        
        // Fix system instruction format
        if (systemInstruction) {
            if (typeof systemInstruction === 'string') {
                cleanConfig.systemInstruction = { parts: [{ text: systemInstruction }] };
            } else {
                cleanConfig.systemInstruction = systemInstruction;
            }
        }

        let initParams = { model: targetModel, config: cleanConfig };
        // No more cachedContent param

        let resultText = '';

        if (endpoint === 'chat') {
            const validHistory = Array.isArray(history) ? history : [];
            const chat = ai.chats.create({ ...initParams, history: validHistory });
            const msgContent = message || (typeof contents === 'string' ? contents : " "); 
            const result = await chat.sendMessage({ message: msgContent });
            resultText = result.text;
        } else {
            let formattedContents = contents;
            if (typeof contents === 'string') formattedContents = { parts: [{ text: contents }] };
            const result = await ai.models.generateContent({ ...initParams, contents: formattedContents });
            resultText = result.text;
        }

        return { text: resultText || "" };

    } catch (error) {
        console.error("[Gemini API Error]", error.message);
        
        let code = 'internal';
        if (error.message.includes('API key')) code = 'permission-denied';
        else if (error.status === 404) code = 'not-found';
        else if (error.status === 429) code = 'resource-exhausted';
        
        throw new HttpsError(code, error.message);
    }
});

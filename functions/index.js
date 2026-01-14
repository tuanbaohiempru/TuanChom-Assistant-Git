
// Load biến môi trường từ file .env
require('dotenv').config();

// Sử dụng Cloud Functions V2 để có timeout cao hơn và hiệu năng tốt hơn
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const { GoogleGenAI } = require("@google/genai");
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pipeline } = require('stream/promises');

// Cấu hình Global cho V2: Timeout 300s (5 phút), RAM 512MB
setGlobalOptions({ maxInstances: 10, timeoutSeconds: 300, memory: '512MiB' });

// Lấy API Key từ biến môi trường
const API_KEY = process.env.API_KEY;

// Helper to download file
const downloadFile = async (url, outputPath) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to download ${url}: ${response.statusText}`);
    const fileStream = fs.createWriteStream(outputPath);
    await pipeline(response.body, fileStream);
};

// Export Function 'geminiGateway' dùng V2 onCall
exports.geminiGateway = onCall(async (request) => {
    // Trong V2, dữ liệu nằm trong request.data
    const data = request.data; 

    // 1. Kiểm tra API Key
    if (!API_KEY) {
        console.error("ERROR: API_KEY is missing.");
        throw new HttpsError('failed-precondition', 'Server chưa cấu hình API Key.');
    }

    if (!data) {
        throw new HttpsError('invalid-argument', 'Request body is missing.');
    }

    const { endpoint, model, contents, message, history, systemInstruction, config, url, fileUrls, cachedContent } = data;
    const ai = new GoogleGenAI({ apiKey: API_KEY });

    // Model chuẩn cho Context Caching (Dùng 1.5 Flash vì ổn định và rẻ)
    const DEFAULT_MODEL = 'gemini-1.5-flash-001'; 

    // --- ENDPOINT: CREATE CACHE (Context Caching) ---
    if (endpoint === 'createCache') {
        if (!fileUrls || !Array.isArray(fileUrls) || fileUrls.length === 0) {
            return { cacheName: null, message: "No files to cache." };
        }

        const tempDir = os.tmpdir();
        const uploadedFiles = [];

        try {
            console.log(`[Cache] Processing ${fileUrls.length} PDF files...`);
            
            // 1. Download and Upload Files to Gemini
            for (const [index, fileUrl] of fileUrls.entries()) {
                if (!fileUrl) continue;
                // Tạo tên file ngẫu nhiên để tránh trùng lặp
                const tempFilePath = path.join(tempDir, `doc_${Date.now()}_${index}.pdf`);
                
                try {
                    // Download file từ Firebase Storage về temp server
                    await downloadFile(fileUrl, tempFilePath);
                    
                    // Upload lên Gemini Files API
                    const uploadResponse = await ai.files.uploadFile(tempFilePath, {
                        mimeType: 'application/pdf',
                        displayName: `Product Doc ${index}`
                    });
                    
                    uploadedFiles.push({
                        fileUri: uploadResponse.file.uri,
                        mimeType: uploadResponse.file.mimeType
                    });
                    
                    // Xóa file temp ngay để giải phóng bộ nhớ
                    if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
                    
                } catch (err) {
                    console.error(`[Cache] Error processing file ${index}:`, err);
                }
            }

            if (uploadedFiles.length === 0) {
                throw new Error("Failed to upload any files to Gemini.");
            }

            // 2. Wait for files to be ACTIVE (Quan trọng: Gemini cần thời gian xử lý file)
            // Đợi 5 giây để chắc chắn file đã sẵn sàng
            await new Promise(resolve => setTimeout(resolve, 5000));

            // 3. Create Cache
            // TTL 60 minutes (3600s)
            const cacheConfig = {
                model: model || DEFAULT_MODEL, 
                contents: uploadedFiles.map(f => ({
                    role: 'user',
                    parts: [{ fileData: { fileUri: f.fileUri, mimeType: f.mimeType } }]
                })),
                ttlSeconds: 3600 
            };

            const cacheResponse = await ai.caching.cachedContents.create(cacheConfig);
            console.log(`[Cache] Created successfully: ${cacheResponse.name}`);

            return { 
                cacheName: cacheResponse.name, 
                expirationTime: cacheResponse.expireTime,
                fileCount: uploadedFiles.length
            };

        } catch (error) {
            console.error("[Cache Error]", error);
            throw new HttpsError('internal', error.message || 'Failed to create cache');
        }
    }

    // --- ENDPOINT: FETCH URL (Legacy Proxy) ---
    if (endpoint === 'fetchUrl') {
        if (!url) throw new HttpsError('invalid-argument', 'Missing URL.');
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Fetch failed: ${response.statusText}`);
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const base64 = buffer.toString('base64');
            return { base64 };
        } catch (e) {
            throw new HttpsError('internal', 'Could not fetch file server-side.');
        }
    }

    // --- ENDPOINT: CHAT / GENERATE CONTENT ---
    try {
        const targetModel = model || DEFAULT_MODEL;
        
        const cleanConfig = { ...(config || {}) };
        Object.keys(cleanConfig).forEach(key => {
            if (cleanConfig[key] === undefined || cleanConfig[key] === null) delete cleanConfig[key];
        });

        // System Instruction
        if (systemInstruction) {
            try {
                if (typeof systemInstruction === 'string') {
                    cleanConfig.systemInstruction = { parts: [{ text: systemInstruction }] };
                } else {
                    cleanConfig.systemInstruction = systemInstruction;
                }
            } catch (e) { console.warn("Instruction parse error", e); }
        }

        let initParams = {
            model: targetModel,
            config: cleanConfig,
        };

        if (cachedContent) {
            initParams.cachedContent = cachedContent;
        }

        let resultText = '';

        if (endpoint === 'chat') {
            const validHistory = Array.isArray(history) ? history : [];
            const chat = ai.chats.create({
                ...initParams,
                history: validHistory
            });
            const msgContent = message || (typeof contents === 'string' ? contents : " "); 
            const result = await chat.sendMessage({ message: msgContent });
            resultText = result.text;
        } else {
            let formattedContents = contents;
            if (typeof contents === 'string') {
                formattedContents = { parts: [{ text: contents }] };
            }
            const result = await ai.models.generateContent({
                ...initParams,
                contents: formattedContents,
            });
            resultText = result.text;
        }

        return { text: resultText || "" };

    } catch (error) {
        console.error("[Gemini API Error Log]", error.message);
        const clientMessage = error.message || 'Lỗi không xác định từ AI Server';
        
        let code = 'internal';
        if (clientMessage.includes('API key')) code = 'permission-denied';
        else if (error.status === 404 || clientMessage.includes('not found')) code = 'not-found';
        else if (error.status === 429) code = 'resource-exhausted';
        
        throw new HttpsError(code, clientMessage);
    }
});

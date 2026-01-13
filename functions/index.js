
// Load biến môi trường từ file .env (QUAN TRỌNG)
require('dotenv').config();

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { GoogleGenAI } = require("@google/genai");
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pipeline } = require('stream/promises');

// Lấy API Key từ biến môi trường
const API_KEY = process.env.API_KEY;

// Helper to download file
const downloadFile = async (url, outputPath) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to download ${url}: ${response.statusText}`);
    const fileStream = fs.createWriteStream(outputPath);
    await pipeline(response.body, fileStream);
};

// Cấu hình timeout 300s (5 phút) và memory cao hơn để xử lý tác vụ AI nặng
exports.geminiGateway = onCall({ 
    cors: true, 
    maxInstances: 10,
    timeoutSeconds: 540, // Tăng lên 9 phút cho việc upload nhiều file
    memory: '1GiB' // Tăng RAM để xử lý file
}, async (request) => {
    
    // 1. Kiểm tra API Key tồn tại
    if (!API_KEY) {
        console.error("ERROR: API_KEY is missing in environment variables. Check functions/.env");
        throw new HttpsError('failed-precondition', 'Server chưa cấu hình API Key.');
    }

    if (!request.data) {
        throw new HttpsError('invalid-argument', 'Request body is missing.');
    }

    const { endpoint, model, contents, message, history, systemInstruction, config, url, fileUrls, cachedContent } = request.data;
    const ai = new GoogleGenAI({ apiKey: API_KEY });

    // --- ENDPOINT: CREATE CACHE (Context Caching) ---
    if (endpoint === 'createCache') {
        if (!fileUrls || !Array.isArray(fileUrls) || fileUrls.length === 0) {
            return { cacheName: null, message: "No files to cache." };
        }

        const tempDir = os.tmpdir();
        const uploadedFiles = [];

        try {
            console.log(`[Cache] Starting to process ${fileUrls.length} files...`);
            
            // 1. Download and Upload Files to Gemini
            for (const [index, fileUrl] of fileUrls.entries()) {
                if (!fileUrl) continue;
                const tempFilePath = path.join(tempDir, `doc_${index}.pdf`);
                
                try {
                    // Download to temp
                    await downloadFile(fileUrl, tempFilePath);
                    
                    // Upload to Gemini Files API
                    // Note: SDK might differ, using standard approach
                    const uploadResponse = await ai.files.uploadFile(tempFilePath, {
                        mimeType: 'application/pdf',
                        displayName: `Product Doc ${index}`
                    });
                    
                    uploadedFiles.push({
                        fileUri: uploadResponse.file.uri,
                        mimeType: uploadResponse.file.mimeType
                    });
                    
                    // Cleanup temp file immediately
                    fs.unlinkSync(tempFilePath);
                    
                } catch (err) {
                    console.error(`[Cache] Error processing file ${index}:`, err);
                    // Continue with other files even if one fails
                }
            }

            if (uploadedFiles.length === 0) {
                throw new Error("Failed to upload any files to Gemini.");
            }

            // 2. Wait for files to be processed (Active)
            // For simple PDFs, it's usually instant, but a small delay helps
            await new Promise(resolve => setTimeout(resolve, 2000));

            // 3. Create Cache
            // TTL: 55 minutes (Free tier limits or cost optimization)
            const cacheConfig = {
                model: 'models/gemini-1.5-flash-001', // Must use 1.5 Flash for Caching
                contents: uploadedFiles.map(f => ({
                    role: 'user',
                    parts: [{ fileData: { fileUri: f.fileUri, mimeType: f.mimeType } }]
                })),
                ttlSeconds: 3300 // 55 mins
            };

            const cacheResponse = await ai.caching.cachedContents.create(cacheConfig);
            console.log(`[Cache] Created successfully: ${cacheResponse.name}`);

            return { 
                cacheName: cacheResponse.name, 
                expirationTime: cacheResponse.expireTime 
            };

        } catch (error) {
            console.error("[Cache Error]", error);
            throw new HttpsError('internal', error.message || 'Failed to create cache');
        }
    }

    // --- ENDPOINT: FETCH URL (Legacy Proxy) ---
    if (endpoint === 'fetchUrl') {
        // ... (Giữ nguyên logic cũ nếu cần fallback)
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
        // Switch model to 1.5 Flash if using cache, otherwise use requested model or default
        const targetModel = cachedContent ? 'gemini-1.5-flash-001' : (model || 'gemini-3-flash-preview');
        
        const cleanConfig = { ...(config || {}) };
        
        // Clean undefined keys
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

        // Handle Cached Content Config
        let initParams = {
            model: targetModel,
            config: cleanConfig,
        };

        if (cachedContent) {
            // When using cache, the model is initialized WITH the cache
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
            // Generate Content
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
        else if (error.status === 404) code = 'not-found';
        else if (error.status === 429) code = 'resource-exhausted';
        
        throw new HttpsError(code, clientMessage);
    }
});


// Load biến môi trường từ file .env (QUAN TRỌNG)
require('dotenv').config();

const functions = require("firebase-functions");
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

// GEN 1 Cloud Function
exports.geminiGateway = functions
    .runWith({
        timeoutSeconds: 540,
        memory: '1GB',
        maxInstances: 10
    })
    .https.onCall(async (data, context) => {
    
    // 1. Kiểm tra API Key tồn tại
    if (!API_KEY) {
        console.error("ERROR: API_KEY is missing in environment variables.");
        throw new functions.https.HttpsError('failed-precondition', 'Server chưa cấu hình API Key.');
    }

    if (!data) {
        throw new functions.https.HttpsError('invalid-argument', 'Request body is missing.');
    }

    const { endpoint, model, contents, message, history, systemInstruction, config, url, fileUrls, cachedContent } = data;
    const ai = new GoogleGenAI({ apiKey: API_KEY });

    // Use consistent model for caching. 'gemini-1.5-flash-001' is Stable for Context Caching.
    const DEFAULT_MODEL = 'gemini-1.5-flash-001'; 

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
                }
            }

            if (uploadedFiles.length === 0) {
                throw new Error("Failed to upload any files to Gemini.");
            }

            // 2. Wait for files to be processed
            await new Promise(resolve => setTimeout(resolve, 2000));

            // 3. Create Cache
            // TTL 60 minutes
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
                expirationTime: cacheResponse.expireTime 
            };

        } catch (error) {
            console.error("[Cache Error]", error);
            throw new functions.https.HttpsError('internal', error.message || 'Failed to create cache');
        }
    }

    // --- ENDPOINT: FETCH URL (Legacy Proxy) ---
    if (endpoint === 'fetchUrl') {
        if (!url) throw new functions.https.HttpsError('invalid-argument', 'Missing URL.');
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Fetch failed: ${response.statusText}`);
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const base64 = buffer.toString('base64');
            return { base64 };
        } catch (e) {
            throw new functions.https.HttpsError('internal', 'Could not fetch file server-side.');
        }
    }

    // --- ENDPOINT: CHAT / GENERATE CONTENT ---
    try {
        const targetModel = model || DEFAULT_MODEL;
        
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
            // Important: cachedContent must be valid and exist on Google's side.
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
        
        // Return specific error message to client for Auto-healing handling
        const clientMessage = error.message || 'Lỗi không xác định từ AI Server';
        
        // Maps SDK errors to HTTP errors
        let code = 'internal';
        if (clientMessage.includes('API key')) code = 'permission-denied';
        else if (error.status === 404 || clientMessage.includes('not found')) code = 'not-found'; // Crucial for cache miss
        else if (error.status === 429) code = 'resource-exhausted';
        
        throw new functions.https.HttpsError(code, clientMessage);
    }
});

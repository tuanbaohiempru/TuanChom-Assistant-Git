
import { httpsCallable, Functions } from "firebase/functions";
import { functions, isFirebaseReady } from "./firebaseConfig";
import { GoogleGenAI } from "@google/genai";
import { AppState, Customer, AgentProfile, Contract, ProductStatus, PlanResult, Product } from "../types";

// Initialize Client-side AI (Fallback)
const getApiKey = (): string => {
    const envKey = process.env.API_KEY as string | undefined;
    if (envKey && typeof envKey === 'string' && envKey.length > 0) {
        return envKey;
    }
    return localStorage.getItem('gemini_api_key') || '';
};

const apiKey = getApiKey();
const clientAI = apiKey ? new GoogleGenAI({ apiKey }) : null;

let isServerAvailable = isFirebaseReady;

// --- CACHE MANAGEMENT ---
const CACHE_KEY_NAME = 'gemini_cache_name';
const CACHE_KEY_EXPIRY = 'gemini_cache_expiry';

// MODEL CHUẨN CHO CONTEXT CACHING
const CACHE_MODEL = 'gemini-1.5-flash-001'; 

const getActiveCache = (): string | null => {
    const name = localStorage.getItem(CACHE_KEY_NAME);
    const expiryStr = localStorage.getItem(CACHE_KEY_EXPIRY);
    
    if (!name || !expiryStr) return null;
    
    const expiry = parseInt(expiryStr, 10);
    // Buffer 5 phút
    if (Date.now() > expiry - 300000) {
        console.log("⚠️ Cache expired or about to expire locally.");
        return null;
    }
    return name;
};

const clearLocalCache = () => {
    localStorage.removeItem(CACHE_KEY_NAME);
    localStorage.removeItem(CACHE_KEY_EXPIRY);
    console.log("🧹 Local cache cleared.");
};

const createProductCache = async (products: Product[], forceRecreate: boolean = false): Promise<string | null> => {
    if (!isServerAvailable || !functions) return null;
    
    if (!forceRecreate) {
        const existing = getActiveCache();
        if (existing) return existing;
    }

    const pdfUrls: string[] = [];
    
    products.forEach(p => {
        const url = p.pdfUrl; 
        if (p.status === ProductStatus.ACTIVE && url && typeof url === 'string') {
            pdfUrls.push(url as string);
        }
    });

    if (pdfUrls.length === 0) return null;

    try {
        console.log(`🚀 Creating/Refreshing cache for ${pdfUrls.length} documents...`);
        const gateway = httpsCallable(functions as Functions, 'geminiGateway', { timeout: 300000 }); // Client timeout 5 phút
        
        const result: any = await gateway({
            endpoint: 'createCache',
            fileUrls: pdfUrls,
            model: CACHE_MODEL
        });

        if (result.data && result.data.cacheName) {
            const cacheName = result.data.cacheName as string;
            const expiresAt = Date.now() + (55 * 60 * 1000); // 55 mins
            
            localStorage.setItem(CACHE_KEY_NAME, cacheName);
            localStorage.setItem(CACHE_KEY_EXPIRY, expiresAt.toString());
            
            console.log(`✅ Cache created successfully: ${cacheName}`);
            return cacheName;
        }
    } catch (e) {
        console.error("❌ Failed to create cache:", e);
    }
    return null;
};

// --- MAIN CALL FUNCTION ---
const callAI = async (payload: any): Promise<string> => {
    // 1. Ưu tiên dùng Cloud Function (Server-side)
    if (isServerAvailable && functions) {
        try {
            const gateway = httpsCallable(functions as Functions, 'geminiGateway', { timeout: 300000 }); // 5 phút client timeout 
            const result: any = await gateway(payload);
            return (result.data.text as string) || "";
        } catch (serverError: any) {
            console.warn("⚠️ Server Backend failed or returned error.", serverError);
            
            if (payload.cachedContent || serverError.message?.includes('cache') || serverError.message?.includes('not found')) {
                throw serverError;
            }
            
            if (!payload.cachedContent) {
                isServerAvailable = false;
            } else {
                return "Kết nối đến kho dữ liệu bị gián đoạn. Vui lòng thử lại.";
            }
        }
    }

    // 2. Fallback xuống Client-side (Direct API)
    try {
        if (!clientAI) throw new Error("Missing API Key");
        
        const { cachedContent, ...clientPayload } = payload;
        
        const modelId = (clientPayload.model as string) || 'gemini-3-flash-preview'; 
        const config = clientPayload.config || {};
        if (clientPayload.systemInstruction) config.systemInstruction = clientPayload.systemInstruction;

        if (clientPayload.endpoint === 'chat') {
            const chat = clientAI.chats.create({
                model: modelId,
                config: config,
                history: clientPayload.history || []
            });
            const msg = clientPayload.message || " ";
            const result = await chat.sendMessage({ message: msg });
            return result.text || "";
        } else {
            const result = await clientAI.models.generateContent({
                model: modelId,
                contents: clientPayload.contents,
                config: config
            });
            return result.text || "";
        }
    } catch (clientError: any) {
        console.error("❌ Client AI Error:", clientError);
        return `Lỗi AI: ${clientError.message}`;
    }
};

// --- HELPER FUNCTIONS ---
export const generateFinancialAdvice = async (customerName: string, planResult: PlanResult): Promise<string> => {
    const prompt = `Bạn là Chuyên gia Tài chính Prudential. Nhận xét ngắn về KH ${customerName}. Mục tiêu: ${planResult.goal}. Gap: ${planResult.shortfall.toLocaleString()}đ. Lời khuyên 3 câu.`;
    return await callAI({ endpoint: 'generateContent', model: 'gemini-3-flash-preview', contents: prompt });
};

const prepareJsonContext = (state: AppState) => {
  const recentCustomers = state.customers.slice(0, 30);
  const recentContracts = state.contracts.slice(0, 30);
  return JSON.stringify({
    customers: recentCustomers.map(c => ({ name: c.fullName, id: c.id, health: c.health, status: c.status })),
    contracts: recentContracts.map(c => ({ number: c.contractNumber, product: c.mainProduct.productName, fee: c.totalFee, status: c.status })),
    products_summary: state.products.map(p => ({ name: p.name, type: p.type, status: p.status }))
  });
};

const sanitizeHistory = (history: any[]) => {
    const firstUserIndex = history.findIndex(h => h.role === 'user');
    if (firstUserIndex === -1) return [];
    const validHistory = history.slice(firstUserIndex);
    return validHistory.map(h => ({
        role: h.role,
        parts: h.parts || [{ text: h.text }]
    }));
};

// --- CHAT WITH DATA ---
export const chatWithData = async (
  query: string, 
  appState: AppState, 
  history: { role: 'user' | 'model'; text: string }[]
): Promise<string> => {
    
    const jsonData = prepareJsonContext(appState);
    
    // 1. Lấy Cache (Nếu chưa có, tạo mới)
    let cacheName: string | null = await createProductCache(appState.products, false);

    // Prompt cực mạnh để ép AI đọc file
    const systemInstructionText = `Bạn là TuanChom AI, Trợ lý Nghiệp vụ Bảo hiểm Prudential.
    
    DỮ LIỆU BỐI CẢNH (Context Cache):
    ${cacheName ? '✅ KHO TÀI LIỆU SẢN PHẨM (PDF) ĐÃ ĐƯỢC NẠP. BẠN PHẢI SỬ DỤNG THÔNG TIN TRONG ĐÓ ĐỂ TRẢ LỜI CÁC CÂU HỎI VỀ SỐ LIỆU, ĐIỀU KHOẢN, QUYỀN LỢI.' : '⚠️ CẢNH BÁO: Không tìm thấy tài liệu PDF đính kèm. Chỉ trả lời dựa trên kiến thức chung.'}
    
    QUY TẮC TUYỆT ĐỐI:
    1. Khi được hỏi về "Quyền lợi", "Chi trả", "Hạn mức", "Số tiền giường", "Phẫu thuật"... BẠN PHẢI TRA CỨU TRONG FILE PDF ĐÍNH KÈM (nếu có).
    2. Nếu tìm thấy thông tin trong file PDF, hãy trích dẫn số liệu cụ thể (VD: "Theo quy tắc, tiền giường là 2.000.000đ/ngày").
    3. Nếu không tìm thấy thông tin trong file PDF, hãy nói rõ: "Tôi không tìm thấy thông tin này trong tài liệu bạn đã tải lên."
    4. Trả lời ngắn gọn, chuyên nghiệp.

    Dữ liệu tóm tắt trên ứng dụng (tham khảo thêm):
    ${jsonData}
    `;

    const cleanHistory = sanitizeHistory(history);

    try {
        return await callAI({
            endpoint: 'chat',
            cachedContent: cacheName, 
            model: CACHE_MODEL, 
            message: query,
            history: cleanHistory,
            systemInstruction: systemInstructionText, 
            config: { temperature: 0.1 } // Giảm nhiệt độ để tăng độ chính xác
        });

    } catch (error: any) {
        const errString = error.message || error.toString();
        // Auto-healing logic
        if (cacheName && (errString.includes('not found') || errString.includes('cache') || errString.includes('invalid argument'))) {
            console.warn("⚠️ Cache miss/expired on server. Triggering auto-healing...");
            clearLocalCache();
            
            // Retry once
            const newCacheName = await createProductCache(appState.products, true);
            if (newCacheName) {
                try {
                    return await callAI({
                        endpoint: 'chat',
                        cachedContent: newCacheName, 
                        model: CACHE_MODEL, 
                        message: query,
                        history: cleanHistory,
                        systemInstruction: systemInstructionText, 
                        config: { temperature: 0.1 }
                    });
                } catch (retryError) {
                    return "Hệ thống đang đồng bộ dữ liệu lớn. Vui lòng thử lại sau 1 phút.";
                }
            }
        }
        return "Xin lỗi, tôi chưa đọc được tài liệu lúc này. Vui lòng thử lại sau.";
    }
};

export const consultantChat = async (
    query: string, customer: Customer, contracts: Contract[], familyContext: any[],
    agentProfile: AgentProfile | null, conversationGoal: string,
    history: { role: 'user' | 'model'; text: string }[],
    roleplayMode: 'consultant' | 'customer' = 'consultant',
    planResult: PlanResult | null = null,
    chatStyle: 'zalo' | 'formal' = 'formal'
): Promise<string> => {
    const fullProfile = `Khách: ${customer.fullName}, Tuổi: ${new Date().getFullYear() - new Date(customer.dob).getFullYear()}`;
    const cleanHistory = sanitizeHistory(history);

    try {
        return await callAI({
            endpoint: 'chat',
            model: 'gemini-1.5-flash-001',
            message: query,
            history: cleanHistory,
            systemInstruction: `Roleplay: ${roleplayMode}. Goal: ${conversationGoal}. Profile: ${fullProfile}. Style: ${chatStyle}`,
            config: { temperature: 0.7 }
        });
    } catch (e) {
        return "Lỗi kết nối AI.";
    }
};

export const getObjectionSuggestions = async (msg: string, customer: Customer): Promise<any[]> => {
    const text = await callAI({
        endpoint: 'generateContent',
        model: 'gemini-1.5-flash-001',
        contents: `Khách: "${msg}". Gợi ý 3 cách xử lý từ chối. Output JSON.`,
        config: { responseMimeType: "application/json" }
    });
    try { return JSON.parse(text); } catch { return []; }
};

export const generateSocialPost = async (topic: string, tone: string): Promise<any[]> => {
    const text = await callAI({
        endpoint: 'generateContent',
        model: 'gemini-1.5-flash-001',
        contents: `Topic: ${topic}. Tone: ${tone}. Viết 3 status FB. Output JSON array {title, content}.`,
        config: { responseMimeType: "application/json" }
    });
    try { return JSON.parse(text); } catch { return []; }
};

export const generateContentSeries = async (topic: string): Promise<any[]> => {
    const text = await callAI({
        endpoint: 'generateContent',
        model: 'gemini-1.5-flash-001',
        contents: `Topic: ${topic}. Plan 5 days content series. Output JSON array {day, type, content}.`,
        config: { responseMimeType: "application/json" }
    });
    try { return JSON.parse(text); } catch { return []; }
};

export const generateStory = async (facts: string, emotion: string): Promise<string> => {
    return await callAI({
        endpoint: 'generateContent',
        model: 'gemini-1.5-flash-001',
        contents: `Facts: ${facts}. Emotion: ${emotion}. Write a touching story.`,
        config: { temperature: 0.9 }
    });
};

export const generateClaimSupport = async (contract: Contract, customer: Customer): Promise<string> => {
    return await callAI({
        endpoint: 'generateContent',
        model: 'gemini-1.5-flash-001',
        contents: `Soạn tin hướng dẫn Claim HĐ ${contract.contractNumber} cho ${customer.fullName}`
    });
};

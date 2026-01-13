
import { httpsCallable } from "firebase/functions";
import { functions, isFirebaseReady } from "./firebaseConfig";
import { GoogleGenAI } from "@google/genai";
import { AppState, Customer, AgentProfile, Contract, ProductStatus, PlanResult, Product } from "../types";

// Initialize Client-side AI (Fallback)
const getApiKey = () => {
    const envKey = process.env.API_KEY;
    if (envKey) return envKey;
    return localStorage.getItem('gemini_api_key') || '';
};

const apiKey = getApiKey();
const clientAI = apiKey ? new GoogleGenAI({ apiKey }) : null;

let isServerAvailable = isFirebaseReady;

// --- CACHE MANAGEMENT ---
const CACHE_KEY_NAME = 'gemini_cache_name';
const CACHE_KEY_EXPIRY = 'gemini_cache_expiry';

interface CacheInfo {
    name: string;
    expiresAt: number; // timestamp
}

const getActiveCache = (): string | null => {
    const name = localStorage.getItem(CACHE_KEY_NAME);
    const expiryStr = localStorage.getItem(CACHE_KEY_EXPIRY);
    
    if (!name || !expiryStr) return null;
    
    const expiry = parseInt(expiryStr, 10);
    // Add a buffer of 2 minutes before actual expiry to be safe
    if (Date.now() > expiry - 120000) {
        console.log("⚠️ Cache expired or about to expire.");
        return null;
    }
    return name;
};

const createProductCache = async (products: Product[]): Promise<string | null> => {
    if (!isServerAvailable || !functions) return null;

    // Filter active products with PDFs
    // NO SLICE LIMIT: Send ALL active PDFs
    const pdfUrls = products
        .filter(p => p.status === ProductStatus.ACTIVE && p.pdfUrl)
        .map(p => p.pdfUrl as string);

    if (pdfUrls.length === 0) return null;

    try {
        console.log(`Creating cache for ${pdfUrls.length} documents...`);
        const gateway = httpsCallable(functions, 'geminiGateway', { timeout: 600000 }); // 10 min timeout for client
        
        const result: any = await gateway({
            endpoint: 'createCache',
            fileUrls: pdfUrls
        });

        if (result.data && result.data.cacheName) {
            const cacheName = result.data.cacheName;
            // Default TTL 55 mins from creation. We set expiry here.
            // result.data.expirationTime could be used if returned parsed, 
            // but safer to set local timestamp + 50 mins.
            const expiresAt = Date.now() + (50 * 60 * 1000); 
            
            localStorage.setItem(CACHE_KEY_NAME, cacheName);
            localStorage.setItem(CACHE_KEY_EXPIRY, expiresAt.toString());
            
            console.log(`✅ Cache created: ${cacheName}`);
            return cacheName;
        }
    } catch (e) {
        console.error("❌ Failed to create cache:", e);
    }
    return null;
};

// --- MAIN CALL FUNCTION ---
const callAI = async (payload: any): Promise<string> => {
    // 1. Try Cloud Function
    if (isServerAvailable && functions) {
        try {
            const gateway = httpsCallable(functions, 'geminiGateway', { timeout: 30000 }); // 30s for chat
            const result: any = await gateway(payload);
            return result.data.text || "";
        } catch (serverError: any) {
            console.warn("⚠️ Server Backend failed.", serverError);
            if (payload.cachedContent) {
                return "Lỗi: Không thể kết nối đến Cache Server. Vui lòng thử lại sau.";
            }
            isServerAvailable = false;
        }
    }

    // 2. Fallback to Client-side (Direct API) - Cannot use Cache here easily
    try {
        if (!clientAI) throw new Error("Missing API Key");
        
        // Remove cache params if falling back to client
        const { cachedContent, ...clientPayload } = payload;
        
        // Simple generation
        const modelId = clientPayload.model || 'gemini-3-flash-preview';
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
            return result.text;
        } else {
            const result = await clientAI.models.generateContent({
                model: modelId,
                contents: clientPayload.contents,
                config: config
            });
            return result.text;
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
    // Basic sanitization to ensure alternating roles if needed, 
    // but Gemini SDK is usually robust. 
    // Returning as-is for now but ensuring structure.
    return history.map(h => ({
        role: h.role,
        parts: h.parts || [{ text: h.text }]
    }));
};

export const chatWithData = async (
  query: string, 
  appState: AppState, 
  history: { role: 'user' | 'model'; text: string }[]
): Promise<string> => {
    
    // 1. Prepare JSON Context
    const jsonData = prepareJsonContext(appState);
    
    // 2. Manage Cache (The Core Change)
    let cacheName = getActiveCache();
    
    // If no cache, create it (Async but blocking for the first chat to ensure context)
    if (!cacheName) {
        // Inform user via console or UI state if possible (not handled here)
        console.log("⏳ Initializing Product Knowledge Base (Caching)... This may take a few seconds.");
        cacheName = await createProductCache(appState.products);
    }

    const systemInstructionText = `Bạn là TuanChom AI, Trợ lý Nghiệp vụ Prudential.
    
    DỮ LIỆU KHÁCH HÀNG (JSON):
    ${jsonData}
    
    ${cacheName ? '⚠️ LƯU Ý QUAN TRỌNG: Bạn đang được kết nối với KHO TÀI LIỆU SẢN PHẨM (Cached Context). Hãy trả lời dựa trên thông tin trong đó.' : 'Cảnh báo: Không tải được tài liệu sản phẩm. Chỉ trả lời dựa trên kiến thức chung.'}

    QUY TẮC:
    1. Trả lời chính xác dựa trên tài liệu đính kèm.
    2. Nếu tài liệu có thông tin chi tiết (ví dụ danh sách bệnh, điều khoản loại trừ), hãy trích dẫn.
    3. Không bịa đặt.
    `;

    // 3. Prepare History (Clean text only, no base64 payloads anymore)
    const cleanHistory = sanitizeHistory(history);

    // 4. Call AI
    return await callAI({
        endpoint: 'chat',
        // If cache exists, backend will switch to gemini-1.5-flash-001 automatically
        cachedContent: cacheName, 
        model: cacheName ? 'gemini-1.5-flash-001' : 'gemini-3-flash-preview', 
        message: query,
        history: cleanHistory,
        systemInstruction: systemInstructionText, 
        config: { temperature: 0.2 }
    });
};

// ... (Other functions like consultantChat, getObjectionSuggestions remain mostly the same, 
// using generic callAI which defaults to gemini-3-flash-preview for non-cached tasks)

export const consultantChat = async (
    query: string, customer: Customer, contracts: Contract[], familyContext: any[],
    agentProfile: AgentProfile | null, conversationGoal: string,
    history: { role: 'user' | 'model'; text: string }[],
    roleplayMode: 'consultant' | 'customer' = 'consultant',
    planResult: PlanResult | null = null,
    chatStyle: 'zalo' | 'formal' = 'formal'
): Promise<string> => {
    const fullProfile = `Khách: ${customer.fullName}, Tuổi: ${new Date().getFullYear() - new Date(customer.dob).getFullYear()}`;
    return await callAI({
        endpoint: 'chat',
        model: 'gemini-3-flash-preview',
        message: query,
        history: sanitizeHistory(history),
        systemInstruction: `Roleplay: ${roleplayMode}. Goal: ${conversationGoal}. Profile: ${fullProfile}. Style: ${chatStyle}`,
        config: { temperature: 0.7 }
    });
};

export const getObjectionSuggestions = async (msg: string, customer: Customer): Promise<any[]> => {
    const text = await callAI({
        endpoint: 'generateContent',
        model: 'gemini-3-flash-preview',
        contents: `Khách: "${msg}". Gợi ý 3 cách xử lý từ chối. Output JSON.`,
        config: { responseMimeType: "application/json" }
    });
    try { return JSON.parse(text); } catch { return []; }
};

export const generateSocialPost = async (topic: string, tone: string): Promise<any[]> => {
    const text = await callAI({
        endpoint: 'generateContent',
        model: 'gemini-3-flash-preview',
        contents: `Topic: ${topic}. Tone: ${tone}. Viết 3 status FB. Output JSON array {title, content}.`,
        config: { responseMimeType: "application/json" }
    });
    try { return JSON.parse(text); } catch { return []; }
};

export const generateContentSeries = async (topic: string): Promise<any[]> => {
    const text = await callAI({
        endpoint: 'generateContent',
        model: 'gemini-3-flash-preview',
        contents: `Topic: ${topic}. Plan 5 days content series. Output JSON array {day, type, content}.`,
        config: { responseMimeType: "application/json" }
    });
    try { return JSON.parse(text); } catch { return []; }
};

export const generateStory = async (facts: string, emotion: string): Promise<string> => {
    return await callAI({
        endpoint: 'generateContent',
        model: 'gemini-3-flash-preview',
        contents: `Facts: ${facts}. Emotion: ${emotion}. Write a touching story.`,
        config: { temperature: 0.9 }
    });
};

export const generateClaimSupport = async (contract: Contract, customer: Customer): Promise<string> => {
    return await callAI({
        endpoint: 'generateContent',
        model: 'gemini-3-flash-preview',
        contents: `Soạn tin hướng dẫn Claim HĐ ${contract.contractNumber} cho ${customer.fullName}`
    });
};


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

// MODEL CONFIG
const DEFAULT_MODEL = 'gemini-3-flash-preview'; 

// --- HELPER TO EXTRACT PDF TEXT ---
// Called from Product Page when uploading PDF
export const extractPdfText = async (url: string): Promise<string> => {
    if (!isServerAvailable || !functions) return "";
    try {
        const gateway = httpsCallable(functions as Functions, 'geminiGateway', { timeout: 300000 }); 
        const result: any = await gateway({
            endpoint: 'extractText',
            url: url
        });
        return result.data.text || "";
    } catch (e) {
        console.error("Failed to extract PDF text:", e);
        return "";
    }
};

// --- MAIN CALL FUNCTION ---
const callAI = async (payload: any): Promise<string> => {
    // 1. Ưu tiên dùng Cloud Function (Server-side)
    if (isServerAvailable && functions) {
        try {
            const gateway = httpsCallable(functions as Functions, 'geminiGateway', { timeout: 300000 }); 
            const result: any = await gateway(payload);
            return (result.data.text as string) || "";
        } catch (serverError: any) {
            console.warn("⚠️ Server Backend failed or returned error.", serverError);
            isServerAvailable = false; // Temporarily disable server if it fails
        }
    }

    // 2. Fallback xuống Client-side (Direct API)
    try {
        if (!clientAI) throw new Error("Missing API Key");
        
        const { cachedContent, ...clientPayload } = payload;
        
        const modelId = (clientPayload.model as string) || DEFAULT_MODEL; 
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
        // Fallback error message usually means model not found or key invalid
        if (clientError.message.includes("404")) {
             return "Lỗi cấu hình AI (404): Model không tồn tại hoặc API Key không hợp lệ.";
        }
        return `Lỗi AI: ${clientError.message}`;
    }
};

// --- HELPER FUNCTIONS ---
export const generateFinancialAdvice = async (customerName: string, planResult: PlanResult): Promise<string> => {
    const prompt = `Bạn là Chuyên gia Tài chính Prudential. Nhận xét ngắn về KH ${customerName}. Mục tiêu: ${planResult.goal}. Gap: ${planResult.shortfall.toLocaleString()}đ. Lời khuyên 3 câu.`;
    return await callAI({ endpoint: 'generateContent', model: DEFAULT_MODEL, contents: prompt });
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

// --- CHAT WITH DATA (RAG Approach) ---
export const chatWithData = async (
  query: string, 
  appState: AppState, 
  history: { role: 'user' | 'model'; text: string }[]
): Promise<string> => {
    
    // 1. Collect Knowledge Base from Extracted Text
    const activeProducts = appState.products.filter(p => p.status === ProductStatus.ACTIVE);
    let knowledgeBase = "";
    
    activeProducts.forEach(p => {
        if (p.extractedContent) {
            knowledgeBase += `\n--- TÀI LIỆU SẢN PHẨM: ${p.name} ---\n${p.extractedContent}\n`;
        }
    });

    if (!knowledgeBase) {
        knowledgeBase = "Hiện chưa có tài liệu sản phẩm nào được tải lên hệ thống. Hãy trả lời dựa trên kiến thức chung về bảo hiểm Prudential.";
    }

    const jsonData = prepareJsonContext(appState);

    // Prompt RAG
    const systemInstructionText = `Bạn là TuanChom AI, Trợ lý Nghiệp vụ Bảo hiểm Prudential.
    
    NGUỒN DỮ LIỆU (KNOWLEDGE BASE):
    Dưới đây là nội dung chi tiết từ các tài liệu sản phẩm đã được trích xuất. BẠN PHẢI ƯU TIÊN SỬ DỤNG THÔNG TIN NÀY ĐỂ TRẢ LỜI.
    
    ${knowledgeBase}
    
    QUY TẮC TUYỆT ĐỐI:
    1. Khi được hỏi về "Quyền lợi", "Chi trả", "Hạn mức", "Số tiền giường", "Phẫu thuật"... BẠN PHẢI TRA CỨU TRONG NGUỒN DỮ LIỆU TRÊN.
    2. Trích dẫn số liệu cụ thể nếu tìm thấy.
    3. Nếu không tìm thấy thông tin trong dữ liệu, hãy nói rõ: "Tôi không tìm thấy thông tin này trong tài liệu sản phẩm hiện có."
    4. Trả lời ngắn gọn, chuyên nghiệp.

    Dữ liệu tóm tắt trên ứng dụng (tham khảo thêm):
    ${jsonData}
    `;

    const cleanHistory = sanitizeHistory(history);

    try {
        return await callAI({
            endpoint: 'chat',
            model: DEFAULT_MODEL, 
            message: query,
            history: cleanHistory,
            systemInstruction: systemInstructionText, 
            config: { temperature: 0.1 } 
        });

    } catch (error: any) {
        return "Xin lỗi, hệ thống đang gặp sự cố kết nối. Vui lòng thử lại sau.";
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
    
    // --- BUILD CONTEXT STRINGS ---
    
    // 1. Agent Profile Context (Fix for Generic Greeting)
    let agentContext = "Tên bạn: Tư vấn viên Prudential.";
    if (agentProfile) {
        agentContext = `
        THÔNG TIN CỦA BẠN (TƯ VẤN VIÊN):
        - Họ tên: ${agentProfile.fullName} (Hãy dùng tên này để xưng hô/giới thiệu)
        - Danh hiệu: ${agentProfile.title}
        - Đơn vị/Văn phòng: ${agentProfile.office || "Prudential Vietnam"}
        `;
    }

    // 2. Customer Context
    const customerContext = `
    THÔNG TIN KHÁCH HÀNG:
    - Họ tên: ${customer.fullName}
    - Tuổi: ${new Date().getFullYear() - new Date(customer.dob).getFullYear()}
    - Nghề nghiệp: ${customer.job}
    - Tình trạng: ${customer.status}
    - Mối quan tâm: ${customer.analysis?.keyConcerns || 'Chưa rõ'}
    - Tính cách (DISC): ${customer.analysis?.personality || 'Chưa rõ'}
    `;

    // 3. Family & Contracts Context
    const contractInfo = contracts.length > 0 
        ? contracts.map(c => `- HĐ ${c.contractNumber}: ${c.mainProduct.productName} (${c.status})`).join('\n') 
        : "Chưa có hợp đồng nào.";
    
    const familyInfo = familyContext.length > 0
        ? familyContext.map(f => `- ${f.relationship}: ${f.name} (${f.age} tuổi)`).join('\n')
        : "Chưa có thông tin gia đình.";

    // 4. Financial Plan Context (If available)
    let planContext = "";
    if (planResult) {
        planContext = `
        KẾT QUẢ HOẠCH ĐỊNH TÀI CHÍNH VỪA THỰC HIỆN:
        - Mục tiêu: ${planResult.goal}
        - Cần có: ${planResult.requiredAmount.toLocaleString()}đ
        - Đã có: ${planResult.currentAmount.toLocaleString()}đ
        - Thiếu hụt (Gap): ${planResult.shortfall.toLocaleString()}đ
        -> Hãy dùng con số thiếu hụt này để khơi gợi nhu cầu.
        `;
    }

    // --- SYSTEM PROMPT CONSTRUCTION ---
    const systemInstruction = `
    BỐI CẢNH ROLEPLAY:
    Bạn đang tham gia một buổi mô phỏng tư vấn bảo hiểm (Roleplay).
    
    VAI TRÒ CỦA BẠN: ${roleplayMode === 'consultant' ? 'TƯ VẤN VIÊN (Người bán)' : 'KHÁCH HÀNG (Người mua)'}.
    
    ${roleplayMode === 'consultant' ? agentContext : ''}
    
    ${customerContext}
    
    THÔNG TIN BỔ SUNG:
    - Hợp đồng hiện tại:
    ${contractInfo}
    - Gia đình:
    ${familyInfo}
    ${planContext}
    
    MỤC TIÊU CUỘC HỘI THOẠI:
    ${conversationGoal}
    
    PHONG CÁCH GIAO TIẾP:
    ${chatStyle === 'zalo' ? '- Thân mật, ngắn gọn, dùng icon/emoji (Phong cách chat Zalo/Messenger).' : '- Chuyên nghiệp, lịch sự, ân cần, câu từ chỉnh chu.'}
    
    HƯỚNG DẪN HÀNH ĐỘNG:
    ${roleplayMode === 'consultant' 
        ? `1. Hãy đóng vai Tư vấn viên ${agentProfile?.fullName || 'Prudential'}.
           2. Khi bắt đầu hoặc chào hỏi, BẮT BUỘC dùng tên thật của bạn (${agentProfile?.fullName}) và đơn vị (${agentProfile?.office}). TUYỆT ĐỐI KHÔNG dùng placeholder như [Tên của bạn].
           3. Dẫn dắt câu chuyện theo mục tiêu đề ra.` 
        : `1. Hãy đóng vai Khách hàng ${customer.fullName}.
           2. Phản ứng dựa trên tính cách: ${customer.analysis?.personality}.
           3. Đưa ra lời từ chối hoặc thắc mắc phù hợp với hoàn cảnh.`}
    `;

    const cleanHistory = sanitizeHistory(history);

    try {
        return await callAI({
            endpoint: 'chat',
            model: DEFAULT_MODEL,
            message: query,
            history: cleanHistory,
            systemInstruction: systemInstruction,
            config: { temperature: 0.7 }
        });
    } catch (e) {
        return "Lỗi kết nối AI.";
    }
};

export const getObjectionSuggestions = async (msg: string, customer: Customer): Promise<any[]> => {
    const text = await callAI({
        endpoint: 'generateContent',
        model: DEFAULT_MODEL,
        contents: `Khách: "${msg}". Gợi ý 3 cách xử lý từ chối. Output JSON.`,
        config: { responseMimeType: "application/json" }
    });
    try { return JSON.parse(text); } catch { return []; }
};

export const generateSocialPost = async (topic: string, tone: string): Promise<any[]> => {
    const text = await callAI({
        endpoint: 'generateContent',
        model: DEFAULT_MODEL,
        contents: `Topic: ${topic}. Tone: ${tone}. Viết 3 status FB. Output JSON array {title, content}.`,
        config: { responseMimeType: "application/json" }
    });
    try { return JSON.parse(text); } catch { return []; }
};

export const generateContentSeries = async (topic: string): Promise<any[]> => {
    const text = await callAI({
        endpoint: 'generateContent',
        model: DEFAULT_MODEL,
        contents: `Topic: ${topic}. Plan 5 days content series. Output JSON array {day, type, content}.`,
        config: { responseMimeType: "application/json" }
    });
    try { return JSON.parse(text); } catch { return []; }
};

export const generateStory = async (facts: string, emotion: string): Promise<string> => {
    return await callAI({
        endpoint: 'generateContent',
        model: DEFAULT_MODEL,
        contents: `Facts: ${facts}. Emotion: ${emotion}. Write a touching story.`,
        config: { temperature: 0.9 }
    });
};

export const generateClaimSupport = async (contract: Contract, customer: Customer): Promise<string> => {
    return await callAI({
        endpoint: 'generateContent',
        model: DEFAULT_MODEL,
        contents: `Soạn tin hướng dẫn Claim HĐ ${contract.contractNumber} cho ${customer.fullName}`
    });
};

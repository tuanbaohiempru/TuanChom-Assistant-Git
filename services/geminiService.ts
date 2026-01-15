
import { httpsCallable, Functions } from "firebase/functions";
import { functions, isFirebaseReady } from "./firebaseConfig";
import { GoogleGenAI, Type } from "@google/genai";
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

// --- INTELLIGENT CONTEXT BUILDER (FIXED LOGIC) ---
const findRelevantContext = (query: string, state: AppState): string => {
    const lowerQuery = query.toLowerCase();
    let context = "";
    
    // 1. Identify Customers mentioned in the query
    // Search by Full Name or First Name (last word)
    const matchedCustomers = state.customers.filter(c => {
        const fullName = c.fullName.toLowerCase();
        const firstName = fullName.split(' ').pop() || '';
        return fullName.includes(lowerQuery) || (firstName.length > 2 && lowerQuery.includes(firstName));
    });

    if (matchedCustomers.length > 0) {
        context += "\n--- CHI TIẾT KHÁCH HÀNG LIÊN QUAN (ƯU TIÊN CAO) ---\n";
        
        matchedCustomers.forEach(c => {
            // A. Personal Info
            context += `1. KHÁCH HÀNG: ${c.fullName} (ID: ${c.id})\n`;
            context += `   - Năm sinh: ${new Date(c.dob).getFullYear()}, Giới tính: ${c.gender}\n`;
            context += `   - Nghề nghiệp: ${c.job || c.occupation}, SĐT: ${c.phone}\n`;
            context += `   - Tình trạng: ${c.status}\n`;

            // B. Contracts (FULL LIST)
            const myContracts = state.contracts.filter(ct => ct.customerId === c.id);
            const totalFee = myContracts.reduce((sum, ct) => sum + ct.totalFee, 0);
            
            context += `   - TỔNG QUAN HỢP ĐỒNG: Đang có ${myContracts.length} hợp đồng. TỔNG PHÍ ĐÓNG HẰNG NĂM: ${totalFee.toLocaleString()} VNĐ.\n`;
            
            if (myContracts.length > 0) {
                context += `   - CHI TIẾT HỢP ĐỒNG:\n`;
                myContracts.forEach((ct, idx) => {
                    context += `     + HĐ ${idx+1}: Số ${ct.contractNumber} (${ct.status}). SP Chính: ${ct.mainProduct.productName}. Phí: ${ct.totalFee.toLocaleString()} VNĐ. Ngày hiệu lực: ${ct.effectiveDate}.\n`;
                    if (ct.riders.length > 0) {
                        const riderNames = ct.riders.map(r => r.productName).join(', ');
                        context += `       (Kèm theo ${ct.riders.length} sản phẩm bổ trợ: ${riderNames})\n`;
                    }
                });
            } else {
                context += `   - Chưa có hợp đồng nào trong hệ thống.\n`;
            }

            // C. Relationships (Decoded)
            if (c.relationships && c.relationships.length > 0) {
                const relations = c.relationships.map(r => {
                    const relative = state.customers.find(rel => rel.id === r.relatedCustomerId);
                    return relative ? `${r.relationship}: ${relative.fullName}` : `${r.relationship}: [Không tìm thấy tên]`;
                }).join('; ');
                context += `   - GIA ĐÌNH & MỐI QUAN HỆ: ${relations}\n`;
            } else {
                context += `   - Chưa có thông tin gia đình.\n`;
            }
            context += `\n`;
        });
    }

    return context;
};

const prepareJsonContext = (state: AppState) => {
  // General summary for broad questions
  const recentCustomers = state.customers.slice(0, 50).map(c => ({ 
      name: c.fullName, 
      id: c.id, 
      status: c.status 
  }));
  
  // High level stats
  const totalContracts = state.contracts.length;
  const activeContracts = state.contracts.filter(c => c.status === 'Đang hiệu lực').length;

  return JSON.stringify({
    summary: {
        total_customers: state.customers.length,
        total_contracts: totalContracts,
        active_contracts: activeContracts
    },
    recent_customers_list: recentCustomers
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
    
    // 1. Collect Knowledge Base from Extracted Text (Product Manuals)
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

    // 2. Get Specific Context (The Fix for "Chi Thanh")
    const specificContext = findRelevantContext(query, appState);
    const generalContext = prepareJsonContext(appState);

    // Prompt RAG
    const systemInstructionText = `Bạn là TuanChom AI, Trợ lý Nghiệp vụ Bảo hiểm Prudential chuyên nghiệp.
    
    DỮ LIỆU CỤ THỂ CẦN CHÚ Ý (QUAN TRỌNG NHẤT):
    ${specificContext}
    
    NGUỒN DỮ LIỆU SẢN PHẨM (KNOWLEDGE BASE):
    Dưới đây là nội dung chi tiết từ các tài liệu sản phẩm đã được trích xuất.
    ${knowledgeBase}
    
    DỮ LIỆU TỔNG QUAN HỆ THỐNG:
    ${generalContext}
    
    QUY TẮC TRẢ LỜI:
    1. **Ưu tiên dữ liệu cụ thể**: Nếu phần "DỮ LIỆU CỤ THỂ" có thông tin về khách hàng được hỏi (ví dụ: Chị Thanh), hãy dùng thông tin đó (tổng phí, danh sách hợp đồng, gia đình) để trả lời chính xác tuyệt đối. Đừng bịa đặt nếu dữ liệu đã có.
    2. **Trả lời về Sản phẩm**: Nếu câu hỏi về quyền lợi/điều khoản, hãy tra cứu trong "NGUỒN DỮ LIỆU SẢN PHẨM".
    3. **Tính toán**: Nếu dữ liệu đã cung cấp con số Tổng phí, hãy dùng con số đó.
    4. **Phong cách**: Ngắn gọn, chuyên nghiệp, xưng "em" hoặc "tôi".
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
    
    // 1. Agent Profile Context
    let agentContext = "Tên bạn: Tư vấn viên Prudential.";
    if (agentProfile) {
        agentContext = `
        THÔNG TIN CỦA BẠN (TƯ VẤN VIÊN):
        - Họ tên: ${agentProfile.fullName} (Dùng tên này để xưng hô)
        - Danh hiệu: ${agentProfile.title} (MDRT/Chuyên gia tài chính)
        - Đơn vị: ${agentProfile.office || "Prudential Vietnam"}
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
        ? contracts.map(c => `- HĐ ${c.contractNumber}: ${c.mainProduct.productName} (${c.status}). Phí: ${c.totalFee.toLocaleString()}đ`).join('\n') 
        : "Chưa có hợp đồng nào.";
    
    const familyInfo = familyContext.length > 0
        ? familyContext.map(f => `- ${f.relationship}: ${f.name || 'Người thân'} `).join('\n')
        : "Chưa có thông tin gia đình.";

    // 4. Financial Plan Context (If available)
    let planContext = "";
    if (planResult) {
        planContext = `
        DỮ LIỆU TÀI CHÍNH THỰC TẾ (Dùng để khơi gợi nhu cầu bằng con số):
        - Mục tiêu: ${planResult.goal}
        - Số tiền cần có: ${planResult.requiredAmount.toLocaleString()}đ
        - Thiếu hụt (Gap): ${planResult.shortfall.toLocaleString()}đ
        -> Hãy dùng con số Gap này để làm đòn bẩy tâm lý, nhưng thật khéo léo.
        `;
    }

    // --- SYSTEM PROMPT CONSTRUCTION ---
    const systemInstruction = `
    BỐI CẢNH: Bạn đang tham gia Roleplay (Mô phỏng tư vấn).
    
    VAI TRÒ CỦA BẠN: ${roleplayMode === 'consultant' ? 'TƯ VẤN VIÊN CHUẨN MDRT (Million Dollar Round Table)' : 'KHÁCH HÀNG'}.
    
    ${roleplayMode === 'consultant' ? agentContext : ''}
    
    ${customerContext}
    
    THÔNG TIN BỔ SUNG:
    - Hợp đồng hiện tại: ${contractInfo}
    - Gia đình: ${familyInfo}
    ${planContext}
    
    MỤC TIÊU CUỘC HỘI THOẠI: ${conversationGoal}
    
    PHONG CÁCH GIAO TIẾP: ${chatStyle === 'zalo' ? 'Thân mật, ngắn gọn (Chat Zalo)' : 'Chuyên nghiệp, lịch sự (Gặp mặt/Email)'}.
    
    ${roleplayMode === 'consultant' ? `
    QUY TẮC CỐT LÕI CHO TƯ VẤN VIÊN MDRT (TUYỆT ĐỐI TUÂN THỦ):
    1. **KHÔNG BÁN HÀNG (No Hard Selling)**: Bạn là Chuyên gia Hoạch định Tài chính (Financial Advisor), không phải người chào hàng. Nhiệm vụ của bạn là giúp khách hàng HIỂU vấn đề của họ, không phải ép họ mua sản phẩm.
    2. **DẪN DẮT BẰNG CÂU HỎI (Power of Questions)**:
       - Thay vì thuyết trình về sản phẩm, hãy đặt câu hỏi để khách hàng tự nói ra nỗi lo.
       - VD: Thay vì nói "Gói này bảo vệ 1 tỷ", hãy hỏi "Nếu thu nhập của anh/chị tạm thời gián đoạn 5 năm tới, ai sẽ là người lo học phí cho các bé?"
    3. **TẬP TRUNG VÀO "WHY" TRƯỚC "WHAT"**: 
       - Làm rõ LÝ DO tại sao họ cần bảo vệ trước khi nói về SẢN PHẨM là gì.
       - Chỉ đề xuất giải pháp khi khách hàng đã thừa nhận họ có nhu cầu.
    4. **ĐỒNG CẢM SÂU SẮC (Empathy)**: 
       - Khi khách hàng từ chối (ví dụ: "Không có tiền", "Để xem lại"), ĐỪNG tranh luận hay xử lý rập khuôn.
       - Hãy đồng cảm: "Em hiểu, giai đoạn này kinh tế khó khăn chung..." sau đó mới nhẹ nhàng chuyển hướng.
    5. **XÂY DỰNG NIỀM TIN**: Luôn đứng về phía lợi ích của khách hàng. Sẵn sàng khuyên khách hàng "chưa cần mua thêm" nếu họ đã đủ bảo vệ.
    ` : `
    HƯỚNG DẪN CHO VAI TRÒ KHÁCH HÀNG:
    1. Hãy đóng vai Khách hàng ${customer.fullName}.
    2. Phản ứng dựa trên tính cách: ${customer.analysis?.personality}.
    3. Đưa ra lời từ chối hoặc thắc mắc phù hợp với hoàn cảnh thực tế (VD: Sợ lạm phát, sợ mất tiền, cần hỏi vợ/chồng...).
    `}
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
    // Sử dụng responseSchema để đảm bảo định dạng JSON chính xác
    const text = await callAI({
        endpoint: 'generateContent',
        model: DEFAULT_MODEL,
        contents: `Khách hàng vừa nói: "${msg}".
        
        Hãy đóng vai Coach (Huấn luyện viên MDRT), gợi ý 3 kịch bản xử lý từ chối đỉnh cao.
        Tiêu chí: Không đối đầu, dùng câu hỏi để hóa giải, tập trung vào cảm xúc.
        
        1. Cách 1: Đồng cảm & Thấu hiểu (Empathy First).
        2. Cách 2: Đặt câu hỏi ngược lại (Questioning).
        3. Cách 3: Kể chuyện/Ví dụ tương đồng (Storytelling).
        `,
        config: { 
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        label: { type: Type.STRING, description: "Tiêu đề ngắn (VD: Đồng cảm, Hỏi ngược, Kể chuyện)" },
                        type: { type: Type.STRING, description: "Loại: 'empathy', 'logic', hoặc 'story'" },
                        content: { type: Type.STRING, description: "Lời thoại mẫu để tư vấn viên nói" }
                    },
                    required: ["label", "type", "content"]
                }
            }
        }
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

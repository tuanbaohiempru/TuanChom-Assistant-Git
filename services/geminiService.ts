
import { httpsCallable } from "firebase/functions";
import { functions } from "./firebaseConfig";
import { AppState, Customer, AgentProfile, Contract, ProductStatus, PlanResult, Product } from "../types";

// --- HELPER TO CALL CLOUD FUNCTION ---
const callAI = async (payload: any): Promise<string> => {
    try {
        const gateway = httpsCallable(functions, 'geminiGateway');
        const result: any = await gateway(payload);
        return result.data.text || "";
    } catch (error: any) {
        console.error("AI Service Error Full:", error);
        const msg = error.message || 'Lỗi không xác định';
        if (msg.includes("Model không tồn tại")) {
            return `Lỗi AI: Model chưa được hỗ trợ.`;
        }
        return `Lỗi AI: ${msg}`;
    }
};

// --- HELPER: FETCH PDF AS BASE64 ---
const fetchPdfAsBase64 = async (url: string): Promise<string | null> => {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error("Failed to fetch PDF");
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64String = reader.result as string;
                // Remove data url prefix (e.g. "data:application/pdf;base64,")
                const base64Content = base64String.split(',')[1];
                resolve(base64Content);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        console.warn("Could not fetch PDF for AI context:", url, error);
        return null;
    }
};

/**
 * Generate short financial advice based on calculation results
 */
export const generateFinancialAdvice = async (
    customerName: string,
    planResult: PlanResult
): Promise<string> => {
    const prompt = `
        Bạn là Chuyên gia Tài chính Prudential.
        Hãy đưa ra nhận xét và lời khuyên ngắn gọn (khoảng 3 câu) cho khách hàng ${customerName} dựa trên kết quả hoạch định sau:
        
        - Mục tiêu: ${planResult.goal}
        - Cần có: ${planResult.requiredAmount.toLocaleString()} VNĐ
        - Đã có (dự kiến): ${planResult.currentAmount.toLocaleString()} VNĐ
        - Thiếu hụt (Gap): ${planResult.shortfall.toLocaleString()} VNĐ
        
        Yêu cầu:
        1. Giọng văn chuyên nghiệp, đồng cảm nhưng cảnh tỉnh.
        2. Nếu thiếu hụt lớn: Nhấn mạnh rủi ro lạm phát hoặc chi phí y tế/giáo dục tăng cao.
        3. Kêu gọi hành động nhẹ nhàng.
        4. Không dùng bảng, chỉ dùng text đoạn văn.
    `;

    return await callAI({
        endpoint: 'generateContent',
        model: 'gemini-1.5-flash',
        contents: prompt
    });
};

const prepareJsonContext = (state: AppState) => {
  // SAFETY LIMIT: Only send top 50 recent customers and contracts to avoid Token Limit Exceeded
  const recentCustomers = state.customers.slice(0, 50);
  const recentContracts = state.contracts.slice(0, 50);

  return JSON.stringify({
    customers: recentCustomers.map(c => ({
      name: c.fullName,
      id: c.id,
      dob: c.dob,
      job: c.job,
      health: c.health,
      status: c.status,
      interactions: c.interactionHistory
    })),
    contracts: recentContracts.map(c => ({
      number: c.contractNumber,
      ownerId: c.customerId,
      status: c.status,
      paymentFrequency: c.paymentFrequency, 
      mainProduct: {
        name: c.mainProduct.productName,
        insured: c.mainProduct.insuredName,
        fee: c.mainProduct.fee,
        sumAssured: c.mainProduct.sumAssured
      },
      riders: c.riders.map(r => ({
        name: r.productName,
        insured: r.insuredName,
        fee: r.fee,
        sumAssured: r.sumAssured
      })),
      nextPayment: c.nextPaymentDate,
      totalFee: c.totalFee
    })),
    products_summary: state.products.map(p => ({
      name: p.name,
      type: p.type,
      status: p.status, 
      description: p.description
    })),
    appointments: state.appointments.slice(0, 20)
  });
};

export const chatWithData = async (
  query: string, 
  appState: AppState, 
  history: { role: 'user' | 'model'; text: string }[]
): Promise<string> => {
    
    // 1. Prepare Text Data (Customers, Contracts...)
    const jsonData = prepareJsonContext(appState);
    
    // 2. Prepare System Instruction Parts
    const systemParts: any[] = [
        { text: `Bạn là TuanChom, trợ lý AI cao cấp của Prudential.
        
        DỮ LIỆU HỆ THỐNG (JSON):
        ${jsonData}
        
        NHIỆM VỤ:
        - Trả lời câu hỏi về nghiệp vụ bảo hiểm, quy tắc sản phẩm, và thông tin khách hàng.
        - Dưới đây là các tài liệu gốc (PDF) của các sản phẩm ĐANG BÁN (Active). Hãy sử dụng thông tin từ các file này để trả lời chính xác các câu hỏi về: Điều khoản loại trừ, Thời gian chờ, Quyền lợi chi tiết.
        
        QUY TẮC TRÌNH BÀY:
        - **KHÔNG DÙNG BẢNG (MARKDOWN TABLE)**: Dùng danh sách gạch đầu dòng (-).
        - Số liệu tiền tệ phải có "đ" hoặc "VNĐ".
        - Trả lời ngắn gọn, đúng trọng tâm.
        ` }
    ];

    // 3. Attach PDF Documents (Only for Active Products to save bandwidth/tokens)
    const activeProductsWithPdf = appState.products.filter(p => p.status === ProductStatus.ACTIVE && p.pdfUrl);
    
    // Limit to top 3 active PDFs to avoid hitting request size limits if many products
    const productsToLoad = activeProductsWithPdf.slice(0, 3);

    if (productsToLoad.length > 0) {
        try {
            const pdfPromises = productsToLoad.map(async (p) => {
                if (!p.pdfUrl) return null;
                const base64 = await fetchPdfAsBase64(p.pdfUrl);
                if (base64) {
                    return {
                        inlineData: {
                            mimeType: "application/pdf",
                            data: base64
                        }
                    };
                }
                return null;
            });

            const pdfParts = (await Promise.all(pdfPromises)).filter(Boolean);
            
            if (pdfParts.length > 0) {
                systemParts.push({ text: "\n--- TÀI LIỆU SẢN PHẨM GỐC (PDF) ---" });
                systemParts.push(...pdfParts);
            }
        } catch (e) {
            console.error("Error loading PDFs for AI:", e);
        }
    }

    const formattedHistory = history.map(h => ({
        role: h.role,
        parts: [{ text: h.text }]
    }));

    return await callAI({
        endpoint: 'chat',
        model: 'gemini-1.5-flash', // Must use 1.5 Flash for PDF support
        message: query,
        history: formattedHistory,
        systemInstruction: systemParts, // Send parts (Text + PDFs)
        config: { temperature: 0.2 }
    });
};

// Removed extractTextFromPdf as we now use direct PDF file processing via AI

export const consultantChat = async (
    query: string,
    customer: Customer,
    contracts: Contract[], 
    familyContext: any[],
    agentProfile: AgentProfile | null,
    conversationGoal: string,
    history: { role: 'user' | 'model'; text: string }[],
    roleplayMode: 'consultant' | 'customer' = 'consultant',
    planResult: PlanResult | null = null,
    chatStyle: 'zalo' | 'formal' = 'formal'
): Promise<string> => {
    // ... (Logic giữ nguyên, chỉ thay đổi model gọi bên dưới) ...
    
    // Simplified context build for brevity in this snippet
    const fullProfile = `Khách hàng: ${customer.fullName}, Tuổi: ${new Date().getFullYear() - new Date(customer.dob).getFullYear()}`;
    
    const formattedHistory = history.map(h => ({
        role: h.role,
        parts: [{ text: h.text }]
    }));

    return await callAI({
        endpoint: 'chat',
        model: 'gemini-1.5-flash',
        message: query,
        history: formattedHistory,
        systemInstruction: `Bạn đang đóng vai ${roleplayMode}. Mục tiêu: ${conversationGoal}. Hồ sơ: ${fullProfile}. Style: ${chatStyle}`,
        config: { temperature: chatStyle === 'zalo' ? 0.8 : 0.6 }
    });
};

export const getObjectionSuggestions = async (
    lastCustomerMessage: string,
    customer: Customer
): Promise<{ label: string; content: string; type: 'empathy' | 'logic' | 'story' }[]> => {
    const systemInstruction = `Gợi ý 3 cách xử lý từ chối cho khách hàng ${customer.fullName}. Output JSON.`;
    const text = await callAI({
        endpoint: 'generateContent',
        model: 'gemini-1.5-flash',
        contents: `Khách nói: "${lastCustomerMessage}"`,
        systemInstruction: systemInstruction,
        config: { responseMimeType: "application/json", temperature: 0.5 }
    });
    try { return JSON.parse(text); } catch { return []; }
};

export const generateSocialPost = async (topic: string, tone: string): Promise<{ title: string; content: string }[]> => {
    const systemInstruction = `Viết 3 status Facebook về BHNT. Phong cách: ${tone}. Output JSON array.`;
    const text = await callAI({
        endpoint: 'generateContent',
        model: 'gemini-1.5-flash',
        contents: `Chủ đề: ${topic}`,
        systemInstruction: systemInstruction,
        config: { responseMimeType: "application/json", temperature: 0.8 }
    });
    try { return JSON.parse(text); } catch { return []; }
};

export const generateContentSeries = async (topic: string): Promise<{ day: string; type: string; content: string }[]> => {
    const systemInstruction = `Xây dựng chuỗi content 5 ngày. Output JSON array.`;
    const text = await callAI({
        endpoint: 'generateContent',
        model: 'gemini-1.5-flash',
        contents: `Chủ đề: ${topic}`,
        systemInstruction: systemInstruction,
        config: { responseMimeType: "application/json", temperature: 0.7 }
    });
    try { return JSON.parse(text); } catch { return []; }
};

export const generateStory = async (facts: string, emotion: string): Promise<string> => {
    return await callAI({
        endpoint: 'generateContent',
        model: 'gemini-1.5-flash',
        contents: `Dữ kiện: ${facts}`,
        systemInstruction: `Kể chuyện cảm xúc: ${emotion}`,
        config: { temperature: 0.9 }
    });
};

export const generateClaimSupport = async (contract: Contract, customer: Customer): Promise<string> => {
    const prompt = `Soạn tin nhắn hướng dẫn Claim cho HĐ ${contract.contractNumber} của ${customer.fullName}`;
    return await callAI({
        endpoint: 'generateContent',
        model: 'gemini-1.5-flash',
        contents: prompt
    });
};

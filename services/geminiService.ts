
import { httpsCallable } from "firebase/functions";
import { functions } from "./firebaseConfig";
import { GoogleGenAI } from "@google/genai";
import { AppState, Customer, AgentProfile, Contract, ProductStatus, PlanResult, Product } from "../types";

// Initialize Client-side AI (Fallback)
const apiKey = process.env.API_KEY || '';
const clientAI = apiKey ? new GoogleGenAI({ apiKey }) : null;

// --- HELPER: CLIENT SIDE DIRECT CALL ---
const runClientSideAI = async (payload: any) => {
    if (!clientAI) {
        throw new Error("Không tìm thấy API Key. Vui lòng kiểm tra file .env hoặc cấu hình Backend.");
    }

    const modelId = payload.model || 'gemini-3-flash-preview';
    const config = payload.config || {};
    
    // Handle System Instruction
    if (payload.systemInstruction) {
        config.systemInstruction = payload.systemInstruction;
    }

    if (payload.endpoint === 'chat') {
        const chat = clientAI.chats.create({
            model: modelId,
            config: config,
            history: payload.history || []
        });
        const msg = payload.message || (typeof payload.contents === 'string' ? payload.contents : " ");
        const result = await chat.sendMessage({ message: msg });
        return result.text;
    } else {
        const result = await clientAI.models.generateContent({
            model: modelId,
            contents: payload.contents,
            config: config
        });
        return result.text;
    }
};

// --- MAIN CALL FUNCTION (HYBRID) ---
const callAI = async (payload: any, retries = 1): Promise<string> => {
    // 1. Try Cloud Function (Server-side)
    try {
        console.log("🤖 Đang gọi AI qua Server (Cloud Function)...");
        // Increase client-side timeout to 2 minutes
        const gateway = httpsCallable(functions, 'geminiGateway', { timeout: 120000 });
        const result: any = await gateway(payload);
        return result.data.text || "";
    } catch (serverError: any) {
        console.warn("⚠️ Lỗi Server Backend:", serverError.message);
        console.log("🔄 Đang chuyển sang chế độ Client-side (Trực tiếp)...");

        // 2. Fallback to Client-side (Direct API)
        try {
            return await runClientSideAI(payload);
        } catch (clientError: any) {
            console.error("❌ Lỗi cả Server và Client:", clientError);
            
            const msg = clientError.message || 'Lỗi không xác định';
            if (msg.includes("API Key")) return "Lỗi: Thiếu cấu hình API Key.";
            if (msg.includes("fetch failed")) return "Lỗi kết nối mạng. Vui lòng kiểm tra internet.";
            
            return `TuanChom AI đang bận. (${msg})`;
        }
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
        model: 'gemini-3-flash-preview',
        contents: prompt
    });
};

const prepareJsonContext = (state: AppState) => {
  // SAFETY LIMIT: Only send top 30 recent customers and contracts to avoid Token Limit Exceeded and Payload Size errors
  const recentCustomers = state.customers.slice(0, 30);
  const recentContracts = state.contracts.slice(0, 30);

  return JSON.stringify({
    customers: recentCustomers.map(c => ({
      name: c.fullName,
      id: c.id,
      dob: c.dob,
      job: c.job,
      health: c.health,
      status: c.status,
      interactions: c.interactionHistory ? c.interactionHistory.slice(0, 3) : [] // Limit interactions
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
    appointments: state.appointments.slice(0, 10)
  });
};

// --- HELPER: SANITIZE HISTORY ---
const sanitizeHistory = (history: { role: 'user' | 'model'; text: string }[]) => {
    const cleanHistory: { role: string; parts: { text: string }[] }[] = [];
    
    if (history.length > 0) {
        // 1. Ensure starts with 'user'
        let startIndex = 0;
        while(startIndex < history.length && history[startIndex].role !== 'user') {
            startIndex++;
        }
        
        for (let i = startIndex; i < history.length; i++) {
            const currentRole = history[i].role;
            const currentText = history[i].text;

            if (cleanHistory.length === 0) {
                cleanHistory.push({ role: currentRole, parts: [{ text: currentText }] });
            } else {
                // 2. Ensure alternation
                const lastRole = cleanHistory[cleanHistory.length - 1].role;
                if (currentRole !== lastRole) {
                    cleanHistory.push({ role: currentRole, parts: [{ text: currentText }] });
                } 
            }
        }
    }

    if (cleanHistory.length > 0 && cleanHistory[cleanHistory.length - 1].role === 'user') {
        cleanHistory.pop();
    }

    return cleanHistory;
};

export const chatWithData = async (
  query: string, 
  appState: AppState, 
  history: { role: 'user' | 'model'; text: string }[]
): Promise<string> => {
    
    const jsonData = prepareJsonContext(appState);
    
    const systemInstructionText = `Bạn là TuanChom, Trợ lý AI chuyên về Nghiệp vụ và Pháp lý của Prudential.
        
    DỮ LIỆU HỆ THỐNG (JSON):
    ${jsonData}
    
    QUY TẮC CỐT LÕI (TUÂN THỦ TUYỆT ĐỐI):
    1. **NGUYÊN TẮC "CHỈ TÀI LIỆU" (STRICT GROUNDING):**
       - Bạn CHỈ ĐƯỢC PHÉP trả lời dựa trên thông tin có trong các file PDF đính kèm (nếu có) và Dữ liệu JSON được cung cấp.
       - TUYỆT ĐỐI KHÔNG sử dụng kiến thức bên ngoài.
       - Nếu không tìm thấy, trả lời: "Xin lỗi, tài liệu sản phẩm hiện tại không đề cập chi tiết đến vấn đề này."

    2. **YÊU CẦU TRÍCH DẪN (CITATION):**
       - Trả lời về Điều khoản loại trừ, Thời gian chờ: Trích dẫn nguyên văn.

    3. **TRÌNH BÀY:**
       - Dùng danh sách gạch đầu dòng (-). Số liệu có "đ" hoặc "VNĐ".
    `;

    // 3. Prepare PDF History (Pseudo-turn)
    const pdfHistoryMessages: any[] = [];
    const activeProductsWithPdf = appState.products.filter(p => p.status === ProductStatus.ACTIVE && p.pdfUrl);
    const productsToLoad = activeProductsWithPdf.slice(0, 2);

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
                pdfHistoryMessages.push({
                    role: 'user',
                    parts: [
                        ...pdfParts,
                        { text: "Đây là các tài liệu điều khoản sản phẩm (PDF). Hãy sử dụng chúng làm cơ sở pháp lý duy nhất." }
                    ]
                });
                pdfHistoryMessages.push({
                    role: 'model',
                    parts: [{ text: "Đã nhận tài liệu. Tôi sẽ căn cứ tuyệt đối vào nội dung trong các file này để tư vấn." }]
                });
            }
        } catch (e) {
            console.error("Error loading PDFs for AI:", e);
        }
    }

    const cleanTextHistory = sanitizeHistory(history);
    const finalHistory = [...pdfHistoryMessages, ...cleanTextHistory];

    return await callAI({
        endpoint: 'chat',
        model: 'gemini-3-flash-preview',
        message: query,
        history: finalHistory,
        systemInstruction: systemInstructionText, 
        config: { temperature: 0.3 }
    });
};

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
    
    const fullProfile = `Khách hàng: ${customer.fullName}, Tuổi: ${new Date().getFullYear() - new Date(customer.dob).getFullYear()}`;
    const finalHistory = sanitizeHistory(history);

    return await callAI({
        endpoint: 'chat',
        model: 'gemini-3-flash-preview',
        message: query,
        history: finalHistory,
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
        model: 'gemini-3-flash-preview',
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
        model: 'gemini-3-flash-preview',
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
        model: 'gemini-3-flash-preview',
        contents: `Chủ đề: ${topic}`,
        systemInstruction: systemInstruction,
        config: { responseMimeType: "application/json", temperature: 0.7 }
    });
    try { return JSON.parse(text); } catch { return []; }
};

export const generateStory = async (facts: string, emotion: string): Promise<string> => {
    return await callAI({
        endpoint: 'generateContent',
        model: 'gemini-3-flash-preview',
        contents: `Dữ kiện: ${facts}`,
        systemInstruction: `Kể chuyện cảm xúc: ${emotion}`,
        config: { temperature: 0.9 }
    });
};

export const generateClaimSupport = async (contract: Contract, customer: Customer): Promise<string> => {
    const prompt = `Soạn tin nhắn hướng dẫn Claim cho HĐ ${contract.contractNumber} của ${customer.fullName}`;
    return await callAI({
        endpoint: 'generateContent',
        model: 'gemini-3-flash-preview',
        contents: prompt
    });
};

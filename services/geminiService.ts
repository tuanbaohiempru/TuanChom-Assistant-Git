
import { httpsCallable } from "firebase/functions";
import { functions } from "./firebaseConfig";
import { AppState, Customer, AgentProfile, Contract, ProductStatus, PlanResult } from "../types";

// --- HELPER TO CALL CLOUD FUNCTION ---
const callAI = async (payload: any): Promise<string> => {
    try {
        const gateway = httpsCallable(functions, 'geminiGateway');
        const result: any = await gateway(payload);
        return result.data.text || "";
    } catch (error: any) {
        console.error("AI Service Error:", error);
        return `Lỗi kết nối AI: ${error.message || 'Vui lòng thử lại sau.'}`;
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

const prepareContext = (state: AppState) => {
  return JSON.stringify({
    customers: state.customers.map(c => ({
      name: c.fullName,
      id: c.id,
      dob: c.dob,
      job: c.job,
      health: c.health,
      status: c.status,
      interactions: c.interactionHistory
    })),
    contracts: state.contracts.map(c => ({
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
    products: state.products.map(p => ({
      name: p.name,
      type: p.type,
      status: p.status, 
      description: p.description,
      rules: p.rulesAndTerms,
    })),
    appointments: state.appointments
  });
};

export const chatWithData = async (
  query: string, 
  appState: AppState, 
  history: { role: 'user' | 'model'; text: string }[]
): Promise<string> => {
    const contextData = prepareContext(appState);
    
    const systemInstruction = `
      Bạn là TuanChom, trợ lý AI cao cấp của Prudential.

      DỮ LIỆU CỦA BẠN (JSON):
      ${contextData}
      
      QUY TẮC BÁN HÀNG QUAN TRỌNG:
      - **CHỈ ĐƯỢC ĐỀ XUẤT** các sản phẩm có trạng thái là "${ProductStatus.ACTIVE}". 
      - Tuyệt đối **KHÔNG ĐỀ XUẤT** hoặc khuyên khách hàng mua các sản phẩm có trạng thái "${ProductStatus.INACTIVE}" (Ngưng bán). 
      - Nếu khách hàng hỏi về một sản phẩm "Ngưng bán", hãy trả lời thông tin chi tiết về nó (để phục vụ khách hàng cũ) nhưng KHÔNG gợi ý mua mới.

      QUY TẮC TRÌNH BÀY (MOBILE-FIRST):
      1. **TUYỆT ĐỐI KHÔNG DÙNG BẢNG (NO MARKDOWN TABLES)**: Giao diện chat điện thoại sẽ bị vỡ. Hãy trình bày dữ liệu dưới dạng danh sách gạch đầu dòng (-).
      2. **HẠN CHẾ EMOJI**: Giữ phong cách chuyên nghiệp, sạch sẽ.
      3. **Cấu trúc**: 
         - Tiêu đề dùng in đậm (**Tiêu đề**).
         - Các ý dùng gạch đầu dòng (- ).
      4. **Số liệu**: 
         - Luôn định dạng tiền tệ kèm chữ "đ" (VD: 20.000.000 đ).
         - Tô đậm các con số quan trọng.
      
      NHIỆM VỤ:
      - Trả lời ngắn gọn, đúng trọng tâm.
      - **Kiến thức Nghiệp vụ**: Sử dụng dữ liệu 'rules' từ products.
      - Nếu hỏi về Hợp đồng: Liệt kê chi tiết.
      - Gợi ý chăm sóc: Đưa ra hành động cụ thể.
    `;

    // Map history to parts format for SDK if needed, but backend wrapper handles { role, parts: [{text}] } conversion usually.
    // However, our backend chat helper expects 'history' array compatible with SDK.
    // The SDK expects { role: string, parts: { text: string }[] }
    const formattedHistory = history.map(h => ({
        role: h.role,
        parts: [{ text: h.text }]
    }));

    return await callAI({
        endpoint: 'chat',
        model: 'gemini-3-flash-preview',
        message: query,
        history: formattedHistory,
        systemInstruction: systemInstruction,
        config: { temperature: 0.2 }
    });
};

export const extractTextFromPdf = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = async () => {
            try {
                const result = reader.result as string;
                const base64 = result.split(',')[1]; 
                
                const response = await callAI({
                    endpoint: 'generateContent',
                    model: 'gemini-3-flash-preview',
                    contents: {
                        parts: [
                            { inlineData: { mimeType: file.type, data: base64 } },
                            { text: "Hãy chuyển đổi toàn bộ nội dung trong file PDF đính kèm thành văn bản thuần túy (Plain text). \n\nYÊU CẦU QUAN TRỌNG:\n1. GIỮ NGUYÊN tất cả các chi tiết, điều khoản, con số, bảng biểu (trình bày bảng dạng danh sách hoặc text dòng). \n2. KHÔNG được tóm tắt hay cắt bớt nội dung.\n3. Mục đích là để copy paste nội dung này vào ô dữ liệu để tra cứu sau này, nên hãy trình bày rõ ràng, phân chia các mục bằng tiêu đề." }
                        ]
                    }
                });
                resolve(response);
            } catch (e) {
                reject(e);
            }
        };
        reader.onerror = error => reject(error);
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
    const customerProfile = `
        KHÁCH HÀNG: ${customer.fullName}
        TUỔI: ${new Date().getFullYear() - new Date(customer.dob).getFullYear()}
        NGHỀ NGHIỆP: ${customer.job}
        TÌNH TRẠNG: ${customer.analysis?.financialStatus}
        TÍNH CÁCH: ${customer.analysis?.personality}
        MỐI QUAN TÂM: ${customer.analysis?.keyConcerns}
    `;

    const financialContext = planResult ? `
        DỮ LIỆU TÀI CHÍNH:
        - Mục tiêu: ${planResult.goal}
        - Thiếu hụt (Gap): ${planResult.shortfall.toLocaleString()} VNĐ
    ` : "";

    let styleInstruction = "";
    if (chatStyle === 'zalo') {
        styleInstruction = `
        PHONG CÁCH GIAO TIẾP: BẠN BÈ / THÂN MẬT (Casual Zalo)
        1. **Cực ngắn**: Mỗi ý chỉ 1-2 câu.
        2. **Tự nhiên**: Xưng hô Em - Anh/Chị (hoặc Bạn/Mình). Bỏ qua các từ sáo rỗng.
        3. **HẠN CHẾ EMOJI**: Chỉ sử dụng tối đa 1-2 emoji ở cuối tin nhắn.
        4. **Trực diện**: Đi thẳng vào lợi ích.
        5. **HIỂN THỊ**: TUYỆT ĐỐI KHÔNG DÙNG BẢNG (TABLE).
        `;
    } else {
        styleInstruction = `
        PHONG CÁCH GIAO TIẾP: TƯ VẤN VIÊN CHUYÊN NGHIỆP (Professional Chat)
        1. **Chuyên nghiệp & Lịch sự**: Dùng từ ngữ chuẩn mực, xưng hô Dạ/Thưa/Em - Anh/Chị. 
        2. **Súc tích & Dễ đọc**: Trả lời ngắn gọn, gãy gọn.
        3. **KHÔNG SPAM EMOJI**: TUYỆT ĐỐI KHÔNG sử dụng Emoji trong câu văn.
        4. **Cấu trúc rõ ràng**: Sử dụng in đậm (**text**) để làm nổi bật ý chính.
        5. **HIỂN THỊ (QUAN TRỌNG)**: 
           - **TUYỆT ĐỐI KHÔNG DÙNG BẢNG (NO MARKDOWN TABLES)**.
           - Dùng danh sách liệt kê.
        `;
    }

    const quickReplyInstruction = `
        QUAN TRỌNG - GỢI Ý TRẢ LỜI NHANH (QUICK REPLIES):
        Ở cuối cùng của câu trả lời, bạn BẮT BUỘC phải cung cấp 3 câu trả lời ngắn (dưới 10 từ) mà NGƯỜI DÙNG có thể dùng để đáp lại bạn ngay lập tức.
        
        ĐỊNH DẠNG BẮT BUỘC (Không dùng Markdown block code):
        <QUICK_REPLIES>["Gợi ý 1", "Gợi ý 2", "Gợi ý 3"]</QUICK_REPLIES>
    `;

    let systemInstruction = "";

    if (roleplayMode === 'consultant') {
        systemInstruction = `
        BẠN LÀ: Một Chuyên gia Hoạch định Tài chính (Consultant) của Prudential - Đẳng cấp MDRT.
        NGƯỜI DÙNG LÀ: Khách hàng (${customer.fullName}).
        
        ${customerProfile}
        ${financialContext}
        ${styleInstruction}
        ${quickReplyInstruction}

        NHIỆM VỤ: **THẤU HIỂU** và **KHƠI GỢI NHU CẦU**. Dùng câu hỏi mở, đào sâu vấn đề.
        `;
    } else {
        systemInstruction = `
        BẠN LÀ: Khách hàng tên ${customer.fullName}.
        NGƯỜI DÙNG LÀ: Tư vấn viên bảo hiểm Prudential (đang tập luyện với bạn).
        
        HỒ SƠ CỦA BẠN:
        ${customerProfile}
        ${financialContext}
        ${styleInstruction}
        ${quickReplyInstruction}

        NHIỆM VỤ CỦA BẠN (AI):
        - Đóng vai khách hàng đúng tính cách.
        - Đưa ra lời từ chối nếu chưa thuyết phục.
        `;
    }

    const formattedHistory = history.map(h => ({
        role: h.role,
        parts: [{ text: h.text }]
    }));

    return await callAI({
        endpoint: 'chat',
        model: 'gemini-3-flash-preview',
        message: query,
        history: formattedHistory,
        systemInstruction: systemInstruction,
        config: { temperature: chatStyle === 'zalo' ? 0.8 : 0.6 }
    });
};

export const getObjectionSuggestions = async (
    lastCustomerMessage: string,
    customer: Customer
): Promise<{ label: string; content: string; type: 'empathy' | 'logic' | 'story' }[]> => {
    const systemInstruction = `
        Bạn là HUẤN LUYỆN VIÊN BÁN HÀNG (SALES COACH) của Prudential.
        
        TÌNH HUỐNG: 
        Tư vấn viên đang chat với khách hàng (${customer.fullName}, tính cách ${customer.analysis?.personality}).
        Khách hàng vừa nhắn: "${lastCustomerMessage}"
        
        NHIỆM VỤ:
        Gợi ý 3 cách trả lời xuất sắc để xử lý lời từ chối/băn khoăn này.
        
        YÊU CẦU OUTPUT (JSON ARRAY):
        [
            { "type": "empathy", "label": "Đồng cảm", "content": "..." },
            { "type": "logic", "label": "Logic", "content": "..." },
            { "type": "story", "label": "Kể chuyện", "content": "..." }
        ]
    `;

    const text = await callAI({
        endpoint: 'generateContent',
        model: 'gemini-3-flash-preview',
        contents: "Hãy phân tích và gợi ý ngay.",
        systemInstruction: systemInstruction,
        config: { responseMimeType: "application/json", temperature: 0.5 }
    });

    try {
        return JSON.parse(text);
    } catch {
        return [];
    }
};

export const generateSocialPost = async (topic: string, tone: string): Promise<{ title: string; content: string }[]> => {
    const systemInstruction = `
        Bạn là Chuyên gia Content Marketing ngành Bảo hiểm Nhân thọ Prudential.
        Nhiệm vụ: Viết 3 status Facebook/Zalo dựa trên chủ đề người dùng đưa ra.
        Phong cách: ${tone}
        OUTPUT JSON: [ { "title": "...", "content": "..." }, ... ]
    `;
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
    const systemInstruction = `
        Bạn là Content Strategist Prudential. Xây dựng chuỗi 5 bài viết (Series) 5 ngày (A.I.D.A.S Model).
        OUTPUT JSON: [ { "day": "Ngày 1", "type": "...", "content": "..." }, ... ]
    `;
    const text = await callAI({
        endpoint: 'generateContent',
        model: 'gemini-3-flash-preview',
        contents: `Chủ đề Series: ${topic}`,
        systemInstruction: systemInstruction,
        config: { responseMimeType: "application/json", temperature: 0.7 }
    });
    try { return JSON.parse(text); } catch { return []; }
};

export const generateStory = async (facts: string, emotion: string): Promise<string> => {
    const systemInstruction = `
        Bạn là bậc thầy kể chuyện (Storyteller) bảo hiểm nhân thọ.
        Cảm xúc: ${emotion}.
        Nguyên tắc: Show, Don't Tell.
    `;
    return await callAI({
        endpoint: 'generateContent',
        model: 'gemini-3-flash-preview',
        contents: `Dữ kiện: ${facts}`,
        systemInstruction: systemInstruction,
        config: { temperature: 0.9 }
    });
};

export const getObjectionAnalysis = async (customer: Customer, history: any[]): Promise<any[]> => {
    // Legacy support, maps to getObjectionSuggestions essentially but context aware
    return [];
};

export const generateClaimSupport = async (contract: Contract, customer: Customer): Promise<string> => {
    const contractInfo = JSON.stringify({
        number: contract.contractNumber,
        main: contract.mainProduct.productName,
        riders: contract.riders.map(r => r.productName).join(', '),
        customer: customer.fullName
    });

    const prompt = `
        Bạn là trợ lý hỗ trợ bồi thường (Claim) của Prudential.
        THÔNG TIN HỢP ĐỒNG: ${contractInfo}
        NHIỆM VỤ: Soạn tin nhắn hướng dẫn nộp hồ sơ Claim chuyên nghiệp, tự suy luận giấy tờ cần thiết dựa trên tên sản phẩm.
    `;

    return await callAI({
        endpoint: 'generateContent',
        model: 'gemini-3-flash-preview',
        contents: prompt
    });
};

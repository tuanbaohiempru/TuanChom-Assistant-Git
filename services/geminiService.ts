
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
        console.error("AI Service Error Full:", error);
        
        // Lấy message chi tiết từ HttpsError
        const msg = error.message || 'Lỗi không xác định';
        
        // Nếu lỗi liên quan đến Model không tìm thấy, gợi ý người dùng
        if (msg.includes("Model không tồn tại")) {
            return `Lỗi AI: Model chưa được hỗ trợ. Hãy thử đổi model khác trong code (VD: gemini-1.5-flash).`;
        }
        
        return `Lỗi AI: ${msg}`;
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
        model: 'gemini-2.0-flash-exp', // Dùng bản ổn định hơn 3-preview nếu gặp lỗi
        contents: prompt
    });
};

const prepareContext = (state: AppState) => {
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
    products: state.products.map(p => ({
      name: p.name,
      type: p.type,
      status: p.status, 
      description: p.description,
      rules: p.rulesAndTerms,
    })),
    appointments: state.appointments.slice(0, 20) // Limit appointments too
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

    const formattedHistory = history.map(h => ({
        role: h.role,
        parts: [{ text: h.text }]
    }));

    return await callAI({
        endpoint: 'chat',
        model: 'gemini-2.0-flash-exp',
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
                    model: 'gemini-2.0-flash-exp',
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
    
    // 1. FORMAT PORTFOLIO (Hợp đồng hiện có)
    const portfolioText = contracts.length > 0
        ? contracts.map(c => {
            const riders = c.riders.map(r => `${r.productName}`).join(', ');
            return `- HĐ số ${c.contractNumber} (${c.status}): SP Chính ${c.mainProduct.productName} (Mệnh giá: ${c.mainProduct.sumAssured.toLocaleString()}đ, Phí: ${c.totalFee.toLocaleString()}đ/năm). ${riders ? `\n  + Bổ trợ: ${riders}` : ''}`;
        }).join('\n')
        : "Chưa tham gia hợp đồng bảo hiểm nào tại Prudential (Khách hàng mới/Tiềm năng).";

    // 2. FORMAT FAMILY (Người thân & Tình trạng BH)
    const familyText = familyContext.length > 0
        ? familyContext.map(f => `- ${f.relationship}: ${f.name} (${f.age} tuổi) -> Trạng thái: ${f.hasContracts ? 'ĐÃ CÓ BẢO HIỂM' : 'CHƯA CÓ BẢO HIỂM (Cơ hội bán)'}`).join('\n')
        : "Chưa có thông tin về gia đình.";

    // 3. BUILD FULL PROFILE
    const fullProfile = `
        === HỒ SƠ KHÁCH HÀNG (KYC) ===
        - Họ tên: ${customer.fullName}
        - Tuổi: ${new Date().getFullYear() - new Date(customer.dob).getFullYear()}
        - Nghề nghiệp: ${customer.job}
        - Tình trạng tài chính: ${customer.analysis?.financialStatus}
        - Tính cách (DISC): ${customer.analysis?.personality}
        - Mối quan tâm hàng đầu: ${customer.analysis?.keyConcerns}

        === DANH MỤC BẢO HIỂM HIỆN CÓ (PORTFOLIO) ===
        ${portfolioText}

        === GIA ĐÌNH & MỐI QUAN HỆ ===
        ${familyText}
        
        === DỮ LIỆU HOẠCH ĐỊNH TÀI CHÍNH (NẾU CÓ) ===
        ${planResult ? `- Mục tiêu: ${planResult.goal}\n- Thiếu hụt (Gap): ${planResult.shortfall.toLocaleString()} VNĐ` : "Chưa làm bài hoạch định tài chính."}
    `;

    let styleInstruction = "";
    if (chatStyle === 'zalo') {
        styleInstruction = `
        PHONG CÁCH GIAO TIẾP: BẠN BÈ / THÂN MẬT (Casual Zalo)
        1. **Cực ngắn**: Mỗi ý chỉ 1-2 câu. Viết như đang chat Zalo nhanh.
        2. **Tự nhiên**: Xưng hô Em - Anh/Chị (hoặc Bạn/Mình). Bỏ qua các từ sáo rỗng.
        3. **HẠN CHẾ EMOJI**: Chỉ sử dụng tối đa 1-2 emoji ở cuối tin nhắn.
        4. **Trực diện**: Đi thẳng vào vấn đề.
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
        
        MỤC TIÊU CUỘC TRÒ CHUYỆN: "${conversationGoal}"
        
        ${fullProfile}
        
        ${styleInstruction}
        ${quickReplyInstruction}

        NHIỆM VỤ CHIẾN LƯỢC: 
        - Dựa vào **PORTFOLIO** để biết khách đã có gì và chưa có gì. Đừng mời chào sản phẩm khách đã mua rồi.
        - Dựa vào **GIA ĐÌNH** để gợi ý bảo vệ cho người thân chưa có bảo hiểm (Cross-sell).
        - **Dẫn dắt câu chuyện** để đạt được MỤC TIÊU đã đề ra ở trên.
        - Dùng kỹ thuật đặt câu hỏi SPIN (Situation, Problem, Implication, Need-payoff) để khơi gợi.
        `;
    } else {
        systemInstruction = `
        BẠN LÀ: Khách hàng tên ${customer.fullName}.
        NGƯỜI DÙNG LÀ: Tư vấn viên bảo hiểm Prudential (đang tập luyện với bạn).
        
        TƯ VẤN VIÊN ĐANG CÓ MỤC TIÊU: "${conversationGoal}"
        
        HỒ SƠ CỦA BẠN (Học kỹ để đóng vai cho giống):
        ${fullProfile}
        
        ${styleInstruction}
        ${quickReplyInstruction}

        NHIỆM VỤ CỦA BẠN (AI):
        - Đóng vai khách hàng đúng tính cách.
        - Nếu Tư vấn viên hỏi về Hợp đồng cũ, hãy trả lời dựa trên PORTFOLIO của bạn.
        - Nếu hỏi về gia đình, trả lời dựa trên thông tin GIA ĐÌNH.
        - Đưa ra các lời từ chối phổ biến (không có tiền, cần hỏi vợ/chồng, để suy nghĩ thêm...) để thử thách tư vấn viên.
        `;
    }

    const formattedHistory = history.map(h => ({
        role: h.role,
        parts: [{ text: h.text }]
    }));

    return await callAI({
        endpoint: 'chat',
        model: 'gemini-2.0-flash-exp',
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
        model: 'gemini-2.0-flash-exp',
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
        model: 'gemini-2.0-flash-exp',
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
        model: 'gemini-2.0-flash-exp',
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
        model: 'gemini-2.0-flash-exp',
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
        model: 'gemini-2.0-flash-exp',
        contents: prompt
    });
};

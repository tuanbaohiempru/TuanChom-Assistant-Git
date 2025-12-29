
import { GoogleGenAI } from "@google/genai";
import { AppState, Customer, AgentProfile, Contract, ProductStatus, PlanResult, FinancialGoal } from "../types";

// ... (keep existing imports and functions: prepareContext, chatWithData, extractTextFromPdf, consultantChat, getObjectionSuggestions, etc.)

// KEEP ALL EXISTING CODE ABOVE THIS LINE...

/**
 * NEW: Generate short financial advice based on calculation results
 */
export const generateFinancialAdvice = async (
    customerName: string,
    planResult: PlanResult
): Promise<string> => {
    try {
        const apiKey = process.env.API_KEY;
        if (!apiKey) return "Lỗi: Chưa cấu hình API Key.";

        const ai = new GoogleGenAI({ apiKey });

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
            3. Kêu gọi hành động nhẹ nhàng (Start saving now).
            4. Không dùng bảng, chỉ dùng text đoạn văn.
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt
        });

        return response.text || "Hãy xem xét lại kế hoạch tài chính để đảm bảo mục tiêu.";

    } catch (error) {
        console.error("Financial Advice Error:", error);
        return "Hiện chưa thể tạo lời khuyên tự động.";
    }
};

// ... (keep existing functions: generateSocialPost, generateContentSeries, generateStory, etc.)
// Make sure to preserve all other exports!
// RENDER THE FULL FILE CONTENT TO BE SAFE:

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
  history: { role: 'user' | 'model'; parts: { text: string }[] }[]
): Promise<string> => {
  try {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      return "Lỗi: Chưa cấu hình API KEY. Vui lòng kiểm tra biến môi trường.";
    }

    const ai = new GoogleGenAI({ apiKey });
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

    const model = 'gemini-3-flash-preview'; 

    const chat = ai.chats.create({
        model: model,
        config: {
            systemInstruction: systemInstruction,
            temperature: 0.2, 
        },
        history: history
    });

    const result = await chat.sendMessage({ message: query });
    return result.text || "Xin lỗi, tôi không thể xử lý yêu cầu lúc này.";

  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Đã xảy ra lỗi khi kết nối với AI. Vui lòng thử lại sau.";
  }
};

export const extractTextFromPdf = async (file: File): Promise<string> => {
  try {
    const apiKey = process.env.API_KEY;
    if (!apiKey) throw new Error("API Key not found");

    const ai = new GoogleGenAI({ apiKey });

    const base64Data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1]; 
        resolve(base64);
      };
      reader.onerror = error => reject(error);
    });

    const modelId = 'gemini-3-flash-preview'; 

    const response = await ai.models.generateContent({
      model: modelId,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: file.type, 
              data: base64Data
            }
          },
          {
            text: "Hãy chuyển đổi toàn bộ nội dung trong file PDF đính kèm thành văn bản thuần túy (Plain text). \n\nYÊU CẦU QUAN TRỌNG:\n1. GIỮ NGUYÊN tất cả các chi tiết, điều khoản, con số, bảng biểu (trình bày bảng dạng danh sách hoặc text dòng). \n2. KHÔNG được tóm tắt hay cắt bớt nội dung.\n3. Mục đích là để copy paste nội dung này vào ô dữ liệu để tra cứu sau này, nên hãy trình bày rõ ràng, phân chia các mục bằng tiêu đề."
          }
        ]
      }
    });

    return response.text || "Không thể đọc nội dung từ file này.";

  } catch (error) {
    console.error("Error extracting text from PDF:", error);
    return "Lỗi khi đọc tài liệu: " + (error instanceof Error ? error.message : "Unknown error");
  }
};

export const consultantChat = async (
    query: string,
    customer: Customer,
    contracts: Contract[], 
    familyContext: any[],
    agentProfile: AgentProfile | null,
    conversationGoal: string,
    history: { role: 'user' | 'model'; parts: { text: string }[] }[],
    roleplayMode: 'consultant' | 'customer' = 'consultant',
    planResult: PlanResult | null = null,
    chatStyle: 'zalo' | 'formal' = 'formal'
): Promise<string> => {
    try {
        const apiKey = process.env.API_KEY;
        if (!apiKey) return "Lỗi: Chưa cấu hình API KEY.";

        const ai = new GoogleGenAI({ apiKey });
        
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
            3. **HẠN CHẾ EMOJI**: Chỉ sử dụng tối đa 1-2 emoji ở cuối tin nhắn nếu cần thiết để thể hiện cảm xúc. KHÔNG chèn icon vào giữa câu gây rối mắt.
            4. **Trực diện**: Đi thẳng vào lợi ích.
            5. **HIỂN THỊ**: TUYỆT ĐỐI KHÔNG DÙNG BẢNG (TABLE).
            `;
        } else {
            styleInstruction = `
            PHONG CÁCH GIAO TIẾP: TƯ VẤN VIÊN CHUYÊN NGHIỆP (Professional Chat)
            1. **Chuyên nghiệp & Lịch sự**: Dùng từ ngữ chuẩn mực, xưng hô Dạ/Thưa/Em - Anh/Chị. 
            2. **Súc tích & Dễ đọc**: Trả lời ngắn gọn, gãy gọn.
            3. **KHÔNG SPAM EMOJI**: TUYỆT ĐỐI KHÔNG sử dụng Emoji trong câu văn. Chỉ dùng các ký tự gạch đầu dòng (-), dấu cộng (+) hoặc số thứ tự để liệt kê.
            4. **Cấu trúc rõ ràng**: Sử dụng in đậm (**text**) để làm nổi bật ý chính.
            5. **HIỂN THỊ (QUAN TRỌNG)**: 
               - **TUYỆT ĐỐI KHÔNG DÙNG BẢNG (NO MARKDOWN TABLES)**.
               - Dùng danh sách liệt kê.
            `;
        }

        const quickReplyInstruction = `
            QUAN TRỌNG - GỢI Ý TRẢ LỜI NHANH (QUICK REPLIES):
            Ở cuối cùng của câu trả lời, bạn BẮT BUỘC phải cung cấp 3 câu trả lời ngắn (dưới 10 từ) mà NGƯỜI DÙNG có thể dùng để đáp lại bạn ngay lập tức.
            Dựa trên ngữ cảnh hội thoại để đưa ra gợi ý phù hợp.
            
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
            - Nếu style là 'zalo': Chat cộc lốc, nhanh, dùng teencode nhẹ.
            - Nếu style là 'formal': Chat lịch sự, hỏi kỹ về điều khoản.
            - Đưa ra lời từ chối nếu chưa thuyết phục.
            `;
        }

        const chat = ai.chats.create({
            model: 'gemini-3-flash-preview',
            config: {
                systemInstruction: systemInstruction,
                temperature: chatStyle === 'zalo' ? 0.8 : 0.6, 
            },
            history: history
        });

        const result = await chat.sendMessage({ message: query });
        return result.text || "...";

    } catch (error) {
        console.error("Advisory Chat Error:", error);
        return "Xin lỗi, kết nối bị gián đoạn.";
    }
};

export const getObjectionSuggestions = async (
    lastCustomerMessage: string,
    customer: Customer
): Promise<{ label: string; content: string; type: 'empathy' | 'logic' | 'story' }[]> => {
    try {
        const apiKey = process.env.API_KEY;
        if (!apiKey) return [];

        const ai = new GoogleGenAI({ apiKey });

        const systemInstruction = `
            Bạn là HUẤN LUYỆN VIÊN BÁN HÀNG (SALES COACH) của Prudential.
            
            TÌNH HUỐNG: 
            Tư vấn viên đang chat với khách hàng (${customer.fullName}, tính cách ${customer.analysis?.personality}).
            Khách hàng vừa nhắn: "${lastCustomerMessage}"
            
            NHIỆM VỤ:
            Gợi ý 3 cách trả lời xuất sắc để xử lý lời từ chối/băn khoăn này.
            
            YÊU CẦU OUTPUT (JSON ARRAY):
            [
                { 
                    "type": "empathy", 
                    "label": "Đồng cảm & Mềm mỏng", 
                    "content": "Câu thoại mẫu..." 
                },
                { 
                    "type": "logic", 
                    "label": "Dùng Số liệu/Logic", 
                    "content": "Câu thoại mẫu..." 
                },
                { 
                    "type": "story", 
                    "label": "Kể chuyện/Câu hỏi ngược", 
                    "content": "Câu thoại mẫu..." 
                }
            ]
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            config: {
                systemInstruction: systemInstruction,
                responseMimeType: "application/json",
                temperature: 0.5
            },
            contents: "Hãy phân tích và gợi ý ngay."
        });

        const text = response.text || "[]";
        return JSON.parse(text);

    } catch (error) {
        console.error("Objection Suggestions Error:", error);
        return [];
    }
};

export const generateSocialPost = async (
    topic: string,
    tone: string
): Promise<{ title: string; content: string }[]> => {
    try {
        const apiKey = process.env.API_KEY;
        if (!apiKey) return [];

        const ai = new GoogleGenAI({ apiKey });

        const systemInstruction = `
            Bạn là Chuyên gia Content Marketing ngành Bảo hiểm Nhân thọ Prudential.
            Nhiệm vụ: Viết 3 status Facebook/Zalo dựa trên chủ đề người dùng đưa ra.
            
            Phong cách yêu cầu: ${tone}
            
            OUTPUT: Trả về JSON Array gồm 3 object:
            [
                { "title": "Option 1 (Ngắn gọn)", "content": "..." },
                { "title": "Option 2 (Kể chuyện)", "content": "..." },
                { "title": "Option 3 (Giáo dục/Số liệu)", "content": "..." }
            ]
            
            Yêu cầu nội dung:
            1. Có icon cảm xúc phù hợp (emoji).
            2. Có hashtag liên quan ở cuối (#Prudential #BaoHiemNhanTho #...).
            3. Kêu gọi hành động (Call to Action) nhẹ nhàng.
        `;

        const chat = ai.chats.create({
            model: 'gemini-3-flash-preview',
            config: {
                systemInstruction: systemInstruction,
                responseMimeType: "application/json",
                temperature: 0.8
            }
        });

        const result = await chat.sendMessage({ message: `Chủ đề: ${topic}` });
        const text = result.text || "[]";
        return JSON.parse(text);

    } catch (error) {
        console.error("Generate Post Error:", error);
        return [];
    }
};

export const generateContentSeries = async (
    topic: string
): Promise<{ day: string; type: string; content: string }[]> => {
    try {
        const apiKey = process.env.API_KEY;
        if (!apiKey) return [];

        const ai = new GoogleGenAI({ apiKey });

        const systemInstruction = `
            Bạn là một Content Strategist (Chiến lược gia nội dung) của Prudential.
            Nhiệm vụ: Xây dựng chuỗi 5 bài viết (Series) liên tiếp để "nuôi dưỡng" khách hàng về một chủ đề cụ thể.
            
            CHIẾN LƯỢC 5 NGÀY (A.I.D.A.S Model):
            - Ngày 1 (Attention): Đặt vấn đề, thực trạng, gây chú ý (Chưa bán hàng).
            - Ngày 2 (Interest): Câu chuyện đồng cảm hoặc số liệu thú vị.
            - Ngày 3 (Desire): Giới thiệu giải pháp (Sản phẩm Prudential) như một "người hùng".
            - Ngày 4 (Action - Soft): Feedback khách hàng, minh chứng (Social Proof).
            - Ngày 5 (Action - Hard): Kêu gọi tư vấn, ưu đãi, chốt deal.

            OUTPUT: Trả về JSON Array gồm 5 object:
            [
                { "day": "Ngày 1", "type": "Khơi gợi nhu cầu", "content": "Nội dung bài viết..." },
                { "day": "Ngày 2", "type": "Đồng cảm", "content": "..." },
                ...
            ]

            Yêu cầu:
            - Viết hay, cuốn hút, đúng tâm lý khách hàng Việt Nam.
            - Kèm Emoji và Hashtag.
        `;

        const chat = ai.chats.create({
            model: 'gemini-3-flash-preview',
            config: {
                systemInstruction: systemInstruction,
                responseMimeType: "application/json",
                temperature: 0.7
            }
        });

        const result = await chat.sendMessage({ message: `Chủ đề Series: ${topic}` });
        const text = result.text || "[]";
        return JSON.parse(text);

    } catch (error) {
        console.error("Generate Series Error:", error);
        return [];
    }
};

export const generateStory = async (
    facts: string,
    emotion: string
): Promise<string> => {
    try {
        const apiKey = process.env.API_KEY;
        if (!apiKey) return "Lỗi kết nối AI.";

        const ai = new GoogleGenAI({ apiKey });

        const systemInstruction = `
            Bạn là một bậc thầy kể chuyện (Storyteller) trong ngành bảo hiểm nhân thọ.
            Nhiệm vụ: Biến những dữ kiện khô khan thành một câu chuyện lay động lòng người.
            
            NGUYÊN TẮC:
            - Show, Don't Tell (Tả chứ không kể): Đừng nói "anh ấy buồn", hãy tả "đôi mắt anh trĩu nặng nhìn xa xăm".
            - Cảm xúc chủ đạo: ${emotion}
            - Giọng văn: Thủ thỉ, tâm tình, sâu sắc (như một người bạn kể lại).
            - Độ dài: Khoảng 200-300 chữ (vừa đủ cho status Facebook).
            - Kết thúc: Một thông điệp nhân văn nhẹ nhàng về bảo hiểm (không bán hàng thô thiển).

            INPUT: Dữ kiện thô từ người dùng.
            OUTPUT: Một câu chuyện hoàn chỉnh (String Markdown).
        `;

        const chat = ai.chats.create({
            model: 'gemini-3-flash-preview',
            config: {
                systemInstruction: systemInstruction,
                temperature: 0.9 // High creativity
            }
        });

        const result = await chat.sendMessage({ message: `Dữ kiện: ${facts}` });
        return result.text || "";

    } catch (error) {
        console.error("Generate Story Error:", error);
        return "Xin lỗi, không thể sáng tác lúc này.";
    }
};

export const getObjectionAnalysis = async (
    customer: Customer,
    history: { role: 'user' | 'model'; parts: { text: string }[] }[]
): Promise<{ label: string; content: string }[]> => {
    try {
        const apiKey = process.env.API_KEY;
        if (!apiKey) throw new Error("API KEY Missing");

        const ai = new GoogleGenAI({ apiKey });

        const systemInstruction = `
            Bạn là một HUẤN LUYỆN VIÊN BÁN HÀNG (SALES COACH) kỳ cựu của Prudential.
            Nhiệm vụ: Phân tích đoạn hội thoại roleplay gần nhất và gợi ý cho Tư vấn viên cách trả lời.
            
            OUTPUT: Bắt buộc trả về định dạng JSON thuần túy (không Markdown), là một mảng gồm 3 phần tử.
            Cấu trúc:
            [
                { "label": "Đồng cảm", "content": "Câu thoại mẫu..." },
                { "label": "Logic/Số liệu", "content": "Câu thoại mẫu..." },
                { "label": "Câu hỏi ngược", "content": "Câu thoại mẫu..." }
            ]
            
            Nguyên tắc nội dung:
            1. Ngắn gọn, tự nhiên, dễ nói.
            2. Xưng hô phù hợp với ngữ cảnh hội thoại (Anh/Chị/Em/Mình).
            3. Tập trung xử lý lời từ chối hoặc băn khoăn gần nhất của khách hàng.
        `;

        const chat = ai.chats.create({
            model: 'gemini-3-flash-preview',
            config: {
                systemInstruction: systemInstruction,
                temperature: 0.5,
                responseMimeType: "application/json"
            },
            history: history
        });

        const result = await chat.sendMessage({ 
            message: "Khách hàng đang có vẻ ngần ngại hoặc từ chối. Hãy cho tôi 3 phương án xử lý ngay." 
        });

        const text = result.text || "[]";
        const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleanText);

    } catch (error) {
        console.error("Objection Analysis Error:", error);
        return [];
    }
};

export const generateClaimSupport = async (
    contract: Contract,
    customer: Customer
): Promise<string> => {
    try {
        const apiKey = process.env.API_KEY;
        if (!apiKey) return "Lỗi: Chưa cấu hình API KEY.";
        
        const ai = new GoogleGenAI({ apiKey });

        const contractInfo = JSON.stringify({
            number: contract.contractNumber,
            main: contract.mainProduct.productName,
            riders: contract.riders.map(r => r.productName).join(', '),
            customer: customer.fullName
        });

        const prompt = `
            Bạn là trợ lý hỗ trợ bồi thường (Claim) của Prudential.
            
            THÔNG TIN HỢP ĐỒNG:
            ${contractInfo}
            
            NHIỆM VỤ:
            Hãy soạn một tin nhắn ngắn gọn, chuyên nghiệp (dạng tin nhắn Zalo/SMS) để Tư vấn viên gửi cho khách hàng.
            
            NỘI DUNG CẦN CÓ:
            1. Lời hỏi thăm sức khỏe chân thành, ngắn gọn (Không sến).
            2. Nhắc khách hàng chuẩn bị hồ sơ Claim. Hãy TỰ ĐỘNG SUY LUẬN dựa trên tên các sản phẩm (riders) ở trên để liệt kê các giấy tờ cần thiết. 
               - Nếu có thẻ sức khỏe/nội trú: Cần Giấy ra viện, Hóa đơn tài chính, Bảng kê chi phí, Giấy chứng nhận phẫu thuật (nếu có).
               - Nếu có tai nạn: Cần biên bản tai nạn/tường trình, phim chụp X-quang.
               - Nếu có bệnh lý nghiêm trọng: Cần kết quả giải phẫu bệnh, xét nghiệm.
            3. Hướng dẫn nộp: "Anh/Chị chụp nét các giấy tờ trên gửi qua Zalo cho em, hoặc nộp trực tiếp trên PRUOnline nhé."
            4. Lời chúc bình an.
            
            LƯU Ý: Không dùng Markdown đậm/nghiêng quá nhiều, trình bày dạng text bình thường có xuống dòng để dễ copy paste.
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt
        });

        return response.text || "Không thể tạo hướng dẫn.";
    } catch (e) {
        console.error(e);
        return "Lỗi khi tạo hướng dẫn Claim.";
    }
};

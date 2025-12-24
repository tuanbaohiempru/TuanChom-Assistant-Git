import { GoogleGenAI } from "@google/genai";
import { AppState, Customer, AgentProfile, Contract } from "../types";

// Helper to sanitize data for AI context (remove unnecessary UI fields if any)
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
      Bạn là PruMate, trợ lý AI cao cấp của Prudential.

      DỮ LIỆU CỦA BẠN (JSON):
      ${contextData}
      
      QUY TẮC TRÌNH BÀY (RẤT QUAN TRỌNG):
      1. **Cấu trúc**: Sử dụng Markdown.
         - Dùng tiêu đề cấp 3 (### ) cho các mục chính.
         - Dùng danh sách gạch đầu dòng (- ) cho các ý liệt kê.
      2. **TUYỆT ĐỐI KHÔNG DÙNG BẢNG (TABLE)**. Thay vào đó, hãy trình bày dạng danh sách dọc để dễ đọc trên điện thoại.
      3. **Số liệu**: 
         - Luôn định dạng tiền tệ kèm chữ "đ" ở cuối (VD: 20.000.000 đ).
         - Ngày tháng ghi rõ ràng (DD/MM/YYYY).
         - Tô đậm các con số quan trọng (VD: **20.000.000 đ**).
      4. **Trạng thái**: Ghi chính xác trạng thái (VD: "Đang hiệu lực", "Mất hiệu lực") để hệ thống tự tô màu.
      
      NHIỆM VỤ:
      - Trả lời ngắn gọn, đúng trọng tâm.
      - **Kiến thức Nghiệp vụ**: Sử dụng dữ liệu 'rules' (quy tắc) từ danh sách products. Đây là nguồn sự thật duy nhất.
      - Nếu hỏi về Hợp đồng: 
        - Dùng tiêu đề cho tên sản phẩm.
        - Liệt kê các thông tin: Người được BH, Phí, STBH, Định kỳ đóng phí dưới dạng gạch đầu dòng.
      - Nếu hỏi về Sản phẩm/Điều khoản: Trích dẫn các quy tắc loại trừ hoặc quyền lợi cụ thể.
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

/**
 * Creates a specialized Advisory Roleplay Chat
 */
export const consultantChat = async (
    query: string,
    customer: Customer,
    contracts: Contract[], 
    familyContext: any[],
    agentProfile: AgentProfile | null,
    conversationGoal: string,
    history: { role: 'user' | 'model'; parts: { text: string }[] }[],
    tone: string = 'professional' // New Parameter: 'professional' | 'friendly' | 'direct'
): Promise<string> => {
    try {
        const apiKey = process.env.API_KEY;
        if (!apiKey) return "Lỗi: Chưa cấu hình API KEY.";

        const ai = new GoogleGenAI({ apiKey });
        
        const customerProfile = JSON.stringify({
            name: customer.fullName,
            age: new Date().getFullYear() - new Date(customer.dob).getFullYear(),
            job: customer.job,
            health: customer.health,
            children: customer.analysis?.childrenCount || 0,
            income: customer.analysis?.incomeEstimate || 'Chưa rõ',
            financialStatus: customer.analysis?.financialStatus,
            knowledge: customer.analysis?.insuranceKnowledge,
            concerns: customer.analysis?.keyConcerns,
            personality: customer.analysis?.personality,
            readiness: customer.analysis?.readiness,
            history: customer.interactionHistory
        });

        const contractsContext = contracts.length > 0
            ? JSON.stringify(contracts.map(c => ({
                number: c.contractNumber,
                status: c.status,
                effectiveDate: c.effectiveDate,
                nextPayment: c.nextPaymentDate,
                mainProduct: {
                    name: c.mainProduct.productName,
                    sumAssured: c.mainProduct.sumAssured,
                    fee: c.mainProduct.fee
                },
                riders: c.riders.map(r => ({
                    name: r.productName,
                    sumAssured: r.sumAssured,
                    fee: r.fee
                })),
                totalFee: c.totalFee
            })))
            : "Khách hàng CHƯA có hợp đồng nào tại Prudential.";

        const familyData = familyContext.length > 0
            ? JSON.stringify(familyContext)
            : "Chưa có thông tin chi tiết về người thân.";

        const agentContext = agentProfile ? `
            THÔNG TIN VỀ BẠN (CỐ VẤN):
            - Họ tên: ${agentProfile.fullName}
            - Tuổi: ${agentProfile.age}
            - Chức danh/Danh hiệu: ${agentProfile.title}
            - Mã số: ${agentProfile.agentCode}
            - Văn phòng: ${agentProfile.office}
            - Giới thiệu bản thân: ${agentProfile.bio}
            -> Hãy sử dụng phong thái và thông tin này khi xưng hô hoặc giới thiệu nếu cần thiết.
        ` : 'Bạn là một Cố vấn Prudential chuyên nghiệp (Hãy tự xưng là Cố vấn).';

        // --- DYNAMIC PERSONA DEFINITION (UPDATED: NO 'TÔI') ---
        let personaInstruction = "";
        
        if (tone === 'friendly') {
            personaInstruction = `
            PHONG CÁCH: THÂN THIẾT, BẠN BÈ, GẦN GŨI.
            - Xưng hô: "Mình" - "Bạn/Cậu", hoặc xưng Tên (ví dụ: "Ngân thấy là...", "Hùng nghĩ là...").
            - Tuyệt đối KHÔNG xưng "Tôi".
            - Không dùng kính ngữ sáo rỗng (Dạ/Thưa) trừ khi khách hàng lớn tuổi hơn hẳn.
            - Cách nói: Thoải mái, dùng từ ngữ đời thường, icon vui vẻ.
            - Mục tiêu: Tâm tình như hai người bạn thân, chia sẻ lo lắng chứ không dạy đời.
            `;
        } else if (tone === 'direct') {
            personaInstruction = `
            PHONG CÁCH: SẮC SẢO, CHUYÊN GIA, QUYẾT ĐOÁN.
            - Xưng hô: "Em" - "Anh/Chị". (Giữ sự tôn trọng tối thiểu của dịch vụ).
            - Tuyệt đối KHÔNG xưng "Tôi".
            - KHÔNG DÙNG từ đệm thừa thãi (Bỏ: "Dạ vâng", "Thưa anh", "Xin phép").
            - Cách nói: Dùng câu khẳng định mạnh, ngắn gọn. Đi thẳng vào CON SỐ, LỢI ÍCH, và RỦI RO.
            - Ví dụ: Thay vì "Dạ em nghĩ anh nên mua..." hãy nói "Anh cần bảo vệ nguồn thu nhập này ngay vì rủi ro là..."
            - Mục tiêu: Thể hiện năng lực chuyên môn cao, giúp khách hàng (nhóm D) ra quyết định nhanh.
            `;
        } else {
            // Default: Professional
            personaInstruction = `
            PHONG CÁCH: CHUYÊN NGHIỆP, LỊCH SỰ, TẬN TÂM (MẶC ĐỊNH).
            - Xưng hô: "Em" - "Anh/Chị".
            - Tuyệt đối KHÔNG xưng "Tôi".
            - Dùng đầy đủ kính ngữ: Dạ, Thưa, Ạ ở đầu/cuối câu.
            - Cách nói: Nhẹ nhàng, thấu hiểu, "thủ thỉ" tâm tình.
            - Mục tiêu: Xây dựng niềm tin, tạo cảm giác an tâm và được phục vụ chu đáo.
            `;
        }

        const systemInstruction = `
        BẠN ĐANG THAM GIA ROLEPLAY (NHẬP VAI).
        VAI TRÒ: Cố vấn Bảo hiểm Prudential.
        KHÁCH HÀNG: ${customer.fullName}
        MỤC TIÊU (KPI): "${conversationGoal}"

        ${agentContext}
        
        === THIẾT LẬP GIỌNG ĐIỆU (QUAN TRỌNG NHẤT) ===
        ${personaInstruction}
        
        *LƯU Ý ĐẶC BIỆT*: Trong văn hóa Việt Nam, từ "Tôi" tạo cảm giác xa cách. Hãy luôn tuân thủ cách xưng hô "Em" hoặc "Mình" như đã định nghĩa ở trên.

        THÔNG TIN KHÁCH HÀNG:
        ${customerProfile}

        DANH SÁCH HỢP ĐỒNG ĐÃ SỞ HỮU (EXISTING CONTRACTS):
        ${contractsContext}

        THÔNG TIN GIA ĐÌNH & NGƯỜI THÂN (FAMILY CONTEXT):
        ${familyData}

        === NHIỆM VỤ NÂNG CAO (CONTEXT-AWARE) ===
        1. **Tra cứu Hợp đồng**: Nếu khách hỏi "Mình có cái gì rồi?", hãy dựa vào danh sách trên để trả lời chính xác tên sản phẩm, số phí, quyền lợi. Đừng bịa.
        2. **Gợi ý Bán thêm (Upsell/Cross-sell)**:
           - Nếu khách có Hợp đồng Chính (Nhân thọ) nhưng chưa có Thẻ sức khỏe -> Gợi ý thêm thẻ.
           - Dựa vào FAMILY CONTEXT: Nếu thấy Con cái (Child) chưa có hợp đồng -> Gợi ý quỹ học vấn (PRU-Hành Trang Trưởng Thành).
           - Nếu thấy Vợ/Chồng (Spouse) chưa có bảo hiểm -> Gợi ý bảo vệ trụ cột.
        3. **Nhắc phí**: Nếu thấy ngày đóng phí sắp đến, hãy khéo léo nhắc.

        === CHIẾN THUẬT GIAO TIẾP "PING-PONG" (BẮT BUỘC TUÂN THỦ) ===
        1. **CHIA NHỎ NỘI DUNG**: 
           - Tuyệt đối KHÔNG trả lời một tràng dài như đọc văn mẫu.
           - Tối đa 2-3 câu ngắn mỗi lần trả lời.
        
        2. **CÂU HỎI DẪN DẮT (MICRO-CLOSING)**:
           - LUÔN LUÔN kết thúc câu trả lời bằng một câu hỏi ngắn để nhường lời cho khách.

        HÃY NHỚ: Mục tiêu không phải là thắng tranh luận, mà là làm khách hàng mở lòng và chốt được giải pháp theo phong cách ${tone}.
        `;

        const chat = ai.chats.create({
            model: 'gemini-3-flash-preview',
            config: {
                systemInstruction: systemInstruction,
                temperature: tone === 'friendly' ? 0.9 : 0.7, // Friendly needs more creativity
            },
            history: history
        });

        const result = await chat.sendMessage({ message: query });
        return result.text || "Em đang lắng nghe...";

    } catch (error) {
        console.error("Advisory Chat Error:", error);
        return "Xin lỗi, kết nối với Cố vấn AI bị gián đoạn.";
    }
};

/**
 * Generates 3 social media post options (Single Post)
 */
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

/**
 * Generates a 5-day Content Series
 */
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

/**
 * Storytelling Mode: Transforms facts into a story
 */
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

/**
 * Analyzes conversation and returns 3 objection handling options in JSON
 */
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
        // Clean markdown if present (though responseMimeType should handle it, keeping safety)
        const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleanText);

    } catch (error) {
        console.error("Objection Analysis Error:", error);
        return [];
    }
};

/**
 * Generates a claim guide message
 */
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
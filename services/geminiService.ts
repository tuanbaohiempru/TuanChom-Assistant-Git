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
    familyContext: any[], // ADDED: Family context data
    agentProfile: AgentProfile | null,
    conversationGoal: string,
    history: { role: 'user' | 'model'; parts: { text: string }[] }[]
): Promise<string> => {
    try {
        const apiKey = process.env.API_KEY;
        if (!apiKey) return "Lỗi: Chưa cấu hình API KEY.";

        const ai = new GoogleGenAI({ apiKey });
        
        // Construct the detailed customer context
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

        // Format contracts context
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

        // Format Family Context
        const familyData = familyContext.length > 0
            ? JSON.stringify(familyContext)
            : "Chưa có thông tin chi tiết về người thân.";

        // Construct Agent Context
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

        const systemInstruction = `
        BẠN ĐANG THAM GIA ROLEPLAY (NHẬP VAI).
        VAI TRÒ: Cố vấn Bảo hiểm Prudential - Người bạn đồng hành tận tâm.
        KHÁCH HÀNG: ${customer.fullName}
        MỤC TIÊU (KPI): "${conversationGoal}"

        ${agentContext}

        THÔNG TIN KHÁCH HÀNG:
        ${customerProfile}

        DANH SÁCH HỢP ĐỒNG ĐÃ SỞ HỮU (EXISTING CONTRACTS):
        ${contractsContext}

        THÔNG TIN GIA ĐÌNH & NGƯỜI THÂN (FAMILY CONTEXT):
        ${familyData}

        === NHIỆM VỤ NÂNG CAO (CONTEXT-AWARE) ===
        1. **Tra cứu Hợp đồng**: Nếu khách hỏi "Tôi có cái gì rồi?", hãy dựa vào danh sách trên để trả lời chính xác tên sản phẩm, số phí, quyền lợi. Đừng bịa.
        2. **Gợi ý Bán thêm (Upsell/Cross-sell)**:
           - Nếu khách có Hợp đồng Chính (Nhân thọ) nhưng chưa có Thẻ sức khỏe -> Gợi ý thêm thẻ.
           - Dựa vào FAMILY CONTEXT: Nếu thấy Con cái (Child) chưa có hợp đồng -> Gợi ý quỹ học vấn (PRU-Hành Trang Trưởng Thành).
           - Nếu thấy Vợ/Chồng (Spouse) chưa có bảo hiểm -> Gợi ý bảo vệ trụ cột.
           - Dùng cụm từ: "Em thấy trong hồ sơ anh có liên kết với [Tên người thân], bé chưa có..." hoặc "Chị nhà mình đã có thẻ chưa anh?"
        3. **Nhắc phí**: Nếu thấy ngày đóng phí sắp đến, hãy khéo léo nhắc.

        === CHIẾN THUẬT GIAO TIẾP "PING-PONG" (BẮT BUỘC TUÂN THỦ) ===
        1. **CHIA NHỎ NỘI DUNG**: 
           - Tuyệt đối KHÔNG trả lời một tràng dài như đọc văn mẫu.
           - Tối đa 2-3 câu ngắn mỗi lần trả lời.
        
        2. **CÂU HỎI DẪN DẮT (MICRO-CLOSING)**:
           - LUÔN LUÔN kết thúc câu trả lời bằng một câu hỏi ngắn để nhường lời cho khách.
           - Ví dụ: "Anh thấy điểm này sao ạ?", "Chỗ này em nói có nhanh quá không anh?"

        3. **GIỌNG ĐIỆU "THỦ THỈ"**:
           - Dùng từ ngữ đời thường, gần gũi.
           - Thể hiện sự quan tâm đến cả gia đình họ.

        HÃY NHỚ: Mục tiêu không phải là thắng tranh luận, mà là làm khách hàng mở lòng và chốt được giải pháp.
        `;

        const chat = ai.chats.create({
            model: 'gemini-3-flash-preview',
            config: {
                systemInstruction: systemInstruction,
                temperature: 0.7, 
            },
            history: history
        });

        const result = await chat.sendMessage({ message: query });
        return result.text || "Tôi đang lắng nghe...";

    } catch (error) {
        console.error("Advisory Chat Error:", error);
        return "Xin lỗi, kết nối với Cố vấn AI bị gián đoạn.";
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
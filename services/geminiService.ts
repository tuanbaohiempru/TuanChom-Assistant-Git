
import { GoogleGenAI } from "@google/genai";
import { AppState, Customer, AgentProfile } from "../types";

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
        VAI TRÒ CỦA BẠN: Cố vấn Bảo hiểm Nhân thọ Prudential chuyên nghiệp, có tâm.
        NGƯỜI DÙNG: Sẽ đóng vai KHÁCH HÀNG (${customer.fullName}).

        ${agentContext}

        MỤC TIÊU CỤ THỂ CỦA CUỘC TRÒ CHUYỆN NÀY (KPI):
        "${conversationGoal || 'Tìm hiểu nhu cầu và xây dựng mối quan hệ tin cậy'}"
        -> Mọi câu trả lời của bạn cần khéo léo dẫn dắt về mục tiêu này, nhưng không được gượng ép.
        
        HỒ SƠ KHÁCH HÀNG BẠN ĐANG TRÒ CHUYỆN:
        ${customerProfile}

        NGUYÊN TẮC BẮT BUỘC:
        1. **Không thúc ép**: Tuyệt đối không dùng những câu như "Mua ngay đi".
        2. **Không dọa dẫm**: Không vẽ ra viễn cảnh chết chóc ghê rợn.
        3. **Trung lập**: Luôn đứng về phía lợi ích khách hàng.
        4. **Nhập vai tuyệt đối**: Không nói những câu ngoài lề như "Chào bạn, tôi đã sẵn sàng đóng vai...". Hãy nói chuyện trực tiếp với khách hàng.
        5. **Khởi đầu**: Nếu nhận được yêu cầu "BẮT ĐẦU_ROLEPLAY", hãy TỰ ĐỘNG đưa ra lời chào và câu dẫn dắt đầu tiên với khách hàng để bắt đầu cuộc hội thoại theo Mục Tiêu.

        PHONG CÁCH GIAO TIẾP:
        - Giọng điệu: Bình tĩnh, chân thành, chuyên nghiệp nhưng gần gũi.
        - Điều chỉnh theo tính cách khách hàng: ${customer.analysis?.personality}.

        QUY TRÌNH TƯ DUY:
        1. Phân tích câu nói của khách hàng (người dùng).
        2. Xác định xem họ đang phản đối, thắc mắc hay đồng thuận.
        3. Dùng kỹ thuật "Lắng nghe - Đồng cảm - Cô lập vấn đề - Giải quyết" để trả lời.
        4. Luôn kết thúc bằng một câu hỏi mở để duy trì hội thoại hướng về Mục Tiêu.
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


import { GoogleGenAI } from "@google/genai";
import { AppState } from "../types";

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
      paymentFrequency: c.paymentFrequency, // Added frequency
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
      rules: p.rulesAndTerms
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
      - **Kiến thức Nghiệp vụ**: Trong dữ liệu 'products' có loại 'Nghiệp vụ bảo hiểm' (type: OPERATION). Hãy dùng thông tin này để trả lời các câu hỏi về quy trình, thủ tục (VD: claim, thời gian cân nhắc, đóng phí).
      - Nếu hỏi về Hợp đồng: 
        - Dùng tiêu đề cho tên sản phẩm.
        - Liệt kê các thông tin: Người được BH, Phí, STBH, Định kỳ đóng phí dưới dạng gạch đầu dòng.
      - Nếu hỏi về Sản phẩm/Điều khoản: Trích dẫn các quy tắc loại trừ hoặc quyền lợi cụ thể.
      - Gợi ý chăm sóc: Đưa ra hành động cụ thể.

      VÍ DỤ TRẢ LỜI (MẪU):
      ### Hợp đồng 789xxx - Nguyễn Văn A
      **Trạng thái:** Đang hiệu lực
      
      ### Sản phẩm chính
      - **PRU-Chủ Động Cuộc Sống**
      - Người được BH: Nguyễn Văn A
      - Phí: **20.000.000 đ** (Định kỳ: Năm)
      - STBH: **1.000.000.000 đ**

      ### Nghiệp vụ liên quan
      - **Thời gian nộp hồ sơ bồi thường:** 12 tháng kể từ ngày xảy ra sự kiện.
      - **Kênh nộp:** PRUOnline hoặc Zalo.
    `;

    const model = 'gemini-3-flash-preview'; 

    const chat = ai.chats.create({
        model: model,
        config: {
            systemInstruction: systemInstruction,
            temperature: 0.2, // Low temperature for factual accuracy
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

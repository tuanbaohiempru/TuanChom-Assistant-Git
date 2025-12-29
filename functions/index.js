
/**
 * BACKEND CODE - FIREBASE CLOUD FUNCTIONS
 * Deploy this to Firebase to secure your API Key.
 */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { GoogleGenAI } = require("@google/genai");

// Get API Key from Environment Variables
const API_KEY = process.env.API_KEY; 

// Helper to clean Markdown code blocks from JSON response
const cleanJson = (text) => {
    if (!text) return "{}";
    // Remove ```json ... ``` or ``` ... ```
    let clean = text.replace(/```json/g, "").replace(/```/g, "");
    return clean.trim();
};

exports.geminiGateway = onCall({ cors: true, timeoutSeconds: 60, memory: '1GiB' }, async (request) => {
  // 1. Authenticate
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Yêu cầu đăng nhập để sử dụng tính năng này.');
  }

  if (!API_KEY) {
    throw new HttpsError('failed-precondition', 'API Key chưa được cấu hình trên server (Backend).');
  }

  const { action, payload } = request.data;
  const ai = new GoogleGenAI({ apiKey: API_KEY });
  const modelId = 'gemini-3-flash-preview';

  try {
    let responseText = '';

    switch (action) {
      case 'chatWithData': {
        const { query, contextData, history } = payload;
        const systemInstruction = `
          Bạn là TuanChom, trợ lý AI cao cấp của Prudential.
          DỮ LIỆU CỦA BẠN (JSON): ${JSON.stringify(contextData)}
          QUY TẮC: Chỉ đề xuất sản phẩm 'Đang bán' (ACTIVE). Không dùng bảng Markdown. Trả lời ngắn gọn.
        `;
        
        // Ensure history is valid
        const validHistory = Array.isArray(history) ? history : [];

        const chat = ai.chats.create({
            model: modelId,
            config: { systemInstruction, temperature: 0.2 },
            history: validHistory
        });
        
        const result = await chat.sendMessage({ message: query });
        responseText = result.text;
        break;
      }

      case 'extractTextFromPdf': {
        const { mimeType, data } = payload;
        const response = await ai.models.generateContent({
            model: modelId,
            contents: {
                parts: [
                    { inlineData: { mimeType, data } },
                    { text: "Chuyển đổi toàn bộ nội dung PDF thành văn bản thuần. Giữ nguyên cấu trúc." }
                ]
            }
        });
        responseText = response.text;
        break;
      }

      case 'consultantChat': {
        const { query, customer, roleplayMode, planResult, chatStyle, history } = payload;
        const customerProfile = `KH: ${customer.fullName}, Job: ${customer.job}, Tính cách: ${customer.analysis?.personality}`;
        let systemInstruction = '';
        
        if (roleplayMode === 'consultant') {
            systemInstruction = `Bạn là Consultant Prudential (MDRT). KH: ${customerProfile}. Style: ${chatStyle}. Nhiệm vụ: Thấu hiểu & Khơi gợi.`;
        } else {
            systemInstruction = `Bạn là Khách hàng ${customer.fullName}. ${customerProfile}. Style: ${chatStyle}. Nhiệm vụ: Đóng vai khách hàng, có thể từ chối.`;
        }
        
        systemInstruction += `\nOUTPUT BẮT BUỘC CUỐI CÙNG: <QUICK_REPLIES>["Gợi ý 1", "Gợi ý 2", "Gợi ý 3"]</QUICK_REPLIES>`;

        const validHistory = Array.isArray(history) ? history : [];

        const chat = ai.chats.create({
            model: modelId,
            config: { systemInstruction, temperature: 0.7 },
            history: validHistory
        });
        
        const result = await chat.sendMessage({ message: query });
        responseText = result.text;
        break;
      }

      case 'generateFinancialAdvice': {
        const { customerName, planResult } = payload;
        const prompt = `Bạn là Chuyên gia Tài chính. Đưa ra 3 câu nhận xét ngắn cho ${customerName} về kế hoạch: Mục tiêu ${planResult.goal}, Thiếu hụt ${planResult.shortfall} VNĐ. Văn phong chuyên nghiệp, cảnh tỉnh nhẹ nhàng.`;
        const response = await ai.models.generateContent({ model: modelId, contents: prompt });
        responseText = response.text;
        break;
      }

      case 'generateIllustration': {
        const { customerInfo, productsContext } = payload;
        const prompt = `
            KHÁCH HÀNG: ${customerInfo.fullName}, ${new Date().getFullYear() - customerInfo.birthYear} tuổi, Thu nhập ${customerInfo.incomeYear}, Gia đình: ${customerInfo.familyStatus}.
            DANH SÁCH SẢN PHẨM: ${JSON.stringify(productsContext)}
            NHIỆM VỤ: Gợi ý gói bảo hiểm (Main + Riders) tối ưu.
            OUTPUT JSON ONLY: { "mainProduct": {"productName": "", "sumAssured": 0}, "riders": [{"productName": "", "sumAssured": 0, "plan": ""}], "reasoning": "" }
        `;
        const response = await ai.models.generateContent({
            model: modelId,
            config: { responseMimeType: "application/json", temperature: 0.4 },
            contents: prompt
        });
        responseText = response.text;
        // Clean and Parse
        const cleanText = cleanJson(responseText);
        return { result: JSON.parse(cleanText) };
      }

      // ... Generic Handlers ...
      default:
        if (payload.topic && action === 'generateSocialPost') {
             const prompt = `Viết 3 status BHNT chủ đề ${payload.topic} phong cách ${payload.tone}. Output JSON array.`;
             const res = await ai.models.generateContent({ model: modelId, config: { responseMimeType: "application/json" }, contents: prompt });
             const cleanText = cleanJson(res.text);
             return { result: JSON.parse(cleanText) };
        }
        responseText = "Chức năng chưa được hỗ trợ trên Backend.";
    }

    return { result: responseText };

  } catch (error) {
    console.error(`Gemini Error [${action}]:`, error);
    // Return the actual error message for debugging
    throw new HttpsError('internal', `Lỗi AI Backend: ${error.message}`);
  }
});

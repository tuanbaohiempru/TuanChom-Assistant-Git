
import { httpsCallable } from "firebase/functions";
import { functions } from "./firebaseConfig";
import { AppState, Customer, AgentProfile, Contract, PlanResult } from "../types";

// Helper để gọi Cloud Function
const callGeminiFunction = async (action: string, payload: any): Promise<any> => {
    try {
        const gateway = httpsCallable(functions, 'geminiGateway');
        const result = await gateway({ action, payload });
        return (result.data as any).result;
    } catch (error: any) {
        console.error(`Gemini Cloud Function Error [${action}]:`, error);
        // Extract error message from Firebase Error
        const msg = error.message || "Không thể kết nối với trợ lý AI.";
        throw new Error(msg);
    }
};

// Helper: Ensure history starts with 'user' to satisfy Gemini API requirements
const sanitizeHistory = (history: { role: 'user' | 'model'; parts: { text: string }[] }[]) => {
    const validHistory = [...history];
    // Remove leading model messages (e.g. Welcome messages)
    while (validHistory.length > 0 && validHistory[0].role === 'model') {
        validHistory.shift();
    }
    return validHistory;
};

const prepareContext = (state: AppState) => {
  return {
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
  };
};

export const chatWithData = async (
  query: string, 
  appState: AppState, 
  history: { role: 'user' | 'model'; parts: { text: string }[] }[]
): Promise<string> => {
  try {
    const contextData = prepareContext(appState);
    const cleanHistory = sanitizeHistory(history);
    return await callGeminiFunction('chatWithData', { query, contextData, history: cleanHistory });
  } catch (error) {
    return "Xin lỗi, tôi không thể xử lý yêu cầu lúc này. (Lỗi kết nối AI)";
  }
};

export const extractTextFromPdf = async (file: File): Promise<string> => {
  try {
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

    return await callGeminiFunction('extractTextFromPdf', { 
        mimeType: file.type, 
        data: base64Data 
    });

  } catch (error) {
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
        const cleanHistory = sanitizeHistory(history);
        return await callGeminiFunction('consultantChat', {
            query,
            customer,
            contracts,
            roleplayMode,
            planResult,
            chatStyle,
            history: cleanHistory
        });
    } catch (error) {
        return "Xin lỗi, kết nối bị gián đoạn. Vui lòng thử lại.";
    }
};

export const getObjectionSuggestions = async (
    lastCustomerMessage: string,
    customer: Customer
): Promise<{ label: string; content: string; type: 'empathy' | 'logic' | 'story' }[]> => {
    try {
        const response = await callGeminiFunction('getObjectionSuggestions', { lastCustomerMessage, customer });
        return typeof response === 'string' ? JSON.parse(response) : response;
    } catch (error) {
        return [];
    }
};

export const generateSocialPost = async (
    topic: string,
    tone: string
): Promise<{ title: string; content: string }[]> => {
    try {
        const response = await callGeminiFunction('generateSocialPost', { topic, tone });
        return typeof response === 'string' ? JSON.parse(response) : response;
    } catch (error) {
        return [];
    }
};

export const generateContentSeries = async (
    topic: string
): Promise<{ day: string; type: string; content: string }[]> => {
    try {
        const response = await callGeminiFunction('generateContentSeries', { topic });
        return typeof response === 'string' ? JSON.parse(response) : response;
    } catch (error) {
        return [];
    }
};

export const generateStory = async (
    facts: string,
    emotion: string
): Promise<string> => {
    try {
        return await callGeminiFunction('generateStory', { facts, emotion });
    } catch (error) {
        return "Xin lỗi, không thể sáng tác lúc này.";
    }
};

export const getObjectionAnalysis = async (
    customer: Customer,
    history: { role: 'user' | 'model'; parts: { text: string }[] }[]
): Promise<{ label: string; content: string }[]> => {
    try {
        const cleanHistory = sanitizeHistory(history);
        const response = await callGeminiFunction('getObjectionAnalysis', { customer, history: cleanHistory });
        return typeof response === 'string' ? JSON.parse(response) : response;
    } catch (error) {
        return [];
    }
};

export const generateClaimSupport = async (
    contract: Contract,
    customer: Customer
): Promise<string> => {
    try {
        return await callGeminiFunction('generateClaimSupport', { contract, customer });
    } catch (e) {
        return "Lỗi khi tạo hướng dẫn Claim.";
    }
};

export const generateFinancialAdvice = async (
    customerName: string,
    planResult: PlanResult
): Promise<string> => {
    try {
        return await callGeminiFunction('generateFinancialAdvice', { customerName, planResult });
    } catch (error) {
        return "Hiện chưa thể tạo lời khuyên tự động.";
    }
};

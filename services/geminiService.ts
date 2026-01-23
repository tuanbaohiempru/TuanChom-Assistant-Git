
import { httpsCallable, Functions } from "firebase/functions";
import { functions, isFirebaseReady } from "./firebaseConfig";
import { GoogleGenAI, Type, FunctionDeclaration, Tool, FunctionCall } from "@google/genai";
import { AppState, Customer, AgentProfile, Contract, ProductStatus, PlanResult, Appointment, AppointmentStatus, AppointmentType, InteractionType, TimelineItem, IssuanceType, Gender } from "../types";
import { addData, updateData, COLLECTIONS } from "./db";
import { HTVK_BENEFITS } from "../data/pruHanhTrangVuiKhoe";

// --- CONFIGURATION ---
const getApiKey = (): string => {
    const envKey = process.env.API_KEY as string | undefined;
    if (envKey && typeof envKey === 'string' && envKey.length > 0) return envKey;
    return localStorage.getItem('gemini_api_key') || '';
};

const apiKey = getApiKey();
const clientAI = apiKey ? new GoogleGenAI({ apiKey }) : null;
let isServerAvailable = isFirebaseReady;

const DEFAULT_MODEL = 'gemini-3-flash-preview'; 
const VISION_MODEL = 'gemini-2.5-flash-image';

// --- SYSTEM PROMPTS (THE BRAINS) ---
const PROMPTS = {
    // 0. VAI TRÒ: BỘ ĐIỀU PHỐI (ROUTER) - PHASE 2
    ROUTER: `
    VAI TRÒ: Bạn là AI Router - Bộ phân loại ý định người dùng.
    NHIỆM VỤ: Phân tích câu hỏi đầu vào và quyết định AI chuyên gia nào sẽ xử lý tốt nhất.
    
    CÁC CHUYÊN GIA:
    1. "EXPERT": Các câu hỏi về dữ liệu, tra cứu hợp đồng, quyền lợi sản phẩm, tính toán phí, luật bảo hiểm. (VD: "Phí đóng bao nhiêu?", "Hợp đồng này còn hiệu lực không?")
    2. "COACH": Các câu hỏi về kỹ năng mềm, xử lý từ chối, tâm lý khách hàng, roleplay. (VD: "Khách chê đắt quá", "Làm sao để mở lời?")
    3. "CREATOR": Yêu cầu viết nội dung, status Facebook, email, kể chuyện, marketing. (VD: "Viết bài chúc mừng sinh nhật", "Viết status về ung thư")
    4. "ADMIN": Các mệnh lệnh hành động cụ thể như đặt lịch, lưu ghi chú, tìm kiếm thông tin cá nhân. (VD: "Lưu lịch hẹn", "Tìm sđt của khách A")

    OUTPUT JSON: { "target": "EXPERT" | "COACH" | "CREATOR" | "ADMIN", "reason": "Lý do chọn" }
    `,

    // 1. VAI TRÒ: THƯ KÝ & QUẢN TRỊ (Xử lý dữ liệu thô, giọng nói)
    ADMIN: `
    VAI TRÒ: Bạn là "Admin" - Thư ký số hóa dữ liệu.
    NHIỆM VỤ: Phân tích văn bản/giọng nói để trích xuất dữ liệu chính xác hoặc thực hiện Tool Call.
    
    KỸ NĂNG:
    - Nhận diện ngày tháng thông minh.
    - Fuzzy matching tên khách hàng.
    - Gọi function 'save_interaction' hoặc 'create_appointment' nếu người dùng yêu cầu lưu trữ.
    `,

    // 2. VAI TRÒ: CHUYÊN GIA NGHIỆP VỤ (Tra cứu, Hợp đồng, Sản phẩm)
    EXPERT: `
    VAI TRÒ: Bạn là "TuanChom" - Chuyên gia Nghiệp vụ & Sản phẩm Prudential.
    NHIỆM VỤ: Hỗ trợ tra cứu thông tin hợp đồng, quyền lợi sản phẩm và điều khoản loại trừ dựa trên Context được cung cấp.
    
    PHONG CÁCH:
    - Chuyên nghiệp, ngắn gọn, chính xác tuyệt đối theo dữ liệu.
    - Luôn trích dẫn số liệu (Số HĐ, Số tiền bảo hiểm, Ngày đóng phí).
    - Nếu không tìm thấy thông tin trong Context, hãy nói "Tôi không tìm thấy thông tin này trong hồ sơ". KHÔNG ĐƯỢC BỊA RA.
    `,

    // 3. VAI TRÒ: HUẤN LUYỆN VIÊN (Roleplay, Tâm lý, Soft Skills)
    COACH: `
    VAI TRÒ: Bạn là "SUSAM" - Siêu Trợ lý MDRT & Chuyên gia Tâm lý hành vi.
    NHIỆM VỤ: Tư vấn cách ứng xử, kỹ năng bán hàng, hoặc đóng vai khách hàng để luyện tập.
    
    PHONG CÁCH:
    - Sắc sảo, thấu cảm, truyền cảm hứng.
    - Đưa ra lời khuyên thực chiến (Actionable advice).
    - Cấu trúc phản hồi: Insight -> Action -> Script mẫu.
    `,

    // 4. VAI TRÒ: SÁNG TẠO NỘI DUNG (Marketing)
    CREATOR: `
    VAI TRÒ: Bạn là Chuyên gia Content Marketing ngành Bảo hiểm.
    NHIỆM VỤ: Viết bài đăng Facebook, Zalo, Storytelling thu hút.
    PHONG CÁCH: Tùy biến (Hài hước, Cảm động, Chuyên gia) nhưng phải tuân thủ đạo đức nghề nghiệp.
    `
};

// --- TOOL DEFINITIONS ---
const saveInteractionTool: FunctionDeclaration = {
    name: 'save_interaction',
    description: 'Lưu lịch sử tương tác, ghi chú hoặc kết quả cuộc gọi vào hồ sơ khách hàng.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            customerId: { type: Type.STRING, description: 'ID của khách hàng.' },
            content: { type: Type.STRING, description: 'Nội dung chi tiết.' },
            type: { type: Type.STRING, description: 'Loại: Ghi chú, Cuộc gọi, Gặp mặt, Chat Zalo.' },
            title: { type: Type.STRING, description: 'Tiêu đề ngắn gọn.' }
        },
        required: ['customerId', 'content', 'type', 'title']
    }
};

const createAppointmentTool: FunctionDeclaration = {
    name: 'create_appointment',
    description: 'Tạo lịch hẹn mới hoặc lịch nhắc việc.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            customerId: { type: Type.STRING, description: 'ID của khách hàng.' },
            customerName: { type: Type.STRING, description: 'Tên khách hàng.' },
            date: { type: Type.STRING, description: 'Ngày hẹn YYYY-MM-DD.' },
            time: { type: Type.STRING, description: 'Giờ hẹn HH:mm.' },
            type: { type: Type.STRING, description: 'Loại: Tư vấn, Gọi chăm sóc, Nhắc phí, Sinh nhật.' },
            note: { type: Type.STRING, description: 'Ghi chú.' }
        },
        required: ['customerId', 'date', 'type']
    }
};

const appTools: Tool[] = [{ functionDeclarations: [saveInteractionTool, createAppointmentTool] }];

// --- HELPER FUNCTIONS ---

const executeTool = async (functionCall: FunctionCall, appState: AppState): Promise<any> => {
    const { name, args } = functionCall;
    console.log(`🛠️ Tool Call: ${name}`, args);

    try {
        if (name === 'save_interaction') {
            const { customerId, content, type, title } = args as any;
            const customer = appState.customers.find(c => c.id === customerId);
            if (!customer) return { result: "Error: Customer not found." };

            const newItem: TimelineItem = {
                id: Date.now().toString(),
                date: new Date().toISOString(),
                type: type as InteractionType || InteractionType.NOTE,
                title: title || 'Ghi chú AI',
                content: content,
                result: 'Auto-saved'
            };
            await updateData(COLLECTIONS.CUSTOMERS, customerId, {
                ...customer,
                timeline: [newItem, ...(customer.timeline || [])],
                interactionHistory: [`${new Date().toLocaleDateString()}: ${title}`, ...(customer.interactionHistory || [])]
            });
            return { result: "Đã lưu ghi chú thành công." };
        }

        if (name === 'create_appointment') {
            const { customerId, customerName, date, time, type, note } = args as any;
            await addData(COLLECTIONS.APPOINTMENTS, {
                id: '',
                customerId,
                customerName: customerName || 'Khách hàng',
                date: date || new Date().toISOString().split('T')[0],
                time: time || '09:00',
                type: type as AppointmentType || AppointmentType.OTHER,
                status: AppointmentStatus.UPCOMING,
                note: note || 'Đặt bởi AI'
            });
            return { result: `Đã tạo lịch hẹn ngày ${date} lúc ${time}.` };
        }
        return { result: `Tool ${name} not supported.` };
    } catch (e: any) {
        return { result: `Error: ${e.message}` };
    }
};

export const extractPdfText = async (url: string): Promise<string> => {
    if (!isServerAvailable || !functions) return "";
    try {
        const gateway = httpsCallable(functions as Functions, 'geminiGateway', { timeout: 300000 });
        const result: any = await gateway({ endpoint: 'extractText', url });
        return result.data.text || "";
    } catch (e) {
        console.error("PDF Extract Error:", e);
        return "";
    }
};

const callAI = async (payload: any): Promise<any> => {
    // 1. Server-side (Cloud Functions) - Preferred
    if (isServerAvailable && functions) {
        try {
            const gateway = httpsCallable(functions as Functions, 'geminiGateway', { timeout: 300000 });
            const result: any = await gateway(payload);
            return result.data;
        } catch (e) {
            console.warn("Server AI failed, falling back to client.", e);
            isServerAvailable = false;
        }
    }
    // 2. Client-side (Direct API)
    try {
        if (!clientAI) throw new Error("Missing API Key");
        const { model, endpoint, message, history, systemInstruction, tools, contents, config } = payload;
        const modelId = model || DEFAULT_MODEL;
        const finalConfig = { ...config, systemInstruction, tools };

        if (endpoint === 'chat') {
            const chat = clientAI.chats.create({ model: modelId, config: finalConfig, history: history || [] });
            const result = await chat.sendMessage({ message: message || " " });
            return { text: result.text, functionCalls: result.functionCalls };
        } else {
            const result = await clientAI.models.generateContent({ model: modelId, contents: contents, config: finalConfig });
            return { text: result.text, functionCalls: result.functionCalls };
        }
    } catch (e: any) {
        return { text: `AI Error: ${e.message}` };
    }
};

const sanitizeHistory = (history: any[]) => {
    const firstUserIndex = history.findIndex(h => h.role === 'user');
    return firstUserIndex === -1 ? [] : history.slice(firstUserIndex).map(h => ({ role: h.role, parts: [{ text: h.text }] }));
};

const buildContext = (query: string, state: AppState): string => {
    // Basic RAG: Find relevant customers and contracts based on keyword match
    const lowerQuery = query.toLowerCase();
    const relevantCustomers = state.customers.filter(c => {
        return c.fullName.toLowerCase().includes(lowerQuery) || c.phone.includes(query) || (state.customers.length < 5);
    });

    let context = `\n=== DỮ LIỆU HIỆN TẠI (Được cung cấp cho AI để trả lời chính xác) ===\n`;
    relevantCustomers.forEach(c => {
        context += `Khách: ${c.fullName} (ID:${c.id}, ${new Date().getFullYear() - new Date(c.dob).getFullYear()} tuổi)\n`;
        const contracts = state.contracts.filter(ct => ct.customerId === c.id);
        contracts.forEach(ct => {
            context += ` - HĐ ${ct.contractNumber} (${ct.status}): ${ct.mainProduct.productName} (Phí: ${ct.totalFee.toLocaleString()})\n`;
            if (ct.issuanceType === IssuanceType.CONDITIONAL) context += `   [!] Có thư thỏa thuận: ${ct.exclusionNote}\n`;
            ct.riders.forEach(r => context += `   + Rider: ${r.productName} (Plan: ${r.attributes?.plan || 'N/A'})\n`);
        });
    });
    
    // Inject Product Knowledge (Active Products)
    const activeProducts = state.products.filter(p => p.status === ProductStatus.ACTIVE && p.extractedContent);
    activeProducts.forEach(p => {
        context += `\n--- KIẾN THỨC SẢN PHẨM: ${p.name} ---\n${p.extractedContent?.substring(0, 5000)}...\n`;
    });

    // Inject HTVK Table
    context += `\n--- QUYỀN LỢI THẺ SỨC KHỎE (HTVK) ---\n${JSON.stringify(HTVK_BENEFITS, null, 2)}\n`;

    return context;
};

// --- PHASE 2: ROUTING LOGIC ---
const determineIntent = async (query: string): Promise<'EXPERT' | 'COACH' | 'CREATOR' | 'ADMIN'> => {
    try {
        const result = await callAI({
            endpoint: 'generateContent',
            model: 'gemini-3-flash-preview', // Fast model for routing
            contents: `USER QUERY: "${query}"\n${PROMPTS.ROUTER}`,
            config: { responseMimeType: "application/json", temperature: 0 }
        });
        const json = JSON.parse(result.text);
        console.log("🚦 AI Router Decision:", json);
        return json.target || 'EXPERT';
    } catch (e) {
        console.warn("Router failed, defaulting to EXPERT", e);
        return 'EXPERT';
    }
};

// --- PUBLIC API FUNCTIONS ---

// 1. SMART CHAT (ROUTER -> AGENT)
export const chatWithData = async (query: string, appState: AppState, history: { role: 'user' | 'model'; text: string }[]): Promise<string> => {
    // Phase 2: Route request first
    const targetAgent = await determineIntent(query);
    
    let systemPrompt = '';
    let temperature = 0.5;
    const context = buildContext(query, appState);

    // Dynamic Persona Switching
    switch (targetAgent) {
        case 'COACH':
            systemPrompt = `${PROMPTS.COACH}\nCONTEXT:\n${context}`;
            temperature = 0.7; // Higher creativity for coaching
            break;
        case 'CREATOR':
            systemPrompt = `${PROMPTS.CREATOR}\nCONTEXT:\n${context}`;
            temperature = 0.8; // High creativity for content
            break;
        case 'ADMIN':
            systemPrompt = `${PROMPTS.ADMIN}\nCONTEXT:\n${context}`;
            temperature = 0.1; // Strict for tool calling
            break;
        case 'EXPERT':
        default:
            systemPrompt = `${PROMPTS.EXPERT}\nCONTEXT:\n${context}`;
            temperature = 0.1; // Strict for facts
            break;
    }

    const cleanHistory = sanitizeHistory(history);

    try {
        const response = await callAI({
            endpoint: 'chat',
            model: DEFAULT_MODEL,
            message: query,
            history: cleanHistory,
            systemInstruction: systemPrompt,
            tools: appTools, // All agents have access to tools, but Admin uses them most
            config: { temperature: temperature }
        });

        if (response.functionCalls) {
            const toolResults = await Promise.all(response.functionCalls.map((fc: any) => executeTool(fc, appState)));
            const confirmResponse = await callAI({
                endpoint: 'chat',
                model: DEFAULT_MODEL,
                message: `Tool results: ${JSON.stringify(toolResults)}. Inform user in Vietnamese clearly.`,
                history: [...cleanHistory, { role: 'user', parts: [{ text: query }] }, { role: 'model', parts: [{ functionCall: response.functionCalls[0] }] }],
                systemInstruction: systemPrompt
            });
            return confirmResponse.text;
        }
        
        // Optional: Prefix response with Agent identity for UX (e.g. "[SUSAM]: ...")
        const prefix = targetAgent === 'COACH' ? '🧘 **SUSAM**: ' : targetAgent === 'CREATOR' ? '🎨 **Content**: ' : '';
        return prefix + response.text;

    } catch (e) {
        return "Lỗi kết nối AI.";
    }
};

// 2. VOICE COMMAND (Uses ADMIN Persona directly for speed)
export const processVoiceCommand = async (transcript: string, customers: Customer[]): Promise<any> => {
    const customerList = customers.map(c => `- ${c.fullName} (ID: ${c.id})`).join('\n');
    const today = new Date().toISOString().split('T')[0];
    
    const prompt = `
    ${PROMPTS.ADMIN}
    
    CONTEXT:
    - Hôm nay: ${today}
    - Danh sách KH:
    ${customerList}
    
    INPUT TRANSCRIPT: "${transcript}"
    
    OUTPUT JSON FORMAT:
    {
      "matchCustomerId": "ID found or null",
      "matchCustomerName": "Name found",
      "insights": { "sentiment": "...", "life_event": "...", "opportunity": "..." },
      "actions": [ { "type": "appointment|log|update_info", "data": { ... } } ]
    }
    `;

    try {
        const result = await callAI({
            endpoint: 'generateContent',
            model: DEFAULT_MODEL,
            contents: prompt,
            config: { responseMimeType: "application/json", temperature: 0.1 }
        });
        return JSON.parse(result.text);
    } catch (e) {
        console.error("Voice Error", e);
        return null;
    }
};

// 3. CONSULTANT CHAT (Uses COACH Persona directly)
export const consultantChat = async (
    query: string, customer: Customer, contracts: Contract[], familyContext: any[],
    agentProfile: AgentProfile | null, conversationGoal: string,
    history: { role: 'user' | 'model'; text: string }[],
    roleplayMode: 'consultant' | 'customer' = 'consultant',
    planResult: PlanResult | null = null,
    chatStyle: 'zalo' | 'formal' = 'formal'
): Promise<string> => {
    
    const contractsInfo = contracts.map(c => `- HĐ ${c.contractNumber}: ${c.mainProduct.productName} (${c.status})`).join('\n');
    const rolePrompt = roleplayMode === 'consultant' ? PROMPTS.COACH : `VAI TRÒ: Bạn là KHÁCH HÀNG tên ${customer.fullName}. Tính cách: ${customer.analysis?.personality || 'Khó tính'}. Hãy đưa ra lời từ chối hóc búa.`;

    const systemPrompt = `
    ${rolePrompt}
    
    KHÁCH HÀNG MỤC TIÊU:
    - Tên: ${customer.fullName}
    - Tuổi: ${new Date().getFullYear() - new Date(customer.dob).getFullYear()}
    - Nghề: ${customer.job}
    - Hợp đồng đã có:
    ${contractsInfo}
    
    MỤC TIÊU HỘI THOẠI: ${conversationGoal}
    PHONG CÁCH CHAT: ${chatStyle}
    `;

    const cleanHistory = sanitizeHistory(history);
    const response = await callAI({
        endpoint: 'chat',
        model: DEFAULT_MODEL,
        message: query,
        history: cleanHistory,
        systemInstruction: systemPrompt,
        config: { temperature: 0.7 } 
    });
    return response.text;
};

// 4. MARKETING & CONTENT (Uses CREATOR Persona directly)
export const generateSocialPost = async (topic: string, tone: string): Promise<any[]> => {
    const prompt = `${PROMPTS.CREATOR}\nViết 3 status Facebook về chủ đề: "${topic}". Giọng điệu: ${tone}. Output JSON Array: [{title, content}]`;
    const result = await callAI({
        endpoint: 'generateContent',
        model: DEFAULT_MODEL,
        contents: prompt,
        config: { responseMimeType: "application/json" }
    });
    try { return JSON.parse(result.text); } catch { return []; }
};

export const generateContentSeries = async (topic: string): Promise<any[]> => {
    const prompt = `${PROMPTS.CREATOR}\nLập kế hoạch 5 bài viết nuôi dưỡng khách hàng về: "${topic}". Output JSON Array: [{day, type, content}]`;
    const result = await callAI({
        endpoint: 'generateContent',
        model: DEFAULT_MODEL,
        contents: prompt,
        config: { responseMimeType: "application/json" }
    });
    try { return JSON.parse(result.text); } catch { return []; }
};

export const generateStory = async (facts: string, emotion: string): Promise<string> => {
    const prompt = `${PROMPTS.CREATOR}\nDựa trên dữ kiện: "${facts}". Hãy viết một câu chuyện ngắn cảm động (Storytelling). Cảm xúc: ${emotion}.`;
    const result = await callAI({
        endpoint: 'generateContent',
        model: DEFAULT_MODEL,
        contents: prompt,
        config: { temperature: 0.8 }
    });
    return result.text;
};

// --- UTILS ---
export const analyzeSocialInput = async (input: { text?: string; imageBase64?: string; mimeType?: string }, customerName: string): Promise<any> => {
    const model = input.imageBase64 ? VISION_MODEL : DEFAULT_MODEL;
    const contents = [];
    if (input.text) contents.push({ text: `Status: "${input.text}"` });
    if (input.imageBase64) contents.push({ inlineData: { mimeType: input.mimeType || 'image/jpeg', data: input.imageBase64 } });
    contents.push({ text: `Phân tích dữ liệu MXH của khách hàng ${customerName}. Trả về JSON { lifeEvent, sentiment, suggestedUpdates, messageDraft }.` });

    const result = await callAI({
        endpoint: 'generateContent',
        model: model,
        contents: { parts: contents },
        systemInstruction: PROMPTS.ADMIN,
        config: { responseMimeType: "application/json" }
    });
    try { return JSON.parse(result.text); } catch { return null; }
};

export const getObjectionSuggestions = async (msg: string, customer: Customer): Promise<any[]> => {
    const prompt = `${PROMPTS.COACH}\nKhách hàng ${customer.fullName} vừa nói: "${msg}". Gợi ý 3 cách xử lý. Output JSON Array: [{label, type, content}]`;
    const result = await callAI({
        endpoint: 'generateContent',
        model: DEFAULT_MODEL,
        contents: prompt,
        config: { responseMimeType: "application/json" }
    });
    try { return JSON.parse(result.text); } catch { return []; }
};

export const generateFinancialAdvice = async (customerName: string, planResult: PlanResult): Promise<string> => {
    const prompt = `${PROMPTS.EXPERT}\nNhận xét ngắn về kế hoạch tài chính của ${customerName}. Mục tiêu: ${planResult.goal}. Thiếu hụt: ${planResult.shortfall.toLocaleString()}.`;
    const result = await callAI({ endpoint: 'generateContent', model: DEFAULT_MODEL, contents: prompt });
    return result.text;
};

export const generateClaimSupport = async (contract: Contract, customer: Customer): Promise<string> => {
    const prompt = `${PROMPTS.ADMIN}\nSoạn tin nhắn hướng dẫn thủ tục bồi thường cho HĐ ${contract.contractNumber}.`;
    const result = await callAI({ endpoint: 'generateContent', model: DEFAULT_MODEL, contents: prompt });
    return result.text;
};

export const extractIdentityCard = async (imageBase64: string): Promise<Partial<Customer> | null> => {
    const prompt = `
    VAI TRÒ: OCR Expert cho Căn cước công dân Việt Nam (CCCD).
    NHIỆM VỤ: Trích xuất thông tin chính xác từ hình ảnh CCCD.
    
    YÊU CẦU:
    - Trả về ngày sinh theo định dạng YYYY-MM-DD.
    - Giới tính: Nam hoặc Nữ.
    - Địa chỉ: Lấy địa chỉ thường trú.
    - Nếu không rõ, hãy để trống hoặc ước lượng hợp lý.
    
    OUTPUT JSON:
    {
      "fullName": "Họ và tên in hoa",
      "idCard": "Số CCCD",
      "dob": "YYYY-MM-DD",
      "gender": "Nam/Nữ",
      "companyAddress": "Địa chỉ thường trú",
      "age": number (tính toán từ năm sinh)
    }
    `;

    try {
        const result = await callAI({
            endpoint: 'generateContent',
            model: VISION_MODEL,
            contents: {
                parts: [
                    { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } },
                    { text: prompt }
                ]
            },
            config: { responseMimeType: "application/json" }
        });
        return JSON.parse(result.text);
    } catch (e) {
        console.error("ID Scan Error:", e);
        return null;
    }
};

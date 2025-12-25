
import { GoogleGenAI } from "@google/genai";
import { Product, Illustration, Gender, ContractProduct, ProductType, ProductStatus } from "../types";

interface AIRecommendation {
    mainProduct: {
        productName: string;
        sumAssured: number;
    };
    riders: {
        productName: string;
        sumAssured: number;
        plan?: string;
    }[];
    reasoning: string;
}

export const generateIllustration = async (
    customerInfo: {
        fullName: string;
        birthYear: number;
        gender: Gender;
        incomeYear: number; // VNĐ
        familyStatus: string;
        concerns?: string;
    },
    activeProducts: Product[]
): Promise<Illustration | null> => {
    try {
        const apiKey = process.env.API_KEY;
        if (!apiKey) throw new Error("API Key Missing");

        const ai = new GoogleGenAI({ apiKey });

        // Filter only Active Products
        const productsContext = activeProducts
            .filter(p => p.status === ProductStatus.ACTIVE)
            .map(p => `- [${p.type}] ${p.name}: ${p.description}`)
            .join('\n');

        const systemInstruction = `
            Bạn là Chuyên gia Hoạch định Tài chính Prudential (PruMate).
            
            NHIỆM VỤ:
            Thiết kế một Bảng minh họa quyền lợi bảo hiểm (Gói giải pháp) tối ưu nhất cho khách hàng dựa trên thông tin được cung cấp.

            NGUYÊN TẮC THIẾT KẾ:
            1. **Ngân sách**: Tổng phí bảo hiểm nên nằm trong khoảng 10-15% thu nhập hàng năm của khách hàng.
            2. **Bảo vệ Trụ cột**: Ưu tiên bảo vệ người tạo ra thu nhập chính (Tử vong, TTTBVV).
            3. **Bảo vệ Toàn diện**: Nên kèm theo thẻ sức khỏe (Health Care), Bệnh hiểm nghèo (CI), và Tai nạn (Accident) nếu ngân sách cho phép.
            4. **Sản phẩm**: Chỉ chọn từ danh sách sản phẩm Active bên dưới. Chọn sản phẩm phù hợp nhất với nhu cầu (Vd: Đầu tư, Tích lũy, hay Bảo vệ thuần túy).

            DANH SÁCH SẢN PHẨM ACTIVE CỦA PRUDENTIAL:
            ${productsContext}

            OUTPUT FORMAT (JSON ONLY):
            Trả về một JSON Object duy nhất (không Markdown) với cấu trúc sau:
            {
                "mainProduct": {
                    "productName": "Tên chính xác trong danh sách",
                    "sumAssured": Số_tiền_bảo_hiểm_dự_kiến (Number, VD: 1000000000)
                },
                "riders": [
                    {
                        "productName": "Tên chính xác rider 1",
                        "sumAssured": Số_tiền_bảo_hiểm (Number),
                        "plan": "Tên gói (nếu là thẻ sức khỏe: Cơ bản/Nâng cao/Toàn diện/Hoàn hảo)"
                    }
                ],
                "reasoning": "Giải thích ngắn gọn tại sao chọn gói này (tối đa 3 câu)."
            }
        `;

        const prompt = `
            KHÁCH HÀNG:
            - Họ tên: ${customerInfo.fullName}
            - Năm sinh: ${customerInfo.birthYear} (Tuổi: ${new Date().getFullYear() - customerInfo.birthYear})
            - Giới tính: ${customerInfo.gender}
            - Thu nhập: ${customerInfo.incomeYear.toLocaleString()} VNĐ/năm
            - Gia đình: ${customerInfo.familyStatus}
            - Mối quan tâm: ${customerInfo.concerns || 'Bảo vệ toàn diện & Tích lũy'}
            
            Hãy gợi ý gói sản phẩm.
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            config: {
                systemInstruction: systemInstruction,
                responseMimeType: "application/json",
                temperature: 0.4 // Low temp for more consistent/logical outputs
            },
            contents: prompt
        });

        const text = response.text;
        if (!text) throw new Error("No response from AI");

        const result: AIRecommendation = JSON.parse(text);

        // --- Post-Processing: Calculate Fees locally ---
        // Note: In a real app, this should call the exact calculation engine used in ContractsPage.
        // For now, we will estimate or use simplified logic similar to ContractsPage to make it realistic.
        
        const mainProdRef = activeProducts.find(p => p.name === result.mainProduct.productName);
        let mainFee = 0;
        // Simple estimation if exact calc is complex to replicate here completely without importing everything
        // Assuming ~1.5-2% of SumAssured for Main Product (UL/ILP) roughly
        if (mainProdRef) {
             mainFee = Math.round(result.mainProduct.sumAssured * 0.018); 
        }

        const riders: ContractProduct[] = result.riders.map(r => {
            const riderRef = activeProducts.find(p => p.name === r.productName);
            let riderFee = 0;
            
            if (r.productName.toLowerCase().includes('sức khỏe')) {
                // Health care is roughly fixed based on plan
                if (r.plan?.includes('Toàn diện')) riderFee = 5000000;
                else if (r.plan?.includes('Hoàn hảo')) riderFee = 8000000;
                else riderFee = 3000000;
            } else if (r.productName.toLowerCase().includes('bệnh lý') || r.productName.toLowerCase().includes('hiểm nghèo')) {
                riderFee = Math.round(r.sumAssured * 0.01); // ~1%
            } else if (r.productName.toLowerCase().includes('tai nạn')) {
                riderFee = Math.round(r.sumAssured * 0.003); // ~0.3%
            } else {
                riderFee = Math.round(r.sumAssured * 0.005);
            }

            return {
                productId: riderRef?.id || 'unknown',
                productName: r.productName,
                insuredName: customerInfo.fullName,
                sumAssured: r.sumAssured,
                fee: riderFee,
                attributes: r.plan ? { plan: r.plan } : {}
            };
        });

        const totalFee = mainFee + riders.reduce((sum, r) => sum + r.fee, 0);

        const illustration: Illustration = {
            id: Date.now().toString(),
            customerId: '', // Will be filled by caller
            customerName: customerInfo.fullName,
            createdAt: new Date().toISOString(),
            mainProduct: {
                productId: mainProdRef?.id || 'unknown',
                productName: result.mainProduct.productName,
                insuredName: customerInfo.fullName,
                sumAssured: result.mainProduct.sumAssured,
                fee: mainFee
            },
            riders: riders,
            totalFee: totalFee,
            reasoning: result.reasoning,
            status: 'DRAFT'
        };

        return illustration;

    } catch (error) {
        console.error("AI Advisory Error:", error);
        return null;
    }
};

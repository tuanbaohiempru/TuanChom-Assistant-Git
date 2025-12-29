
import { GoogleGenAI } from "@google/genai";
import { Product, Illustration, Gender, ContractProduct, ProductType, ProductStatus, ProductCalculationType } from "../types";
import { calculateProductFee } from "./productCalculator";
import { HTVKPlan, HTVKPackage } from "../data/pruHanhTrangVuiKhoe";

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
            Bạn là Chuyên gia Hoạch định Tài chính Prudential (TuanChom).
            
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
                        "plan": "Tên gói (Nếu là thẻ sức khỏe hãy chọn một trong: Cơ bản, Nâng cao, Toàn diện, Hoàn hảo)"
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

        // --- Post-Processing: Calculate Fees using REAL Engine ---
        const age = new Date().getFullYear() - customerInfo.birthYear;
        
        // 1. Calculate Main Product Fee
        const mainProdRef = activeProducts.find(p => p.name === result.mainProduct.productName);
        let mainFee = 0;
        
        if (mainProdRef) {
             mainFee = calculateProductFee({
                product: mainProdRef,
                calculationType: mainProdRef.calculationType || ProductCalculationType.FIXED,
                productCode: mainProdRef.code,
                sumAssured: result.mainProduct.sumAssured,
                age: age,
                gender: customerInfo.gender,
                term: 15, // Default term for AI suggestions
                occupationGroup: 1 // Default occupation
             });
        }

        // 2. Calculate Riders Fee
        const riders: ContractProduct[] = result.riders.map(r => {
            const riderRef = activeProducts.find(p => p.name === r.productName);
            let riderFee = 0;
            
            if (riderRef) {
                // Map Plan String from AI to Enum (e.g. "Toàn diện" -> HTVKPlan.TOAN_DIEN)
                // The calculator uses fuzzy matching (removeAccents) so passing string is fine.
                const planString = r.plan || HTVKPlan.NANG_CAO;
                
                riderFee = calculateProductFee({
                    product: riderRef,
                    calculationType: riderRef.calculationType || ProductCalculationType.FIXED,
                    productCode: riderRef.code,
                    sumAssured: r.sumAssured,
                    age: age,
                    gender: customerInfo.gender,
                    term: 15, 
                    occupationGroup: 1,
                    htvkPlan: planString as HTVKPlan,
                    htvkPackage: HTVKPackage.STANDARD
                });
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

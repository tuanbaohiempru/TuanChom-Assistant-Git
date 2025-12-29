
import { httpsCallable } from "firebase/functions";
import { functions } from "./firebaseConfig";
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
        const gateway = httpsCallable(functions, 'geminiGateway');
        
        // Filter only Active Products info to send to backend (minimize payload)
        const productsContext = activeProducts
            .filter(p => p.status === ProductStatus.ACTIVE)
            .map(p => ({ type: p.type, name: p.name, description: p.description }));

        const result = await gateway({ 
            action: 'generateIllustration', 
            payload: { customerInfo, productsContext } 
        });

        const recommendation = (result.data as any).result as AIRecommendation;

        // --- Post-Processing: Calculate Fees locally using Engine ---
        const age = new Date().getFullYear() - customerInfo.birthYear;
        
        // 1. Calculate Main Product Fee
        const mainProdRef = activeProducts.find(p => p.name === recommendation.mainProduct.productName);
        let mainFee = 0;
        
        if (mainProdRef) {
             mainFee = calculateProductFee({
                product: mainProdRef,
                calculationType: mainProdRef.calculationType || ProductCalculationType.FIXED,
                productCode: mainProdRef.code,
                sumAssured: recommendation.mainProduct.sumAssured,
                age: age,
                gender: customerInfo.gender,
                term: 15, // Default term
                occupationGroup: 1 // Default occupation
             });
        }

        // 2. Calculate Riders Fee
        const riders: ContractProduct[] = recommendation.riders.map(r => {
            const riderRef = activeProducts.find(p => p.name === r.productName);
            let riderFee = 0;
            
            if (riderRef) {
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
                productName: recommendation.mainProduct.productName,
                insuredName: customerInfo.fullName,
                sumAssured: recommendation.mainProduct.sumAssured,
                fee: mainFee
            },
            riders: riders,
            totalFee: totalFee,
            reasoning: recommendation.reasoning,
            status: 'DRAFT'
        };

        return illustration;

    } catch (error) {
        console.error("AI Advisory Error:", error);
        return null;
    }
};

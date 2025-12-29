
import { ProjectionConfig } from "../types";

export interface YearProjection {
    year: number;
    age: number;
    premiumPaid: number; // Phí đóng trong năm
    accumulatedPremium: number; // Tổng phí đã đóng
    accountValue: number; // Giá trị tài khoản (Cash Value)
    surrenderValue: number; // Giá trị hoàn lại (thường = AV - phí hủy nếu có)
    deathBenefit: number; // Quyền lợi tử vong (Max(AV, STBH))
}

/**
 * Calculates the cash flow projection for an Investment-Linked Product (UL).
 * This is a SIMULATION for illustration purposes, simplifying complex actuarial math.
 */
export const calculateProjection = (
    currentAge: number,
    annualPremium: number, // Phí đóng hàng năm (Chỉ tính phí SP chính để đầu tư)
    sumAssured: number, // Số tiền bảo hiểm (Mệnh giá)
    paymentTerm: number, // Thời gian đóng phí dự kiến
    interestRate: number, // Lãi suất giả định (ví dụ 0.065)
    config?: ProjectionConfig // Cấu hình sản phẩm (Phí ban đầu, thưởng...)
): YearProjection[] => {
    
    // Default Config if not provided (Generic UL Logic)
    const defaultConfig: ProjectionConfig = {
        defaultInterestRate: 0.05,
        highInterestRate: 0.065,
        // Phí ban đầu thường rất cao ở năm đầu (Prudential style generic)
        initialCharges: {
            1: 0.85, // Năm 1 trừ 85% phí
            2: 0.50, // Năm 2 trừ 50%
            3: 0.20, // Năm 3 trừ 20%
            4: 0.05, // Năm 4 trở đi thấp
        },
        bonuses: [
            { year: 5, rate: 0.10, type: 'PREMIUM_BASED' }, // Thưởng năm 5
            { year: 10, rate: 0.50, type: 'PREMIUM_BASED' },
            { year: 20, rate: 1.00, type: 'PREMIUM_BASED' }
        ]
    };

    const activeConfig = config || defaultConfig;
    const projections: YearProjection[] = [];
    
    let currentAccountValue = 0;
    let totalPremium = 0;

    // Project for 50 years or until age 99
    const projectionYears = Math.min(50, 99 - currentAge);

    for (let i = 1; i <= projectionYears; i++) {
        const age = currentAge + i;
        const isPaying = i <= paymentTerm;
        const premiumIn = isPaying ? annualPremium : 0;
        
        totalPremium += premiumIn;

        // 1. Deduct Initial Allocation Charge (Phí ban đầu)
        // If config doesn't have year, assume 0 charge (100% invest) for later years
        const chargeRate = activeConfig.initialCharges[i] || 0;
        const allocatedAmount = premiumIn * (1 - chargeRate);

        // 2. Add Investment Return (Lãi đầu tư)
        // Simple logic: Interest applies to previous balance + new allocation (averaged)
        // Real actuarial is monthly, here we do annual approximation
        const interest = (currentAccountValue + allocatedAmount) * interestRate;

        // 3. Deduct Cost of Insurance (COI) & Admin Fees
        // Simulation: COI increases with age.
        // Rule of thumb: COI grows exponentially. 
        // Base COI rate per 1000 sum assured risk. Risk = Max(STBH - AV, 0)
        const riskAmount = Math.max(sumAssured - (currentAccountValue + allocatedAmount + interest), 0);
        
        // Mock COI Table (Generic)
        let coiRate = 0.001; // Base 1/1000
        if (age > 40) coiRate = 0.003;
        if (age > 50) coiRate = 0.008;
        if (age > 60) coiRate = 0.015;
        if (age > 70) coiRate = 0.030;

        const coiDeduction = (riskAmount / 1000) * coiRate;
        const adminFee = 40000 * 12; // 40k/tháng quản lý HĐ

        // 4. Add Bonuses
        let bonus = 0;
        const bonusRule = activeConfig.bonuses.find(b => b.year === i);
        if (bonusRule) {
            if (bonusRule.type === 'PREMIUM_BASED') {
                bonus = annualPremium * bonusRule.rate;
            } else {
                bonus = currentAccountValue * bonusRule.rate;
            }
        }

        // 5. Final Calculation
        let endingAV = currentAccountValue + allocatedAmount + interest + bonus - coiDeduction - adminFee;
        
        // Prevent negative AV (Policy Lapse)
        if (endingAV < 0) endingAV = 0;

        currentAccountValue = endingAV;

        // 6. Surrender Value (Often lower than AV in first few years)
        // Generic: Year 1-5 has surrender charge.
        let surrenderChargeRate = 0;
        if (i <= 5) surrenderChargeRate = (6 - i) * 0.2; // Year 1: 100%, Year 5: 20%
        // Simplified: Assuming high initial fee covers most surrender penalty in modern products
        // Let's keep AV ~= SV for simplicity after year 3
        const surrenderValue = i < 3 ? 0 : currentAccountValue; 

        projections.push({
            year: i,
            age: age,
            premiumPaid: premiumIn,
            accumulatedPremium: totalPremium,
            accountValue: Math.round(currentAccountValue),
            surrenderValue: Math.round(surrenderValue),
            deathBenefit: Math.round(Math.max(sumAssured, currentAccountValue))
        });

        // Stop if lapsed
        if (currentAccountValue <= 0 && i > 1) break; 
    }

    return projections;
};

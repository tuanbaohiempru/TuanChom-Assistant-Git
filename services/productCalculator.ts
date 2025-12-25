
import { Gender, ProductCalculationType, Product, FormulaType } from "../types";
import { calculateHanhTrangVuiKhoe, HTVKPlan, HTVKPackage } from "../data/pruHanhTrangVuiKhoe";
import { calculateDauTuVungTien } from "../data/pruDauTuVungTien";

// --- DATA: ACCIDENT RATES (NHÓM NGHỀ) ---
const ACCIDENT_RATES: Record<number, number> = {
    1: 1.74,
    2: 2.18,
    3: 3.05,
    4: 3.92
};

// --- DATA: CUOC SONG BINH AN (Age, Gender) ---
const CSBA_RATES: Record<Gender, Record<number, number>> = {
    [Gender.MALE]: {
        15: 43.28, 20: 49.27, 25: 56.60, 30: 65.99, 35: 77.85, 40: 92.66, 45: 111.17, 50: 135.41, 55: 209.66, 60: 480.77
    },
    [Gender.FEMALE]: {
        15: 45.69, 20: 52.39, 25: 60.35, 30: 69.90, 35: 81.64, 40: 96.01, 45: 113.21, 50: 133.72, 55: 203.83, 60: 467.55
    },
    [Gender.OTHER]: {}
};

// --- DATA: TUONG LAI TUOI SANG (Age, Gender, Term 8-18) ---
const TLTS_RATES: Record<Gender, Record<number, Record<number, number>>> = {
    [Gender.MALE]: {
        30: {
            8: 244.95, 9: 218.98, 10: 198.55, 11: 182.67, 12: 169.45, 13: 158.11, 14: 148.41, 15: 139.52, 16: 132.48, 17: 126.02, 18: 120.45
        },
        35: {
             8: 246.15, 9: 220.23, 10: 199.80, 11: 183.92, 12: 170.75, 13: 159.41, 14: 149.71, 15: 140.87, 16: 133.88, 17: 127.47, 18: 121.95
        }
    },
    [Gender.FEMALE]: {
        30: {
             8: 242.90, 9: 216.96, 10: 196.58, 11: 180.63, 12: 167.44, 13: 156.08, 14: 146.36, 15: 137.49, 16: 130.43, 17: 123.95, 18: 118.34
        }
    },
    [Gender.OTHER]: {}
};

export interface CalculatorParams {
    product?: Product; // Pass the full product object for dynamic calculation
    calculationType: ProductCalculationType;
    productCode?: string;
    sumAssured: number;
    age: number;
    gender: Gender;
    term?: number; 
    occupationGroup?: number; 
    htvkPlan?: HTVKPlan;
    htvkPackage?: HTVKPackage;
}

// --- DYNAMIC ENGINE UTILS ---

// Helper: Remove Vietnamese accents and convert to lowercase for loose matching
// e.g. "Nữ" -> "nu", "Nam" -> "nam", "NAM" -> "nam"
const removeAccents = (str: string) => {
    return str.normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .replace(/đ/g, "d").replace(/Đ/g, "D")
              .toLowerCase()
              .trim();
}

const calculateDynamicFee = (product: Product, params: CalculatorParams): number => {
    if (!product.rateTable || !product.calculationConfig) return 0;

    const { rateTable, calculationConfig } = product;
    const { lookupKeys, resultKey, formulaType } = calculationConfig;

    // Filter the rate table based on configured keys
    const matchedRow = rateTable.find(row => {
        let isMatch = true;

        // 1. Check Age (Strict match)
        if (lookupKeys.age && row[lookupKeys.age] !== undefined) {
            // Convert both to number to be safe against "30" vs 30
            if (Number(row[lookupKeys.age]) !== params.age) isMatch = false;
        }

        // 2. Check Gender (Loose match using removeAccents)
        if (isMatch && lookupKeys.gender && row[lookupKeys.gender] !== undefined) {
            const rowGender = removeAccents(String(row[lookupKeys.gender]));
            
            // Define acceptable variations for Male/Female
            // Note: Since we remove accents, 'nữ' becomes 'nu'
            let targetGenderList: string[] = [];
            
            if (params.gender === Gender.MALE) {
                targetGenderList = ['nam', 'male', 'm', 'trai', '1'];
            } else if (params.gender === Gender.FEMALE) {
                targetGenderList = ['nu', 'female', 'f', 'gai', 'woman', '2'];
            }

            // Check if the row's gender is in our allowed list
            if (!targetGenderList.includes(rowGender)) {
                isMatch = false;
            }
        }

        // 3. Check Term (Strict match)
        if (isMatch && lookupKeys.term && row[lookupKeys.term] !== undefined) {
            if (Number(row[lookupKeys.term]) !== params.term) isMatch = false;
        }

        // 4. Check Occupation (Strict match)
        if (isMatch && lookupKeys.occupation && row[lookupKeys.occupation] !== undefined) {
            if (Number(row[lookupKeys.occupation]) !== params.occupationGroup) isMatch = false;
        }

        // 5. Check Plan (Loose match)
        if (isMatch && lookupKeys.plan && row[lookupKeys.plan] !== undefined) {
            const rowPlan = removeAccents(String(row[lookupKeys.plan]));
            const paramPlan = removeAccents(params.htvkPlan || '');
            if (!rowPlan.includes(paramPlan) && !paramPlan.includes(rowPlan)) isMatch = false;
        }

        // 6. Check Package (Loose match)
        if (isMatch && lookupKeys.package && row[lookupKeys.package] !== undefined) {
             const rowPkg = removeAccents(String(row[lookupKeys.package]));
             const paramPkg = removeAccents(params.htvkPackage || '');
             if (!rowPkg.includes(paramPkg) && !paramPkg.includes(rowPkg)) isMatch = false;
        }

        return isMatch;
    });

    if (!matchedRow) return 0;

    const resultValue = matchedRow[resultKey];
    if (resultValue === undefined) return 0;

    const numericValue = Number(resultValue);
    if (isNaN(numericValue)) return 0;

    // Apply Formula
    if (formulaType === FormulaType.RATE_BASED) {
        // Formula: (STBH / 1000) * Rate
        return Math.round((params.sumAssured / 1000) * numericValue);
    } else if (formulaType === FormulaType.FIXED_FEE) {
        // Formula: Value directly
        return numericValue;
    }

    return 0;
};

// --- MAIN CALCULATOR FUNCTION ---

export const calculateProductFee = (params: CalculatorParams): number => {
    // 1. PRIORITY: USE DYNAMIC ENGINE IF AVAILABLE
    if (params.product?.rateTable && params.product?.calculationConfig && params.product.rateTable.length > 0) {
        return calculateDynamicFee(params.product, params);
    }

    // 2. FALLBACK: USE LEGACY HARDCODED LOGIC
    const { calculationType, productCode, sumAssured, age, gender, term, occupationGroup, htvkPlan, htvkPackage } = params;

    // 1. HANH TRANG VUI KHOE
    if (calculationType === ProductCalculationType.HEALTH_CARE) {
        return calculateHanhTrangVuiKhoe(age, gender, htvkPlan || HTVKPlan.NANG_CAO, htvkPackage || HTVKPackage.STANDARD);
    }

    // 2. TAI NAN (ACCIDENT) - Based on Occupation Group
    if (calculationType === ProductCalculationType.RATE_PER_1000_OCCUPATION) {
        if (!occupationGroup) return 0;
        const rate = ACCIDENT_RATES[occupationGroup] || 0;
        return Math.round((sumAssured / 1000) * rate);
    }

    // 3. SAN PHAM CHINH: TINH PHI THEO TUOI & GIOI TINH
    if (calculationType === ProductCalculationType.RATE_PER_1000_AGE_GENDER) {
        // A. Nhóm Sản Phẩm Liên Kết Đầu Tư
        if (productCode === 'P-DTVT' || productCode === 'P-BVTD' || productCode === 'P-DTLH') {
            return calculateDauTuVungTien(age, gender, sumAssured);
        }

        // B. Nhóm Sản Phẩm Truyền Thống - Default
        const table = CSBA_RATES[gender === Gender.FEMALE ? Gender.FEMALE : Gender.MALE];
        if (!table) return 0;
        
        let rate = table[age];
        if (!rate) {
            const keys = Object.keys(table).map(Number).sort((a,b) => a - b);
            if (keys.length === 0) return 0;
            const closest = keys.reduce((prev, curr) => (Math.abs(curr - age) < Math.abs(prev - age) ? curr : prev));
            rate = table[closest];
        }
        return Math.round((sumAssured / 1000) * rate);
    }

    // 4. TUONG LAI TUOI SANG (Age, Gender, Term)
    if (calculationType === ProductCalculationType.RATE_PER_1000_TERM) {
        if (!term) return 0;
        let table: Record<Gender, Record<number, Record<number, number>>> | undefined = TLTS_RATES; 
        const genderTable = table[gender === Gender.FEMALE ? Gender.FEMALE : Gender.MALE];
        if (!genderTable) return 0;

        let ageRow = genderTable[age];
        if (!ageRow) {
             const keys = Object.keys(genderTable).map(Number).sort((a,b) => a - b);
             const closest = keys.reduce((prev, curr) => (Math.abs(curr - age) < Math.abs(prev - age) ? curr : prev));
             ageRow = genderTable[closest];
        }
        
        const rate = ageRow ? ageRow[term] : 0;
        return Math.round((sumAssured / 1000) * (rate || 0));
    }

    return 0;
};

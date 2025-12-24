
import { Gender } from "../types";

export enum HTVKPlan {
    CO_BAN = 'Cơ bản',
    NANG_CAO = 'Nâng cao',
    TOAN_DIEN = 'Toàn diện', // Has inner variations
    HOAN_HAO = 'Hoàn hảo'    // Has inner variations
}

export enum HTVKPackage {
    STANDARD = 'Chuẩn',
    PLUS_1 = '1 (Có mức miễn thường)',
    PLUS_2 = '2 (Không mức miễn thường)'
}

interface FeeRecord {
    age: number;
    fees: {
        [key: string]: number | { [key in Gender]?: number }; // Fee map
    }
}

// Map fee keys to columns in the Excel/OCR
// Keys: 'co_ban', 'nang_cao', 'toan_dien_1', 'toan_dien_2', 'hoan_hao_1', 'hoan_hao_2'
const FEE_DATA: FeeRecord[] = [
    { age: 0, fees: { nang_cao: 4796000, toan_dien_1: 8386000, toan_dien_2: 15697000, hoan_hao_1: 23071000, hoan_hao_2: 40902000 } },
    { age: 1, fees: { nang_cao: 4796000, toan_dien_1: 8386000, toan_dien_2: 11613000, hoan_hao_1: 23071000, hoan_hao_2: 31216000 } },
    { age: 2, fees: { nang_cao: 4796000, toan_dien_1: 8386000, toan_dien_2: 11613000, hoan_hao_1: 23071000, hoan_hao_2: 31216000 } },
    { age: 3, fees: { nang_cao: 4796000, toan_dien_1: 8386000, toan_dien_2: 11613000, hoan_hao_1: 23071000, hoan_hao_2: 31216000 } },
    { age: 4, fees: { nang_cao: 4796000, toan_dien_1: 8386000, toan_dien_2: 11613000, hoan_hao_1: 23071000, hoan_hao_2: 31216000 } },
    { age: 5, fees: { nang_cao: 1997000, toan_dien_1: 3425000, toan_dien_2: 5747000, hoan_hao_1: 9551000, hoan_hao_2: 15548000 } },
    { age: 6, fees: { co_ban: 1164000, nang_cao: 1997000, toan_dien_1: 3425000, toan_dien_2: 5747000, hoan_hao_1: 9551000, hoan_hao_2: 15548000 } },
    { age: 7, fees: { co_ban: 1164000, nang_cao: 1997000, toan_dien_1: 3425000, toan_dien_2: 5747000, hoan_hao_1: 9551000, hoan_hao_2: 15548000 } },
    { age: 8, fees: { co_ban: 1164000, nang_cao: 1997000, toan_dien_1: 3425000, toan_dien_2: 5747000, hoan_hao_1: 9551000, hoan_hao_2: 15548000 } },
    { age: 9, fees: { co_ban: 1164000, nang_cao: 1997000, toan_dien_1: 3425000, toan_dien_2: 5747000, hoan_hao_1: 9551000, hoan_hao_2: 15548000 } },
    // Age 10-14
    { age: 10, fees: { co_ban: 1038000, nang_cao: 1779000, toan_dien_1: 2862000, toan_dien_2: 4259000, hoan_hao_1: 8356000, hoan_hao_2: 12160000 } },
    { age: 11, fees: { co_ban: 1038000, nang_cao: 1779000, toan_dien_1: 2862000, toan_dien_2: 4259000, hoan_hao_1: 8356000, hoan_hao_2: 12160000 } },
    { age: 12, fees: { co_ban: 1038000, nang_cao: 1779000, toan_dien_1: 2862000, toan_dien_2: 4259000, hoan_hao_1: 8356000, hoan_hao_2: 12160000 } },
    { age: 13, fees: { co_ban: 1038000, nang_cao: 1779000, toan_dien_1: 2862000, toan_dien_2: 4259000, hoan_hao_1: 8356000, hoan_hao_2: 12160000 } },
    { age: 14, fees: { co_ban: 1038000, nang_cao: 1779000, toan_dien_1: 2862000, toan_dien_2: 4259000, hoan_hao_1: 8356000, hoan_hao_2: 12160000 } },
    // Age 15-19
    { age: 15, fees: { co_ban: 1038000, nang_cao: 1782000, toan_dien_1: 2890000, toan_dien_2: 4207000, hoan_hao_1: 8368000, hoan_hao_2: 11984000 } },
    { age: 16, fees: { co_ban: 1038000, nang_cao: 1782000, toan_dien_1: 2890000, toan_dien_2: 4207000, hoan_hao_1: 8368000, hoan_hao_2: 11984000 } },
    { age: 17, fees: { co_ban: 1038000, nang_cao: 1782000, toan_dien_1: 2890000, toan_dien_2: 4207000, hoan_hao_1: 8368000, hoan_hao_2: 11984000 } },
    { age: 18, fees: { co_ban: 1038000, nang_cao: 1782000, toan_dien_1: 2890000, toan_dien_2: 4207000, hoan_hao_1: 8368000, hoan_hao_2: 13210000 } }, // Jump in HH2? Using OCR data
    { age: 19, fees: { co_ban: 1038000, nang_cao: 1782000, toan_dien_1: 2890000, toan_dien_2: 4207000, hoan_hao_1: 8368000, hoan_hao_2: 13210000 } },
    // Age 20-24
    { age: 20, fees: { co_ban: 1101000, nang_cao: 1972000, toan_dien_1: 3158000, toan_dien_2: 4475000, hoan_hao_1: 9078000, hoan_hao_2: 12694000 } }, // HH2 decreases?
    { age: 21, fees: { co_ban: 1101000, nang_cao: 1972000, toan_dien_1: 3158000, toan_dien_2: 4475000, hoan_hao_1: 9078000, hoan_hao_2: 13920000 } }, // HH2 increases
    { age: 22, fees: { co_ban: 1101000, nang_cao: 1972000, toan_dien_1: 3158000, toan_dien_2: 4475000, hoan_hao_1: 9078000, hoan_hao_2: 13920000 } },
    { age: 23, fees: { co_ban: 1101000, nang_cao: 1972000, toan_dien_1: 3158000, toan_dien_2: 4475000, hoan_hao_1: 9078000, hoan_hao_2: 13920000 } },
    { age: 24, fees: { co_ban: 1101000, nang_cao: 1972000, toan_dien_1: 3158000, toan_dien_2: 4475000, hoan_hao_1: 9078000, hoan_hao_2: 13920000 } },
    // Age 25-29
    { age: 25, fees: { co_ban: 1379000, nang_cao: 2454000, toan_dien_1: 4204000, toan_dien_2: 5598000, hoan_hao_1: 11867000, hoan_hao_2: 16892000 } },
    { age: 26, fees: { co_ban: 1379000, nang_cao: 2454000, toan_dien_1: 4204000, toan_dien_2: 5598000, hoan_hao_1: 11867000, hoan_hao_2: 16892000 } },
    { age: 27, fees: { co_ban: 1379000, nang_cao: 2454000, toan_dien_1: 4204000, toan_dien_2: 5598000, hoan_hao_1: 11867000, hoan_hao_2: 16892000 } },
    { age: 28, fees: { co_ban: 1379000, nang_cao: 2454000, toan_dien_1: 4204000, toan_dien_2: 5598000, hoan_hao_1: 11867000, hoan_hao_2: 16892000 } },
    { age: 29, fees: { co_ban: 1379000, nang_cao: 2454000, toan_dien_1: 4204000, toan_dien_2: 5598000, hoan_hao_1: 11867000, hoan_hao_2: 16892000 } },
    // Age 30-34
    { age: 30, fees: { co_ban: 1379000, nang_cao: 2518000, toan_dien_1: 4240000, toan_dien_2: 5755000, hoan_hao_1: 11973000, hoan_hao_2: 17283000 } }, // Split gender starts here in original but table shows combined? Using OCR column "Hoàn hảo 2 Nam" and "Hoàn hảo 2 Nữ" are identical for age 30
    { age: 31, fees: { co_ban: 1379000, nang_cao: 2518000, toan_dien_1: 4240000, toan_dien_2: 5755000, hoan_hao_1: 11973000, hoan_hao_2: 17283000 } },
    { age: 32, fees: { co_ban: 1379000, nang_cao: 2518000, toan_dien_1: 4240000, toan_dien_2: 5755000, hoan_hao_1: 11973000, hoan_hao_2: 17283000 } },
    { age: 33, fees: { co_ban: 1379000, nang_cao: 2518000, toan_dien_1: 4240000, toan_dien_2: 5755000, hoan_hao_1: 11973000, hoan_hao_2: 17283000 } },
    { age: 34, fees: { co_ban: 1379000, nang_cao: 2518000, toan_dien_1: 4240000, toan_dien_2: 5755000, hoan_hao_1: 11973000, hoan_hao_2: 17283000 } },
    // Age 35-39
    { age: 35, fees: { co_ban: 1482000, nang_cao: 2582000, toan_dien_1: 4276000, toan_dien_2: 5909000, hoan_hao_1: 12078000, hoan_hao_2: 17668000 } },
    { age: 36, fees: { co_ban: 1482000, nang_cao: 2582000, toan_dien_1: 4276000, toan_dien_2: 5909000, hoan_hao_1: 12078000, hoan_hao_2: 17668000 } },
    { age: 37, fees: { co_ban: 1482000, nang_cao: 2582000, toan_dien_1: 4276000, toan_dien_2: 5909000, hoan_hao_1: 12078000, hoan_hao_2: 17668000 } },
    { age: 38, fees: { co_ban: 1482000, nang_cao: 2582000, toan_dien_1: 4276000, toan_dien_2: 5909000, hoan_hao_1: 12078000, hoan_hao_2: 17668000 } },
    { age: 39, fees: { co_ban: 1482000, nang_cao: 2582000, toan_dien_1: 4276000, toan_dien_2: 5909000, hoan_hao_1: 12078000, hoan_hao_2: 17668000 } },
    // Age 40-44
    { age: 40, fees: { co_ban: 1596000, nang_cao: 2705000, toan_dien_1: 4420000, toan_dien_2: 6131000, hoan_hao_1: 12448000, hoan_hao_2: 18224000 } },
    { age: 41, fees: { co_ban: 1596000, nang_cao: 2705000, toan_dien_1: 4420000, toan_dien_2: 6131000, hoan_hao_1: 12448000, hoan_hao_2: 18224000 } },
    { age: 42, fees: { co_ban: 1596000, nang_cao: 2705000, toan_dien_1: 4420000, toan_dien_2: 6131000, hoan_hao_1: 12448000, hoan_hao_2: 18224000 } },
    { age: 43, fees: { co_ban: 1596000, nang_cao: 2705000, toan_dien_1: 4420000, toan_dien_2: 6131000, hoan_hao_1: 12448000, hoan_hao_2: 18224000 } },
    { age: 44, fees: { co_ban: 1596000, nang_cao: 2705000, toan_dien_1: 4420000, toan_dien_2: 6131000, hoan_hao_1: 12448000, hoan_hao_2: 18224000 } },
    // Age 45-49
    { age: 45, fees: { co_ban: 1781000, nang_cao: 3051000, toan_dien_1: 5035000, toan_dien_2: 6937000, hoan_hao_1: 14095000, hoan_hao_2: 20323000 } },
    { age: 46, fees: { co_ban: 1781000, nang_cao: 3051000, toan_dien_1: 5035000, toan_dien_2: 6937000, hoan_hao_1: 14095000, hoan_hao_2: 20323000 } },
    { age: 47, fees: { co_ban: 1781000, nang_cao: 3051000, toan_dien_1: 5035000, toan_dien_2: 6937000, hoan_hao_1: 14095000, hoan_hao_2: 20323000 } },
    { age: 48, fees: { co_ban: 1781000, nang_cao: 3051000, toan_dien_1: 5035000, toan_dien_2: 6937000, hoan_hao_1: 14095000, hoan_hao_2: 20323000 } },
    { age: 49, fees: { co_ban: 1781000, nang_cao: 3051000, toan_dien_1: 5035000, toan_dien_2: 6937000, hoan_hao_1: 14095000, hoan_hao_2: 20323000 } },
    // Age 50-54
    { age: 50, fees: { co_ban: 2068000, nang_cao: 3594000, toan_dien_1: 5999000, toan_dien_2: 7941000, hoan_hao_1: 16672000, hoan_hao_2: 21771000 } },
    { age: 51, fees: { co_ban: 2068000, nang_cao: 3594000, toan_dien_1: 5999000, toan_dien_2: 7941000, hoan_hao_1: 16672000, hoan_hao_2: 21771000 } },
    { age: 52, fees: { co_ban: 2068000, nang_cao: 3594000, toan_dien_1: 5999000, toan_dien_2: 7941000, hoan_hao_1: 16672000, hoan_hao_2: 21771000 } },
    { age: 53, fees: { co_ban: 2068000, nang_cao: 3594000, toan_dien_1: 5999000, toan_dien_2: 7941000, hoan_hao_1: 16672000, hoan_hao_2: 21771000 } },
    { age: 54, fees: { co_ban: 2068000, nang_cao: 3594000, toan_dien_1: 5999000, toan_dien_2: 7941000, hoan_hao_1: 16672000, hoan_hao_2: 21771000 } },
    // Age 55-59
    { age: 55, fees: { co_ban: 3161000, nang_cao: 5642000, toan_dien_1: 9635000, toan_dien_2: 11812000, hoan_hao_1: 26406000, hoan_hao_2: 32062000 } },
    { age: 56, fees: { co_ban: 3161000, nang_cao: 5642000, toan_dien_1: 9635000, toan_dien_2: 11812000, hoan_hao_1: 26406000, hoan_hao_2: 32062000 } },
    { age: 57, fees: { co_ban: 3161000, nang_cao: 5642000, toan_dien_1: 9635000, toan_dien_2: 11812000, hoan_hao_1: 26406000, hoan_hao_2: 32062000 } },
    { age: 58, fees: { co_ban: 3161000, nang_cao: 5642000, toan_dien_1: 9635000, toan_dien_2: 11812000, hoan_hao_1: 26406000, hoan_hao_2: 32062000 } },
    { age: 59, fees: { co_ban: 3161000, nang_cao: 5642000, toan_dien_1: 9635000, toan_dien_2: 11812000, hoan_hao_1: 26406000, hoan_hao_2: 32062000 } },
    // Age 60-64
    { age: 60, fees: { co_ban: 4387000, nang_cao: 7953000, toan_dien_1: 13739000, toan_dien_2: 15966000, hoan_hao_1: 37386000, hoan_hao_2: 43159000 } },
    { age: 61, fees: { co_ban: 4387000, nang_cao: 7953000, toan_dien_1: 13739000, toan_dien_2: 15966000, hoan_hao_1: 37386000, hoan_hao_2: 43159000 } },
    { age: 62, fees: { co_ban: 4387000, nang_cao: 7953000, toan_dien_1: 13739000, toan_dien_2: 15966000, hoan_hao_1: 37386000, hoan_hao_2: 43159000 } },
    { age: 63, fees: { co_ban: 4387000, nang_cao: 7953000, toan_dien_1: 13739000, toan_dien_2: 15966000, hoan_hao_1: 37386000, hoan_hao_2: 43159000 } },
    { age: 64, fees: { co_ban: 4387000, nang_cao: 7953000, toan_dien_1: 13739000, toan_dien_2: 15966000, hoan_hao_1: 37386000, hoan_hao_2: 43159000 } },
    // Age 65-69
    { age: 65, fees: { co_ban: 6102000, nang_cao: 11191000, toan_dien_1: 19493000, toan_dien_2: 21770000, hoan_hao_1: 52772000, hoan_hao_2: 58665000 } },
    { age: 66, fees: { co_ban: 6102000, nang_cao: 11191000, toan_dien_1: 19493000, toan_dien_2: 21770000, hoan_hao_1: 52772000, hoan_hao_2: 58665000 } },
    { age: 67, fees: { co_ban: 6102000, nang_cao: 11191000, toan_dien_1: 19493000, toan_dien_2: 21770000, hoan_hao_1: 52772000, hoan_hao_2: 58665000 } },
    { age: 68, fees: { co_ban: 6102000, nang_cao: 11191000, toan_dien_1: 19493000, toan_dien_2: 21770000, hoan_hao_1: 52772000, hoan_hao_2: 58665000 } },
    { age: 69, fees: { co_ban: 6102000, nang_cao: 11191000, toan_dien_1: 19493000, toan_dien_2: 21770000, hoan_hao_1: 52772000, hoan_hao_2: 58665000 } },
];

export const calculateHanhTrangVuiKhoe = (age: number, gender: Gender, plan: HTVKPlan, packageType: HTVKPackage = HTVKPackage.STANDARD): number => {
    // 1. Find record by age
    // We assume data covers individual ages. If range is needed, can use .find(d => age >= d.min && age <= d.max)
    const record = FEE_DATA.find(d => d.age === age);
    
    if (!record) return 0; // Or return highest age value?

    // 2. Map plan to data key
    let key = '';
    
    if (plan === HTVKPlan.CO_BAN) {
        key = 'co_ban';
    } else if (plan === HTVKPlan.NANG_CAO) {
        key = 'nang_cao';
    } else if (plan === HTVKPlan.TOAN_DIEN) {
        key = packageType === HTVKPackage.PLUS_2 ? 'toan_dien_2' : 'toan_dien_1';
    } else if (plan === HTVKPlan.HOAN_HAO) {
        key = packageType === HTVKPackage.PLUS_2 ? 'hoan_hao_2' : 'hoan_hao_1';
    }

    const feeValue = record.fees[key];

    // 3. Handle Gender Specific Fees (Though in current OCR table they appear same, structure supports difference)
    if (typeof feeValue === 'object') {
        return feeValue[gender] || 0;
    }

    return feeValue || 0;
};

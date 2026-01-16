
import { Gender } from "../types";

export enum HTVKPlan {
    CO_BAN = 'Cơ bản',
    NANG_CAO = 'Nâng cao',
    TOAN_DIEN = 'Toàn diện',
    HOAN_HAO = 'Hoàn hảo'
}

export enum HTVKPackage {
    STANDARD = 'Chuẩn',
    GOI_1 = 'Gói 1',
    GOI_2 = 'Gói 2'
}

// --- UPDATED: STRUCTURED BENEFITS DATA (Source: Brochure 12/2025) ---
export const HTVK_BENEFITS = {
    [HTVKPlan.CO_BAN]: {
        gioi_han_nam: "100 Triệu đồng",
        pham_vi: "Việt Nam",
        noi_tru: {
            tien_giuong: "600.000 đ/ngày (Tối đa 80 ngày/năm)",
            khoa_cham_soc_dac_biet: "1.000.000 đ/ngày (Tối đa 30 ngày/năm)",
            phau_thuat: "12.000.000 đ/lần nằm viện",
            giuong_nguoi_than: "300.000 đ/ngày (Tối đa 30 ngày/năm)",
            phu_cap_nam_vien_cong: "100.000 đ/ngày (Từ ngày thứ 3, tối đa 30 ngày/năm)",
            dieu_tri_ung_thu: "Theo chi phí thực tế (Nội trú & Ngoại trú)"
        },
        ngoai_tru_dac_biet: {
            phau_thuat_ngoai_tru: "1.700.000 đ/năm",
            cap_cuu_tai_nan: "1.700.000 đ/năm",
            loc_than: "Không áp dụng"
        }
    },
    [HTVKPlan.NANG_CAO]: {
        gioi_han_nam: "200 Triệu đồng",
        pham_vi: "Việt Nam",
        noi_tru: {
            tien_giuong: "1.250.000 đ/ngày (Tối đa 80 ngày/năm)",
            khoa_cham_soc_dac_biet: "2.000.000 đ/ngày (Tối đa 30 ngày/năm)",
            phau_thuat: "25.000.000 đ/lần nằm viện",
            giuong_nguoi_than: "625.000 đ/ngày (Tối đa 30 ngày/năm)",
            phu_cap_nam_vien_cong: "250.000 đ/ngày (Từ ngày thứ 3, tối đa 30 ngày/năm)",
            dieu_tri_ung_thu: "Theo chi phí thực tế (Nội trú & Ngoại trú)"
        },
        ngoai_tru_dac_biet: {
            phau_thuat_ngoai_tru: "3.500.000 đ/năm",
            cap_cuu_tai_nan: "3.500.000 đ/năm",
            loc_than: "Không áp dụng"
        }
    },
    [HTVKPlan.TOAN_DIEN]: {
        gioi_han_nam: "400 Triệu đồng",
        pham_vi: "Việt Nam",
        noi_tru: {
            tien_giuong: "2.000.000 đ/ngày (Tối đa 80 ngày/năm)",
            khoa_cham_soc_dac_biet: "4.000.000 đ/ngày (Tối đa 30 ngày/năm)",
            phau_thuat: "50.000.000 đ/lần nằm viện",
            giuong_nguoi_than: "1.000.000 đ/ngày (Tối đa 30 ngày/năm)",
            phu_cap_nam_vien_cong: "500.000 đ/ngày (Từ ngày thứ 3, tối đa 30 ngày/năm)",
            dieu_tri_ung_thu: "Theo chi phí thực tế (Nội trú & Ngoại trú)"
        },
        ngoai_tru_dac_biet: {
            phau_thuat_ngoai_tru: "10.000.000 đ/năm",
            cap_cuu_tai_nan: "4.000.000 đ/năm",
            loc_than: "10.000.000 đ/năm"
        },
        quyen_loi_bo_sung: "Có thể mua thêm: Ngoại trú (12Tr/năm), Nha khoa (5Tr/năm)"
    },
    [HTVKPlan.HOAN_HAO]: {
        gioi_han_nam: "1 Tỷ đồng",
        pham_vi: "Đông Nam Á",
        noi_tru: {
            tien_giuong: "6.000.000 đ/ngày (Tối đa 80 ngày/năm)",
            khoa_cham_soc_dac_biet: "12.000.000 đ/ngày (Tối đa 30 ngày/năm)",
            phau_thuat: "100.000.000 đ/lần nằm viện",
            giuong_nguoi_than: "2.500.000 đ/ngày (Tối đa 30 ngày/năm)",
            phu_cap_nam_vien_cong: "1.000.000 đ/ngày (Từ ngày thứ 3, tối đa 30 ngày/năm)",
            dieu_tri_ung_thu: "Theo chi phí thực tế (Nội trú & Ngoại trú)"
        },
        ngoai_tru_dac_biet: {
            phau_thuat_ngoai_tru: "50.000.000 đ/năm",
            cap_cuu_tai_nan: "15.000.000 đ/năm",
            loc_than: "50.000.000 đ/năm"
        },
        quyen_loi_bo_sung: "Có thể mua thêm: Ngoại trú (40Tr/năm), Nha khoa (20Tr/năm), Thai sản (60Tr/năm)"
    }
};

interface FeeSet {
    co_ban?: number;
    nang_cao?: number;
    toan_dien_1?: number;
    toan_dien_2?: number;
    hoan_hao_1?: number;
    hoan_hao_2_nam?: number;
    hoan_hao_2_nu?: number;
}

// Helper to get fee based on age range logic from PDF
const getFeeByAge = (age: number): FeeSet => {
    // 0 Tuổi (Special case for high risk)
    if (age === 0) return { co_ban: 0, nang_cao: 4796000, toan_dien_1: 8386000, toan_dien_2: 15697000, hoan_hao_1: 23071000, hoan_hao_2_nam: 40902000, hoan_hao_2_nu: 40902000 };
    
    // 1 - 4 Tuổi
    if (age >= 1 && age <= 4) return { co_ban: 0, nang_cao: 4796000, toan_dien_1: 8386000, toan_dien_2: 11613000, hoan_hao_1: 23071000, hoan_hao_2_nam: 31216000, hoan_hao_2_nu: 31216000 };
    
    // 5 Tuổi (Transition)
    if (age === 5) return { co_ban: 0, nang_cao: 1997000, toan_dien_1: 3425000, toan_dien_2: 5747000, hoan_hao_1: 9551000, hoan_hao_2_nam: 15548000, hoan_hao_2_nu: 15548000 };

    // 6 - 9 Tuổi
    if (age >= 6 && age <= 9) return { co_ban: 1164000, nang_cao: 1997000, toan_dien_1: 3425000, toan_dien_2: 5747000, hoan_hao_1: 9551000, hoan_hao_2_nam: 15548000, hoan_hao_2_nu: 15548000 };

    // 10 - 14 Tuổi
    if (age >= 10 && age <= 14) return { co_ban: 1038000, nang_cao: 1779000, toan_dien_1: 2862000, toan_dien_2: 4259000, hoan_hao_1: 8356000, hoan_hao_2_nam: 12160000, hoan_hao_2_nu: 12160000 };

    // 15 - 17 Tuổi
    if (age >= 15 && age <= 17) return { co_ban: 1038000, nang_cao: 1782000, toan_dien_1: 2890000, toan_dien_2: 4207000, hoan_hao_1: 8368000, hoan_hao_2_nam: 11984000, hoan_hao_2_nu: 11984000 };

    // 18 - 19 Tuổi (Female HH2 increases)
    if (age >= 18 && age <= 19) return { co_ban: 1038000, nang_cao: 1782000, toan_dien_1: 2890000, toan_dien_2: 4207000, hoan_hao_1: 8368000, hoan_hao_2_nam: 11984000, hoan_hao_2_nu: 13210000 };

    // 20 - 24 Tuổi
    if (age >= 20 && age <= 24) return { co_ban: 1101000, nang_cao: 1972000, toan_dien_1: 3158000, toan_dien_2: 4475000, hoan_hao_1: 9078000, hoan_hao_2_nam: 12694000, hoan_hao_2_nu: 13920000 };

    // 25 - 29 Tuổi
    if (age >= 25 && age <= 29) return { co_ban: 1379000, nang_cao: 2454000, toan_dien_1: 4204000, toan_dien_2: 5598000, hoan_hao_1: 11867000, hoan_hao_2_nam: 15666000, hoan_hao_2_nu: 16892000 };

    // 30 - 34 Tuổi
    if (age >= 30 && age <= 34) return { co_ban: 1379000, nang_cao: 2518000, toan_dien_1: 4240000, toan_dien_2: 5755000, hoan_hao_1: 11973000, hoan_hao_2_nam: 16058000, hoan_hao_2_nu: 17283000 };

    // 35 - 39 Tuổi
    if (age >= 35 && age <= 39) return { co_ban: 1482000, nang_cao: 2582000, toan_dien_1: 4276000, toan_dien_2: 5909000, hoan_hao_1: 12078000, hoan_hao_2_nam: 16442000, hoan_hao_2_nu: 17668000 };

    // 40 - 44 Tuổi
    if (age >= 40 && age <= 44) return { co_ban: 1596000, nang_cao: 2705000, toan_dien_1: 4420000, toan_dien_2: 6131000, hoan_hao_1: 12448000, hoan_hao_2_nam: 16998000, hoan_hao_2_nu: 18224000 };

    // 45 - 49 Tuổi
    if (age >= 45 && age <= 49) return { co_ban: 1781000, nang_cao: 3051000, toan_dien_1: 5035000, toan_dien_2: 6937000, hoan_hao_1: 14095000, hoan_hao_2_nam: 19098000, hoan_hao_2_nu: 20323000 };

    // 50 - 54 Tuổi (Gender Fees Merge from here)
    if (age >= 50 && age <= 54) return { co_ban: 2068000, nang_cao: 3594000, toan_dien_1: 5999000, toan_dien_2: 7941000, hoan_hao_1: 16672000, hoan_hao_2_nam: 21771000, hoan_hao_2_nu: 21771000 };

    // 55 - 59 Tuổi
    if (age >= 55 && age <= 59) return { co_ban: 3161000, nang_cao: 5642000, toan_dien_1: 9635000, toan_dien_2: 11812000, hoan_hao_1: 26406000, hoan_hao_2_nam: 32062000, hoan_hao_2_nu: 32062000 };

    // 60 - 64 Tuổi
    if (age >= 60 && age <= 64) return { co_ban: 4387000, nang_cao: 7953000, toan_dien_1: 13739000, toan_dien_2: 15966000, hoan_hao_1: 37386000, hoan_hao_2_nam: 43159000, hoan_hao_2_nu: 43159000 };

    // 65 - 69 Tuổi
    if (age >= 65 && age <= 69) return { co_ban: 6102000, nang_cao: 11191000, toan_dien_1: 19493000, toan_dien_2: 21770000, hoan_hao_1: 52772000, hoan_hao_2_nam: 58665000, hoan_hao_2_nu: 58665000 };

    return {};
};

export const calculateHanhTrangVuiKhoe = (age: number, gender: Gender, plan: HTVKPlan, packageType: HTVKPackage = HTVKPackage.STANDARD): number => {
    const fees = getFeeByAge(age);
    
    // 1. Plan: Cơ bản
    if (plan === HTVKPlan.CO_BAN) {
        return fees.co_ban || 0;
    } 
    
    // 2. Plan: Nâng cao
    if (plan === HTVKPlan.NANG_CAO) {
        return fees.nang_cao || 0;
    } 
    
    // 3. Plan: Toàn diện
    if (plan === HTVKPlan.TOAN_DIEN) {
        if (packageType === HTVKPackage.GOI_2) return fees.toan_dien_2 || 0;
        return fees.toan_dien_1 || 0; // Default to Gói 1 if standard or Goi 1 selected
    } 
    
    // 4. Plan: Hoàn hảo
    if (plan === HTVKPlan.HOAN_HAO) {
        if (packageType === HTVKPackage.GOI_2) {
            // Check Gender split for Hoan Hao - Goi 2
            if (gender === Gender.FEMALE) return fees.hoan_hao_2_nu || 0;
            return fees.hoan_hao_2_nam || 0;
        }
        return fees.hoan_hao_1 || 0;
    }

    return 0;
};

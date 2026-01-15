import * as XLSX from 'xlsx';
import { Customer, Contract, Gender, CustomerStatus, FinancialStatus, PersonalityType, ReadinessLevel, ContractStatus, PaymentFrequency, Product, ProductType, ContractProduct, IncomeTrend, RiskTolerance, FinancialPriority, MaritalStatus, FinancialRole } from '../types';

// --- HELPERS ---

// Convert DD/MM/YYYY or MM/DD/YYYY to YYYY-MM-DD
const parseDate = (dateStr: any): string => {
    if (!dateStr) return '';
    if (typeof dateStr === 'number') {
        // Handle Excel Serial Date
        const date = new Date(Math.round((dateStr - 25569) * 86400 * 1000));
        return date.toISOString().split('T')[0];
    }
    if (typeof dateStr === 'string') {
        // Try DD/MM/YYYY
        const parts = dateStr.trim().split(/[\/\-\.]/);
        if (parts.length === 3) {
            // Assume DD/MM/YYYY if first part > 12, else assume ambiguous (default to DD/MM/YYYY for VN)
            return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }
    }
    return '';
};

const normalizeString = (str: any) => {
    return str ? String(str).trim() : '';
};

const normalizeGender = (str: string): Gender => {
    const s = normalizeString(str).toLowerCase();
    if (s.includes('nam') || s.includes('male') || s === 'm') return Gender.MALE;
    if (s.includes('nữ') || s.includes('nu') || s.includes('female') || s === 'f') return Gender.FEMALE;
    return Gender.OTHER;
};

// Helper to match Product Name from Excel to System Product ID
const findProductIdByName = (excelName: string, systemProducts: Product[]): string => {
    if (!excelName) return 'imported_unknown';
    const normalizedExcel = excelName.toLowerCase().replace(/\s+/g, '');
    
    // 1. Try Exact Match
    const exact = systemProducts.find(p => p.name.toLowerCase().replace(/\s+/g, '') === normalizedExcel);
    if (exact) return exact.id;

    // 2. Try Partial Match (Contains)
    const partial = systemProducts.find(p => p.name.toLowerCase().includes(normalizedExcel) || normalizedExcel.includes(p.name.toLowerCase().replace(/\s+/g, '')));
    if (partial) return partial.id;

    return 'imported_unknown'; // Keep unknown if not found
};

// --- EXPORTERS (TEMPLATE) ---

export const downloadTemplate = (type: 'customer' | 'contract') => {
    let headers = [];
    let example = [];
    let filename = '';

    if (type === 'customer') {
        headers = [
            'Họ và tên *', 'Số điện thoại *', 'Ngày sinh (DD/MM/YYYY)', 'Giới tính', 'CCCD', 
            'Nghề nghiệp', 'Địa chỉ', 'Thu nhập (Triệu)', 'Số con', 'Chiều cao (cm)', 'Cân nặng (kg)', 
            'Tiền sử bệnh', 'Ghi chú'
        ];
        example = [
            'Nguyễn Văn A', '0909123456', '20/05/1990', 'Nam', '079090000123', 
            'Nhân viên VP', 'TP.HCM', '20', '2', '170', '65', 
            'Không', 'Khách tiềm năng'
        ];
        filename = 'Mau_Import_Khach_Hang_Chi_Tiet.xlsx';
    } else {
        headers = [
            'Số Hợp Đồng *', 'SĐT Khách Hàng *', 'Loại (Chính/Bổ trợ)', 'Tên Sản Phẩm', 'Mệnh giá / Gói', 
            'Phí (VNĐ)', 'Ngày hiệu lực', 'Ngày đóng phí tới', 'Định kỳ (Năm/Quý)', 'Trạng thái'
        ];
        // Example shows Multi-row structure for Riders
        const exampleData = [
            ['76543210', '0909123456', 'Chính', 'PRU-Đầu Tư Vững Tiến', '1000000000', '20000000', '01/01/2023', '01/01/2024', 'Năm', 'Đang hiệu lực'],
            ['76543210', '0909123456', 'Bổ trợ', 'Bảo hiểm Tai nạn', '500000000', '2000000', '01/01/2023', '01/01/2024', 'Năm', 'Đang hiệu lực'],
            ['76543210', '0909123456', 'Bổ trợ', 'Chăm sóc sức khỏe', 'Toàn diện', '4500000', '01/01/2023', '01/01/2024', 'Năm', 'Đang hiệu lực']
        ];
        
        const ws = XLSX.utils.aoa_to_sheet([headers, ...exampleData]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Template");
        XLSX.writeFile(wb, 'Mau_Import_Hop_Dong_Chi_Tiet.xlsx');
        return;
    }

    const ws = XLSX.utils.aoa_to_sheet([headers, example]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, filename);
};

// --- PARSERS & VALIDATORS ---

export interface ImportResult<T> {
    valid: T[];
    invalid: { row: number; data: any; error: string }[];
}

export const processCustomerImport = async (file: File, existingCustomers: Customer[]): Promise<ImportResult<Customer>> => {
    const data = await readExcelFile(file);
    const valid: Customer[] = [];
    const invalid: any[] = [];
    
    // Map existing phones for quick lookup
    const existingPhones = new Set(existingCustomers.map(c => c.phone.replace(/\D/g, '')));

    data.slice(1).forEach((row: any[], index) => {
        const rowIndex = index + 2; 
        
        const fullName = normalizeString(row[0]);
        const phone = normalizeString(row[1]).replace(/\D/g, ''); 
        
        if (!fullName) {
            invalid.push({ row: rowIndex, data: row, error: "Thiếu tên khách hàng" });
            return;
        }
        if (!phone || phone.length < 9) {
            invalid.push({ row: rowIndex, data: row, error: "SĐT không hợp lệ" });
            return;
        }
        if (existingPhones.has(phone)) {
            invalid.push({ row: rowIndex, data: row, error: "SĐT đã tồn tại" });
            return;
        }

        // Expanded Data Mapping
        const dob = parseDate(row[2]);
        const gender = normalizeGender(row[3]);
        const idCard = normalizeString(row[4]);
        const job = normalizeString(row[5]);
        const address = normalizeString(row[6]);
        const income = normalizeString(row[7]);
        const children = Number(row[8]) || 0;
        const height = Number(row[9]) || 0;
        const weight = Number(row[10]) || 0;
        const history = normalizeString(row[11]);
        const note = normalizeString(row[12]);

        const customer: Customer = {
            id: '', 
            fullName: fullName,
            phone: phone,
            dob: dob,
            gender: gender,
            idCard: idCard,
            job: job,
            occupation: job, // Map job to occupation
            companyAddress: address,
            maritalStatus: MaritalStatus.UNKNOWN, // Default
            financialRole: FinancialRole.INDEPENDENT, // Default
            dependents: children,
            status: CustomerStatus.POTENTIAL,
            interactionHistory: [`Import Excel: ${new Date().toLocaleDateString('vi-VN')}`],
            timeline: [], // Initialize empty timeline
            claims: [],   // Initialize empty claims
            health: { 
                medicalHistory: history, 
                height: height, 
                weight: weight, 
                habits: '' 
            },
            analysis: {
                childrenCount: children,
                incomeEstimate: income ? `${income} triệu` : '',
                financialStatus: FinancialStatus.STABLE,
                insuranceKnowledge: '',
                previousExperience: '',
                keyConcerns: '',
                personality: PersonalityType.ANALYTICAL,
                readiness: ReadinessLevel.COLD,
                
                // Defaults for required fields
                incomeMonthly: income ? Number(income.replace(/\D/g, '')) * 1000000 : 0,
                incomeTrend: IncomeTrend.STABLE,
                projectedIncome3Years: 0,
                monthlyExpenses: 0,
                existingInsurance: {
                    hasLife: false, lifeSumAssured: 0, lifeFee: 0, lifeTermRemaining: 0,
                    hasAccident: false, accidentSumAssured: 0,
                    hasCI: false, ciSumAssured: 0,
                    hasHealthCare: false, healthCareFee: 0,
                    dissatisfaction: ''
                },
                currentPriority: FinancialPriority.PROTECTION,
                futurePlans: '',
                biggestWorry: '',
                pastExperience: '',
                influencer: '',
                buyCondition: '',
                preference: 'Balanced',
                riskTolerance: RiskTolerance.MEDIUM
            }
        };

        if (note) customer.interactionHistory.push(note);

        valid.push(customer);
        existingPhones.add(phone); 
    });

    return { valid, invalid };
};

export const processContractImport = async (
    file: File, 
    existingContracts: Contract[], 
    customers: Customer[],
    systemProducts: Product[] // New param to match IDs
): Promise<ImportResult<Contract>> => {
    const data = await readExcelFile(file);
    const valid: Contract[] = [];
    const invalid: any[] = [];
    
    // Group rows by Contract Number
    const contractGroups = new Map<string, any[]>();
    
    data.slice(1).forEach((row: any[], index) => {
        const contractNumber = normalizeString(row[0]);
        if (!contractNumber) return; // Skip empty rows
        
        if (!contractGroups.has(contractNumber)) {
            contractGroups.set(contractNumber, []);
        }
        contractGroups.get(contractNumber)?.push({ row, rowIndex: index + 2 });
    });

    // Lookup Map for Customer ID
    const customerMap = new Map<string, string>();
    customers.forEach(c => customerMap.set(c.phone.replace(/\D/g, ''), c.id));
    const existingNumbers = new Set(existingContracts.map(c => c.contractNumber));

    // Process each group as ONE contract
    for (const [contractNumber, rows] of contractGroups) {
        // Validation 1: Check Existence
        if (existingNumbers.has(contractNumber)) {
            rows.forEach(r => invalid.push({ row: r.rowIndex, data: r.row, error: "Số HĐ đã tồn tại" }));
            continue;
        }

        // Find Main Product Row (First row marked as 'Chính' or just the first row if unspecified)
        let mainRow = rows.find(r => normalizeString(r.row[2]).toLowerCase().includes('chính'));
        if (!mainRow) mainRow = rows[0]; // Fallback to first row

        const customerPhone = normalizeString(mainRow.row[1]).replace(/\D/g, '');
        if (!customerMap.has(customerPhone)) {
            rows.forEach(r => invalid.push({ row: r.rowIndex, data: r.row, error: `Không tìm thấy KH có SĐT ${customerPhone}` }));
            continue;
        }

        const customerId = customerMap.get(customerPhone)!;
        const customerName = customers.find(c => c.id === customerId)?.fullName || '';

        // Construct Main Product
        const mainProductName = normalizeString(mainRow.row[3]);
        const mainProductId = findProductIdByName(mainProductName, systemProducts);
        const mainSA = Number(mainRow.row[4]) || 0; // If text (Plan), result is NaN -> 0
        
        // Handle "Plan" in Sum Assured column for Health Cards if designated as Main (rare but possible)
        const mainPlan = isNaN(Number(mainRow.row[4])) ? mainRow.row[4] : undefined; 

        // Riders Construction
        const riders: ContractProduct[] = [];
        let totalFee = 0;

        rows.forEach(r => {
            const type = normalizeString(r.row[2]).toLowerCase();
            const pName = normalizeString(r.row[3]);
            const pVal = r.row[4]; // Can be number (SA) or string (Plan)
            const fee = Number(r.row[5]) || 0;
            
            totalFee += fee;

            // If it's NOT the exact same row object as mainRow, treat as Rider
            // OR if explicitly marked as 'Bổ trợ'
            if (r !== mainRow || type.includes('bổ trợ') || type.includes('rider')) {
                const rId = findProductIdByName(pName, systemProducts);
                const isPlan = isNaN(Number(pVal));
                
                riders.push({
                    productId: rId,
                    productName: pName,
                    insuredName: customerName, // Default to owner, user can edit later
                    sumAssured: isPlan ? 0 : Number(pVal),
                    fee: fee,
                    attributes: isPlan ? { plan: pVal } : {}
                });
            }
        });

        // Ensure Main Product Fee is set correctly
        const mainFee = Number(mainRow.row[5]) || 0;

        const contract: Contract = {
            id: '', 
            contractNumber: contractNumber,
            customerId: customerId,
            effectiveDate: parseDate(mainRow.row[6]),
            nextPaymentDate: parseDate(mainRow.row[7]),
            totalFee: totalFee, // Sum of all fees
            paymentFrequency: normalizeString(mainRow.row[8]) === 'Quý' ? PaymentFrequency.QUARTERLY : PaymentFrequency.ANNUAL,
            status: normalizeString(mainRow.row[9]) === 'Mất hiệu lực' ? ContractStatus.LAPSED : ContractStatus.ACTIVE,
            mainProduct: {
                productId: mainProductId,
                productName: mainProductName,
                insuredName: customerName,
                fee: mainFee,
                sumAssured: isNaN(mainSA) ? 0 : mainSA,
                attributes: mainPlan ? { plan: mainPlan } : {}
            },
            riders: riders,
            beneficiary: '',
        };

        valid.push(contract);
    }

    return { valid, invalid };
};

// Internal Helper to read file
const readExcelFile = (file: File): Promise<any[][]> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = e.target?.result;
                const workbook = XLSX.read(data, { type: 'binary' });
                const sheetName = workbook.SheetNames[0];
                const sheet = workbook.Sheets[sheetName];
                const json = XLSX.utils.sheet_to_json(sheet, { header: 1 }); // Header 1 means array of arrays
                resolve(json as any[][]);
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = (err) => reject(err);
        reader.readAsBinaryString(file);
    });
};
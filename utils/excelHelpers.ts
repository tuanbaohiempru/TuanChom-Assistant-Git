import * as XLSX from 'xlsx';
import { Customer, Contract, Gender, CustomerStatus, FinancialStatus, PersonalityType, ReadinessLevel, ContractStatus, PaymentFrequency } from '../types';

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

const normalizeString = (str: string) => {
    return str ? str.toString().trim() : '';
};

const normalizeGender = (str: string): Gender => {
    const s = str.toLowerCase();
    if (s.includes('nam') || s.includes('male')) return Gender.MALE;
    if (s.includes('nữ') || s.includes('nu') || s.includes('female')) return Gender.FEMALE;
    return Gender.OTHER;
};

// --- EXPORTERS (TEMPLATE) ---

export const downloadTemplate = (type: 'customer' | 'contract') => {
    let headers = [];
    let example = [];
    let filename = '';

    if (type === 'customer') {
        headers = ['Họ và tên', 'Số điện thoại', 'Ngày sinh (DD/MM/YYYY)', 'Giới tính', 'CCCD', 'Nghề nghiệp', 'Địa chỉ', 'Thu nhập (Triệu)', 'Ghi chú'];
        example = ['Nguyễn Văn A', '0909123456', '20/05/1990', 'Nam', '079090000123', 'Nhân viên VP', 'TP.HCM', '20', 'Khách tiềm năng'];
        filename = 'Mau_Import_Khach_Hang.xlsx';
    } else {
        headers = ['Số Hợp Đồng', 'SĐT Khách Hàng', 'Tên Khách Hàng', 'Ngày hiệu lực', 'Ngày đóng phí tới', 'Tổng phí (VNĐ)', 'Định kỳ (Năm/Quý)', 'Tên Sản Phẩm Chính', 'Mệnh giá Chính', 'Trạng thái'];
        example = ['76543210', '0909123456', 'Nguyễn Văn A', '01/01/2023', '01/01/2024', '20000000', 'Năm', 'PRU-Chủ Động Cuộc Sống', '1000000000', 'Đang hiệu lực'];
        filename = 'Mau_Import_Hop_Dong.xlsx';
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
        // Excel Row Index (Header is 0, First Data is 1. Display as Row 2, 3...)
        const rowIndex = index + 2; 
        
        const fullName = normalizeString(row[0]);
        const phone = normalizeString(row[1]).replace(/\D/g, ''); // Remove non-digits
        const dobRaw = row[2];
        const genderRaw = normalizeString(row[3]);
        
        // 1. Validation Rules
        if (!fullName) {
            invalid.push({ row: rowIndex, data: row, error: "Thiếu tên khách hàng" });
            return;
        }
        if (!phone || phone.length < 9) {
            invalid.push({ row: rowIndex, data: row, error: "SĐT không hợp lệ" });
            return;
        }
        if (existingPhones.has(phone)) {
            invalid.push({ row: rowIndex, data: row, error: "SĐT đã tồn tại trong hệ thống" });
            return;
        }

        // 2. Data Construction
        const customer: Customer = {
            id: '', // Will be assigned by Firebase
            fullName: fullName,
            phone: phone,
            dob: parseDate(dobRaw),
            gender: normalizeGender(genderRaw),
            idCard: normalizeString(row[4]),
            job: normalizeString(row[5]),
            companyAddress: normalizeString(row[6]),
            status: CustomerStatus.POTENTIAL,
            interactionHistory: [`Import từ Excel ngày ${new Date().toLocaleDateString('vi-VN')}`],
            health: { medicalHistory: '', height: 0, weight: 0, habits: '' },
            analysis: {
                childrenCount: 0,
                incomeEstimate: row[7] ? `${row[7]} triệu` : '',
                financialStatus: FinancialStatus.STABLE,
                insuranceKnowledge: '',
                previousExperience: '',
                keyConcerns: '',
                personality: PersonalityType.ANALYTICAL,
                readiness: ReadinessLevel.COLD
            }
        };

        if (row[8]) customer.interactionHistory.push(row[8]); // Note

        valid.push(customer);
        // Add to temp set to prevent duplicates within the same file
        existingPhones.add(phone); 
    });

    return { valid, invalid };
};

export const processContractImport = async (file: File, existingContracts: Contract[], customers: Customer[]): Promise<ImportResult<Contract>> => {
    const data = await readExcelFile(file);
    const valid: Contract[] = [];
    const invalid: any[] = [];
    
    const existingNumbers = new Set(existingContracts.map(c => c.contractNumber));
    // Create Map for Phone -> CustomerID lookup
    const customerMap = new Map<string, string>();
    customers.forEach(c => customerMap.set(c.phone.replace(/\D/g, ''), c.id));

    data.slice(1).forEach((row: any[], index) => {
        const rowIndex = index + 2;
        
        const contractNumber = normalizeString(row[0]);
        const customerPhone = normalizeString(row[1]).replace(/\D/g, '');
        const effectiveDate = parseDate(row[3]);
        const nextPaymentDate = parseDate(row[4]);
        const totalFee = Number(row[5]) || 0;
        
        // 1. Validation
        if (!contractNumber) {
            invalid.push({ row: rowIndex, data: row, error: "Thiếu số HĐ" });
            return;
        }
        if (existingNumbers.has(contractNumber)) {
            invalid.push({ row: rowIndex, data: row, error: "Số HĐ đã tồn tại" });
            return;
        }
        if (!customerMap.has(customerPhone)) {
             invalid.push({ row: rowIndex, data: row, error: `Không tìm thấy KH có SĐT ${customerPhone}` });
             return;
        }

        // 2. Data Construction
        const customerId = customerMap.get(customerPhone)!;
        const customerName = customers.find(c => c.id === customerId)?.fullName || '';

        const contract: Contract = {
            id: '', 
            contractNumber: contractNumber,
            customerId: customerId,
            effectiveDate: effectiveDate,
            nextPaymentDate: nextPaymentDate,
            totalFee: totalFee,
            paymentFrequency: normalizeString(row[6]) === 'Quý' ? PaymentFrequency.QUARTERLY : PaymentFrequency.ANNUAL,
            status: normalizeString(row[9]) === 'Mất hiệu lực' ? ContractStatus.LAPSED : ContractStatus.ACTIVE,
            mainProduct: {
                productId: 'imported', // Placeholder
                productName: normalizeString(row[7]) || 'Sản phẩm BHNT',
                insuredName: customerName, // Default to owner
                fee: totalFee,
                sumAssured: Number(row[8]) || 0
            },
            riders: [], // Excel simple import doesn't support complex riders yet
            beneficiary: ''
        };

        valid.push(contract);
        existingNumbers.add(contractNumber);
    });

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

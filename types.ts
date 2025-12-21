
export enum CustomerStatus {
  POTENTIAL = 'Tiềm năng',
  ADVISING = 'Đang tư vấn',
  SIGNED = 'Đã tham gia',
}

export enum Gender {
  MALE = 'Nam',
  FEMALE = 'Nữ',
  OTHER = 'Khác'
}

export interface HealthInfo {
  medicalHistory: string;
  height: number; // cm
  weight: number; // kg
  habits: string;
}

// New Enums for Analysis
export enum FinancialStatus {
  STABLE = 'Ổn định, có dư giả',
  JUST_ENOUGH = 'Đủ sống, ít dư',
  STRUGGLING = 'Bấp bênh, lo âu',
  WEALTHY = 'Thượng lưu'
}

export enum PersonalityType {
  ANALYTICAL = 'Phân tích (Cần số liệu, logic)',
  EMOTIONAL = 'Cảm xúc (Cần sự an tâm, tin tưởng)',
  DECISIVE = 'Quyết đoán (Cần trọng tâm, nhanh gọn)',
  CAUTIOUS = 'Thận trọng (Cần chi tiết, so sánh)'
}

export enum ReadinessLevel {
  COLD = 'Chưa sẵn sàng / Phòng thủ',
  WARM = 'Đang cân nhắc / Tìm hiểu',
  HOT = 'Sẵn sàng tham gia'
}

export interface CustomerAnalysis {
  childrenCount: number;
  incomeEstimate: string; // e.g. "20-30 triệu/tháng"
  financialStatus: FinancialStatus;
  insuranceKnowledge: string; // e.g. "Chưa biết gì", "Đã từng mua nhưng hủy"
  previousExperience: string; // Bad or Good experience
  keyConcerns: string; // e.g. "Con cái", "Hưu trí", "Bệnh hiểm nghèo"
  personality: PersonalityType;
  readiness: ReadinessLevel;
}

export interface Customer {
  id: string;
  fullName: string;
  gender: Gender;
  dob: string; // ISO date string
  phone: string;
  idCard: string;
  job: string;
  companyAddress: string;
  health: HealthInfo;
  analysis: CustomerAnalysis; // New Analysis Section
  interactionHistory: string[];
  status: CustomerStatus;
}

export enum ProductType {
  MAIN = 'Sản phẩm chính',
  RIDER = 'Sản phẩm bổ trợ',
  OPERATION = 'Nghiệp vụ bảo hiểm',
}

export interface Product {
  id: string;
  name: string;
  code: string;
  type: ProductType;
  description: string;
  rulesAndTerms: string; 
  pdfUrl?: string; 
}

export interface ContractProduct {
  productId: string;
  productName: string; 
  insuredName: string; 
  fee: number; 
  sumAssured: number; 
}

export enum ContractStatus {
  ACTIVE = 'Đang hiệu lực',
  LAPSED = 'Mất hiệu lực',
  PENDING = 'Chờ thẩm định'
}

export enum PaymentFrequency {
  ANNUAL = 'Năm',
  SEMI_ANNUAL = 'Nửa năm',
  QUARTERLY = 'Quý',
  MONTHLY = 'Tháng'
}

export interface Contract {
  id: string;
  contractNumber: string;
  customerId: string; 
  effectiveDate: string;
  mainProduct: ContractProduct;
  riders: ContractProduct[];
  totalFee: number;
  paymentFrequency: PaymentFrequency; 
  nextPaymentDate: string;
  status: ContractStatus;
}

export enum AppointmentType {
  CONSULTATION = 'Tư vấn',
  CARE_CALL = 'Gọi chăm sóc',
  FEE_REMINDER = 'Nhắc phí',
}

export enum AppointmentStatus {
  UPCOMING = 'Sắp tới',
  COMPLETED = 'Đã hoàn thành',
  CANCELLED = 'Đã hủy',
}

export interface Appointment {
  id: string;
  customerId: string;
  customerName: string;
  date: string; 
  time: string;
  type: AppointmentType;
  status: AppointmentStatus;
  note: string;
}

// --- NEW AGENT PROFILE INTERFACE ---
export interface AgentProfile {
  id?: string;
  fullName: string;
  age: number;
  address: string;
  office: string;
  agentCode: string;
  title: string; // e.g. MDRT, MBA, Chuyên viên cao cấp
  bio: string; // Short self-description
}

export interface AppState {
  customers: Customer[];
  products: Product[];
  contracts: Contract[];
  appointments: Appointment[];
  agentProfile: AgentProfile | null; // Added profile to state
}

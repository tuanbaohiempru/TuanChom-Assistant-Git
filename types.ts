
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

export interface CustomerDocument {
  id: string;
  name: string;
  url: string;
  type: string; // 'image' | 'pdf' | 'other'
  uploadDate: string;
}

// --- NEW RELATIONSHIP TYPES ---
export enum RelationshipType {
  SPOUSE = 'Vợ / Chồng',
  PARENT = 'Bố / Mẹ',
  CHILD = 'Con cái',
  SIBLING = 'Anh / Chị / Em',
  OTHER = 'Khác'
}

export interface CustomerRelationship {
  relatedCustomerId: string;
  relationship: RelationshipType;
}

// --- NEW: FINANCIAL PLANNING RECORD ---
export interface FinancialPlanRecord {
  id: string;
  createdAt: string; // ISO Date
  goal: FinancialGoal;
  inputs: any; // Stores the surveyData state
  result: PlanResult;
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
  analysis: CustomerAnalysis; 
  documents?: CustomerDocument[]; // Digital Cabinet
  relationships?: CustomerRelationship[]; // Family Tree
  financialPlans?: FinancialPlanRecord[]; // Saved Financial Plans
  interactionHistory: string[];
  status: CustomerStatus;
}

export enum ProductType {
  MAIN = 'Sản phẩm chính',
  RIDER = 'Sản phẩm bổ trợ',
  OPERATION = 'Nghiệp vụ bảo hiểm',
}

export enum ProductStatus {
  ACTIVE = 'Đang bán',
  INACTIVE = 'Ngưng bán'
}

// --- UPDATED CALCULATION TYPES ---
export enum ProductCalculationType {
  UL_UNIT_LINK = 'UL_UNIT_LINK', // Tỷ lệ * STBH / 1000 (Đầu tư vững tiến cũ)
  HEALTH_CARE = 'HEALTH_CARE', // Phí cố định theo Tuổi & Gói (Hành trang vui khỏe)
  WAIVER_CI = 'WAIVER_CI', // Tỷ lệ * STBH / 100 (Hỗ trợ đóng phí)
  FIXED = 'FIXED', // Nhập tay hoàn toàn
  RATE_PER_1000_AGE_GENDER = 'RATE_PER_1000_AGE_GENDER', // (STBH / 1000) * Rate[Age][Gender] (Cuộc sống bình an)
  RATE_PER_1000_TERM = 'RATE_PER_1000_TERM', // (STBH / 1000) * Rate[Age][Gender][Term] (Tương lai tươi sáng, Bệnh lý...)
  RATE_PER_1000_OCCUPATION = 'RATE_PER_1000_OCCUPATION', // (STBH / 1000) * Rate[OccupationGroup] (Tai nạn)
}

// --- NEW: DYNAMIC PRODUCT ENGINE TYPES ---
export enum FormulaType {
  RATE_BASED = 'RATE_BASED', // Công thức: (STBH / 1000) * Tỷ lệ (Tra bảng)
  FIXED_FEE = 'FIXED_FEE',   // Công thức: Tra bảng lấy thẳng giá trị (VD: Thẻ sức khỏe)
}

export interface ProductCalculationConfig {
  formulaType: FormulaType;
  // Mapping keys: Tên biến trong hệ thống -> Tên cột trong Excel
  lookupKeys: {
      age?: string;        // Cột Tuổi
      gender?: string;     // Cột Giới tính
      term?: string;       // Cột Thời hạn đóng phí
      occupation?: string; // Cột Nhóm nghề
      plan?: string;       // Cột Chương trình (Plan)
      package?: string;    // Cột Gói (Package - VD: Có/Không miễn thường)
  };
  resultKey: string;       // Cột kết quả (Rate hoặc Fee)
}

// --- NEW: PROJECTION CONFIG (For Cash Flow) ---
export interface ProjectionConfig {
  defaultInterestRate: number; // e.g. 0.05 (5%)
  highInterestRate: number; // e.g. 0.065 (6.5%)
  // Allocation Charge (Phí ban đầu): Map year -> percentage deducted. e.g. {1: 0.85, 2: 0.50 ...}
  initialCharges: Record<number, number>; 
  // Loyalty Bonus (Thưởng): Map year -> percentage of AV or Premium
  bonuses: {
      year: number;
      rate: number; // % of average premium
      type: 'PREMIUM_BASED' | 'ACCOUNT_BASED';
  }[];
}

export interface Product {
  id: string;
  name: string;
  code: string;
  type: ProductType;
  status: ProductStatus; 
  calculationType?: ProductCalculationType; // Legacy support
  description: string;
  rulesAndTerms: string; 
  pdfUrl?: string;
  extractedContent?: string; // New: Contains raw text extracted from PDF
  
  // --- New Dynamic Fields ---
  rateTable?: Record<string, any>[]; // Dữ liệu thô từ Excel
  calculationConfig?: ProductCalculationConfig; // Cấu hình ánh xạ
  projectionConfig?: ProjectionConfig; // Cấu hình dòng tiền
}

export interface ContractProduct {
  productId: string;
  productName: string; 
  insuredName: string; 
  fee: number; 
  sumAssured: number;
  attributes?: {
    plan?: string;
    package?: string;
    paymentTerm?: number; // Thời hạn đóng phí (Năm)
    occupationGroup?: number; // Nhóm nghề (1-4)
    [key: string]: any;
  };
}

export enum ContractStatus {
  ACTIVE = 'Đang hiệu lực',
  LAPSED = 'Mất hiệu lực',
  PENDING = 'Chờ thẩm định',
  MATURED = 'Đáo hạn'
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
  beneficiary?: string; 
}

// --- NEW: ILLUSTRATION INTERFACE ---
export interface Illustration {
  id: string;
  customerId: string;
  customerName: string; // Snapshot
  createdAt: string;
  mainProduct: ContractProduct;
  riders: ContractProduct[];
  totalFee: number;
  reasoning: string; // AI reasoning
  status: 'DRAFT' | 'ACCEPTED' | 'REJECTED' | 'CONVERTED';
  // Snapshot for projection
  projectionSnapshot?: {
      interestRate: number;
      years: number;
      data: any[]; // The projected data
  };
}

export enum AppointmentType {
  CONSULTATION = 'Tư vấn',
  CARE_CALL = 'Gọi chăm sóc',
  FEE_REMINDER = 'Nhắc phí',
  BIRTHDAY = 'Chúc mừng sinh nhật',
  PAPERWORK = 'Hỗ trợ giấy tờ/Claim',
  OTHER = 'Khác'
}

export enum AppointmentStatus {
  UPCOMING = 'Sắp tới',
  COMPLETED = 'Đã hoàn thành',
  CANCELLED = 'Đã hủy',
}

// New Enum for Outcome
export enum AppointmentResult {
  SUCCESS = 'Thành công / Khách quan tâm',
  RESCHEDULE = 'Khách bận / Hẹn lại',
  FAILED = 'Khách từ chối / Không nghe máy',
  DONE = 'Đã xong'
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
  outcome?: AppointmentResult;
  outcomeNote?: string;
}

// --- NEW SALES TARGET INTERFACE ---
export interface SalesTargets {
  weekly: number;   // Mục tiêu tuần
  monthly: number;  // Mục tiêu tháng
  quarterly: number; // Mục tiêu quý
  yearly: number;   // Mục tiêu năm
}

// --- UPDATED AGENT PROFILE INTERFACE ---
export interface AgentProfile {
  id?: string;
  fullName: string;
  age: number;
  address: string;
  phone?: string; // New
  email?: string; // New
  zalo?: string; // New
  facebook?: string; // New
  avatarUrl?: string; // New
  office: string;
  agentCode: string;
  title: string; // e.g. MDRT, MBA, Chuyên viên cao cấp
  bio: string; // Short self-description
  targets?: SalesTargets; // Added Sales Targets
}

// --- NEW MESSAGE TEMPLATE INTERFACE ---
export interface MessageTemplate {
  id: string;
  title: string;
  content: string; // Contains placeholders like {name}, {contract}
  category: 'birthday' | 'payment' | 'care' | 'holiday' | 'other';
  icon?: string;
  color?: string;
}

// --- NEW FINANCIAL PLANNING TYPES ---
export enum FinancialGoal {
  RETIREMENT = 'Hưu trí an nhàn',
  EDUCATION = 'Qũy học vấn cho con',
  PROTECTION = 'Bảo vệ thu nhập (Trụ cột)',
  HEALTH = 'Quỹ dự phòng y tế'
}

export interface PlanResult {
  goal: FinancialGoal;
  requiredAmount: number; // Số tiền mục tiêu (Tương lai hoặc Hiện tại tùy loại)
  currentAmount: number; // Số tiền đã có
  shortfall: number; // Thiếu hụt
  monthlySavingNeeded?: number; // Cần tiết kiệm thêm mỗi tháng
  details: any; // Chi tiết tính toán
}

export interface AppState {
  customers: Customer[];
  products: Product[];
  contracts: Contract[];
  appointments: Appointment[];
  agentProfile: AgentProfile | null;
  messageTemplates: MessageTemplate[]; 
  illustrations: Illustration[]; // Added
}

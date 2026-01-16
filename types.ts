
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

// --- NEW ENUMS FOR CUSTOMER PROFILE ---
export enum MaritalStatus {
  SINGLE = 'Độc thân',
  MARRIED = 'Đã kết hôn',
  DIVORCED = 'Ly hôn',
  WIDOWED = 'Góa',
  UNKNOWN = 'Chưa xác định'
}

export enum FinancialRole {
  MAIN_BREADWINNER = 'Trụ cột chính',
  SHARED_BREADWINNER = 'Đồng trụ cột',
  DEPENDENT = 'Người phụ thuộc',
  INDEPENDENT = 'Độc lập tài chính'
}

export enum IncomeTrend {
  INCREASING = 'Tăng trưởng',
  STABLE = 'Ổn định',
  FLUCTUATING = 'Biến động/Bấp bênh',
  DECREASING = 'Đang giảm'
}

export enum RiskTolerance {
  LOW = 'An toàn / Sợ rủi ro',
  MEDIUM = 'Cân bằng',
  HIGH = 'Mạo hiểm / Lợi nhuận cao'
}

export enum FinancialPriority {
  PROTECTION = 'Bảo vệ (An tâm)',
  ACCUMULATION = 'Tích lũy (Tiết kiệm)',
  INVESTMENT = 'Đầu tư (Sinh lời)'
}

export interface HealthInfo {
  medicalHistory: string;
  height: number; // cm
  weight: number; // kg
  habits: string;
}

// New Enums for Analysis (Legacy support kept where needed)
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

// --- NEW STRUCT FOR ANALYSIS ---
export interface ExistingInsurance {
  hasLife: boolean;
  lifeSumAssured: number;
  lifeFee: number;
  lifeTermRemaining: number;
  
  hasAccident: boolean;
  accidentSumAssured: number;
  
  hasCI: boolean; // Critical Illness
  ciSumAssured: number;
  
  hasHealthCare: boolean;
  healthCareFee: number;

  dissatisfaction: string; // Điểm chưa hài lòng
}

export interface CustomerAnalysis {
  // Legacy fields support
  childrenCount: number; // Số người phụ thuộc (Generalized)
  incomeEstimate?: string; // Legacy field support
  
  // 1. Income & Cashflow
  incomeMonthly: number; // Thu nhập bình quân tháng
  incomeTrend: IncomeTrend;
  projectedIncome3Years: number; // Thu nhập dự kiến 3-5 năm tới
  monthlyExpenses: number; // Dòng tiền chi tiêu
  
  // 2. Existing Insurance
  existingInsurance: ExistingInsurance;

  // 3. Goals
  currentPriority: FinancialPriority;
  futurePlans: string; // Cho con, Hưu trí, Chuyển giao...

  // 4. Psychology & Barriers
  biggestWorry: string; // Lo lắng lớn nhất
  pastExperience: string; // Trải nghiệm cũ
  influencer: string; // Ai ảnh hưởng quyết định
  buyCondition: string; // Điều kiện để đồng ý
  preference: 'Cashflow' | 'Protection' | 'Balanced'; // Quan tâm dòng tiền hay bảo vệ
  riskTolerance: RiskTolerance;
  
  // Legacy
  financialStatus?: FinancialStatus;
  insuranceKnowledge?: string; 
  previousExperience?: string; 
  keyConcerns?: string; 
  personality: PersonalityType;
  readiness: ReadinessLevel;
}

export interface CustomerDocument {
  id: string;
  name: string;
  url: string;
  type: 'image' | 'pdf' | 'other';
  category: 'personal' | 'medical' | 'contract' | 'claim';
  uploadDate: string;
}

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

export interface FinancialPlanRecord {
  id: string;
  createdAt: string; // ISO Date
  goal: FinancialGoal;
  inputs: any; 
  result: PlanResult;
}

// --- CUSTOMER 360: TIMELINE & CLAIMS ---

export enum InteractionType {
  NOTE = 'Ghi chú',
  CALL = 'Cuộc gọi',
  MEETING = 'Gặp mặt',
  ZALO = 'Chat Zalo',
  CLAIM = 'Bồi thường',
  CONTRACT = 'Hợp đồng',
  SYSTEM = 'Hệ thống'
}

export interface TimelineItem {
  id: string;
  date: string; // ISO Date Time
  type: InteractionType;
  title: string;
  content: string;
  result?: string; // e.g. "Khách quan tâm", "Đã chốt"
  attachments?: string[]; // URLs
}

export enum ClaimStatus {
  PENDING = 'Đang xử lý',
  APPROVED = 'Đã chi trả',
  REJECTED = 'Từ chối',
  NEED_INFO = 'Bổ sung hồ sơ'
}

export interface ClaimRecord {
  id: string;
  dateSubmitted: string;
  contractId: string;
  benefitType: string; // Nằm viện, Tai nạn, Bệnh lý...
  amountRequest: number;
  amountPaid: number;
  status: ClaimStatus;
  notes: string;
  documents: CustomerDocument[];
}

export interface Customer {
  id: string;
  fullName: string;
  gender: Gender;
  dob: string; // ISO date string
  maritalStatus: MaritalStatus; // New
  occupation: string; // New
  phone: string;
  idCard: string;
  job: string; // Legacy field, mapped to Occupation in UI
  companyAddress: string;
  financialRole: FinancialRole; // New
  dependents: number; // New
  
  health: HealthInfo;
  analysis: CustomerAnalysis; 
  documents?: CustomerDocument[]; 
  relationships?: CustomerRelationship[]; 
  financialPlans?: FinancialPlanRecord[]; 
  
  // Customer 360 Upgrades
  timeline: TimelineItem[]; // Replaces simple interactionHistory
  claims: ClaimRecord[];
  
  // Legacy support (to avoid breaking old code immediately)
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

export enum ProductCalculationType {
  UL_UNIT_LINK = 'UL_UNIT_LINK', 
  HEALTH_CARE = 'HEALTH_CARE', 
  WAIVER_CI = 'WAIVER_CI', 
  FIXED = 'FIXED', 
  RATE_PER_1000_AGE_GENDER = 'RATE_PER_1000_AGE_GENDER', 
  RATE_PER_1000_TERM = 'RATE_PER_1000_TERM', 
  RATE_PER_1000_OCCUPATION = 'RATE_PER_1000_OCCUPATION', 
}

export enum FormulaType {
  RATE_BASED = 'RATE_BASED', 
  FIXED_FEE = 'FIXED_FEE',   
}

export interface ProductCalculationConfig {
  formulaType: FormulaType;
  lookupKeys: {
      age?: string;        
      gender?: string;     
      term?: string;       
      occupation?: string; 
      plan?: string;       
      package?: string;    
  };
  resultKey: string;       
}

export interface ProjectionConfig {
  defaultInterestRate: number; 
  highInterestRate: number; 
  initialCharges: Record<number, number>; 
  bonuses: {
      year: number;
      rate: number; 
      type: 'PREMIUM_BASED' | 'ACCOUNT_BASED';
  }[];
}

export interface Product {
  id: string;
  name: string;
  code: string;
  type: ProductType;
  status: ProductStatus; 
  calculationType?: ProductCalculationType; 
  description: string;
  rulesAndTerms: string; 
  pdfUrl?: string;
  extractedContent?: string; 
  rateTable?: Record<string, any>[]; 
  calculationConfig?: ProductCalculationConfig; 
  projectionConfig?: ProjectionConfig; 
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
    paymentTerm?: number; 
    occupationGroup?: number; 
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

// --- NEW ENUM FOR UNDERWRITING DECISION ---
export enum IssuanceType {
  STANDARD = 'Phí chuẩn',
  CONDITIONAL = 'Có điều kiện (Tăng phí/Loại trừ)'
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
  
  // Underwriting Details
  issuanceType?: IssuanceType; // Default is STANDARD
  loadingFee?: number; // Số tiền tăng phí
  exclusionNote?: string; // Nội dung loại trừ
  decisionLetterUrl?: string; // Link file thư thỏa thuận
}

export interface Illustration {
  id: string;
  customerId: string;
  customerName: string; 
  createdAt: string;
  mainProduct: ContractProduct;
  riders: ContractProduct[];
  totalFee: number;
  reasoning: string; 
  status: 'DRAFT' | 'ACCEPTED' | 'REJECTED' | 'CONVERTED';
  projectionSnapshot?: {
      interestRate: number;
      years: number;
      data: any[]; 
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

export interface SalesTargets {
  weekly: number;   
  monthly: number;  
  quarterly: number; 
  yearly: number;   
}

export interface AgentProfile {
  id?: string;
  fullName: string;
  age: number;
  address: string;
  phone?: string; 
  email?: string; 
  zalo?: string; 
  facebook?: string; 
  avatarUrl?: string; 
  office: string;
  agentCode: string;
  title: string; 
  bio: string; 
  targets?: SalesTargets; 
}

export interface MessageTemplate {
  id: string;
  title: string;
  content: string; 
  category: 'birthday' | 'payment' | 'care' | 'holiday' | 'other';
  icon?: string;
  color?: string;
}

export enum FinancialGoal {
  RETIREMENT = 'Hưu trí an nhàn',
  EDUCATION = 'Qũy học vấn cho con',
  PROTECTION = 'Bảo vệ thu nhập (Trụ cột)',
  HEALTH = 'Quỹ dự phòng y tế'
}

export interface PlanResult {
  goal: FinancialGoal;
  requiredAmount: number; 
  currentAmount: number; 
  shortfall: number; 
  monthlySavingNeeded?: number; 
  details: any; 
}

export interface AppState {
  customers: Customer[];
  products: Product[];
  contracts: Contract[];
  appointments: Appointment[];
  agentProfile: AgentProfile | null;
  messageTemplates: MessageTemplate[]; 
  illustrations: Illustration[]; 
}

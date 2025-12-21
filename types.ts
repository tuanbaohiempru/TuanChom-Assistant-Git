
export enum CustomerStatus {
  POTENTIAL = 'Tiềm năng',
  ADVISING = 'Đang tư vấn',
  SIGNED = 'Đã tham gia',
}

export interface HealthInfo {
  medicalHistory: string;
  height: number; // cm
  weight: number; // kg
  habits: string;
}

export interface Customer {
  id: string;
  fullName: string;
  dob: string; // ISO date string
  phone: string;
  idCard: string;
  job: string;
  companyAddress: string;
  health: HealthInfo;
  interactionHistory: string[];
  status: CustomerStatus;
  avatarUrl?: string;
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
  rulesAndTerms: string; // The "AI knowledge base" content
}

export interface ContractProduct {
  productId: string;
  productName: string; // Denormalized for display
  insuredName: string; // Who is insured
  fee: number; // Premium
  sumAssured: number; // Coverage Amount (Số tiền bảo hiểm)
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
  customerId: string; // The Policy Owner
  effectiveDate: string;
  mainProduct: ContractProduct;
  riders: ContractProduct[];
  totalFee: number;
  paymentFrequency: PaymentFrequency; // New field
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
  date: string; // ISO date string
  time: string;
  type: AppointmentType;
  status: AppointmentStatus;
  note: string;
}

export interface AppState {
  customers: Customer[];
  products: Product[];
  contracts: Contract[];
  appointments: Appointment[];
}

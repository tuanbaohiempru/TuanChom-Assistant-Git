
import { Customer, CustomerStatus, Product, ProductType, ProductStatus, Contract, ContractStatus, Appointment, AppointmentType, AppointmentStatus, PaymentFrequency, Gender, FinancialStatus, PersonalityType, ReadinessLevel, ProductCalculationType, IncomeTrend, RiskTolerance, FinancialPriority, MaritalStatus, FinancialRole, InteractionType, ClaimStatus } from './types';

export const INITIAL_PRODUCTS: Product[] = [
  {
    id: 'p1',
    name: 'PRU-Cuộc Sống Bình An',
    code: 'P-CSBA',
    type: ProductType.MAIN,
    status: ProductStatus.ACTIVE,
    calculationType: ProductCalculationType.RATE_PER_1000_AGE_GENDER,
    description: 'Bảo vệ tài chính trọn đời trước rủi ro tử vong và thương tật.',
    rulesAndTerms: 'Độ tuổi tham gia từ 15 đến 60 tuổi. Tỷ lệ phí phụ thuộc vào tuổi và giới tính.',
    pdfUrl: ''
  },
  {
    id: 'p2',
    name: 'PRU-Tương Lai Tươi Sáng',
    code: 'P-TLTS',
    type: ProductType.MAIN,
    status: ProductStatus.ACTIVE,
    calculationType: ProductCalculationType.RATE_PER_1000_TERM,
    description: 'Giải pháp tích lũy giáo dục đảm bảo cho tương lai con trẻ.',
    rulesAndTerms: 'Thời hạn đóng phí linh hoạt từ 8 đến 18 năm. Tỷ lệ phí thay đổi theo thời hạn đóng phí.',
    pdfUrl: ''
  },
  {
    id: 'p3',
    name: 'PRU-Đầu Tư Vững Tiến',
    code: 'P-DTVT',
    type: ProductType.MAIN,
    status: ProductStatus.ACTIVE,
    calculationType: ProductCalculationType.RATE_PER_1000_AGE_GENDER,
    description: 'Kết hợp bảo vệ và đầu tư an toàn với lãi suất cam kết.',
    rulesAndTerms: 'Phí bảo hiểm tính theo tỷ lệ phần nghìn dựa trên tuổi và giới tính.',
    pdfUrl: ''
  },
  {
    id: 'p4',
    name: 'PRU-Bảo Vệ Tối Đa',
    code: 'P-BVTD',
    type: ProductType.MAIN,
    status: ProductStatus.ACTIVE,
    calculationType: ProductCalculationType.RATE_PER_1000_AGE_GENDER,
    description: 'Giải pháp bảo vệ toàn diện với quyền lợi bảo vệ cao trước rủi ro.',
    rulesAndTerms: 'Phí bảo hiểm tính theo tỷ lệ phần nghìn dựa trên tuổi và giới tính.',
    pdfUrl: ''
  },
  {
    id: 'p5',
    name: 'PRU-Đầu Tư Linh Hoạt',
    code: 'P-DTLH',
    type: ProductType.MAIN,
    status: ProductStatus.ACTIVE,
    calculationType: ProductCalculationType.RATE_PER_1000_AGE_GENDER,
    description: 'Giải pháp đầu tư linh hoạt, nắm bắt cơ hội tăng trưởng tài sản.',
    rulesAndTerms: 'Phí bảo hiểm tính theo tỷ lệ phần nghìn dựa trên tuổi và giới tính.',
    pdfUrl: ''
  },
  {
    id: 'r1',
    name: 'Bảo hiểm Chăm sóc Sức khỏe Toàn diện',
    code: 'R-HC-01',
    type: ProductType.RIDER,
    status: ProductStatus.ACTIVE,
    calculationType: ProductCalculationType.HEALTH_CARE,
    description: 'Chi trả chi phí y tế nội trú và ngoại trú.',
    rulesAndTerms: 'Thẻ sức khỏe có 4 chương trình: Cơ bản, Nâng cao, Toàn diện, Hoàn hảo.',
    pdfUrl: ''
  },
  {
    id: 'r2',
    name: 'BH Bệnh lý Nghiêm trọng',
    code: 'R-CI-01',
    type: ProductType.RIDER,
    status: ProductStatus.ACTIVE,
    calculationType: ProductCalculationType.RATE_PER_1000_TERM,
    description: 'Bảo vệ trước 77 bệnh lý nghiêm trọng.',
    rulesAndTerms: 'Phí bảo hiểm tính theo tỷ lệ phần nghìn dựa trên tuổi và thời hạn đóng phí (5-30 năm).',
    pdfUrl: ''
  },
  {
    id: 'r3',
    name: 'Bảo hiểm Tai nạn',
    code: 'R-ACC',
    type: ProductType.RIDER,
    status: ProductStatus.ACTIVE,
    calculationType: ProductCalculationType.RATE_PER_1000_OCCUPATION,
    description: 'Bảo vệ trước rủi ro tai nạn 24/7.',
    rulesAndTerms: 'Tỷ lệ phí phụ thuộc vào nhóm nghề nghiệp (1-4). Nhóm 1: Văn phòng, Nhóm 4: Lao động nặng/nguy hiểm.',
    pdfUrl: ''
  },
  {
    id: 'op1',
    name: 'Quy trình Giải quyết Quyền lợi Bảo hiểm (Claim)',
    code: 'OP-CLAIM',
    type: ProductType.OPERATION,
    status: ProductStatus.ACTIVE,
    description: 'Hướng dẫn nộp hồ sơ và thời gian xử lý bồi thường.',
    rulesAndTerms: '1. Thời hạn nộp hồ sơ: Trong vòng 12 tháng...',
    pdfUrl: ''
  },
  {
    id: 'op2',
    name: 'Thời gian cân nhắc 21 ngày',
    code: 'OP-FREELOOK',
    type: ProductType.OPERATION,
    status: ProductStatus.ACTIVE,
    description: 'Quyền lợi dùng thử sản phẩm của khách hàng.',
    rulesAndTerms: 'Khách hàng có 21 ngày cân nhắc kể từ ngày nhận bộ hợp đồng.',
    pdfUrl: ''
  }
];

export const INITIAL_CUSTOMERS: Customer[] = [
  {
    id: 'c1',
    fullName: 'Nguyễn Thị Thanh',
    gender: Gender.FEMALE,
    dob: '1985-05-20',
    phone: '0909123456',
    idCard: '079185000123',
    job: 'Kế toán trưởng',
    occupation: 'Kế toán trưởng',
    companyAddress: 'Vincom Center, Q1, TP.HCM',
    maritalStatus: MaritalStatus.MARRIED,
    financialRole: FinancialRole.SHARED_BREADWINNER,
    dependents: 2,
    health: {
      medicalHistory: 'Đã mổ ruột thừa năm 2010',
      height: 160,
      weight: 55,
      habits: 'Không hút thuốc, uống rượu xã giao'
    },
    analysis: {
      childrenCount: 2,
      incomeEstimate: '30-40 triệu/tháng',
      financialStatus: FinancialStatus.STABLE,
      insuranceKnowledge: 'Hiểu biết cơ bản',
      previousExperience: 'Tích cực',
      keyConcerns: 'Sức khỏe, Tích lũy cho con',
      personality: PersonalityType.ANALYTICAL,
      readiness: ReadinessLevel.HOT,
      // Defaults for new fields
      incomeMonthly: 35000000,
      incomeTrend: IncomeTrend.STABLE,
      projectedIncome3Years: 40000000,
      monthlyExpenses: 20000000,
      existingInsurance: {
        hasLife: false, lifeSumAssured: 0, lifeFee: 0, lifeTermRemaining: 0,
        hasAccident: false, accidentSumAssured: 0,
        hasCI: false, ciSumAssured: 0,
        hasHealthCare: false, healthCareFee: 0,
        dissatisfaction: ''
      },
      currentPriority: FinancialPriority.PROTECTION,
      futurePlans: 'Tích lũy cho con du học',
      biggestWorry: 'Rủi ro bệnh hiểm nghèo',
      pastExperience: 'Đã tham gia BHXH',
      influencer: 'Chồng',
      buyCondition: 'Phí hợp lý, quyền lợi rõ ràng',
      preference: 'Balanced',
      riskTolerance: RiskTolerance.MEDIUM
    },
    interactionHistory: ['2023-01-10: Tư vấn lần đầu', '2023-01-15: Ký hợp đồng'],
    timeline: [
        { id: 't1', date: '2023-01-15T10:00:00', type: InteractionType.CONTRACT, title: 'Ký hợp đồng', content: 'Khách hàng đã ký HĐ 78900123', result: 'Thành công' },
        { id: 't2', date: '2023-01-10T09:00:00', type: InteractionType.MEETING, title: 'Tư vấn lần đầu', content: 'Gặp tại cafe Highland, tư vấn giải pháp hưu trí', result: 'Khách quan tâm' }
    ],
    claims: [],
    status: CustomerStatus.SIGNED
  },
  {
    id: 'c2',
    fullName: 'Trần Văn Ba',
    gender: Gender.MALE,
    dob: '1990-11-12',
    phone: '0912345678',
    idCard: '079190000456',
    job: 'Kỹ sư phần mềm',
    occupation: 'Kỹ sư phần mềm',
    companyAddress: 'Etown, Tân Bình',
    maritalStatus: MaritalStatus.SINGLE,
    financialRole: FinancialRole.INDEPENDENT,
    dependents: 0,
    health: {
      medicalHistory: 'Khỏe mạnh',
      height: 175,
      weight: 70,
      habits: 'Hay thức khuya'
    },
    analysis: {
      childrenCount: 0,
      incomeEstimate: '25 triệu/tháng',
      financialStatus: FinancialStatus.JUST_ENOUGH,
      insuranceKnowledge: 'Chưa biết nhiều',
      previousExperience: 'Chưa từng tham gia',
      keyConcerns: 'Bệnh hiểm nghèo, Tai nạn',
      personality: PersonalityType.ANALYTICAL,
      readiness: ReadinessLevel.WARM,
      // Defaults for new fields
      incomeMonthly: 25000000,
      incomeTrend: IncomeTrend.INCREASING,
      projectedIncome3Years: 35000000,
      monthlyExpenses: 15000000,
      existingInsurance: {
        hasLife: false, lifeSumAssured: 0, lifeFee: 0, lifeTermRemaining: 0,
        hasAccident: false, accidentSumAssured: 0,
        hasCI: false, ciSumAssured: 0,
        hasHealthCare: false, healthCareFee: 0,
        dissatisfaction: ''
      },
      currentPriority: FinancialPriority.ACCUMULATION,
      futurePlans: 'Mua nhà, Lập gia đình',
      biggestWorry: 'Tai nạn xe máy',
      pastExperience: 'Chưa có',
      influencer: 'Bản thân',
      buyCondition: 'Sản phẩm đầu tư sinh lời',
      preference: 'Cashflow',
      riskTolerance: RiskTolerance.HIGH
    },
    interactionHistory: ['2023-05-20: Gặp cafe giới thiệu sản phẩm'],
    timeline: [
        { id: 't3', date: '2023-05-20T14:30:00', type: InteractionType.MEETING, title: 'Giới thiệu sản phẩm', content: 'Giới thiệu dòng Đầu tư linh hoạt', result: 'Cần suy nghĩ thêm' }
    ],
    claims: [],
    status: CustomerStatus.ADVISING
  }
];

export const INITIAL_CONTRACTS: Contract[] = [
  {
    id: 'ct1',
    contractNumber: '78900123',
    customerId: 'c1',
    effectiveDate: '2023-02-01',
    nextPaymentDate: new Date(new Date().setDate(new Date().getDate() + 5)).toISOString().split('T')[0], 
    status: ContractStatus.ACTIVE,
    paymentFrequency: PaymentFrequency.ANNUAL,
    mainProduct: {
      productId: 'p1',
      productName: 'PRU-Cuộc Sống Bình An',
      insuredName: 'Nguyễn Thị Thanh',
      fee: 20000000,
      sumAssured: 1000000000
    },
    riders: [
      {
        productId: 'r1',
        productName: 'Bảo hiểm Chăm sóc Sức khỏe Toàn diện',
        insuredName: 'Nguyễn Thị Thanh',
        fee: 5000000,
        sumAssured: 500000000,
        attributes: { plan: 'Toàn diện', package: 'Chuẩn' }
      }
    ],
    totalFee: 25000000
  }
];

export const INITIAL_APPOINTMENTS: Appointment[] = [
  {
    id: 'a1',
    customerId: 'c2',
    customerName: 'Trần Văn Ba',
    date: new Date().toISOString().split('T')[0], 
    time: '14:00',
    type: AppointmentType.CONSULTATION,
    status: AppointmentStatus.UPCOMING,
    note: 'Tư vấn giải pháp hưu trí'
  },
  {
    id: 'a2',
    customerId: 'c1',
    customerName: 'Nguyễn Thị Thanh',
    date: '2024-02-01',
    time: '09:00',
    type: AppointmentType.FEE_REMINDER,
    status: AppointmentStatus.UPCOMING,
    note: 'Nhắc đóng phí tái tục năm 2'
  }
];

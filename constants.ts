
import { Customer, CustomerStatus, Product, ProductType, Contract, ContractStatus, Appointment, AppointmentType, AppointmentStatus, PaymentFrequency, Gender, FinancialStatus, PersonalityType, ReadinessLevel } from './types';

export const INITIAL_PRODUCTS: Product[] = [
  {
    id: 'p1',
    name: 'PRU-Chủ Động Cuộc Sống',
    code: 'P-UL-01',
    type: ProductType.MAIN,
    description: 'Giải pháp bảo vệ tài chính và tích lũy linh hoạt.',
    rulesAndTerms: 'Sản phẩm bảo hiểm liên kết chung. Độ tuổi tham gia từ 30 ngày tuổi đến 65 tuổi. Thời hạn hợp đồng đến 99 tuổi. Loại trừ bảo hiểm trong trường hợp tự tử trong vòng 24 tháng, hành vi phạm tội, hoặc bệnh có sẵn bị loại trừ cụ thể.',
    pdfUrl: ''
  },
  {
    id: 'p2',
    name: 'PRU-Hành Trang Trưởng Thành',
    code: 'P-UL-02',
    type: ProductType.MAIN,
    description: 'Quỹ giáo dục cho con yêu.',
    rulesAndTerms: 'Sản phẩm tích lũy giáo dục. Quyền lợi miễn đóng phí khi BMBH gặp rủi ro tử vong hoặc TTTBVV. Thời hạn đóng phí linh hoạt.',
    pdfUrl: ''
  },
  {
    id: 'r1',
    name: 'Bảo hiểm Chăm sóc Sức khỏe Toàn diện',
    code: 'R-HC-01',
    type: ProductType.RIDER,
    description: 'Chi trả chi phí y tế nội trú và ngoại trú.',
    rulesAndTerms: 'Thẻ sức khỏe có 4 chương trình: Cơ bản, Nâng cao, Toàn diện, Hoàn hảo. Loại trừ bệnh bẩm sinh (trừ khi được quy định), phẫu thuật thẩm mỹ, điều trị răng (trừ khi tai nạn). Thời gian chờ 30 ngày cho bệnh thông thường, 90 ngày cho bệnh đặc biệt.',
    pdfUrl: ''
  },
  {
    id: 'r2',
    name: 'Bảo hiểm Bệnh lý nghiêm trọng',
    code: 'R-CI-01',
    type: ProductType.RIDER,
    description: 'Bảo vệ trước 77 bệnh lý nghiêm trọng.',
    rulesAndTerms: 'Chi trả qua 3 giai đoạn bệnh. Giai đoạn đầu 25%, giai đoạn sau 100%. Thời gian chờ 90 ngày.',
    pdfUrl: ''
  },
  {
    id: 'op1',
    name: 'Quy trình Giải quyết Quyền lợi Bảo hiểm (Claim)',
    code: 'OP-CLAIM',
    type: ProductType.OPERATION,
    description: 'Hướng dẫn nộp hồ sơ và thời gian xử lý bồi thường.',
    rulesAndTerms: '1. Thời hạn nộp hồ sơ: Trong vòng 12 tháng kể từ ngày xảy ra sự kiện bảo hiểm. \n2. Các kênh nộp: Qua ứng dụng PRUOnline, Zalo OA Prudential Vietnam, hoặc trực tiếp tại văn phòng. \n3. Hồ sơ cần thiết: Giấy yêu cầu bồi thường, Giấy ra viện, Bảng kê chi phí, Hóa đơn tài chính, Các xét nghiệm y khoa. \n4. Thời gian xử lý: Tối đa 30 ngày kể từ khi nhận đủ hồ sơ hợp lệ.',
    pdfUrl: ''
  },
  {
    id: 'op2',
    name: 'Thời gian cân nhắc 21 ngày',
    code: 'OP-FREELOOK',
    type: ProductType.OPERATION,
    description: 'Quyền lợi dùng thử sản phẩm của khách hàng.',
    rulesAndTerms: 'Khách hàng có 21 ngày cân nhắc kể từ ngày nhận bộ hợp đồng. Trong thời gian này, khách hàng có thể hủy hợp đồng và nhận lại toàn bộ phí đã đóng (trừ chi phí khám sức khỏe nếu có). Sự kiện bảo hiểm xảy ra trong 21 ngày này vẫn được chi trả bình thường nếu hợp đồng đã được cấp.',
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
    companyAddress: 'Vincom Center, Q1, TP.HCM',
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
      readiness: ReadinessLevel.HOT
    },
    interactionHistory: ['2023-01-10: Tư vấn lần đầu', '2023-01-15: Ký hợp đồng'],
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
    companyAddress: 'Etown, Tân Bình',
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
      readiness: ReadinessLevel.WARM
    },
    interactionHistory: ['2023-05-20: Gặp cafe giới thiệu sản phẩm'],
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
      productName: 'PRU-Chủ Động Cuộc Sống',
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
        sumAssured: 500000000
      },
       {
        productId: 'r2',
        productName: 'Bảo hiểm Bệnh lý nghiêm trọng',
        insuredName: 'Nguyễn Thị Thanh',
        fee: 3000000,
        sumAssured: 300000000
      }
    ],
    totalFee: 28000000
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

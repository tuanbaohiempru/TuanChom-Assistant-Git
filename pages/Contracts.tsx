
import React, { useState, useMemo } from 'react';
import { Contract, Customer, Product, ContractStatus, PaymentFrequency, ProductType, ContractProduct } from '../types';
import { ConfirmModal, SearchableCustomerSelect, CurrencyInput, formatDateVN } from '../components/Shared';
import { generateClaimSupport } from '../services/geminiService';
import ExcelImportModal from '../components/ExcelImportModal';
import { downloadTemplate, processContractImport } from '../utils/excelHelpers';

interface ContractsPageProps {
    contracts: Contract[];
    customers: Customer[];
    products: Product[];
    onAdd: (c: Contract) => Promise<void>;
    onUpdate: (c: Contract) => Promise<void>;
    onDelete: (id: string) => Promise<void>;
}

const ContractsPage: React.FC<ContractsPageProps> = ({ contracts, customers, products, onAdd, onUpdate, onDelete }) => {
    // --- UI STATES ---
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [showModal, setShowModal] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false); // Import Modal
    const [viewContract, setViewContract] = useState<Contract | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState<{isOpen: boolean, id: string, name: string}>({ isOpen: false, id: '', name: '' });

    // --- CLAIM SUPPORT STATES ---
    const [claimModal, setClaimModal] = useState<{isOpen: boolean, contract: Contract | null, customer: Customer | null}>({ isOpen: false, contract: null, customer: null });
    const [claimGuide, setClaimGuide] = useState('');
    const [isGeneratingGuide, setIsGeneratingGuide] = useState(false);

    // --- FILTER STATES ---
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [filterMonth, setFilterMonth] = useState<string>('all');
    const [filterProduct, setFilterProduct] = useState<string>('all');

    // --- FORM DATA ---
    const defaultForm: Contract = {
        id: '', contractNumber: '', customerId: '', effectiveDate: '', nextPaymentDate: '',
        status: ContractStatus.ACTIVE, paymentFrequency: PaymentFrequency.ANNUAL, totalFee: 0,
        mainProduct: { productId: '', productName: '', insuredName: '', fee: 0, sumAssured: 0 },
        riders: [], beneficiary: ''
    };
    const [formData, setFormData] = useState<Contract>(defaultForm);

    const mainProducts = products.filter(p => p.type === ProductType.MAIN);
    const riderProducts = products.filter(p => p.type === ProductType.RIDER);

    // --- FILTER LOGIC ---
    const filteredContracts = useMemo(() => {
        return contracts.filter(c => {
            const customer = customers.find(cus => cus.id === c.customerId);
            const matchesSearch = c.contractNumber.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                  (customer?.fullName.toLowerCase() || '').includes(searchTerm.toLowerCase());
            
            const matchesStatus = filterStatus === 'all' || c.status === filterStatus;
            
            let matchesMonth = true;
            if (filterMonth !== 'all') {
                const month = new Date(c.nextPaymentDate).getMonth() + 1;
                matchesMonth = month.toString() === filterMonth;
            }

            const matchesProduct = filterProduct === 'all' || c.mainProduct.productId === filterProduct;

            return matchesSearch && matchesStatus && matchesMonth && matchesProduct;
        });
    }, [contracts, customers, searchTerm, filterStatus, filterMonth, filterProduct]);

    // --- METRICS CALCULATION ---
    const metrics = useMemo(() => {
        const totalActive = contracts.filter(c => c.status === ContractStatus.ACTIVE).length;
        const totalFeeYearly = contracts.reduce((sum, c) => c.status === ContractStatus.ACTIVE ? sum + c.totalFee : sum, 0);
        const warningCount = contracts.filter(c => c.status === ContractStatus.LAPSED || c.status === ContractStatus.PENDING).length;
        const upcomingDue = contracts.filter(c => {
            if (c.status !== ContractStatus.ACTIVE) return false;
            const diff = new Date(c.nextPaymentDate).getTime() - new Date().getTime();
            const days = Math.ceil(diff / (1000 * 3600 * 24));
            return days >= 0 && days <= 30;
        }).length;

        return { totalActive, totalFeeYearly, warningCount, upcomingDue };
    }, [contracts]);

    // --- HELPER FUNCTIONS ---
    const getContractYears = (startDate: string) => {
        if (!startDate) return 0;
        const start = new Date(startDate).getFullYear();
        const current = new Date().getFullYear();
        return Math.max(1, current - start + 1);
    };

    const calculateTotalFee = (data: Contract) => {
        const mainFee = data.mainProduct.fee || 0;
        const riderFees = (data.riders || []).reduce((sum, r) => sum + (r.fee || 0), 0);
        return mainFee + riderFees;
    };

    // --- CLAIM LOGIC ---
    const handleOpenClaim = async (contract: Contract) => {
        const customer = customers.find(c => c.id === contract.customerId) || null;
        if (!customer) return alert("Không tìm thấy thông tin khách hàng");
        
        setClaimModal({ isOpen: true, contract, customer });
        setClaimGuide('');
        setIsGeneratingGuide(true);

        // Call AI Service
        try {
            const guide = await generateClaimSupport(contract, customer);
            setClaimGuide(guide);
        } catch (error) {
            setClaimGuide("Không thể tạo hướng dẫn tự động. Vui lòng thử lại.");
        } finally {
            setIsGeneratingGuide(false);
        }
    };

    const getSuggestedDocuments = (contract: Contract): string[] => {
        const docs = new Set<string>();
        // Always required
        docs.add("Phiếu yêu cầu giải quyết quyền lợi (Form)");
        docs.add("CCCD/CMND người nhận quyền lợi");

        // Check products
        const allProducts = [contract.mainProduct.productName, ...contract.riders.map(r => r.productName)].join(' ').toLowerCase();

        if (allProducts.includes('sức khỏe') || allProducts.includes('nội trú') || allProducts.includes('y tế')) {
            docs.add("Giấy ra viện (Bản chính/Sao y)");
            docs.add("Bảng kê chi tiết viện phí");
            docs.add("Hóa đơn tài chính (Hóa đơn đỏ/điện tử)");
            docs.add("Giấy chứng nhận phẫu thuật (nếu có)");
        }

        if (allProducts.includes('tai nạn')) {
            docs.add("Biên bản tai nạn / Bản tường trình tai nạn");
            docs.add("Phim chụp X-Quang/CT và kết quả đọc phim");
            docs.add("Giấy phép lái xe (nếu tự lái xe)");
        }

        if (allProducts.includes('bệnh hiểm nghèo') || allProducts.includes('bệnh lý')) {
            docs.add("Kết quả giải phẫu bệnh (Sinh thiết)");
            docs.add("Các xét nghiệm y khoa chẩn đoán bệnh");
        }

        if (allProducts.includes('tử vong') || allProducts.includes('nhân thọ')) {
            docs.add("Trích lục khai tử");
            docs.add("Giấy xác nhận nguyên nhân tử vong");
            docs.add("Hồ sơ bệnh án (nếu tử vong do bệnh)");
        }

        return Array.from(docs);
    };


    // --- HANDLERS ---
    const handleOpenAdd = () => { 
        setFormData({ ...defaultForm, effectiveDate: new Date().toISOString().split('T')[0] }); 
        setIsEditing(false); 
        setShowModal(true); 
    };
    const handleOpenEdit = (c: Contract) => { setFormData(c); setIsEditing(true); setShowModal(true); };
    const handleSave = async () => { 
        const finalData = { ...formData, totalFee: calculateTotalFee(formData) }; 
        if (!finalData.contractNumber || !finalData.customerId || !finalData.mainProduct.productId) return alert("Thiếu thông tin bắt buộc!");
        isEditing ? await onUpdate(finalData) : await onAdd(finalData); 
        setShowModal(false); 
    };

    // --- QUICK ACTIONS ---
    const handleCopyReminder = (c: Contract) => {
        const customer = customers.find(cus => cus.id === c.customerId);
        const text = `Chào ${customer?.gender === 'Nam' ? 'anh' : 'chị'} ${customer?.fullName}, em nhắc nhẹ HĐ số ${c.contractNumber} sắp đến hạn đóng phí ngày ${formatDateVN(c.nextPaymentDate)} với số tiền ${c.totalFee.toLocaleString('vi-VN')}đ ạ.`;
        navigator.clipboard.writeText(text);
        alert("Đã sao chép nội dung nhắc phí!");
    };

    // --- IMPORT HANDLER ---
    const handleBatchSave = async (validContracts: Contract[]) => {
        await Promise.all(validContracts.map(c => onAdd(c)));
    }

    return (
        <div className="space-y-6">
            {/* 1. HEADER & METRICS */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Quản lý Hợp đồng</h1>
                <div className="flex gap-3">
                    <button 
                        onClick={() => setShowImportModal(true)}
                        className="bg-green-600 text-white px-5 py-2.5 rounded-xl hover:bg-green-700 transition shadow-lg shadow-green-500/30 font-medium flex items-center"
                    >
                        <i className="fas fa-file-excel mr-2"></i>Nhập Excel
                    </button>
                    <button onClick={handleOpenAdd} className="bg-pru-red text-white px-5 py-2.5 rounded-xl hover:bg-red-700 transition shadow-lg shadow-red-500/30 font-medium flex items-center">
                        <i className="fas fa-file-signature mr-2"></i>Tạo hợp đồng mới
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-pru-card p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 flex items-center justify-between transition-colors">
                    <div>
                        <p className="text-gray-500 dark:text-gray-400 text-xs font-bold uppercase">HĐ Hiệu lực</p>
                        <p className="text-2xl font-bold text-green-600">{metrics.totalActive}</p>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-green-50 dark:bg-green-900/10 text-green-500 flex items-center justify-center"><i className="fas fa-shield-alt"></i></div>
                </div>
                <div className="bg-white dark:bg-pru-card p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 flex items-center justify-between transition-colors">
                    <div>
                        <p className="text-gray-500 dark:text-gray-400 text-xs font-bold uppercase">Doanh số (Năm)</p>
                        <p className="text-2xl font-bold text-blue-600">{(metrics.totalFeeYearly / 1000000).toFixed(0)} Tr</p>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-900/10 text-blue-500 flex items-center justify-center"><i className="fas fa-chart-line"></i></div>
                </div>
                <div className="bg-white dark:bg-pru-card p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 flex items-center justify-between transition-colors">
                    <div>
                        <p className="text-gray-500 dark:text-gray-400 text-xs font-bold uppercase">Sắp đến hạn (30 ngày)</p>
                        <p className="text-2xl font-bold text-orange-500">{metrics.upcomingDue}</p>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-orange-50 dark:bg-orange-900/10 text-orange-500 flex items-center justify-center"><i className="fas fa-clock"></i></div>
                </div>
                <div className="bg-white dark:bg-pru-card p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 flex items-center justify-between transition-colors">
                    <div>
                        <p className="text-gray-500 dark:text-gray-400 text-xs font-bold uppercase">Cần chú ý (Lapsed)</p>
                        <p className="text-2xl font-bold text-red-500">{metrics.warningCount}</p>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-red-50 dark:bg-red-900/10 text-red-500 flex items-center justify-center"><i className="fas fa-exclamation-triangle"></i></div>
                </div>
            </div>

            {/* 2. TOOLBAR (Search & Filters) */}
            <div className="bg-white dark:bg-pru-card p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col lg:flex-row gap-4 items-center transition-colors">
                <div className="relative w-full lg:w-1/3">
                    <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
                    <input 
                        className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:ring-1 focus:ring-pru-red outline-none bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200"
                        placeholder="Tìm số HĐ, tên khách hàng..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
                
                <div className="flex gap-2 w-full lg:w-auto overflow-x-auto pb-1 lg:pb-0">
                    <select className="border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm outline-none bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 min-w-[120px]" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                        <option value="all">Mọi trạng thái</option>
                        {Object.values(ContractStatus).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    
                    <select className="border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm outline-none bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 min-w-[120px]" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}>
                        <option value="all">Mọi tháng đóng phí</option>
                        {Array.from({length: 12}, (_, i) => i + 1).map(m => <option key={m} value={m}>Tháng {m}</option>)}
                    </select>

                    <select className="border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm outline-none bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 min-w-[150px]" value={filterProduct} onChange={e => setFilterProduct(e.target.value)}>
                        <option value="all">Tất cả sản phẩm</option>
                        {mainProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                </div>

                <div className="ml-auto flex border bg-gray-100 dark:bg-gray-800 rounded-lg p-1 dark:border-gray-700">
                    <button onClick={() => setViewMode('grid')} className={`px-3 py-1 rounded-md text-sm transition ${viewMode === 'grid' ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-800 dark:text-white font-bold' : 'text-gray-500 dark:text-gray-400'}`}><i className="fas fa-th-large"></i></button>
                    <button onClick={() => setViewMode('list')} className={`px-3 py-1 rounded-md text-sm transition ${viewMode === 'list' ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-800 dark:text-white font-bold' : 'text-gray-500 dark:text-gray-400'}`}><i className="fas fa-list"></i></button>
                </div>
            </div>

            {/* 3. CONTENT AREA */}
            {filteredContracts.length === 0 ? (
                <div className="text-center py-12 bg-white dark:bg-pru-card rounded-xl border border-dashed border-gray-300 dark:border-gray-700">
                    <i className="fas fa-file-invoice-dollar text-4xl text-gray-300 dark:text-gray-600 mb-3"></i>
                    <p className="text-gray-500 dark:text-gray-400">Không tìm thấy hợp đồng nào.</p>
                </div>
            ) : viewMode === 'grid' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {filteredContracts.map(c => {
                         const customer = customers.find(cus => cus.id === c.customerId);
                         const year = getContractYears(c.effectiveDate);
                         const isLapsed = c.status === ContractStatus.LAPSED;
                         return (
                            <div key={c.id} className={`bg-white dark:bg-pru-card rounded-2xl border transition hover:shadow-lg flex flex-col group ${isLapsed ? 'border-red-200 bg-red-50/30 dark:bg-red-900/10 dark:border-red-900/30' : 'border-gray-200 dark:border-gray-800'}`}>
                                <div className="p-5 border-b border-gray-100 dark:border-gray-800 relative">
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex items-center gap-2">
                                            <div className="bg-red-50 dark:bg-red-900/20 text-pru-red w-10 h-10 rounded-lg flex items-center justify-center font-bold shadow-sm">
                                                <i className="fas fa-file-contract"></i>
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-gray-800 dark:text-gray-100 text-lg leading-tight">{c.contractNumber}</h3>
                                                <p className="text-xs text-gray-500 dark:text-gray-400">{customer?.fullName}</p>
                                            </div>
                                        </div>
                                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                                            c.status === ContractStatus.ACTIVE ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                                            c.status === ContractStatus.LAPSED ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                                        }`}>
                                            {c.status}
                                        </span>
                                    </div>
                                    
                                    {/* Progress Bar */}
                                    <div className="mt-3">
                                        <div className="flex justify-between text-[10px] text-gray-500 dark:text-gray-400 mb-1">
                                            <span>Năm thứ {year}</span>
                                        </div>
                                        <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
                                            <div className="bg-pru-red h-full rounded-full" style={{width: `${Math.min(year * 5, 100)}%`}}></div>
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="p-5 flex-1 space-y-3">
                                    <div>
                                        <p className="text-xs text-gray-400 font-bold uppercase">Sản phẩm chính</p>
                                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200 line-clamp-1" title={c.mainProduct.productName}>{c.mainProduct.productName}</p>
                                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Mệnh giá: <span className="font-bold text-gray-700 dark:text-gray-300">{c.mainProduct.sumAssured?.toLocaleString()} đ</span></div>
                                    </div>

                                    {c.riders.length > 0 && (
                                        <div>
                                            <p className="text-xs text-gray-400 font-bold uppercase mb-1">Bổ trợ ({c.riders.length})</p>
                                            <div className="flex flex-wrap gap-1">
                                                {c.riders.slice(0, 3).map((r, i) => (
                                                    <span key={i} className="text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-2 py-1 rounded border border-gray-200 dark:border-gray-700 truncate max-w-[100px]" title={r.productName}>
                                                        {r.productName}
                                                    </span>
                                                ))}
                                                {c.riders.length > 3 && <span className="text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-2 py-1 rounded border border-gray-200 dark:border-gray-700">+ {c.riders.length - 3}</span>}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-b-2xl border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
                                    <div>
                                        <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-bold">Phí đóng / {c.paymentFrequency}</p>
                                        <p className="text-sm font-bold text-gray-800 dark:text-gray-200">{c.totalFee.toLocaleString()} đ</p>
                                    </div>
                                    <div className="flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => handleCopyReminder(c)} className="w-8 h-8 rounded bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:text-pru-red hover:border-red-200 flex items-center justify-center shadow-sm" title="Copy tin nhắc phí"><i className="fas fa-bell"></i></button>
                                        <button onClick={() => setViewContract(c)} className="w-8 h-8 rounded bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-green-600 dark:text-green-400 hover:border-green-200 flex items-center justify-center shadow-sm" title="Xem chi tiết"><i className="fas fa-eye"></i></button>
                                        <button onClick={() => handleOpenEdit(c)} className="w-8 h-8 rounded bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-blue-500 dark:text-blue-400 hover:border-blue-200 flex items-center justify-center shadow-sm"><i className="fas fa-edit"></i></button>
                                    </div>
                                </div>
                            </div>
                         );
                    })}
                </div>
            ) : (
                <div className="bg-white dark:bg-pru-card rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-semibold text-xs uppercase tracking-wider">
                                <tr>
                                    <th className="p-4 border-b dark:border-gray-700">Hợp đồng</th>
                                    <th className="p-4 border-b dark:border-gray-700">Khách hàng</th>
                                    <th className="p-4 border-b dark:border-gray-700">Sản phẩm chính</th>
                                    <th className="p-4 border-b dark:border-gray-700 text-center">Tiến độ</th>
                                    <th className="p-4 border-b dark:border-gray-700">Phí đóng</th>
                                    <th className="p-4 border-b dark:border-gray-700">Trạng thái</th>
                                    <th className="p-4 border-b dark:border-gray-700 text-right">Thao tác</th>
                                </tr>
                            </thead>
                            <tbody className="text-sm text-gray-600 dark:text-gray-300 divide-y divide-gray-100 dark:divide-gray-700">
                                {filteredContracts.map(c => {
                                    const customer = customers.find(cus => cus.id === c.customerId);
                                    const year = getContractYears(c.effectiveDate);
                                    return (
                                        <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
                                            <td className="p-4 font-bold text-pru-red">{c.contractNumber}</td>
                                            <td className="p-4 font-medium text-gray-900 dark:text-gray-100">{customer?.fullName}</td>
                                            <td className="p-4">
                                                <div className="text-gray-900 dark:text-gray-100 font-medium">{c.mainProduct.productName}</div>
                                                <div className="text-xs text-gray-500 dark:text-gray-400">BH: {c.mainProduct.sumAssured?.toLocaleString()} đ</div>
                                            </td>
                                            <td className="p-4 text-center">
                                                <div className="w-24 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 mx-auto mb-1">
                                                    <div className="bg-blue-500 h-1.5 rounded-full" style={{width: `${Math.min(year * 5, 100)}%`}}></div>
                                                </div>
                                                <span className="text-[10px] text-gray-400">Năm {year}</span>
                                            </td>
                                            <td className="p-4 font-bold">{c.totalFee.toLocaleString()} đ</td>
                                            <td className="p-4">
                                                <span className={`px-2 py-1 rounded text-xs font-bold ${
                                                    c.status === ContractStatus.ACTIVE ? 'text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30' : 
                                                    c.status === ContractStatus.LAPSED ? 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/30' : 'text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/30'
                                                }`}>
                                                    {c.status}
                                                </span>
                                            </td>
                                            <td className="p-4 text-right space-x-1">
                                                <button onClick={() => handleCopyReminder(c)} className="p-2 text-gray-400 hover:text-pru-red"><i className="fas fa-bell"></i></button>
                                                <button onClick={() => setViewContract(c)} className="p-2 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/30 rounded"><i className="fas fa-eye"></i></button>
                                                <button onClick={() => handleOpenEdit(c)} className="p-2 text-blue-500 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded"><i className="fas fa-edit"></i></button>
                                                <button onClick={() => setDeleteConfirm({isOpen: true, id: c.id, name: c.contractNumber})} className="p-2 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"><i className="fas fa-trash"></i></button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* VIEW MODAL (Simplified) */}
            {viewContract && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4 animate-fade-in backdrop-blur-sm">
                    <div className="bg-white dark:bg-pru-card rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-gray-100 dark:border-gray-700 transition-colors">
                        <div className="bg-gray-50 dark:bg-gray-800/50 px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                            <div>
                                <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                                    <i className="fas fa-file-contract text-pru-red"></i> Hợp đồng #{viewContract.contractNumber}
                                </h2>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Khách hàng: <b>{customers.find(c => c.id === viewContract.customerId)?.fullName}</b></p>
                            </div>
                            <button onClick={() => setViewContract(null)} className="w-8 h-8 rounded-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600 flex items-center justify-center text-gray-500 dark:text-gray-300"><i className="fas fa-times"></i></button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-6 space-y-8">
                            
                            {/* Detailed Info */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                                <div className="md:col-span-2 space-y-6">
                                    {/* Products */}
                                    <div>
                                        <h3 className="font-bold text-gray-800 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700 pb-2 mb-3">Quyền lợi bảo hiểm</h3>
                                        <div className="space-y-3">
                                            {/* Main */}
                                            <div className="flex justify-between items-center p-3 bg-white dark:bg-gray-800 border border-l-4 border-l-blue-500 dark:border-gray-700 rounded-lg shadow-sm">
                                                <div>
                                                    <span className="text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded font-bold">CHÍNH</span>
                                                    <div className="font-bold text-gray-800 dark:text-gray-200 mt-1">{viewContract.mainProduct.productName}</div>
                                                    <div className="text-xs text-gray-500 dark:text-gray-400">NĐBH: {viewContract.mainProduct.insuredName}</div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-lg font-bold text-gray-800 dark:text-gray-100">{viewContract.mainProduct.sumAssured?.toLocaleString()} đ</div>
                                                    <div className="text-xs text-gray-400">BV Tử vong / TTTBVV</div>
                                                </div>
                                            </div>
                                            {/* Riders */}
                                            {viewContract.riders.map((r, i) => (
                                                <div key={i} className="flex justify-between items-center p-3 bg-white dark:bg-gray-800 border border-l-4 border-l-orange-400 dark:border-gray-700 rounded-lg shadow-sm">
                                                    <div>
                                                        <span className="text-[10px] bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 px-1.5 py-0.5 rounded font-bold">BỔ TRỢ</span>
                                                        <div className="font-medium text-gray-800 dark:text-gray-200 mt-1">{r.productName}</div>
                                                        <div className="text-xs text-gray-500 dark:text-gray-400">NĐBH: {r.insuredName}</div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="font-bold text-gray-700 dark:text-gray-300">{r.sumAssured?.toLocaleString()} đ</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* Sidebar Info */}
                                <div className="space-y-6">
                                    <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-100 dark:border-gray-700">
                                        <h4 className="font-bold text-gray-700 dark:text-gray-200 mb-3 text-sm">Thông tin khác</h4>
                                        <div className="space-y-3 text-sm text-gray-600 dark:text-gray-300">
                                            <div>
                                                <span className="block text-gray-400 text-xs">Người thụ hưởng</span>
                                                <div className="font-medium">{viewContract.beneficiary || 'Chưa cập nhật'}</div>
                                            </div>
                                            <div>
                                                <span className="block text-gray-400 text-xs">Định kỳ đóng phí</span>
                                                <div className="font-medium">{viewContract.paymentFrequency}</div>
                                            </div>
                                            <div>
                                                <span className="block text-gray-400 text-xs">Tổng phí năm</span>
                                                <div className="font-medium">{viewContract.totalFee.toLocaleString()} đ</div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <button onClick={() => handleCopyReminder(viewContract)} className="w-full py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-200 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-600 hover:text-pru-red transition flex items-center justify-center">
                                            <i className="fas fa-bell mr-2"></i> Nhắc đóng phí
                                        </button>
                                        <button 
                                            onClick={() => handleOpenClaim(viewContract)}
                                            className="w-full py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-200 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-600 hover:text-blue-600 transition flex items-center justify-center"
                                        >
                                            <i className="fas fa-file-medical-alt mr-2"></i> Hỗ trợ bồi thường (Claim)
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* CLAIM SUPPORT MODAL */}
            {claimModal.isOpen && claimModal.contract && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4 animate-fade-in backdrop-blur-sm">
                    <div className="bg-white dark:bg-pru-card rounded-2xl max-w-4xl w-full h-[85vh] flex flex-col shadow-2xl overflow-hidden transition-colors">
                        <div className="bg-blue-600 dark:bg-blue-700 px-6 py-4 flex justify-between items-center text-white">
                            <div>
                                <h2 className="text-xl font-bold flex items-center gap-2">
                                    <i className="fas fa-hand-holding-medical"></i> Hỗ trợ Giải quyết Quyền lợi (Claim)
                                </h2>
                                <p className="text-xs text-blue-100 mt-1">Hợp đồng: {claimModal.contract.contractNumber} • Khách hàng: {claimModal.customer?.fullName}</p>
                            </div>
                            <button onClick={() => setClaimModal({isOpen: false, contract: null, customer: null})} className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white"><i className="fas fa-times"></i></button>
                        </div>

                        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
                            {/* Column 1: Static Document Checklist (Option A) */}
                            <div className="w-full md:w-1/3 bg-gray-50 dark:bg-gray-800/50 border-r border-gray-200 dark:border-gray-700 p-5 overflow-y-auto">
                                <h3 className="font-bold text-gray-800 dark:text-gray-200 text-sm uppercase mb-4 flex items-center text-blue-600 dark:text-blue-400">
                                    <i className="fas fa-clipboard-check mr-2"></i> Hồ sơ tiêu chuẩn
                                </h3>
                                <div className="space-y-2">
                                    {getSuggestedDocuments(claimModal.contract).map((doc, idx) => (
                                        <div key={idx} className="flex items-start p-3 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg">
                                            <i className="fas fa-check-circle text-green-500 mt-0.5 mr-2.5"></i>
                                            <span className="text-sm text-gray-700 dark:text-gray-200 font-medium">{doc}</span>
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-6 p-4 bg-blue-100 dark:bg-blue-900/30 rounded-xl text-xs text-blue-800 dark:text-blue-300 leading-relaxed border border-blue-200 dark:border-blue-900/50">
                                    <i className="fas fa-info-circle mr-1"></i>
                                    <b>Lưu ý:</b> Đây là danh sách gợi ý dựa trên sản phẩm đã tham gia. Vui lòng kiểm tra thực tế sự kiện bảo hiểm (Tai nạn / Bệnh / ...) để yêu cầu chính xác.
                                </div>
                            </div>

                            {/* Column 2: AI Message Generator (Option C) */}
                            <div className="flex-1 p-6 flex flex-col bg-white dark:bg-pru-card">
                                <h3 className="font-bold text-gray-800 dark:text-gray-200 text-sm uppercase mb-3 flex items-center text-purple-600 dark:text-purple-400">
                                    <i className="fas fa-magic mr-2"></i> Soạn tin nhắn hướng dẫn (AI)
                                </h3>
                                
                                {isGeneratingGuide ? (
                                    <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                                        <i className="fas fa-robot fa-spin text-3xl mb-3 text-purple-400"></i>
                                        <p className="text-sm">Đang soạn thảo hướng dẫn...</p>
                                    </div>
                                ) : (
                                    <textarea 
                                        className="flex-1 w-full border border-gray-200 dark:border-gray-700 rounded-xl p-4 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-purple-100 dark:focus:ring-purple-900/50 focus:border-purple-300 resize-none font-sans text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-900 shadow-inner"
                                        value={claimGuide}
                                        onChange={(e) => setClaimGuide(e.target.value)}
                                        placeholder="Nội dung hướng dẫn..."
                                    />
                                )}

                                <div className="mt-4 flex justify-between items-center">
                                    <span className="text-xs text-gray-400 italic">Bạn có thể chỉnh sửa nội dung trước khi gửi.</span>
                                    <div className="flex gap-3">
                                        <button onClick={() => setClaimModal({isOpen: false, contract: null, customer: null})} className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-sm font-bold">Đóng</button>
                                        <button 
                                            onClick={() => {
                                                navigator.clipboard.writeText(claimGuide);
                                                alert("Đã sao chép nội dung!");
                                            }}
                                            disabled={isGeneratingGuide || !claimGuide}
                                            className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 shadow-md flex items-center disabled:opacity-50"
                                        >
                                            <i className="fas fa-copy mr-2"></i> Sao chép gửi khách
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ADD / EDIT MODAL */}
             {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in backdrop-blur-sm">
                    <div className="bg-white dark:bg-pru-card rounded-xl max-w-4xl w-full h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-gray-100 dark:border-gray-700 transition-colors">
                        <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50">
                            <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">{isEditing ? 'Cập nhật Hợp Đồng' : 'Tạo Hợp Đồng Mới'}</h3>
                            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><i className="fas fa-times text-xl"></i></button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-6 bg-white dark:bg-pru-card space-y-6">
                            {/* GENERAL INFO */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div><label className="label-text">Số Hợp Đồng</label><input className="input-field" value={formData.contractNumber} onChange={e => setFormData({...formData, contractNumber: e.target.value})} /></div>
                                <SearchableCustomerSelect customers={customers} value={customers.find(c => c.id === formData.customerId)?.fullName || ''} onChange={c => setFormData({...formData, customerId: c.id})} label="Bên mua bảo hiểm" />
                                <div><label className="label-text">Người thụ hưởng</label><input className="input-field" value={formData.beneficiary} onChange={e => setFormData({...formData, beneficiary: e.target.value})} placeholder="Vợ/Chồng/Con..." /></div>
                                <div><label className="label-text">Ngày hiệu lực</label><input type="date" className="input-field" value={formData.effectiveDate} onChange={e => setFormData({...formData, effectiveDate: e.target.value})} /></div>
                                <div><label className="label-text">Định kỳ đóng phí</label><select className="input-field" value={formData.paymentFrequency} onChange={(e:any) => setFormData({...formData, paymentFrequency: e.target.value})}>{Object.values(PaymentFrequency).map(f => <option key={f} value={f}>{f}</option>)}</select></div>
                                <div><label className="label-text">Ngày đóng phí tới</label><input type="date" className="input-field" value={formData.nextPaymentDate} onChange={e => setFormData({...formData, nextPaymentDate: e.target.value})} /></div>
                                <div><label className="label-text">Trạng thái</label><select className="input-field" value={formData.status} onChange={(e:any) => setFormData({...formData, status: e.target.value})}>{Object.values(ContractStatus).map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                            </div>

                            {/* MAIN PRODUCT */}
                            <div className="bg-blue-50 dark:bg-blue-900/10 p-4 rounded-xl border border-blue-100 dark:border-blue-900/30">
                                <h4 className="font-bold text-blue-800 dark:text-blue-300 mb-3 text-sm uppercase">Sản phẩm chính</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="md:col-span-2">
                                        <select className="input-field" value={formData.mainProduct.productId} onChange={(e) => {
                                            const prod = mainProducts.find(p => p.id === e.target.value);
                                            setFormData({...formData, mainProduct: {...formData.mainProduct, productId: e.target.value, productName: prod?.name || ''}});
                                        }}>
                                            <option value="">-- Chọn sản phẩm --</option>
                                            {mainProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                        </select>
                                    </div>
                                    <SearchableCustomerSelect customers={customers} value={formData.mainProduct.insuredName || 'Người được BH'} onChange={c => setFormData({...formData, mainProduct: {...formData.mainProduct, insuredName: c.fullName}})} label="Người được bảo hiểm" />
                                    <div><label className="label-text">Mệnh giá (STBH)</label><CurrencyInput className="input-field" value={formData.mainProduct.sumAssured} onChange={v => setFormData({...formData, mainProduct: {...formData.mainProduct, sumAssured: v}})} /></div>
                                    <div><label className="label-text">Phí bảo hiểm</label><CurrencyInput className="input-field font-bold text-blue-600 dark:text-blue-400" value={formData.mainProduct.fee} onChange={v => setFormData({...formData, mainProduct: {...formData.mainProduct, fee: v}})} /></div>
                                </div>
                            </div>

                            {/* RIDERS */}
                            <div className="bg-orange-50 dark:bg-orange-900/10 p-4 rounded-xl border border-orange-100 dark:border-orange-900/30">
                                <div className="flex justify-between items-center mb-3">
                                    <h4 className="font-bold text-orange-800 dark:text-orange-300 text-sm uppercase">Sản phẩm bổ trợ</h4>
                                    <button onClick={() => setFormData({...formData, riders: [...formData.riders, {productId: '', productName: '', insuredName: '', fee: 0, sumAssured: 0}]})} className="text-xs bg-white dark:bg-gray-800 border border-orange-200 dark:border-orange-800 text-orange-600 dark:text-orange-400 px-3 py-1 rounded font-bold hover:bg-orange-100 dark:hover:bg-orange-900/30">+ Thêm</button>
                                </div>
                                {formData.riders.map((rider, idx) => (
                                    <div key={idx} className="relative bg-white dark:bg-gray-800 p-3 rounded-lg border border-orange-200 dark:border-orange-800/50 mb-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <button onClick={() => {const r = [...formData.riders]; r.splice(idx, 1); setFormData({...formData, riders: r})}} className="absolute top-2 right-2 text-gray-300 hover:text-red-500"><i className="fas fa-times-circle"></i></button>
                                        <div className="md:col-span-2">
                                            <select className="input-field text-sm" value={rider.productId} onChange={(e) => {
                                                const prod = riderProducts.find(p => p.id === e.target.value);
                                                const newRiders = [...formData.riders];
                                                newRiders[idx] = {...rider, productId: e.target.value, productName: prod?.name || ''};
                                                setFormData({...formData, riders: newRiders});
                                            }}>
                                                <option value="">-- Chọn SPBT --</option>
                                                {riderProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                            </select>
                                        </div>
                                        <SearchableCustomerSelect customers={customers} value={rider.insuredName || ''} onChange={c => {
                                             const newRiders = [...formData.riders];
                                             newRiders[idx] = {...rider, insuredName: c.fullName};
                                             setFormData({...formData, riders: newRiders});
                                        }} label="Người được BH" className="text-sm" />
                                        <div><label className="text-[10px] uppercase font-bold text-gray-400">Phí</label><CurrencyInput className="input-field text-sm" value={rider.fee} onChange={v => {const r = [...formData.riders]; r[idx].fee = v; setFormData({...formData, riders: r})}} /></div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex justify-end gap-3">
                            <button onClick={() => setShowModal(false)} className="px-5 py-2 text-gray-600 dark:text-gray-300 font-medium hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Hủy</button>
                            <button onClick={handleSave} className="px-5 py-2 bg-pru-red text-white font-bold rounded-lg hover:bg-red-700 shadow-md">Lưu Hợp Đồng</button>
                        </div>
                    </div>
                </div>
            )}

            <ConfirmModal isOpen={deleteConfirm.isOpen} title="Xóa hợp đồng?" message={`Bạn có chắc muốn xóa HĐ ${deleteConfirm.name}?`} onConfirm={() => onDelete(deleteConfirm.id)} onClose={() => setDeleteConfirm({isOpen: false, id: '', name: ''})} />

            {/* EXCEL IMPORT MODAL */}
            <ExcelImportModal<Contract>
                isOpen={showImportModal}
                onClose={() => setShowImportModal(false)}
                title="Nhập Hợp Đồng từ Excel"
                onDownloadTemplate={() => downloadTemplate('contract')}
                onProcessFile={(file) => processContractImport(file, contracts, customers)}
                onSave={handleBatchSave}
            />

            <style>{`
                .input-field { width: 100%; border: 1px solid #e5e7eb; padding: 0.625rem; border-radius: 0.5rem; outline: none; font-size: 0.875rem; transition: all; background-color: #fff; color: #111827; }
                .dark .input-field { background-color: #111827; border-color: #374151; color: #f3f4f6; }
                .input-field:focus { border-color: #ed1b2e; ring: 1px solid #ed1b2e; }
                .label-text { display: block; font-size: 0.75rem; font-weight: 700; color: #6b7280; margin-bottom: 0.25rem; }
                .dark .label-text { color: #9ca3af; }
            `}</style>
        </div>
    );
};

export default ContractsPage;

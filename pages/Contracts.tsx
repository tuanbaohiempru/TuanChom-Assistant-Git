
import React, { useState, useMemo, useEffect } from 'react';
import { Contract, Customer, Product, ContractStatus, PaymentFrequency, ProductType, ContractProduct, Gender, ProductCalculationType } from '../types';
import { ConfirmModal, SearchableCustomerSelect, CurrencyInput, formatDateVN } from '../components/Shared';
import { generateClaimSupport } from '../services/geminiService';
import ExcelImportModal from '../components/ExcelImportModal';
import { downloadTemplate, processContractImport } from '../utils/excelHelpers';
import { calculateProductFee } from '../services/productCalculator';
import { HTVKPlan, HTVKPackage } from '../data/pruHanhTrangVuiKhoe';

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

    // --- CALCULATION FEEDBACK STATE ---
    const [calcStatus, setCalcStatus] = useState<{msg: string, type: 'success' | 'warning' | 'error' | 'info'}>({ msg: '', type: 'info' });

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
        const totalFeeYearly = contracts.reduce((sum, c) => c.status === ContractStatus.ACTIVE ? sum + c.totalFee : sum, 0) || 0;
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

    const calculateAge = (dob: string): number => {
        if (!dob) return 0;
        const birthDate = new Date(dob);
        if (isNaN(birthDate.getTime())) return 0;
        const birthYear = birthDate.getFullYear();
        const currentYear = new Date().getFullYear();
        return Math.max(0, currentYear - birthYear);
    }

    // --- AUTO CALCULATION EFFECTS ---
    
    // 1. Fee Calculation (Enhanced with Debug Feedback & Correct Insured Person Selection)
    useEffect(() => {
        if (!showModal) return;
        setCalcStatus({ msg: '', type: 'info' }); // Reset status

        // 1. Identify Policy Owner
        const owner = customers.find(c => c.id === formData.customerId);
        
        // 2. Identify Insured Person (Logic: Match by Name in customer list, fallback to Owner)
        // Note: Using name match is imperfect if duplicate names exist, but fits current schema constraints.
        const insuredByName = customers.find(c => c.fullName === formData.mainProduct.insuredName);
        const calculationTarget = insuredByName || owner;

        const product = products.find(p => p.id === formData.mainProduct.productId);

        if (!owner) {
            setCalcStatus({ msg: 'Vui lòng chọn Bên mua bảo hiểm.', type: 'info' });
            return;
        }
        if (!product) {
            setCalcStatus({ msg: 'Vui lòng chọn sản phẩm.', type: 'info' });
            return;
        }
        if (formData.mainProduct.sumAssured <= 0) {
            setCalcStatus({ msg: 'Vui lòng nhập Mệnh giá bảo vệ.', type: 'info' });
            return;
        }
        if (!calculationTarget) {
             setCalcStatus({ msg: 'Chưa xác định được Người được bảo hiểm.', type: 'warning' });
             return;
        }

        // Calculate Age
        let age = calculateAge(calculationTarget.dob);
        let usingDefaultAge = false;
        
        // Fallback if Age is 0 (Customer might have missing DOB)
        if (age === 0) {
            age = 30; // Default estimation
            usingDefaultAge = true;
        }

        const term = formData.mainProduct.attributes?.paymentTerm || 10;
        const occupationGroup = formData.mainProduct.attributes?.occupationGroup || 1;

        const fee = calculateProductFee({
            product: product, 
            calculationType: product.calculationType || ProductCalculationType.FIXED,
            productCode: product.code,
            sumAssured: formData.mainProduct.sumAssured,
            age: age,
            gender: calculationTarget.gender,
            term: term,
            occupationGroup: occupationGroup
        });
        
        const targetName = calculationTarget.fullName === owner.fullName ? 'Chính chủ' : calculationTarget.fullName;

        // Update Status Message
        if (fee > 0) {
            if (usingDefaultAge) {
                setCalcStatus({ 
                    msg: `⚠️ Đã tính cho ${targetName} (${calculationTarget.gender}, giả định ${age}t). Vui lòng cập nhật ngày sinh.`, 
                    type: 'warning' 
                });
            } else {
                setCalcStatus({ 
                    msg: `✅ Đã tính cho: ${targetName} (${calculationTarget.gender}, ${age} tuổi).`, 
                    type: 'success' 
                });
            }
            
            // Only update form if fee changed to avoid loops
            if (fee !== formData.mainProduct.fee) {
                setFormData(prev => ({
                    ...prev,
                    mainProduct: { 
                        ...prev.mainProduct, 
                        fee: fee,
                        attributes: { ...prev.mainProduct.attributes, paymentTerm: term, occupationGroup }
                    },
                }));
            }
        } else {
            setCalcStatus({ 
                msg: `⚠️ Không tìm thấy tỷ lệ phí cho: ${targetName} (${calculationTarget.gender}, ${age} tuổi). Kiểm tra lại cấu hình.`, 
                type: 'error' 
            });
        }

    }, [
        formData.customerId, 
        formData.mainProduct.productId, 
        formData.mainProduct.sumAssured,
        formData.mainProduct.insuredName, // Re-run when insured name changes
        formData.mainProduct.attributes?.paymentTerm, 
        formData.mainProduct.attributes?.occupationGroup,
        showModal
    ]);

    // 2. Auto Next Payment Date (New)
    useEffect(() => {
        if (!showModal || isEditing) return;

        if (formData.effectiveDate && formData.paymentFrequency) {
            const date = new Date(formData.effectiveDate);
            if (!isNaN(date.getTime())) {
                let newDate = new Date(date);
                switch (formData.paymentFrequency) {
                    case PaymentFrequency.ANNUAL: newDate.setFullYear(date.getFullYear() + 1); break;
                    case PaymentFrequency.SEMI_ANNUAL: newDate.setMonth(date.getMonth() + 6); break;
                    case PaymentFrequency.QUARTERLY: newDate.setMonth(date.getMonth() + 3); break;
                    case PaymentFrequency.MONTHLY: newDate.setMonth(date.getMonth() + 1); break;
                }
                setFormData(prev => ({ ...prev, nextPaymentDate: newDate.toISOString().split('T')[0] }));
            }
        }
    }, [formData.effectiveDate, formData.paymentFrequency, showModal, isEditing]);


    // --- CLAIM LOGIC ---
    const handleOpenClaim = async (contract: Contract) => {
        const customer = customers.find(c => c.id === contract.customerId) || null;
        if (!customer) return alert("Không tìm thấy thông tin khách hàng");
        setClaimModal({ isOpen: true, contract, customer });
        setClaimGuide('');
        setIsGeneratingGuide(true);
        try {
            const guide = await generateClaimSupport(contract, customer);
            setClaimGuide(guide);
        } catch (error) {
            setClaimGuide("Không thể tạo hướng dẫn tự động. Vui lòng thử lại.");
        } finally {
            setIsGeneratingGuide(false);
        }
    };

    // --- HANDLERS ---
    const handleOpenAdd = () => { 
        setFormData({ ...defaultForm, effectiveDate: new Date().toISOString().split('T')[0] }); 
        setIsEditing(false); 
        setShowModal(true); 
        setCalcStatus({ msg: '', type: 'info' });
    };
    const handleOpenEdit = (c: Contract) => { 
        setFormData(c); 
        setIsEditing(true); 
        setShowModal(true); 
        setCalcStatus({ msg: '', type: 'info' });
    };
    const handleSave = async () => { 
        const total = formData.mainProduct.fee + formData.riders.reduce((acc, r) => acc + (r.fee || 0), 0);
        const finalData = { ...formData, totalFee: total }; 
        if (!finalData.contractNumber || !finalData.customerId || !finalData.mainProduct.productId) return alert("Thiếu thông tin bắt buộc!");
        isEditing ? await onUpdate(finalData) : await onAdd(finalData); 
        setShowModal(false); 
    };

    const handleCopyReminder = (c: Contract) => {
        const customer = customers.find(cus => cus.id === c.customerId);
        const text = `Chào ${customer?.gender === 'Nam' ? 'anh' : 'chị'} ${customer?.fullName}, em nhắc nhẹ HĐ số ${c.contractNumber} sắp đến hạn đóng phí ngày ${formatDateVN(c.nextPaymentDate)} với số tiền ${c.totalFee.toLocaleString('vi-VN')}đ ạ.`;
        navigator.clipboard.writeText(text);
        alert("Đã sao chép nội dung nhắc phí!");
    };

    const handleQuickRenew = async (c: Contract) => {
        if (!window.confirm(`Xác nhận khách hàng đã đóng phí cho HĐ ${c.contractNumber}? Ngày đóng phí tiếp theo sẽ được tự động cập nhật và trạng thái sẽ chuyển về Hiệu lực.`)) return;
        const currentNextDate = new Date(c.nextPaymentDate);
        let newDate = new Date(currentNextDate);
        switch (c.paymentFrequency) {
            case PaymentFrequency.ANNUAL: newDate.setFullYear(currentNextDate.getFullYear() + 1); break;
            case PaymentFrequency.SEMI_ANNUAL: newDate.setMonth(currentNextDate.getMonth() + 6); break;
            case PaymentFrequency.QUARTERLY: newDate.setMonth(currentNextDate.getMonth() + 3); break;
            case PaymentFrequency.MONTHLY: newDate.setMonth(currentNextDate.getMonth() + 1); break;
        }
        
        // Auto set status to ACTIVE if renewing
        const updatedContract = { 
            ...c, 
            nextPaymentDate: newDate.toISOString().split('T')[0],
            status: ContractStatus.ACTIVE 
        };
        
        await onUpdate(updatedContract);
        alert("Đã cập nhật ngày đóng phí và trạng thái thành công!");
    };

    const handleAddRider = () => {
        const defaultInsured = formData.mainProduct.insuredName || '';
        setFormData({
            ...formData, 
            riders: [...formData.riders, {productId: '', productName: '', insuredName: defaultInsured, fee: 0, sumAssured: 0}]
        });
    };

    const handleBatchSave = async (validContracts: Contract[]) => {
        await Promise.all(validContracts.map(c => onAdd(c)));
    }

    const mainProductInfo = products.find(p => p.id === formData.mainProduct.productId);
    const requiresTerm = mainProductInfo?.calculationType === ProductCalculationType.RATE_PER_1000_TERM;

    // Helper for manual recalc button (DEBUG BUTTON)
    const handleManualCheck = () => {
        const owner = customers.find(c => c.id === formData.customerId);
        const insuredByName = customers.find(c => c.fullName === formData.mainProduct.insuredName);
        const target = insuredByName || owner;
        const product = products.find(p => p.id === formData.mainProduct.productId);
        
        if (!owner) return alert("Chưa chọn Bên mua bảo hiểm.");
        if (!product) return alert("Chưa chọn sản phẩm.");
        if (!target) return alert("Không tìm thấy thông tin người được bảo hiểm.");

        const age = calculateAge(target.dob);
        
        const info = `
        Đang tính toán cho: ${target.fullName} (${target.gender})
        - Vai trò: ${target.id === owner.id ? 'Bên mua đồng thời là NĐBH' : 'Người được bảo hiểm (Khác bên mua)'}
        - Ngày sinh: ${target.dob || 'Chưa nhập!'} (Tuổi tính được: ${age})
        - Sản phẩm: ${product.name} (Code: ${product.code})
        - Mệnh giá: ${formData.mainProduct.sumAssured.toLocaleString()}
        
        Nếu Phí vẫn = 0, hãy kiểm tra:
        1. Bảng tỷ lệ phí có dòng cho tuổi ${age} không?
        2. Mã sản phẩm '${product.code}' có đúng trong cấu hình không?
        `;
        
        alert(info);
    };

    return (
        <div className="space-y-6">
            {/* 1. HEADER & METRICS */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Quản lý Hợp đồng</h1>
                <div className="flex gap-3">
                    {/* View Toggle */}
                    <div className="bg-gray-100 dark:bg-gray-700 p-1 rounded-lg flex items-center">
                        <button onClick={() => setViewMode('grid')} className={`p-2 rounded-md transition ${viewMode === 'grid' ? 'bg-white dark:bg-gray-600 shadow text-pru-red' : 'text-gray-400'}`} title="Dạng thẻ"><i className="fas fa-th-large"></i></button>
                        <button onClick={() => setViewMode('list')} className={`p-2 rounded-md transition ${viewMode === 'list' ? 'bg-white dark:bg-gray-600 shadow text-pru-red' : 'text-gray-400'}`} title="Dạng danh sách"><i className="fas fa-list"></i></button>
                    </div>
                    <button onClick={() => setShowImportModal(true)} className="bg-green-600 text-white px-4 py-2.5 rounded-xl hover:bg-green-700 transition shadow-lg shadow-green-500/30 font-medium flex items-center text-sm"><i className="fas fa-file-excel mr-2"></i>Nhập Excel</button>
                    <button onClick={handleOpenAdd} className="bg-pru-red text-white px-4 py-2.5 rounded-xl hover:bg-red-700 transition shadow-lg shadow-red-500/30 font-medium flex items-center text-sm"><i className="fas fa-file-signature mr-2"></i>Tạo HĐ mới</button>
                </div>
            </div>

            {/* Metrics Toolbar */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-pru-card p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 flex items-center gap-4 transition-colors">
                    <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center text-xl"><i className="fas fa-file-contract"></i></div>
                    <div><p className="text-xs text-gray-500 dark:text-gray-400 uppercase font-bold">Tổng HĐ hiệu lực</p><p className="text-xl font-bold text-gray-800 dark:text-gray-100">{metrics.totalActive}</p></div>
                </div>
                <div className="bg-white dark:bg-pru-card p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 flex items-center gap-4 transition-colors">
                    <div className="w-12 h-12 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-full flex items-center justify-center text-xl"><i className="fas fa-money-bill-wave"></i></div>
                    <div><p className="text-xs text-gray-500 dark:text-gray-400 uppercase font-bold">Tổng phí / Năm</p><p className="text-xl font-bold text-gray-800 dark:text-gray-100">{(metrics.totalFeeYearly/1000000).toFixed(0)} Tr</p></div>
                </div>
                <div className="bg-white dark:bg-pru-card p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 flex items-center gap-4 transition-colors">
                    <div className="w-12 h-12 bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 rounded-full flex items-center justify-center text-xl"><i className="fas fa-clock"></i></div>
                    <div><p className="text-xs text-gray-500 dark:text-gray-400 uppercase font-bold">Sắp đóng phí</p><p className="text-xl font-bold text-gray-800 dark:text-gray-100">{metrics.upcomingDue}</p></div>
                </div>
                <div className="bg-white dark:bg-pru-card p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 flex items-center gap-4 transition-colors">
                    <div className="w-12 h-12 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center text-xl"><i className="fas fa-exclamation-triangle"></i></div>
                    <div><p className="text-xs text-gray-500 dark:text-gray-400 uppercase font-bold">Cần chú ý</p><p className="text-xl font-bold text-gray-800 dark:text-gray-100">{metrics.warningCount}</p></div>
                </div>
            </div>
            
            {/* Filter Bar */}
            <div className="bg-white dark:bg-pru-card p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col md:flex-row gap-4 items-center transition-colors">
                 <div className="relative flex-1 w-full">
                    <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
                    <input className="input-field pl-10" placeholder="Tìm số HĐ, tên KH..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                 </div>
                 <div className="flex gap-2 w-full md:w-auto">
                     <select className="input-field w-full md:w-auto" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                        <option value="all">Tất cả trạng thái</option>
                        {Object.values(ContractStatus).map(s => <option key={s} value={s}>{s}</option>)}
                     </select>
                     <select className="input-field w-full md:w-auto" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}>
                        <option value="all">Tất cả tháng</option>
                        {Array.from({length: 12}, (_, i) => i + 1).map(m => <option key={m} value={m}>Tháng {m}</option>)}
                     </select>
                 </div>
            </div>

            {/* 3. CONTENT AREA */}
            {filteredContracts.length === 0 ? (
                <div className="col-span-full py-12 flex flex-col items-center justify-center text-center text-gray-400 dark:text-gray-600 bg-white dark:bg-pru-card rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
                    <i className="fas fa-folder-open text-4xl mb-3 opacity-20"></i>
                    <p className="text-sm font-medium">Không tìm thấy hợp đồng nào.</p>
                    <p className="text-xs mt-1">Thử thay đổi bộ lọc hoặc thêm hợp đồng mới.</p>
                </div>
            ) : (
                <>
                    {/* VIEW MODE: GRID */}
                    {viewMode === 'grid' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                            {filteredContracts.map(contract => {
                                const customer = customers.find(c => c.id === contract.customerId);
                                return (
                                    <div key={contract.id} className="bg-white dark:bg-pru-card rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-800 hover:shadow-md transition group">
                                        <div className="flex justify-between items-start mb-4">
                                            <div>
                                                <div className="text-xs text-gray-500 dark:text-gray-400 font-bold uppercase tracking-wider mb-1">Hợp đồng số</div>
                                                <div className="text-lg font-bold text-pru-red dark:text-red-400 flex items-center gap-2">
                                                    <i className="fas fa-file-contract"></i>
                                                    {contract.contractNumber}
                                                </div>
                                            </div>
                                            <div className={`px-2 py-1 rounded text-xs font-bold ${contract.status === ContractStatus.ACTIVE ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                                                {contract.status}
                                            </div>
                                        </div>
                                        
                                        <div className="space-y-3 mb-4 border-b border-gray-100 dark:border-gray-800 pb-4">
                                            <div className="flex justify-between items-center">
                                                <span className="text-sm text-gray-600 dark:text-gray-400 flex items-center"><i className="fas fa-user mr-2 text-xs opacity-70"></i>Khách hàng</span>
                                                <span className="text-sm font-bold text-gray-800 dark:text-gray-200">{customer?.fullName || '---'}</span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <span className="text-sm text-gray-600 dark:text-gray-400 flex items-center"><i className="fas fa-shield-alt mr-2 text-xs opacity-70"></i>Sản phẩm chính</span>
                                                <span className="text-sm font-bold text-gray-800 dark:text-gray-200 text-right max-w-[60%] truncate" title={contract.mainProduct.productName}>{contract.mainProduct.productName}</span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <span className="text-sm text-gray-600 dark:text-gray-400 flex items-center"><i className="fas fa-coins mr-2 text-xs opacity-70"></i>Tổng phí ({contract.paymentFrequency})</span>
                                                <span className="text-sm font-bold text-pru-red dark:text-red-400">{contract.totalFee.toLocaleString()} đ</span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <span className="text-sm text-gray-600 dark:text-gray-400 flex items-center"><i className="fas fa-calendar-alt mr-2 text-xs opacity-70"></i>Đóng phí tới</span>
                                                <span className="text-sm font-bold text-gray-800 dark:text-gray-200">{formatDateVN(contract.nextPaymentDate)}</span>
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap gap-1 mb-4">
                                            {contract.riders.length > 0 ? (
                                                contract.riders.map((r, i) => (
                                                    <span key={i} className="text-[10px] bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-1 rounded-full border border-gray-200 dark:border-gray-600 truncate max-w-[100px]" title={r.productName}>
                                                        {r.productName.includes('Sức khỏe') ? 'Thẻ sức khỏe' : r.productName.includes('Tai nạn') ? 'Tai nạn' : r.productName.includes('Bệnh lý') ? 'Bệnh lý' : 'Bổ trợ'}
                                                    </span>
                                                ))
                                            ) : (
                                                <span className="text-[10px] text-gray-400 italic">Không có sản phẩm bổ trợ</span>
                                            )}
                                        </div>

                                        <div className="flex gap-2">
                                            <button onClick={() => handleQuickRenew(contract)} className="w-10 bg-green-50 hover:bg-green-100 text-green-600 rounded-lg flex items-center justify-center border border-green-200 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400 transition" title="Đóng phí nhanh (Gia hạn 1 kỳ)"><i className="fas fa-dollar-sign"></i></button>
                                            <button onClick={() => handleCopyReminder(contract)} className="flex-1 bg-yellow-50 dark:bg-yellow-900/20 hover:bg-yellow-100 text-yellow-700 dark:text-yellow-400 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center border border-yellow-200 dark:border-yellow-800"><i className="fas fa-bell mr-1"></i> Nhắc phí</button>
                                            <button onClick={() => handleOpenEdit(contract)} className="w-9 h-9 flex items-center justify-center bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg hover:text-blue-500 hover:bg-blue-50 transition border border-gray-200 dark:border-gray-600"><i className="fas fa-edit"></i></button>
                                            <button onClick={() => setDeleteConfirm({isOpen: true, id: contract.id, name: contract.contractNumber})} className="w-9 h-9 flex items-center justify-center bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg hover:text-red-500 hover:bg-red-50 transition border border-gray-200 dark:border-gray-600"><i className="fas fa-trash"></i></button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* VIEW MODE: LIST (TABLE) */}
                    {viewMode === 'list' && (
                        <div className="bg-white dark:bg-pru-card rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold border-b border-gray-100 dark:border-gray-700">
                                        <tr>
                                            <th className="px-6 py-4">Số HĐ</th>
                                            <th className="px-6 py-4">Khách hàng</th>
                                            <th className="px-6 py-4">Sản phẩm chính</th>
                                            <th className="px-6 py-4">Tổng phí</th>
                                            <th className="px-6 py-4">Ngày đến hạn</th>
                                            <th className="px-6 py-4">Trạng thái</th>
                                            <th className="px-6 py-4 text-center">Thao tác</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700 bg-white dark:bg-gray-900">
                                        {filteredContracts.map(contract => {
                                            const customer = customers.find(c => c.id === contract.customerId);
                                            return (
                                                <tr key={contract.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
                                                    <td className="px-6 py-4 font-bold text-pru-red dark:text-red-400">{contract.contractNumber}</td>
                                                    <td className="px-6 py-4 text-gray-800 dark:text-gray-200">{customer?.fullName}</td>
                                                    <td className="px-6 py-4 text-gray-600 dark:text-gray-400 max-w-xs truncate" title={contract.mainProduct.productName}>{contract.mainProduct.productName}</td>
                                                    <td className="px-6 py-4 font-medium">{contract.totalFee.toLocaleString()} đ</td>
                                                    <td className="px-6 py-4 text-gray-600 dark:text-gray-400">{formatDateVN(contract.nextPaymentDate)}</td>
                                                    <td className="px-6 py-4"><span className={`px-2 py-1 rounded text-xs font-bold ${contract.status === ContractStatus.ACTIVE ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{contract.status}</span></td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex justify-center gap-2">
                                                            <button onClick={() => handleQuickRenew(contract)} className="text-green-600 hover:bg-green-50 p-2 rounded" title="Đóng phí nhanh"><i className="fas fa-dollar-sign"></i></button>
                                                            <button onClick={() => handleCopyReminder(contract)} className="text-yellow-600 hover:bg-yellow-50 p-2 rounded" title="Nhắc phí"><i className="fas fa-bell"></i></button>
                                                            <button onClick={() => handleOpenEdit(contract)} className="text-blue-600 hover:bg-blue-50 p-2 rounded" title="Sửa"><i className="fas fa-edit"></i></button>
                                                            <button onClick={() => setDeleteConfirm({isOpen: true, id: contract.id, name: contract.contractNumber})} className="text-red-600 hover:bg-red-50 p-2 rounded" title="Xóa"><i className="fas fa-trash"></i></button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </>
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
                                <div>
                                    <label className="label-text">Ngày đóng phí tới</label>
                                    <input type="date" className="input-field" value={formData.nextPaymentDate} onChange={e => setFormData({...formData, nextPaymentDate: e.target.value})} />
                                    {!isEditing && formData.effectiveDate && <p className="text-[10px] text-green-600 mt-1 italic">* Đã tự động tính theo ngày hiệu lực</p>}
                                </div>
                                <div><label className="label-text">Trạng thái</label><select className="input-field" value={formData.status} onChange={(e:any) => setFormData({...formData, status: e.target.value})}>{Object.values(ContractStatus).map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                            </div>

                            {/* MAIN PRODUCT */}
                            <div className="bg-blue-50 dark:bg-blue-900/10 p-4 rounded-xl border border-blue-100 dark:border-blue-900/30">
                                <h4 className="font-bold text-blue-800 dark:text-blue-300 mb-3 text-sm uppercase">Sản phẩm chính</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="md:col-span-2">
                                        <select className="input-field" value={formData.mainProduct.productId} onChange={(e) => {
                                            const prod = mainProducts.find(p => p.id === e.target.value);
                                            let attributes: any = {};
                                            if (prod?.calculationType === ProductCalculationType.RATE_PER_1000_TERM) {
                                                attributes = { paymentTerm: 10 }; 
                                            }
                                            setFormData({...formData, mainProduct: {...formData.mainProduct, productId: e.target.value, productName: prod?.name || '', attributes}});
                                        }}>
                                            <option value="">-- Chọn sản phẩm --</option>
                                            {mainProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                        </select>
                                    </div>
                                    <SearchableCustomerSelect customers={customers} value={formData.mainProduct.insuredName || 'Người được BH'} onChange={c => setFormData({...formData, mainProduct: {...formData.mainProduct, insuredName: c.fullName}})} label="Người được bảo hiểm" />
                                    <div><label className="label-text">Mệnh giá (STBH)</label><CurrencyInput className="input-field" value={formData.mainProduct.sumAssured} onChange={v => setFormData({...formData, mainProduct: {...formData.mainProduct, sumAssured: v}})} /></div>
                                    
                                    {requiresTerm && (
                                        <div>
                                            <label className="label-text">Thời hạn đóng phí (Năm)</label>
                                            <select className="input-field" value={formData.mainProduct.attributes?.paymentTerm || 10} onChange={e => setFormData({...formData, mainProduct: {...formData.mainProduct, attributes: {...formData.mainProduct.attributes, paymentTerm: Number(e.target.value)}}})}>
                                                {Array.from({length: 25}, (_, i) => i + 5).map(y => <option key={y} value={y}>{y} năm</option>)}
                                            </select>
                                        </div>
                                    )}

                                    <div>
                                        <div className="flex justify-between items-center mb-1">
                                            <label className="label-text">Phí bảo hiểm</label>
                                            <button onClick={handleManualCheck} className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline flex items-center bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 rounded transition" title="Bấm để xem chi tiết thông số tính toán">
                                                <i className="fas fa-search mr-1"></i>Kiểm tra
                                            </button>
                                        </div>
                                        <CurrencyInput className="input-field font-bold text-pru-red dark:text-red-400" value={formData.mainProduct.fee} onChange={v => setFormData({...formData, mainProduct: {...formData.mainProduct, fee: v}})} />
                                        {/* CALCULATION STATUS FEEDBACK */}
                                        {calcStatus.msg && (
                                            <div className={`mt-2 text-xs flex items-start gap-1 ${
                                                calcStatus.type === 'error' ? 'text-red-600' : 
                                                calcStatus.type === 'warning' ? 'text-orange-600' : 
                                                calcStatus.type === 'success' ? 'text-green-600' : 'text-gray-500'
                                            }`}>
                                                <i className={`fas mt-0.5 ${
                                                    calcStatus.type === 'error' ? 'fa-exclamation-circle' : 
                                                    calcStatus.type === 'warning' ? 'fa-exclamation-triangle' : 
                                                    calcStatus.type === 'success' ? 'fa-check-circle' : 'fa-info-circle'
                                                }`}></i>
                                                <span>{calcStatus.msg}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* RIDERS */}
                            <div className="bg-orange-50 dark:bg-orange-900/10 p-4 rounded-xl border border-orange-100 dark:border-orange-900/30">
                                <div className="flex justify-between items-center mb-3">
                                    <h4 className="font-bold text-orange-800 dark:text-orange-300 text-sm uppercase">Sản phẩm bổ trợ</h4>
                                    <button onClick={handleAddRider} className="text-xs bg-white dark:bg-gray-800 border border-orange-200 dark:border-orange-800 text-orange-600 dark:text-orange-400 px-3 py-1 rounded font-bold hover:bg-orange-100 dark:hover:bg-orange-900/30">+ Thêm</button>
                                </div>
                                {formData.riders.map((rider, idx) => {
                                    const riderProdInfo = products.find(p => p.id === rider.productId);
                                    const calcType = riderProdInfo?.calculationType;
                                    const isHanhTrang = calcType === ProductCalculationType.HEALTH_CARE;
                                    const isAccident = calcType === ProductCalculationType.RATE_PER_1000_OCCUPATION;

                                    return (
                                        <div key={idx} className="relative bg-white dark:bg-gray-800 p-3 rounded-lg border border-orange-200 dark:border-orange-800/50 mb-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                                            <button onClick={() => {const r = [...formData.riders]; r.splice(idx, 1); setFormData({...formData, riders: r})}} className="absolute top-2 right-2 text-gray-300 hover:text-red-500"><i className="fas fa-times-circle"></i></button>
                                            <div className="md:col-span-2">
                                                <select className="input-field text-sm" value={rider.productId} onChange={(e) => {
                                                    const prod = riderProducts.find(p => p.id === e.target.value);
                                                    const newRiders = [...formData.riders];
                                                    let attributes: any = {};
                                                    if (prod?.calculationType === ProductCalculationType.HEALTH_CARE) {
                                                        attributes = { plan: HTVKPlan.NANG_CAO, package: HTVKPackage.STANDARD };
                                                    } else if (prod?.calculationType === ProductCalculationType.RATE_PER_1000_OCCUPATION) {
                                                        attributes = { occupationGroup: 1 };
                                                    } else if (prod?.calculationType === ProductCalculationType.RATE_PER_1000_TERM) {
                                                        attributes = { paymentTerm: 10 };
                                                    }
                                                    newRiders[idx] = { ...rider, productId: e.target.value, productName: prod?.name || '', attributes, fee: 0 };
                                                    setFormData({...formData, riders: newRiders});
                                                }}>
                                                    <option value="">-- Chọn SPBT --</option>
                                                    {riderProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                                </select>
                                            </div>
                                            <SearchableCustomerSelect customers={customers} value={rider.insuredName || ''} onChange={c => {
                                                 const newRiders = [...formData.riders];
                                                 newRiders[idx] = {...rider, insuredName: c.fullName};
                                                 
                                                 const age = calculateAge(c.dob) || 30; // Default age fallback for rider
                                                 const term = rider.attributes?.paymentTerm || 10;
                                                 const occ = rider.attributes?.occupationGroup || 1;
                                                 const plan = rider.attributes?.plan as HTVKPlan || HTVKPlan.NANG_CAO;
                                                 const pkg = rider.attributes?.package as HTVKPackage || HTVKPackage.STANDARD;

                                                 const fee = calculateProductFee({
                                                    product: riderProdInfo, 
                                                    calculationType: riderProdInfo?.calculationType || ProductCalculationType.FIXED,
                                                    productCode: riderProdInfo?.code,
                                                    sumAssured: rider.sumAssured,
                                                    age: age,
                                                    gender: c.gender,
                                                    term: term,
                                                    occupationGroup: occ,
                                                    htvkPlan: plan,
                                                    htvkPackage: pkg
                                                 });
                                                 newRiders[idx].fee = fee;
                                                 setFormData({...formData, riders: newRiders});
                                            }} label="Người được BH" className="text-sm" />

                                            {/* RIDER SPECIFIC INPUTS */}
                                            {isAccident && (
                                                <div>
                                                    <label className="text-[10px] uppercase font-bold text-gray-400">Nhóm nghề (1-4)</label>
                                                    <select 
                                                        className="input-field text-sm"
                                                        value={rider.attributes?.occupationGroup || 1}
                                                        onChange={(e) => {
                                                            const newRiders = [...formData.riders];
                                                            newRiders[idx].attributes = { ...newRiders[idx].attributes, occupationGroup: Number(e.target.value) };
                                                            const fee = calculateProductFee({ calculationType: ProductCalculationType.RATE_PER_1000_OCCUPATION, sumAssured: rider.sumAssured, age: 0, gender: Gender.MALE, occupationGroup: Number(e.target.value) });
                                                            newRiders[idx].fee = fee;
                                                            setFormData({...formData, riders: newRiders});
                                                        }}
                                                    >
                                                        <option value="1">Nhóm 1 (VP)</option><option value="2">Nhóm 2</option><option value="3">Nhóm 3</option><option value="4">Nhóm 4 (Nặng)</option>
                                                    </select>
                                                </div>
                                            )}

                                            {!isHanhTrang && (
                                                <div>
                                                    <label className="text-[10px] uppercase font-bold text-gray-400">STBH</label>
                                                    <CurrencyInput className="input-field text-sm" value={rider.sumAssured} onChange={v => {
                                                        const newRiders = [...formData.riders];
                                                        newRiders[idx].sumAssured = v;
                                                        const customer = customers.find(c => c.fullName === rider.insuredName);
                                                        if (customer) {
                                                            const term = rider.attributes?.paymentTerm || 10;
                                                            const occ = rider.attributes?.occupationGroup || 1;
                                                            const fee = calculateProductFee({
                                                                product: riderProdInfo, 
                                                                calculationType: riderProdInfo?.calculationType || ProductCalculationType.FIXED,
                                                                productCode: riderProdInfo?.code,
                                                                sumAssured: v,
                                                                age: calculateAge(customer.dob) || 30,
                                                                gender: customer.gender,
                                                                term: term,
                                                                occupationGroup: occ
                                                            });
                                                            newRiders[idx].fee = fee;
                                                        }
                                                        setFormData({...formData, riders: newRiders});
                                                    }} />
                                                </div>
                                            )}
                                            
                                            {isHanhTrang ? (
                                                <>
                                                    <div>
                                                        <label className="text-[10px] uppercase font-bold text-gray-400">Chương trình</label>
                                                        <select className="input-field text-sm" value={rider.attributes?.plan || HTVKPlan.NANG_CAO} onChange={(e) => {
                                                                const newRiders = [...formData.riders];
                                                                const plan = e.target.value as HTVKPlan;
                                                                newRiders[idx].attributes = { ...newRiders[idx].attributes, plan };
                                                                const customer = customers.find(c => c.fullName === rider.insuredName);
                                                                if (customer) {
                                                                    const age = calculateAge(customer.dob) || 30;
                                                                    const pkg = newRiders[idx].attributes?.package as HTVKPackage || HTVKPackage.STANDARD;
                                                                    newRiders[idx].fee = calculateProductFee({
                                                                        product: riderProdInfo, 
                                                                        calculationType: ProductCalculationType.HEALTH_CARE,
                                                                        sumAssured: 0, age, gender: customer.gender,
                                                                        htvkPlan: plan, htvkPackage: pkg
                                                                    });
                                                                }
                                                                setFormData({...formData, riders: newRiders});
                                                            }}>
                                                            {Object.values(HTVKPlan).map(p => <option key={p} value={p}>{p}</option>)}
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] uppercase font-bold text-gray-400">Phí</label>
                                                        <CurrencyInput className="input-field text-sm font-bold text-gray-700" value={rider.fee} onChange={v => {const r = [...formData.riders]; r[idx].fee = v; setFormData({...formData, riders: r})}} />
                                                    </div>
                                                </>
                                            ) : (
                                                <div><label className="text-[10px] uppercase font-bold text-gray-400">Phí</label><CurrencyInput className="input-field text-sm" value={rider.fee} onChange={v => {const r = [...formData.riders]; r[idx].fee = v; setFormData({...formData, riders: r})}} /></div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                            
                            {/* TOTAL SUMMARY */}
                            <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-xl flex justify-between items-center">
                                <span className="font-bold text-gray-700 dark:text-gray-200">Tổng phí dự kiến:</span>
                                <span className="text-xl font-bold text-pru-red dark:text-red-400">{(formData.mainProduct.fee + formData.riders.reduce((acc, r) => acc + (r.fee || 0), 0)).toLocaleString()} đ</span>
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

            <ExcelImportModal<Contract> isOpen={showImportModal} onClose={() => setShowImportModal(false)} title="Nhập Hợp Đồng từ Excel" onDownloadTemplate={() => downloadTemplate('contract')} onProcessFile={(file) => processContractImport(file, contracts, customers, products)} onSave={handleBatchSave} />

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

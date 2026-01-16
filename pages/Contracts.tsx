
import React, { useState, useMemo } from 'react';
import { Contract, Customer, Product, ProductType, ContractStatus, PaymentFrequency, ProductCalculationType, ContractProduct, Gender, ProductStatus, IssuanceType } from '../types';
import { SearchableCustomerSelect, CurrencyInput, ConfirmModal, formatDateVN } from '../components/Shared';
import { calculateProductFee } from '../services/productCalculator';
import { HTVKPlan, HTVKPackage } from '../data/pruHanhTrangVuiKhoe';
import { uploadFile } from '../services/storage';

interface ContractsPageProps {
    contracts: Contract[];
    customers: Customer[];
    products: Product[];
    onAdd: (c: Contract) => Promise<void>;
    onUpdate: (c: Contract) => Promise<void>;
    onDelete: (id: string) => Promise<void>;
}

const ContractsPage: React.FC<ContractsPageProps> = ({ contracts, customers, products, onAdd, onUpdate, onDelete }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState<string>('all');
    
    // UI States
    const [expandedContractId, setExpandedContractId] = useState<string | null>(null);

    // Modal
    const [showModal, setShowModal] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState<{isOpen: boolean, id: string, name: string}>({ isOpen: false, id: '', name: '' });
    const [isUploadingFile, setIsUploadingFile] = useState(false);

    const defaultContract: Contract = {
        id: '',
        contractNumber: '',
        customerId: '',
        effectiveDate: new Date().toISOString().split('T')[0],
        nextPaymentDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0],
        status: ContractStatus.ACTIVE,
        paymentFrequency: PaymentFrequency.ANNUAL,
        totalFee: 0,
        mainProduct: {
            productId: '',
            productName: '',
            insuredName: '',
            fee: 0,
            sumAssured: 0
        },
        riders: [],
        issuanceType: IssuanceType.STANDARD,
        loadingFee: 0,
        exclusionNote: '',
        decisionLetterUrl: ''
    };

    const [formData, setFormData] = useState<Contract>(defaultContract);

    // --- ANALYTICS LOGIC ---
    const stats = useMemo(() => {
        const activeContracts = contracts.filter(c => c.status === ContractStatus.ACTIVE);
        const totalAPE = activeContracts.reduce((sum, c) => sum + c.totalFee, 0);
        
        const today = new Date();
        const next30Days = new Date();
        next30Days.setDate(today.getDate() + 30);

        const upcomingRenewals = activeContracts.filter(c => {
            const date = new Date(c.nextPaymentDate);
            return date >= today && date <= next30Days;
        }).length;

        return {
            totalActive: activeContracts.length,
            totalAPE,
            upcomingRenewals
        };
    }, [contracts]);

    const filteredContracts = contracts.filter(c => {
        const customer = customers.find(cus => cus.id === c.customerId);
        const insuredName = c.mainProduct.insuredName || '';
        const searchMatch = c.contractNumber.includes(searchTerm) || 
                            (customer && customer.fullName.toLowerCase().includes(searchTerm.toLowerCase())) ||
                            insuredName.toLowerCase().includes(searchTerm.toLowerCase());
        const statusMatch = filterStatus === 'all' || c.status === filterStatus;
        return searchMatch && statusMatch;
    });

    const calculateAge = (dob: string) => {
        if (!dob) return 0;
        return new Date().getFullYear() - new Date(dob).getFullYear();
    };

    const handleOpenAdd = () => {
        setFormData(defaultContract);
        setIsEditing(false);
        setShowModal(true);
    };

    const handleOpenEdit = (c: Contract) => {
        setFormData({
            ...defaultContract, 
            ...c,
            issuanceType: c.issuanceType || IssuanceType.STANDARD
        });
        setIsEditing(true);
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!formData.contractNumber || !formData.customerId) return alert("Vui lòng nhập số HĐ và chọn khách hàng");
        
        // 1. Strict Recalculation of Total Fee
        // Total Fee = Main Product Fee + Sum(Rider Fees) + Loading Fee (If applicable)
        const baseFee = formData.mainProduct.fee;
        const riderFee = formData.riders.reduce((sum, r) => sum + r.fee, 0);
        const loading = formData.issuanceType === IssuanceType.CONDITIONAL ? (formData.loadingFee || 0) : 0;
        
        const strictTotalFee = baseFee + riderFee + loading;
        
        const finalData = { 
            ...formData, 
            totalFee: strictTotalFee,
            // Ensure loading fee is 0 if standard
            loadingFee: formData.issuanceType === IssuanceType.STANDARD ? 0 : formData.loadingFee 
        };

        if (isEditing) {
            await onUpdate(finalData);
        } else {
            await onAdd(finalData);
        }
        setShowModal(false);
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsUploadingFile(true);
        try {
            const url = await uploadFile(file, 'contract_docs');
            setFormData(prev => ({ ...prev, decisionLetterUrl: url }));
        } catch (err) {
            alert("Lỗi upload file: " + err);
        } finally {
            setIsUploadingFile(false);
        }
    };

    const handleUpdateMainProduct = (productId: string) => {
        const product = products.find(p => p.id === productId);
        if (!product) return;
        
        const insuredPerson = customers.find(c => c.fullName === formData.mainProduct.insuredName) || customers.find(c => c.id === formData.customerId);
        
        let fee = 0;
        if (insuredPerson) {
            const age = calculateAge(insuredPerson.dob);
            fee = calculateProductFee({
                product,
                calculationType: product.calculationType || ProductCalculationType.FIXED,
                productCode: product.code,
                sumAssured: formData.mainProduct.sumAssured,
                age,
                gender: insuredPerson.gender,
                term: formData.mainProduct.attributes?.paymentTerm || 15,
                occupationGroup: 1 
            });
        }

        setFormData(prev => ({
            ...prev,
            mainProduct: {
                ...prev.mainProduct,
                productId: product.id,
                productName: product.name,
                fee
            }
        }));
    };

    const handleUpdateMainFee = (updates: Partial<ContractProduct>) => {
        const currentMain = { ...formData.mainProduct, ...updates };
        const product = products.find(p => p.id === currentMain.productId);
        const insuredPerson = customers.find(c => c.fullName === currentMain.insuredName) || customers.find(c => c.id === formData.customerId);
        
        if (product && insuredPerson) {
             const age = calculateAge(insuredPerson.dob);
             currentMain.fee = calculateProductFee({
                product,
                calculationType: product.calculationType || ProductCalculationType.FIXED,
                productCode: product.code,
                sumAssured: currentMain.sumAssured,
                age,
                gender: insuredPerson.gender,
                term: currentMain.attributes?.paymentTerm || 15,
                occupationGroup: 1
            });
        }
        setFormData(prev => ({ ...prev, mainProduct: currentMain }));
    };

    const addRider = () => {
        setFormData(prev => ({
            ...prev,
            riders: [...prev.riders, {
                productId: '',
                productName: '',
                insuredName: customers.find(c => c.id === prev.customerId)?.fullName || '',
                fee: 0,
                sumAssured: 0,
                attributes: {
                    paymentTerm: 10,
                    occupationGroup: 1 
                }
            }]
        }));
    };

    const removeRider = (index: number) => {
        const newRiders = [...formData.riders];
        newRiders.splice(index, 1);
        setFormData(prev => ({ ...prev, riders: newRiders }));
    };

    const updateRider = (index: number, updates: Partial<ContractProduct> | { attributes: any }) => {
        const newRiders = [...formData.riders];
        let currentRider = { ...newRiders[index] };
        
        if ('attributes' in updates) {
            currentRider.attributes = { ...currentRider.attributes, ...updates.attributes };
            const { attributes, ...rest } = updates as any;
            currentRider = { ...currentRider, ...rest };
        } else {
            currentRider = { ...currentRider, ...updates };
        }
        
        const updatesWithProduct = updates as Partial<ContractProduct>;
        if (updatesWithProduct.productId) {
            const p = products.find(prod => prod.id === updatesWithProduct.productId);
            if (p) {
                currentRider.productName = p.name;
                currentRider.attributes = {
                    ...currentRider.attributes,
                    paymentTerm: 10, 
                    occupationGroup: 1, 
                };
                if (p.calculationType === ProductCalculationType.HEALTH_CARE) {
                    currentRider.attributes = { ...currentRider.attributes, plan: HTVKPlan.NANG_CAO, package: HTVKPackage.STANDARD };
                }
            }
        }

        const product = products.find(p => p.id === currentRider.productId);
        const customer = customers.find(c => c.fullName === currentRider.insuredName) || customers.find(c => c.id === formData.customerId);
        
        if (product && customer) {
            const age = calculateAge(customer.dob);
            currentRider.fee = calculateProductFee({
                product,
                calculationType: product.calculationType || ProductCalculationType.FIXED,
                productCode: product.code,
                sumAssured: currentRider.sumAssured,
                age,
                gender: customer.gender,
                term: Number(currentRider.attributes?.paymentTerm) || 10,
                occupationGroup: Number(currentRider.attributes?.occupationGroup) || 1,
                htvkPlan: currentRider.attributes?.plan as HTVKPlan,
                htvkPackage: currentRider.attributes?.package as HTVKPackage
            });
        }

        newRiders[index] = currentRider;
        setFormData(prev => ({ ...prev, riders: newRiders }));
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        alert(`Đã sao chép: ${text}`);
    };

    const getDaysUntilDue = (dateStr: string) => {
        const diff = new Date(dateStr).getTime() - new Date().getTime();
        return Math.ceil(diff / (1000 * 3600 * 24));
    };

    // Calculate Dynamic Total for Display
    const currentTotalFee = formData.mainProduct.fee + formData.riders.reduce((s,r) => s + r.fee, 0) + (formData.issuanceType === IssuanceType.CONDITIONAL ? (formData.loadingFee || 0) : 0);

    return (
        <div className="space-y-6 pb-20">
            {/* HEADER & STATS */}
            <div>
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 flex items-center">
                        <i className="fas fa-file-signature text-pru-red mr-3"></i> Quản lý Hợp đồng
                    </h1>
                    <button onClick={handleOpenAdd} className="bg-pru-red text-white px-5 py-2.5 rounded-xl hover:bg-red-700 transition shadow-lg shadow-red-500/30 font-bold flex items-center">
                        <i className="fas fa-plus mr-2"></i>Thêm Hợp đồng
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="bg-white dark:bg-pru-card p-4 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-green-50 dark:bg-green-900/20 text-green-600 flex items-center justify-center text-xl">
                            <i className="fas fa-check-circle"></i>
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase font-bold">HĐ Hiệu lực</p>
                            <p className="text-2xl font-black text-gray-800 dark:text-gray-100">{stats.totalActive}</p>
                        </div>
                    </div>
                    <div className="bg-white dark:bg-pru-card p-4 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 flex items-center justify-center text-xl">
                            <i className="fas fa-coins"></i>
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase font-bold">Tổng Phí (APE)</p>
                            <p className="text-2xl font-black text-gray-800 dark:text-gray-100">{(stats.totalAPE / 1000000).toLocaleString()} <span className="text-xs font-normal text-gray-500">Tr</span></p>
                        </div>
                    </div>
                    <div className="bg-white dark:bg-pru-card p-4 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-orange-50 dark:bg-orange-900/20 text-orange-600 flex items-center justify-center text-xl">
                            <i className="fas fa-clock"></i>
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase font-bold">Sắp đóng phí (30 ngày)</p>
                            <p className="text-2xl font-black text-gray-800 dark:text-gray-100">{stats.upcomingRenewals}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* FILTERS */}
            <div className="bg-white dark:bg-pru-card p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col md:flex-row gap-4 items-center">
                <div className="relative flex-1 w-full">
                    <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
                    <input className="w-full pl-10 pr-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 outline-none focus:ring-2 focus:ring-pru-red/20 focus:border-pru-red transition" placeholder="Tìm số HĐ, BMBH, NĐBH..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                </div>
                <div className="flex gap-2 w-full md:w-auto overflow-x-auto">
                    <button onClick={() => setFilterStatus('all')} className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap border transition ${filterStatus === 'all' ? 'bg-gray-800 text-white border-gray-800 dark:bg-white dark:text-gray-900' : 'bg-white text-gray-500 border-gray-200 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400'}`}>Tất cả</button>
                    {Object.values(ContractStatus).map(s => (
                        <button key={s} onClick={() => setFilterStatus(s)} className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap border transition ${filterStatus === s ? 'bg-pru-red text-white border-pru-red' : 'bg-white text-gray-500 border-gray-200 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400'}`}>{s}</button>
                    ))}
                </div>
            </div>

            {/* CONTRACT CARDS */}
            <div className="grid grid-cols-1 gap-4">
                {filteredContracts.map(contract => {
                    const customer = customers.find(c => c.id === contract.customerId);
                    const daysDue = getDaysUntilDue(contract.nextPaymentDate);
                    const isExpanded = expandedContractId === contract.id;
                    const isConditional = contract.issuanceType === IssuanceType.CONDITIONAL;

                    return (
                        <div key={contract.id} className="bg-white dark:bg-pru-card rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden hover:shadow-md transition group">
                            {/* Card Header */}
                            <div className="p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-gray-50 dark:border-gray-800">
                                <div className="flex items-center gap-4">
                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl shadow-sm ${contract.status === ContractStatus.ACTIVE ? 'bg-green-50 text-green-600 dark:bg-green-900/20' : 'bg-red-50 text-red-600 dark:bg-red-900/20'}`}>
                                        <i className={`fas ${contract.status === ContractStatus.ACTIVE ? 'fa-shield-alt' : 'fa-exclamation-triangle'}`}></i>
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <h3 className="font-black text-lg text-gray-800 dark:text-gray-100 cursor-pointer hover:text-pru-red transition" onClick={() => copyToClipboard(contract.contractNumber)} title="Bấm để sao chép">
                                                {contract.contractNumber}
                                            </h3>
                                            <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${contract.status === ContractStatus.ACTIVE ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{contract.status}</span>
                                            {isConditional && (
                                                <span className="text-[10px] px-2 py-0.5 rounded font-bold uppercase bg-orange-100 text-orange-700 border border-orange-200">
                                                    <i className="fas fa-exclamation-circle mr-1"></i> Có Loại trừ/Tăng phí
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                                            <span className="text-[10px] text-gray-400 dark:text-gray-500 uppercase font-bold mr-1">BMBH:</span> 
                                            {customer?.fullName || 'Khách hàng không xác định'}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
                                    <div className="text-right">
                                        <p className="text-xs text-gray-400 font-bold uppercase">Tổng phí ({contract.paymentFrequency})</p>
                                        <p className="text-lg font-black text-pru-red dark:text-red-400">{contract.totalFee.toLocaleString()} đ</p>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => handleOpenEdit(contract)} className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-900/30 transition flex items-center justify-center"><i className="fas fa-pen"></i></button>
                                        <button onClick={() => setDeleteConfirm({isOpen: true, id: contract.id, name: contract.contractNumber})} className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30 transition flex items-center justify-center"><i className="fas fa-trash"></i></button>
                                    </div>
                                </div>
                            </div>

                            {/* Card Body */}
                            <div className="p-5 bg-gray-50/50 dark:bg-gray-800/20">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
                                    {/* Main Product */}
                                    <div>
                                        <p className="text-[10px] text-gray-400 font-bold uppercase mb-2">Sản phẩm chính</p>
                                        <div className="flex items-start gap-2">
                                            <i className="fas fa-star text-yellow-400 mt-1"></i>
                                            <div>
                                                <p className="font-bold text-gray-800 dark:text-gray-200 text-sm">{contract.mainProduct.productName}</p>
                                                <p className="text-xs text-indigo-600 dark:text-indigo-400 font-bold mt-0.5 flex items-center">
                                                    <i className="fas fa-user-shield mr-1.5"></i> NĐBH: {contract.mainProduct.insuredName}
                                                </p>
                                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">STBH: {contract.mainProduct.sumAssured.toLocaleString()} đ</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Due Date & Progress */}
                                    <div>
                                        <div className="flex justify-between items-center mb-1">
                                            <p className="text-[10px] text-gray-400 font-bold uppercase">Hạn đóng phí</p>
                                            <span className={`text-xs font-bold ${daysDue < 0 ? 'text-red-500' : daysDue <= 30 ? 'text-orange-500' : 'text-green-500'}`}>
                                                {daysDue < 0 ? `Trễ ${Math.abs(daysDue)} ngày` : `Còn ${daysDue} ngày`}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                                <div 
                                                    className={`h-full rounded-full ${daysDue < 0 ? 'bg-red-500' : daysDue <= 30 ? 'bg-orange-500' : 'bg-green-500'}`} 
                                                    style={{width: `${Math.max(0, Math.min(100, 100 - (daysDue/365)*100))}%`}}
                                                ></div>
                                            </div>
                                            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{formatDateVN(contract.nextPaymentDate)}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Exclusion Warning in Card */}
                                {isConditional && (
                                    <div className="mb-4 bg-orange-50 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-800 p-3 rounded-lg flex items-start gap-3">
                                        <i className="fas fa-exclamation-triangle text-orange-600 mt-0.5"></i>
                                        <div>
                                            <p className="text-xs font-bold text-orange-800 dark:text-orange-300 uppercase">Lưu ý Thư thỏa thuận</p>
                                            <p className="text-xs text-gray-600 dark:text-gray-300 mt-1 line-clamp-2">{contract.exclusionNote || 'Có điều kiện loại trừ hoặc tăng phí.'}</p>
                                        </div>
                                    </div>
                                )}

                                {/* Collapsible Riders */}
                                {contract.riders.length > 0 && (
                                    <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
                                        <button 
                                            onClick={() => setExpandedContractId(isExpanded ? null : contract.id)}
                                            className="flex items-center text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline"
                                        >
                                            {isExpanded ? <i className="fas fa-chevron-up mr-1"></i> : <i className="fas fa-chevron-down mr-1"></i>}
                                            {isExpanded ? 'Thu gọn' : `Xem ${contract.riders.length} sản phẩm bổ trợ`}
                                        </button>
                                        
                                        {isExpanded && (
                                            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 animate-fade-in">
                                                {contract.riders.map((r, idx) => (
                                                    <div key={idx} className="bg-white dark:bg-gray-800 p-2 rounded border border-gray-100 dark:border-gray-700 flex justify-between items-center text-xs">
                                                        <div>
                                                            <p className="font-medium text-gray-800 dark:text-gray-200 line-clamp-1" title={r.productName}>{r.productName}</p>
                                                            <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400 text-[10px]">
                                                                <span>NĐBH: {r.insuredName}</span>
                                                                {r.attributes?.occupationGroup && <span className="bg-orange-100 text-orange-700 px-1 rounded">Nhóm {r.attributes.occupationGroup}</span>}
                                                                {r.attributes?.paymentTerm && <span className="bg-blue-100 text-blue-700 px-1 rounded">{r.attributes.paymentTerm} năm</span>}
                                                            </div>
                                                        </div>
                                                        <span className="font-bold text-gray-600 dark:text-gray-300">{r.fee.toLocaleString()} đ</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* MODAL */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in backdrop-blur-sm">
                    <div className="bg-white dark:bg-pru-card rounded-xl max-w-4xl w-full h-[90vh] flex flex-col shadow-2xl border border-gray-100 dark:border-gray-700 transition-colors">
                        <div className="p-5 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50 rounded-t-xl">
                            <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">{isEditing ? 'Cập nhật Hợp Đồng' : 'Thêm Hợp Đồng Mới'}</h3>
                            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><i className="fas fa-times text-xl"></i></button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            {/* GENERAL INFO */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div><label className="label-text">Số Hợp Đồng</label><input className="input-field" value={formData.contractNumber} onChange={e => setFormData({...formData, contractNumber: e.target.value})} /></div>
                                <div>
                                    <label className="label-text">Khách Hàng (Bên mua BH)</label>
                                    <SearchableCustomerSelect 
                                        customers={customers} 
                                        value={customers.find(c => c.id === formData.customerId)?.fullName || ''} 
                                        onChange={c => setFormData({...formData, customerId: c.id, mainProduct: {...formData.mainProduct, insuredName: c.fullName}})} 
                                    />
                                </div>
                                <div><label className="label-text">Ngày hiệu lực</label><input type="date" className="input-field" value={formData.effectiveDate} onChange={e => setFormData({...formData, effectiveDate: e.target.value})} /></div>
                                <div><label className="label-text">Ngày đóng phí tới</label><input type="date" className="input-field" value={formData.nextPaymentDate} onChange={e => setFormData({...formData, nextPaymentDate: e.target.value})} /></div>
                                <div><label className="label-text">Định kỳ đóng phí</label><select className="input-field" value={formData.paymentFrequency} onChange={(e: any) => setFormData({...formData, paymentFrequency: e.target.value})}>{Object.values(PaymentFrequency).map(f => <option key={f} value={f}>{f}</option>)}</select></div>
                                <div><label className="label-text">Trạng thái</label><select className="input-field" value={formData.status} onChange={(e: any) => setFormData({...formData, status: e.target.value})}>{Object.values(ContractStatus).map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                            </div>

                            {/* UNDERWRITING DECISION SECTION */}
                            <div className="bg-purple-50 dark:bg-purple-900/10 p-4 rounded-xl border border-purple-100 dark:border-purple-900/30">
                                <div className="flex justify-between items-center mb-3">
                                    <h4 className="font-bold text-purple-800 dark:text-purple-300 text-sm uppercase flex items-center">
                                        <i className="fas fa-file-medical-alt mr-2"></i> Quyết định Thẩm định (Underwriting)
                                    </h4>
                                    <div className="flex items-center gap-2">
                                        <label className="text-xs font-bold text-gray-600 dark:text-gray-300">Có điều kiện?</label>
                                        <button 
                                            onClick={() => setFormData({...formData, issuanceType: formData.issuanceType === IssuanceType.CONDITIONAL ? IssuanceType.STANDARD : IssuanceType.CONDITIONAL})}
                                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${formData.issuanceType === IssuanceType.CONDITIONAL ? 'bg-orange-500' : 'bg-gray-200 dark:bg-gray-700'}`}
                                        >
                                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formData.issuanceType === IssuanceType.CONDITIONAL ? 'translate-x-6' : 'translate-x-1'}`} />
                                        </button>
                                    </div>
                                </div>

                                {formData.issuanceType === IssuanceType.CONDITIONAL && (
                                    <div className="space-y-4 animate-fade-in">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <label className="label-text text-orange-600">Phí Tăng (Loading) VNĐ</label>
                                                <CurrencyInput className="input-field font-bold text-orange-600" value={formData.loadingFee || 0} onChange={v => setFormData({...formData, loadingFee: v})} />
                                            </div>
                                            <div>
                                                <label className="label-text">Đính kèm Thư thỏa thuận (Ảnh/PDF)</label>
                                                <div className="flex items-center gap-2">
                                                    <label className="cursor-pointer bg-white border border-gray-200 dark:border-gray-700 px-3 py-2 rounded-lg text-xs font-bold hover:bg-gray-50 flex items-center dark:bg-gray-800 dark:text-gray-300">
                                                        {isUploadingFile ? <i className="fas fa-spinner fa-spin mr-1"></i> : <i className="fas fa-upload mr-1"></i>} Upload
                                                        <input type="file" className="hidden" onChange={handleFileUpload} accept="image/*,.pdf" disabled={isUploadingFile} />
                                                    </label>
                                                    {formData.decisionLetterUrl && <a href={formData.decisionLetterUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-500 underline truncate max-w-[150px]">Xem file</a>}
                                                </div>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="label-text">Nội dung Loại trừ / Ghi chú</label>
                                            <textarea 
                                                className="input-field" 
                                                rows={2} 
                                                placeholder="VD: Loại trừ các bệnh lý liên quan đến dạ dày, tá tràng..." 
                                                value={formData.exclusionNote}
                                                onChange={e => setFormData({...formData, exclusionNote: e.target.value})}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* MAIN PRODUCT */}
                            <div className="bg-blue-50 dark:bg-blue-900/10 p-4 rounded-xl border border-blue-100 dark:border-blue-900/30">
                                <h4 className="font-bold text-blue-700 dark:text-blue-300 mb-3 text-sm uppercase">Sản phẩm chính</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="label-text">Tên sản phẩm</label>
                                        <select className="input-field" value={formData.mainProduct.productId} onChange={(e) => handleUpdateMainProduct(e.target.value)}>
                                            <option value="">-- Chọn sản phẩm --</option>
                                            {products.filter(p => p.type === ProductType.MAIN && p.status === ProductStatus.ACTIVE).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="label-text">Người được BH</label>
                                        <SearchableCustomerSelect 
                                            customers={customers} 
                                            value={formData.mainProduct.insuredName} 
                                            onChange={(c) => {
                                                const product = products.find(p => p.id === formData.mainProduct.productId);
                                                let newFee = formData.mainProduct.fee;

                                                if (product) {
                                                    const age = calculateAge(c.dob);
                                                    newFee = calculateProductFee({
                                                        product,
                                                        calculationType: product.calculationType || ProductCalculationType.FIXED,
                                                        productCode: product.code,
                                                        sumAssured: formData.mainProduct.sumAssured,
                                                        age,
                                                        gender: c.gender,
                                                        term: formData.mainProduct.attributes?.paymentTerm || 15,
                                                        occupationGroup: 1
                                                    });
                                                }

                                                setFormData(prev => ({
                                                    ...prev,
                                                    mainProduct: {
                                                        ...prev.mainProduct,
                                                        insuredName: c.fullName,
                                                        fee: newFee
                                                    }
                                                }));
                                            }}
                                        />
                                    </div>
                                    <div>
                                        <label className="label-text">Số tiền bảo hiểm (STBH)</label>
                                        <CurrencyInput className="input-field" value={formData.mainProduct.sumAssured} onChange={v => handleUpdateMainFee({sumAssured: v})} />
                                    </div>
                                    <div>
                                        <label className="label-text">Phí bảo hiểm (VNĐ)</label>
                                        <CurrencyInput className="input-field font-bold text-blue-600" value={formData.mainProduct.fee} onChange={v => setFormData({...formData, mainProduct: {...formData.mainProduct, fee: v}})} />
                                    </div>
                                </div>
                            </div>

                            {/* RIDERS */}
                            <div className="bg-orange-50 dark:bg-orange-900/10 p-4 rounded-xl border border-orange-100 dark:border-orange-900/30">
                                <div className="flex justify-between items-center mb-3">
                                    <h4 className="font-bold text-orange-700 dark:text-orange-300 text-sm uppercase">Sản phẩm bổ trợ</h4>
                                    <button onClick={addRider} className="text-xs bg-orange-200 dark:bg-orange-800 text-orange-800 dark:text-orange-100 px-2 py-1 rounded font-bold hover:bg-orange-300 transition">+ Thêm Rider</button>
                                </div>
                                <div className="space-y-3">
                                    {formData.riders.map((rider, idx) => {
                                        const riderProdInfo = products.find(p => p.id === rider.productId);
                                        const isHealth = riderProdInfo?.calculationType === ProductCalculationType.HEALTH_CARE;
                                        const isAccident = riderProdInfo?.calculationType === ProductCalculationType.RATE_PER_1000_OCCUPATION;
                                        const needsTerm = riderProdInfo?.calculationType === ProductCalculationType.RATE_PER_1000_TERM || riderProdInfo?.calculationType === ProductCalculationType.RATE_PER_1000_AGE_GENDER;
                                        
                                        // Find Customer for Hint
                                        const riderCustomer = customers.find(c => c.fullName === rider.insuredName);
                                        const customerJob = riderCustomer?.job || riderCustomer?.occupation || 'Chưa có thông tin';

                                        return (
                                            <div key={idx} className="bg-white dark:bg-gray-800 p-3 rounded-lg border border-orange-200 dark:border-orange-800/50 shadow-sm relative group">
                                                <button onClick={() => removeRider(idx)} className="absolute top-2 right-2 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition"><i className="fas fa-times-circle"></i></button>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                    <div>
                                                        <label className="label-text">Sản phẩm</label>
                                                        <select className="input-field py-1.5 text-xs" value={rider.productId} onChange={(e) => updateRider(idx, { productId: e.target.value })}>
                                                            <option value="">-- Chọn Rider --</option>
                                                            {products.filter(p => p.type === ProductType.RIDER && p.status === ProductStatus.ACTIVE).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label className="label-text">Người được BH</label>
                                                        <SearchableCustomerSelect customers={customers} value={rider.insuredName} onChange={c => updateRider(idx, { insuredName: c.fullName })} className="text-xs" />
                                                    </div>
                                                    
                                                    {/* Dynamic Fields based on Product Type */}
                                                    {isHealth ? (
                                                        <>
                                                            <div>
                                                                <label className="label-text">Chương trình</label>
                                                                <select className="input-field py-1.5 text-xs" value={rider.attributes?.plan || HTVKPlan.NANG_CAO} onChange={(e) => updateRider(idx, { attributes: { plan: e.target.value } })}>
                                                                    {Object.values(HTVKPlan).map(p => <option key={p} value={p}>{p}</option>)}
                                                                </select>
                                                            </div>
                                                            {/* Snippet Logic Integration */}
                                                            {(rider.attributes?.plan === HTVKPlan.TOAN_DIEN || rider.attributes?.plan === HTVKPlan.HOAN_HAO) && (
                                                                <div>
                                                                    <label className="label-text text-[10px] uppercase font-bold text-gray-400">Gói</label>
                                                                    <select className="input-field text-sm py-1.5" value={rider.attributes?.package || HTVKPackage.GOI_1} onChange={(e) => updateRider(idx, { attributes: { package: e.target.value } })}>
                                                                        <option value={HTVKPackage.STANDARD}>Chuẩn</option>
                                                                        <option value={HTVKPackage.GOI_1}>Gói 1 (Có MT)</option>
                                                                        <option value={HTVKPackage.GOI_2}>Gói 2 (Không MT)</option>
                                                                    </select>
                                                                </div>
                                                            )}
                                                        </>
                                                    ) : (
                                                        <div>
                                                            <label className="label-text">Số tiền bảo hiểm</label>
                                                            <CurrencyInput className="input-field py-1.5 text-xs" value={rider.sumAssured} onChange={v => updateRider(idx, { sumAssured: v })} />
                                                        </div>
                                                    )}

                                                    {/* Dynamic: Occupation Group for Accident */}
                                                    {isAccident && (
                                                        <div>
                                                            <label className="label-text text-orange-600 flex items-center justify-between">
                                                                Nhóm nghề (Tính phí)
                                                                <span className="text-[9px] text-gray-400 font-normal ml-1 bg-gray-100 px-1 rounded">
                                                                    Nghề: {customerJob}
                                                                </span>
                                                            </label>
                                                            <select 
                                                                className="input-field py-1.5 text-xs bg-orange-50 dark:bg-orange-900/20"
                                                                value={rider.attributes?.occupationGroup || 1} 
                                                                onChange={(e) => updateRider(idx, { attributes: { occupationGroup: Number(e.target.value) } })}
                                                            >
                                                                <option value="1">Nhóm 1 (Hành chính)</option>
                                                                <option value="2">Nhóm 2 (Đi lại, Quản lý)</option>
                                                                <option value="3">Nhóm 3 (Lao động nhẹ)</option>
                                                                <option value="4">Nhóm 4 (Lao động nặng/nguy hiểm)</option>
                                                            </select>
                                                        </div>
                                                    )}

                                                    {/* Dynamic: Term for Term-based products */}
                                                    {needsTerm && (
                                                        <div>
                                                            <label className="label-text text-blue-600">Thời hạn (Năm)</label>
                                                            <input 
                                                                type="number" 
                                                                className="input-field py-1.5 text-xs bg-blue-50 dark:bg-blue-900/20" 
                                                                value={rider.attributes?.paymentTerm || 10} 
                                                                onChange={e => updateRider(idx, { attributes: { paymentTerm: Number(e.target.value) } })}
                                                                placeholder="VD: 10, 15..."
                                                            />
                                                        </div>
                                                    )}

                                                    <div>
                                                        <label className="label-text">Phí (VNĐ)</label>
                                                        <CurrencyInput className="input-field py-1.5 text-xs font-bold text-orange-600" value={rider.fee} onChange={v => updateRider(idx, { fee: v })} />
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        <div className="p-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 rounded-b-xl flex justify-between items-center">
                            <div className="text-sm">
                                <span className="text-gray-500 dark:text-gray-400">Tổng phí tự động tính:</span>
                                <span className="font-bold text-lg text-pru-red dark:text-red-400 ml-2">{currentTotalFee.toLocaleString()} đ</span>
                            </div>
                            <div className="flex gap-3">
                                <button onClick={() => setShowModal(false)} className="px-5 py-2 text-gray-600 dark:text-gray-300 font-medium hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Hủy</button>
                                <button onClick={handleSave} className="px-5 py-2 bg-pru-red text-white font-bold rounded-lg hover:bg-red-700 shadow-md">Lưu Hợp Đồng</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <ConfirmModal isOpen={deleteConfirm.isOpen} title="Xóa hợp đồng?" message={`Bạn có chắc muốn xóa hợp đồng số ${deleteConfirm.name}?`} onConfirm={() => onDelete(deleteConfirm.id)} onClose={() => setDeleteConfirm({ isOpen: false, id: '', name: '' })} />

            <style>{`
                .label-text { display: block; font-size: 0.7rem; font-weight: 700; color: #6b7280; margin-bottom: 0.25rem; }
                .dark .label-text { color: #9ca3af; }
                .input-field { width: 100%; border: 1px solid #e5e7eb; padding: 0.5rem; border-radius: 0.5rem; outline: none; font-size: 0.875rem; transition: all; background-color: #fff; color: #111827; }
                .dark .input-field { background-color: #111827; border-color: #374151; color: #f3f4f6; }
                .input-field:focus { border-color: #ed1b2e; ring: 1px solid #ed1b2e; }
            `}</style>
        </div>
    );
};

export default ContractsPage;


import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Customer, Contract, Appointment, CustomerStatus, Gender, MaritalStatus, FinancialRole, IncomeTrend, RiskTolerance, FinancialPriority, RelationshipType, Illustration, FinancialStatus, PersonalityType, ReadinessLevel } from '../types';
import { ConfirmModal, formatDateVN } from '../components/Shared';
import ExcelImportModal from '../components/ExcelImportModal';
import { downloadTemplate, processCustomerImport } from '../utils/excelHelpers';
import { extractIdentityCard } from '../services/geminiService';

interface CustomersPageProps {
    customers: Customer[];
    contracts: Contract[];
    appointments?: Appointment[]; // Add appointments to props for dependency checking
    illustrations?: Illustration[]; 
    onAdd: (c: Customer) => Promise<void>;
    onUpdate: (c: Customer) => Promise<void>;
    onDelete: (id: string) => Promise<void>;
    onConvertIllustration?: (ill: Illustration, customerId: string) => Promise<void>; 
    onDeleteIllustration?: (id: string) => Promise<void>;
}

const CustomersPage: React.FC<CustomersPageProps> = ({ customers, contracts, appointments = [], illustrations = [], onAdd, onUpdate, onDelete, onConvertIllustration, onDeleteIllustration }) => {
    const navigate = useNavigate();
    const location = useLocation(); // Hook to read state passed from Magic Button
    
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState<string>('all');
    
    // Modal States
    const [showModal, setShowModal] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false); 
    const [deleteConfirm, setDeleteConfirm] = useState<{isOpen: boolean, id: string, name: string}>({ isOpen: false, id: '', name: '' });
    
    // Scan ID State
    const [isScanning, setIsScanning] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Empty Customer Template
    const defaultCustomer: Customer = {
        id: '',
        fullName: '',
        gender: Gender.MALE,
        dob: '',
        phone: '',
        idCard: '',
        job: '',
        occupation: '', 
        companyAddress: '',
        maritalStatus: MaritalStatus.MARRIED,
        financialRole: FinancialRole.MAIN_BREADWINNER,
        dependents: 0,
        status: CustomerStatus.POTENTIAL,
        interactionHistory: [],
        timeline: [],
        claims: [],
        relationships: [],
        documents: [], 
        health: { medicalHistory: '', height: 165, weight: 60, habits: '' },
        analysis: {
            incomeMonthly: 0,
            incomeTrend: IncomeTrend.STABLE,
            projectedIncome3Years: 0,
            monthlyExpenses: 0,
            existingInsurance: {
                hasLife: false, lifeSumAssured: 0, lifeFee: 0, lifeTermRemaining: 0,
                hasAccident: false, accidentSumAssured: 0,
                hasCI: false, ciSumAssured: 0,
                hasHealthCare: false, healthCareFee: 0,
                dissatisfaction: ''
            },
            currentPriority: FinancialPriority.PROTECTION,
            futurePlans: '',
            biggestWorry: '',
            pastExperience: '',
            influencer: '',
            buyCondition: '',
            preference: 'Balanced',
            riskTolerance: RiskTolerance.MEDIUM,
            childrenCount: 0,
            financialStatus: FinancialStatus.STABLE,
            personality: PersonalityType.ANALYTICAL,
            readiness: ReadinessLevel.COLD
        }
    };
    const [formData, setFormData] = useState<Customer>(defaultCustomer);

    // --- EFFECT: AUTO TRIGGER SCAN FROM MAGIC BUTTON ---
    useEffect(() => {
        if (location.state && location.state.triggerScan) {
            // Clear state to prevent re-trigger on refresh
            window.history.replaceState({}, document.title);
            // Trigger Scan Input Click
            fileInputRef.current?.click();
        }
    }, [location]);

    const filteredCustomers = customers.filter(c => {
        const matchesSearch = c.fullName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                              c.phone.includes(searchTerm) || 
                              (c.idCard && c.idCard.includes(searchTerm));
        const matchesStatus = filterStatus === 'all' || c.status === filterStatus;
        return matchesSearch && matchesStatus;
    });

    // --- SMART VALIDATION HANDLERS ---

    const checkDuplicate = (customer: Customer): string | null => {
        // Normalize phone: remove spaces, dots, dashes
        const normalize = (str: string) => str.replace(/[\s\.\-]/g, '');
        const newPhone = normalize(customer.phone);
        const newIdCard = customer.idCard ? normalize(customer.idCard) : '';

        const duplicate = customers.find(c => {
            // Skip self check if updating
            if (customer.id && c.id === customer.id) return false;

            const existPhone = normalize(c.phone);
            const existIdCard = c.idCard ? normalize(c.idCard) : '';

            // Check Phone collision
            if (newPhone && existPhone === newPhone) return true;
            // Check ID Card collision
            if (newIdCard && existIdCard === newIdCard) return true;

            return false;
        });

        if (duplicate) {
            return `Trùng lặp dữ liệu! Khách hàng "${duplicate.fullName}" đã tồn tại với SĐT hoặc CCCD này.`;
        }
        return null;
    };

    const handleOpenAdd = () => {
        setFormData(defaultCustomer);
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!formData.fullName) return alert("Vui lòng nhập Họ tên khách hàng");
        if (!formData.phone) return alert("Vui lòng nhập Số điện thoại");

        // 1. Check Duplicates
        const duplicateError = checkDuplicate(formData);
        if (duplicateError) {
            alert(duplicateError);
            return;
        }

        await onAdd(formData);
        setShowModal(false);
    };

    const handleDeleteClick = (c: Customer) => {
        // 2. Check Dependencies (Safe Delete)
        const relatedContracts = contracts.filter(ct => ct.customerId === c.id);
        const relatedApps = appointments.filter(a => a.customerId === c.id);

        if (relatedContracts.length > 0) {
            alert(`KHÔNG THỂ XÓA!\nKhách hàng ${c.fullName} đang đứng tên ${relatedContracts.length} Hợp đồng.\nVui lòng xóa hoặc chuyển đổi hợp đồng trước.`);
            return;
        }

        if (relatedApps.length > 0) {
            const confirmApp = window.confirm(`CẢNH BÁO: Khách hàng này có ${relatedApps.length} lịch hẹn/công việc liên quan. Nếu xóa khách hàng, các lịch hẹn này có thể bị lỗi hiển thị. Bạn có chắc chắn muốn tiếp tục?`);
            if (!confirmApp) return;
        }

        setDeleteConfirm({isOpen: true, id: c.id, name: c.fullName});
    };

    const getActiveContractCount = (customerId: string) => {
        return contracts.filter(c => c.customerId === customerId && c.status === 'Đang hiệu lực').length;
    };

    const handleBatchSave = async (validCustomers: Customer[]) => { 
        // Filter duplicates in batch
        const uniqueOnes = [];
        for (const c of validCustomers) {
            if (!checkDuplicate(c)) {
                uniqueOnes.push(c);
            }
        }
        if (uniqueOnes.length < validCustomers.length) {
            alert(`Đã bỏ qua ${validCustomers.length - uniqueOnes.length} khách hàng do trùng lặp dữ liệu.`);
        }
        await Promise.all(uniqueOnes.map(c => onAdd(c))); 
    };

    // --- ID CARD SCAN HANDLER ---
    const handleScanIdCard = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsScanning(true);
        try {
            const reader = new FileReader();
            reader.onloadend = async () => {
                const base64String = reader.result as string;
                const base64Content = base64String.split(',')[1];
                
                const extractedData = await extractIdentityCard(base64Content);
                
                if (extractedData) {
                    setFormData({
                        ...defaultCustomer,
                        fullName: extractedData.fullName || '',
                        idCard: extractedData.idCard || '',
                        dob: extractedData.dob || '',
                        gender: (extractedData.gender as Gender) || Gender.OTHER,
                        companyAddress: extractedData.companyAddress || '',
                        interactionHistory: [`Quét CCCD: ${new Date().toLocaleDateString('vi-VN')}`]
                    });
                    setShowModal(true); // Open the modal with pre-filled data
                } else {
                    alert("Không thể đọc thông tin từ ảnh này. Vui lòng thử lại hoặc nhập tay.");
                }
                setIsScanning(false);
            };
            reader.readAsDataURL(file);
        } catch (error) {
            console.error("Scan Error", error);
            alert("Lỗi xử lý ảnh: " + error);
            setIsScanning(false);
        } finally {
            // Reset input so same file can be selected again if needed
            e.target.value = ''; 
        }
    };

    return (
        <div className="space-y-6">
            {/* Header & Filters */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Quản lý Khách hàng</h1>
                <div className="flex gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
                    {/* Hide Excel Import on Mobile (hidden md:flex) */}
                    <button onClick={() => setShowImportModal(true)} className="hidden md:flex bg-green-600 text-white px-4 py-2.5 rounded-xl hover:bg-green-700 transition font-medium items-center whitespace-nowrap text-sm"><i className="fas fa-file-excel mr-2"></i>Nhập Excel</button>
                    
                    {/* SCAN ID BUTTON */}
                    <button 
                        onClick={() => fileInputRef.current?.click()} 
                        disabled={isScanning}
                        className="bg-blue-600 text-white px-4 py-2.5 rounded-xl hover:bg-blue-700 transition font-medium flex items-center whitespace-nowrap text-sm disabled:opacity-70"
                    >
                        {isScanning ? <i className="fas fa-spinner fa-spin mr-2"></i> : <i className="fas fa-camera mr-2"></i>}
                        {isScanning ? 'Đang đọc...' : 'Quét CCCD'}
                    </button>
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        className="hidden" 
                        accept="image/*" 
                        capture="environment" // Prefer rear camera on mobile
                        onChange={handleScanIdCard} 
                    />

                    <button onClick={handleOpenAdd} className="bg-pru-red text-white px-4 py-2.5 rounded-xl hover:bg-red-700 transition font-medium flex items-center whitespace-nowrap text-sm"><i className="fas fa-user-plus mr-2"></i>Thêm mới</button>
                </div>
            </div>
            
            <div className="bg-white dark:bg-pru-card p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col md:flex-row gap-4 items-center transition-colors">
                <div className="relative w-full md:w-1/3">
                    <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
                    <input className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:ring-1 focus:ring-pru-red outline-none bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200" placeholder="Tìm tên, SĐT, CCCD..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                </div>
                <div className="flex gap-2 w-full md:w-auto overflow-x-auto">
                    <button onClick={() => setFilterStatus('all')} className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap border ${filterStatus === 'all' ? 'bg-gray-800 dark:bg-white text-white dark:text-gray-900' : 'bg-white dark:bg-gray-900 text-gray-500'}`}>Tất cả</button>
                    {Object.values(CustomerStatus).map(s => (<button key={s} onClick={() => setFilterStatus(s)} className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap border ${filterStatus === s ? 'bg-red-50 text-pru-red' : 'bg-white text-gray-500'}`}>{s}</button>))}
                </div>
            </div>

            {/* Grid List */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredCustomers.map(c => (
                    <div key={c.id} onClick={() => navigate(`/customers/${c.id}`)} className="bg-white dark:bg-pru-card rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 hover:shadow-md transition group flex flex-col cursor-pointer">
                        <div className="p-5 flex items-start justify-between border-b border-gray-50 dark:border-gray-800">
                            <div className="flex items-center gap-3">
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold border-2 ${c.gender === Gender.FEMALE ? 'bg-pink-50 text-pink-500' : 'bg-blue-50 text-blue-500'}`}>{c.fullName.charAt(0)}</div>
                                <div><h3 className="font-bold text-gray-800 dark:text-gray-100 line-clamp-1">{c.fullName}</h3><p className="text-xs text-gray-500">{c.job || c.occupation}</p></div>
                            </div>
                            <span className={`w-2 h-2 rounded-full ${c.status === CustomerStatus.SIGNED ? 'bg-green-500' : 'bg-yellow-500'}`}></span>
                        </div>
                        <div className="p-5 space-y-3 flex-1">
                            <div className="flex items-center text-sm text-gray-600 dark:text-gray-300"><i className="fas fa-phone-alt w-5 text-gray-400 text-xs"></i><span>{c.phone || 'Chưa có SĐT'}</span></div>
                            <div className="flex items-center text-sm text-gray-600 dark:text-gray-300">
                                <i className="fas fa-money-bill-wave w-5 text-gray-400 text-xs"></i>
                                <span>{c.analysis.incomeMonthly > 0 ? `${c.analysis.incomeMonthly.toLocaleString()} đ/tháng` : 'Chưa cập nhật thu nhập'}</span>
                            </div>
                            <div className="flex items-center text-sm text-gray-600 dark:text-gray-300"><i className="fas fa-file-contract w-5 text-gray-400 text-xs"></i><span>{getActiveContractCount(c.id)} HĐ hiệu lực</span></div>
                        </div>
                        <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-b-xl border-t border-gray-100 dark:border-gray-800 flex justify-between items-center gap-2">
                            <button onClick={(e) => { e.stopPropagation(); navigate(`/advisory/${c.id}`); }} className="flex-1 py-1.5 rounded-lg bg-purple-100 text-purple-700 text-xs font-bold hover:bg-purple-200 flex items-center justify-center"><i className="fas fa-theater-masks mr-1.5"></i>Roleplay</button>
                            <button onClick={(e) => { e.stopPropagation(); handleDeleteClick(c); }} className="w-8 h-8 rounded bg-white border text-red-500 flex items-center justify-center hover:bg-red-50"><i className="fas fa-trash"></i></button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Quick Add Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in backdrop-blur-sm">
                    <div className="bg-white dark:bg-pru-card rounded-xl max-w-lg w-full p-6 shadow-2xl flex flex-col transition-colors">
                        <div className="flex justify-between items-center mb-4 border-b border-gray-100 dark:border-gray-700 pb-2">
                            <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">Thêm Khách Hàng Nhanh</h3>
                            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><i className="fas fa-times text-xl"></i></button>
                        </div>
                        
                        {/* Scan Alert */}
                        {formData.interactionHistory[0]?.includes("Quét CCCD") && (
                            <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300 p-3 rounded-lg text-xs mb-4 flex items-center">
                                <i className="fas fa-check-circle mr-2 text-lg"></i>
                                <span>Đã điền tự động từ CCCD. Vui lòng bổ sung SĐT để hoàn tất.</span>
                            </div>
                        )}

                        <div className="space-y-4 mb-6">
                            <div><label className="label-text">Họ và tên *</label><input className="input-field" value={formData.fullName} onChange={e => setFormData({...formData, fullName: e.target.value})} /></div>
                            <div><label className="label-text">Số điện thoại *</label><input className="input-field" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} placeholder="Nhập SĐT..." autoFocus={!formData.phone} /></div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="label-text">Giới tính</label><select className="input-field" value={formData.gender} onChange={(e: any) => setFormData({...formData, gender: e.target.value})}>{Object.values(Gender).map(v => <option key={v} value={v}>{v}</option>)}</select></div>
                                <div><label className="label-text">Ngày sinh</label><input type="date" className="input-field" value={formData.dob} onChange={e => setFormData({...formData, dob: e.target.value})} /></div>
                            </div>
                            <div><label className="label-text">Số CCCD</label><input className="input-field" value={formData.idCard} onChange={e => setFormData({...formData, idCard: e.target.value})} /></div>
                            <div><label className="label-text">Địa chỉ</label><input className="input-field" value={formData.companyAddress} onChange={e => setFormData({...formData, companyAddress: e.target.value})} /></div>
                        </div>
                        <div className="flex justify-end gap-3">
                            <button onClick={() => setShowModal(false)} className="px-4 py-2 text-gray-600 dark:text-gray-300 font-medium hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Hủy</button>
                            <button onClick={handleSave} className="px-4 py-2 bg-pru-red text-white font-bold rounded-lg hover:bg-red-700 shadow-md">Lưu Nhanh</button>
                        </div>
                        <p className="text-xs text-center text-gray-400 mt-4 italic">Hệ thống sẽ tự động kiểm tra trùng lặp SĐT/CCCD.</p>
                    </div>
                </div>
            )}
            
            <ConfirmModal isOpen={deleteConfirm.isOpen} title="Xóa khách hàng?" message={`Bạn có chắc muốn xóa khách hàng ${deleteConfirm.name}? Hành động này không thể hoàn tác.`} onConfirm={() => onDelete(deleteConfirm.id)} onClose={() => setDeleteConfirm({ isOpen: false, id: '', name: '' })} />
            <ExcelImportModal isOpen={showImportModal} onClose={() => setShowImportModal(false)} title="Nhập Khách Hàng từ Excel" onDownloadTemplate={() => downloadTemplate('customer')} onProcessFile={(file) => processCustomerImport(file, customers)} onSave={handleBatchSave} />

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

export default CustomersPage;

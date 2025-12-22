
import React, { useState, useEffect, useRef } from 'react';
import { HashRouter as Router, Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import AIChat from './pages/AIChat';
import { AppState, Customer, Contract, Product, Appointment, CustomerStatus, ProductType, ContractStatus, AppointmentType, AppointmentStatus, ContractProduct, PaymentFrequency, Gender, FinancialStatus, PersonalityType, ReadinessLevel, AgentProfile, CustomerDocument, RelationshipType, CustomerRelationship, MessageTemplate } from './types';
import { subscribeToCollection, addData, updateData, deleteData, COLLECTIONS } from './services/db';
import { extractTextFromPdf, consultantChat } from './services/geminiService';
import { uploadFile } from './services/storage';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';

// --- HELPER FUNCTIONS & COMPONENTS ---
const formatDateVN = (dateStr: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const [y, m, d] = parts;
    return `${d}/${m}/${y}`;
};

// --- Formatter for Advisory Chat (HTML Display) ---
const formatAdvisoryContent = (text: string) => {
    let html = text;
    // Sanitize HTML
    html = html.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    // Headers (### Title) -> Red Title
    html = html.replace(/^### (.*$)/gim, '<h3 class="text-pru-red font-bold text-base mt-3 mb-1 border-b border-red-100 pb-1">$1</h3>');
    
    // Bold (**text**) -> Red Bold text for emphasis
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-gray-900 bg-red-50 px-1 rounded border border-red-100">$1</strong>');
    
    // Italic (*text*) -> Gray Italic
    html = html.replace(/\*(.*?)\*/g, '<em class="italic text-gray-500">$1</em>');

    // Lists (- item) -> Styled List
    html = html.replace(/^\- (.*$)/gim, '<div class="flex items-start ml-1 mb-1"><span class="text-pru-red mr-2 font-bold">•</span><span>$1</span></div>');

    // Newlines
    html = html.replace(/\n/g, '<br />');

    return html;
};

// --- Cleaner for Clipboard (Plain Text for Zalo) ---
const cleanMarkdownForClipboard = (text: string) => {
    let clean = text;
    
    // 1. Headers: "### Tiêu đề" -> "TIÊU ĐỀ" (Viết hoa để nổi bật trong plain text)
    clean = clean.replace(/^###\s+(.*$)/gim, (match, p1) => p1.toUpperCase());
    
    // 2. Bold: "**text**" -> "text"
    clean = clean.replace(/\*\*(.*?)\*\*/g, '$1');
    
    // 3. Italic: "*text*" -> "text"
    clean = clean.replace(/\*(.*?)\*/g, '$1');
    
    // 4. Lists: "- item" -> "• item" (Dùng chấm tròn thay gạch đầu dòng cho đẹp hơn trên mobile)
    clean = clean.replace(/^\-\s+/gim, '• ');

    return clean;
};

const CurrencyInput: React.FC<{
    value: number;
    onChange: (val: number) => void;
    placeholder?: string;
    className?: string;
    disabled?: boolean;
}> = ({ value, onChange, placeholder, className, disabled }) => {
    const formatNumber = (num: number) => {
        return num === 0 ? '' : num.toLocaleString('vi-VN');
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const rawValue = e.target.value.replace(/\./g, '').replace(/\D/g, '');
        const numericValue = Number(rawValue);
        onChange(numericValue);
    };

    return (
        <div className="relative w-full">
            <input
                type="text"
                value={formatNumber(value)}
                onChange={handleChange}
                placeholder={placeholder}
                className={className}
                disabled={disabled}
            />
            {value > 0 && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none">
                    VND
                </span>
            )}
        </div>
    );
};

const SearchableCustomerSelect: React.FC<{
    customers: Customer[];
    value: string; // Current selected name for display
    onChange: (customer: Customer) => void; 
    label?: string;
    placeholder?: string;
    className?: string;
}> = ({ customers, value, onChange, label, placeholder, className }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [wrapperRef]);

    const filtered = customers.filter(c => 
        c.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.phone.includes(searchTerm) ||
        (c.idCard && c.idCard.includes(searchTerm))
    );

    const handleSelect = (customer: Customer) => {
        onChange(customer);
        setIsOpen(false);
        setSearchTerm('');
    };

    return (
        <div className={`relative ${className || ''}`} ref={wrapperRef}>
            {label && <label className="block text-xs font-bold text-gray-500 mb-1">{label}</label>}
            <div 
                className="w-full border border-gray-300 p-2.5 rounded-lg focus-within:ring-2 focus-within:ring-red-200 bg-white flex justify-between items-center cursor-pointer"
                onClick={() => setIsOpen(!isOpen)}
            >
                <span className={`text-sm ${value ? 'text-gray-900' : 'text-gray-400'} truncate`}>
                    {value || placeholder || "Chọn khách hàng"}
                </span>
                <i className="fas fa-chevron-down text-gray-400 text-xs ml-2"></i>
            </div>

            {isOpen && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 overflow-hidden flex flex-col min-w-[250px]">
                    <div className="p-2 border-b border-gray-100 bg-gray-50">
                        <input
                            type="text"
                            autoFocus
                            className="w-full text-sm p-1.5 border border-gray-300 rounded outline-none focus:border-red-400"
                            placeholder="Tìm tên, SĐT, CCCD..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="overflow-y-auto flex-1">
                        {filtered.length > 0 ? (
                            filtered.map(c => (
                                <div 
                                    key={c.id}
                                    onClick={() => handleSelect(c)}
                                    className="px-3 py-2 hover:bg-red-50 cursor-pointer border-b border-gray-50 last:border-0"
                                >
                                    <div className="font-medium text-sm text-gray-800">{c.fullName}</div>
                                    <div className="text-xs text-gray-500">
                                        <i className="fas fa-phone-alt mr-1"></i>{c.phone} 
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="p-3 text-center text-xs text-gray-400">Không tìm thấy kết quả</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

const ConfirmModal: React.FC<{
    isOpen: boolean;
    title: string;
    message: React.ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm: () => void;
    onClose: () => void;
}> = ({ isOpen, title, message, confirmLabel = "Xóa", cancelLabel = "Hủy", onConfirm, onClose }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden transform transition-all scale-100 border border-gray-100">
                <div className="p-6 text-center">
                    <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-100">
                        <i className="fas fa-trash-alt text-xl text-red-500"></i>
                    </div>
                    <h3 className="text-lg font-bold text-gray-800 mb-2">{title}</h3>
                    <div className="text-gray-500 text-sm mb-6 leading-relaxed">{message}</div>
                    <div className="grid grid-cols-2 gap-3">
                        <button 
                            onClick={onClose}
                            className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium transition"
                        >
                            {cancelLabel}
                        </button>
                        <button 
                            onClick={() => { onConfirm(); onClose(); }}
                            className="px-4 py-2.5 bg-pru-red hover:bg-red-700 text-white rounded-xl font-medium shadow-lg shadow-red-500/30 transition"
                        >
                            {confirmLabel}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- CUSTOMERS PAGE ---
const CustomersPage: React.FC<{ 
  customers: Customer[], 
  contracts: Contract[], 
  onAdd: (c: Customer) => void, 
  onUpdate: (c: Customer) => void, 
  onDelete: (id: string) => void 
}> = ({ customers, contracts, onAdd, onUpdate, onDelete }) => {
    const navigate = useNavigate();
    const [showModal, setShowModal] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [activeTab, setActiveTab] = useState<'profile' | 'health' | 'analysis' | 'documents' | 'family' | 'contracts' | 'history'>('profile');
    const [isUploading, setIsUploading] = useState(false);

    // State for Family Tree feature
    const [selectedRelation, setSelectedRelation] = useState<Customer | null>(null);
    const [relationType, setRelationType] = useState<RelationshipType>(RelationshipType.SPOUSE);

    const defaultCustomer: Customer = {
        id: '',
        fullName: '',
        gender: Gender.MALE,
        dob: '',
        phone: '',
        idCard: '',
        job: '',
        companyAddress: '',
        health: { medicalHistory: '', height: 0, weight: 0, habits: '' },
        analysis: {
            childrenCount: 0,
            incomeEstimate: '',
            financialStatus: FinancialStatus.STABLE,
            insuranceKnowledge: '',
            previousExperience: '',
            keyConcerns: '',
            personality: PersonalityType.ANALYTICAL,
            readiness: ReadinessLevel.WARM
        },
        interactionHistory: [],
        status: CustomerStatus.POTENTIAL,
        documents: [],
        relationships: []
    };

    const [formData, setFormData] = useState<Customer>(defaultCustomer);
    const [newHistoryItem, setNewHistoryItem] = useState(''); // State for new history input
    const [deleteConfirm, setDeleteConfirm] = useState<{isOpen: boolean, id: string, name: string}>({ isOpen: false, id: '', name: '' });

    const handleOpenAdd = () => { 
        setFormData({ ...defaultCustomer, dob: new Date().toISOString().split('T')[0] }); 
        setIsEditing(false); 
        setActiveTab('profile');
        setShowModal(true); 
    };

    const handleOpenEdit = (c: Customer) => { 
        setFormData({
            ...defaultCustomer,
            ...c,
            analysis: { ...defaultCustomer.analysis, ...(c.analysis || {}) },
            health: { ...defaultCustomer.health, ...(c.health || {}) },
            documents: c.documents || [],
            relationships: c.relationships || []
        }); 
        setIsEditing(true); 
        setActiveTab('profile');
        setShowModal(true); 
    };

    const handleSubmit = () => {
        if (!formData.fullName || !formData.phone) return alert("Vui lòng nhập Tên và SĐT");
        isEditing ? onUpdate(formData) : onAdd(formData);
        setShowModal(false);
    };
    
    // Handler to add new interaction history
    const handleAddHistory = () => {
        if (!newHistoryItem.trim()) return;
        const today = new Date();
        const dateStr = `${today.getDate()}/${today.getMonth() + 1}/${today.getFullYear()}`;
        const entry = `${dateStr}: ${newHistoryItem}`;

        setFormData(prev => ({
            ...prev,
            interactionHistory: [entry, ...(prev.interactionHistory || [])]
        }));
        setNewHistoryItem('');
    };

    // Family Tree Logic
    const handleAddRelationship = async () => {
        if (!selectedRelation || !formData.id) return alert("Vui lòng chọn khách hàng và lưu hồ sơ hiện tại trước.");
        
        // 1. Update current customer form state
        const newRel: CustomerRelationship = {
            relatedCustomerId: selectedRelation.id,
            relationship: relationType
        };
        const updatedRels = [...(formData.relationships || []), newRel];
        setFormData({...formData, relationships: updatedRels});

        // 2. Determine Inverse Relationship for the other person
        let inverseType = RelationshipType.OTHER;
        if (relationType === RelationshipType.SPOUSE) inverseType = RelationshipType.SPOUSE;
        else if (relationType === RelationshipType.SIBLING) inverseType = RelationshipType.SIBLING;
        else if (relationType === RelationshipType.PARENT) inverseType = RelationshipType.CHILD;
        else if (relationType === RelationshipType.CHILD) inverseType = RelationshipType.PARENT;

        // 3. Update the other customer (Direct Database Call for Bidirectional Sync)
        const otherCustomer = customers.find(c => c.id === selectedRelation.id);
        if (otherCustomer) {
             const inverseRel: CustomerRelationship = {
                 relatedCustomerId: formData.id,
                 relationship: inverseType
             };
             // Avoid duplicates
             const otherRels = otherCustomer.relationships || [];
             if (!otherRels.some(r => r.relatedCustomerId === formData.id)) {
                 await onUpdate({
                     ...otherCustomer,
                     relationships: [...otherRels, inverseRel]
                 });
             }
        }
        
        // Reset selection
        setSelectedRelation(null);
    };

    const handleRemoveRelationship = (index: number) => {
        const newRels = [...(formData.relationships || [])];
        newRels.splice(index, 1);
        setFormData({...formData, relationships: newRels});
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        try {
            const url = await uploadFile(file, `customers/${formData.id || 'temp'}`);
            const newDoc: CustomerDocument = {
                id: Date.now().toString(),
                name: file.name,
                url: url,
                type: file.type.includes('image') ? 'image' : 'pdf',
                uploadDate: new Date().toISOString()
            };
            setFormData(prev => ({
                ...prev,
                documents: [...(prev.documents || []), newDoc]
            }));
        } catch (error) {
            alert("Lỗi upload: " + error);
        } finally {
            setIsUploading(false);
        }
    };

    const getContractCount = (customerId: string) => contracts.filter(c => c.customerId === customerId).length;
    const customerContracts = isEditing ? contracts.filter(c => c.customerId === formData.id) : [];

    // Financial Analysis Logic
    const parseIncome = (incomeStr: string): number => {
        const matches = incomeStr.match(/(\d+)/);
        if (matches) {
            return parseInt(matches[0]) * 1000000;
        }
        return 0; // Unknown
    };
    
    const calculateFinancialGap = () => {
        const income = parseIncome(formData.analysis?.incomeEstimate || "");
        // Rule of thumb: Protection should be 10x Annual Income
        const recommendedProtection = income > 0 ? income * 12 * 10 : 2000000000; // Default 2 Billion if unknown
        
        const currentProtection = customerContracts.reduce((sum, c) => {
            if (c.status !== ContractStatus.ACTIVE) return sum;
            const main = c.mainProduct.sumAssured || 0;
            const riders = (c.riders || []).reduce((s, r) => s + (r.sumAssured || 0), 0);
            return sum + main + riders;
        }, 0);

        return [
            { name: 'Thực tế', value: currentProtection },
            { name: 'Khuyến nghị (10 năm TN)', value: recommendedProtection },
        ];
    };

    return (
        <div className="space-y-4">
             <div className="flex justify-between items-center">
                 <h1 className="text-2xl font-bold text-gray-800">Khách hàng</h1>
                 <button onClick={handleOpenAdd} className="bg-pru-red text-white px-4 py-2 rounded-lg hover:bg-red-700 transition shadow-md"><i className="fas fa-plus mr-2"></i>Thêm mới</button>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {customers.map(c => (
                    <div key={c.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col hover:shadow-md transition cursor-pointer" onClick={() => handleOpenEdit(c)}>
                        <div className="flex justify-between items-start mb-3">
                            <div className="flex items-center">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold mr-3 ${c.gender === Gender.FEMALE ? 'bg-pink-400' : 'bg-blue-500'}`}>
                                    {c.fullName.charAt(0)}
                                </div>
                                <div>
                                    <h3 className="font-bold text-gray-800">{c.fullName}</h3>
                                    <p className="text-xs text-gray-500">{c.phone}</p>
                                </div>
                            </div>
                            <span className={`text-[10px] px-2 py-1 rounded-full font-bold ${
                                c.status === CustomerStatus.SIGNED ? 'bg-green-100 text-green-700' :
                                c.status === CustomerStatus.ADVISING ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'
                            }`}>
                                {c.status}
                            </span>
                        </div>
                        <div className="text-sm text-gray-600 space-y-1 mb-4 flex-1">
                           <p className="truncate"><i className="fas fa-briefcase w-5 text-gray-400"></i> {c.job || '---'}</p>
                           <p><i className="fas fa-file-contract w-5 text-gray-400"></i> {getContractCount(c.id)} HĐ</p>
                           <p><i className="fas fa-brain w-5 text-gray-400"></i> {c.analysis?.personality || '---'}</p>
                        </div>
                        <div className="flex justify-between items-center pt-3 border-t border-gray-50">
                           <button onClick={(e) => { e.stopPropagation(); navigate(`/advisory/${c.id}`); }} className="text-xs bg-purple-50 text-purple-700 px-3 py-1.5 rounded-lg border border-purple-100 hover:bg-purple-100 font-medium transition">
                              <i className="fas fa-robot mr-1"></i>Roleplay AI
                           </button>
                           <button onClick={(e) => { e.stopPropagation(); setDeleteConfirm({isOpen: true, id: c.id, name: c.fullName}); }} className="text-red-500 hover:bg-red-50 p-2 rounded transition"><i className="fas fa-trash"></i></button>
                        </div>
                    </div>
                ))}
             </div>

             {/* DETAIL MODAL - Redesigned to match request */}
             {showModal && (
                 <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
                    <div className="bg-white rounded-lg w-full max-w-4xl h-[90vh] flex flex-col shadow-2xl overflow-hidden">
                         
                         {/* Header: Name & ID */}
                         <div className="px-6 py-4 border-b flex justify-between items-start bg-white">
                            <div>
                                <h3 className="text-xl font-bold text-gray-800">{formData.fullName || 'Thêm khách hàng mới'}</h3>
                                {isEditing && <p className="text-xs text-gray-400 uppercase mt-1">ID: {formData.id}</p>}
                            </div>
                            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                                <i className="fas fa-times text-xl"></i>
                            </button>
                         </div>

                         {/* Tabs Navigation */}
                         <div className="flex border-b border-gray-200 bg-white px-6 overflow-x-auto">
                            {[
                                { id: 'profile', label: 'Hồ sơ', icon: 'fa-user' },
                                { id: 'health', label: 'Sức khỏe', icon: 'fa-heartbeat' },
                                { id: 'analysis', label: 'Phân tích', icon: 'fa-chart-pie' }, 
                                { id: 'documents', label: 'Tài liệu', icon: 'fa-folder-open' }, 
                                { id: 'family', label: 'Gia đình', icon: 'fa-users' }, 
                                { id: 'contracts', label: `Hợp đồng (${customerContracts.length})`, icon: 'fa-file-contract' },
                                { id: 'history', label: 'Lịch sử', icon: 'fa-history' },
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id as any)}
                                    className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
                                        activeTab === tab.id 
                                        ? 'border-pru-red text-pru-red' 
                                        : 'border-transparent text-gray-500 hover:text-gray-700'
                                    }`}
                                >
                                    <i className={`fas ${tab.icon}`}></i> {tab.label}
                                </button>
                            ))}
                         </div>

                         {/* Content Area */}
                         <div className="flex-1 overflow-y-auto p-6 bg-white">
                             
                             {/* TAB 1: PROFILE (Layout matched to image) */}
                             {activeTab === 'profile' && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    {/* Left Column: Identity */}
                                    <div>
                                        <h4 className="font-bold text-gray-700 mb-4 text-base">Thông tin định danh</h4>
                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-xs font-bold text-gray-500 mb-1">Họ và tên <span className="text-red-500">*</span></label>
                                                <input className="w-full border border-gray-300 p-2.5 rounded-lg focus:ring-1 focus:ring-pru-red outline-none transition" value={formData.fullName} onChange={e => setFormData({...formData, fullName: e.target.value})} placeholder="Nhập họ và tên" />
                                            </div>
                                            
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-xs font-bold text-gray-500 mb-1">Giới tính</label>
                                                    <select className="w-full border border-gray-300 p-2.5 rounded-lg bg-white outline-none" value={formData.gender} onChange={(e:any) => setFormData({...formData, gender: e.target.value})}>
                                                        {Object.values(Gender).map(g => <option key={g} value={g}>{g}</option>)}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-gray-500 mb-1">Ngày sinh</label>
                                                    <input type="date" className="w-full border border-gray-300 p-2.5 rounded-lg outline-none" value={formData.dob} onChange={e => setFormData({...formData, dob: e.target.value})} />
                                                </div>
                                            </div>

                                            <div>
                                                <label className="block text-xs font-bold text-gray-500 mb-1">CCCD / CMND</label>
                                                <input className="w-full border border-gray-300 p-2.5 rounded-lg outline-none" value={formData.idCard} onChange={e => setFormData({...formData, idCard: e.target.value})} placeholder="Số giấy tờ tùy thân" />
                                            </div>

                                            <div>
                                                <label className="block text-xs font-bold text-gray-500 mb-1">Trạng thái khách hàng</label>
                                                <select className="w-full border border-gray-300 p-2.5 rounded-lg bg-white outline-none" value={formData.status} onChange={(e:any) => setFormData({...formData, status: e.target.value})}>
                                                    {Object.values(CustomerStatus).map(s => <option key={s} value={s}>{s}</option>)}
                                                </select>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Right Column: Contact & Job */}
                                    <div>
                                        <h4 className="font-bold text-gray-700 mb-4 text-base">Liên hệ & Công việc</h4>
                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-xs font-bold text-gray-500 mb-1">Số điện thoại <span className="text-red-500">*</span></label>
                                                <input className="w-full border border-gray-300 p-2.5 rounded-lg outline-none" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} placeholder="Nhập số điện thoại" />
                                            </div>

                                            <div>
                                                <label className="block text-xs font-bold text-gray-500 mb-1">Nghề nghiệp</label>
                                                <input className="w-full border border-gray-300 p-2.5 rounded-lg outline-none" value={formData.job} onChange={e => setFormData({...formData, job: e.target.value})} placeholder="Ví dụ: Kế toán" />
                                            </div>

                                            <div>
                                                <label className="block text-xs font-bold text-gray-500 mb-1">Địa chỉ công ty / Liên hệ</label>
                                                <input className="w-full border border-gray-300 p-2.5 rounded-lg outline-none" value={formData.companyAddress} onChange={e => setFormData({...formData, companyAddress: e.target.value})} placeholder="Địa chỉ liên hệ chính" />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                             )}

                             {/* TAB 2: HEALTH (New fields moved here) */}
                             {activeTab === 'health' && (
                                <div className="max-w-2xl">
                                    <h4 className="font-bold text-gray-700 mb-4 text-base">Thông tin sức khỏe</h4>
                                    <div className="grid grid-cols-2 gap-4 mb-4">
                                        <div><label className="block text-xs font-bold text-gray-500 mb-1">Chiều cao (cm)</label><input type="number" className="w-full border border-gray-300 p-2.5 rounded-lg" value={formData.health?.height} onChange={e => setFormData({...formData, health: {...formData.health, height: Number(e.target.value)}})} /></div>
                                        <div><label className="block text-xs font-bold text-gray-500 mb-1">Cân nặng (kg)</label><input type="number" className="w-full border border-gray-300 p-2.5 rounded-lg" value={formData.health?.weight} onChange={e => setFormData({...formData, health: {...formData.health, weight: Number(e.target.value)}})} /></div>
                                    </div>
                                    <div className="mb-4"><label className="block text-xs font-bold text-gray-500 mb-1">Tiền sử bệnh án</label><textarea className="w-full border border-gray-300 p-2.5 rounded-lg" rows={3} value={formData.health?.medicalHistory} onChange={e => setFormData({...formData, health: {...formData.health, medicalHistory: e.target.value}})} placeholder="Các bệnh đã từng mắc, phẫu thuật..." /></div>
                                    <div><label className="block text-xs font-bold text-gray-500 mb-1">Thói quen sinh hoạt</label><textarea className="w-full border border-gray-300 p-2.5 rounded-lg" rows={3} value={formData.health?.habits} onChange={e => setFormData({...formData, health: {...formData.health, habits: e.target.value}})} placeholder="Hút thuốc, rượu bia, thể thao..." /></div>
                                </div>
                             )}

                             {/* TAB 3: ANALYSIS with CHART */}
                             {activeTab === 'analysis' && (
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                     <div className="space-y-4">
                                         <h4 className="font-bold text-gray-700 text-base">Chân dung khách hàng</h4>
                                         <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 grid grid-cols-1 md:grid-cols-2 gap-4">
                                             <div><label className="block text-xs font-bold text-gray-500 mb-1">Độ sẵn sàng tham gia</label><select className="w-full border border-gray-300 p-2.5 rounded-lg bg-white" value={formData.analysis?.readiness} onChange={(e:any) => setFormData({...formData, analysis: {...formData.analysis, readiness: e.target.value}})}>{Object.values(ReadinessLevel).map(r => <option key={r} value={r}>{r}</option>)}</select></div>
                                             <div><label className="block text-xs font-bold text-gray-500 mb-1">Tính cách (DISC/MBTI)</label><select className="w-full border border-gray-300 p-2.5 rounded-lg bg-white" value={formData.analysis?.personality} onChange={(e:any) => setFormData({...formData, analysis: {...formData.analysis, personality: e.target.value}})}>{Object.values(PersonalityType).map(p => <option key={p} value={p}>{p}</option>)}</select></div>
                                             <div><label className="block text-xs font-bold text-gray-500 mb-1">Tình hình tài chính</label><select className="w-full border border-gray-300 p-2.5 rounded-lg bg-white" value={formData.analysis?.financialStatus} onChange={(e:any) => setFormData({...formData, analysis: {...formData.analysis, financialStatus: e.target.value}})}>{Object.values(FinancialStatus).map(f => <option key={f} value={f}>{f}</option>)}</select></div>
                                             <div><label className="block text-xs font-bold text-gray-500 mb-1">Thu nhập ước tính (Triệu/tháng)</label><input className="w-full border border-gray-300 p-2.5 rounded-lg" value={formData.analysis?.incomeEstimate} onChange={e => setFormData({...formData, analysis: {...formData.analysis, incomeEstimate: e.target.value}})} /></div>
                                             <div><label className="block text-xs font-bold text-gray-500 mb-1">Số con</label><input type="number" className="w-full border border-gray-300 p-2.5 rounded-lg" value={formData.analysis?.childrenCount} onChange={e => setFormData({...formData, analysis: {...formData.analysis, childrenCount: Number(e.target.value)}})} /></div>
                                             <div className="md:col-span-2"><label className="block text-xs font-bold text-gray-500 mb-1">Mối quan tâm chính</label><input className="w-full border border-gray-300 p-2.5 rounded-lg" value={formData.analysis?.keyConcerns} onChange={e => setFormData({...formData, analysis: {...formData.analysis, keyConcerns: e.target.value}})} placeholder="VD: Hưu trí, Giáo dục con cái..." /></div>
                                         </div>
                                     </div>

                                     {/* FINANCIAL GAP ANALYSIS CHART */}
                                     <div>
                                         <h4 className="font-bold text-gray-700 mb-4 text-base flex items-center">
                                             <i className="fas fa-chart-bar mr-2 text-blue-500"></i>Phân tích Nhu cầu Bảo vệ (Gap Analysis)
                                         </h4>
                                         <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm h-64">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={calculateFinancialGap()} layout="vertical">
                                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                                    <XAxis type="number" tickFormatter={(val) => `${val/1000000000} Tỷ`} />
                                                    <YAxis dataKey="name" type="category" width={150} tick={{fontSize: 12}} />
                                                    <Tooltip formatter={(val: number) => `${val.toLocaleString()} đ`} />
                                                    <Bar dataKey="value" fill="#8884d8" barSize={30} radius={[0, 4, 4, 0]}>
                                                        {calculateFinancialGap().map((entry, index) => (
                                                            <Cell key={`cell-${index}`} fill={index === 0 ? '#4ade80' : '#ed1b2e'} />
                                                        ))}
                                                    </Bar>
                                                </BarChart>
                                            </ResponsiveContainer>
                                         </div>
                                         <p className="text-xs text-gray-500 mt-2 italic">* Biểu đồ so sánh tổng mệnh giá bảo vệ hiện tại so với mức khuyến nghị (10 lần thu nhập năm).</p>
                                     </div>
                                </div>
                             )}

                             {/* TAB 4: DOCUMENTS (DIGITAL CABINET) */}
                             {activeTab === 'documents' && (
                                 <div>
                                     <div className="flex justify-between items-center mb-4">
                                         <h4 className="font-bold text-gray-700 text-base">Hồ sơ số & Tài liệu</h4>
                                         <label className="cursor-pointer bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition shadow-sm text-sm font-medium flex items-center">
                                             <i className={`fas ${isUploading ? 'fa-spinner fa-spin' : 'fa-cloud-upload-alt'} mr-2`}></i>
                                             {isUploading ? 'Đang tải...' : 'Tải lên'}
                                             <input type="file" className="hidden" onChange={handleFileUpload} disabled={isUploading} accept="image/*,.pdf" />
                                         </label>
                                     </div>
                                     
                                     {(!formData.documents || formData.documents.length === 0) ? (
                                         <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed border-gray-300 rounded-xl bg-gray-50">
                                             <i className="fas fa-folder-open text-4xl text-gray-300 mb-3"></i>
                                             <p className="text-gray-500 text-sm">Chưa có tài liệu nào.</p>
                                             <p className="text-xs text-gray-400">Tải lên CCCD, Hợp đồng, Giấy khám sức khỏe...</p>
                                         </div>
                                     ) : (
                                         <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                             {formData.documents.map((doc, idx) => (
                                                 <a href={doc.url} target="_blank" rel="noreferrer" key={idx} className="group relative block bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition decoration-0">
                                                     <div className="flex items-center justify-center h-24 mb-3 bg-gray-50 rounded-lg group-hover:bg-blue-50 transition">
                                                         <i className={`fas ${doc.type === 'pdf' ? 'fa-file-pdf text-red-500' : 'fa-image text-blue-500'} text-3xl`}></i>
                                                     </div>
                                                     <p className="font-medium text-sm text-gray-800 truncate" title={doc.name}>{doc.name}</p>
                                                     <p className="text-xs text-gray-400 mt-1">{new Date(doc.uploadDate).toLocaleDateString('vi-VN')}</p>
                                                     <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition">
                                                         <button className="text-gray-400 hover:text-blue-600"><i className="fas fa-external-link-alt"></i></button>
                                                     </div>
                                                 </a>
                                             ))}
                                         </div>
                                     )}
                                 </div>
                             )}

                             {/* TAB 5: FAMILY TREE (New Tab) */}
                             {activeTab === 'family' && (
                                <div>
                                    <div className="flex justify-between items-center mb-4">
                                        <h4 className="font-bold text-gray-700 text-base">Sơ đồ Phả hệ Gia đình</h4>
                                        <div className="text-xs text-gray-500 italic">Thêm thành viên để bán chéo sản phẩm</div>
                                    </div>
                                    
                                    {/* Add Relationship Form */}
                                    <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 mb-6">
                                        <p className="text-sm font-bold text-blue-800 mb-2">Thêm mối quan hệ</p>
                                        <div className="flex flex-col md:flex-row gap-3 items-end">
                                            <div className="flex-1 w-full">
                                                <SearchableCustomerSelect 
                                                    customers={customers.filter(c => c.id !== formData.id)} // Exclude self
                                                    value={selectedRelation?.fullName || ''}
                                                    onChange={setSelectedRelation}
                                                    label="Chọn người thân (Đã có trong hệ thống)"
                                                />
                                            </div>
                                            <div className="w-full md:w-48">
                                                <label className="block text-xs font-bold text-gray-500 mb-1">Mối quan hệ</label>
                                                <select className="w-full border border-gray-300 p-2.5 rounded-lg bg-white" value={relationType} onChange={(e: any) => setRelationType(e.target.value)}>
                                                    {Object.values(RelationshipType).map(t => <option key={t} value={t}>{t}</option>)}
                                                </select>
                                            </div>
                                            <button onClick={handleAddRelationship} className="bg-blue-600 text-white px-4 py-2.5 rounded-lg font-bold hover:bg-blue-700 whitespace-nowrap">
                                                <i className="fas fa-link mr-1"></i> Liên kết
                                            </button>
                                        </div>
                                    </div>

                                    {/* Family List / Tree Visualization */}
                                    {(!formData.relationships || formData.relationships.length === 0) ? (
                                        <div className="text-center py-8 text-gray-400 border border-dashed rounded-lg">
                                            Chưa có thông tin gia đình.
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {formData.relationships.map((rel, idx) => {
                                                const relative = customers.find(c => c.id === rel.relatedCustomerId);
                                                if (!relative) return null;
                                                return (
                                                    <div key={idx} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center shadow-sm relative group">
                                                        <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold mr-3 text-lg ${relative.gender === Gender.FEMALE ? 'bg-pink-400' : 'bg-blue-500'}`}>
                                                            {relative.fullName.charAt(0)}
                                                        </div>
                                                        <div className="flex-1">
                                                            <div className="flex items-center gap-2">
                                                                <h5 className="font-bold text-gray-800">{relative.fullName}</h5>
                                                                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{rel.relationship}</span>
                                                            </div>
                                                            <p className="text-xs text-gray-500 mt-1">
                                                                <i className="fas fa-birthday-cake mr-1"></i> {new Date().getFullYear() - new Date(relative.dob).getFullYear()} tuổi
                                                                <span className="mx-2">•</span>
                                                                {getContractCount(relative.id)} HĐ
                                                            </p>
                                                        </div>
                                                        <button 
                                                            onClick={() => handleRemoveRelationship(idx)}
                                                            className="text-gray-300 hover:text-red-500 p-2 absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition"
                                                            title="Gỡ liên kết"
                                                        >
                                                            <i className="fas fa-unlink"></i>
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                             )}

                             {/* TAB 7: CONTRACTS */}
                             {activeTab === 'contracts' && (
                                 <div>
                                     <div className="flex justify-between items-center mb-4">
                                        <h4 className="font-bold text-gray-700 text-base">Danh sách hợp đồng</h4>
                                        {!isEditing && <span className="text-sm text-gray-400 italic">Vui lòng tạo khách hàng trước</span>}
                                     </div>
                                     {customerContracts.length > 0 ? (
                                         <div className="space-y-3">
                                             {customerContracts.map(c => (
                                                 <div key={c.id} className="p-4 border rounded-lg bg-gray-50 flex justify-between items-center">
                                                     <div>
                                                         <div className="font-bold text-pru-red">{c.contractNumber}</div>
                                                         <div className="text-sm">{c.mainProduct.productName}</div>
                                                     </div>
                                                     <div className="text-right">
                                                         <div className="font-bold">{c.totalFee.toLocaleString()} đ</div>
                                                         <div className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded inline-block">{c.status}</div>
                                                     </div>
                                                 </div>
                                             ))}
                                         </div>
                                     ) : (
                                         <div className="text-center py-8 text-gray-400 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                                             Chưa có hợp đồng nào
                                         </div>
                                     )}
                                 </div>
                             )}

                             {/* TAB 8: HISTORY */}
                             {activeTab === 'history' && (
                                 <div>
                                     <h4 className="font-bold text-gray-700 mb-4 text-base">Lịch sử tương tác</h4>
                                     
                                     {/* Input for new history */}
                                     <div className="flex gap-2 mb-4">
                                         <input 
                                            type="text" 
                                            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-pru-red"
                                            placeholder="Thêm ghi chú mới (VD: Đã gọi tư vấn lại...)"
                                            value={newHistoryItem}
                                            onChange={(e) => setNewHistoryItem(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleAddHistory()}
                                         />
                                         <button 
                                            onClick={handleAddHistory}
                                            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition"
                                         >
                                             <i className="fas fa-paper-plane mr-1"></i> Thêm
                                         </button>
                                     </div>

                                     <div className="space-y-4 max-h-[400px] overflow-y-auto">
                                         {(formData.interactionHistory || []).length > 0 ? (
                                             formData.interactionHistory.map((h, i) => (
                                                 <div key={i} className="flex gap-3">
                                                     <div className="flex flex-col items-center">
                                                         <div className="w-2 h-2 rounded-full bg-gray-300 mt-2"></div>
                                                         <div className="w-0.5 flex-1 bg-gray-200"></div>
                                                     </div>
                                                     <div className="pb-4">
                                                         <p className="text-sm text-gray-700 bg-gray-50 p-2 rounded">{h}</p>
                                                     </div>
                                                 </div>
                                             ))
                                         ) : (
                                             <p className="text-gray-400 italic">Chưa có lịch sử tương tác.</p>
                                         )}
                                     </div>
                                 </div>
                             )}

                         </div>

                         {/* Footer Buttons */}
                         <div className="p-4 border-t bg-white flex justify-end gap-3">
                            <button onClick={() => setShowModal(false)} className="px-6 py-2 text-gray-600 hover:text-gray-800 font-medium">Đóng</button>
                            <button onClick={handleSubmit} className="px-6 py-2 bg-pru-red text-white font-bold rounded-lg hover:bg-red-700 shadow transition flex items-center">
                                <i className="fas fa-save mr-2"></i> Lưu thay đổi
                            </button>
                         </div>
                    </div>
                 </div>
             )}

             <ConfirmModal isOpen={deleteConfirm.isOpen} title="Xóa khách hàng?" message={`Bạn có chắc muốn xóa khách hàng ${deleteConfirm.name}?`} onConfirm={() => onDelete(deleteConfirm.id)} onClose={() => setDeleteConfirm({isOpen: false, id: '', name: ''})} />
        </div>
    );
}

// --- NEW MESSAGE TEMPLATES PAGE ---
const MessageTemplatesPage: React.FC<{
    templates: MessageTemplate[];
    customers: Customer[];
    contracts: Contract[];
    onAdd: (t: MessageTemplate) => void;
    onUpdate: (t: MessageTemplate) => void;
    onDelete: (id: string) => void;
}> = ({ templates, customers, contracts, onAdd, onUpdate, onDelete }) => {
    const [showModal, setShowModal] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState<MessageTemplate>({
        id: '',
        title: '',
        content: '',
        category: 'care',
        icon: 'fa-comment',
        color: 'blue'
    });
    const [deleteConfirm, setDeleteConfirm] = useState<{isOpen: boolean, id: string}>({ isOpen: false, id: '' });

    // Use Template Modal State
    const [useModal, setUseModal] = useState<{ isOpen: boolean; template: MessageTemplate | null }>({ isOpen: false, template: null });
    const [selectedCustomerForTemplate, setSelectedCustomerForTemplate] = useState<Customer | null>(null);
    const [previewContent, setPreviewContent] = useState('');

    const handleOpenAdd = () => {
        setFormData({ id: '', title: '', content: '', category: 'care', icon: 'fa-comment', color: 'blue' });
        setIsEditing(false);
        setShowModal(true);
    };

    const handleOpenEdit = (t: MessageTemplate) => {
        setFormData(t);
        setIsEditing(true);
        setShowModal(true);
    };

    const handleSubmit = () => {
        if (!formData.title || !formData.content) return alert("Vui lòng nhập Tiêu đề và Nội dung");
        isEditing ? onUpdate(formData) : onAdd(formData);
        setShowModal(false);
    };

    const insertVariable = (variable: string) => {
        setFormData(prev => ({
            ...prev,
            content: prev.content + ` ${variable} `
        }));
    };

    // --- Message Generation Logic ---
    const generateMessage = (templateContent: string, customer: Customer) => {
        let text = templateContent;
        
        // Basic Info
        text = text.replace(/\{name\}|\{Tên khách hàng\}/gi, customer.fullName);
        
        // Gender
        const greeting = customer.gender === Gender.MALE ? 'Anh' : customer.gender === Gender.FEMALE ? 'Chị' : 'Bạn';
        text = text.replace(/\{gender\}|\{Danh xưng\}/gi, greeting);

        // Contract Info (Find active one)
        const activeContract = contracts.find(c => c.customerId === customer.id && c.status === ContractStatus.ACTIVE);
        
        if (activeContract) {
            text = text.replace(/\{contract\}|\{Số hợp đồng\}/gi, activeContract.contractNumber);
            text = text.replace(/\{date\}|\{Ngày đóng phí\}/gi, formatDateVN(activeContract.nextPaymentDate));
            text = text.replace(/\{fee\}|\{Số tiền\}/gi, activeContract.totalFee.toLocaleString('vi-VN') + ' đ');
        } else {
             text = text.replace(/\{contract\}|\{Số hợp đồng\}/gi, '[Số HĐ]');
             text = text.replace(/\{date\}|\{Ngày đóng phí\}/gi, '[Ngày]');
             text = text.replace(/\{fee\}|\{Số tiền\}/gi, '[Số tiền]');
        }

        return text;
    };

    useEffect(() => {
        if (useModal.isOpen && useModal.template && selectedCustomerForTemplate) {
            setPreviewContent(generateMessage(useModal.template.content, selectedCustomerForTemplate));
        } else if (useModal.isOpen && useModal.template) {
            setPreviewContent(useModal.template.content); // Show raw template if no customer selected
        }
    }, [useModal.isOpen, useModal.template, selectedCustomerForTemplate]);

    const handleCopyGenerated = () => {
        navigator.clipboard.writeText(previewContent);
        alert("Đã sao chép nội dung tin nhắn!");
        setUseModal({ isOpen: false, template: null });
        setSelectedCustomerForTemplate(null);
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-gray-800">Quản lý Mẫu Tin Nhắn</h1>
                <button onClick={handleOpenAdd} className="bg-pru-red text-white px-4 py-2 rounded-lg hover:bg-red-700 transition shadow-md">
                    <i className="fas fa-plus mr-2"></i>Thêm mẫu mới
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {templates.map(t => (
                    <div key={t.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition flex flex-col">
                        <div className={`h-2 w-full bg-${t.color || 'gray'}-500`}></div>
                        <div className="p-5 flex-1 flex flex-col">
                            <div className="flex justify-between items-start mb-3">
                                <div className="flex items-center">
                                    <div className={`w-10 h-10 rounded-full bg-${t.color || 'gray'}-50 flex items-center justify-center text-${t.color || 'gray'}-600 mr-3`}>
                                        <i className={`fas ${t.icon || 'fa-comment'}`}></i>
                                    </div>
                                    <h3 className="font-bold text-lg text-gray-800 line-clamp-1">{t.title}</h3>
                                </div>
                                <div className="flex gap-1">
                                    <button onClick={() => handleOpenEdit(t)} className="text-blue-500 hover:bg-blue-50 p-2 rounded"><i className="fas fa-edit"></i></button>
                                    <button onClick={() => setDeleteConfirm({ isOpen: true, id: t.id })} className="text-red-500 hover:bg-red-50 p-2 rounded"><i className="fas fa-trash"></i></button>
                                </div>
                            </div>
                            <div className="bg-gray-50 p-3 rounded-lg text-sm text-gray-600 line-clamp-3 mb-4 flex-1">
                                {t.content}
                            </div>
                            <div className="flex justify-between items-center mt-auto">
                                <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-1 rounded-full uppercase font-bold">{t.category}</span>
                                <button 
                                    onClick={() => setUseModal({ isOpen: true, template: t })}
                                    className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-green-700 transition flex items-center"
                                >
                                    <i className="fas fa-paper-plane mr-2"></i> Sử dụng
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Use Template Modal */}
            {useModal.isOpen && useModal.template && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
                    <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-2xl flex flex-col max-h-[90vh]">
                        <div className="flex justify-between items-center mb-4 border-b pb-2">
                            <h3 className="text-lg font-bold text-gray-800">Tạo tin nhắn: {useModal.template.title}</h3>
                            <button onClick={() => { setUseModal({isOpen: false, template: null}); setSelectedCustomerForTemplate(null); }} className="text-gray-400 hover:text-gray-600">
                                <i className="fas fa-times text-xl"></i>
                            </button>
                        </div>
                        
                        <div className="space-y-4 flex-1 overflow-y-auto">
                            <div>
                                <label className="block text-sm font-medium mb-1 text-gray-700">Chọn khách hàng áp dụng</label>
                                <SearchableCustomerSelect 
                                    customers={customers} 
                                    value={selectedCustomerForTemplate?.fullName || ''}
                                    onChange={setSelectedCustomerForTemplate}
                                    placeholder="Tìm kiếm khách hàng..."
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1 text-gray-700">Xem trước nội dung</label>
                                <textarea 
                                    className="w-full border border-gray-300 rounded-lg p-3 text-sm bg-gray-50 h-40 focus:ring-2 focus:ring-green-200 outline-none"
                                    value={previewContent}
                                    onChange={(e) => setPreviewContent(e.target.value)} // Allow manual edit
                                />
                            </div>
                        </div>

                        <div className="mt-6 flex justify-end gap-3 pt-4 border-t">
                            <button onClick={() => { setUseModal({isOpen: false, template: null}); setSelectedCustomerForTemplate(null); }} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Hủy</button>
                            <button 
                                onClick={handleCopyGenerated}
                                disabled={!selectedCustomerForTemplate}
                                className="px-4 py-2 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 shadow-md flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <i className="fas fa-copy mr-2"></i> Sao chép & Đóng
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit/Add Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
                    <div className="bg-white rounded-xl max-w-2xl w-full p-6 shadow-2xl">
                        <h3 className="text-xl font-bold mb-4 border-b pb-2">{isEditing ? 'Sửa Mẫu Tin' : 'Tạo Mẫu Tin Mới'}</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">Tiêu đề mẫu tin</label>
                                <input className="w-full border p-2.5 rounded-lg outline-none focus:ring-1 focus:ring-pru-red" value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} placeholder="VD: Chúc mừng sinh nhật..." />
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium mb-1">Danh mục</label>
                                    <select className="w-full border p-2.5 rounded-lg" value={formData.category} onChange={(e: any) => setFormData({ ...formData, category: e.target.value })}>
                                        <option value="care">Chăm sóc chung</option>
                                        <option value="birthday">Sinh nhật</option>
                                        <option value="payment">Nhắc phí</option>
                                        <option value="holiday">Lễ tết</option>
                                        <option value="other">Khác</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Màu sắc (Thẻ)</label>
                                    <select className="w-full border p-2.5 rounded-lg" value={formData.color} onChange={(e: any) => setFormData({ ...formData, color: e.target.value })}>
                                        <option value="blue">Xanh dương</option>
                                        <option value="red">Đỏ</option>
                                        <option value="green">Xanh lá</option>
                                        <option value="yellow">Vàng</option>
                                        <option value="pink">Hồng</option>
                                        <option value="purple">Tím</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <label className="block text-sm font-medium">Nội dung tin nhắn</label>
                                    <div className="text-xs text-gray-500">Chèn nhanh biến:</div>
                                </div>
                                <div className="flex flex-wrap gap-2 mb-2 p-2 bg-gray-50 rounded border border-gray-100">
                                    {[
                                        { label: 'Tên KH', val: '{name}' },
                                        { label: 'Số HĐ', val: '{contract}' },
                                        { label: 'Ngày đóng', val: '{date}' },
                                        { label: 'Số tiền', val: '{fee}' },
                                        { label: 'Danh xưng (Anh/Chị)', val: '{gender}' }
                                    ].map(v => (
                                        <button 
                                            key={v.val} 
                                            onClick={() => insertVariable(v.val)}
                                            className="text-xs bg-white border border-gray-300 px-2 py-1 rounded hover:bg-blue-50 hover:text-blue-600 transition"
                                        >
                                            {v.label}
                                        </button>
                                    ))}
                                </div>
                                <textarea 
                                    className="w-full border p-3 rounded-lg outline-none focus:ring-1 focus:ring-pru-red min-h-[150px]" 
                                    value={formData.content} 
                                    onChange={e => setFormData({ ...formData, content: e.target.value })} 
                                    placeholder="Nhập nội dung tin nhắn. Sử dụng các biến trên để tự động điền dữ liệu..."
                                />
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 mt-6 border-t pt-4">
                            <button onClick={() => setShowModal(false)} className="px-5 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-lg">Hủy</button>
                            <button onClick={handleSubmit} className="px-5 py-2 bg-pru-red text-white rounded-lg font-bold hover:bg-red-700 shadow-md">Lưu</button>
                        </div>
                    </div>
                </div>
            )}
            
            <ConfirmModal isOpen={deleteConfirm.isOpen} title="Xóa mẫu tin?" message="Bạn có chắc chắn muốn xóa mẫu tin này không?" onConfirm={() => onDelete(deleteConfirm.id)} onClose={() => setDeleteConfirm({ isOpen: false, id: '' })} />
        </div>
    );
};

// --- SETTINGS PAGE (New) ---
const SettingsPage: React.FC<{
    profile: AgentProfile | null;
    onSave: (p: AgentProfile) => void;
}> = ({ profile, onSave }) => {
    const [formData, setFormData] = useState<AgentProfile>({
        fullName: '',
        age: 30,
        address: '',
        office: '',
        agentCode: '',
        title: '',
        bio: ''
    });

    useEffect(() => {
        if (profile) setFormData(profile);
    }, [profile]);

    const handleSubmit = () => {
        onSave(formData);
        alert("Đã lưu thông tin tư vấn viên!");
    };

    return (
        <div className="space-y-6 max-w-2xl mx-auto">
             <h1 className="text-2xl font-bold text-gray-800">Cài đặt hồ sơ tư vấn viên</h1>
             <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 space-y-6">
                <div className="flex items-center gap-4 mb-4">
                     <div className="w-20 h-20 rounded-full bg-red-50 border-2 border-red-100 flex items-center justify-center text-pru-red text-3xl">
                         <i className="fas fa-user-tie"></i>
                     </div>
                     <div>
                         <h3 className="font-bold text-lg text-gray-800">Thông tin cá nhân</h3>
                         <p className="text-sm text-gray-500">AI sẽ dùng thông tin này để xưng hô và giới thiệu với khách hàng.</p>
                     </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">Họ và tên</label>
                        <input className="w-full border p-2.5 rounded-lg focus:ring-2 focus:ring-red-200 outline-none" value={formData.fullName} onChange={e => setFormData({...formData, fullName: e.target.value})} placeholder="Nguyễn Văn A" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Tuổi</label>
                        <input type="number" className="w-full border p-2.5 rounded-lg focus:ring-2 focus:ring-red-200 outline-none" value={formData.age} onChange={e => setFormData({...formData, age: Number(e.target.value)})} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Mã số nhân viên</label>
                        <input className="w-full border p-2.5 rounded-lg focus:ring-2 focus:ring-red-200 outline-none" value={formData.agentCode} onChange={e => setFormData({...formData, agentCode: e.target.value})} placeholder="600xxxxx" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Danh hiệu / Chức danh</label>
                        <input className="w-full border p-2.5 rounded-lg focus:ring-2 focus:ring-red-200 outline-none" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} placeholder="MDRT, Trưởng nhóm kinh doanh..." />
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium mb-1">Văn phòng / Khu vực</label>
                        <input className="w-full border p-2.5 rounded-lg focus:ring-2 focus:ring-red-200 outline-none" value={formData.office} onChange={e => setFormData({...formData, office: e.target.value})} placeholder="Prudential Plaza, Quận 8..." />
                    </div>
                    <div className="md:col-span-2">
                         <label className="block text-sm font-medium mb-1">Địa chỉ liên hệ</label>
                         <input className="w-full border p-2.5 rounded-lg focus:ring-2 focus:ring-red-200 outline-none" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} />
                    </div>
                    <div className="md:col-span-2">
                         <label className="block text-sm font-medium mb-1">Giới thiệu ngắn (Phong cách)</label>
                         <textarea rows={3} className="w-full border p-2.5 rounded-lg focus:ring-2 focus:ring-red-200 outline-none" value={formData.bio} onChange={e => setFormData({...formData, bio: e.target.value})} placeholder="Ví dụ: Tôi là người tư vấn tận tâm, luôn đặt lợi ích khách hàng lên đầu, có 5 năm kinh nghiệm..." />
                    </div>
                </div>

                <div className="pt-4 border-t border-gray-100 flex justify-end">
                    <button onClick={handleSubmit} className="bg-pru-red text-white px-6 py-2.5 rounded-lg hover:bg-red-700 transition shadow-md">
                        <i className="fas fa-save mr-2"></i>Lưu hồ sơ
                    </button>
                </div>
             </div>
        </div>
    );
};

// --- ADVISORY PAGE (Roleplay with Objection Handling) ---
const AdvisoryPage: React.FC<{ customers: Customer[], agentProfile: AgentProfile | null }> = ({ customers, agentProfile }) => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const customer = customers.find(c => c.id === id);

    const [messages, setMessages] = useState<{ role: 'user' | 'model'; text: string }[]>([]);
    const [input, setInput] = useState('');
    const [goal, setGoal] = useState(''); // Goal state
    const [isGoalSet, setIsGoalSet] = useState(false);
    const [loading, setLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [copiedIndex, setCopiedIndex] = useState<number | null>(null); // Track copied status
    
    // Objection Handling State
    const [hintLoading, setHintLoading] = useState(false);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const startSession = async () => {
        if(!goal.trim()) return alert("Vui lòng nhập mục tiêu cuộc trò chuyện");
        setIsGoalSet(true);
        setLoading(true);

        const startPrompt = "BẮT ĐẦU_ROLEPLAY: Hãy nói câu thoại đầu tiên với khách hàng ngay bây giờ.";

        const response = await consultantChat(startPrompt, customer!, agentProfile, goal, []);
        
        setMessages([
            { role: 'model', text: response }
        ]);
        setLoading(false);
    };

    const handleSend = async () => {
        if (!input.trim() || !customer) return;
        
        const userMsg = input;
        setInput('');
        setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
        setLoading(true);

        const history = messages.map(m => ({
            role: m.role,
            parts: [{ text: m.text }]
        }));

        const response = await consultantChat(userMsg, customer, agentProfile, goal, history);
        
        setMessages(prev => [...prev, { role: 'model', text: response }]);
        setLoading(false);
    };

    const handleCopy = (text: string, idx: number) => {
        const cleanText = cleanMarkdownForClipboard(text);
        navigator.clipboard.writeText(cleanText);
        setCopiedIndex(idx);
        setTimeout(() => setCopiedIndex(null), 2000);
    };

    // --- Objection Handling Function ---
    const handleGetObjectionHint = async () => {
        if (!customer) return;
        setHintLoading(true);
        
        // Construct history context
        const history = messages.map(m => ({
            role: m.role,
            parts: [{ text: m.text }]
        }));

        // Special prompt for objection handling
        const hintPrompt = `
            [YÊU CẦU HỖ TRỢ XỬ LÝ TỪ CHỐI]
            Dựa trên ngữ cảnh cuộc hội thoại hiện tại, khách hàng có vẻ đang ngần ngại hoặc từ chối.
            Hãy đóng vai người quản lý dày dạn kinh nghiệm, thì thầm nhắc bài cho tôi (tư vấn viên) 3 phương án trả lời khác nhau để xử lý tình huống này:
            1. Phương án Đồng cảm (Em hiểu cảm giác của anh/chị...)
            2. Phương án Logic/Số liệu (Thực tế thì...)
            3. Phương án Đặt câu hỏi ngược (Điều gì khiến anh/chị băn khoăn nhất...)
            
            Trả lời ngắn gọn, từng phương án một, để tôi có thể chọn và nói ngay. Không cần chào hỏi lại.
        `;

        try {
            const hintResponse = await consultantChat(hintPrompt, customer, agentProfile, goal, history);
            // Append hint as a special system message locally (not sent to AI history for next turn ideally, or maybe yes)
            // Here we treat it as a "System Whisper" displayed differently
            setMessages(prev => [...prev, { role: 'model', text: `💡 **GỢI Ý TỪ TRỢ LÝ:**\n\n${hintResponse}` }]);
        } catch (e) {
            alert("Không thể lấy gợi ý lúc này.");
        } finally {
            setHintLoading(false);
        }
    };

    if (!customer) return <div className="p-8 text-center">Khách hàng không tồn tại.</div>;

    return (
        <div className="flex flex-col h-[calc(100vh-theme(spacing.16))] md:h-screen bg-gray-100">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center shadow-sm">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/customers')} className="text-gray-500 hover:text-gray-700">
                        <i className="fas fa-arrow-left text-lg"></i>
                    </button>
                    <div>
                        <h1 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                            <i className="fas fa-theater-masks text-purple-600"></i>
                            Kịch bản tư vấn: {customer.fullName}
                        </h1>
                        <p className="text-xs text-gray-500">AI đóng vai: {agentProfile?.fullName || 'Cố vấn chuyên nghiệp'}</p>
                    </div>
                </div>
                <div className="flex gap-2">
                     {!isGoalSet && (
                        <div className="hidden md:block text-xs bg-yellow-50 text-yellow-700 px-3 py-1 rounded-full border border-yellow-100">
                            Chưa thiết lập mục tiêu
                        </div>
                     )}
                     <div className="hidden md:block text-xs bg-purple-50 text-purple-700 px-3 py-1 rounded-full border border-purple-100">
                        Roleplay Mode
                    </div>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
                {/* Left Panel: Context Info */}
                <div className="w-80 bg-white border-r border-gray-200 p-4 overflow-y-auto hidden lg:block">
                     {/* Goal Section */}
                    <div className="mb-6">
                        <label className="block text-xs font-bold text-gray-700 mb-2 uppercase">Mục tiêu cuộc gọi / Gặp gỡ</label>
                        {isGoalSet ? (
                            <div className="bg-green-50 p-3 rounded-lg border border-green-200 text-sm text-green-800">
                                <i className="fas fa-bullseye mr-2"></i>{goal}
                                <button onClick={() => setIsGoalSet(false)} className="block text-xs text-green-600 underline mt-2 hover:text-green-800">Thay đổi</button>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <textarea 
                                    className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-purple-200 outline-none" 
                                    rows={3}
                                    placeholder="VD: Chốt hợp đồng, Giải thích điều khoản loại trừ, Xử lý từ chối về giá..."
                                    value={goal}
                                    onChange={e => setGoal(e.target.value)}
                                />
                                <button 
                                    onClick={startSession}
                                    className="w-full bg-purple-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-purple-700 transition"
                                >
                                    Bắt đầu Roleplay
                                </button>
                            </div>
                        )}
                    </div>

                    <h3 className="font-bold text-gray-700 mb-4 border-b pb-2">Hồ sơ khách hàng</h3>
                    <div className="space-y-4 text-sm">
                        {/* ... (Customer details same as before) ... */}
                         <div>
                            <span className="block text-gray-500 text-xs">Nghề nghiệp & Thu nhập</span>
                            <div className="font-medium">{customer.job}</div>
                            <div className="text-gray-600">{customer.analysis?.incomeEstimate || '-'}</div>
                        </div>
                        <div>
                            <span className="block text-gray-500 text-xs">Gia đình</span>
                            <div className="font-medium">{customer.analysis?.childrenCount} con</div>
                        </div>
                         <div>
                            <span className="block text-gray-500 text-xs">Tài chính</span>
                            <div className="inline-block px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-xs mt-1">
                                {customer.analysis?.financialStatus}
                            </div>
                        </div>
                        <div>
                            <span className="block text-gray-500 text-xs">Tính cách</span>
                            <div className="inline-block px-2 py-0.5 rounded bg-purple-50 text-purple-700 text-xs mt-1">
                                {customer.analysis?.personality}
                            </div>
                        </div>
                         <div>
                            <span className="block text-gray-500 text-xs">Mối quan tâm</span>
                            <div className="italic text-gray-600">"{customer.analysis?.keyConcerns}"</div>
                        </div>
                    </div>
                </div>

                {/* Right Panel: Chat */}
                <div className="flex-1 flex flex-col bg-gray-50">
                    {!isGoalSet ? (
                        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-gray-500">
                             <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mb-4 text-purple-500 text-2xl">
                                 <i className="fas fa-bullseye"></i>
                             </div>
                             <h2 className="text-xl font-bold text-gray-800 mb-2">Thiết lập mục tiêu</h2>
                             <p className="max-w-md">Vui lòng nhập mục tiêu của cuộc trò chuyện bên cột trái để AI có thể hỗ trợ bạn tốt nhất.</p>
                             {/* Mobile Goal Input fallback */}
                             <div className="lg:hidden w-full max-w-md mt-6">
                                <textarea 
                                    className="w-full border border-gray-300 rounded-lg p-3 text-sm mb-3" 
                                    rows={3}
                                    placeholder="Nhập mục tiêu (VD: Xử lý từ chối giá cao)..."
                                    value={goal}
                                    onChange={e => setGoal(e.target.value)}
                                />
                                <button onClick={startSession} className="w-full bg-purple-600 text-white py-3 rounded-lg font-bold">Bắt đầu</button>
                             </div>
                        </div>
                    ) : (
                        <>
                            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                                {messages.map((msg, idx) => (
                                    <div key={idx} className={`flex group ${msg.role === 'user' ? 'justify-end' : 'justify-start items-start'}`}>
                                        {msg.role === 'model' && (
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-2 shadow-sm flex-shrink-0 mt-1 ${
                                                msg.text.includes('💡') ? 'bg-yellow-400 text-white' : 'bg-purple-600 text-white'
                                            }`}>
                                                <i className={`fas ${msg.text.includes('💡') ? 'fa-lightbulb' : 'fa-user-tie'} text-xs`}></i>
                                            </div>
                                        )}
                                        <div className="relative max-w-[85%]">
                                            <div className={`p-3 rounded-xl shadow-sm text-sm leading-relaxed whitespace-pre-wrap ${
                                                msg.role === 'user' 
                                                ? 'bg-white border border-gray-200 text-gray-800' 
                                                : msg.text.includes('💡') 
                                                    ? 'bg-yellow-50 border border-yellow-200 text-gray-800' 
                                                    : 'bg-white border-l-4 border-purple-500 text-gray-800'
                                            }`}>
                                                {msg.role === 'model' ? (
                                                    <div className="prose prose-sm max-w-none text-gray-800" 
                                                        dangerouslySetInnerHTML={{ __html: formatAdvisoryContent(msg.text) }} 
                                                    />
                                                ) : msg.text}
                                            </div>

                                            {/* Quick Copy Button for AI Messages */}
                                            {msg.role === 'model' && !msg.text.includes('💡') && (
                                                <button 
                                                    onClick={() => handleCopy(msg.text, idx)}
                                                    className={`absolute -right-8 top-0 text-gray-400 hover:text-pru-red p-1.5 opacity-0 group-hover:opacity-100 transition-opacity ${copiedIndex === idx ? 'text-green-500 opacity-100' : ''}`}
                                                    title="Sao chép nội dung (để dán Zalo)"
                                                >
                                                    <i className={`fas ${copiedIndex === idx ? 'fa-check' : 'fa-copy'}`}></i>
                                                </button>
                                            )}
                                        </div>
                                        {msg.role === 'user' && (
                                            <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center ml-2 text-gray-600 flex-shrink-0">
                                                <i className="fas fa-user"></i>
                                            </div>
                                        )}
                                    </div>
                                ))}
                                {loading && (
                                    <div className="flex items-center text-gray-400 text-xs ml-10">
                                        <i className="fas fa-circle-notch fa-spin mr-2"></i> Cố vấn đang suy nghĩ...
                                    </div>
                                )}
                                <div ref={messagesEndRef} />
                            </div>

                            <div className="p-4 bg-white border-t border-gray-200">
                                {/* Objection Handling Hint Button */}
                                {messages.length > 1 && (
                                    <div className="flex justify-center mb-3">
                                        <button 
                                            onClick={handleGetObjectionHint}
                                            disabled={hintLoading || loading}
                                            className="text-xs flex items-center bg-yellow-100 text-yellow-800 px-3 py-1.5 rounded-full hover:bg-yellow-200 transition shadow-sm border border-yellow-200"
                                        >
                                            <i className={`fas ${hintLoading ? 'fa-spinner fa-spin' : 'fa-lightbulb'} mr-2`}></i>
                                            {hintLoading ? 'Đang phân tích...' : 'Gợi ý xử lý từ chối'}
                                        </button>
                                    </div>
                                )}
                                
                                <div className="flex gap-2">
                                    <input 
                                        type="text" 
                                        className="flex-1 border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-200"
                                        placeholder="Nhập câu trả lời của khách hàng (hoặc hỏi AI)..."
                                        value={input}
                                        onChange={e => setInput(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handleSend()}
                                        disabled={loading}
                                    />
                                    <button 
                                        onClick={handleSend}
                                        disabled={loading}
                                        className="bg-purple-600 text-white px-6 rounded-lg hover:bg-purple-700 transition disabled:opacity-50"
                                    >
                                        <i className="fas fa-paper-plane"></i>
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

const ProductsPage: React.FC<{ 
  products: Product[], 
  onAdd: (p: Product) => void,
  onUpdate: (p: Product) => void, 
  onDelete: (id: string) => void 
}> = ({ products, onAdd, onUpdate, onDelete }) => {
    const [showModal, setShowModal] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState<Product>({
        id: '', name: '', code: '', type: ProductType.MAIN, description: '', rulesAndTerms: '', pdfUrl: ''
    });
    const [isExtracting, setIsExtracting] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState<{isOpen: boolean, id: string, name: string}>({ isOpen: false, id: '', name: '' });
    
    const handleOpenAdd = () => { setFormData({ id: '', name: '', code: '', type: ProductType.MAIN, description: '', rulesAndTerms: '', pdfUrl: '' }); setIsEditing(false); setShowModal(true); };
    const handleOpenEdit = (p: Product) => { setFormData(p); setIsEditing(true); setShowModal(true); };
    const handleSubmit = () => { if (!formData.name || !formData.code) return alert("Vui lòng nhập Tên và Mã sản phẩm"); isEditing ? onUpdate(formData) : onAdd(formData); setShowModal(false); };
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsExtracting(true);
        try { const text = await extractTextFromPdf(file); setFormData(prev => ({ ...prev, rulesAndTerms: text })); } catch (error) { alert("Lỗi: " + error); }
        setIsExtracting(false);
    };

    return (
        <div className="space-y-4">
             <div className="flex justify-between items-center"><h1 className="text-2xl font-bold text-gray-800">Sản phẩm bảo hiểm</h1><button onClick={handleOpenAdd} className="bg-pru-red text-white px-4 py-2 rounded-lg hover:bg-red-700 transition"><i className="fas fa-plus mr-2"></i>Thêm sản phẩm</button></div>
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{products.map(p => (<div key={p.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col h-full hover:shadow-md transition"><div className="flex justify-between items-start mb-2"><span className={`px-2 py-1 text-xs font-bold rounded ${p.type === ProductType.MAIN ? 'bg-blue-100 text-blue-700' : p.type === ProductType.RIDER ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-700'}`}>{p.type}</span><div className="flex space-x-2"><button onClick={() => handleOpenEdit(p)} className="text-blue-500 hover:bg-blue-50 p-1 rounded"><i className="fas fa-edit"></i></button><button onClick={() => setDeleteConfirm({isOpen: true, id: p.id, name: p.name})} className="text-red-500 hover:bg-red-50 p-1 rounded"><i className="fas fa-trash"></i></button></div></div><h3 className="font-bold text-gray-800 text-lg mb-1">{p.name}</h3><p className="text-sm text-gray-500 mb-4 flex-1 line-clamp-3">{p.description}</p><div className="text-xs text-gray-400 font-mono bg-gray-50 p-2 rounded">Code: {p.code}</div></div>))}</div>
             {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
                        <h3 className="text-xl font-bold mb-4">{isEditing ? 'Sửa sản phẩm' : 'Thêm sản phẩm'}</h3>
                        <div className="space-y-4">
                            <div><label className="block text-sm font-medium mb-1">Tên sản phẩm</label><input className="w-full border p-2 rounded" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} /></div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="block text-sm font-medium mb-1">Mã</label><input className="w-full border p-2 rounded" value={formData.code} onChange={e => setFormData({...formData, code: e.target.value})} /></div>
                                <div><label className="block text-sm font-medium mb-1">Loại</label><select className="w-full border p-2 rounded" value={formData.type} onChange={(e: any) => setFormData({...formData, type: e.target.value})}>{Object.values(ProductType).map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                            </div>
                            <div><label className="block text-sm font-medium mb-1">Mô tả ngắn</label><textarea className="w-full border p-2 rounded" rows={2} value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} /></div>
                            <div>
                                <div className="flex justify-between items-center mb-1"><label className="block text-sm font-medium">Quy tắc & Điều khoản</label><label className="cursor-pointer bg-green-50 text-green-700 px-2 py-1 rounded text-xs hover:bg-green-100 flex items-center transition"><i className="fas fa-file-pdf mr-1"></i>{isExtracting ? 'Đang đọc...' : 'Trích xuất PDF'}<input type="file" className="hidden" accept="application/pdf" onChange={handleFileUpload} disabled={isExtracting} /></label></div>
                                <textarea className="w-full border p-2 rounded font-mono text-sm" rows={8} value={formData.rulesAndTerms} onChange={e => setFormData({...formData, rulesAndTerms: e.target.value})} placeholder="Dán nội dung điều khoản..." />
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 mt-6"><button onClick={() => setShowModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Hủy</button><button onClick={handleSubmit} className="px-4 py-2 bg-pru-red text-white rounded hover:bg-red-700">Lưu</button></div>
                    </div>
                </div>
            )}
             <ConfirmModal isOpen={deleteConfirm.isOpen} title="Xóa sản phẩm?" message={`Xóa ${deleteConfirm.name}?`} onConfirm={() => onDelete(deleteConfirm.id)} onClose={() => setDeleteConfirm({isOpen: false, id: '', name: ''})} />
        </div>
    );
}

const ContractsPage: React.FC<{ contracts: Contract[], customers: Customer[], products: Product[], onAdd: (c: Contract) => void, onUpdate: (c: Contract) => void, onDelete: (id: string) => void }> = ({ contracts, customers, products, onAdd, onUpdate, onDelete }) => {
    const [showModal, setShowModal] = useState(false);
    const [viewContract, setViewContract] = useState<Contract | null>(null); // State for Quick View Modal
    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState<Contract>({ id: '', contractNumber: '', customerId: '', effectiveDate: '', status: ContractStatus.ACTIVE, paymentFrequency: PaymentFrequency.ANNUAL, nextPaymentDate: '', totalFee: 0, mainProduct: { productId: '', productName: '', insuredName: '', fee: 0, sumAssured: 0 }, riders: [] });
    const [deleteConfirm, setDeleteConfirm] = useState<{isOpen: boolean, id: string, name: string}>({ isOpen: false, id: '', name: '' });
    
    // Filter Products
    const mainProducts = products.filter(p => p.type === ProductType.MAIN);
    const riderProducts = products.filter(p => p.type === ProductType.RIDER);

    const handleOpenAdd = () => { setFormData({ id: '', contractNumber: '', customerId: '', effectiveDate: new Date().toISOString().split('T')[0], status: ContractStatus.PENDING, paymentFrequency: PaymentFrequency.ANNUAL, nextPaymentDate: '', totalFee: 0, mainProduct: { productId: '', productName: '', insuredName: '', fee: 0, sumAssured: 0 }, riders: [] }); setIsEditing(false); setShowModal(true); };
    const handleOpenEdit = (c: Contract) => { setFormData(c); setIsEditing(true); setShowModal(true); };
    
    const calculateTotalFee = (data: Contract) => {
        const mainFee = data.mainProduct.fee || 0;
        const riderFees = (data.riders || []).reduce((sum, r) => sum + (r.fee || 0), 0);
        return mainFee + riderFees;
    };

    const handleSave = () => { 
        const finalData = { ...formData, totalFee: calculateTotalFee(formData) }; 
        if (!finalData.contractNumber || !finalData.customerId || !finalData.mainProduct.productId) {
            return alert("Vui lòng điền đầy đủ: Số HĐ, Khách hàng, Sản phẩm chính");
        }
        isEditing ? onUpdate(finalData) : onAdd(finalData); 
        setShowModal(false); 
    };

    // --- Dynamic Form Handlers ---
    const updateMainProduct = (key: keyof ContractProduct, value: any) => {
        const updated = { ...formData.mainProduct, [key]: value };
        // If changing product, update product name automatically
        if (key === 'productId') {
            const prod = mainProducts.find(p => p.id === value);
            updated.productName = prod ? prod.name : '';
        }
        setFormData({ ...formData, mainProduct: updated });
    };

    const addRider = () => {
        setFormData({
            ...formData,
            riders: [...formData.riders, { productId: '', productName: '', insuredName: '', fee: 0, sumAssured: 0 }]
        });
    };

    const removeRider = (index: number) => {
        const newRiders = [...formData.riders];
        newRiders.splice(index, 1);
        setFormData({ ...formData, riders: newRiders });
    };

    const updateRider = (index: number, key: keyof ContractProduct, value: any) => {
        const newRiders = [...formData.riders];
        newRiders[index] = { ...newRiders[index], [key]: value };
        // Update product name if id changes
        if (key === 'productId') {
             const prod = riderProducts.find(p => p.id === value);
             newRiders[index].productName = prod ? prod.name : '';
        }
        setFormData({ ...formData, riders: newRiders });
    };

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center"><h1 className="text-2xl font-bold text-gray-800">Quản lý hợp đồng</h1><button onClick={handleOpenAdd} className="bg-pru-red text-white px-4 py-2 rounded-lg hover:bg-red-700 transition"><i className="fas fa-file-signature mr-2"></i>Tạo hợp đồng</button></div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden"><table className="w-full text-left"><thead className="bg-gray-50 border-b"><tr><th className="px-6 py-4">Số HĐ</th><th className="px-6 py-4">Bên mua BH</th><th className="px-6 py-4">Sản phẩm chính</th><th className="px-6 py-4">Tổng Phí</th><th className="px-6 py-4">Trạng thái</th><th className="px-6 py-4 text-right">Thao tác</th></tr></thead><tbody>{contracts.map(c => (<tr key={c.id} className="border-b hover:bg-gray-50"><td className="px-6 py-4 font-bold text-pru-red">{c.contractNumber}</td><td className="px-6 py-4">{customers.find(cus => cus.id === c.customerId)?.fullName}</td><td className="px-6 py-4">{c.mainProduct.productName}</td><td className="px-6 py-4">{c.totalFee.toLocaleString()} đ</td><td className="px-6 py-4"><span className={`px-2 py-1 text-xs font-medium rounded ${c.status === ContractStatus.ACTIVE ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{c.status}</span></td><td className="px-6 py-4 text-right">
                <button onClick={() => setViewContract(c)} className="text-green-600 hover:bg-green-50 p-1.5 rounded mr-2" title="Xem chi tiết"><i className="fas fa-eye"></i></button>
                <button onClick={() => handleOpenEdit(c)} className="text-blue-500 hover:bg-blue-50 p-1.5 rounded mr-2"><i className="fas fa-edit"></i></button>
                <button onClick={() => setDeleteConfirm({isOpen: true, id: c.id, name: c.contractNumber})} className="text-red-500 hover:bg-red-50 p-1.5 rounded"><i className="fas fa-trash"></i></button>
            </td></tr>))}</tbody></table></div>
            
            {/* VIEW DETAILS MODAL */}
            {viewContract && (
                 <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4 animate-fade-in">
                    <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
                        <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                            <div>
                                <span className={`text-xs px-2 py-0.5 rounded font-bold uppercase mb-1 inline-block ${viewContract.status === ContractStatus.ACTIVE ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>{viewContract.status}</span>
                                <h3 className="text-xl font-bold text-gray-800">Hợp Đồng #{viewContract.contractNumber}</h3>
                            </div>
                            <button onClick={() => setViewContract(null)} className="text-gray-400 hover:text-gray-600 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-200"><i className="fas fa-times text-lg"></i></button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 bg-white space-y-6">
                            
                            {/* Dashboard Stats */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
                                    <p className="text-xs text-gray-500 uppercase font-bold">Khách hàng (Bên mua)</p>
                                    <p className="text-lg font-bold text-gray-800">{customers.find(c => c.id === viewContract.customerId)?.fullName}</p>
                                </div>
                                <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
                                    <p className="text-xs text-gray-500 uppercase font-bold">Định kỳ đóng phí</p>
                                    <p className="text-lg font-bold text-gray-800">{viewContract.paymentFrequency}</p>
                                </div>
                                <div className="p-4 bg-red-50 rounded-lg border border-red-100">
                                    <p className="text-xs text-red-500 uppercase font-bold">Tổng phí đóng</p>
                                    <p className="text-lg font-bold text-pru-red">{viewContract.totalFee.toLocaleString()} đ</p>
                                </div>
                                <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
                                    <p className="text-xs text-blue-500 uppercase font-bold">Hạn đóng phí tới</p>
                                    <p className="text-lg font-bold text-blue-800">{formatDateVN(viewContract.nextPaymentDate)}</p>
                                </div>
                            </div>

                            {/* Analysis Section */}
                            <div>
                                <h4 className="font-bold text-gray-800 mb-3 flex items-center text-lg">
                                    <i className="fas fa-shield-alt text-green-500 mr-2"></i>Tổng quan quyền lợi & Phân tích
                                </h4>
                                <div className="bg-green-50 p-4 rounded-lg border border-green-100 mb-4">
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="text-sm font-medium text-gray-600">Tổng Mệnh Giá Bảo Vệ (Ước tính):</span>
                                        <span className="text-xl font-bold text-green-700">
                                            {((viewContract.mainProduct.sumAssured || 0) + (viewContract.riders || []).reduce((s, r) => s + (r.sumAssured || 0), 0)).toLocaleString()} đ
                                        </span>
                                    </div>
                                    <p className="text-xs text-gray-500 italic">* Bao gồm quyền lợi tử vong/TTTBVV và các quyền lợi bổ trợ khác cộng gộp.</p>
                                </div>

                                <div className="space-y-3">
                                    {/* Main Product Item */}
                                    <div className="flex justify-between items-center p-3 border rounded-lg hover:bg-gray-50 transition">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-1.5 py-0.5 rounded">CHÍNH</span>
                                                <span className="font-bold text-gray-800">{viewContract.mainProduct.productName}</span>
                                            </div>
                                            <div className="text-xs text-gray-500 mt-1">
                                                NĐBH: {viewContract.mainProduct.insuredName}
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="font-bold text-gray-800">{viewContract.mainProduct.sumAssured?.toLocaleString()} đ</div>
                                            <div className="text-xs text-gray-400">Phí: {viewContract.mainProduct.fee?.toLocaleString()} đ</div>
                                        </div>
                                    </div>

                                    {/* Riders List */}
                                    {viewContract.riders.map((rider, idx) => (
                                         <div key={idx} className="flex justify-between items-center p-3 border rounded-lg hover:bg-gray-50 transition border-l-4 border-l-orange-400">
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="bg-orange-100 text-orange-700 text-[10px] font-bold px-1.5 py-0.5 rounded">BỔ TRỢ</span>
                                                    <span className="font-medium text-gray-800">{rider.productName}</span>
                                                </div>
                                                <div className="text-xs text-gray-500 mt-1">
                                                    NĐBH: {rider.insuredName}
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="font-bold text-gray-800">{rider.sumAssured?.toLocaleString()} đ</div>
                                                <div className="text-xs text-gray-400">Phí: {rider.fee?.toLocaleString()} đ</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                        </div>
                        <div className="p-4 border-t bg-gray-50 flex justify-end">
                            <button onClick={() => setViewContract(null)} className="px-6 py-2 bg-gray-200 text-gray-700 font-bold rounded-lg hover:bg-gray-300">Đóng</button>
                        </div>
                    </div>
                 </div>
            )}

            {showModal && (
                 <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
                    <div className="bg-white rounded-xl max-w-4xl w-full h-[90vh] flex flex-col shadow-2xl overflow-hidden">
                         {/* Header */}
                        <div className="p-5 border-b flex justify-between items-center bg-gray-50">
                            <h3 className="text-xl font-bold text-gray-800">{isEditing ? 'Cập nhật Hợp Đồng' : 'Tạo Hợp Đồng Mới'}</h3>
                            <div className="flex items-center gap-3">
                                <div className="bg-white px-3 py-1 rounded border border-gray-200 text-sm font-bold text-pru-red">
                                    Tổng phí: {calculateTotalFee(formData).toLocaleString()} đ
                                </div>
                                <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><i className="fas fa-times text-xl"></i></button>
                            </div>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-6 bg-gray-50 space-y-6">
                            
                            {/* SECTION 1: GENERAL INFO */}
                            <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm">
                                <h4 className="font-bold text-gray-700 border-b pb-2 mb-4 flex items-center"><i className="fas fa-info-circle mr-2 text-blue-500"></i>Thông tin chung</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1">Số Hợp Đồng <span className="text-red-500">*</span></label>
                                        <input className="w-full border border-gray-300 p-2.5 rounded-lg outline-none focus:ring-1 focus:ring-pru-red" value={formData.contractNumber} onChange={e => setFormData({...formData, contractNumber: e.target.value})} placeholder="VD: 79001234" />
                                    </div>
                                    <SearchableCustomerSelect 
                                        customers={customers} 
                                        value={customers.find(c => c.id === formData.customerId)?.fullName || ''} 
                                        onChange={c => setFormData({...formData, customerId: c.id})} 
                                        label="Bên mua bảo hiểm (Chủ HĐ)" 
                                        placeholder="Tìm khách hàng..."
                                    />
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1">Ngày hiệu lực</label>
                                        <input type="date" className="w-full border border-gray-300 p-2.5 rounded-lg" value={formData.effectiveDate} onChange={e => setFormData({...formData, effectiveDate: e.target.value})} />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1">Trạng thái</label>
                                        <select className="w-full border border-gray-300 p-2.5 rounded-lg bg-white" value={formData.status} onChange={(e:any) => setFormData({...formData, status: e.target.value})}>
                                            {Object.values(ContractStatus).map(s => <option key={s} value={s}>{s}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1">Định kỳ đóng phí</label>
                                        <select className="w-full border border-gray-300 p-2.5 rounded-lg bg-white" value={formData.paymentFrequency} onChange={(e:any) => setFormData({...formData, paymentFrequency: e.target.value})}>
                                            {Object.values(PaymentFrequency).map(f => <option key={f} value={f}>{f}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1">Ngày đóng phí tiếp theo</label>
                                        <input type="date" className="w-full border border-gray-300 p-2.5 rounded-lg" value={formData.nextPaymentDate} onChange={e => setFormData({...formData, nextPaymentDate: e.target.value})} />
                                    </div>
                                </div>
                            </div>

                            {/* SECTION 2: MAIN PRODUCT */}
                            <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
                                <h4 className="font-bold text-gray-700 border-b pb-2 mb-4 flex items-center"><i className="fas fa-shield-alt mr-2 text-blue-500"></i>Sản phẩm chính</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="md:col-span-2">
                                        <label className="block text-xs font-bold text-gray-500 mb-1">Tên sản phẩm chính</label>
                                        <select className="w-full border border-gray-300 p-2.5 rounded-lg bg-white" value={formData.mainProduct.productId} onChange={(e) => updateMainProduct('productId', e.target.value)}>
                                            <option value="">-- Chọn sản phẩm chính --</option>
                                            {mainProducts.map(p => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
                                        </select>
                                    </div>
                                    <SearchableCustomerSelect 
                                        customers={customers} 
                                        value={formData.mainProduct.insuredName || 'Chọn người được BH...'} // Just display name here, logic handles ID/Name separation if needed, but simple string is okay for display if consistent
                                        onChange={c => updateMainProduct('insuredName', c.fullName)}
                                        label="Người được bảo hiểm chính"
                                    />
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1">Số tiền bảo hiểm (Mệnh giá)</label>
                                        <CurrencyInput className="w-full border border-gray-300 p-2.5 rounded-lg" value={formData.mainProduct.sumAssured} onChange={v => updateMainProduct('sumAssured', v)} placeholder="0" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1">Phí bảo hiểm (Năm)</label>
                                        <CurrencyInput className="w-full border border-gray-300 p-2.5 rounded-lg font-bold text-blue-600" value={formData.mainProduct.fee} onChange={v => updateMainProduct('fee', v)} placeholder="0" />
                                    </div>
                                </div>
                            </div>

                            {/* SECTION 3: RIDERS */}
                            <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-1 h-full bg-orange-400"></div>
                                <div className="flex justify-between items-center border-b pb-2 mb-4">
                                    <h4 className="font-bold text-gray-700 flex items-center"><i className="fas fa-notes-medical mr-2 text-orange-500"></i>Sản phẩm bổ trợ (Riders)</h4>
                                    <button onClick={addRider} className="text-xs bg-orange-100 text-orange-700 px-3 py-1.5 rounded-lg font-bold hover:bg-orange-200 transition"><i className="fas fa-plus mr-1"></i>Thêm sản phẩm</button>
                                </div>
                                
                                {formData.riders.length === 0 ? (
                                    <div className="text-center py-4 text-gray-400 text-sm italic">Chưa có sản phẩm bổ trợ nào.</div>
                                ) : (
                                    <div className="space-y-4">
                                        {formData.riders.map((rider, index) => (
                                            <div key={index} className="bg-orange-50 p-4 rounded-lg border border-orange-100 relative group">
                                                <button onClick={() => removeRider(index)} className="absolute top-2 right-2 text-gray-400 hover:text-red-500 p-1"><i className="fas fa-trash-alt"></i></button>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pr-6">
                                                    <div className="md:col-span-2">
                                                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Tên sản phẩm</label>
                                                        <select className="w-full border border-gray-300 p-2 rounded bg-white text-sm" value={rider.productId} onChange={(e) => updateRider(index, 'productId', e.target.value)}>
                                                            <option value="">-- Chọn sản phẩm --</option>
                                                            {riderProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                                        </select>
                                                    </div>
                                                    <SearchableCustomerSelect 
                                                        customers={customers} 
                                                        value={rider.insuredName || ''} 
                                                        onChange={c => updateRider(index, 'insuredName', c.fullName)}
                                                        label="Người được bảo hiểm"
                                                        className="text-sm"
                                                    />
                                                    <div>
                                                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Mệnh giá / Chương trình</label>
                                                        <CurrencyInput className="w-full border border-gray-300 p-2 rounded text-sm" value={rider.sumAssured} onChange={v => updateRider(index, 'sumAssured', v)} placeholder="VD: 500.000.000" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Phí bảo hiểm</label>
                                                        <CurrencyInput className="w-full border border-gray-300 p-2 rounded text-sm font-bold text-gray-700" value={rider.fee} onChange={v => updateRider(index, 'fee', v)} placeholder="0" />
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                        </div>
                        <div className="p-4 border-t bg-white flex justify-end gap-3"><button onClick={() => setShowModal(false)} className="px-5 py-2 text-gray-600 font-medium">Hủy bỏ</button><button onClick={handleSave} className="px-5 py-2 bg-pru-red text-white rounded-lg font-bold hover:bg-red-700 shadow-md">Lưu Hợp Đồng</button></div>
                    </div>
                 </div>
            )}
             <ConfirmModal isOpen={deleteConfirm.isOpen} title="Xóa hợp đồng?" message={`Xóa HĐ ${deleteConfirm.name}?`} onConfirm={() => onDelete(deleteConfirm.id)} onClose={() => setDeleteConfirm({isOpen: false, id: '', name: ''})} />
        </div>
    );
}

const AppointmentsPage: React.FC<{ appointments: Appointment[], customers: Customer[], onAdd: (a: Appointment) => void, onUpdate: (a: Appointment) => void, onDelete: (id: string) => void }> = ({ appointments, customers, onAdd, onUpdate, onDelete }) => {
    const [showModal, setShowModal] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState<Appointment>({ id: '', customerId: '', customerName: '', date: '', time: '09:00', type: AppointmentType.CONSULTATION, status: AppointmentStatus.UPCOMING, note: '' });
    const [deleteConfirm, setDeleteConfirm] = useState<{isOpen: boolean, id: string}>({ isOpen: false, id: '' });
    const handleOpenAdd = () => { setFormData({ id: '', customerId: '', customerName: '', date: new Date().toISOString().split('T')[0], time: '09:00', type: AppointmentType.CONSULTATION, status: AppointmentStatus.UPCOMING, note: '' }); setIsEditing(false); setShowModal(true); };
    const handleOpenEdit = (a: Appointment) => { setFormData(a); setIsEditing(true); setShowModal(true); };
    const handleSave = () => { const cus = customers.find(c => c.id === formData.customerId); const finalData = { ...formData, customerName: cus?.fullName || formData.customerName }; isEditing ? onUpdate(finalData) : onAdd(finalData); setShowModal(false); };

    return (
        <div className="space-y-4">
             <div className="flex justify-between items-center"><h1 className="text-2xl font-bold text-gray-800">Lịch hẹn</h1><button onClick={handleOpenAdd} className="bg-pru-red text-white px-4 py-2 rounded-lg hover:bg-red-700 transition"><i className="fas fa-calendar-plus mr-2"></i>Đặt lịch</button></div>
             <div className="grid grid-cols-1 gap-4">{appointments.map(a => (<div key={a.id} className="bg-white p-3 rounded-lg border border-gray-100 flex justify-between items-center"><div className="flex items-center"><div className="bg-blue-50 text-blue-600 p-2 rounded text-center mr-3"><div className="font-bold">{a.time}</div><div className="text-xs">{formatDateVN(a.date)}</div></div><div><div className="font-bold">{a.customerName}</div><div className="text-sm text-gray-500">{a.type} - {a.note}</div></div></div><div className="flex gap-2"><button onClick={() => handleOpenEdit(a)} className="text-gray-400"><i className="fas fa-edit"></i></button><button onClick={() => setDeleteConfirm({isOpen: true, id: a.id})} className="text-red-300"><i className="fas fa-trash"></i></button></div></div>))}</div>
             {showModal && (
                 <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"><div className="bg-white rounded-xl max-w-md w-full p-6"><h3 className="text-xl font-bold mb-4">{isEditing ? 'Sửa' : 'Tạo'}</h3>
                    <div className="space-y-4">
                        <SearchableCustomerSelect customers={customers} value={customers.find(c => c.id === formData.customerId)?.fullName || formData.customerName} onChange={c => setFormData({...formData, customerId: c.id, customerName: c.fullName})} label="Khách hàng" />
                        <div className="grid grid-cols-2 gap-4"><div><label className="block text-sm">Ngày</label><input type="date" className="w-full border p-2 rounded" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} /></div><div><label className="block text-sm">Giờ</label><input type="time" className="w-full border p-2 rounded" value={formData.time} onChange={e => setFormData({...formData, time: e.target.value})} /></div></div>
                        <div><label className="block text-sm">Ghi chú</label><textarea className="w-full border p-2 rounded" value={formData.note} onChange={e => setFormData({...formData, note: e.target.value})} /></div>
                    </div>
                    <div className="flex justify-end gap-3 mt-6"><button onClick={() => setShowModal(false)} className="px-4 py-2 bg-gray-100 rounded">Hủy</button><button onClick={handleSave} className="px-4 py-2 bg-pru-red text-white rounded">Lưu</button></div>
                 </div></div>
             )}
             <ConfirmModal isOpen={deleteConfirm.isOpen} title="Xóa?" message="Xóa lịch hẹn?" onConfirm={() => onDelete(deleteConfirm.id)} onClose={() => setDeleteConfirm({isOpen: false, id: ''})} />
        </div>
    );
}

// --- MAIN APP COMPONENT ---

const App: React.FC = () => {
    const [state, setState] = useState<AppState>({
        customers: [],
        contracts: [],
        products: [],
        appointments: [],
        agentProfile: null,
        messageTemplates: []
    });

    // --- REALTIME DATABASE SUBSCRIPTIONS ---
    useEffect(() => {
        const unsubCustomers = subscribeToCollection(COLLECTIONS.CUSTOMERS, (data) => setState(prev => ({ ...prev, customers: data })));
        const unsubProducts = subscribeToCollection(COLLECTIONS.PRODUCTS, (data) => setState(prev => ({ ...prev, products: data })));
        const unsubContracts = subscribeToCollection(COLLECTIONS.CONTRACTS, (data) => setState(prev => ({ ...prev, contracts: data })));
        const unsubAppointments = subscribeToCollection(COLLECTIONS.APPOINTMENTS, (data) => setState(prev => ({ ...prev, appointments: data })));
        const unsubTemplates = subscribeToCollection(COLLECTIONS.MESSAGE_TEMPLATES, (data) => setState(prev => ({ ...prev, messageTemplates: data })));
        
        // Subscribe to Settings (Agent Profile)
        const unsubSettings = subscribeToCollection(COLLECTIONS.SETTINGS, (data) => {
            if (data && data.length > 0) {
                // Assuming only one profile doc for now
                setState(prev => ({ ...prev, agentProfile: data[0] as AgentProfile }));
            }
        });

        return () => {
            unsubCustomers(); unsubProducts(); unsubContracts(); unsubAppointments(); unsubSettings(); unsubTemplates();
        };
    }, []);

    // CRUD Handlers
    const addCustomer = async (c: Customer) => await addData(COLLECTIONS.CUSTOMERS, c);
    const updateCustomer = async (c: Customer) => await updateData(COLLECTIONS.CUSTOMERS, c.id, c);
    const deleteCustomer = async (id: string) => await deleteData(COLLECTIONS.CUSTOMERS, id);

    const addContract = async (c: Contract) => await addData(COLLECTIONS.CONTRACTS, c);
    const updateContract = async (c: Contract) => await updateData(COLLECTIONS.CONTRACTS, c.id, c);
    const deleteContract = async (id: string) => await deleteData(COLLECTIONS.CONTRACTS, id);

    const addProduct = async (p: Product) => await addData(COLLECTIONS.PRODUCTS, p);
    const updateProduct = async (p: Product) => await updateData(COLLECTIONS.PRODUCTS, p.id, p);
    const deleteProduct = async (id: string) => await deleteData(COLLECTIONS.PRODUCTS, id);

    const addAppointment = async (a: Appointment) => await addData(COLLECTIONS.APPOINTMENTS, a);
    const updateAppointment = async (a: Appointment) => await updateData(COLLECTIONS.APPOINTMENTS, a.id, a);
    const deleteAppointment = async (id: string) => await deleteData(COLLECTIONS.APPOINTMENTS, id);

    // Template Handlers
    const addTemplate = async (t: MessageTemplate) => await addData(COLLECTIONS.MESSAGE_TEMPLATES, t);
    const updateTemplate = async (t: MessageTemplate) => await updateData(COLLECTIONS.MESSAGE_TEMPLATES, t.id, t);
    const deleteTemplate = async (id: string) => await deleteData(COLLECTIONS.MESSAGE_TEMPLATES, id);

    // Profile Handler
    const saveProfile = async (profile: AgentProfile) => {
        if (state.agentProfile && state.agentProfile.id) {
            await updateData(COLLECTIONS.SETTINGS, state.agentProfile.id, profile);
        } else {
            await addData(COLLECTIONS.SETTINGS, profile);
        }
    };

    return (
        <Router>
            <Layout>
                <Routes>
                    <Route path="/" element={<Dashboard state={state} onUpdateContract={updateContract} />} />
                    <Route path="/customers" element={<CustomersPage customers={state.customers} contracts={state.contracts} onAdd={addCustomer} onUpdate={updateCustomer} onDelete={deleteCustomer} />} />
                    
                    {/* Updated Route passing Agent Profile */}
                    <Route path="/advisory/:id" element={<AdvisoryPage customers={state.customers} agentProfile={state.agentProfile} />} />
                    
                    {/* New Templates Route */}
                    <Route path="/templates" element={<MessageTemplatesPage templates={state.messageTemplates} customers={state.customers} contracts={state.contracts} onAdd={addTemplate} onUpdate={updateTemplate} onDelete={deleteTemplate} />} />

                    {/* New Settings Route */}
                    <Route path="/settings" element={<SettingsPage profile={state.agentProfile} onSave={saveProfile} />} />

                    <Route path="/contracts" element={<ContractsPage contracts={state.contracts} customers={state.customers} products={state.products} onAdd={addContract} onUpdate={updateContract} onDelete={deleteContract} />} />
                    <Route path="/products" element={<ProductsPage products={state.products} onAdd={addProduct} onUpdate={updateProduct} onDelete={deleteProduct} />} />
                    <Route path="/appointments" element={<AppointmentsPage appointments={state.appointments} customers={state.customers} onAdd={addAppointment} onUpdate={updateAppointment} onDelete={deleteAppointment} />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </Layout>
            <AIChat state={state} />
        </Router>
    );
};

export default App;

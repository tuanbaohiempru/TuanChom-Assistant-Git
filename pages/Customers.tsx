
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Customer, Contract, CustomerStatus, Gender, FinancialStatus, PersonalityType, ReadinessLevel, RelationshipType, CustomerRelationship, Illustration } from '../types';
import { ConfirmModal, formatDateVN, SearchableCustomerSelect, CurrencyInput } from '../components/Shared';
import ExcelImportModal from '../components/ExcelImportModal';
import { downloadTemplate, processCustomerImport } from '../utils/excelHelpers';

interface CustomersPageProps {
    customers: Customer[];
    contracts: Contract[];
    illustrations?: Illustration[]; 
    onAdd: (c: Customer) => Promise<void>;
    onUpdate: (c: Customer) => Promise<void>;
    onDelete: (id: string) => Promise<void>;
    onConvertIllustration?: (ill: Illustration, customerId: string) => Promise<void>; 
    onDeleteIllustration?: (id: string) => Promise<void>;
}

const CustomersPage: React.FC<CustomersPageProps> = ({ customers, contracts, illustrations = [], onAdd, onUpdate, onDelete, onConvertIllustration, onDeleteIllustration }) => {
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState<string>('all');
    
    // Modal States
    const [showModal, setShowModal] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false); 
    const [isEditing, setIsEditing] = useState(false);
    const [activeTab, setActiveTab] = useState<'info' | 'health' | 'analysis' | 'family' | 'contracts' | 'illustrations' | 'history'>('info');
    const [deleteConfirm, setDeleteConfirm] = useState<{isOpen: boolean, id: string, name: string}>({ isOpen: false, id: '', name: '' });
    
    // Quick Note State
    const [newNote, setNewNote] = useState('');

    // Quick View Contract State
    const [viewContract, setViewContract] = useState<Contract | null>(null);

    // State for adding new relationship
    const [newRelCustomer, setNewRelCustomer] = useState<Customer | null>(null);
    const [newRelType, setNewRelType] = useState<RelationshipType>(RelationshipType.SPOUSE);

    // Empty Customer Template
    const defaultCustomer: Customer = {
        id: '',
        fullName: '',
        gender: Gender.MALE,
        dob: '',
        phone: '',
        idCard: '',
        job: '',
        companyAddress: '',
        status: CustomerStatus.POTENTIAL,
        interactionHistory: [],
        relationships: [],
        documents: [], 
        health: { medicalHistory: '', height: 165, weight: 60, habits: '' },
        analysis: {
            childrenCount: 0,
            incomeEstimate: '', // Will store as string but represent a number
            financialStatus: FinancialStatus.STABLE,
            insuranceKnowledge: '',
            previousExperience: '',
            keyConcerns: '',
            personality: PersonalityType.ANALYTICAL,
            readiness: ReadinessLevel.COLD
        }
    };
    const [formData, setFormData] = useState<Customer>(defaultCustomer);

    const filteredCustomers = customers.filter(c => {
        const matchesSearch = c.fullName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                              c.phone.includes(searchTerm) || 
                              (c.idCard && c.idCard.includes(searchTerm));
        const matchesStatus = filterStatus === 'all' || c.status === filterStatus;
        return matchesSearch && matchesStatus;
    });

    // Helper to get items for current form customer
    const customerContracts = contracts.filter(c => c.customerId === formData.id);
    const customerIllustrations = illustrations.filter(ill => ill.customerId === formData.id);
    
    const handleOpenAdd = () => {
        setFormData(defaultCustomer);
        setIsEditing(false);
        setActiveTab('info');
        setNewRelCustomer(null);
        setShowModal(true);
    };

    const handleOpenEdit = (c: Customer) => {
        const safeData = {
            ...c,
            relationships: c.relationships || [],
            documents: c.documents || [],
            health: c.health || defaultCustomer.health,
            analysis: c.analysis || defaultCustomer.analysis,
            interactionHistory: c.interactionHistory || []
        };
        setFormData(safeData);
        setIsEditing(true);
        setActiveTab('info');
        setNewRelCustomer(null);
        setShowModal(true);
    };

    // --- HELPER: RECIPROCAL RELATIONSHIP LOGIC ---
    const getReciprocalType = (type: RelationshipType): RelationshipType => {
        switch (type) {
            case RelationshipType.SPOUSE: return RelationshipType.SPOUSE;
            // Nếu tôi thêm B là Bố/Mẹ (PARENT), thì B sẽ thấy tôi là Con (CHILD)
            case RelationshipType.PARENT: return RelationshipType.CHILD;
            // Nếu tôi thêm B là Con (CHILD), thì B sẽ thấy tôi là Bố/Mẹ (PARENT)
            case RelationshipType.CHILD: return RelationshipType.PARENT;
            case RelationshipType.SIBLING: return RelationshipType.SIBLING;
            default: return RelationshipType.OTHER;
        }
    };

    const handleSave = async () => {
        if (!formData.fullName || !formData.phone) return alert("Vui lòng nhập Họ tên và SĐT");
        
        if (isEditing) {
            // 1. Lưu thông tin khách hàng hiện tại
            await onUpdate(formData);

            // 2. Tự động cập nhật mối quan hệ 2 chiều cho các khách hàng liên quan
            if (formData.relationships && formData.relationships.length > 0) {
                const updatePromises = formData.relationships.map(async (rel) => {
                    const targetCustomer = customers.find(c => c.id === rel.relatedCustomerId);
                    
                    if (targetCustomer) {
                        const reciprocalType = getReciprocalType(rel.relationship);
                        const existingLinkIndex = targetCustomer.relationships?.findIndex(r => r.relatedCustomerId === formData.id);
                        
                        let shouldUpdate = false;
                        let newRelationships = [...(targetCustomer.relationships || [])];

                        if (existingLinkIndex !== undefined && existingLinkIndex >= 0) {
                            // Nếu đã có liên kết, kiểm tra xem loại quan hệ có khớp không, nếu sai thì sửa lại
                            if (newRelationships[existingLinkIndex].relationship !== reciprocalType) {
                                newRelationships[existingLinkIndex] = { 
                                    ...newRelationships[existingLinkIndex], 
                                    relationship: reciprocalType 
                                };
                                shouldUpdate = true;
                            }
                        } else {
                            // Nếu chưa có liên kết, thêm mới vào
                            newRelationships.push({ 
                                relatedCustomerId: formData.id, 
                                relationship: reciprocalType 
                            });
                            shouldUpdate = true;
                        }

                        if (shouldUpdate) {
                            await onUpdate({ ...targetCustomer, relationships: newRelationships });
                        }
                    }
                });
                
                await Promise.all(updatePromises);
            }
        } else {
            // Trường hợp thêm mới: Chưa có ID nên chưa thể tạo liên kết ngược ngay lập tức
            await onAdd(formData);
        }
        
        setShowModal(false);
    };

    const handleAddNote = () => {
        if (!newNote.trim()) return;
        const timestamp = new Date().toLocaleString('vi-VN');
        const noteEntry = `${timestamp}: ${newNote}`;
        setFormData(prev => ({
            ...prev,
            interactionHistory: [noteEntry, ...prev.interactionHistory]
        }));
        setNewNote('');
    };

    const getActiveContractCount = (customerId: string) => {
        return contracts.filter(c => c.customerId === customerId && c.status === 'Đang hiệu lực').length;
    };

    // --- RELATIONSHIP LOGIC ---
    const handleAddRelationship = () => {
        if (!newRelCustomer) return alert("Vui lòng chọn khách hàng để liên kết");
        if (newRelCustomer.id === formData.id) return alert("Không thể liên kết với chính mình");
        
        const exists = formData.relationships?.some(r => r.relatedCustomerId === newRelCustomer.id);
        if (exists) return alert("Mối quan hệ này đã tồn tại");

        const newRel: CustomerRelationship = {
            relatedCustomerId: newRelCustomer.id,
            relationship: newRelType
        };

        setFormData(prev => ({
            ...prev,
            relationships: [...(prev.relationships || []), newRel]
        }));
        setNewRelCustomer(null);
    };

    const handleRemoveRelationship = (index: number) => {
        const newRels = [...(formData.relationships || [])];
        newRels.splice(index, 1);
        setFormData(prev => ({ ...prev, relationships: newRels }));
    };

    const handleBatchSave = async (validCustomers: Customer[]) => { await Promise.all(validCustomers.map(c => onAdd(c))); };

    const handleConvertIllustration = async (ill: Illustration) => {
        if (!onConvertIllustration) return;
        if (window.confirm(`Bạn có chắc muốn chốt hợp đồng từ bảng minh họa "${ill.mainProduct.productName}"?`)) {
            await onConvertIllustration(ill, formData.id);
            alert("Đã tạo hợp đồng mới thành công! Vui lòng cập nhật thêm thông tin chi tiết.");
        }
    };

    const handleDeleteIllustration = async (id: string) => {
        if (!onDeleteIllustration) return;
        if (window.confirm("Bạn có chắc muốn xóa bảng minh họa này?")) {
            await onDeleteIllustration(id);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header & Filters (Preserved) */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Quản lý Khách hàng</h1>
                <div className="flex gap-3">
                    <button onClick={() => setShowImportModal(true)} className="bg-green-600 text-white px-5 py-2.5 rounded-xl hover:bg-green-700 transition font-medium flex items-center"><i className="fas fa-file-excel mr-2"></i>Nhập Excel</button>
                    <button onClick={handleOpenAdd} className="bg-pru-red text-white px-5 py-2.5 rounded-xl hover:bg-red-700 transition font-medium flex items-center"><i className="fas fa-user-plus mr-2"></i>Thêm mới</button>
                </div>
            </div>
            
            {/* ... Filters Bar ... */}
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

            {/* Grid List (Preserved) */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredCustomers.map(c => (
                    <div key={c.id} onClick={() => handleOpenEdit(c)} className="bg-white dark:bg-pru-card rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 hover:shadow-md transition group flex flex-col cursor-pointer">
                        {/* ... Card Content ... */}
                        <div className="p-5 flex items-start justify-between border-b border-gray-50 dark:border-gray-800">
                            <div className="flex items-center gap-3">
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold border-2 ${c.gender === Gender.FEMALE ? 'bg-pink-50 text-pink-500' : 'bg-blue-50 text-blue-500'}`}>{c.fullName.charAt(0)}</div>
                                <div><h3 className="font-bold text-gray-800 dark:text-gray-100 line-clamp-1">{c.fullName}</h3><p className="text-xs text-gray-500">{c.job}</p></div>
                            </div>
                            <span className={`w-2 h-2 rounded-full ${c.status === CustomerStatus.SIGNED ? 'bg-green-500' : 'bg-yellow-500'}`}></span>
                        </div>
                        <div className="p-5 space-y-3 flex-1">
                            <div className="flex items-center text-sm text-gray-600 dark:text-gray-300"><i className="fas fa-phone-alt w-5 text-gray-400 text-xs"></i><span>{c.phone}</span></div>
                            {/* Income Display */}
                            <div className="flex items-center text-sm text-gray-600 dark:text-gray-300">
                                <i className="fas fa-money-bill-wave w-5 text-gray-400 text-xs"></i>
                                <span>
                                    {Number(c.analysis?.incomeEstimate) > 0 
                                        ? `${Number(c.analysis.incomeEstimate).toLocaleString()} đ/tháng` 
                                        : 'Chưa cập nhật thu nhập'}
                                </span>
                            </div>
                            <div className="flex items-center text-sm text-gray-600 dark:text-gray-300"><i className="fas fa-file-contract w-5 text-gray-400 text-xs"></i><span>{getActiveContractCount(c.id)} HĐ hiệu lực</span></div>
                        </div>
                        <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-b-xl border-t border-gray-100 dark:border-gray-800 flex justify-between items-center gap-2">
                            <button onClick={(e) => { e.stopPropagation(); navigate(`/advisory/${c.id}`); }} className="flex-1 py-1.5 rounded-lg bg-purple-100 text-purple-700 text-xs font-bold hover:bg-purple-200 flex items-center justify-center"><i className="fas fa-theater-masks mr-1.5"></i>Roleplay</button>
                            <div className="flex gap-1">
                                <button onClick={(e) => { e.stopPropagation(); handleOpenEdit(c); }} className="w-8 h-8 rounded bg-white border text-blue-500 flex items-center justify-center"><i className="fas fa-edit"></i></button>
                                <button onClick={(e) => { e.stopPropagation(); setDeleteConfirm({isOpen: true, id: c.id, name: c.fullName}); }} className="w-8 h-8 rounded bg-white border text-red-500 flex items-center justify-center"><i className="fas fa-trash"></i></button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* ADD/EDIT MODAL */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in backdrop-blur-sm">
                    <div className="bg-white dark:bg-pru-card rounded-xl max-w-4xl w-full h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-gray-100 dark:border-gray-700 transition-colors">
                        <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50">
                            <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">{isEditing ? 'Cập nhật Khách Hàng' : 'Thêm Khách Hàng Mới'}</h3>
                            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><i className="fas fa-times text-xl"></i></button>
                        </div>
                        
                        <div className="flex border-b border-gray-200 dark:border-gray-700 overflow-x-auto bg-white dark:bg-pru-card">
                            <button onClick={() => setActiveTab('info')} className={`flex-1 min-w-fit px-4 py-3 text-sm font-bold border-b-2 transition ${activeTab === 'info' ? 'border-pru-red text-pru-red' : 'border-transparent text-gray-500'}`}>Thông tin chung</button>
                            <button onClick={() => setActiveTab('history')} className={`flex-1 min-w-fit px-4 py-3 text-sm font-bold border-b-2 transition ${activeTab === 'history' ? 'border-pru-red text-pru-red' : 'border-transparent text-gray-500'}`}>Lịch sử & Ghi chú</button>
                            <button onClick={() => setActiveTab('health')} className={`flex-1 min-w-fit px-4 py-3 text-sm font-bold border-b-2 transition ${activeTab === 'health' ? 'border-pru-red text-pru-red' : 'border-transparent text-gray-500'}`}>Sức khỏe</button>
                            <button onClick={() => setActiveTab('contracts')} className={`flex-1 min-w-fit px-4 py-3 text-sm font-bold border-b-2 transition ${activeTab === 'contracts' ? 'border-pru-red text-pru-red' : 'border-transparent text-gray-500'}`}>Hợp đồng <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full ml-1">{customerContracts.length}</span></button>
                            <button onClick={() => setActiveTab('illustrations')} className={`flex-1 min-w-fit px-4 py-3 text-sm font-bold border-b-2 transition ${activeTab === 'illustrations' ? 'border-pru-red text-pru-red' : 'border-transparent text-gray-500'}`}>Bảng minh họa <span className="text-xs bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-full ml-1">{customerIllustrations.length}</span></button>
                            <button onClick={() => setActiveTab('family')} className={`flex-1 min-w-fit px-4 py-3 text-sm font-bold border-b-2 transition ${activeTab === 'family' ? 'border-pru-red text-pru-red' : 'border-transparent text-gray-500'}`}>Gia đình</button>
                            <button onClick={() => setActiveTab('analysis')} className={`flex-1 min-w-fit px-4 py-3 text-sm font-bold border-b-2 transition ${activeTab === 'analysis' ? 'border-pru-red text-pru-red' : 'border-transparent text-gray-500'}`}>Phân tích</button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 bg-white dark:bg-pru-card space-y-6">
                            {/* TAB: INFO */}
                            {activeTab === 'info' && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div><label className="label-text">Họ và tên *</label><input className="input-field" value={formData.fullName} onChange={e => setFormData({...formData, fullName: e.target.value})} /></div>
                                    <div><label className="label-text">Số điện thoại *</label><input className="input-field" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} /></div>
                                    <div><label className="label-text">Giới tính</label><select className="input-field" value={formData.gender} onChange={(e: any) => setFormData({...formData, gender: e.target.value})}>{Object.values(Gender).map(v => <option key={v} value={v}>{v}</option>)}</select></div>
                                    <div><label className="label-text">Ngày sinh</label><input type="date" className="input-field" value={formData.dob} onChange={e => setFormData({...formData, dob: e.target.value})} /></div>
                                    <div><label className="label-text">CCCD / CMND</label><input className="input-field" value={formData.idCard} onChange={e => setFormData({...formData, idCard: e.target.value})} /></div>
                                    <div><label className="label-text">Nghề nghiệp</label><input className="input-field" value={formData.job} onChange={e => setFormData({...formData, job: e.target.value})} /></div>
                                    <div className="md:col-span-2"><label className="label-text">Địa chỉ / Công ty</label><input className="input-field" value={formData.companyAddress} onChange={e => setFormData({...formData, companyAddress: e.target.value})} /></div>
                                    <div><label className="label-text">Trạng thái</label><select className="input-field" value={formData.status} onChange={(e: any) => setFormData({...formData, status: e.target.value})}>{Object.values(CustomerStatus).map(v => <option key={v} value={v}>{v}</option>)}</select></div>
                                </div>
                            )}

                            {/* TAB: HISTORY */}
                            {activeTab === 'history' && (
                                <div className="space-y-4">
                                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
                                        <h4 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Thêm ghi chú mới</h4>
                                        <div className="flex gap-2">
                                            <input 
                                                type="text" 
                                                className="input-field flex-1" 
                                                placeholder="VD: Khách hẹn chiều thứ 7 cafe..." 
                                                value={newNote}
                                                onChange={(e) => setNewNote(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && handleAddNote()}
                                            />
                                            <button 
                                                onClick={handleAddNote}
                                                disabled={!newNote.trim()}
                                                className="bg-pru-red text-white px-4 rounded-lg font-bold hover:bg-red-700 disabled:opacity-50 transition"
                                            >
                                                Lưu
                                            </button>
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        <h4 className="text-sm font-bold text-gray-700 dark:text-gray-300">Lịch sử tương tác</h4>
                                        {formData.interactionHistory && formData.interactionHistory.length > 0 ? (
                                            formData.interactionHistory.map((item, idx) => (
                                                <div key={idx} className="bg-white dark:bg-gray-800 p-3 rounded-lg border border-gray-100 dark:border-gray-700 text-sm shadow-sm flex items-start gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-50 shrink-0">
                                                        <i className="fas fa-history text-xs"></i>
                                                    </div>
                                                    <div className="text-gray-600 dark:text-gray-300">{item}</div>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="text-center py-8 text-gray-400 dark:text-gray-500 italic border border-dashed rounded-lg">
                                                Chưa có lịch sử tương tác nào.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* TAB: HEALTH */}
                            {activeTab === 'health' && (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div><label className="label-text">Chiều cao (cm)</label><input type="number" className="input-field" value={formData.health.height} onChange={e => setFormData({...formData, health: {...formData.health, height: Number(e.target.value)}})} /></div>
                                        <div><label className="label-text">Cân nặng (kg)</label><input type="number" className="input-field" value={formData.health.weight} onChange={e => setFormData({...formData, health: {...formData.health, weight: Number(e.target.value)}})} /></div>
                                    </div>
                                    <div><label className="label-text">Tiền sử bệnh án</label><textarea rows={4} className="input-field" value={formData.health.medicalHistory} onChange={e => setFormData({...formData, health: {...formData.health, medicalHistory: e.target.value}})} placeholder="Ví dụ: Đã mổ ruột thừa năm 2020..." /></div>
                                    <div><label className="label-text">Thói quen sinh hoạt</label><textarea rows={2} className="input-field" value={formData.health.habits} onChange={e => setFormData({...formData, health: {...formData.health, habits: e.target.value}})} /></div>
                                </div>
                            )}

                            {/* TAB: FAMILY */}
                            {activeTab === 'family' && (
                                <div className="space-y-6">
                                    {/* Add Relationship Form */}
                                    <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-xl border border-purple-100 dark:border-purple-900/30">
                                        <h4 className="text-sm font-bold text-purple-800 dark:text-purple-300 mb-3 flex items-center">
                                            <i className="fas fa-users mr-2"></i> Thêm người thân
                                        </h4>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                                            <div className="md:col-span-1">
                                                <SearchableCustomerSelect 
                                                    customers={customers} 
                                                    value={newRelCustomer?.fullName || ''} 
                                                    onChange={setNewRelCustomer}
                                                    label="Chọn người thân (Đã có trong DS)"
                                                    placeholder="Tìm tên..."
                                                />
                                            </div>
                                            <div>
                                                <label className="label-text">Mối quan hệ</label>
                                                <select className="input-field" value={newRelType} onChange={(e) => setNewRelType(e.target.value as RelationshipType)}>
                                                    {Object.values(RelationshipType).map(t => <option key={t} value={t}>{t}</option>)}
                                                </select>
                                            </div>
                                            <button 
                                                onClick={handleAddRelationship} 
                                                className="bg-purple-600 text-white py-2.5 px-4 rounded-lg font-bold hover:bg-purple-700 shadow-sm transition"
                                            >
                                                <i className="fas fa-plus mr-1"></i> Thêm
                                            </button>
                                        </div>
                                        <p className="text-[10px] text-gray-500 mt-2 italic">* Nếu người thân chưa có trong danh sách, vui lòng tạo khách hàng mới trước.</p>
                                    </div>

                                    {/* Relationships List */}
                                    <div className="space-y-3">
                                        <h4 className="text-sm font-bold text-gray-700 dark:text-gray-300">Danh sách người thân</h4>
                                        {formData.relationships && formData.relationships.length > 0 ? (
                                            <div className="grid grid-cols-1 gap-3">
                                                {formData.relationships.map((rel, idx) => {
                                                    const relCustomer = customers.find(c => c.id === rel.relatedCustomerId);
                                                    return (
                                                        <div key={idx} className="bg-white dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700 flex justify-between items-center shadow-sm">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-300 font-bold">
                                                                    {relCustomer?.fullName.charAt(0)}
                                                                </div>
                                                                <div>
                                                                    <div className="font-bold text-gray-800 dark:text-gray-200">{relCustomer?.fullName || 'Không xác định'}</div>
                                                                    <div className="text-xs text-purple-600 dark:text-purple-400 font-medium bg-purple-50 dark:bg-purple-900/20 px-2 py-0.5 rounded inline-block mt-0.5">{rel.relationship}</div>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-3">
                                                                <div className="text-right mr-2 hidden sm:block">
                                                                    <div className="text-xs text-gray-500">{relCustomer?.phone}</div>
                                                                    <div className="text-[10px] text-gray-400">{relCustomer?.dob ? formatDateVN(relCustomer.dob) : ''}</div>
                                                                </div>
                                                                <button onClick={() => handleRemoveRelationship(idx)} className="text-red-400 hover:text-red-600 p-2 rounded-full hover:bg-red-50 transition">
                                                                    <i className="fas fa-trash-alt"></i>
                                                                </button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <div className="text-center py-8 text-gray-400 dark:text-gray-500 italic border border-dashed rounded-lg bg-gray-50 dark:bg-gray-800/50">
                                                Chưa có thông tin gia đình.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* TAB: CONTRACTS */}
                            {activeTab === 'contracts' && (
                                <div className="space-y-4">
                                    {customerContracts.length > 0 ? (
                                        <div className="space-y-3">
                                            {customerContracts.map(c => (
                                                <div key={c.id} onClick={() => setViewContract(c)} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex justify-between items-center hover:shadow-md transition cursor-pointer">
                                                    <div>
                                                        <h4 className="font-bold text-pru-red text-lg">{c.contractNumber}</h4>
                                                        <p className="font-medium text-gray-800 dark:text-gray-200">{c.mainProduct.productName}</p>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="font-bold text-gray-800 dark:text-gray-200">{c.totalFee.toLocaleString()} đ</div>
                                                        <span className="text-xs font-bold text-green-600">{c.status}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : <div className="text-center py-10 text-gray-400 border border-dashed rounded-xl">Chưa có hợp đồng nào.</div>}
                                </div>
                            )}

                            {/* TAB: ILLUSTRATIONS */}
                            {activeTab === 'illustrations' && (
                                <div className="space-y-4">
                                    <div className="flex justify-end mb-2">
                                        <button 
                                            onClick={() => { setShowModal(false); navigate('/product-advisory', { state: { customerId: formData.id } }); }} 
                                            className="text-xs bg-purple-100 text-purple-700 font-bold px-3 py-1.5 rounded-lg hover:bg-purple-200 transition"
                                        >
                                            <i className="fas fa-plus mr-1"></i> Tạo bảng minh họa mới
                                        </button>
                                    </div>
                                    {customerIllustrations.length > 0 ? (
                                        <div className="space-y-3">
                                            {customerIllustrations.map(ill => (
                                                <div key={ill.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 hover:shadow-md transition relative group">
                                                    <div className="flex justify-between items-start mb-2">
                                                        <div>
                                                            <h4 className="font-bold text-gray-800 dark:text-gray-100 text-sm">{ill.mainProduct.productName}</h4>
                                                            <p className="text-xs text-gray-500 mt-0.5">Ngày tạo: {formatDateVN(ill.createdAt.split('T')[0])}</p>
                                                        </div>
                                                        <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${ill.status === 'CONVERTED' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{ill.status === 'CONVERTED' ? 'Đã chốt' : 'Dự thảo'}</span>
                                                    </div>
                                                    
                                                    <div className="flex justify-between items-end">
                                                        <div>
                                                            <p className="text-xs text-gray-500 mb-1">Riders: {ill.riders.length}</p>
                                                            <p className="text-pru-red font-bold">{ill.totalFee.toLocaleString()} đ</p>
                                                        </div>
                                                        <div className="flex gap-2">
                                                            {ill.status !== 'CONVERTED' && (
                                                                <button 
                                                                    onClick={() => handleConvertIllustration(ill)}
                                                                    className="bg-green-600 text-white text-xs px-3 py-1.5 rounded-lg font-bold hover:bg-green-700 shadow-sm"
                                                                    title="Chuyển thành Hợp đồng chờ thẩm định"
                                                                >
                                                                    Chốt HĐ
                                                                </button>
                                                            )}
                                                            <button 
                                                                onClick={() => handleDeleteIllustration(ill.id)}
                                                                className="bg-gray-100 dark:bg-gray-700 text-red-500 text-xs px-3 py-1.5 rounded-lg font-bold hover:bg-red-50 dark:hover:bg-red-900/30"
                                                                title="Xóa"
                                                            >
                                                                <i className="fas fa-trash"></i>
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-center py-10 text-gray-400 border border-dashed rounded-xl">
                                            Chưa có bảng minh họa nào.
                                        </div>
                                    )}
                                </div>
                            )}
                            
                            {/* TAB: ANALYSIS */}
                            {activeTab === 'analysis' && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="label-text">Thu nhập bình quân (VNĐ/Tháng)</label>
                                        <CurrencyInput
                                            className="input-field font-bold text-green-600"
                                            value={Number(formData.analysis.incomeEstimate) || 0}
                                            onChange={(v) => setFormData({
                                                ...formData,
                                                analysis: {
                                                    ...formData.analysis,
                                                    incomeEstimate: v.toString()
                                                }
                                            })}
                                            placeholder="Nhập số tiền..."
                                        />
                                    </div>
                                    <div><label className="label-text">Số con</label><input type="number" className="input-field" value={formData.analysis.childrenCount} onChange={e => setFormData({...formData, analysis: {...formData.analysis, childrenCount: Number(e.target.value)}})} /></div>
                                    <div><label className="label-text">Tài chính</label><select className="input-field" value={formData.analysis.financialStatus} onChange={(e: any) => setFormData({...formData, analysis: {...formData.analysis, financialStatus: e.target.value}})}>{Object.values(FinancialStatus).map(v => <option key={v} value={v}>{v}</option>)}</select></div>
                                    <div><label className="label-text">Sẵn sàng</label><select className="input-field" value={formData.analysis.readiness} onChange={(e: any) => setFormData({...formData, analysis: {...formData.analysis, readiness: e.target.value}})}>{Object.values(ReadinessLevel).map(v => <option key={v} value={v}>{v}</option>)}</select></div>
                                    <div className="md:col-span-2"><label className="label-text">Mối quan tâm</label><input className="input-field" value={formData.analysis.keyConcerns} onChange={e => setFormData({...formData, analysis: {...formData.analysis, keyConcerns: e.target.value}})} /></div>
                                </div>
                            )}
                        </div>

                        <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex justify-end gap-3">
                            <button onClick={() => setShowModal(false)} className="px-5 py-2 text-gray-600 dark:text-gray-300 font-medium hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Hủy</button>
                            <button onClick={handleSave} className="px-5 py-2 bg-pru-red text-white font-bold rounded-lg hover:bg-red-700 shadow-md">Lưu Khách Hàng</button>
                        </div>
                    </div>
                </div>
            )}

            {/* View Contract Modal - Enhanced */}
            {viewContract && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4 animate-fade-in backdrop-blur-sm">
                    <div className="bg-white dark:bg-pru-card rounded-xl max-w-lg w-full p-6 shadow-2xl transition-colors border border-gray-100 dark:border-gray-700 relative">
                        {/* Header */}
                        <div className="flex justify-between items-start mb-6 border-b border-gray-100 dark:border-gray-800 pb-4">
                            <div>
                                <h3 className="text-2xl font-bold text-pru-red dark:text-red-400 flex items-center gap-2">
                                    <i className="fas fa-file-contract"></i>
                                    {viewContract.contractNumber}
                                </h3>
                                <div className={`inline-block px-2 py-0.5 rounded text-xs font-bold mt-1 ${viewContract.status === 'Đang hiệu lực' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                    {viewContract.status}
                                </div>
                            </div>
                            <button onClick={() => setViewContract(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 bg-gray-100 dark:bg-gray-800 w-8 h-8 rounded-full flex items-center justify-center transition">
                                <i className="fas fa-times"></i>
                            </button>
                        </div>

                        {/* Content Details */}
                        <div className="space-y-5">
                            {/* Main Product */}
                            <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl">
                                <div className="text-xs font-bold text-gray-500 uppercase mb-2">Sản phẩm chính</div>
                                <div className="font-bold text-gray-800 dark:text-gray-100 text-lg mb-1">{viewContract.mainProduct.productName}</div>
                                <div className="flex justify-between text-sm text-gray-600 dark:text-gray-300">
                                    <span>
                                         {(viewContract.mainProduct.productName.toLowerCase().includes('hành trang vui khỏe') || viewContract.mainProduct.productName.toLowerCase().includes('sức khỏe')) && viewContract.mainProduct.attributes?.plan
                                            ? `Chương trình: ${viewContract.mainProduct.attributes.plan}`
                                            : `STBH: ${viewContract.mainProduct.sumAssured.toLocaleString()} đ`
                                         }
                                    </span>
                                    <span>Phí: {viewContract.mainProduct.fee.toLocaleString()} đ</span>
                                </div>
                            </div>

                            {/* Riders */}
                            {viewContract.riders.length > 0 && (
                                <div>
                                    <div className="text-xs font-bold text-gray-500 uppercase mb-2">Sản phẩm bổ trợ ({viewContract.riders.length})</div>
                                    <div className="space-y-2">
                                        {viewContract.riders.map((r, idx) => (
                                            <div key={idx} className="flex justify-between items-center text-sm p-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
                                                <div className="flex-1 pr-2">
                                                    <div className="font-medium text-gray-800 dark:text-gray-200">{r.productName}</div>
                                                    <div className="text-xs text-gray-500">
                                                        {(r.productName.toLowerCase().includes('hành trang vui khỏe') || r.productName.toLowerCase().includes('sức khỏe')) && r.attributes?.plan
                                                            ? `Chương trình: ${r.attributes.plan}`
                                                            : `STBH: ${r.sumAssured.toLocaleString()} đ`
                                                        }
                                                    </div>
                                                </div>
                                                <div className="font-bold text-gray-600 dark:text-gray-400">{r.fee.toLocaleString()} đ</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Dates & Totals */}
                            <div className="grid grid-cols-2 gap-4 border-t border-gray-100 dark:border-gray-800 pt-4">
                                <div>
                                    <div className="text-xs text-gray-500">Ngày hiệu lực</div>
                                    <div className="font-medium text-gray-800 dark:text-gray-200">{formatDateVN(viewContract.effectiveDate)}</div>
                                </div>
                                <div>
                                    <div className="text-xs text-gray-500">Ngày đóng phí tới</div>
                                    <div className="font-medium text-gray-800 dark:text-gray-200">{formatDateVN(viewContract.nextPaymentDate)}</div>
                                </div>
                            </div>

                            <div className="bg-pru-red/10 dark:bg-red-900/20 p-4 rounded-xl flex justify-between items-center mt-2">
                                <span className="text-sm font-bold text-pru-red dark:text-red-300">Tổng phí đóng ({viewContract.paymentFrequency})</span>
                                <span className="text-xl font-bold text-pru-red dark:text-red-400">{viewContract.totalFee.toLocaleString()} đ</span>
                            </div>
                        </div>
                        
                        <div className="mt-6">
                            <button onClick={() => setViewContract(null)} className="w-full py-3 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-bold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition">
                                Đóng
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            <ConfirmModal 
                isOpen={deleteConfirm.isOpen} 
                title="Xóa khách hàng?" 
                message={`Bạn có chắc muốn xóa khách hàng ${deleteConfirm.name}? Hành động này không thể hoàn tác.`} 
                onConfirm={() => onDelete(deleteConfirm.id)} 
                onClose={() => setDeleteConfirm({ isOpen: false, id: '', name: '' })} 
            />

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

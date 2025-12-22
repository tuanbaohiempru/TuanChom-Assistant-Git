import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Customer, Contract, CustomerStatus, Gender, FinancialStatus, PersonalityType, ReadinessLevel, RelationshipType, CustomerRelationship, CustomerDocument } from '../types';
import { ConfirmModal, formatDateVN, SearchableCustomerSelect } from '../components/Shared';
import { uploadFile } from '../services/storage';

interface CustomersPageProps {
    customers: Customer[];
    contracts: Contract[];
    onAdd: (c: Customer) => void;
    onUpdate: (c: Customer) => void;
    onDelete: (id: string) => void;
}

const CustomersPage: React.FC<CustomersPageProps> = ({ customers, contracts, onAdd, onUpdate, onDelete }) => {
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState<string>('all');
    
    // Modal States
    const [showModal, setShowModal] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [activeTab, setActiveTab] = useState<'info' | 'health' | 'analysis' | 'family' | 'documents'>('info');
    const [deleteConfirm, setDeleteConfirm] = useState<{isOpen: boolean, id: string, name: string}>({ isOpen: false, id: '', name: '' });
    const [isUploading, setIsUploading] = useState(false);

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
        documents: [], // Initialize documents
        health: { medicalHistory: '', height: 165, weight: 60, habits: '' },
        analysis: {
            childrenCount: 0,
            incomeEstimate: '',
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

    const handleOpenAdd = () => {
        setFormData(defaultCustomer);
        setIsEditing(false);
        setActiveTab('info');
        setNewRelCustomer(null);
        setShowModal(true);
    };

    const handleOpenEdit = (c: Customer) => {
        // Merge with default values to ensure objects exist if data is missing from DB
        const safeData = {
            ...c,
            relationships: c.relationships || [],
            documents: c.documents || [],
            health: c.health || defaultCustomer.health,
            analysis: c.analysis || defaultCustomer.analysis
        };
        setFormData(safeData);
        setIsEditing(true);
        setActiveTab('info');
        setNewRelCustomer(null);
        setShowModal(true);
    };

    const handleSave = () => {
        if (!formData.fullName || !formData.phone) return alert("Vui lòng nhập Họ tên và SĐT");
        isEditing ? onUpdate(formData) : onAdd(formData);
        setShowModal(false);
    };

    // Helper to count active contracts for a customer
    const getActiveContractCount = (customerId: string) => {
        return contracts.filter(c => c.customerId === customerId && c.status === 'Đang hiệu lực').length;
    };

    // --- RELATIONSHIP LOGIC ---
    const handleAddRelationship = () => {
        if (!newRelCustomer) return alert("Vui lòng chọn người thân!");
        
        const exists = formData.relationships?.some(r => r.relatedCustomerId === newRelCustomer.id);
        if (exists) return alert("Người này đã có trong danh sách gia đình!");

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
        setFormData(prev => ({...prev, relationships: newRels}));
    };

    // --- DOCUMENT UPLOAD LOGIC ---
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Simple validation
        const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
        if (!allowedTypes.includes(file.type)) {
            return alert("Chỉ hỗ trợ file ảnh (JPG, PNG) hoặc PDF");
        }

        setIsUploading(true);
        try {
            // Upload to 'customer_docs' folder in Firebase Storage
            const downloadUrl = await uploadFile(file, 'customer_docs');
            
            const newDoc: CustomerDocument = {
                id: Date.now().toString(),
                name: file.name,
                url: downloadUrl,
                type: file.type.startsWith('image/') ? 'image' : 'pdf',
                uploadDate: new Date().toISOString()
            };

            setFormData(prev => ({
                ...prev,
                documents: [...(prev.documents || []), newDoc]
            }));

        } catch (error) {
            console.error("Upload error:", error);
            alert("Lỗi khi tải file. Vui lòng thử lại.");
        } finally {
            setIsUploading(false);
            // Reset input value to allow uploading same file again if needed
            e.target.value = '';
        }
    };

    const handleDeleteDocument = (index: number) => {
        if(!window.confirm("Bạn có chắc muốn xóa tài liệu này?")) return;
        const newDocs = [...(formData.documents || [])];
        newDocs.splice(index, 1);
        setFormData(prev => ({...prev, documents: newDocs}));
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <h1 className="text-2xl font-bold text-gray-800">Quản lý Khách hàng</h1>
                <button onClick={handleOpenAdd} className="bg-pru-red text-white px-5 py-2.5 rounded-xl hover:bg-red-700 transition shadow-lg shadow-red-500/30 font-medium flex items-center">
                    <i className="fas fa-user-plus mr-2"></i>Thêm khách hàng
                </button>
            </div>

            {/* Filters */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col md:flex-row gap-4 items-center">
                <div className="relative w-full md:w-1/3">
                    <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
                    <input 
                        className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-1 focus:ring-pru-red outline-none"
                        placeholder="Tìm tên, SĐT, CCCD..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="flex gap-2 w-full md:w-auto overflow-x-auto">
                    <button onClick={() => setFilterStatus('all')} className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap border ${filterStatus === 'all' ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-500 border-gray-200'}`}>Tất cả</button>
                    {Object.values(CustomerStatus).map(s => (
                        <button key={s} onClick={() => setFilterStatus(s)} className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap border ${filterStatus === s ? 'bg-red-50 text-pru-red border-red-200' : 'bg-white text-gray-500 border-gray-200'}`}>
                            {s}
                        </button>
                    ))}
                </div>
            </div>

            {/* Grid List */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredCustomers.map(c => (
                    <div key={c.id} className="bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition group flex flex-col">
                        <div className="p-5 flex items-start justify-between border-b border-gray-50">
                            <div className="flex items-center gap-3">
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold border-2 ${c.gender === Gender.FEMALE ? 'bg-pink-50 text-pink-500 border-pink-100' : 'bg-blue-50 text-blue-500 border-blue-100'}`}>
                                    {c.fullName.charAt(0)}
                                </div>
                                <div>
                                    <h3 className="font-bold text-gray-800 line-clamp-1" title={c.fullName}>{c.fullName}</h3>
                                    <p className="text-xs text-gray-500">{c.job || 'Chưa cập nhật nghề'}</p>
                                </div>
                            </div>
                            <span className={`w-2 h-2 rounded-full ${c.status === CustomerStatus.SIGNED ? 'bg-green-500' : c.status === CustomerStatus.ADVISING ? 'bg-yellow-500' : 'bg-gray-300'}`} title={c.status}></span>
                        </div>
                        
                        <div className="p-5 space-y-3 flex-1">
                            <div className="flex items-center text-sm text-gray-600">
                                <i className="fas fa-phone-alt w-5 text-gray-400 text-xs"></i>
                                <span>{c.phone}</span>
                            </div>
                            <div className="flex items-center text-sm text-gray-600">
                                <i className="fas fa-birthday-cake w-5 text-gray-400 text-xs"></i>
                                <span>{formatDateVN(c.dob) || '--/--/----'}</span>
                            </div>
                            <div className="flex items-center text-sm text-gray-600">
                                <i className="fas fa-file-contract w-5 text-gray-400 text-xs"></i>
                                <span>{getActiveContractCount(c.id)} HĐ hiệu lực</span>
                            </div>
                            <div className="flex flex-wrap gap-1 pt-2">
                                <span className={`text-[10px] px-2 py-0.5 rounded border ${
                                    c.analysis?.readiness === ReadinessLevel.HOT ? 'bg-red-50 text-red-600 border-red-100' :
                                    c.analysis?.readiness === ReadinessLevel.WARM ? 'bg-orange-50 text-orange-600 border-orange-100' : 'bg-gray-50 text-gray-500 border-gray-200'
                                }`}>{c.analysis?.readiness || 'N/A'}</span>
                                <span className="text-[10px] px-2 py-0.5 rounded bg-gray-50 text-gray-500 border border-gray-200">{c.analysis?.personality || 'N/A'}</span>
                            </div>
                        </div>

                        <div className="p-3 bg-gray-50 rounded-b-xl border-t border-gray-100 flex justify-between items-center gap-2">
                            <button onClick={() => navigate(`/advisory/${c.id}`)} className="flex-1 py-1.5 rounded-lg bg-purple-100 text-purple-700 text-xs font-bold hover:bg-purple-200 transition flex items-center justify-center">
                                <i className="fas fa-theater-masks mr-1.5"></i>Roleplay
                            </button>
                            <div className="flex gap-1">
                                <button onClick={() => handleOpenEdit(c)} className="w-8 h-8 rounded bg-white border border-gray-200 text-blue-500 hover:border-blue-200 hover:bg-blue-50 flex items-center justify-center"><i className="fas fa-edit"></i></button>
                                <button onClick={() => setDeleteConfirm({isOpen: true, id: c.id, name: c.fullName})} className="w-8 h-8 rounded bg-white border border-gray-200 text-red-500 hover:border-red-200 hover:bg-red-50 flex items-center justify-center"><i className="fas fa-trash"></i></button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
                    <div className="bg-white rounded-xl max-w-4xl w-full h-[90vh] flex flex-col shadow-2xl overflow-hidden">
                        <div className="p-5 border-b flex justify-between items-center bg-gray-50">
                            <h3 className="text-xl font-bold text-gray-800">{isEditing ? 'Cập nhật Khách Hàng' : 'Thêm Khách Hàng Mới'}</h3>
                            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><i className="fas fa-times text-xl"></i></button>
                        </div>
                        
                        <div className="flex border-b border-gray-200">
                            <button onClick={() => setActiveTab('info')} className={`flex-1 py-3 text-sm font-bold border-b-2 transition ${activeTab === 'info' ? 'border-pru-red text-pru-red' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Thông tin chung</button>
                            <button onClick={() => setActiveTab('health')} className={`flex-1 py-3 text-sm font-bold border-b-2 transition ${activeTab === 'health' ? 'border-pru-red text-pru-red' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Sức khỏe</button>
                            <button onClick={() => setActiveTab('family')} className={`flex-1 py-3 text-sm font-bold border-b-2 transition ${activeTab === 'family' ? 'border-pru-red text-pru-red' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Gia đình <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full ml-1">{formData.relationships?.length || 0}</span></button>
                            <button onClick={() => setActiveTab('documents')} className={`flex-1 py-3 text-sm font-bold border-b-2 transition ${activeTab === 'documents' ? 'border-pru-red text-pru-red' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Tài liệu <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full ml-1">{formData.documents?.length || 0}</span></button>
                            <button onClick={() => setActiveTab('analysis')} className={`flex-1 py-3 text-sm font-bold border-b-2 transition ${activeTab === 'analysis' ? 'border-pru-red text-pru-red' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Phân tích nhu cầu</button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 bg-white space-y-6">
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

                            {/* TAB: HEALTH */}
                            {activeTab === 'health' && (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div><label className="label-text">Chiều cao (cm)</label><input type="number" className="input-field" value={formData.health.height} onChange={e => setFormData({...formData, health: {...formData.health, height: Number(e.target.value)}})} /></div>
                                        <div><label className="label-text">Cân nặng (kg)</label><input type="number" className="input-field" value={formData.health.weight} onChange={e => setFormData({...formData, health: {...formData.health, weight: Number(e.target.value)}})} /></div>
                                    </div>
                                    <div><label className="label-text">Tiền sử bệnh án</label><textarea rows={4} className="input-field" value={formData.health.medicalHistory} onChange={e => setFormData({...formData, health: {...formData.health, medicalHistory: e.target.value}})} placeholder="Ví dụ: Đã mổ ruột thừa năm 2020..." /></div>
                                    <div><label className="label-text">Thói quen sinh hoạt (Hút thuốc / Rượu bia)</label><textarea rows={2} className="input-field" value={formData.health.habits} onChange={e => setFormData({...formData, health: {...formData.health, habits: e.target.value}})} /></div>
                                </div>
                            )}
                            
                            {/* TAB: FAMILY */}
                            {activeTab === 'family' && (
                                <div className="space-y-6">
                                    <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                                        <div className="flex justify-between items-center mb-3">
                                            <h4 className="font-bold text-blue-800 text-sm">Thêm mối quan hệ</h4>
                                            <span className="text-xs text-blue-600 italic">Thêm thành viên để bán chéo sản phẩm</span>
                                        </div>
                                        <div className="flex flex-col md:flex-row gap-3 items-end">
                                            <div className="flex-1 w-full">
                                                <label className="label-text text-blue-800">Chọn người thân (Đã có trong hệ thống)</label>
                                                <SearchableCustomerSelect 
                                                    customers={customers.filter(c => c.id !== formData.id)} 
                                                    value={newRelCustomer?.fullName || ''}
                                                    onChange={setNewRelCustomer}
                                                    placeholder="Chọn khách hàng..."
                                                />
                                            </div>
                                            <div className="w-full md:w-48">
                                                <label className="label-text text-blue-800">Mối quan hệ</label>
                                                <select 
                                                    className="input-field" 
                                                    value={newRelType} 
                                                    onChange={(e: any) => setNewRelType(e.target.value)}
                                                >
                                                    {Object.values(RelationshipType).map(t => <option key={t} value={t}>{t}</option>)}
                                                </select>
                                            </div>
                                            <button 
                                                onClick={handleAddRelationship}
                                                className="bg-blue-600 text-white px-4 py-2.5 rounded-lg font-bold hover:bg-blue-700 transition shadow-sm w-full md:w-auto"
                                            >
                                                <i className="fas fa-link mr-2"></i>Liên kết
                                            </button>
                                        </div>
                                    </div>

                                    <div>
                                        <h4 className="font-bold text-gray-800 mb-3 border-b pb-2">Sơ đồ Phả hệ Gia đình ({formData.relationships?.length || 0})</h4>
                                        <div className="space-y-3">
                                            {formData.relationships && formData.relationships.length > 0 ? (
                                                formData.relationships.map((rel, idx) => {
                                                    const relCustomer = customers.find(c => c.id === rel.relatedCustomerId);
                                                    return (
                                                        <div key={idx} className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition">
                                                            <div className="flex items-center gap-4">
                                                                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white ${relCustomer?.gender === Gender.FEMALE ? 'bg-pink-400' : 'bg-blue-400'}`}>
                                                                    {relCustomer?.fullName.charAt(0) || '?'}
                                                                </div>
                                                                <div>
                                                                    <div className="flex items-center gap-2">
                                                                        <h5 className="font-bold text-gray-800">{relCustomer?.fullName || 'Khách hàng đã xóa'}</h5>
                                                                        <span className="bg-gray-100 text-gray-600 text-[10px] px-2 py-0.5 rounded-full font-bold border border-gray-200">
                                                                            {rel.relationship}
                                                                        </span>
                                                                    </div>
                                                                    <p className="text-xs text-gray-500 mt-0.5">
                                                                        <i className="fas fa-birthday-cake mr-1"></i>
                                                                        {relCustomer ? `${new Date().getFullYear() - new Date(relCustomer.dob).getFullYear()} tuổi` : 'N/A'} 
                                                                        <span className="mx-1">•</span>
                                                                        {getActiveContractCount(rel.relatedCustomerId)} HĐ
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            <button 
                                                                onClick={() => handleRemoveRelationship(idx)}
                                                                className="w-8 h-8 rounded-full text-gray-400 hover:bg-red-50 hover:text-red-500 transition flex items-center justify-center"
                                                                title="Gỡ liên kết"
                                                            >
                                                                <i className="fas fa-unlink"></i>
                                                            </button>
                                                        </div>
                                                    );
                                                })
                                            ) : (
                                                <div className="text-center py-8 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                                                    <i className="fas fa-users text-gray-300 text-3xl mb-2"></i>
                                                    <p className="text-gray-500 text-sm">Chưa có thành viên nào trong gia đình.</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* TAB: DOCUMENTS (New) */}
                            {activeTab === 'documents' && (
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center mb-2">
                                        <h3 className="font-bold text-gray-800">Hồ sơ số & Tài liệu</h3>
                                        <label className={`bg-blue-600 text-white px-4 py-2 rounded-lg font-bold shadow-sm hover:bg-blue-700 transition cursor-pointer flex items-center ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                            {isUploading ? <i className="fas fa-spinner fa-spin mr-2"></i> : <i className="fas fa-cloud-upload-alt mr-2"></i>}
                                            {isUploading ? 'Đang tải...' : 'Tải lên'}
                                            <input 
                                                type="file" 
                                                className="hidden" 
                                                accept="image/*,application/pdf"
                                                onChange={handleFileUpload}
                                                disabled={isUploading}
                                            />
                                        </label>
                                    </div>

                                    {formData.documents && formData.documents.length > 0 ? (
                                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                            {formData.documents.map((doc, idx) => (
                                                <div key={idx} className="group relative bg-white border border-gray-200 rounded-xl p-3 hover:shadow-lg transition flex flex-col items-center">
                                                    <div className="w-full h-32 bg-gray-50 rounded-lg mb-3 flex items-center justify-center overflow-hidden relative">
                                                        {doc.type === 'image' ? (
                                                            <img src={doc.url} alt={doc.name} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <i className="fas fa-file-pdf text-4xl text-red-500"></i>
                                                        )}
                                                        {/* Hover Overlay */}
                                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2">
                                                             <a href={doc.url} target="_blank" rel="noopener noreferrer" className="w-8 h-8 bg-white rounded-full flex items-center justify-center text-blue-600 hover:scale-110 transition"><i className="fas fa-eye"></i></a>
                                                             <button onClick={() => handleDeleteDocument(idx)} className="w-8 h-8 bg-white rounded-full flex items-center justify-center text-red-600 hover:scale-110 transition"><i className="fas fa-trash-alt"></i></button>
                                                        </div>
                                                    </div>
                                                    <div className="text-center w-full">
                                                        <p className="text-sm font-medium text-gray-800 truncate" title={doc.name}>{doc.name}</p>
                                                        <p className="text-[10px] text-gray-500">{formatDateVN(doc.uploadDate.split('T')[0])}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="border-2 border-dashed border-gray-300 rounded-2xl p-12 flex flex-col items-center justify-center text-center bg-gray-50">
                                            <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mb-4 text-gray-400">
                                                <i className="fas fa-folder-open text-3xl"></i>
                                            </div>
                                            <p className="text-gray-500 font-medium mb-1">Chưa có tài liệu nào.</p>
                                            <p className="text-xs text-gray-400">Tải lên CCCD, Hợp đồng, Giấy khám sức khỏe...</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* TAB: ANALYSIS */}
                            {activeTab === 'analysis' && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div><label className="label-text">Thu nhập ước tính</label><input className="input-field" value={formData.analysis.incomeEstimate} onChange={e => setFormData({...formData, analysis: {...formData.analysis, incomeEstimate: e.target.value}})} placeholder="VD: 20-30 triệu" /></div>
                                    <div><label className="label-text">Số con</label><input type="number" className="input-field" value={formData.analysis.childrenCount} onChange={e => setFormData({...formData, analysis: {...formData.analysis, childrenCount: Number(e.target.value)}})} /></div>
                                    <div><label className="label-text">Tình hình tài chính</label><select className="input-field" value={formData.analysis.financialStatus} onChange={(e: any) => setFormData({...formData, analysis: {...formData.analysis, financialStatus: e.target.value}})}>{Object.values(FinancialStatus).map(v => <option key={v} value={v}>{v}</option>)}</select></div>
                                    <div><label className="label-text">Mức độ sẵn sàng</label><select className="input-field" value={formData.analysis.readiness} onChange={(e: any) => setFormData({...formData, analysis: {...formData.analysis, readiness: e.target.value}})}>{Object.values(ReadinessLevel).map(v => <option key={v} value={v}>{v}</option>)}</select></div>
                                    <div><label className="label-text">Nhóm tính cách (DISC/MBTI)</label><select className="input-field" value={formData.analysis.personality} onChange={(e: any) => setFormData({...formData, analysis: {...formData.analysis, personality: e.target.value}})}>{Object.values(PersonalityType).map(v => <option key={v} value={v}>{v}</option>)}</select></div>
                                    <div><label className="label-text">Hiểu biết bảo hiểm</label><input className="input-field" value={formData.analysis.insuranceKnowledge} onChange={e => setFormData({...formData, analysis: {...formData.analysis, insuranceKnowledge: e.target.value}})} /></div>
                                    <div className="md:col-span-2"><label className="label-text">Mối quan tâm chính</label><input className="input-field" value={formData.analysis.keyConcerns} onChange={e => setFormData({...formData, analysis: {...formData.analysis, keyConcerns: e.target.value}})} placeholder="VD: Học vấn cho con, Hưu trí..." /></div>
                                </div>
                            )}
                        </div>

                        <div className="p-4 border-t bg-gray-50 flex justify-end gap-3">
                            <button onClick={() => setShowModal(false)} className="px-5 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-lg">Hủy</button>
                            <button onClick={handleSave} className="px-5 py-2 bg-pru-red text-white font-bold rounded-lg hover:bg-red-700 shadow-md">Lưu Khách Hàng</button>
                        </div>
                    </div>
                </div>
            )}

            <ConfirmModal isOpen={deleteConfirm.isOpen} title="Xóa khách hàng?" message={`Bạn có chắc muốn xóa khách hàng ${deleteConfirm.name}? Mọi hợp đồng và lịch hẹn liên quan cũng nên được kiểm tra lại.`} onConfirm={() => onDelete(deleteConfirm.id)} onClose={() => setDeleteConfirm({isOpen: false, id: '', name: ''})} />

            <style>{`
                .input-field { width: 100%; border: 1px solid #e5e7eb; padding: 0.625rem; border-radius: 0.5rem; outline: none; font-size: 0.875rem; transition: all; }
                .input-field:focus { border-color: #ed1b2e; ring: 1px solid #ed1b2e; }
                .label-text { display: block; font-size: 0.75rem; font-weight: 700; color: #6b7280; margin-bottom: 0.25rem; }
            `}</style>
        </div>
    );
};

export default CustomersPage;
import React, { useState, useEffect, useRef } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import AIChat from './pages/AIChat';
import { AppState, Customer, Contract, Product, Appointment, CustomerStatus, ProductType, ContractStatus, AppointmentType, AppointmentStatus, ContractProduct, PaymentFrequency } from './types';
import { subscribeToCollection, addData, updateData, deleteData, COLLECTIONS } from './services/db';
import { uploadFile } from './services/storage';

// --- HELPER FUNCTIONS ---
// Format Date to dd/mm/yyyy
const formatDateVN = (dateStr: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const [y, m, d] = parts;
    return `${d}/${m}/${y}`;
};

// --- HELPER COMPONENTS ---

// 1. Currency Input Component
const CurrencyInput: React.FC<{
    value: number;
    onChange: (val: number) => void;
    placeholder?: string;
    className?: string;
}> = ({ value, onChange, placeholder, className }) => {
    // Format number to string with dots (e.g. 1.000.000)
    const formatNumber = (num: number) => {
        return num === 0 ? '' : num.toLocaleString('vi-VN');
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        // Remove non-digit characters
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
            />
            {value > 0 && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none">
                    VND
                </span>
            )}
        </div>
    );
};

// 2. Searchable Customer Select Component
const SearchableCustomerSelect: React.FC<{
    customers: Customer[];
    value: string; // Current selected name for display
    onChange: (customer: Customer) => void; // Returns the Full Customer Object
    label?: string;
    placeholder?: string;
}> = ({ customers, value, onChange, label, placeholder }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const wrapperRef = useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [wrapperRef]);

    // Filter customers based on search
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
        <div className="relative" ref={wrapperRef}>
            {label && <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>}
            <div 
                className="w-full border border-gray-300 p-2.5 rounded-lg focus-within:ring-2 focus-within:ring-red-200 bg-white flex justify-between items-center cursor-pointer"
                onClick={() => setIsOpen(!isOpen)}
            >
                <span className={`text-sm ${value ? 'text-gray-900' : 'text-gray-400'}`}>
                    {value || placeholder || "Chọn khách hàng"}
                </span>
                <i className="fas fa-chevron-down text-gray-400 text-xs"></i>
            </div>

            {isOpen && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 overflow-hidden flex flex-col">
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
                                        {c.idCard && <span className="ml-2"><i className="far fa-id-card mr-1"></i>{c.idCard}</span>}
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

// 3. Confirmation Modal Component
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
// (No changes needed in CustomersPage for this specific request, but ensuring imports are correct)
const CustomersPage: React.FC<{ 
  customers: Customer[], 
  contracts: Contract[], 
  onAdd: (c: Customer) => void,
  onUpdate: (c: Customer) => void,
  onDelete: (id: string) => void 
}> = ({ customers, contracts, onAdd, onUpdate, onDelete }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'health' | 'contracts' | 'history'>('info');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  
  const [deleteConfirm, setDeleteConfirm] = useState<{isOpen: boolean, id: string, name: string}>({
      isOpen: false, id: '', name: ''
  });

  const initialFormState: Customer = {
    id: '',
    fullName: '',
    dob: '',
    phone: '',
    idCard: '',
    job: '',
    companyAddress: '',
    health: { medicalHistory: '', height: 0, weight: 0, habits: '' },
    interactionHistory: [],
    status: CustomerStatus.POTENTIAL,
    avatarUrl: ''
  };

  const [formData, setFormData] = useState<Customer>(initialFormState);
  const [newInteraction, setNewInteraction] = useState('');

  const filtered = customers.filter(c => 
    c.fullName.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.phone.includes(searchTerm) ||
    c.idCard?.includes(searchTerm)
  );

  const customerContracts = contracts.filter(c => c.customerId === formData.id);

  const handleOpenAdd = () => {
    setFormData({ ...initialFormState, avatarUrl: `https://picsum.photos/200/200?random=${Date.now()}` });
    setIsEditing(false);
    setActiveTab('info');
    setShowModal(true);
  };

  const handleOpenEdit = (customer: Customer) => {
    setFormData({ ...customer });
    setIsEditing(true);
    setActiveTab('info');
    setShowModal(true);
  };

  const handleSubmit = () => {
    if (!formData.fullName || !formData.phone) {
      alert("Vui lòng nhập Tên và Số điện thoại!");
      return;
    }
    if (isEditing) {
      onUpdate(formData);
    } else {
      onAdd(formData);
    }
    setShowModal(false);
  };

  const addInteraction = () => {
    if (!newInteraction.trim()) return;
    const dateStr = formatDateVN(new Date().toISOString().split('T')[0]); // Use formatted date in history
    const entry = `${dateStr}: ${newInteraction}`;
    setFormData(prev => ({
      ...prev,
      interactionHistory: [entry, ...prev.interactionHistory]
    }));
    setNewInteraction('');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
        // Upload to Firebase Storage
        setIsUploading(true);
        try {
            const downloadUrl = await uploadFile(file, 'avatars');
            setFormData(prev => ({ ...prev, avatarUrl: downloadUrl }));
        } catch (error) {
            alert("Lỗi tải ảnh: " + error);
        } finally {
            setIsUploading(false);
        }
    }
  };

  const TabButton = ({ id, label, icon }: { id: typeof activeTab, label: string, icon: string }) => (
    <button 
      onClick={() => setActiveTab(id)}
      className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors flex items-center justify-center ${
        activeTab === id 
        ? 'border-pru-red text-pru-red bg-red-50' 
        : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
      }`}
    >
      <i className={`fas ${icon} mr-2`}></i>{label}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Danh sách khách hàng</h1>
          <p className="text-sm text-gray-500">Quản lý hồ sơ, sức khỏe và lịch sử tư vấn</p>
        </div>
        <button onClick={handleOpenAdd} className="bg-pru-red text-white px-4 py-2 rounded-lg hover:bg-red-700 transition shadow-sm">
          <i className="fas fa-user-plus mr-2"></i>Thêm khách hàng
        </button>
      </div>

      <div className="flex gap-4">
        <div className="relative flex-1">
            <i className="fas fa-search absolute left-3 top-3 text-gray-400"></i>
            <input 
              type="text" 
              placeholder="Tìm kiếm theo tên, SĐT, CCCD..." 
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-200 bg-white shadow-sm"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
        </div>
      </div>
      
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-gray-600 text-sm border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 font-semibold">Họ tên / CCCD</th>
                <th className="px-6 py-4 font-semibold">Liên hệ / Công việc</th>
                <th className="px-6 py-4 font-semibold">Trạng thái</th>
                <th className="px-6 py-4 font-semibold">Hợp đồng</th>
                <th className="px-6 py-4 font-semibold text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(c => {
                const countContracts = contracts.filter(con => con.customerId === c.id).length;
                return (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center cursor-pointer" onClick={() => handleOpenEdit(c)}>
                        <img src={c.avatarUrl || 'https://via.placeholder.com/40'} alt="" className="w-10 h-10 rounded-full mr-3 object-cover border border-gray-200" />
                        <div>
                          <p className="font-semibold text-gray-900 group-hover:text-pru-red transition-colors">{c.fullName}</p>
                          <p className="text-xs text-gray-500 flex items-center">
                            <i className="far fa-id-card mr-1"></i> {c.idCard || 'Chưa có CCCD'}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm">
                        <p className="text-gray-900"><i className="fas fa-phone-alt text-gray-400 mr-1 text-xs"></i> {c.phone}</p>
                        <p className="text-gray-500 text-xs mt-1">{c.job || 'Chưa cập nhật'}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 text-xs font-medium rounded-full ${
                        c.status === CustomerStatus.SIGNED ? 'bg-green-100 text-green-700' : 
                        c.status === CustomerStatus.ADVISING ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
                      }`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                       {countContracts > 0 ? (
                         <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-pru-red">
                           {countContracts} HĐ
                         </span>
                       ) : (
                         <span className="text-gray-400 text-xs">-</span>
                       )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-4">
                        <button onClick={() => handleOpenEdit(c)} className="text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded transition shadow-sm border border-blue-100" title="Xem chi tiết">
                          <i className="fas fa-eye"></i>
                        </button>
                        <button 
                            onClick={() => setDeleteConfirm({isOpen: true, id: c.id, name: c.fullName})} 
                            className="text-red-500 hover:bg-red-50 px-3 py-1.5 rounded transition shadow-sm border border-red-100" 
                            title="Xóa"
                        >
                          <i className="fas fa-trash"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-gray-400">
                    Không tìm thấy khách hàng nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

       {/* Edit/Add Modal */}
       {showModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-2xl w-full max-w-4xl h-[90vh] flex flex-col shadow-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                    <div className="flex items-center">
                       {isEditing && (
                         <img src={formData.avatarUrl || 'https://via.placeholder.com/150'} className="w-12 h-12 rounded-full mr-4 border-2 border-white shadow-sm object-cover" />
                       )}
                       <div>
                        <h3 className="text-xl font-bold text-gray-800">{isEditing ? formData.fullName : 'Thêm khách hàng mới'}</h3>
                        <p className="text-xs text-gray-500">{isEditing ? `ID: ${formData.id}` : 'Nhập thông tin hồ sơ'}</p>
                       </div>
                    </div>
                    <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-200">
                      <i className="fas fa-times text-lg"></i>
                    </button>
                </div>

                <div className="flex border-b border-gray-200 bg-white">
                  <TabButton id="info" label="Hồ sơ" icon="fa-user" />
                  <TabButton id="health" label="Sức khỏe" icon="fa-heartbeat" />
                  <TabButton id="contracts" label={`Hợp đồng (${customerContracts.length})`} icon="fa-file-signature" />
                  <TabButton id="history" label="Lịch sử" icon="fa-history" />
                </div>

                <div className="flex-1 overflow-y-auto p-6 bg-gray-50/50">
                  {/* ... Existing Tab Content ... */}
                  {activeTab === 'info' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in">
                       <div className="space-y-4">
                           <h4 className="font-semibold text-gray-800 border-b pb-2">Thông tin định danh</h4>
                           
                           {/* Avatar Editor Section */}
                           <div className="flex items-start gap-4 mb-4">
                                <div className="relative group cursor-pointer" onClick={() => !isUploading && fileInputRef.current?.click()}>
                                    <img 
                                        src={formData.avatarUrl || 'https://via.placeholder.com/150'} 
                                        alt="Avatar" 
                                        className={`w-20 h-20 rounded-full object-cover border-2 border-gray-200 shadow-sm bg-white transition ${isUploading ? 'opacity-50' : ''}`}
                                        onError={(e) => {e.currentTarget.src = 'https://via.placeholder.com/150'}}
                                    />
                                    {isUploading ? (
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <i className="fas fa-spinner fa-spin text-pru-red text-xl"></i>
                                        </div>
                                    ) : (
                                        <div className="absolute inset-0 bg-black/30 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                            <i className="fas fa-camera text-white"></i>
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1">
                                     <label className="block text-xs font-medium text-gray-700 mb-1">Ảnh đại diện</label>
                                     <div className="flex flex-col gap-2">
                                        {/* Hidden File Input */}
                                        <input 
                                            type="file" 
                                            ref={fileInputRef} 
                                            onChange={handleFileUpload} 
                                            accept="image/*" 
                                            className="hidden" 
                                            disabled={isUploading}
                                        />
                                        
                                        <div className="flex gap-2">
                                            <button 
                                                onClick={() => fileInputRef.current?.click()}
                                                disabled={isUploading}
                                                className="bg-blue-50 hover:bg-blue-100 text-blue-600 px-3 py-2 rounded-lg text-xs font-medium transition flex items-center justify-center flex-1 border border-blue-200 disabled:opacity-50"
                                            >
                                                <i className="fas fa-upload mr-2"></i>{isUploading ? 'Đang tải...' : 'Tải ảnh lên'}
                                            </button>
                                            <button 
                                                onClick={() => setFormData({...formData, avatarUrl: `https://picsum.photos/200/200?random=${Date.now()}`})}
                                                disabled={isUploading}
                                                className="bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-lg text-gray-600 transition text-xs font-medium flex items-center border border-gray-200 disabled:opacity-50"
                                                title="Tạo ảnh ngẫu nhiên"
                                            >
                                                <i className="fas fa-random mr-1"></i> Ngẫu nhiên
                                            </button>
                                        </div>
                                        
                                        {/* URL fallback */}
                                        <input 
                                            className="w-full border border-gray-300 p-2 rounded-lg focus:ring-1 focus:ring-red-200 outline-none bg-white text-xs text-gray-500" 
                                            value={formData.avatarUrl || ''} 
                                            onChange={e => setFormData({...formData, avatarUrl: e.target.value})} 
                                            placeholder="Hoặc dán link ảnh..." 
                                            disabled={isUploading}
                                        />
                                     </div>
                                </div>
                           </div>

                           <div>
                             <label className="block text-xs font-medium text-gray-700 mb-1">Họ và tên <span className="text-red-500">*</span></label>
                             <input className="w-full border border-gray-300 p-2.5 rounded-lg focus:ring-2 focus:ring-red-200 outline-none bg-white" 
                               value={formData.fullName} onChange={e => setFormData({...formData, fullName: e.target.value})} placeholder="Nguyễn Văn A" />
                           </div>
                           <div className="grid grid-cols-2 gap-4">
                             <div>
                               <label className="block text-xs font-medium text-gray-700 mb-1">Ngày sinh</label>
                               <input type="date" className="w-full border border-gray-300 p-2.5 rounded-lg focus:ring-2 focus:ring-red-200 outline-none bg-white" 
                                 value={formData.dob} onChange={e => setFormData({...formData, dob: e.target.value})} />
                             </div>
                             <div>
                               <label className="block text-xs font-medium text-gray-700 mb-1">CCCD / CMND</label>
                               <input className="w-full border border-gray-300 p-2.5 rounded-lg focus:ring-2 focus:ring-red-200 outline-none bg-white" 
                                 value={formData.idCard} onChange={e => setFormData({...formData, idCard: e.target.value})} placeholder="12 số..." />
                             </div>
                           </div>
                           <div>
                             <label className="block text-xs font-medium text-gray-700 mb-1">Trạng thái khách hàng</label>
                             <select className="w-full border border-gray-300 p-2.5 rounded-lg focus:ring-2 focus:ring-red-200 outline-none bg-white" 
                               value={formData.status} onChange={(e: any) => setFormData({...formData, status: e.target.value})}>
                                {(Object.values(CustomerStatus) as string[]).map(s => <option key={s} value={s}>{s}</option>)}
                             </select>
                           </div>
                       </div>
                       <div className="space-y-4">
                           <h4 className="font-semibold text-gray-800 border-b pb-2">Liên hệ & Công việc</h4>
                           <div>
                             <label className="block text-xs font-medium text-gray-700 mb-1">Số điện thoại <span className="text-red-500">*</span></label>
                             <input className="w-full border border-gray-300 p-2.5 rounded-lg focus:ring-2 focus:ring-red-200 outline-none bg-white" 
                               value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} placeholder="090..." />
                           </div>
                           <div>
                             <label className="block text-xs font-medium text-gray-700 mb-1">Nghề nghiệp</label>
                             <input className="w-full border border-gray-300 p-2.5 rounded-lg focus:ring-2 focus:ring-red-200 outline-none bg-white" 
                               value={formData.job} onChange={e => setFormData({...formData, job: e.target.value})} placeholder="VD: Kế toán" />
                           </div>
                           <div>
                             <label className="block text-xs font-medium text-gray-700 mb-1">Địa chỉ công ty / Liên hệ</label>
                             <input className="w-full border border-gray-300 p-2.5 rounded-lg focus:ring-2 focus:ring-red-200 outline-none bg-white" 
                               value={formData.companyAddress} onChange={e => setFormData({...formData, companyAddress: e.target.value})} placeholder="Số nhà, đường, quận, thành phố..." />
                           </div>
                       </div>
                    </div>
                  )}
                  {/* Reuse existing rendering logic for other tabs... */}
                   {activeTab === 'health' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in">
                        <div className="space-y-4">
                           <h4 className="font-semibold text-gray-800 border-b pb-2">Chỉ số cơ thể</h4>
                           <div className="grid grid-cols-2 gap-4">
                              <div>
                                 <label className="block text-xs font-medium text-gray-700 mb-1">Chiều cao (cm)</label>
                                 <input type="number" className="w-full border border-gray-300 p-2.5 rounded-lg outline-none bg-white" 
                                   value={formData.health.height || ''} onChange={e => setFormData({...formData, health: {...formData.health, height: Number(e.target.value)}})} />
                              </div>
                              <div>
                                 <label className="block text-xs font-medium text-gray-700 mb-1">Cân nặng (kg)</label>
                                 <input type="number" className="w-full border border-gray-300 p-2.5 rounded-lg outline-none bg-white" 
                                   value={formData.health.weight || ''} onChange={e => setFormData({...formData, health: {...formData.health, weight: Number(e.target.value)}})} />
                              </div>
                           </div>
                        </div>
                        <div className="space-y-4">
                           <h4 className="font-semibold text-gray-800 border-b pb-2">Hồ sơ y tế</h4>
                           <div>
                             <label className="block text-xs font-medium text-gray-700 mb-1">Tiền sử bệnh & Phẫu thuật</label>
                             <textarea rows={3} className="w-full border border-gray-300 p-2.5 rounded-lg outline-none bg-white" 
                               value={formData.health.medicalHistory} onChange={e => setFormData({...formData, health: {...formData.health, medicalHistory: e.target.value}})} 
                               placeholder="VD: Đã mổ ruột thừa 2015, Huyết áp cao..." />
                          </div>
                          <div>
                             <label className="block text-xs font-medium text-gray-700 mb-1">Thói quen sinh hoạt</label>
                             <textarea rows={3} className="w-full border border-gray-300 p-2.5 rounded-lg outline-none bg-white" 
                               value={formData.health.habits} onChange={e => setFormData({...formData, health: {...formData.health, habits: e.target.value}})} 
                               placeholder="VD: Hút thuốc 1 gói/ngày, Chạy bộ..." />
                          </div>
                        </div>
                    </div>
                  )}

                  {activeTab === 'contracts' && (
                    <div className="animate-fade-in space-y-6">
                      {customerContracts.length > 0 ? (
                        <div className="space-y-6">
                          {customerContracts.map(contract => {
                            // Group riders by insured name
                            const ridersByInsured = contract.riders.reduce((acc, rider) => {
                                (acc[rider.insuredName] = acc[rider.insuredName] || []).push(rider);
                                return acc;
                            }, {} as Record<string, typeof contract.riders>);

                            return (
                                <div key={contract.id} className="bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition overflow-hidden">
                                    {/* Contract Header */}
                                    <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                        <div className="flex items-center gap-4">
                                            <div className="bg-white p-2 rounded-lg border border-gray-200 shadow-sm">
                                                <i className="fas fa-file-contract text-pru-red text-xl"></i>
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono font-bold text-gray-800 text-lg">{contract.contractNumber}</span>
                                                    <span className={`px-2 py-0.5 text-xs rounded-full font-bold ${
                                                        contract.status === ContractStatus.ACTIVE ? 'bg-green-100 text-green-700' : 
                                                        contract.status === ContractStatus.PENDING ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'
                                                    }`}>
                                                        {contract.status}
                                                    </span>
                                                </div>
                                                <div className="text-xs text-gray-500 mt-1 flex gap-3">
                                                    <span><i className="far fa-calendar-check mr-1"></i>Hiệu lực: {formatDateVN(contract.effectiveDate)}</span>
                                                    <span className={new Date(contract.nextPaymentDate) < new Date() ? 'text-red-500 font-bold' : ''}>
                                                        <i className="far fa-clock mr-1"></i>Đáo hạn: {formatDateVN(contract.nextPaymentDate)}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end">
                                            <span className="text-xs text-gray-500 uppercase font-medium">Tổng phí năm</span>
                                            <span className="text-xl font-bold text-pru-red">{contract.totalFee.toLocaleString('vi-VN')} đ</span>
                                        </div>
                                    </div>

                                    <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
                                        {/* Main Product Column */}
                                        <div className="space-y-4">
                                            <h5 className="font-bold text-gray-800 uppercase text-xs tracking-wider border-b border-gray-100 pb-2 flex items-center">
                                                <i className="fas fa-shield-alt text-pru-red mr-2"></i>Sản phẩm chính
                                            </h5>
                                            <div className="bg-red-50 rounded-xl p-4 border border-red-100 relative overflow-hidden group">
                                                <div className="absolute right-0 top-0 w-24 h-24 bg-red-100 rounded-full -mr-12 -mt-12 opacity-50 group-hover:scale-110 transition-transform"></div>
                                                <div className="relative z-10">
                                                    <h4 className="font-bold text-gray-900 text-lg mb-1">{contract.mainProduct.productName}</h4>
                                                    <div className="flex flex-col md:flex-row justify-between items-start md:items-end mt-3 gap-2">
                                                        <div className="text-sm text-gray-700">
                                                            <div className="flex items-center mb-1">
                                                                <i className="fas fa-user-circle text-gray-400 mr-2"></i>
                                                                <span className="font-medium">{contract.mainProduct.insuredName}</span>
                                                            </div>
                                                            <div className="text-xs text-gray-500 italic">Người được bảo hiểm chính</div>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="font-mono font-bold text-pru-red bg-white/60 px-2 py-1 rounded">
                                                                Phí: {contract.mainProduct.fee.toLocaleString('vi-VN')} đ
                                                            </div>
                                                            {contract.mainProduct.sumAssured && (
                                                                <div className="text-xs font-semibold text-blue-600 mt-1">
                                                                    STBH: {contract.mainProduct.sumAssured.toLocaleString('vi-VN')} đ
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Riders Column */}
                                        <div className="space-y-4">
                                            <h5 className="font-bold text-gray-800 uppercase text-xs tracking-wider border-b border-gray-100 pb-2 flex items-center justify-between">
                                                <span><i className="fas fa-plus-circle text-blue-500 mr-2"></i>Sản phẩm bổ trợ ({contract.riders.length})</span>
                                            </h5>
                                            
                                            {contract.riders.length > 0 ? (
                                                <div className="space-y-4">
                                                    {Object.entries(ridersByInsured).map(([name, products], idx) => (
                                                        <div key={idx} className="relative pl-4 border-l-2 border-gray-200">
                                                            <div className="absolute -left-[5px] top-0 w-2.5 h-2.5 rounded-full bg-gray-300 border-2 border-white"></div>
                                                            <h6 className="text-sm font-bold text-gray-800 mb-2">{name}</h6>
                                                            <div className="space-y-2">
                                                                {products.map((p, pIdx) => (
                                                                    <div key={pIdx} className="flex justify-between items-start text-sm p-2 rounded hover:bg-gray-50 transition border border-transparent hover:border-gray-100">
                                                                        <div className="flex-1 pr-2">
                                                                            <span className="text-gray-600 block">{p.productName}</span>
                                                                            {p.sumAssured > 0 && (
                                                                                <span className="text-xs text-blue-500 font-medium">STBH: {p.sumAssured.toLocaleString('vi-VN')} đ</span>
                                                                            )}
                                                                        </div>
                                                                        <span className="font-medium text-gray-800 whitespace-nowrap">{p.fee.toLocaleString('vi-VN')} đ</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="text-center py-6 text-gray-400 italic bg-gray-50 rounded-lg border border-dashed border-gray-200">
                                                    Không có sản phẩm bổ trợ
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-300 flex flex-col items-center">
                           <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-3 text-gray-400">
                                <i className="fas fa-folder-open text-2xl"></i>
                           </div>
                           <h3 className="text-gray-800 font-medium">Chưa có hợp đồng nào</h3>
                           <p className="text-sm text-gray-500 mt-1">Khách hàng này chưa tham gia hợp đồng bảo hiểm nào.</p>
                        </div>
                      )}
                    </div>
                  )}
                  {/* History Tab remains unchanged */}
                  {activeTab === 'history' && (
                    <div className="animate-fade-in space-y-4">
                      {/* ... history render ... */}
                      <div className="flex gap-2 mb-4">
                          <input type="text" className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200" 
                              placeholder="Ghi chú tương tác mới..." value={newInteraction} onChange={e => setNewInteraction(e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && addInteraction()} />
                          <button onClick={addInteraction} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">Thêm</button>
                      </div>
                      <div className="space-y-3">
                          {formData.interactionHistory.length > 0 ? (
                              formData.interactionHistory.map((h, i) => (
                                  <div key={i} className="flex gap-3 text-sm">
                                      <div className="flex flex-col items-center">
                                          <div className="w-2 h-2 bg-gray-400 rounded-full mt-1.5"></div>
                                          <div className="w-0.5 flex-1 bg-gray-200 my-1"></div>
                                      </div>
                                      <div className="bg-white p-3 rounded-lg border border-gray-100 shadow-sm flex-1 text-gray-700">
                                          {h}
                                      </div>
                                  </div>
                              ))
                          ) : (
                              <p className="text-gray-400 text-center text-sm italic">Chưa có lịch sử tương tác.</p>
                          )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 bg-gray-50">
                    <button onClick={() => setShowModal(false)} className="px-5 py-2.5 text-gray-600 hover:bg-gray-200 rounded-lg font-medium transition">
                      Đóng
                    </button>
                    <button onClick={handleSubmit} className="px-5 py-2.5 bg-pru-red text-white rounded-lg font-medium shadow-md hover:bg-red-700 transition flex items-center">
                      <i className="fas fa-save mr-2"></i>
                      {isEditing ? 'Lưu thay đổi' : 'Tạo khách hàng'}
                    </button>
                </div>
            </div>
        </div>
       )}

       {/* Confirm Modal Render */}
       <ConfirmModal 
          isOpen={deleteConfirm.isOpen}
          title="Xóa khách hàng?"
          message={
            <span>Bạn có chắc chắn muốn xóa khách hàng <b>{deleteConfirm.name}</b>?<br/>Hành động này sẽ xóa tất cả hợp đồng và lịch sử liên quan và không thể hoàn tác.</span>
          }
          onConfirm={() => onDelete(deleteConfirm.id)}
          onClose={() => setDeleteConfirm({...deleteConfirm, isOpen: false})}
       />
    </div>
  );
};

// --- CONTRACTS PAGE (UPDATED CRUD) ---

const ContractsPage: React.FC<{ 
    contracts: Contract[], 
    customers: Customer[], 
    products: Product[],
    onAdd: (c: Contract) => void,
    onUpdate: (c: Contract) => void,
    onDelete: (id: string) => void
}> = ({ contracts, customers, products, onAdd, onUpdate, onDelete }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [filterDue, setFilterDue] = useState(false); // Filter for upcoming payments
    const [showModal, setShowModal] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    
    // Delete Modal State
    const [deleteConfirm, setDeleteConfirm] = useState<{isOpen: boolean, id: string, number: string}>({
        isOpen: false, id: '', number: ''
    });

    const initialFormState: Contract = {
        id: '',
        contractNumber: '',
        customerId: '',
        effectiveDate: new Date().toISOString().split('T')[0],
        nextPaymentDate: '',
        paymentFrequency: PaymentFrequency.ANNUAL,
        status: ContractStatus.PENDING,
        mainProduct: {
            productId: '',
            productName: '',
            insuredName: '',
            fee: 0,
            sumAssured: 0
        },
        riders: [],
        totalFee: 0
    };
    const [formData, setFormData] = useState<Contract>(initialFormState);

    // Calculate Total Fee effect
    useEffect(() => {
        const ridersFee = formData.riders.reduce((sum, r) => sum + r.fee, 0);
        const total = formData.mainProduct.fee + ridersFee;
        setFormData(prev => ({ ...prev, totalFee: total }));
    }, [formData.mainProduct.fee, formData.riders]);

    // Update Next Payment Date automatically when effective date or frequency changes (FOR NEW/EDIT FORM)
    useEffect(() => {
         // Only auto-calculate if it's a new contract or we are changing the effective date specifically
         // In a real app, we might want to be more careful not to overwrite a confirmed payment date
         if (formData.effectiveDate && !isEditing) {
             const parts = formData.effectiveDate.split('-');
             if(parts.length === 3) {
                 const year = parseInt(parts[0]);
                 const month = parseInt(parts[1]) - 1;
                 const day = parseInt(parts[2]);
                 
                 const dateObj = new Date(year, month, day);
                 
                 let monthsToAdd = 12;
                 switch(formData.paymentFrequency) {
                     case PaymentFrequency.SEMI_ANNUAL: monthsToAdd = 6; break;
                     case PaymentFrequency.QUARTERLY: monthsToAdd = 3; break;
                     case PaymentFrequency.MONTHLY: monthsToAdd = 1; break;
                     default: monthsToAdd = 12;
                 }
                 
                 dateObj.setMonth(dateObj.getMonth() + monthsToAdd);
                 
                 const newY = dateObj.getFullYear();
                 const newM = (dateObj.getMonth() + 1).toString().padStart(2, '0');
                 const newD = dateObj.getDate().toString().padStart(2, '0');
                 setFormData(prev => ({...prev, nextPaymentDate: `${newY}-${newM}-${newD}`}));
             }
         }
    }, [formData.effectiveDate, formData.paymentFrequency, isEditing]);

    // Filter Logic
    const filteredContracts = contracts.filter(c => {
        const owner = customers.find(cus => cus.id === c.customerId);
        const ownerName = owner ? owner.fullName.toLowerCase() : '';
        const matchesSearch = c.contractNumber.includes(searchTerm) || ownerName.includes(searchTerm.toLowerCase());
        
        let matchesDue = true;
        if (filterDue) {
            const today = new Date();
            const dueDate = new Date(c.nextPaymentDate);
            const diffTime = dueDate.getTime() - today.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            // Show past due and upcoming 30 days
            matchesDue = diffDays >= -365 && diffDays <= 30; 
        }

        return matchesSearch && matchesDue;
    });

    const handleOpenAdd = () => {
        setFormData({ ...initialFormState }); // Firestore generates ID, so no need to set ID here manually, or we can use generic one
        setIsEditing(false);
        setShowModal(true);
    };

    const handleOpenEdit = (contract: Contract) => {
        setFormData({ ...contract });
        setIsEditing(true);
        setShowModal(true);
    };

    const handleSubmit = () => {
        if (!formData.contractNumber || !formData.customerId || !formData.mainProduct.productId) {
            alert("Vui lòng nhập Số HĐ, Bên mua bảo hiểm và Sản phẩm chính!");
            return;
        }
        if (isEditing) onUpdate(formData);
        else onAdd(formData);
        setShowModal(false);
    };

    const addRider = () => {
        setFormData(prev => ({
            ...prev,
            riders: [...prev.riders, { productId: '', productName: '', insuredName: '', fee: 0, sumAssured: 0 }]
        }));
    };

    const removeRider = (index: number) => {
        const newRiders = [...formData.riders];
        newRiders.splice(index, 1);
        setFormData(prev => ({ ...prev, riders: newRiders }));
    };

    const updateRider = (index: number, field: keyof ContractProduct, value: any) => {
        const newRiders = [...formData.riders];
        newRiders[index] = { ...newRiders[index], [field]: value };
        
        // Auto update product name if ID changes
        if (field === 'productId') {
            const prod = products.find(p => p.id === value);
            if (prod) newRiders[index].productName = prod.name;
        }
        
        setFormData(prev => ({ ...prev, riders: newRiders }));
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-gray-800">Hợp đồng bảo hiểm</h1>
                  <p className="text-sm text-gray-500">Quản lý chi tiết sản phẩm, người được bảo hiểm và phí.</p>
                </div>
                <button onClick={handleOpenAdd} className="bg-pru-red text-white px-5 py-2.5 rounded-lg hover:bg-red-700 transition shadow-sm flex items-center justify-center">
                  <i className="fas fa-file-signature mr-2"></i>Tạo hợp đồng
                </button>
            </div>

            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col md:flex-row gap-4">
                 <div className="flex-1 relative">
                    <i className="fas fa-search absolute left-3 top-3.5 text-gray-400"></i>
                    <input 
                      type="text" 
                      className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-200 transition"
                      placeholder="Tìm số hợp đồng, tên khách hàng..."
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                    />
                 </div>
                 <button 
                   onClick={() => setFilterDue(!filterDue)}
                   className={`px-4 py-2 rounded-lg border font-medium transition flex items-center ${
                       filterDue ? 'bg-yellow-50 border-yellow-300 text-yellow-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                   }`}
                 >
                     <i className="fas fa-bell mr-2"></i>Sắp đến hạn đóng phí
                 </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {filteredContracts.map(c => {
                   const owner = customers.find(cus => cus.id === c.customerId);
                   // Check if overdue
                   const today = new Date();
                   const dueDate = new Date(c.nextPaymentDate);
                   const isOverdue = dueDate < today;
                   
                   return (
                    <div key={c.id} className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition group flex flex-col justify-between">
                        <div>
                            <div className="flex justify-between items-start mb-4">
                                <span className="bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded font-mono font-semibold tracking-wide">
                                  {c.contractNumber}
                                </span>
                                <div className="flex gap-3">
                                     <button onClick={() => handleOpenEdit(c)} className="text-blue-500 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 p-1.5 rounded transition"><i className="fas fa-edit"></i></button>
                                     <button 
                                        onClick={() => setDeleteConfirm({isOpen: true, id: c.id, number: c.contractNumber})} 
                                        className="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 p-1.5 rounded transition"
                                     >
                                        <i className="fas fa-trash"></i>
                                     </button>
                                </div>
                            </div>
                            
                            <div className="flex items-center mb-4 pb-4 border-b border-gray-50">
                               <img src={owner?.avatarUrl || 'https://via.placeholder.com/40'} className="w-10 h-10 rounded-full mr-3 border border-gray-100" />
                               <div>
                                 <h3 className="font-bold text-gray-800 text-base">{owner?.fullName || 'Unknown Customer'}</h3>
                                 <p className="text-xs text-gray-500">Bên mua bảo hiểm</p>
                                </div>
                            </div>

                            <div className="space-y-3 mb-4">
                                <div className="bg-red-50/50 p-2.5 rounded-lg border border-red-100">
                                     <div className="flex justify-between items-center mb-1">
                                        <span className="text-xs font-bold text-pru-red uppercase">Sản phẩm chính</span>
                                        <div className="text-right">
                                            <span className="text-xs font-medium text-gray-500 block">{c.mainProduct.fee.toLocaleString('vi-VN')} đ</span>
                                            {c.mainProduct.sumAssured > 0 && (
                                                <span className="text-[10px] text-blue-600 font-semibold block">STBH: {c.mainProduct.sumAssured.toLocaleString('vi-VN')}</span>
                                            )}
                                        </div>
                                     </div>
                                     <p className="text-sm font-semibold text-gray-800 line-clamp-1">{c.mainProduct.productName}</p>
                                     <p className="text-xs text-gray-500 mt-0.5"><i className="fas fa-user-shield mr-1"></i>{c.mainProduct.insuredName}</p>
                                </div>
                                {c.riders.length > 0 && (
                                    <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-200">
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="text-xs font-bold text-gray-600 uppercase">Sản phẩm bổ trợ ({c.riders.length})</span>
                                        </div>
                                        <div className="space-y-2">
                                            {c.riders.slice(0, 2).map((r, i) => (
                                                <div key={i} className="text-xs">
                                                    <div className="flex justify-between text-gray-800">
                                                        <span className="truncate flex-1 pr-2">• {r.productName}</span>
                                                        <span>{r.fee.toLocaleString('vi-VN')}</span>
                                                    </div>
                                                    <div className="text-gray-500 pl-2 text-[10px] italic">
                                                        cho {r.insuredName}
                                                    </div>
                                                </div>
                                            ))}
                                            {c.riders.length > 2 && <p className="text-[10px] text-center text-gray-400">...và {c.riders.length - 2} sản phẩm khác</p>}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                        
                        <div className="border-t border-gray-100 pt-3">
                            <div className="flex justify-between mb-2 text-xs">
                                <span className="text-gray-500">Trạng thái:</span>
                                <span className={`font-bold ${
                                    c.status === ContractStatus.ACTIVE ? 'text-green-600' : 
                                    c.status === ContractStatus.LAPSED ? 'text-red-600' : 'text-yellow-600'
                                }`}>{c.status}</span>
                            </div>
                            <div className="flex justify-between mb-2 text-xs items-center">
                                <span className="text-gray-500">Hạn đóng phí:</span>
                                <div className="text-right">
                                    <span className={`${isOverdue ? 'text-red-600 font-bold' : 'text-gray-800'}`}>{formatDateVN(c.nextPaymentDate)}</span>
                                    {isOverdue && c.status !== ContractStatus.LAPSED && <span className="block text-[9px] text-orange-500">Quá hạn</span>}
                                </div>
                            </div>
                            <div className="flex justify-between items-center mt-3 pt-2 border-t border-dashed border-gray-200">
                                <div className="flex flex-col">
                                    <span className="text-xs font-semibold text-gray-500">Định kỳ: {c.paymentFrequency}</span>
                                    <span className="text-base font-bold text-pru-red">{c.totalFee.toLocaleString('vi-VN')} <small>đ</small></span>
                                </div>
                            </div>
                        </div>
                    </div>
                   )
                })}
            </div>

            {/* Contract Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl w-full max-w-5xl max-h-[95vh] flex flex-col shadow-2xl">
                        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-2xl">
                            <h3 className="text-xl font-bold text-gray-800">{isEditing ? 'Cập nhật Hợp đồng' : 'Tạo hợp đồng mới'}</h3>
                            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><i className="fas fa-times text-lg"></i></button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-8">
                            
                            {/* Section 1: General Info */}
                            <section>
                                <h4 className="text-sm font-bold text-gray-800 uppercase tracking-wider mb-4 border-b pb-2">1. Thông tin chung</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Số hợp đồng <span className="text-red-500">*</span></label>
                                        <input type="text" className="w-full border border-gray-300 p-2.5 rounded-lg focus:ring-2 focus:ring-red-200 outline-none"
                                            value={formData.contractNumber} onChange={e => setFormData({...formData, contractNumber: e.target.value})} placeholder="7xxxxxxx" />
                                    </div>
                                    <div>
                                        <SearchableCustomerSelect 
                                            label="Bên mua bảo hiểm (Chủ HĐ) *"
                                            customers={customers}
                                            value={customers.find(c => c.id === formData.customerId)?.fullName || ''}
                                            onChange={(cus) => {
                                                setFormData(prev => ({
                                                    ...prev, 
                                                    customerId: cus.id,
                                                    // Auto set insured name to owner name if empty
                                                    mainProduct: { ...prev.mainProduct, insuredName: prev.mainProduct.insuredName || cus.fullName}
                                                }));
                                            }}
                                            placeholder="Chọn chủ hợp đồng"
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-medium text-gray-700 mb-1">Ngày hiệu lực</label>
                                            <input type="date" className="w-full border border-gray-300 p-2.5 rounded-lg focus:ring-2 focus:ring-red-200 outline-none"
                                                value={formData.effectiveDate} onChange={e => setFormData({...formData, effectiveDate: e.target.value})} />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-700 mb-1">Định kỳ đóng phí</label>
                                            <select className="w-full border border-gray-300 p-2.5 rounded-lg focus:ring-2 focus:ring-red-200 outline-none"
                                                value={formData.paymentFrequency} onChange={(e: any) => setFormData({...formData, paymentFrequency: e.target.value})}>
                                                {(Object.values(PaymentFrequency) as string[]).map(s => <option key={s} value={s}>{s}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Trạng thái</label>
                                        <select className="w-full border border-gray-300 p-2.5 rounded-lg focus:ring-2 focus:ring-red-200 outline-none"
                                            value={formData.status} onChange={(e: any) => setFormData({...formData, status: e.target.value})}>
                                            {(Object.values(ContractStatus) as string[]).map(s => <option key={s} value={s}>{s}</option>)}
                                        </select>
                                    </div>
                                    {/* Manual Date Override for existing contracts */}
                                    {isEditing && (
                                        <div>
                                            <label className="block text-xs font-medium text-gray-700 mb-1">Hạn đóng phí tiếp theo (Điều chỉnh thủ công)</label>
                                            <input type="date" className="w-full border border-gray-300 p-2.5 rounded-lg focus:ring-2 focus:ring-red-200 outline-none bg-yellow-50"
                                                value={formData.nextPaymentDate} onChange={e => setFormData({...formData, nextPaymentDate: e.target.value})} />
                                        </div>
                                    )}
                                </div>
                            </section>

                            {/* Section 2: Main Product */}
                            <section>
                                <h4 className="text-sm font-bold text-gray-800 uppercase tracking-wider mb-4 border-b pb-2 flex justify-between">
                                    2. Sản phẩm chính
                                    <span className="text-pru-red font-mono">{formData.mainProduct.fee.toLocaleString()} đ</span>
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 bg-red-50 p-4 rounded-xl border border-red-100">
                                    <div className="md:col-span-4">
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Tên sản phẩm chính <span className="text-red-500">*</span></label>
                                        <select className="w-full border border-gray-300 p-2.5 rounded-lg focus:ring-2 focus:ring-red-200 outline-none"
                                            value={formData.mainProduct.productId} 
                                            onChange={e => {
                                                const prod = products.find(p => p.id === e.target.value);
                                                setFormData({
                                                    ...formData, 
                                                    mainProduct: { 
                                                        ...formData.mainProduct, 
                                                        productId: e.target.value, 
                                                        productName: prod ? prod.name : '' 
                                                    }
                                                });
                                            }}>
                                            <option value="">-- Chọn sản phẩm chính --</option>
                                            {products.filter(p => p.type === ProductType.MAIN).map(p => (
                                                <option key={p.id} value={p.id}>{p.code} - {p.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="md:col-span-3">
                                        <SearchableCustomerSelect 
                                            label="Người được bảo hiểm"
                                            customers={customers}
                                            value={formData.mainProduct.insuredName}
                                            onChange={(cus) => setFormData({...formData, mainProduct: {...formData.mainProduct, insuredName: cus.fullName}})}
                                            placeholder="Chọn NĐBH"
                                        />
                                    </div>
                                    <div className="md:col-span-3">
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Số tiền bảo hiểm (Mệnh giá)</label>
                                        <CurrencyInput 
                                            value={formData.mainProduct.sumAssured}
                                            onChange={(val) => setFormData({...formData, mainProduct: {...formData.mainProduct, sumAssured: val}})}
                                            className="w-full border border-gray-300 p-2.5 rounded-lg focus:ring-2 focus:ring-blue-200 outline-none text-gray-800"
                                            placeholder="0"
                                        />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Phí bảo hiểm</label>
                                        <CurrencyInput 
                                            value={formData.mainProduct.fee}
                                            onChange={(val) => setFormData({...formData, mainProduct: {...formData.mainProduct, fee: val}})}
                                            className="w-full border border-gray-300 p-2.5 rounded-lg focus:ring-2 focus:ring-red-200 outline-none font-semibold text-pru-red"
                                            placeholder="0"
                                        />
                                    </div>
                                </div>
                            </section>

                            {/* Section 3: Riders */}
                            <section>
                                <h4 className="text-sm font-bold text-gray-800 uppercase tracking-wider mb-4 border-b pb-2 flex justify-between items-center">
                                    <div>3. Sản phẩm bổ trợ <span className="text-gray-400 text-xs normal-case ml-2">(Bảo hiểm sức khỏe, tai nạn, bệnh lý...)</span></div>
                                    <button onClick={addRider} className="text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg text-gray-700 font-medium transition">
                                        <i className="fas fa-plus mr-1"></i>Thêm sản phẩm
                                    </button>
                                </h4>
                                <div className="space-y-3">
                                    {(formData.riders as ContractProduct[]).map((rider, index) => (
                                        <div key={index} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end bg-gray-50 p-3 rounded-lg border border-gray-200 relative group">
                                            <div className="md:col-span-4">
                                                <label className="block text-[10px] font-medium text-gray-500 mb-1">Sản phẩm bổ trợ</label>
                                                <select className="w-full border border-gray-300 p-2 rounded focus:ring-1 focus:ring-red-200 outline-none text-sm"
                                                    value={rider.productId} 
                                                    onChange={e => updateRider(index, 'productId', e.target.value)}>
                                                    <option value="">-- Chọn sản phẩm --</option>
                                                    {(products as Product[]).filter(p => p.type === ProductType.RIDER).map(p => (
                                                        <option key={p.id} value={p.id}>{p.code} - {p.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="md:col-span-3">
                                                <SearchableCustomerSelect 
                                                    label="Người được BH bổ sung"
                                                    customers={customers}
                                                    value={rider.insuredName}
                                                    onChange={(cus) => updateRider(index, 'insuredName', cus.fullName)}
                                                    placeholder="Chọn NĐBH"
                                                />
                                            </div>
                                            <div className="md:col-span-3">
                                                <label className="block text-[10px] font-medium text-gray-500 mb-1">Số tiền BH</label>
                                                <CurrencyInput 
                                                    value={rider.sumAssured}
                                                    onChange={(val) => updateRider(index, 'sumAssured', val)}
                                                    className="w-full border border-gray-300 p-2 rounded focus:ring-1 focus:ring-blue-200 outline-none text-sm"
                                                    placeholder="0"
                                                />
                                            </div>
                                            <div className="md:col-span-2">
                                                <label className="block text-[10px] font-medium text-gray-500 mb-1">Phí</label>
                                                <CurrencyInput 
                                                    value={rider.fee}
                                                    onChange={(val) => updateRider(index, 'fee', val)}
                                                    className="w-full border border-gray-300 p-2 rounded focus:ring-1 focus:ring-red-200 outline-none text-sm font-medium"
                                                    placeholder="0"
                                                />
                                            </div>
                                            <div className="absolute top-1 right-1">
                                                <button onClick={() => removeRider(index)} className="text-gray-300 hover:text-red-500 p-1"><i className="fas fa-times"></i></button>
                                            </div>
                                        </div>
                                    ))}
                                    {formData.riders.length === 0 && <p className="text-center text-gray-400 text-sm italic py-4">Chưa có sản phẩm bổ trợ nào.</p>}
                                </div>
                            </section>

                        </div>

                        {/* Footer with Total */}
                        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl flex justify-between items-center">
                            <div className="flex flex-col">
                                <span className="text-xs text-gray-500 font-medium uppercase">Tổng phí đóng hàng năm</span>
                                <span className="text-2xl font-bold text-pru-red">{formData.totalFee.toLocaleString('vi-VN')} đ</span>
                            </div>
                            <div className="flex gap-3">
                                <button onClick={() => setShowModal(false)} className="px-5 py-2.5 text-gray-600 hover:bg-gray-200 rounded-lg font-medium transition">
                                    Hủy
                                </button>
                                <button onClick={handleSubmit} className="px-5 py-2.5 bg-pru-red text-white rounded-lg font-medium shadow-md hover:bg-red-700 transition flex items-center">
                                    <i className="fas fa-save mr-2"></i>
                                    {isEditing ? 'Lưu hợp đồng' : 'Tạo mới'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            
            {/* Confirm Modal Render */}
            <ConfirmModal 
                isOpen={deleteConfirm.isOpen}
                title="Xóa hợp đồng?"
                message={<span>Bạn có chắc muốn xóa hợp đồng số <b>{deleteConfirm.number}</b>?<br/>Dữ liệu này không thể khôi phục.</span>}
                onConfirm={() => onDelete(deleteConfirm.id)}
                onClose={() => setDeleteConfirm({...deleteConfirm, isOpen: false})}
            />
        </div>
    );
};

// --- PRODUCTS PAGE ---
const ProductsPage: React.FC<{ 
  products: Product[], 
  onAdd: (p: Product) => void,
  onUpdate: (p: Product) => void,
  onDelete: (id: string) => void 
}> = ({ products, onAdd, onUpdate, onDelete }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  
  // Delete Modal State
  const [deleteConfirm, setDeleteConfirm] = useState<{isOpen: boolean, id: string, name: string}>({
      isOpen: false, id: '', name: ''
  });

  const initialForm: Product = { id: '', name: '', code: '', type: ProductType.MAIN, description: '', rulesAndTerms: '' };
  const [formData, setFormData] = useState<Product>(initialForm);

  const filtered = products.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.code.toLowerCase().includes(searchTerm.toLowerCase()));

  const handleSave = () => {
     if (!formData.name || !formData.code) return alert("Cần nhập tên và mã sản phẩm");
     if (isEditing) onUpdate(formData); else onAdd({...formData});
     setShowModal(false);
  }

  return (
    <div className="space-y-6">
       <div className="flex justify-between items-center">
        <div><h1 className="text-2xl font-bold text-gray-800">Sản phẩm & Kiến thức</h1><p className="text-sm text-gray-500">Quản lý danh mục sản phẩm và dữ liệu cho AI</p></div>
        <button onClick={() => {setFormData(initialForm); setIsEditing(false); setShowModal(true)}} className="bg-pru-red text-white px-4 py-2 rounded-lg hover:bg-red-700 transition"><i className="fas fa-plus mr-2"></i>Thêm sản phẩm</button>
      </div>
      
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
         <div className="relative">
            <i className="fas fa-search absolute left-3 top-3 text-gray-400"></i>
            <input type="text" className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-200" placeholder="Tìm sản phẩm..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
         </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filtered.map(p => (
              <div key={p.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition">
                  <div className="flex justify-between items-start mb-3">
                      <div>
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded ${
                            p.type === ProductType.MAIN ? 'bg-red-100 text-pru-red' : 
                            p.type === ProductType.RIDER ? 'bg-blue-100 text-blue-600' :
                            'bg-purple-100 text-purple-700'
                          }`}>{p.type}</span>
                          <h3 className="text-lg font-bold text-gray-800 mt-2">{p.name}</h3>
                          <p className="text-xs text-gray-500 font-mono">{p.code}</p>
                      </div>
                      <div className="flex space-x-4">
                          <button onClick={() => {setFormData(p); setIsEditing(true); setShowModal(true)}} className="text-blue-500 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 p-1.5 rounded transition"><i className="fas fa-edit"></i></button>
                          <button 
                            onClick={() => setDeleteConfirm({isOpen: true, id: p.id, name: p.name})} 
                            className="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 p-1.5 rounded transition"
                          >
                            <i className="fas fa-trash"></i>
                          </button>
                      </div>
                  </div>
                  <p className="text-sm text-gray-600 mb-4 line-clamp-2">{p.description}</p>
                  <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                      <p className="text-xs font-bold text-gray-500 mb-1 uppercase">Kiến thức AI / Điều khoản</p>
                      <p className="text-xs text-gray-700 line-clamp-3 italic">"{p.rulesAndTerms}"</p>
                  </div>
              </div>
          ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
             <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 shadow-2xl">
                 <h3 className="text-xl font-bold mb-4">{isEditing ? 'Cập nhật sản phẩm' : 'Thêm sản phẩm mới'}</h3>
                 <div className="space-y-4">
                     <div><label className="text-sm font-medium">Tên sản phẩm / Nghiệp vụ</label><input className="w-full border p-2 rounded" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} /></div>
                     <div className="grid grid-cols-2 gap-4">
                         <div><label className="text-sm font-medium">Mã</label><input className="w-full border p-2 rounded" value={formData.code} onChange={e => setFormData({...formData, code: e.target.value})} /></div>
                         <div><label className="text-sm font-medium">Loại</label><select className="w-full border p-2 rounded" value={formData.type} onChange={(e:any) => setFormData({...formData, type: e.target.value})}>{(Object.values(ProductType) as string[]).map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                     </div>
                     <div><label className="text-sm font-medium">Mô tả ngắn</label><textarea className="w-full border p-2 rounded" rows={2} value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} /></div>
                     <div><label className="text-sm font-medium">Quy tắc nghiệp vụ / Điều khoản (Dữ liệu cho AI)</label><textarea className="w-full border p-2 rounded bg-yellow-50" rows={6} value={formData.rulesAndTerms} onChange={e => setFormData({...formData, rulesAndTerms: e.target.value})} placeholder="Nhập các điều khoản quan trọng, quy tắc loại trừ..." /></div>
                 </div>
                 <div className="flex justify-end gap-3 mt-6">
                     <button onClick={() => setShowModal(false)} className="px-4 py-2 text-gray-600 bg-gray-100 rounded hover:bg-gray-200">Hủy</button>
                     <button onClick={handleSave} className="px-4 py-2 text-white bg-pru-red rounded hover:bg-red-700">Lưu</button>
                 </div>
             </div>
        </div>
      )}

      {/* Confirm Modal Render */}
      <ConfirmModal 
          isOpen={deleteConfirm.isOpen}
          title="Xóa sản phẩm?"
          message={<span>Bạn có chắc muốn xóa sản phẩm <b>{deleteConfirm.name}</b>?<br/>Việc này có thể ảnh hưởng đến kiến thức AI.</span>}
          onConfirm={() => onDelete(deleteConfirm.id)}
          onClose={() => setDeleteConfirm({...deleteConfirm, isOpen: false})}
      />
    </div>
  );
}

// --- APPOINTMENTS PAGE ---
const AppointmentsPage: React.FC<{ 
  appointments: Appointment[], 
  customers: Customer[],
  onAdd: (a: Appointment) => void,
  onUpdate: (a: Appointment) => void,
  onDelete: (id: string) => void 
}> = ({ appointments, customers, onAdd, onUpdate, onDelete }) => {
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  
  // Delete Modal State
  const [deleteConfirm, setDeleteConfirm] = useState<{isOpen: boolean, id: string}>({
      isOpen: false, id: ''
  });

  const initialForm: Appointment = { id: '', customerId: '', customerName: '', date: new Date().toISOString().split('T')[0], time: '09:00', type: AppointmentType.CONSULTATION, status: AppointmentStatus.UPCOMING, note: '' };
  const [formData, setFormData] = useState<Appointment>(initialForm);

  const handleSave = () => {
      if(!formData.customerId) return alert("Chọn khách hàng");
      if(isEditing) onUpdate(formData); else onAdd({...formData});
      setShowModal(false);
  }

  // Sort: Upcoming first, then by date
  const sorted = [...appointments].sort((a,b) => {
      if(a.status === AppointmentStatus.UPCOMING && b.status !== AppointmentStatus.UPCOMING) return -1;
      if(a.status !== AppointmentStatus.UPCOMING && b.status === AppointmentStatus.UPCOMING) return 1;
      return new Date(a.date + 'T' + a.time).getTime() - new Date(b.date + 'T' + b.time).getTime();
  });

  return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
            <div><h1 className="text-2xl font-bold text-gray-800">Lịch hẹn & Chăm sóc</h1><p className="text-sm text-gray-500">Quản lý cuộc hẹn và nhắc nhở</p></div>
            <button onClick={() => {setFormData(initialForm); setIsEditing(false); setShowModal(true)}} className="bg-pru-red text-white px-4 py-2 rounded-lg hover:bg-red-700 transition"><i className="fas fa-calendar-plus mr-2"></i>Tạo lịch hẹn</button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full text-left">
                <thead className="bg-gray-50 text-gray-600 text-sm">
                    <tr>
                        <th className="px-6 py-4">Thời gian</th>
                        <th className="px-6 py-4">Khách hàng</th>
                        <th className="px-6 py-4">Loại / Nội dung</th>
                        <th className="px-6 py-4">Trạng thái</th>
                        <th className="px-6 py-4 text-right">Thao tác</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {sorted.map(a => (
                        <tr key={a.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4">
                                <div className="font-bold text-gray-800">{a.time}</div>
                                <div className="text-xs text-gray-500">{formatDateVN(a.date)}</div>
                            </td>
                            <td className="px-6 py-4 font-medium">{a.customerName}</td>
                            <td className="px-6 py-4">
                                <span className="text-xs font-bold text-gray-600 uppercase border border-gray-200 px-1.5 py-0.5 rounded">{a.type}</span>
                                <div className="text-sm text-gray-600 mt-1">{a.note}</div>
                            </td>
                            <td className="px-6 py-4">
                                <span className={`px-2 py-1 rounded text-xs font-medium ${
                                    a.status === AppointmentStatus.UPCOMING ? 'bg-blue-100 text-blue-700' :
                                    a.status === AppointmentStatus.COMPLETED ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                                }`}>{a.status}</span>
                            </td>
                            <td className="px-6 py-4 text-right">
                                <div className="flex justify-end gap-4">
                                    <button onClick={() => {setFormData(a); setIsEditing(true); setShowModal(true)}} className="text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded transition border border-blue-100"><i className="fas fa-edit"></i></button>
                                    <button 
                                        onClick={() => setDeleteConfirm({isOpen: true, id: a.id})} 
                                        className="text-red-500 hover:bg-red-50 px-3 py-1.5 rounded transition border border-red-100"
                                    >
                                        <i className="fas fa-trash"></i>
                                    </button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>

        {showModal && (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-xl w-full max-w-lg p-6 shadow-2xl">
                    <h3 className="text-xl font-bold mb-4">{isEditing ? 'Cập nhật lịch hẹn' : 'Tạo lịch hẹn mới'}</h3>
                    <div className="space-y-4">
                        <SearchableCustomerSelect customers={customers} value={formData.customerName} onChange={cus => {
                            setFormData({...formData, customerId: cus.id, customerName: cus.fullName});
                        }} label="Khách hàng" />
                        <div className="grid grid-cols-2 gap-4">
                            <div><label className="text-sm font-medium">Ngày</label><input type="date" className="w-full border p-2 rounded" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} /></div>
                            <div><label className="text-sm font-medium">Giờ</label><input type="time" className="w-full border p-2 rounded" value={formData.time} onChange={e => setFormData({...formData, time: e.target.value})} /></div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                             <div><label className="text-sm font-medium">Loại</label><select className="w-full border p-2 rounded" value={formData.type} onChange={(e:any) => setFormData({...formData, type: e.target.value})}>{(Object.values(AppointmentType) as string[]).map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                             <div><label className="text-sm font-medium">Trạng thái</label><select className="w-full border p-2 rounded" value={formData.status} onChange={(e:any) => setFormData({...formData, status: e.target.value})}>{(Object.values(AppointmentStatus) as string[]).map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                        </div>
                        <div><label className="text-sm font-medium">Ghi chú</label><textarea className="w-full border p-2 rounded" rows={3} value={formData.note} onChange={e => setFormData({...formData, note: e.target.value})} /></div>
                    </div>
                    <div className="flex justify-end gap-3 mt-6">
                        <button onClick={() => setShowModal(false)} className="px-4 py-2 text-gray-600 bg-gray-100 rounded hover:bg-gray-200">Hủy</button>
                        <button onClick={handleSave} className="px-4 py-2 text-white bg-pru-red rounded hover:bg-red-700">Lưu</button>
                    </div>
                </div>
            </div>
        )}

        {/* Confirm Modal Render */}
        <ConfirmModal 
            isOpen={deleteConfirm.isOpen}
            title="Xóa lịch hẹn?"
            message="Bạn có chắc muốn xóa lịch hẹn này không?"
            onConfirm={() => onDelete(deleteConfirm.id)}
            onClose={() => setDeleteConfirm({...deleteConfirm, isOpen: false})}
        />
      </div>
  )
}

// --- MAIN APP COMPONENT ---

const App: React.FC = () => {
    const [state, setState] = useState<AppState>({
        customers: [],
        contracts: [],
        products: [],
        appointments: []
    });

    // --- REALTIME DATABASE SUBSCRIPTIONS ---
    useEffect(() => {
        // Subscribe to Customers
        const unsubCustomers = subscribeToCollection(COLLECTIONS.CUSTOMERS, (data) => {
            setState(prev => ({ ...prev, customers: data }));
        });

        // Subscribe to Products
        const unsubProducts = subscribeToCollection(COLLECTIONS.PRODUCTS, (data) => {
            setState(prev => ({ ...prev, products: data }));
        });

        // Subscribe to Contracts
        const unsubContracts = subscribeToCollection(COLLECTIONS.CONTRACTS, (data) => {
            setState(prev => ({ ...prev, contracts: data }));
        });

        // Subscribe to Appointments
        const unsubAppointments = subscribeToCollection(COLLECTIONS.APPOINTMENTS, (data) => {
            setState(prev => ({ ...prev, appointments: data }));
        });

        // Cleanup on unmount
        return () => {
            unsubCustomers();
            unsubProducts();
            unsubContracts();
            unsubAppointments();
        };
    }, []);

    // Check for Lapsed Contracts (Logic only, no DB write loop to avoid issues)
    // In a real app, this should be a Cloud Function backend job. 
    // Here we just display them as Lapsed if calculated on the fly, but we don't auto-update DB to keep it simple.
    // (The previous useEffect for checkLapsed is removed to prevent infinite loops with DB)

    // CRUD Handlers (Now using DB Services)
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

    return (
        <Router>
            <Layout>
                <Routes>
                    <Route path="/" element={<Dashboard state={state} onUpdateContract={updateContract} />} />
                    <Route path="/customers" element={<CustomersPage customers={state.customers} contracts={state.contracts} onAdd={addCustomer} onUpdate={updateCustomer} onDelete={deleteCustomer} />} />
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
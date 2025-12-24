
import React, { useState, useEffect, useRef } from 'react';
import { MessageTemplate, Customer, Contract, ContractStatus, Gender } from '../types';
import { ConfirmModal, SearchableCustomerSelect, formatDateVN } from '../components/Shared';

interface MessageTemplatesPageProps {
    templates: MessageTemplate[];
    customers: Customer[];
    contracts: Contract[];
    onAdd: (t: MessageTemplate) => void;
    onUpdate: (t: MessageTemplate) => void;
    onDelete: (id: string) => void;
}

const MessageTemplatesPage: React.FC<MessageTemplatesPageProps> = ({ templates, customers, contracts, onAdd, onUpdate, onDelete }) => {
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
    
    // Custom Variable State
    const [customVarName, setCustomVarName] = useState(''); // For adding new var in Editor
    const [detectedCustomVars, setDetectedCustomVars] = useState<string[]>([]); // Detected when using
    const [customVarValues, setCustomVarValues] = useState<Record<string, string>>({}); // Values filled by user

    // --- Search & Filter State ---
    const [searchTerm, setSearchTerm] = useState('');
    const [filterCategory, setFilterCategory] = useState('all');
    
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Standard variables that are auto-filled by system
    // Added 'dob', 'birthday', 'Ngày sinh'
    const STANDARD_VARS = [
        'name', 'fullname', 'contract', 'date', 'fee', 'gender', 'dob', 'birthday',
        'Tên khách hàng', 'Họ và tên', 'Số hợp đồng', 'Ngày đóng phí', 'Số tiền', 'Danh xưng', 'Ngày sinh'
    ];

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
        const varString = `{${variable}}`;
        const textarea = textareaRef.current;
        
        // Insert at cursor position if possible
        if (textarea) {
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const text = formData.content;
            const newText = text.substring(0, start) + varString + text.substring(end);
            
            setFormData(prev => ({ ...prev, content: newText }));
            
            // Restore focus and cursor
            setTimeout(() => {
                textarea.focus();
                textarea.setSelectionRange(start + varString.length, start + varString.length);
            }, 0);
        } else {
            setFormData(prev => ({
                ...prev,
                content: prev.content + ` ${varString} `
            }));
        }
    };

    const handleAddCustomVar = () => {
        if(!customVarName.trim()) return;
        insertVariable(customVarName.trim());
        setCustomVarName('');
    }

    // --- Logic to detect variables in content ---
    const detectCustomVars = (content: string) => {
        const regex = /\{([^}]+)\}/g;
        const matches = [...content.matchAll(regex)].map(m => m[1]);
        // Filter out standard vars, keep unique custom ones
        const custom = matches.filter(v => !STANDARD_VARS.includes(v));
        return [...new Set(custom)];
    };

    // --- Logic to get Short Name (First Name) ---
    const getFirstName = (fullName: string) => {
        if (!fullName) return '';
        const parts = fullName.trim().split(/\s+/);
        return parts.length > 0 ? parts[parts.length - 1] : fullName;
    };

    // --- Message Generation Logic ---
    const generateMessage = (templateContent: string, customer: Customer | null, customValues: Record<string, string>) => {
        let text = templateContent;
        
        if (customer) {
            // 1. Handle {name} -> First Name (Tên gọi)
            const firstName = getFirstName(customer.fullName);
            text = text.replace(/\{name\}|\{Tên khách hàng\}/gi, firstName);

            // 2. Handle {fullname} -> Full Name (Họ tên đầy đủ)
            text = text.replace(/\{fullname\}|\{Họ và tên\}/gi, customer.fullName);
            
            // 3. Handle Gender
            const greeting = customer.gender === Gender.MALE ? 'Anh' : customer.gender === Gender.FEMALE ? 'Chị' : 'Bạn';
            text = text.replace(/\{gender\}|\{Danh xưng\}/gi, greeting);

            // 4. Handle Birthday
            text = text.replace(/\{dob\}|\{birthday\}|\{Ngày sinh\}/gi, formatDateVN(customer.dob));

            // 5. Handle Contract Info (Active)
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
        }

        // 6. Handle Custom Variables
        Object.entries(customValues).forEach(([key, val]) => {
            if(val) {
                // Escape special regex chars if necessary, but simple replacement is usually fine for keys
                const regex = new RegExp(`\\{${key}\\}`, 'gi');
                text = text.replace(regex, val);
            }
        });

        return text;
    };

    // Reset detected vars when opening Use Modal
    useEffect(() => {
        if (useModal.isOpen && useModal.template) {
            const vars = detectCustomVars(useModal.template.content);
            setDetectedCustomVars(vars);
            setCustomVarValues({}); // Reset values
        }
    }, [useModal.isOpen, useModal.template]);

    // Update preview when inputs change
    useEffect(() => {
        if (useModal.isOpen && useModal.template) {
            setPreviewContent(generateMessage(useModal.template.content, selectedCustomerForTemplate, customVarValues));
        }
    }, [useModal.isOpen, useModal.template, selectedCustomerForTemplate, customVarValues]);


    const handleCopyGenerated = () => {
        navigator.clipboard.writeText(previewContent);
        alert("Đã sao chép nội dung tin nhắn!");
        setUseModal({ isOpen: false, template: null });
        setSelectedCustomerForTemplate(null);
        setCustomVarValues({});
    };

    // --- Filter Logic ---
    const filteredTemplates = templates.filter(t => {
        const matchesSearch = (t.title?.toLowerCase() || '').includes(searchTerm.toLowerCase()) || 
                              (t.content?.toLowerCase() || '').includes(searchTerm.toLowerCase());
        const matchesCategory = filterCategory === 'all' || t.category === filterCategory;
        return matchesSearch && matchesCategory;
    });

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Quản lý Mẫu Tin Nhắn</h1>
                <button onClick={handleOpenAdd} className="bg-pru-red text-white px-4 py-2 rounded-lg hover:bg-red-700 transition shadow-md">
                    <i className="fas fa-plus mr-2"></i>Thêm mẫu mới
                </button>
            </div>

            {/* SEARCH & FILTER BAR */}
            <div className="bg-white dark:bg-pru-card p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col md:flex-row gap-4 items-center transition-colors">
                <div className="relative w-full md:w-1/3">
                     <i className="fas fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
                     <input 
                        type="text" 
                        placeholder="Tìm theo tên hoặc nội dung..." 
                        className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 rounded-lg text-sm focus:outline-none focus:border-pru-red focus:ring-1 focus:ring-pru-red"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                     />
                </div>
                
                <div className="flex gap-2 w-full md:w-2/3 overflow-x-auto pb-2 md:pb-0 scrollbar-hide">
                    {[
                        {id: 'all', label: 'Tất cả'},
                        {id: 'care', label: 'Chăm sóc chung'},
                        {id: 'birthday', label: 'Sinh nhật'},
                        {id: 'payment', label: 'Nhắc phí'},
                        {id: 'holiday', label: 'Lễ tết'},
                        {id: 'other', label: 'Khác'}
                    ].map(cat => (
                        <button 
                            key={cat.id}
                            onClick={() => setFilterCategory(cat.id)}
                            className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                                filterCategory === cat.id 
                                ? 'bg-gray-800 dark:bg-white text-white dark:text-gray-900 border-gray-800 dark:border-white shadow-sm' 
                                : 'bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'
                            }`}
                        >
                            {cat.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* TEMPLATE GRID */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredTemplates.length > 0 ? (
                    filteredTemplates.map(t => (
                        <div key={t.id} className="bg-white dark:bg-pru-card rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden hover:shadow-md transition flex flex-col group">
                            <div className={`h-2 w-full bg-${t.color || 'gray'}-500`}></div>
                            <div className="p-5 flex-1 flex flex-col">
                                <div className="flex justify-between items-start mb-3">
                                    <div className="flex items-center">
                                        <div className={`w-10 h-10 rounded-full bg-${t.color || 'gray'}-50 dark:bg-gray-800 flex items-center justify-center text-${t.color || 'gray'}-600 dark:text-${t.color || 'gray'}-400 mr-3`}>
                                            <i className={`fas ${t.icon || 'fa-comment'}`}></i>
                                        </div>
                                        <h3 className="font-bold text-lg text-gray-800 dark:text-gray-100 line-clamp-1">{t.title}</h3>
                                    </div>
                                    <div className="flex gap-1">
                                        <button onClick={() => handleOpenEdit(t)} className="text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 p-2 rounded"><i className="fas fa-edit"></i></button>
                                        <button onClick={() => setDeleteConfirm({ isOpen: true, id: t.id })} className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 p-2 rounded"><i className="fas fa-trash"></i></button>
                                    </div>
                                </div>
                                <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg text-sm text-gray-600 dark:text-gray-300 line-clamp-3 mb-4 flex-1 whitespace-pre-line border border-transparent dark:border-gray-700">
                                    {t.content}
                                </div>
                                <div className="flex justify-between items-center mt-auto">
                                    <span className="text-[10px] bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 px-2 py-1 rounded-full uppercase font-bold">{t.category}</span>
                                    <button 
                                        onClick={() => setUseModal({ isOpen: true, template: t })}
                                        className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-green-700 transition flex items-center shadow-md"
                                    >
                                        <i className="fas fa-paper-plane mr-2"></i> Sử dụng
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="col-span-full py-12 flex flex-col items-center justify-center text-center text-gray-400 dark:text-gray-600 bg-white dark:bg-pru-card rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
                        <i className="fas fa-search text-4xl mb-3 opacity-20"></i>
                        <p className="text-sm font-medium">Không tìm thấy mẫu tin nào phù hợp.</p>
                        <p className="text-xs mt-1">Hãy thử thay đổi từ khóa hoặc bộ lọc.</p>
                    </div>
                )}
            </div>

            {/* USE TEMPLATE MODAL */}
            {useModal.isOpen && useModal.template && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in backdrop-blur-sm">
                    <div className="bg-white dark:bg-pru-card rounded-xl max-w-lg w-full p-6 shadow-2xl flex flex-col max-h-[90vh] transition-colors">
                        <div className="flex justify-between items-center mb-4 border-b border-gray-100 dark:border-gray-700 pb-2">
                            <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">Tạo tin nhắn: {useModal.template.title}</h3>
                            <button onClick={() => { setUseModal({isOpen: false, template: null}); setSelectedCustomerForTemplate(null); }} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                                <i className="fas fa-times text-xl"></i>
                            </button>
                        </div>
                        
                        <div className="space-y-4 flex-1 overflow-y-auto">
                            <div>
                                <label className="label-text">Chọn khách hàng (để điền biến chuẩn)</label>
                                <SearchableCustomerSelect 
                                    customers={customers} 
                                    value={selectedCustomerForTemplate?.fullName || ''}
                                    onChange={setSelectedCustomerForTemplate}
                                    placeholder="Tìm kiếm khách hàng..."
                                />
                            </div>

                            {/* Detected Custom Variables Inputs */}
                            {detectedCustomVars.length > 0 && (
                                <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-100 dark:border-blue-900/30">
                                    <label className="block text-xs font-bold text-blue-800 dark:text-blue-300 mb-2 uppercase flex items-center">
                                        <i className="fas fa-pen-fancy mr-1"></i> Điền thông tin biến tùy chỉnh
                                    </label>
                                    <div className="space-y-3">
                                        {detectedCustomVars.map(v => (
                                            <div key={v}>
                                                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1 font-medium">{v}</label>
                                                <input 
                                                    type="text" 
                                                    className="w-full border border-blue-200 dark:border-blue-800 rounded p-2 text-sm focus:ring-1 focus:ring-blue-400 outline-none bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200"
                                                    placeholder={`Nhập nội dung cho {${v}}...`}
                                                    value={customVarValues[v] || ''}
                                                    onChange={(e) => setCustomVarValues({...customVarValues, [v]: e.target.value})}
                                                    autoFocus={detectedCustomVars[0] === v} // Auto focus first input
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div>
                                <label className="label-text">Xem trước nội dung</label>
                                <textarea 
                                    className="w-full border border-gray-300 dark:border-gray-700 rounded-lg p-3 text-sm bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 h-40 focus:ring-2 focus:ring-green-200 outline-none font-sans leading-relaxed"
                                    value={previewContent}
                                    onChange={(e) => setPreviewContent(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-700">
                            <button onClick={() => { setUseModal({isOpen: false, template: null}); setSelectedCustomerForTemplate(null); }} className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Hủy</button>
                            <button 
                                onClick={handleCopyGenerated}
                                className="px-4 py-2 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 shadow-md flex items-center"
                            >
                                <i className="fas fa-copy mr-2"></i> Sao chép & Đóng
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* CREATE / EDIT MODAL */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in backdrop-blur-sm">
                    <div className="bg-white dark:bg-pru-card rounded-xl max-w-2xl w-full p-6 shadow-2xl transition-colors">
                        <h3 className="text-xl font-bold mb-4 border-b border-gray-100 dark:border-gray-700 pb-2 text-gray-800 dark:text-gray-100">{isEditing ? 'Sửa Mẫu Tin' : 'Tạo Mẫu Tin Mới'}</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="label-text">Tiêu đề mẫu tin</label>
                                <input className="input-field" value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} placeholder="VD: Voucher sinh nhật..." />
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="label-text">Danh mục</label>
                                    <select className="input-field" value={formData.category} onChange={(e: any) => setFormData({ ...formData, category: e.target.value })}>
                                        <option value="care">Chăm sóc chung</option>
                                        <option value="birthday">Sinh nhật</option>
                                        <option value="payment">Nhắc phí</option>
                                        <option value="holiday">Lễ tết</option>
                                        <option value="other">Khác</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="label-text">Màu sắc (Thẻ)</label>
                                    <select className="input-field" value={formData.color} onChange={(e: any) => setFormData({ ...formData, color: e.target.value })}>
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
                                    <label className="label-text">Nội dung tin nhắn</label>
                                </div>
                                
                                <div className="flex flex-wrap items-center gap-2 mb-2 p-2 bg-gray-50 dark:bg-gray-800 rounded border border-gray-100 dark:border-gray-700">
                                    <span className="text-xs text-gray-500 dark:text-gray-400 font-bold mr-1">Chèn nhanh:</span>
                                    {[
                                        { label: 'Tên gọi', val: 'name' },
                                        { label: 'Họ tên', val: 'fullname' },
                                        { label: 'Số HĐ', val: 'contract' },
                                        { label: 'Ngày sinh', val: 'dob' },
                                        { label: 'Ngày đóng', val: 'date' },
                                        { label: 'Số tiền', val: 'fee' },
                                        { label: 'Danh xưng', val: 'gender' }
                                    ].map(v => (
                                        <button 
                                            key={v.val} 
                                            onClick={() => insertVariable(v.val)}
                                            className="text-xs bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 px-2 py-1 rounded hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:text-gray-300 transition"
                                        >
                                            {v.label}
                                        </button>
                                    ))}
                                    
                                    <div className="flex items-center border border-dashed border-gray-300 dark:border-gray-600 rounded ml-2 bg-white dark:bg-gray-900">
                                        <input 
                                            type="text" 
                                            className="w-24 px-2 py-1 text-xs outline-none bg-transparent text-gray-800 dark:text-gray-200"
                                            placeholder="Biến tùy chỉnh..."
                                            value={customVarName}
                                            onChange={(e) => setCustomVarName(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleAddCustomVar()}
                                            title="Nhập tên biến (vd: voucher) rồi Enter"
                                        />
                                        <button 
                                            onClick={handleAddCustomVar}
                                            disabled={!customVarName.trim()}
                                            className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-800 border-l dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 text-gray-600 dark:text-gray-300"
                                            title="Thêm biến này"
                                        >
                                            <i className="fas fa-plus"></i>
                                        </button>
                                    </div>
                                </div>

                                <textarea 
                                    ref={textareaRef}
                                    className="input-field min-h-[150px] font-mono text-sm leading-relaxed" 
                                    value={formData.content} 
                                    onChange={e => setFormData({ ...formData, content: e.target.value })} 
                                    placeholder="Ví dụ: Chào {name}, tặng bạn mã {voucher} áp dụng tại {địa_điểm}..."
                                />
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 mt-6 border-t border-gray-100 dark:border-gray-700 pt-4">
                            <button onClick={() => setShowModal(false)} className="px-5 py-2 text-gray-600 dark:text-gray-300 font-medium hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Hủy</button>
                            <button onClick={handleSubmit} className="px-5 py-2 bg-pru-red text-white rounded-lg font-bold hover:bg-red-700 shadow-md">Lưu</button>
                        </div>
                    </div>
                </div>
            )}
            
            <ConfirmModal isOpen={deleteConfirm.isOpen} title="Xóa mẫu tin?" message="Bạn có chắc chắn muốn xóa mẫu tin này không?" onConfirm={() => onDelete(deleteConfirm.id)} onClose={() => setDeleteConfirm({ isOpen: false, id: '' })} />

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

export default MessageTemplatesPage;

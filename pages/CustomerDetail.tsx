
import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Customer, Contract, InteractionType, TimelineItem, ClaimRecord, ClaimStatus, CustomerDocument } from '../types';
import { formatDateVN, CurrencyInput, ConfirmModal } from '../components/Shared';
import { uploadFile } from '../services/storage';

interface CustomerDetailProps {
    customers: Customer[];
    contracts: Contract[];
    onUpdateCustomer: (c: Customer) => Promise<void>;
}

const CustomerDetail: React.FC<CustomerDetailProps> = ({ customers, contracts, onUpdateCustomer }) => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    
    // Find customer
    const customer = customers.find(c => c.id === id);
    const customerContracts = contracts.filter(c => c.customerId === id);

    // Calculate Financial Snapshot
    const totalPremiums = customerContracts.reduce((sum, c) => sum + c.totalFee, 0);
    const totalClaims = (customer?.claims || []).filter(c => c.status === ClaimStatus.APPROVED).reduce((sum, c) => sum + c.amountPaid, 0);

    // State
    const [activeTab, setActiveTab] = useState<'timeline' | 'claims' | 'contracts' | 'docs' | 'info'>('timeline');
    
    // New Timeline State
    const [newInteraction, setNewInteraction] = useState<{type: InteractionType, content: string, title: string, date: string}>({
        type: InteractionType.NOTE, content: '', title: '', date: new Date().toISOString().split('T')[0]
    });
    const [isAddingTimeline, setIsAddingTimeline] = useState(false);

    // New Claim State
    const [isAddingClaim, setIsAddingClaim] = useState(false);
    const [newClaim, setNewClaim] = useState<Partial<ClaimRecord>>({
        benefitType: 'Nằm viện', amountRequest: 0, status: ClaimStatus.PENDING, dateSubmitted: new Date().toISOString().split('T')[0]
    });

    if (!customer) return <div className="p-10 text-center">Không tìm thấy khách hàng</div>;

    // --- HANDLERS ---

    const handleAddTimeline = async () => {
        if (!newInteraction.content) return alert("Vui lòng nhập nội dung");
        
        const newItem: TimelineItem = {
            id: Date.now().toString(),
            date: new Date().toISOString(), // Use current exact time for sorting
            type: newInteraction.type,
            title: newInteraction.title || newInteraction.type,
            content: newInteraction.content,
            result: ''
        };

        const updatedCustomer = {
            ...customer,
            timeline: [newItem, ...(customer.timeline || [])],
            // Sync legacy field
            interactionHistory: [`${formatDateVN(newItem.date)}: ${newItem.title} - ${newItem.content}`, ...(customer.interactionHistory || [])]
        };

        await onUpdateCustomer(updatedCustomer);
        setIsAddingTimeline(false);
        setNewInteraction({type: InteractionType.NOTE, content: '', title: '', date: new Date().toISOString().split('T')[0]});
    };

    const handleAddClaim = async () => {
        if (!newClaim.amountRequest) return alert("Vui lòng nhập số tiền yêu cầu");
        
        const item: ClaimRecord = {
            id: `claim_${Date.now()}`,
            dateSubmitted: newClaim.dateSubmitted || new Date().toISOString(),
            contractId: newClaim.contractId || '',
            benefitType: newClaim.benefitType || '',
            amountRequest: newClaim.amountRequest || 0,
            amountPaid: 0, // Default 0 until approved
            status: ClaimStatus.PENDING,
            notes: newClaim.notes || '',
            documents: []
        };

        const updatedCustomer = {
            ...customer,
            claims: [item, ...(customer.claims || [])],
            // Add a timeline event for this claim
            timeline: [{
                id: `tl_${Date.now()}`,
                date: new Date().toISOString(),
                type: InteractionType.CLAIM,
                title: 'Nộp yêu cầu Bồi thường',
                content: `Yêu cầu chi trả ${item.amountRequest.toLocaleString()}đ cho quyền lợi ${item.benefitType}`,
                result: 'Đang xử lý'
            }, ...(customer.timeline || [])]
        };

        await onUpdateCustomer(updatedCustomer);
        setIsAddingClaim(false);
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, category: 'medical' | 'personal') => {
        const file = e.target.files?.[0];
        if (!file) return;
        
        try {
            const url = await uploadFile(file, 'customer_docs');
            const newDoc: CustomerDocument = {
                id: Date.now().toString(),
                name: file.name,
                url: url,
                type: file.type.includes('image') ? 'image' : 'pdf',
                category: category,
                uploadDate: new Date().toISOString()
            };

            const updatedCustomer = {
                ...customer,
                documents: [...(customer.documents || []), newDoc]
            };
            await onUpdateCustomer(updatedCustomer);
            alert("Đã tải tài liệu thành công!");
        } catch (err) {
            alert("Lỗi tải file");
        }
    };

    // Helper for Timeline Icons
    const getTimelineIcon = (type: InteractionType) => {
        switch(type) {
            case InteractionType.CALL: return 'fa-phone-alt bg-blue-100 text-blue-600';
            case InteractionType.MEETING: return 'fa-users bg-purple-100 text-purple-600';
            case InteractionType.CLAIM: return 'fa-heartbeat bg-red-100 text-red-600';
            case InteractionType.CONTRACT: return 'fa-file-signature bg-green-100 text-green-600';
            case InteractionType.ZALO: return 'fa-comment-dots bg-blue-50 text-blue-500';
            default: return 'fa-sticky-note bg-gray-100 text-gray-500';
        }
    };

    return (
        <div className="space-y-6 pb-20">
            {/* HEADER: PROFILE & FINANCIAL SNAPSHOT */}
            <div className="bg-white dark:bg-pru-card rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-pru-red/5 rounded-bl-full -mr-10 -mt-10"></div>
                
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative z-10">
                    <div className="flex items-center gap-4">
                        <button onClick={() => navigate('/customers')} className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center hover:bg-gray-200 transition">
                            <i className="fas fa-arrow-left text-gray-600 dark:text-gray-300"></i>
                        </button>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{customer.fullName}</h1>
                            <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400 mt-1">
                                <span><i className="fas fa-id-badge mr-1"></i> {customer.idCard || '---'}</span>
                                <span><i className="fas fa-birthday-cake mr-1"></i> {formatDateVN(customer.dob)}</span>
                                <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${customer.status === 'Đã tham gia' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{customer.status}</span>
                            </div>
                        </div>
                    </div>

                    {/* Financial Snapshot */}
                    <div className="flex gap-4">
                        <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-xl border border-gray-200 dark:border-gray-700 text-right min-w-[140px]">
                            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase font-bold">Tổng phí đã đóng</p>
                            <p className="text-xl font-black text-gray-800 dark:text-gray-100">{totalPremiums.toLocaleString()} <span className="text-xs font-normal">đ</span></p>
                        </div>
                        <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-xl border border-green-100 dark:border-green-800 text-right min-w-[140px]">
                            <p className="text-xs text-green-600 dark:text-green-400 uppercase font-bold">Quyền lợi đã nhận</p>
                            <p className="text-xl font-black text-green-700 dark:text-green-300">{totalClaims.toLocaleString()} <span className="text-xs font-normal">đ</span></p>
                        </div>
                    </div>
                </div>
            </div>

            {/* NAVIGATION TABS */}
            <div className="flex overflow-x-auto gap-2 border-b border-gray-200 dark:border-gray-800 pb-1">
                {[
                    {id: 'timeline', label: 'Dòng thời gian', icon: 'fa-history'},
                    {id: 'contracts', label: 'Hợp đồng', icon: 'fa-file-contract'},
                    {id: 'claims', label: 'Bồi thường (Claims)', icon: 'fa-heartbeat'},
                    {id: 'docs', label: 'Hồ sơ & Tài liệu', icon: 'fa-folder-open'},
                    {id: 'info', label: 'Thông tin cá nhân', icon: 'fa-user'}
                ].map(tab => (
                    <button 
                        key={tab.id} 
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`px-4 py-3 rounded-t-xl text-sm font-bold flex items-center gap-2 transition ${activeTab === tab.id ? 'bg-white dark:bg-pru-card text-pru-red border-b-2 border-pru-red shadow-sm' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                    >
                        <i className={`fas ${tab.icon}`}></i> {tab.label}
                    </button>
                ))}
            </div>

            {/* MAIN CONTENT AREA */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* LEFT CONTENT (Based on Tab) */}
                <div className="lg:col-span-2 space-y-6">
                    
                    {/* TAB: TIMELINE */}
                    {activeTab === 'timeline' && (
                        <div className="bg-white dark:bg-pru-card rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-800">
                            {/* Add Interaction Input */}
                            <div className="mb-8 bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
                                <div className="flex gap-2 mb-3 overflow-x-auto pb-2">
                                    {Object.values(InteractionType).map(t => (
                                        <button 
                                            key={t}
                                            onClick={() => setNewInteraction({...newInteraction, type: t})}
                                            className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition ${newInteraction.type === t ? 'bg-gray-800 text-white dark:bg-white dark:text-gray-900' : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600'}`}
                                        >
                                            {t}
                                        </button>
                                    ))}
                                </div>
                                <div className="flex gap-3">
                                    <input 
                                        className="flex-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-pru-red/20"
                                        placeholder={`Ghi chú cho ${newInteraction.type}...`}
                                        value={newInteraction.content}
                                        onChange={e => setNewInteraction({...newInteraction, content: e.target.value})}
                                        onKeyDown={e => e.key === 'Enter' && handleAddTimeline()}
                                    />
                                    <button onClick={handleAddTimeline} className="w-12 h-12 bg-pru-red text-white rounded-xl shadow-md hover:bg-red-700 transition flex items-center justify-center">
                                        <i className="fas fa-paper-plane"></i>
                                    </button>
                                </div>
                            </div>

                            {/* Timeline List */}
                            <div className="space-y-0 relative">
                                <div className="absolute left-6 top-4 bottom-4 w-0.5 bg-gray-200 dark:bg-gray-700"></div>
                                {customer.timeline && customer.timeline.length > 0 ? (
                                    customer.timeline.map((item, idx) => (
                                        <div key={idx} className="relative pl-16 pb-8 last:pb-0 group">
                                            <div className={`absolute left-2 w-9 h-9 rounded-full border-4 border-white dark:border-pru-card flex items-center justify-center shadow-sm z-10 ${getTimelineIcon(item.type)}`}>
                                                <i className={`fas ${item.type === InteractionType.CALL ? 'fa-phone' : item.type === InteractionType.CLAIM ? 'fa-heartbeat' : 'fa-sticky-note'} text-xs`}></i>
                                            </div>
                                            <div className="bg-gray-50 dark:bg-gray-800/30 p-4 rounded-xl border border-gray-100 dark:border-gray-800 hover:shadow-md transition">
                                                <div className="flex justify-between items-start mb-2">
                                                    <span className="text-[10px] font-bold uppercase text-gray-400 tracking-wider">
                                                        {new Date(item.date).toLocaleString('vi-VN')} • {item.type}
                                                    </span>
                                                    {item.result && <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded font-bold">{item.result}</span>}
                                                </div>
                                                <p className="text-gray-800 dark:text-gray-200 text-sm whitespace-pre-wrap">{item.content}</p>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-center py-10 text-gray-400 italic">Chưa có lịch sử tương tác nào.</div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* TAB: CONTRACTS */}
                    {activeTab === 'contracts' && (
                        <div className="grid grid-cols-1 gap-4">
                            {customerContracts.map(c => (
                                <div key={c.id} className="bg-white dark:bg-pru-card p-5 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-md transition">
                                    <div className="flex justify-between items-start mb-4 border-b border-gray-100 dark:border-gray-800 pb-3">
                                        <div>
                                            <h3 className="font-bold text-lg text-pru-red">{c.contractNumber}</h3>
                                            <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{c.mainProduct.productName}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-bold text-gray-600 dark:text-gray-400">{c.status}</p>
                                            <p className="text-xs text-gray-400">Hiệu lực: {formatDateVN(c.effectiveDate)}</p>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-500">Người được BH:</span>
                                            <span className="font-medium text-gray-800 dark:text-gray-200">{c.mainProduct.insuredName}</span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-500">Mệnh giá bảo vệ:</span>
                                            <span className="font-bold text-blue-600">{c.mainProduct.sumAssured.toLocaleString()} đ</span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-500">Phí đóng ({c.paymentFrequency}):</span>
                                            <span className="font-bold text-gray-800 dark:text-gray-200">{c.totalFee.toLocaleString()} đ</span>
                                        </div>
                                    </div>
                                    {c.riders.length > 0 && (
                                        <div className="mt-4 pt-3 border-t border-dashed border-gray-200 dark:border-gray-700">
                                            <p className="text-xs font-bold text-gray-400 uppercase mb-2">Sản phẩm bổ trợ ({c.riders.length})</p>
                                            <div className="space-y-1">
                                                {c.riders.map((r, i) => (
                                                    <div key={i} className="flex justify-between text-xs text-gray-600 dark:text-gray-300">
                                                        <span>• {r.productName}</span>
                                                        <span>{r.attributes?.plan || r.sumAssured.toLocaleString()}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                            {customerContracts.length === 0 && <div className="p-10 text-center text-gray-400 bg-white dark:bg-pru-card rounded-xl">Chưa có hợp đồng nào.</div>}
                        </div>
                    )}

                    {/* TAB: CLAIMS */}
                    {activeTab === 'claims' && (
                        <div className="bg-white dark:bg-pru-card rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
                            <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50">
                                <h3 className="font-bold text-gray-800 dark:text-gray-100">Lịch sử Bồi thường (Claims)</h3>
                                <button onClick={() => setIsAddingClaim(true)} className="text-xs bg-red-600 text-white px-3 py-1.5 rounded-lg font-bold hover:bg-red-700 shadow-md">
                                    <i className="fas fa-plus mr-1"></i> Tạo yêu cầu
                                </button>
                            </div>
                            
                            {isAddingClaim && (
                                <div className="p-4 bg-red-50 dark:bg-red-900/10 border-b border-red-100 animate-fade-in">
                                    <h4 className="text-sm font-bold text-red-800 dark:text-red-300 mb-3">Nhập thông tin Claim mới</h4>
                                    <div className="grid grid-cols-2 gap-3 mb-3">
                                        <select className="input-field text-sm" value={newClaim.contractId} onChange={(e) => setNewClaim({...newClaim, contractId: e.target.value})}>
                                            <option value="">-- Chọn HĐ --</option>
                                            {customerContracts.map(c => <option key={c.id} value={c.id}>{c.contractNumber} - {c.mainProduct.productName}</option>)}
                                        </select>
                                        <select className="input-field text-sm" value={newClaim.benefitType} onChange={(e) => setNewClaim({...newClaim, benefitType: e.target.value})}>
                                            <option>Nằm viện / Phẫu thuật</option>
                                            <option>Tai nạn</option>
                                            <option>Bệnh hiểm nghèo</option>
                                            <option>Tử vong / TTTBVV</option>
                                        </select>
                                        <CurrencyInput className="input-field text-sm" placeholder="Số tiền yêu cầu" value={newClaim.amountRequest || 0} onChange={v => setNewClaim({...newClaim, amountRequest: v})} />
                                        <input type="date" className="input-field text-sm" value={newClaim.dateSubmitted} onChange={(e) => setNewClaim({...newClaim, dateSubmitted: e.target.value})} />
                                    </div>
                                    <textarea className="input-field text-sm w-full mb-3" rows={2} placeholder="Ghi chú thêm..." value={newClaim.notes} onChange={(e) => setNewClaim({...newClaim, notes: e.target.value})} />
                                    <div className="flex justify-end gap-2">
                                        <button onClick={() => setIsAddingClaim(false)} className="px-3 py-1.5 text-xs font-bold text-gray-500 bg-white border border-gray-200 rounded-lg">Hủy</button>
                                        <button onClick={handleAddClaim} className="px-3 py-1.5 text-xs font-bold text-white bg-red-600 rounded-lg shadow-sm">Lưu</button>
                                    </div>
                                </div>
                            )}

                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-bold border-b border-gray-100 dark:border-gray-700">
                                        <tr>
                                            <th className="px-4 py-3">Ngày nộp</th>
                                            <th className="px-4 py-3">Loại quyền lợi</th>
                                            <th className="px-4 py-3">Số tiền YC</th>
                                            <th className="px-4 py-3">Trạng thái</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                        {customer.claims && customer.claims.length > 0 ? (
                                            customer.claims.map((claim, idx) => (
                                                <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{formatDateVN(claim.dateSubmitted)}</td>
                                                    <td className="px-4 py-3 font-medium text-gray-800 dark:text-gray-200">{claim.benefitType}</td>
                                                    <td className="px-4 py-3 font-bold text-pru-red">{claim.amountRequest.toLocaleString()} đ</td>
                                                    <td className="px-4 py-3">
                                                        <span className={`px-2 py-1 rounded text-xs font-bold ${
                                                            claim.status === ClaimStatus.APPROVED ? 'bg-green-100 text-green-700' :
                                                            claim.status === ClaimStatus.REJECTED ? 'bg-red-100 text-red-700' :
                                                            'bg-yellow-100 text-yellow-700'
                                                        }`}>
                                                            {claim.status}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan={4} className="px-4 py-8 text-center text-gray-400 italic">Chưa có hồ sơ bồi thường nào.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* TAB: DOCS */}
                    {activeTab === 'docs' && (
                        <div className="bg-white dark:bg-pru-card rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-800">
                            <h3 className="font-bold text-gray-800 dark:text-gray-100 mb-4">Hồ sơ Y khoa & Giấy tờ</h3>
                            
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                                <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition">
                                    <i className="fas fa-file-medical text-2xl text-blue-400 mb-2"></i>
                                    <span className="text-xs font-bold text-gray-500">Upload Hồ sơ bệnh án</span>
                                    <input type="file" className="hidden" onChange={(e) => handleFileUpload(e, 'medical')} accept="image/*,.pdf" />
                                </label>
                                <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition">
                                    <i className="fas fa-id-card text-2xl text-green-400 mb-2"></i>
                                    <span className="text-xs font-bold text-gray-500">Upload CCCD/Khai sinh</span>
                                    <input type="file" className="hidden" onChange={(e) => handleFileUpload(e, 'personal')} accept="image/*,.pdf" />
                                </label>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                {customer.documents && customer.documents.map((doc, idx) => (
                                    <a key={idx} href={doc.url} target="_blank" rel="noreferrer" className="group relative block bg-gray-50 dark:bg-gray-800 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 hover:shadow-md transition">
                                        <div className="h-24 bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-4xl text-gray-400">
                                            <i className={`fas ${doc.type === 'image' ? 'fa-image' : 'fa-file-pdf'}`}></i>
                                        </div>
                                        <div className="p-2">
                                            <p className="text-xs font-bold text-gray-800 dark:text-gray-200 truncate">{doc.name}</p>
                                            <p className="text-[10px] text-gray-500 uppercase">{doc.category}</p>
                                        </div>
                                    </a>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* TAB: INFO (Quick Read) */}
                    {activeTab === 'info' && (
                        <div className="bg-white dark:bg-pru-card rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 space-y-4">
                            <h3 className="font-bold text-gray-800 dark:text-gray-100">Thông tin chi tiết</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                <div className="flex justify-between border-b border-gray-100 dark:border-gray-700 pb-2">
                                    <span className="text-gray-500">Điện thoại</span>
                                    <span className="font-medium text-gray-800 dark:text-gray-200">{customer.phone}</span>
                                </div>
                                <div className="flex justify-between border-b border-gray-100 dark:border-gray-700 pb-2">
                                    <span className="text-gray-500">Nghề nghiệp</span>
                                    <span className="font-medium text-gray-800 dark:text-gray-200">{customer.job || customer.occupation}</span>
                                </div>
                                <div className="flex justify-between border-b border-gray-100 dark:border-gray-700 pb-2">
                                    <span className="text-gray-500">Tình trạng hôn nhân</span>
                                    <span className="font-medium text-gray-800 dark:text-gray-200">{customer.maritalStatus}</span>
                                </div>
                                <div className="flex justify-between border-b border-gray-100 dark:border-gray-700 pb-2">
                                    <span className="text-gray-500">Vai trò tài chính</span>
                                    <span className="font-medium text-gray-800 dark:text-gray-200">{customer.financialRole}</span>
                                </div>
                                <div className="flex justify-between border-b border-gray-100 dark:border-gray-700 pb-2 md:col-span-2">
                                    <span className="text-gray-500">Địa chỉ / Công ty</span>
                                    <span className="font-medium text-gray-800 dark:text-gray-200">{customer.companyAddress}</span>
                                </div>
                            </div>
                            
                            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                                <h4 className="font-bold text-gray-700 dark:text-gray-300 mb-2">Sức khỏe & Ghi chú</h4>
                                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                                    <span className="font-bold">Tiền sử:</span> {customer.health?.medicalHistory || 'Chưa ghi nhận'}
                                </p>
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                    <span className="font-bold">Chỉ số:</span> {customer.health?.height}cm - {customer.health?.weight}kg
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* RIGHT SIDEBAR: QUICK ACTIONS & FAMILY */}
                <div className="space-y-6">
                    {/* Quick Actions */}
                    <div className="bg-white dark:bg-pru-card rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-800">
                        <h3 className="font-bold text-sm text-gray-500 uppercase mb-3">Thao tác nhanh</h3>
                        <div className="grid grid-cols-2 gap-3">
                            <button onClick={() => window.open(`tel:${customer.phone}`)} className="flex flex-col items-center justify-center p-3 bg-green-50 text-green-700 rounded-xl hover:bg-green-100 transition">
                                <i className="fas fa-phone-alt text-xl mb-1"></i> <span className="text-xs font-bold">Gọi điện</span>
                            </button>
                            <button className="flex flex-col items-center justify-center p-3 bg-blue-50 text-blue-700 rounded-xl hover:bg-blue-100 transition">
                                <i className="fas fa-comment-alt text-xl mb-1"></i> <span className="text-xs font-bold">Nhắn Zalo</span>
                            </button>
                            <button onClick={() => navigate(`/advisory/${customer.id}`)} className="flex flex-col items-center justify-center p-3 bg-purple-50 text-purple-700 rounded-xl hover:bg-purple-100 transition col-span-2">
                                <i className="fas fa-robot text-xl mb-1"></i> <span className="text-xs font-bold">Chat với AI (Roleplay)</span>
                            </button>
                        </div>
                    </div>

                    {/* Family */}
                    <div className="bg-white dark:bg-pru-card rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-800">
                        <h3 className="font-bold text-sm text-gray-500 uppercase mb-3">Gia đình & Mối quan hệ</h3>
                        {customer.relationships && customer.relationships.length > 0 ? (
                            <div className="space-y-3">
                                {customer.relationships.map((rel, idx) => {
                                    const relative = customers.find(c => c.id === rel.relatedCustomerId);
                                    if (!relative) return null;
                                    return (
                                        <div key={idx} onClick={() => navigate(`/customers/${relative.id}`)} className="flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg cursor-pointer transition">
                                            <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center font-bold text-xs">
                                                {relative.fullName.charAt(0)}
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-gray-800 dark:text-gray-200">{relative.fullName}</p>
                                                <p className="text-[10px] text-gray-500 uppercase">{rel.relationship}</p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <p className="text-xs text-gray-400 italic">Chưa có thông tin gia đình.</p>
                        )}
                    </div>
                </div>
            </div>
            
            <style>{`
                .input-field { width: 100%; border: 1px solid #e5e7eb; padding: 0.5rem; border-radius: 0.5rem; outline: none; }
                .dark .input-field { background-color: #111827; border-color: #374151; color: #f3f4f6; }
                .animate-fade-in { animation: fadeIn 0.3s ease-in; }
                @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
            `}</style>
        </div>
    );
};

export default CustomerDetail;

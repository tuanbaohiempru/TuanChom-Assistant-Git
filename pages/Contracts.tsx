import React, { useState, useMemo } from 'react';
import { Contract, Customer, Product, ContractStatus, PaymentFrequency, ProductType, ContractProduct } from '../types';
import { ConfirmModal, SearchableCustomerSelect, CurrencyInput, formatDateVN } from '../components/Shared';

interface ContractsPageProps {
    contracts: Contract[];
    customers: Customer[];
    products: Product[];
    onAdd: (c: Contract) => void;
    onUpdate: (c: Contract) => void;
    onDelete: (id: string) => void;
}

const ContractsPage: React.FC<ContractsPageProps> = ({ contracts, customers, products, onAdd, onUpdate, onDelete }) => {
    // --- UI STATES ---
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [showModal, setShowModal] = useState(false);
    const [viewContract, setViewContract] = useState<Contract | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState<{isOpen: boolean, id: string, name: string}>({ isOpen: false, id: '', name: '' });

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

    // --- HANDLERS ---
    const handleOpenAdd = () => { 
        setFormData({ ...defaultForm, effectiveDate: new Date().toISOString().split('T')[0] }); 
        setIsEditing(false); 
        setShowModal(true); 
    };
    const handleOpenEdit = (c: Contract) => { setFormData(c); setIsEditing(true); setShowModal(true); };
    const handleSave = () => { 
        const finalData = { ...formData, totalFee: calculateTotalFee(formData) }; 
        if (!finalData.contractNumber || !finalData.customerId || !finalData.mainProduct.productId) return alert("Thiếu thông tin bắt buộc!");
        isEditing ? onUpdate(finalData) : onAdd(finalData); 
        setShowModal(false); 
    };

    // --- QUICK ACTIONS ---
    const handleCopyReminder = (c: Contract) => {
        const customer = customers.find(cus => cus.id === c.customerId);
        const text = `Chào ${customer?.gender === 'Nam' ? 'anh' : 'chị'} ${customer?.fullName}, em nhắc nhẹ HĐ số ${c.contractNumber} sắp đến hạn đóng phí ngày ${formatDateVN(c.nextPaymentDate)} với số tiền ${c.totalFee.toLocaleString('vi-VN')}đ ạ.`;
        navigator.clipboard.writeText(text);
        alert("Đã sao chép nội dung nhắc phí!");
    };

    return (
        <div className="space-y-6">
            {/* 1. HEADER & METRICS */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <h1 className="text-2xl font-bold text-gray-800">Quản lý Hợp đồng</h1>
                <button onClick={handleOpenAdd} className="bg-pru-red text-white px-5 py-2.5 rounded-xl hover:bg-red-700 transition shadow-lg shadow-red-500/30 font-medium flex items-center">
                    <i className="fas fa-file-signature mr-2"></i>Tạo hợp đồng mới
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
                    <div>
                        <p className="text-gray-500 text-xs font-bold uppercase">HĐ Hiệu lực</p>
                        <p className="text-2xl font-bold text-green-600">{metrics.totalActive}</p>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-green-50 text-green-500 flex items-center justify-center"><i className="fas fa-shield-alt"></i></div>
                </div>
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
                    <div>
                        <p className="text-gray-500 text-xs font-bold uppercase">Doanh số (Năm)</p>
                        <p className="text-2xl font-bold text-blue-600">{(metrics.totalFeeYearly / 1000000).toFixed(0)} Tr</p>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center"><i className="fas fa-chart-line"></i></div>
                </div>
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
                    <div>
                        <p className="text-gray-500 text-xs font-bold uppercase">Sắp đến hạn (30 ngày)</p>
                        <p className="text-2xl font-bold text-orange-500">{metrics.upcomingDue}</p>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-orange-50 text-orange-500 flex items-center justify-center"><i className="fas fa-clock"></i></div>
                </div>
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
                    <div>
                        <p className="text-gray-500 text-xs font-bold uppercase">Cần chú ý (Lapsed)</p>
                        <p className="text-2xl font-bold text-red-500">{metrics.warningCount}</p>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-red-50 text-red-500 flex items-center justify-center"><i className="fas fa-exclamation-triangle"></i></div>
                </div>
            </div>

            {/* 2. TOOLBAR (Search & Filters) */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col lg:flex-row gap-4 items-center">
                <div className="relative w-full lg:w-1/3">
                    <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
                    <input 
                        className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-1 focus:ring-pru-red outline-none"
                        placeholder="Tìm số HĐ, tên khách hàng..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
                
                <div className="flex gap-2 w-full lg:w-auto overflow-x-auto pb-1 lg:pb-0">
                    <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none bg-white min-w-[120px]" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                        <option value="all">Mọi trạng thái</option>
                        {Object.values(ContractStatus).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    
                    <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none bg-white min-w-[120px]" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}>
                        <option value="all">Mọi tháng đóng phí</option>
                        {Array.from({length: 12}, (_, i) => i + 1).map(m => <option key={m} value={m}>Tháng {m}</option>)}
                    </select>

                    <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none bg-white min-w-[150px]" value={filterProduct} onChange={e => setFilterProduct(e.target.value)}>
                        <option value="all">Tất cả sản phẩm</option>
                        {mainProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                </div>

                <div className="ml-auto flex border bg-gray-100 rounded-lg p-1">
                    <button onClick={() => setViewMode('grid')} className={`px-3 py-1 rounded-md text-sm transition ${viewMode === 'grid' ? 'bg-white shadow-sm text-gray-800 font-bold' : 'text-gray-500'}`}><i className="fas fa-th-large"></i></button>
                    <button onClick={() => setViewMode('list')} className={`px-3 py-1 rounded-md text-sm transition ${viewMode === 'list' ? 'bg-white shadow-sm text-gray-800 font-bold' : 'text-gray-500'}`}><i className="fas fa-list"></i></button>
                </div>
            </div>

            {/* 3. CONTENT AREA */}
            {filteredContracts.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-300">
                    <i className="fas fa-file-invoice-dollar text-4xl text-gray-300 mb-3"></i>
                    <p className="text-gray-500">Không tìm thấy hợp đồng nào.</p>
                </div>
            ) : viewMode === 'grid' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {filteredContracts.map(c => {
                         const customer = customers.find(cus => cus.id === c.customerId);
                         const year = getContractYears(c.effectiveDate);
                         const isLapsed = c.status === ContractStatus.LAPSED;
                         return (
                            <div key={c.id} className={`bg-white rounded-2xl border transition hover:shadow-lg flex flex-col group ${isLapsed ? 'border-red-200 bg-red-50/30' : 'border-gray-200'}`}>
                                <div className="p-5 border-b border-gray-100 relative">
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex items-center gap-2">
                                            <div className="bg-red-50 text-pru-red w-10 h-10 rounded-lg flex items-center justify-center font-bold shadow-sm">
                                                <i className="fas fa-file-contract"></i>
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-gray-800 text-lg leading-tight">{c.contractNumber}</h3>
                                                <p className="text-xs text-gray-500">{customer?.fullName}</p>
                                            </div>
                                        </div>
                                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                                            c.status === ContractStatus.ACTIVE ? 'bg-green-100 text-green-700' :
                                            c.status === ContractStatus.LAPSED ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                                        }`}>
                                            {c.status}
                                        </span>
                                    </div>
                                    
                                    {/* Progress Bar */}
                                    <div className="mt-3">
                                        <div className="flex justify-between text-[10px] text-gray-500 mb-1">
                                            <span>Năm thứ {year}</span>
                                            <span>Đáo hạn: 99 tuổi</span>
                                        </div>
                                        <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                                            <div className="bg-pru-red h-full rounded-full" style={{width: `${Math.min(year * 5, 100)}%`}}></div>
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="p-5 flex-1 space-y-3">
                                    <div>
                                        <p className="text-xs text-gray-400 font-bold uppercase">Sản phẩm chính</p>
                                        <p className="text-sm font-medium text-gray-800 line-clamp-1" title={c.mainProduct.productName}>{c.mainProduct.productName}</p>
                                        <div className="text-xs text-gray-500 mt-0.5">Mệnh giá: <span className="font-bold text-gray-700">{c.mainProduct.sumAssured?.toLocaleString()} đ</span></div>
                                    </div>

                                    {c.riders.length > 0 && (
                                        <div>
                                            <p className="text-xs text-gray-400 font-bold uppercase mb-1">Bổ trợ ({c.riders.length})</p>
                                            <div className="flex flex-wrap gap-1">
                                                {c.riders.slice(0, 3).map((r, i) => (
                                                    <span key={i} className="text-[10px] bg-gray-100 text-gray-600 px-2 py-1 rounded border border-gray-200 truncate max-w-[100px]" title={r.productName}>
                                                        {r.productName}
                                                    </span>
                                                ))}
                                                {c.riders.length > 3 && <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-1 rounded border">+ {c.riders.length - 3}</span>}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="p-4 bg-gray-50 rounded-b-2xl border-t border-gray-100 flex items-center justify-between">
                                    <div>
                                        <p className="text-[10px] text-gray-500 uppercase font-bold">Phí đóng / {c.paymentFrequency}</p>
                                        <p className="text-sm font-bold text-gray-800">{c.totalFee.toLocaleString()} đ</p>
                                    </div>
                                    <div className="flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => handleCopyReminder(c)} className="w-8 h-8 rounded bg-white border border-gray-200 text-gray-500 hover:text-pru-red hover:border-red-200 flex items-center justify-center shadow-sm" title="Copy tin nhắc phí"><i className="fas fa-bell"></i></button>
                                        <button onClick={() => setViewContract(c)} className="w-8 h-8 rounded bg-white border border-gray-200 text-green-600 hover:border-green-200 flex items-center justify-center shadow-sm" title="Xem chi tiết"><i className="fas fa-eye"></i></button>
                                        <button onClick={() => handleOpenEdit(c)} className="w-8 h-8 rounded bg-white border border-gray-200 text-blue-500 hover:border-blue-200 flex items-center justify-center shadow-sm"><i className="fas fa-edit"></i></button>
                                    </div>
                                </div>
                            </div>
                         );
                    })}
                </div>
            ) : (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-gray-50 text-gray-700 font-semibold text-xs uppercase tracking-wider">
                                <tr>
                                    <th className="p-4 border-b">Hợp đồng</th>
                                    <th className="p-4 border-b">Khách hàng</th>
                                    <th className="p-4 border-b">Sản phẩm chính</th>
                                    <th className="p-4 border-b text-center">Tiến độ</th>
                                    <th className="p-4 border-b">Phí đóng</th>
                                    <th className="p-4 border-b">Trạng thái</th>
                                    <th className="p-4 border-b text-right">Thao tác</th>
                                </tr>
                            </thead>
                            <tbody className="text-sm text-gray-600 divide-y divide-gray-100">
                                {filteredContracts.map(c => {
                                    const customer = customers.find(cus => cus.id === c.customerId);
                                    const year = getContractYears(c.effectiveDate);
                                    return (
                                        <tr key={c.id} className="hover:bg-gray-50 transition">
                                            <td className="p-4 font-bold text-pru-red">{c.contractNumber}</td>
                                            <td className="p-4 font-medium text-gray-900">{customer?.fullName}</td>
                                            <td className="p-4">
                                                <div className="text-gray-900 font-medium">{c.mainProduct.productName}</div>
                                                <div className="text-xs text-gray-500">BH: {c.mainProduct.sumAssured?.toLocaleString()} đ</div>
                                            </td>
                                            <td className="p-4 text-center">
                                                <div className="w-24 bg-gray-200 rounded-full h-1.5 mx-auto mb-1">
                                                    <div className="bg-blue-500 h-1.5 rounded-full" style={{width: `${Math.min(year * 5, 100)}%`}}></div>
                                                </div>
                                                <span className="text-[10px] text-gray-400">Năm {year}</span>
                                            </td>
                                            <td className="p-4 font-bold">{c.totalFee.toLocaleString()} đ</td>
                                            <td className="p-4">
                                                <span className={`px-2 py-1 rounded text-xs font-bold ${
                                                    c.status === ContractStatus.ACTIVE ? 'text-green-700 bg-green-50' : 
                                                    c.status === ContractStatus.LAPSED ? 'text-red-700 bg-red-50' : 'text-yellow-700 bg-yellow-50'
                                                }`}>
                                                    {c.status}
                                                </span>
                                            </td>
                                            <td className="p-4 text-right space-x-1">
                                                <button onClick={() => handleCopyReminder(c)} className="p-2 text-gray-400 hover:text-pru-red"><i className="fas fa-bell"></i></button>
                                                <button onClick={() => setViewContract(c)} className="p-2 text-green-600 hover:bg-green-50 rounded"><i className="fas fa-eye"></i></button>
                                                <button onClick={() => handleOpenEdit(c)} className="p-2 text-blue-500 hover:bg-blue-50 rounded"><i className="fas fa-edit"></i></button>
                                                <button onClick={() => setDeleteConfirm({isOpen: true, id: c.id, name: c.contractNumber})} className="p-2 text-red-500 hover:bg-red-50 rounded"><i className="fas fa-trash"></i></button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* VIEW MODAL (Enhanced) */}
            {viewContract && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4 animate-fade-in">
                    <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
                        <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                            <div>
                                <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                                    <i className="fas fa-file-contract text-pru-red"></i> Hợp đồng #{viewContract.contractNumber}
                                </h2>
                                <p className="text-sm text-gray-500 mt-0.5">Khách hàng: <b>{customers.find(c => c.id === viewContract.customerId)?.fullName}</b></p>
                            </div>
                            <button onClick={() => setViewContract(null)} className="w-8 h-8 rounded-full bg-white border hover:bg-gray-100 flex items-center justify-center text-gray-500"><i className="fas fa-times"></i></button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-6 space-y-8">
                            {/* Vital Stats */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="p-3 bg-blue-50 rounded-xl border border-blue-100">
                                    <p className="text-[10px] uppercase text-blue-500 font-bold mb-1">Trạng thái</p>
                                    <p className="font-bold text-gray-800">{viewContract.status}</p>
                                </div>
                                <div className="p-3 bg-green-50 rounded-xl border border-green-100">
                                    <p className="text-[10px] uppercase text-green-600 font-bold mb-1">Hiệu lực từ</p>
                                    <p className="font-bold text-gray-800">{formatDateVN(viewContract.effectiveDate)}</p>
                                </div>
                                <div className="p-3 bg-purple-50 rounded-xl border border-purple-100">
                                    <p className="text-[10px] uppercase text-purple-600 font-bold mb-1">Tổng phí đóng</p>
                                    <p className="font-bold text-gray-800">{viewContract.totalFee.toLocaleString()} đ</p>
                                </div>
                                <div className="p-3 bg-orange-50 rounded-xl border border-orange-100">
                                    <p className="text-[10px] uppercase text-orange-600 font-bold mb-1">Hạn đóng phí</p>
                                    <p className="font-bold text-red-600">{formatDateVN(viewContract.nextPaymentDate)}</p>
                                </div>
                            </div>

                            {/* Detailed Info */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                                <div className="md:col-span-2 space-y-6">
                                    {/* Products */}
                                    <div>
                                        <h3 className="font-bold text-gray-800 border-b pb-2 mb-3">Quyền lợi bảo hiểm</h3>
                                        <div className="space-y-3">
                                            {/* Main */}
                                            <div className="flex justify-between items-center p-3 bg-white border border-l-4 border-l-blue-500 rounded-lg shadow-sm">
                                                <div>
                                                    <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-bold">CHÍNH</span>
                                                    <div className="font-bold text-gray-800 mt-1">{viewContract.mainProduct.productName}</div>
                                                    <div className="text-xs text-gray-500">NĐBH: {viewContract.mainProduct.insuredName}</div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-lg font-bold text-gray-800">{viewContract.mainProduct.sumAssured?.toLocaleString()} đ</div>
                                                    <div className="text-xs text-gray-400">BV Tử vong / TTTBVV</div>
                                                </div>
                                            </div>
                                            {/* Riders */}
                                            {viewContract.riders.map((r, i) => (
                                                <div key={i} className="flex justify-between items-center p-3 bg-white border border-l-4 border-l-orange-400 rounded-lg shadow-sm">
                                                    <div>
                                                        <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-bold">BỔ TRỢ</span>
                                                        <div className="font-medium text-gray-800 mt-1">{r.productName}</div>
                                                        <div className="text-xs text-gray-500">NĐBH: {r.insuredName}</div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="font-bold text-gray-700">{r.sumAssured?.toLocaleString()} đ</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    
                                    {/* Mock Cash Value Table */}
                                    <div>
                                        <h3 className="font-bold text-gray-800 border-b pb-2 mb-3">Giá trị hoàn lại (Ước tính)</h3>
                                        <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
                                            <div className="grid grid-cols-3 font-bold border-b border-gray-200 pb-2 mb-2">
                                                <div>Năm HĐ</div>
                                                <div className="text-right">Phiếu tiền mặt</div>
                                                <div className="text-right">Hoàn lại</div>
                                            </div>
                                            {[1, 5, 10, 15, 20].map(y => (
                                                <div key={y} className="grid grid-cols-3 py-1">
                                                    <div>Năm thứ {y}</div>
                                                    <div className="text-right text-gray-500">{(viewContract.totalFee * y * 0.05).toLocaleString()} đ</div>
                                                    <div className="text-right font-bold text-gray-800">{(viewContract.totalFee * y * (y > 10 ? 0.8 : 0.3)).toLocaleString()} đ</div>
                                                </div>
                                            ))}
                                            <p className="text-[10px] text-gray-400 mt-2 italic">* Số liệu minh họa giả định dựa trên mức phí đóng.</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Sidebar Info */}
                                <div className="space-y-6">
                                    <div className="bg-gray-50 p-4 rounded-xl">
                                        <h4 className="font-bold text-gray-700 mb-3 text-sm">Thông tin khác</h4>
                                        <div className="space-y-3 text-sm">
                                            <div>
                                                <span className="block text-gray-400 text-xs">Người thụ hưởng</span>
                                                <div className="font-medium">{viewContract.beneficiary || 'Chưa cập nhật'}</div>
                                            </div>
                                            <div>
                                                <span className="block text-gray-400 text-xs">Định kỳ đóng phí</span>
                                                <div className="font-medium">{viewContract.paymentFrequency}</div>
                                            </div>
                                            <div>
                                                <span className="block text-gray-400 text-xs">Phương thức thanh toán</span>
                                                <div className="font-medium">Chuyển khoản / Auto-Debit</div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <button onClick={() => handleCopyReminder(viewContract)} className="w-full py-2 bg-white border border-gray-200 rounded-lg text-gray-700 text-sm font-medium hover:bg-gray-50 hover:text-pru-red transition flex items-center justify-center">
                                            <i className="fas fa-bell mr-2"></i> Nhắc đóng phí
                                        </button>
                                        <button className="w-full py-2 bg-white border border-gray-200 rounded-lg text-gray-700 text-sm font-medium hover:bg-gray-50 hover:text-blue-600 transition flex items-center justify-center">
                                            <i className="fas fa-file-medical-alt mr-2"></i> Hỗ trợ bồi thường (Claim)
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ADD / EDIT MODAL (Updated) */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
                    <div className="bg-white rounded-xl max-w-4xl w-full h-[90vh] flex flex-col shadow-2xl overflow-hidden">
                        <div className="p-5 border-b flex justify-between items-center bg-gray-50">
                            <h3 className="text-xl font-bold text-gray-800">{isEditing ? 'Cập nhật Hợp Đồng' : 'Tạo Hợp Đồng Mới'}</h3>
                            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><i className="fas fa-times text-xl"></i></button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-6 bg-white space-y-6">
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
                            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                                <h4 className="font-bold text-blue-800 mb-3 text-sm uppercase">Sản phẩm chính</h4>
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
                                    <div><label className="label-text">Phí bảo hiểm</label><CurrencyInput className="input-field font-bold text-blue-600" value={formData.mainProduct.fee} onChange={v => setFormData({...formData, mainProduct: {...formData.mainProduct, fee: v}})} /></div>
                                </div>
                            </div>

                            {/* RIDERS */}
                            <div className="bg-orange-50 p-4 rounded-xl border border-orange-100">
                                <div className="flex justify-between items-center mb-3">
                                    <h4 className="font-bold text-orange-800 text-sm uppercase">Sản phẩm bổ trợ</h4>
                                    <button onClick={() => setFormData({...formData, riders: [...formData.riders, {productId: '', productName: '', insuredName: '', fee: 0, sumAssured: 0}]})} className="text-xs bg-white border border-orange-200 text-orange-600 px-3 py-1 rounded font-bold hover:bg-orange-100">+ Thêm</button>
                                </div>
                                {formData.riders.map((rider, idx) => (
                                    <div key={idx} className="relative bg-white p-3 rounded-lg border border-orange-200 mb-3 grid grid-cols-1 md:grid-cols-2 gap-3">
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

                        <div className="p-4 border-t bg-gray-50 flex justify-end gap-3">
                            <button onClick={() => setShowModal(false)} className="px-5 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-lg">Hủy</button>
                            <button onClick={handleSave} className="px-5 py-2 bg-pru-red text-white font-bold rounded-lg hover:bg-red-700 shadow-md">Lưu Hợp Đồng</button>
                        </div>
                    </div>
                </div>
            )}

            <ConfirmModal isOpen={deleteConfirm.isOpen} title="Xóa hợp đồng?" message={`Bạn có chắc muốn xóa HĐ ${deleteConfirm.name}?`} onConfirm={() => onDelete(deleteConfirm.id)} onClose={() => setDeleteConfirm({isOpen: false, id: '', name: ''})} />

            <style>{`
                .input-field { width: 100%; border: 1px solid #e5e7eb; padding: 0.625rem; border-radius: 0.5rem; outline: none; font-size: 0.875rem; transition: all; }
                .input-field:focus { border-color: #ed1b2e; ring: 1px solid #ed1b2e; }
                .label-text { display: block; font-size: 0.75rem; font-weight: 700; color: #6b7280; margin-bottom: 0.25rem; }
            `}</style>
        </div>
    );
};

export default ContractsPage;
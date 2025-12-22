import React, { useState, useMemo, useEffect } from 'react';
import { Appointment, Customer, AppointmentStatus, AppointmentType, Contract, AppointmentResult, ContractStatus } from '../types';
import { ConfirmModal, SearchableCustomerSelect, formatDateVN } from '../components/Shared';

interface AppointmentsPageProps {
    appointments: Appointment[];
    customers: Customer[];
    contracts: Contract[]; // Added contracts for automation
    onAdd: (a: Appointment) => void;
    onUpdate: (a: Appointment) => void;
    onDelete: (id: string) => void;
}

const AppointmentsPage: React.FC<AppointmentsPageProps> = ({ appointments, customers, contracts, onAdd, onUpdate, onDelete }) => {
    // --- STATE ---
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
    
    // Modals
    const [showModal, setShowModal] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState<{isOpen: boolean, id: string}>({ isOpen: false, id: '' });
    
    // Outcome Modal
    const [outcomeModal, setOutcomeModal] = useState<{isOpen: boolean, appointment: Appointment | null}>({isOpen: false, appointment: null});
    const [outcomeData, setOutcomeData] = useState<{result: AppointmentResult, note: string}>({result: AppointmentResult.DONE, note: ''});

    // Form Data
    const defaultForm: Appointment = {
        id: '', customerId: '', customerName: '', date: new Date().toISOString().split('T')[0], 
        time: '09:00', type: AppointmentType.CONSULTATION, status: AppointmentStatus.UPCOMING, note: ''
    };
    const [formData, setFormData] = useState<Appointment>(defaultForm);

    // --- AUTOMATION LOGIC ---
    const handleGenerateTasks = () => {
        let count = 0;
        const today = new Date();
        
        // 1. Birthdays (Next 7 days)
        customers.forEach(c => {
            const dob = new Date(c.dob);
            const nextBday = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());
            if (nextBday < today) nextBday.setFullYear(today.getFullYear() + 1);
            
            const diffTime = nextBday.getTime() - today.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays >= 0 && diffDays <= 7) {
                const bdayStr = nextBday.toISOString().split('T')[0];
                // Check duplicate
                const exists = appointments.some(a => a.customerId === c.id && a.type === AppointmentType.BIRTHDAY && a.date === bdayStr);
                if (!exists) {
                    onAdd({
                        id: '', customerId: c.id, customerName: c.fullName, date: bdayStr,
                        time: '09:00', type: AppointmentType.BIRTHDAY, status: AppointmentStatus.UPCOMING,
                        note: `Chúc mừng sinh nhật ${c.fullName}`
                    });
                    count++;
                }
            }
        });

        // 2. Payments (Next 15 days)
        contracts.forEach(c => {
            if (c.status !== ContractStatus.ACTIVE) return;
            const dueDate = new Date(c.nextPaymentDate);
            const diffTime = dueDate.getTime() - today.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays >= 0 && diffDays <= 15) {
                const dateStr = dueDate.toISOString().split('T')[0];
                const exists = appointments.some(a => a.customerId === c.customerId && a.type === AppointmentType.FEE_REMINDER && a.date === dateStr);
                if (!exists) {
                     const customer = customers.find(cus => cus.id === c.customerId);
                     onAdd({
                        id: '', customerId: c.customerId, customerName: customer?.fullName || 'Khách hàng',
                        date: dateStr, time: '08:30', type: AppointmentType.FEE_REMINDER, status: AppointmentStatus.UPCOMING,
                        note: `Nhắc đóng phí HĐ ${c.contractNumber}: ${c.totalFee.toLocaleString()}đ`
                    });
                    count++;
                }
            }
        });

        alert(count > 0 ? `Đã tạo tự động ${count} công việc!` : "Không có công việc mới nào cần tạo.");
    };

    // --- CALENDAR LOGIC ---
    const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
    const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay(); // 0 = Sunday
    // Adjust for Monday start (Vietnamese style): 0=Sun -> 6, 1=Mon -> 0
    const startDayIndex = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;

    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
    const blanks = Array.from({ length: startDayIndex }, (_, i) => i);

    const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

    // Filter appointments for selected date
    const dailyAppointments = useMemo(() => {
        return appointments.filter(a => a.date === selectedDate).sort((a,b) => a.time.localeCompare(b.time));
    }, [appointments, selectedDate]);

    // --- HANDLERS ---
    const handleOpenAdd = (date?: string) => { 
        setFormData({...defaultForm, date: date || selectedDate}); 
        setIsEditing(false); 
        setShowModal(true); 
    };
    
    const handleOpenEdit = (a: Appointment) => { setFormData(a); setIsEditing(true); setShowModal(true); };
    
    const handleSave = () => {
        if(!formData.customerId) return alert("Vui lòng chọn khách hàng");
        isEditing ? onUpdate(formData) : onAdd(formData);
        setShowModal(false);
    };

    const handleComplete = (a: Appointment) => {
        setOutcomeData({result: AppointmentResult.SUCCESS, note: ''});
        setOutcomeModal({isOpen: true, appointment: a});
    };

    const submitOutcome = () => {
        if (outcomeModal.appointment) {
            onUpdate({
                ...outcomeModal.appointment,
                status: AppointmentStatus.COMPLETED,
                outcome: outcomeData.result,
                outcomeNote: outcomeData.note
            });
            setOutcomeModal({isOpen: false, appointment: null});
        }
    };

    // Helpers for styles
    const getTypeColor = (type: AppointmentType) => {
        switch(type) {
            case AppointmentType.CONSULTATION: return 'bg-purple-100 text-purple-700 border-purple-200';
            case AppointmentType.FEE_REMINDER: return 'bg-orange-100 text-orange-700 border-orange-200';
            case AppointmentType.BIRTHDAY: return 'bg-pink-100 text-pink-700 border-pink-200';
            case AppointmentType.CARE_CALL: return 'bg-green-100 text-green-700 border-green-200';
            default: return 'bg-gray-100 text-gray-700 border-gray-200';
        }
    };

    const getTypeIcon = (type: AppointmentType) => {
        switch(type) {
            case AppointmentType.CONSULTATION: return 'fa-comments';
            case AppointmentType.FEE_REMINDER: return 'fa-file-invoice-dollar';
            case AppointmentType.BIRTHDAY: return 'fa-birthday-cake';
            case AppointmentType.CARE_CALL: return 'fa-phone-alt';
            case AppointmentType.PAPERWORK: return 'fa-file-signature';
            default: return 'fa-calendar-check';
        }
    };

    return (
        <div className="space-y-6 h-[calc(100vh-theme(spacing.24))] flex flex-col">
            {/* 1. Header & Controls */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex-shrink-0">
                <div className="flex items-center gap-4">
                    <button onClick={prevMonth} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition"><i className="fas fa-chevron-left text-gray-600"></i></button>
                    <h2 className="text-lg font-bold text-gray-800 capitalize w-40 text-center">Tháng {currentDate.getMonth() + 1}/{currentDate.getFullYear()}</h2>
                    <button onClick={nextMonth} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition"><i className="fas fa-chevron-right text-gray-600"></i></button>
                    <button onClick={() => {setCurrentDate(new Date()); setSelectedDate(new Date().toISOString().split('T')[0])}} className="text-xs font-bold text-blue-600 hover:underline">Hôm nay</button>
                </div>

                <div className="flex gap-2">
                    <button onClick={handleGenerateTasks} className="bg-yellow-100 text-yellow-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-yellow-200 transition flex items-center shadow-sm">
                        <i className="fas fa-magic mr-2"></i>Tự động tạo việc
                    </button>
                    <button onClick={() => handleOpenAdd()} className="bg-pru-red text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-red-700 transition flex items-center shadow-md">
                        <i className="fas fa-plus mr-2"></i>Thêm mới
                    </button>
                </div>
            </div>

            {/* 2. Main Layout (Calendar + Sidebar) */}
            <div className="flex flex-1 gap-6 overflow-hidden">
                {/* CALENDAR VIEW */}
                <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-col overflow-y-auto">
                    {/* Weekdays Header */}
                    <div className="grid grid-cols-7 mb-2 text-center">
                        {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map(d => (
                            <div key={d} className="text-gray-400 text-xs font-bold uppercase py-2">{d}</div>
                        ))}
                    </div>
                    {/* Days Grid */}
                    <div className="grid grid-cols-7 grid-rows-5 gap-2 flex-1">
                        {blanks.map(x => <div key={`blank-${x}`} className="bg-gray-50/50 rounded-lg"></div>)}
                        {days.map(d => {
                            const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                            const isSelected = selectedDate === dateStr;
                            const isToday = new Date().toISOString().split('T')[0] === dateStr;
                            const dayApps = appointments.filter(a => a.date === dateStr);
                            
                            return (
                                <div 
                                    key={d} 
                                    onClick={() => setSelectedDate(dateStr)}
                                    className={`relative rounded-lg p-2 border transition cursor-pointer flex flex-col justify-between hover:border-red-200 min-h-[80px] ${isSelected ? 'bg-red-50 border-pru-red ring-1 ring-pru-red' : 'bg-white border-gray-100'}`}
                                >
                                    <div className="flex justify-between items-start">
                                        <span className={`text-sm font-medium w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-pru-red text-white' : 'text-gray-700'}`}>{d}</span>
                                        {dayApps.length > 0 && <span className="text-[10px] bg-gray-200 text-gray-600 px-1.5 rounded-full font-bold">{dayApps.length}</span>}
                                    </div>
                                    
                                    {/* Dots Indicators */}
                                    <div className="flex flex-wrap gap-1 mt-1 content-end">
                                        {dayApps.slice(0, 4).map((a, i) => {
                                            let dotColor = 'bg-gray-400';
                                            if (a.type === AppointmentType.CONSULTATION) dotColor = 'bg-purple-500';
                                            else if (a.type === AppointmentType.BIRTHDAY) dotColor = 'bg-pink-500';
                                            else if (a.type === AppointmentType.FEE_REMINDER) dotColor = 'bg-orange-500';
                                            return <div key={i} className={`w-1.5 h-1.5 rounded-full ${dotColor}`} title={a.type}></div>
                                        })}
                                        {dayApps.length > 4 && <span className="text-[8px] text-gray-400 leading-none">+</span>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* TASK SIDEBAR */}
                <div className="w-96 bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col overflow-hidden">
                    <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                        <div>
                            <h3 className="font-bold text-gray-800 text-lg">Lịch trình</h3>
                            <p className="text-xs text-gray-500 capitalize">{formatDateVN(selectedDate)}</p>
                        </div>
                        <button onClick={() => handleOpenAdd(selectedDate)} className="text-pru-red hover:bg-red-100 p-2 rounded transition"><i className="fas fa-plus"></i></button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        {dailyAppointments.length === 0 ? (
                            <div className="text-center py-10 text-gray-400">
                                <i className="fas fa-coffee text-3xl mb-2 opacity-50"></i>
                                <p className="text-sm">Trống lịch</p>
                            </div>
                        ) : dailyAppointments.map(a => (
                            <div key={a.id} className={`p-3 rounded-xl border transition group hover:shadow-md ${a.status === AppointmentStatus.COMPLETED ? 'bg-gray-50 border-gray-200 opacity-70' : 'bg-white border-gray-200'}`}>
                                <div className="flex items-start gap-3">
                                    {/* Checkbox / Icon */}
                                    <button 
                                        onClick={() => a.status !== AppointmentStatus.COMPLETED && handleComplete(a)}
                                        className={`w-6 h-6 rounded-full border flex items-center justify-center mt-1 transition ${
                                            a.status === AppointmentStatus.COMPLETED 
                                            ? 'bg-green-500 border-green-500 text-white cursor-default' 
                                            : 'border-gray-300 hover:border-green-500 text-transparent hover:text-green-500'
                                        }`}
                                    >
                                        <i className="fas fa-check text-xs"></i>
                                    </button>

                                    <div className="flex-1">
                                        <div className="flex justify-between items-start">
                                            <span className={`text-xs font-bold px-2 py-0.5 rounded border ${getTypeColor(a.type)}`}>
                                                <i className={`fas ${getTypeIcon(a.type)} mr-1`}></i>{a.type}
                                            </span>
                                            <span className="text-sm font-bold text-gray-800">{a.time}</span>
                                        </div>
                                        <h4 className={`font-bold text-gray-800 mt-1 ${a.status === AppointmentStatus.COMPLETED ? 'line-through text-gray-500' : ''}`}>
                                            {a.customerName}
                                        </h4>
                                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{a.note}</p>
                                        
                                        {/* Result Display if Completed */}
                                        {a.status === AppointmentStatus.COMPLETED && a.outcome && (
                                            <div className="mt-2 text-xs bg-gray-100 p-1.5 rounded text-gray-600 flex items-start">
                                                <i className="fas fa-clipboard-check mt-0.5 mr-1.5 text-green-600"></i>
                                                <span>{a.outcome} {a.outcomeNote && `- ${a.outcomeNote}`}</span>
                                            </div>
                                        )}
                                    </div>
                                    
                                    {/* Actions */}
                                    <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition">
                                        <button onClick={() => handleOpenEdit(a)} className="text-blue-500 hover:bg-blue-50 w-6 h-6 rounded flex items-center justify-center"><i className="fas fa-pen text-xs"></i></button>
                                        <button onClick={() => setDeleteConfirm({isOpen: true, id: a.id})} className="text-red-500 hover:bg-red-50 w-6 h-6 rounded flex items-center justify-center"><i className="fas fa-trash text-xs"></i></button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* CREATE / EDIT MODAL */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
                    <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl">
                        <h3 className="text-xl font-bold mb-4 border-b pb-2">{isEditing ? 'Cập nhật Công việc' : 'Thêm Công việc Mới'}</h3>
                        <div className="space-y-4">
                            <SearchableCustomerSelect customers={customers} value={formData.customerName} onChange={c => setFormData({...formData, customerId: c.id, customerName: c.fullName})} label="Khách hàng" />
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="label-text">Ngày</label><input type="date" className="input-field" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} /></div>
                                <div><label className="label-text">Giờ</label><input type="time" className="input-field" value={formData.time} onChange={e => setFormData({...formData, time: e.target.value})} /></div>
                            </div>
                            <div>
                                <label className="label-text">Loại công việc</label>
                                <select className="input-field" value={formData.type} onChange={(e: any) => setFormData({...formData, type: e.target.value})}>
                                    {Object.values(AppointmentType).map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                            <div><label className="label-text">Ghi chú chi tiết</label><textarea rows={3} className="input-field" value={formData.note} onChange={e => setFormData({...formData, note: e.target.value})} placeholder="VD: Mang theo bảng minh họa..." /></div>
                        </div>
                        <div className="flex justify-end gap-3 mt-6 border-t pt-4">
                            <button onClick={() => setShowModal(false)} className="px-5 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-lg">Hủy</button>
                            <button onClick={handleSave} className="px-5 py-2 bg-pru-red text-white rounded-lg font-bold hover:bg-red-700 shadow-md">Lưu</button>
                        </div>
                    </div>
                </div>
            )}

            {/* OUTCOME MODAL */}
            {outcomeModal.isOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4 animate-fade-in">
                    <div className="bg-white rounded-xl max-w-sm w-full p-6 shadow-2xl">
                        <div className="text-center mb-4">
                            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-2 text-green-600 text-xl"><i className="fas fa-check"></i></div>
                            <h3 className="text-lg font-bold text-gray-800">Hoàn thành công việc</h3>
                            <p className="text-sm text-gray-500">Kết quả cuộc gặp/công việc này thế nào?</p>
                        </div>
                        
                        <div className="space-y-3">
                            <div>
                                <label className="label-text">Kết quả</label>
                                <select className="input-field" value={outcomeData.result} onChange={(e: any) => setOutcomeData({...outcomeData, result: e.target.value})}>
                                    {Object.values(AppointmentResult).map(r => <option key={r} value={r}>{r}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="label-text">Ghi chú kết quả</label>
                                <textarea rows={2} className="input-field" value={outcomeData.note} onChange={e => setOutcomeData({...outcomeData, note: e.target.value})} placeholder="VD: Khách hẹn tuần sau ký..." />
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 mt-6">
                             <button onClick={() => setOutcomeModal({isOpen: false, appointment: null})} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Hủy</button>
                             <button onClick={submitOutcome} className="px-4 py-2 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 shadow-md">Xác nhận</button>
                        </div>
                    </div>
                </div>
            )}

            <ConfirmModal isOpen={deleteConfirm.isOpen} title="Xóa lịch hẹn?" message="Bạn có chắc muốn xóa lịch hẹn này?" onConfirm={() => onDelete(deleteConfirm.id)} onClose={() => setDeleteConfirm({isOpen: false, id: ''})} />
            
            <style>{`
                .input-field { width: 100%; border: 1px solid #e5e7eb; padding: 0.5rem; border-radius: 0.5rem; outline: none; font-size: 0.875rem; transition: all; }
                .input-field:focus { border-color: #ed1b2e; ring: 1px solid #ed1b2e; }
                .label-text { display: block; font-size: 0.75rem; font-weight: 700; color: #6b7280; margin-bottom: 0.25rem; }
            `}</style>
        </div>
    );
};

export default AppointmentsPage;
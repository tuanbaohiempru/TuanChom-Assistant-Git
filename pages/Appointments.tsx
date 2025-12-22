import React, { useState } from 'react';
import { Appointment, Customer, AppointmentStatus, AppointmentType } from '../types';
import { ConfirmModal, SearchableCustomerSelect, formatDateVN } from '../components/Shared';

interface AppointmentsPageProps {
    appointments: Appointment[];
    customers: Customer[];
    onAdd: (a: Appointment) => void;
    onUpdate: (a: Appointment) => void;
    onDelete: (id: string) => void;
}

const AppointmentsPage: React.FC<AppointmentsPageProps> = ({ appointments, customers, onAdd, onUpdate, onDelete }) => {
    const [showModal, setShowModal] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState<{isOpen: boolean, id: string}>({ isOpen: false, id: '' });
    
    const defaultForm: Appointment = {
        id: '', customerId: '', customerName: '', date: new Date().toISOString().split('T')[0], 
        time: '09:00', type: AppointmentType.CONSULTATION, status: AppointmentStatus.UPCOMING, note: ''
    };
    const [formData, setFormData] = useState<Appointment>(defaultForm);

    const handleOpenAdd = () => { setFormData(defaultForm); setIsEditing(false); setShowModal(true); };
    const handleOpenEdit = (a: Appointment) => { setFormData(a); setIsEditing(true); setShowModal(true); };
    
    const handleSave = () => {
        if(!formData.customerId) return alert("Vui lòng chọn khách hàng");
        isEditing ? onUpdate(formData) : onAdd(formData);
        setShowModal(false);
    };

    // Sort by date (newest first)
    const sortedAppointments = [...appointments].sort((a, b) => new Date(b.date + 'T' + b.time).getTime() - new Date(a.date + 'T' + a.time).getTime());

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-gray-800">Lịch hẹn & Công việc</h1>
                <button onClick={handleOpenAdd} className="bg-pru-red text-white px-4 py-2 rounded-lg hover:bg-red-700 transition shadow-md">
                    <i className="fas fa-calendar-plus mr-2"></i>Thêm lịch hẹn
                </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-gray-50 text-gray-700 text-xs uppercase font-bold">
                            <tr>
                                <th className="p-4 border-b">Thời gian</th>
                                <th className="p-4 border-b">Khách hàng</th>
                                <th className="p-4 border-b">Loại hình</th>
                                <th className="p-4 border-b">Nội dung</th>
                                <th className="p-4 border-b">Trạng thái</th>
                                <th className="p-4 border-b text-right">Thao tác</th>
                            </tr>
                        </thead>
                        <tbody className="text-sm text-gray-600 divide-y divide-gray-100">
                            {sortedAppointments.length === 0 ? (
                                <tr><td colSpan={6} className="p-6 text-center text-gray-400">Chưa có lịch hẹn nào.</td></tr>
                            ) : sortedAppointments.map(a => (
                                <tr key={a.id} className="hover:bg-gray-50">
                                    <td className="p-4 font-bold text-gray-800">
                                        <div className="text-lg">{a.time}</div>
                                        <div className="text-xs text-gray-500 font-normal">{formatDateVN(a.date)}</div>
                                    </td>
                                    <td className="p-4 font-medium">{a.customerName}</td>
                                    <td className="p-4"><span className="px-2 py-1 rounded bg-blue-50 text-blue-700 text-xs font-bold border border-blue-100">{a.type}</span></td>
                                    <td className="p-4 max-w-xs truncate" title={a.note}>{a.note}</td>
                                    <td className="p-4">
                                        <span className={`px-2 py-1 rounded text-xs font-bold ${
                                            a.status === AppointmentStatus.UPCOMING ? 'text-green-600 bg-green-50' : 
                                            a.status === AppointmentStatus.CANCELLED ? 'text-red-500 bg-red-50 line-through' : 'text-gray-500 bg-gray-100'
                                        }`}>{a.status}</span>
                                    </td>
                                    <td className="p-4 text-right">
                                        <button onClick={() => handleOpenEdit(a)} className="text-blue-500 hover:bg-blue-50 p-2 rounded mr-1"><i className="fas fa-edit"></i></button>
                                        <button onClick={() => setDeleteConfirm({isOpen: true, id: a.id})} className="text-red-500 hover:bg-red-50 p-2 rounded"><i className="fas fa-trash"></i></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
                    <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl">
                        <h3 className="text-xl font-bold mb-4 border-b pb-2">{isEditing ? 'Cập nhật Lịch Hẹn' : 'Thêm Lịch Hẹn'}</h3>
                        <div className="space-y-4">
                            <SearchableCustomerSelect 
                                customers={customers} 
                                value={formData.customerName} 
                                onChange={c => setFormData({...formData, customerId: c.id, customerName: c.fullName})} 
                                label="Khách hàng"
                            />
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="block text-sm font-bold text-gray-500 mb-1">Ngày</label><input type="date" className="w-full border p-2 rounded" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} /></div>
                                <div><label className="block text-sm font-bold text-gray-500 mb-1">Giờ</label><input type="time" className="w-full border p-2 rounded" value={formData.time} onChange={e => setFormData({...formData, time: e.target.value})} /></div>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-500 mb-1">Loại công việc</label>
                                <select className="w-full border p-2 rounded" value={formData.type} onChange={(e: any) => setFormData({...formData, type: e.target.value})}>
                                    {Object.values(AppointmentType).map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-500 mb-1">Trạng thái</label>
                                <select className="w-full border p-2 rounded" value={formData.status} onChange={(e: any) => setFormData({...formData, status: e.target.value})}>
                                    {Object.values(AppointmentStatus).map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                            <div><label className="block text-sm font-bold text-gray-500 mb-1">Ghi chú</label><textarea rows={3} className="w-full border p-2 rounded" value={formData.note} onChange={e => setFormData({...formData, note: e.target.value})} /></div>
                        </div>
                        <div className="flex justify-end gap-3 mt-6 border-t pt-4">
                            <button onClick={() => setShowModal(false)} className="px-5 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-lg">Hủy</button>
                            <button onClick={handleSave} className="px-5 py-2 bg-pru-red text-white rounded-lg font-bold hover:bg-red-700 shadow-md">Lưu</button>
                        </div>
                    </div>
                </div>
            )}
            <ConfirmModal isOpen={deleteConfirm.isOpen} title="Xóa lịch hẹn?" message="Bạn có chắc muốn xóa lịch hẹn này?" onConfirm={() => onDelete(deleteConfirm.id)} onClose={() => setDeleteConfirm({isOpen: false, id: ''})} />
        </div>
    );
};

export default AppointmentsPage;
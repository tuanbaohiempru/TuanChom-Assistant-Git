import React, { useState, useEffect } from 'react';
import { AgentProfile } from '../types';

interface SettingsPageProps {
    profile: AgentProfile | null;
    onSave: (p: AgentProfile) => void;
}

const SettingsPage: React.FC<SettingsPageProps> = ({ profile, onSave }) => {
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

export default SettingsPage;
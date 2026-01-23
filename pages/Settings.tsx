
import React, { useState, useEffect } from 'react';
import { AgentProfile, SalesTargets } from '../types';
import { uploadFile } from '../services/storage';
import { CurrencyInput } from '../components/Shared';
import { clearFirebaseConfig } from '../services/firebaseConfig';

interface SettingsPageProps {
    profile: AgentProfile | null;
    onSave: (p: AgentProfile) => void;
    isDarkMode?: boolean;
    toggleDarkMode?: () => void;
}

const SettingsPage: React.FC<SettingsPageProps> = ({ profile, onSave, isDarkMode, toggleDarkMode }) => {
    const [formData, setFormData] = useState<AgentProfile>({
        fullName: '',
        age: 30,
        address: '',
        phone: '',
        email: '',
        zalo: '',
        facebook: '',
        avatarUrl: '',
        office: '',
        agentCode: '',
        title: '',
        bio: '',
        targets: { weekly: 0, monthly: 0, quarterly: 0, yearly: 0 } // Initialize targets
    });
    const [isUploading, setIsUploading] = useState(false);

    useEffect(() => {
        if (profile) {
            setFormData(prev => ({
                ...prev, 
                ...profile,
                targets: profile.targets || { weekly: 0, monthly: 0, quarterly: 0, yearly: 0 }
            }));
        }
    }, [profile]);

    const handleSubmit = () => {
        onSave(formData);
        alert("Đã lưu thông tin cài đặt!");
    };

    const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        
        setIsUploading(true);
        try {
            const url = await uploadFile(file, 'avatars');
            setFormData(prev => ({ ...prev, avatarUrl: url }));
        } catch (error) {
            alert("Lỗi upload ảnh");
        } finally {
            setIsUploading(false);
        }
    };

    const handleResetConfig = () => {
        if(window.confirm('Bạn có chắc muốn xóa cấu hình kết nối Firebase & API Key? Ứng dụng sẽ tải lại và yêu cầu nhập thông tin mới.')) {
            clearFirebaseConfig();
        }
    }

    return (
        <div className="space-y-6 max-w-4xl mx-auto pb-10">
             <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Cài đặt hệ thống</h1>
             
             <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Left Col: Avatar & Interface Settings */}
                <div className="space-y-6">
                    <div className="bg-white dark:bg-pru-card p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col items-center transition-colors">
                        <div className="relative group w-32 h-32 mb-4">
                            {formData.avatarUrl ? (
                                <img src={formData.avatarUrl} alt="Avatar" className="w-full h-full rounded-full object-cover border-4 border-white dark:border-gray-800 shadow-md" />
                            ) : (
                                <div className="w-full h-full rounded-full bg-red-50 dark:bg-red-900/10 border-2 border-red-100 dark:border-red-900/30 flex items-center justify-center text-pru-red text-4xl">
                                    <i className="fas fa-user-tie"></i>
                                </div>
                            )}
                            <label className="absolute bottom-0 right-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center cursor-pointer hover:bg-blue-700 shadow-md">
                                {isUploading ? <i className="fas fa-spinner fa-spin text-xs"></i> : <i className="fas fa-camera text-xs"></i>}
                                <input type="file" className="hidden" accept="image/*" onChange={handleAvatarUpload} disabled={isUploading} />
                            </label>
                        </div>
                        <h3 className="font-bold text-lg text-gray-800 dark:text-gray-100 text-center">{formData.fullName || 'Chưa có tên'}</h3>
                        <p className="text-sm text-pru-red font-medium mb-1">{formData.title || 'Tư vấn viên'}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{formData.agentCode || 'Mã số: --'}</p>
                    </div>

                    {/* INTERFACE SETTINGS */}
                    <div className="bg-white dark:bg-pru-card p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 transition-colors">
                        <h3 className="font-bold text-sm text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-4">Giao diện</h3>
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isDarkMode ? 'bg-indigo-900/20 text-indigo-400' : 'bg-yellow-50 text-yellow-600'}`}>
                                    <i className={`fas ${isDarkMode ? 'fa-moon' : 'fa-sun'}`}></i>
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-gray-800 dark:text-gray-100">Chế độ tối</p>
                                    <p className="text-[10px] text-gray-400">Dễ nhìn hơn vào ban đêm</p>
                                </div>
                            </div>
                            <button 
                                onClick={toggleDarkMode}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${isDarkMode ? 'bg-pru-red' : 'bg-gray-200'}`}
                            >
                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isDarkMode ? 'translate-x-6' : 'translate-x-1'}`} />
                            </button>
                        </div>

                        {/* Reset Config Button */}
                        <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
                            <button 
                                onClick={handleResetConfig}
                                className="w-full py-2 text-xs font-bold text-red-500 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg flex items-center justify-center transition"
                            >
                                <i className="fas fa-plug mr-2"></i> Đặt lại kết nối
                            </button>
                        </div>
                    </div>
                </div>

                {/* Right Col: Forms */}
                <div className="lg:col-span-2 space-y-6">
                    {/* 2. PROFILE INFO */}
                    <div className="bg-white dark:bg-pru-card p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 transition-colors">
                        <h3 className="font-bold text-lg text-gray-800 dark:text-gray-100 border-b border-gray-100 dark:border-gray-800 pb-2 mb-4">Thông tin cá nhân</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="label-style">Họ và tên</label>
                                <input className="input-style" value={formData.fullName} onChange={e => setFormData({...formData, fullName: e.target.value})} placeholder="Nguyễn Văn A" />
                            </div>
                            <div>
                                <label className="label-style">Tuổi</label>
                                <input type="number" className="input-style" value={formData.age} onChange={e => setFormData({...formData, age: Number(e.target.value)})} />
                            </div>
                            <div>
                                <label className="label-style">Mã số nhân viên</label>
                                <input className="input-style" value={formData.agentCode} onChange={e => setFormData({...formData, agentCode: e.target.value})} placeholder="600xxxxx" />
                            </div>
                            <div>
                                <label className="label-style">Danh hiệu / Chức danh</label>
                                <input className="input-style" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} placeholder="MDRT, Trưởng nhóm kinh doanh..." />
                            </div>
                            <div className="md:col-span-2">
                                <label className="label-style">Văn phòng / Khu vực</label>
                                <input className="input-style" value={formData.office} onChange={e => setFormData({...formData, office: e.target.value})} placeholder="Prudential Plaza, Quận 8..." />
                            </div>
                            <div className="md:col-span-2">
                                 <label className="label-style">Giới thiệu ngắn (Phong cách)</label>
                                 <textarea rows={3} className="input-style" value={formData.bio} onChange={e => setFormData({...formData, bio: e.target.value})} placeholder="Ví dụ: Tôi là người tư vấn tận tâm, luôn đặt lợi ích khách hàng lên đầu..." />
                            </div>
                        </div>

                        <h3 className="font-bold text-lg text-gray-800 dark:text-gray-100 border-b border-gray-100 dark:border-gray-800 pb-2 mb-4 pt-4">Liên hệ & Mạng xã hội</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="label-style">Số điện thoại <span className="text-red-500">*</span></label>
                                <input className="input-style" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
                            </div>
                            <div>
                                <label className="label-style">Email</label>
                                <input className="input-style" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
                            </div>
                            <div>
                                <label className="label-style">Số Zalo</label>
                                <input className="input-style" value={formData.zalo} onChange={e => setFormData({...formData, zalo: e.target.value})} placeholder="09xxxx (để tạo link Zalo)" />
                            </div>
                            <div>
                                <label className="label-style">Link Facebook</label>
                                <input className="input-style" value={formData.facebook} onChange={e => setFormData({...formData, facebook: e.target.value})} placeholder="https://facebook.com/..." />
                            </div>
                        </div>

                        <div className="pt-4 border-t border-gray-100 dark:border-gray-800 flex justify-end">
                            <button onClick={handleSubmit} className="bg-pru-red text-white px-6 py-2.5 rounded-lg hover:bg-red-700 transition shadow-md font-bold">
                                <i className="fas fa-save mr-2"></i>Lưu thay đổi
                            </button>
                        </div>
                    </div>
                </div>
             </div>
             
             <style>{`
                .input-style {
                    width: 100%;
                    border: 1px solid #e5e7eb;
                    padding: 0.625rem 0.875rem;
                    border-radius: 0.75rem;
                    outline: none;
                    font-size: 0.875rem;
                    background-color: transparent;
                    transition: all 0.2s;
                    color: inherit;
                }
                .dark .input-style {
                    border-color: #374151;
                    background-color: #121212;
                    color: #f3f4f6;
                }
                .input-style:focus {
                    border-color: #ed1b2e;
                    ring: 2px solid #ed1b2e20;
                }
                .label-style {
                    display: block;
                    font-size: 0.75rem;
                    font-weight: 700;
                    color: #6b7280;
                    margin-bottom: 0.375rem;
                    text-transform: uppercase;
                    letter-spacing: 0.025em;
                }
                .dark .label-style {
                    color: #9ca3af;
                }
             `}</style>
        </div>
    );
};

export default SettingsPage;


import React, { useRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { AgentProfile } from '../types';

interface BusinessCardProps {
    profile: AgentProfile | null;
}

const BusinessCard: React.FC<BusinessCardProps> = ({ profile }) => {
    const cardRef = useRef<HTMLDivElement>(null);

    if (!profile) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-center p-6">
                <i className="fas fa-user-slash text-4xl text-gray-300 mb-3"></i>
                <p className="text-gray-500">Bạn chưa cập nhật hồ sơ tư vấn viên.</p>
                <a href="#/settings" className="text-blue-500 font-bold mt-2">Đi đến cài đặt</a>
            </div>
        );
    }

    // Generate current page URL (or a placeholder if running locally without domain)
    const cardUrl = window.location.href;

    // --- Generate vCard Logic ---
    const downloadVCard = () => {
        // Construct vCard data
        const vcardData = `BEGIN:VCARD
VERSION:3.0
FN:${profile.fullName}
N:${profile.fullName.split(' ').pop()};${profile.fullName.split(' ').slice(0, -1).join(' ')}
ORG:Prudential Vietnam
TITLE:${profile.title}
TEL;TYPE=CELL:${profile.phone}
EMAIL:${profile.email || ''}
URL:${profile.facebook || ''}
NOTE:Mã số đại lý: ${profile.agentCode} - ${profile.office}
END:VCARD`;

        const blob = new Blob([vcardData], { type: 'text/vcard;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `${profile.fullName.replace(/\s+/g, '_')}_Pru.vcf`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="min-h-screen bg-gray-100 flex flex-col items-center py-8">
            <h1 className="text-2xl font-bold text-gray-800 mb-6 flex items-center">
                <i className="fas fa-id-card text-pru-red mr-2"></i> Danh thiếp điện tử
            </h1>

            {/* CARD CONTAINER */}
            <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden border border-gray-200 relative">
                
                {/* Header Background */}
                <div className="h-32 bg-gradient-to-r from-pru-red to-red-700 relative">
                    <div className="absolute top-4 right-4 text-white/20 text-4xl">
                        <i className="fas fa-certificate"></i>
                    </div>
                    {/* Logo (Simulated) */}
                    <div className="absolute top-4 left-4 text-white font-bold tracking-widest text-sm uppercase">
                        Prudential
                    </div>
                </div>

                {/* Content */}
                <div className="px-6 pb-8 relative">
                    {/* Avatar */}
                    <div className="relative -mt-16 mb-4 flex justify-center">
                        <div className="w-32 h-32 rounded-full border-4 border-white shadow-lg bg-gray-200 overflow-hidden">
                            {profile.avatarUrl ? (
                                <img src={profile.avatarUrl} alt={profile.fullName} className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-4xl text-gray-400 bg-gray-100"><i className="fas fa-user"></i></div>
                            )}
                        </div>
                        {/* MDRT Badge (Optional Logic) */}
                        {profile.title.includes('MDRT') && (
                            <div className="absolute bottom-0 right-1/2 translate-x-12 bg-yellow-400 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-sm border border-white">
                                MDRT
                            </div>
                        )}
                    </div>

                    {/* Info */}
                    <div className="text-center mb-6">
                        <h2 className="text-2xl font-bold text-gray-900">{profile.fullName}</h2>
                        <p className="text-pru-red font-medium uppercase text-xs tracking-wide mt-1">{profile.title}</p>
                        <p className="text-gray-400 text-xs mt-1">Code: {profile.agentCode}</p>
                        <p className="text-gray-500 text-sm mt-3 italic px-4">"{profile.bio || 'Luôn lắng nghe, luôn thấu hiểu.'}"</p>
                    </div>

                    {/* Action Buttons */}
                    <div className="grid grid-cols-3 gap-3 mb-6">
                        <a href={`tel:${profile.phone}`} className="flex flex-col items-center justify-center bg-gray-50 p-3 rounded-xl hover:bg-green-50 hover:text-green-600 transition group">
                            <div className="w-10 h-10 bg-white rounded-full shadow-sm flex items-center justify-center mb-1 group-hover:bg-green-500 group-hover:text-white transition text-gray-600">
                                <i className="fas fa-phone-alt"></i>
                            </div>
                            <span className="text-[10px] font-bold">Gọi điện</span>
                        </a>
                        <a href={profile.zalo ? `https://zalo.me/${profile.zalo}` : `https://zalo.me/${profile.phone}`} target="_blank" rel="noreferrer" className="flex flex-col items-center justify-center bg-gray-50 p-3 rounded-xl hover:bg-blue-50 hover:text-blue-600 transition group">
                            <div className="w-10 h-10 bg-white rounded-full shadow-sm flex items-center justify-center mb-1 group-hover:bg-blue-500 group-hover:text-white transition text-gray-600">
                                <span className="font-bold text-sm">Z</span>
                            </div>
                            <span className="text-[10px] font-bold">Zalo</span>
                        </a>
                        <a href={`mailto:${profile.email}`} className="flex flex-col items-center justify-center bg-gray-50 p-3 rounded-xl hover:bg-yellow-50 hover:text-yellow-600 transition group">
                            <div className="w-10 h-10 bg-white rounded-full shadow-sm flex items-center justify-center mb-1 group-hover:bg-yellow-500 group-hover:text-white transition text-gray-600">
                                <i className="fas fa-envelope"></i>
                            </div>
                            <span className="text-[10px] font-bold">Email</span>
                        </a>
                    </div>

                    {/* Main CTA */}
                    <button 
                        onClick={downloadVCard}
                        className="w-full bg-gray-900 text-white py-3 rounded-xl font-bold shadow-lg hover:bg-gray-800 transition flex items-center justify-center mb-6"
                    >
                        <i className="fas fa-address-book mr-2"></i> Lưu vào danh bạ
                    </button>

                    {/* QR Code Section */}
                    <div className="flex flex-col items-center justify-center bg-gray-50 p-4 rounded-2xl border border-dashed border-gray-300">
                        <div className="bg-white p-2 rounded-lg shadow-sm mb-2">
                            <QRCodeCanvas value={cardUrl} size={120} level={"H"} includeMargin={true} />
                        </div>
                        <p className="text-xs text-gray-500 font-medium">Quét mã để lưu danh thiếp</p>
                    </div>

                    {/* Social Links */}
                    <div className="flex justify-center gap-4 mt-6">
                        {profile.facebook && <a href={profile.facebook} target="_blank" rel="noreferrer" className="text-gray-400 hover:text-blue-600"><i className="fab fa-facebook fa-lg"></i></a>}
                        <a href="#" className="text-gray-400 hover:text-blue-400"><i className="fab fa-linkedin fa-lg"></i></a>
                        <a href="#" className="text-gray-400 hover:text-pink-500"><i className="fab fa-instagram fa-lg"></i></a>
                    </div>
                </div>
            </div>
            
            <div className="mt-4 text-xs text-gray-400 text-center">
                TuanChom Digital Card System <br/>
                Designed for Professional Agents
            </div>
        </div>
    );
};

export default BusinessCard;

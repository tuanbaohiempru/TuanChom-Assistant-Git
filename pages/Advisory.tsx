
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Customer, Contract, AgentProfile } from '../types';
import { consultantChat, getObjectionSuggestions } from '../services/geminiService';
import { formatAdvisoryContent } from '../components/Shared';

interface AdvisoryPageProps {
    customers: Customer[];
    contracts: Contract[];
    agentProfile: AgentProfile | null;
    onUpdateCustomer: (c: Customer) => void;
}

const AdvisoryPage: React.FC<AdvisoryPageProps> = ({ customers, contracts, agentProfile }) => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const customer = customers.find(c => c.id === id);
    const customerContracts = contracts.filter(c => c.customerId === id);

    // Chat State
    const [messages, setMessages] = useState<{ role: 'user' | 'model'; text: string }[]>([]);
    const [input, setInput] = useState('');
    const [isSending, setIsSending] = useState(false);
    
    // Configuration State
    const [roleplayMode, setRoleplayMode] = useState<'consultant' | 'customer'>('customer'); // AI's Role
    const [conversationGoal, setConversationGoal] = useState('Chốt hợp đồng bảo hiểm nhân thọ');
    const [chatStyle, setChatStyle] = useState<'zalo' | 'formal'>('zalo');
    
    // UI State
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    
    // Coach/Suggestions State
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Scroll to bottom on new message
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, suggestions]);

    const handleSendMessage = async () => {
        if (!input.trim() || !customer) return;

        const userMsg = input;
        setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
        setInput('');
        setIsSending(true);
        setSuggestions([]); 

        try {
            const history = messages.map(m => ({ role: m.role, text: m.text }));
            const response = await consultantChat(
                userMsg, 
                customer, 
                customerContracts, 
                customer.relationships || [], 
                agentProfile, 
                conversationGoal, 
                history, 
                roleplayMode,
                null,
                chatStyle
            );

            setMessages(prev => [...prev, { role: 'model', text: response }]);
        } catch (error) {
            console.error(error);
            setMessages(prev => [...prev, { role: 'model', text: "Lỗi kết nối AI. Vui lòng thử lại sau." }]);
        } finally {
            setIsSending(false);
        }
    };

    const handleGetSuggestions = async () => {
        if (messages.length === 0) return;
        const lastModelMsg = messages[messages.length - 1];
        if (lastModelMsg.role !== 'model') return;

        setIsLoadingSuggestions(true);
        try {
            const result = await getObjectionSuggestions(lastModelMsg.text, customer!);
            setSuggestions(result);
        } catch (e) {
            console.error("Error getting suggestions:", e);
        } finally {
            setIsLoadingSuggestions(false);
        }
    };

    if (!customer) return (
        <div className="h-screen flex items-center justify-center text-gray-500">
            Khách hàng không tồn tại.
            <button onClick={() => navigate('/customers')} className="ml-2 text-blue-500 underline">Quay lại</button>
        </div>
    );

    return (
        <div className="h-[calc(100vh-64px)] flex flex-col md:flex-row bg-gray-50 dark:bg-black overflow-hidden relative">
            
            {/* MOBILE HEADER OVERLAY */}
            <div className="md:hidden flex justify-between items-center p-4 bg-white dark:bg-pru-card border-b border-gray-100 dark:border-gray-800 z-20 shadow-sm">
                <div className="flex items-center gap-3">
                    <button onClick={() => navigate(-1)} className="text-gray-500 dark:text-gray-300"><i className="fas fa-arrow-left"></i></button>
                    <div>
                        <h2 className="font-bold text-gray-800 dark:text-gray-100 text-sm">{customer.fullName}</h2>
                        <span className={`text-[10px] font-bold uppercase ${customer.status === 'Đã tham gia' ? 'text-green-600' : 'text-yellow-600'}`}>{customer.status}</span>
                    </div>
                </div>
                <button onClick={() => setIsSettingsOpen(true)} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-300">
                    <i className="fas fa-cog"></i>
                </button>
            </div>

            {/* SETTINGS SIDEBAR (Drawer on Mobile, Sidebar on Desktop) */}
            <div className={`
                fixed inset-0 z-50 bg-white dark:bg-pru-card transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0 md:w-80 md:border-r md:border-gray-200 md:dark:border-gray-800 md:block
                ${isSettingsOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
            `}>
                <div className="h-full flex flex-col p-4 overflow-y-auto">
                    {/* Mobile Header for Drawer */}
                    <div className="flex justify-between items-center mb-6 md:hidden">
                        <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">Cấu hình Roleplay</h3>
                        <button onClick={() => setIsSettingsOpen(false)} className="text-gray-500"><i className="fas fa-times text-xl"></i></button>
                    </div>

                    {/* Desktop Header */}
                    <div className="hidden md:flex items-center gap-3 mb-6 border-b border-gray-100 dark:border-gray-700 pb-4">
                        <button onClick={() => navigate(-1)} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition"><i className="fas fa-arrow-left"></i></button>
                        <div>
                            <h2 className="font-bold text-gray-800 dark:text-gray-100 line-clamp-1">{customer.fullName}</h2>
                            <span className="text-[10px] uppercase font-bold text-gray-500">{customer.status}</span>
                        </div>
                    </div>

                    <div className="space-y-5 flex-1">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">Chế độ Roleplay</label>
                            <div className="grid grid-cols-2 gap-2">
                                <button onClick={() => setRoleplayMode('customer')} className={`px-3 py-2.5 text-xs font-bold rounded-xl border transition-all flex items-center justify-center ${roleplayMode === 'customer' ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-300 shadow-sm' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'}`}>
                                    <i className="fas fa-user mr-2"></i> Khách hàng
                                </button>
                                <button onClick={() => setRoleplayMode('consultant')} className={`px-3 py-2.5 text-xs font-bold rounded-xl border transition-all flex items-center justify-center ${roleplayMode === 'consultant' ? 'bg-purple-50 border-purple-200 text-purple-700 dark:bg-purple-900/20 dark:border-purple-800 dark:text-purple-300 shadow-sm' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'}`}>
                                    <i className="fas fa-user-tie mr-2"></i> SUSAM
                                </button>
                            </div>
                            <p className="text-[10px] text-gray-400 mt-2 leading-tight">
                                {roleplayMode === 'customer' ? 'AI đóng vai KH khó tính.' : 'AI đóng vai Siêu Trợ lý MDRT.'}
                            </p>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">Mục tiêu hội thoại</label>
                            <textarea className="w-full p-3 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-pru-red/20 transition resize-none" rows={3} value={conversationGoal} onChange={(e) => setConversationGoal(e.target.value)} />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">Phong cách Chat</label>
                            <select className="w-full p-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-pru-red/20" value={chatStyle} onChange={(e: any) => setChatStyle(e.target.value)}>
                                <option value="zalo">Zalo / Thân mật</option>
                                <option value="formal">Email / Trang trọng</option>
                            </select>
                        </div>
                    </div>
                    
                    <div className="pt-4 border-t border-gray-100 dark:border-gray-700 mt-auto">
                        <button onClick={() => { setMessages([]); setSuggestions([]); setIsSettingsOpen(false); }} className="w-full py-3 bg-pru-red text-white rounded-xl text-sm font-bold transition flex items-center justify-center shadow-lg">
                            <i className="fas fa-play mr-2"></i> Bắt đầu / Làm mới
                        </button>
                    </div>
                </div>
            </div>

            {/* Chat Area */}
            <div className="flex-1 flex flex-col h-full relative bg-gray-50 dark:bg-black/50 overflow-hidden">
                <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 pb-24">
                    {messages.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-full opacity-50 space-y-4">
                            <div className="w-20 h-20 bg-gray-200 dark:bg-gray-800 rounded-full flex items-center justify-center text-4xl shadow-inner">
                                <i className="fas fa-comments text-gray-400"></i>
                            </div>
                            <div className="text-center px-6">
                                <h3 className="text-lg font-bold text-gray-600 dark:text-gray-300">Sẵn sàng luyện tập?</h3>
                                <p className="text-sm text-gray-500 mt-1">Chọn chế độ trong Cài đặt (bánh răng) và gửi tin nhắn đầu tiên.</p>
                            </div>
                        </div>
                    )}
                    
                    {messages.map((msg, idx) => (
                        <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            {msg.role === 'model' && (
                                <div className="w-8 h-8 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center shadow-sm mr-2 flex-shrink-0 self-end mb-1">
                                    <i className="fas fa-robot text-pru-red text-xs"></i>
                                </div>
                            )}
                            <div className={`max-w-[85%] md:max-w-[70%] p-3.5 rounded-2xl text-sm shadow-sm leading-relaxed animate-fade-in ${
                                msg.role === 'user' 
                                    ? 'bg-pru-red text-white rounded-br-none shadow-red-500/20' 
                                    : 'bg-white dark:bg-pru-card text-gray-800 dark:text-gray-200 rounded-bl-none border border-gray-100 dark:border-gray-700'
                            }`}>
                                <div dangerouslySetInnerHTML={{ __html: formatAdvisoryContent(msg.text) }} />
                            </div>
                        </div>
                    ))}
                    
                    {isSending && (
                        <div className="flex justify-start">
                            <div className="w-8 h-8 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center shadow-sm mr-2 flex-shrink-0 self-end mb-1">
                                <i className="fas fa-robot text-pru-red text-xs"></i>
                            </div>
                            <div className="bg-white dark:bg-pru-card p-4 rounded-2xl rounded-bl-none border border-gray-100 dark:border-gray-700 shadow-sm flex items-center gap-2">
                                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.15s'}}></div>
                                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.3s'}}></div>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Coach Suggestions Overlay */}
                {roleplayMode === 'customer' && !isSending && (
                    <div className="absolute bottom-[72px] left-0 w-full px-4 z-20">
                         {suggestions.length > 0 ? (
                            <div className="space-y-2 animate-slide-up pt-3 border-t border-dashed border-gray-200 dark:border-gray-700 bg-white/90 dark:bg-black/80 p-3 rounded-2xl backdrop-blur-md shadow-lg border border-gray-200 dark:border-gray-700">
                                <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase flex items-center tracking-wide ml-1">
                                    <i className="fas fa-lightbulb text-yellow-500 mr-2 text-base"></i> Gợi ý từ AI Coach:
                                </p>
                                <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
                                    {suggestions.map((s, idx) => (
                                        <button 
                                            key={idx} 
                                            onClick={() => { if (s.content) { setInput(s.content); setSuggestions([]); } }} 
                                            className="min-w-[200px] text-left bg-white dark:bg-gray-800 p-3 rounded-xl border border-orange-100 dark:border-gray-700 hover:border-orange-400 shadow-sm transition group relative overflow-hidden"
                                        >
                                            <div className="absolute left-0 top-0 w-1 h-full bg-orange-400 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                            <span className={`text-[9px] px-2 py-0.5 rounded font-black uppercase text-white shadow-sm mb-1 inline-block ${s.type === 'empathy' ? 'bg-pink-500' : s.type === 'logic' ? 'bg-blue-500' : 'bg-green-500'}`}>
                                                {s.label || 'Gợi ý'}
                                            </span>
                                            <p className="text-xs text-gray-600 dark:text-gray-300 line-clamp-2 leading-relaxed">{s.content}</p>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            messages.length > 1 && messages[messages.length-1].role === 'model' && (
                                <div className="flex justify-end mb-2">
                                    <button 
                                        onClick={handleGetSuggestions} 
                                        disabled={isLoadingSuggestions}
                                        className="text-xs bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 px-4 py-2 rounded-full hover:bg-orange-100 hover:scale-105 transition flex items-center gap-2 disabled:opacity-50 border border-orange-100 dark:border-orange-800 font-bold shadow-sm backdrop-blur-sm"
                                    >
                                        {isLoadingSuggestions ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-life-ring"></i>} 
                                        Gợi ý Coach
                                    </button>
                                </div>
                            )
                        )}
                    </div>
                )}

                {/* Input Area */}
                <div className="p-3 bg-white dark:bg-pru-card border-t border-gray-100 dark:border-gray-800 shadow-lg z-30 pb-safe">
                    <div className="flex gap-2 relative items-end">
                        <textarea 
                            className="flex-1 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-pru-red/30 focus:border-pru-red text-gray-800 dark:text-gray-100 resize-none max-h-32"
                            placeholder="Nhập tin nhắn..."
                            rows={1}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSendMessage();
                                }
                            }}
                            disabled={isSending}
                        />
                        <button 
                            onClick={handleSendMessage}
                            disabled={!input.trim() || isSending}
                            className="bg-pru-red text-white w-12 h-11 rounded-full hover:bg-red-700 transition shadow-md disabled:opacity-50 disabled:shadow-none flex items-center justify-center flex-shrink-0"
                        >
                            <i className="fas fa-paper-plane"></i>
                        </button>
                    </div>
                </div>
            </div>
            
            <style>{`
                .shadow-lg-up { box-shadow: 0 -10px 15px -3px rgba(0, 0, 0, 0.1); }
            `}</style>
        </div>
    );
};

export default AdvisoryPage;

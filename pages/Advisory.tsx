import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Customer, AgentProfile, Contract } from '../types';
import { consultantChat } from '../services/geminiService';
import { formatAdvisoryContent, cleanMarkdownForClipboard } from '../components/Shared';

interface AdvisoryPageProps {
    customers: Customer[];
    contracts: Contract[];
    agentProfile: AgentProfile | null;
}

const AdvisoryPage: React.FC<AdvisoryPageProps> = ({ customers, contracts, agentProfile }) => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const customer = customers.find(c => c.id === id);
    
    // 1. Get Customer's Own Contracts
    const customerContracts = contracts.filter(c => c.customerId === id);

    // 2. Resolve Family Data (New Logic)
    const familyContext = customer?.relationships?.map(rel => {
        const relative = customers.find(c => c.id === rel.relatedCustomerId);
        if (!relative) return null;
        
        // Find contracts owned by this relative
        const relativeContracts = contracts.filter(c => c.customerId === relative.id);
        const productsOwned = relativeContracts.map(c => c.mainProduct.productName);
        if (relativeContracts.some(c => c.riders.some(r => r.productName.includes('Sức khỏe')))) {
            productsOwned.push('Thẻ sức khỏe');
        }

        return {
            name: relative.fullName,
            relation: rel.relationship,
            age: new Date().getFullYear() - new Date(relative.dob).getFullYear(),
            job: relative.job,
            hasContracts: relativeContracts.length > 0,
            products: productsOwned
        };
    }).filter(Boolean) as any[] || [];

    const [messages, setMessages] = useState<{ role: 'user' | 'model'; text: string }[]>([]);
    const [input, setInput] = useState('');
    const [goal, setGoal] = useState('');
    // New State for Tone
    const [selectedTone, setSelectedTone] = useState<string>('professional'); // 'professional' | 'friendly' | 'direct'
    
    const [isGoalSet, setIsGoalSet] = useState(false);
    const [loading, setLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
    const [hintLoading, setHintLoading] = useState(false);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const startSession = async () => {
        if(!goal.trim()) return alert("Vui lòng nhập mục tiêu cuộc trò chuyện");
        setIsGoalSet(true);
        setLoading(true);
        const startPrompt = "BẮT ĐẦU_ROLEPLAY: Hãy nói câu thoại đầu tiên với khách hàng ngay bây giờ.";
        
        // Pass familyContext and TONE to chat service
        const response = await consultantChat(
            startPrompt, 
            customer!, 
            customerContracts, 
            familyContext, 
            agentProfile, 
            goal, 
            [],
            selectedTone // Pass selected tone
        );
        setMessages([{ role: 'model', text: response }]);
        setLoading(false);
    };

    const handleSend = async () => {
        if (!input.trim() || !customer) return;
        const userMsg = input;
        setInput('');
        setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
        setLoading(true);

        const history = messages.map(m => ({ role: m.role, parts: [{ text: m.text }] }));
        
        // Pass familyContext and TONE to chat service
        const response = await consultantChat(
            userMsg, 
            customer, 
            customerContracts, 
            familyContext, 
            agentProfile, 
            goal, 
            history,
            selectedTone // Pass selected tone
        );
        setMessages(prev => [...prev, { role: 'model', text: response }]);
        setLoading(false);
    };

    const handleCopy = (text: string, idx: number) => {
        const cleanText = cleanMarkdownForClipboard(text);
        navigator.clipboard.writeText(cleanText);
        setCopiedIndex(idx);
        setTimeout(() => setCopiedIndex(null), 2000);
    };

    const handleGetObjectionHint = async () => {
        if (!customer) return;
        setHintLoading(true);
        const history = messages.map(m => ({ role: m.role, parts: [{ text: m.text }] }));
        const hintPrompt = `
            [YÊU CẦU HỖ TRỢ XỬ LÝ TỪ CHỐI]
            Dựa trên ngữ cảnh cuộc hội thoại hiện tại, khách hàng có vẻ đang ngần ngại hoặc từ chối.
            Hãy đóng vai người quản lý dày dạn kinh nghiệm, thì thầm nhắc bài cho tôi (tư vấn viên) 3 phương án trả lời khác nhau để xử lý tình huống này:
            1. Phương án Đồng cảm (Em hiểu cảm giác của anh/chị...)
            2. Phương án Logic/Số liệu (Thực tế thì...)
            3. Phương án Đặt câu hỏi ngược (Điều gì khiến anh/chị băn khoăn nhất...)
            Trả lời ngắn gọn, từng phương án một, để tôi có thể chọn và nói ngay.
        `;
        try {
            const hintResponse = await consultantChat(
                hintPrompt, 
                customer, 
                customerContracts, 
                familyContext, 
                agentProfile, 
                goal, 
                history,
                selectedTone
            );
            setMessages(prev => [...prev, { role: 'model', text: `💡 **GỢI Ý TỪ TRỢ LÝ:**\n\n${hintResponse}` }]);
        } catch (e) {
            alert("Không thể lấy gợi ý lúc này.");
        } finally {
            setHintLoading(false);
        }
    };

    if (!customer) return <div className="p-8 text-center">Khách hàng không tồn tại.</div>;

    return (
        <div className="flex flex-col h-[calc(100vh-theme(spacing.16))] md:h-screen bg-gray-100">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center shadow-sm">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/customers')} className="text-gray-500 hover:text-gray-700">
                        <i className="fas fa-arrow-left text-lg"></i>
                    </button>
                    <div>
                        <h1 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                            <i className="fas fa-theater-masks text-purple-600"></i>
                            Kịch bản tư vấn: {customer.fullName}
                        </h1>
                        <p className="text-xs text-gray-500">AI đóng vai: {agentProfile?.fullName || 'Cố vấn chuyên nghiệp'}</p>
                    </div>
                </div>
                <div className="flex gap-2">
                     {!isGoalSet && <div className="hidden md:block text-xs bg-yellow-50 text-yellow-700 px-3 py-1 rounded-full border border-yellow-100">Chưa thiết lập mục tiêu</div>}
                     <div className="hidden md:block text-xs bg-purple-50 text-purple-700 px-3 py-1 rounded-full border border-purple-100">Roleplay Mode</div>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
                {/* Left Panel */}
                <div className="w-80 bg-white border-r border-gray-200 p-4 overflow-y-auto hidden lg:block">
                    <div className="mb-6">
                        <label className="block text-xs font-bold text-gray-700 mb-2 uppercase">Mục tiêu & Giọng điệu</label>
                        {isGoalSet ? (
                            <div className="space-y-3">
                                <div className="bg-green-50 p-3 rounded-lg border border-green-200 text-sm text-green-800">
                                    <div className="font-bold text-xs uppercase mb-1 text-green-600">Mục tiêu</div>
                                    <i className="fas fa-bullseye mr-2"></i>{goal}
                                </div>
                                <div className="bg-purple-50 p-3 rounded-lg border border-purple-200 text-sm text-purple-800">
                                    <div className="font-bold text-xs uppercase mb-1 text-purple-600">Giọng điệu</div>
                                    <i className="fas fa-volume-up mr-2"></i>
                                    {selectedTone === 'professional' ? 'Chuyên nghiệp (Dạ/Thưa)' : 
                                     selectedTone === 'friendly' ? 'Thân thiện (Mình/Bạn)' : 'Sắc sảo (Dứt khoát)'}
                                </div>
                                <button onClick={() => setIsGoalSet(false)} className="block text-xs text-gray-500 underline mt-2 hover:text-gray-800 w-full text-center">Thay đổi thiết lập</button>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div>
                                    <label className="text-xs text-gray-500 mb-1 block">1. Mục tiêu cuộc gặp</label>
                                    <textarea className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-purple-200 outline-none" rows={2} placeholder="VD: Chốt hợp đồng..." value={goal} onChange={e => setGoal(e.target.value)}/>
                                </div>
                                
                                <div>
                                    <label className="text-xs text-gray-500 mb-2 block">2. Chọn giọng điệu AI</label>
                                    <div className="grid grid-cols-1 gap-2">
                                        <button 
                                            onClick={() => setSelectedTone('professional')}
                                            className={`flex items-center p-2 rounded-lg text-xs font-medium border transition text-left ${selectedTone === 'professional' ? 'bg-purple-50 border-purple-300 text-purple-800' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                                        >
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-2 ${selectedTone === 'professional' ? 'bg-purple-200' : 'bg-gray-100'}`}><i className="fas fa-user-tie"></i></div>
                                            <div>
                                                <div className="font-bold">Chuyên nghiệp</div>
                                                <div className="text-[10px] opacity-70">Lịch sự, xưng "Em" - "Anh/Chị" (Có Dạ/Thưa)</div>
                                            </div>
                                        </button>

                                        <button 
                                            onClick={() => setSelectedTone('friendly')}
                                            className={`flex items-center p-2 rounded-lg text-xs font-medium border transition text-left ${selectedTone === 'friendly' ? 'bg-green-50 border-green-300 text-green-800' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                                        >
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-2 ${selectedTone === 'friendly' ? 'bg-green-200' : 'bg-gray-100'}`}><i className="fas fa-users"></i></div>
                                            <div>
                                                <div className="font-bold">Thân thiện</div>
                                                <div className="text-[10px] opacity-70">Gần gũi, xưng "Mình/Bạn" hoặc Tên</div>
                                            </div>
                                        </button>

                                        <button 
                                            onClick={() => setSelectedTone('direct')}
                                            className={`flex items-center p-2 rounded-lg text-xs font-medium border transition text-left ${selectedTone === 'direct' ? 'bg-orange-50 border-orange-300 text-orange-800' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                                        >
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-2 ${selectedTone === 'direct' ? 'bg-orange-200' : 'bg-gray-100'}`}><i className="fas fa-briefcase"></i></div>
                                            <div>
                                                <div className="font-bold">Sắc sảo (Chuyên gia)</div>
                                                <div className="text-[10px] opacity-70">Xưng "Em" dứt khoát, đi thẳng vấn đề</div>
                                            </div>
                                        </button>
                                    </div>
                                </div>

                                <button onClick={startSession} className="w-full bg-purple-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-purple-700 transition shadow-md">Bắt đầu Roleplay</button>
                            </div>
                        )}
                    </div>
                    <h3 className="font-bold text-gray-700 mb-4 border-b pb-2">Hồ sơ khách hàng</h3>
                    <div className="space-y-4 text-sm">
                        <div><span className="block text-gray-500 text-xs">Nghề nghiệp</span><div className="font-medium">{customer.job}</div></div>
                        <div><span className="block text-gray-500 text-xs">Gia đình (Sơ bộ)</span><div className="font-medium">{customer.analysis?.childrenCount} con</div></div>
                        <div><span className="block text-gray-500 text-xs">Tài chính</span><div className="inline-block px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-xs mt-1">{customer.analysis?.financialStatus}</div></div>
                        <div><span className="block text-gray-500 text-xs">Tính cách</span><div className="inline-block px-2 py-0.5 rounded bg-purple-50 text-purple-700 text-xs mt-1">{customer.analysis?.personality}</div></div>
                        <div><span className="block text-gray-500 text-xs">Mối quan tâm</span><div className="italic text-gray-600">"{customer.analysis?.keyConcerns}"</div></div>
                    </div>
                    
                    {/* Display existing contracts */}
                    <div className="mt-6">
                         <h3 className="font-bold text-gray-700 mb-4 border-b pb-2 flex justify-between">
                            Hợp đồng đã có 
                            <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">{customerContracts.length}</span>
                        </h3>
                        {customerContracts.length > 0 ? (
                            <div className="space-y-3">
                                {customerContracts.map(c => (
                                    <div key={c.id} className="bg-gray-50 p-2 rounded border border-gray-100 text-xs">
                                        <div className="font-bold text-pru-red">{c.mainProduct.productName}</div>
                                        <div className="text-gray-500">Phí: {c.totalFee.toLocaleString()}đ</div>
                                        {c.riders.length > 0 && <div className="text-gray-400 italic">+{c.riders.length} thẻ bổ trợ</div>}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-xs text-gray-400 italic">Khách hàng chưa có HĐ nào.</p>
                        )}
                    </div>

                    {/* Display Family Members Context */}
                    <div className="mt-6">
                         <h3 className="font-bold text-gray-700 mb-4 border-b pb-2 flex justify-between">
                            Thành viên gia đình
                            <span className="bg-blue-100 text-blue-600 text-xs px-2 py-0.5 rounded-full">{familyContext.length}</span>
                        </h3>
                        {familyContext.length > 0 ? (
                            <div className="space-y-3">
                                {familyContext.map((rel: any, i) => (
                                    <div key={i} className="bg-blue-50 p-2 rounded border border-blue-100 text-xs">
                                        <div className="flex justify-between font-bold text-blue-800">
                                            <span>{rel.relation}: {rel.name}</span>
                                            <span>{rel.age}t</span>
                                        </div>
                                        <div className="text-gray-600 mt-1">{rel.hasContracts ? 'Đã có BH' : 'Chưa có BH'}</div>
                                        {rel.products.length > 0 && <div className="text-[10px] text-gray-500 italic truncate">{rel.products.join(', ')}</div>}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-xs text-gray-400 italic">Chưa liên kết người thân.</p>
                        )}
                    </div>
                </div>

                {/* Right Panel: Chat */}
                <div className="flex-1 flex flex-col bg-gray-50">
                    {!isGoalSet ? (
                        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-gray-500">
                             <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mb-4 text-purple-500 text-2xl"><i className="fas fa-bullseye"></i></div>
                             <h2 className="text-xl font-bold text-gray-800 mb-2">Thiết lập kịch bản</h2>
                             <p className="max-w-md">Vui lòng nhập mục tiêu và chọn giọng điệu phù hợp với khách hàng này ở cột bên trái.</p>
                             
                             {/* Mobile Only Form */}
                             <div className="lg:hidden w-full max-w-md mt-6 space-y-4">
                                <input className="w-full border border-gray-300 rounded-lg p-3 text-sm" placeholder="Nhập mục tiêu..." value={goal} onChange={e => setGoal(e.target.value)}/>
                                <select className="w-full border border-gray-300 rounded-lg p-3 text-sm" value={selectedTone} onChange={e => setSelectedTone(e.target.value)}>
                                    <option value="professional">Chuyên nghiệp (Dạ/Thưa)</option>
                                    <option value="friendly">Thân thiện (Mình/Bạn)</option>
                                    <option value="direct">Sắc sảo (Dứt khoát)</option>
                                </select>
                                <button onClick={startSession} className="w-full bg-purple-600 text-white py-3 rounded-lg font-bold">Bắt đầu</button>
                             </div>
                        </div>
                    ) : (
                        <>
                            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                                {messages.map((msg, idx) => (
                                    <div key={idx} className={`flex group ${msg.role === 'user' ? 'justify-end' : 'justify-start items-start'}`}>
                                        {msg.role === 'model' && (
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-2 shadow-sm flex-shrink-0 mt-1 ${msg.text.includes('💡') ? 'bg-yellow-400 text-white' : 'bg-purple-600 text-white'}`}>
                                                <i className={`fas ${msg.text.includes('💡') ? 'fa-lightbulb' : 'fa-user-tie'} text-xs`}></i>
                                            </div>
                                        )}
                                        <div className="relative max-w-[85%]">
                                            <div className={`p-3 rounded-xl shadow-sm text-sm leading-relaxed whitespace-pre-wrap ${msg.role === 'user' ? 'bg-white border border-gray-200 text-gray-800' : msg.text.includes('💡') ? 'bg-yellow-50 border border-yellow-200 text-gray-800' : 'bg-white border-l-4 border-purple-500 text-gray-800'}`}>
                                                {msg.role === 'model' ? <div className="prose prose-sm max-w-none text-gray-800" dangerouslySetInnerHTML={{ __html: formatAdvisoryContent(msg.text) }} /> : msg.text}
                                            </div>
                                            {msg.role === 'model' && !msg.text.includes('💡') && (
                                                <button onClick={() => handleCopy(msg.text, idx)} className={`absolute -right-8 top-0 text-gray-400 hover:text-pru-red p-1.5 opacity-0 group-hover:opacity-100 transition-opacity ${copiedIndex === idx ? 'text-green-500 opacity-100' : ''}`} title="Sao chép nội dung">
                                                    <i className={`fas ${copiedIndex === idx ? 'fa-check' : 'fa-copy'}`}></i>
                                                </button>
                                            )}
                                        </div>
                                        {msg.role === 'user' && <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center ml-2 text-gray-600 flex-shrink-0"><i className="fas fa-user"></i></div>}
                                    </div>
                                ))}
                                {loading && <div className="flex items-center text-gray-400 text-xs ml-10"><i className="fas fa-circle-notch fa-spin mr-2"></i> Cố vấn đang suy nghĩ...</div>}
                                <div ref={messagesEndRef} />
                            </div>

                            <div className="p-4 bg-white border-t border-gray-200">
                                {messages.length > 1 && (
                                    <div className="flex justify-center mb-3">
                                        <button onClick={handleGetObjectionHint} disabled={hintLoading || loading} className="text-xs flex items-center bg-yellow-100 text-yellow-800 px-3 py-1.5 rounded-full hover:bg-yellow-200 transition shadow-sm border border-yellow-200">
                                            <i className={`fas ${hintLoading ? 'fa-spinner fa-spin' : 'fa-lightbulb'} mr-2`}></i>{hintLoading ? 'Đang phân tích...' : 'Gợi ý xử lý từ chối'}
                                        </button>
                                    </div>
                                )}
                                <div className="flex gap-2">
                                    <input type="text" className="flex-1 border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-200" placeholder="Nhập câu trả lời..." value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSend()} disabled={loading} />
                                    <button onClick={handleSend} disabled={loading} className="bg-purple-600 text-white px-6 rounded-lg hover:bg-purple-700 transition disabled:opacity-50"><i className="fas fa-paper-plane"></i></button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AdvisoryPage;
import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { AppState } from '../types';
import { chatWithData } from '../services/geminiService';

interface AIChatProps {
  state: AppState;
}

// Declare Web Speech API types for TypeScript
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

const AIChat: React.FC<AIChatProps> = ({ state }) => {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false); // False = Floating, True = Side Dock
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<{ role: 'user' | 'model'; text: string }[]>([
    { role: 'model', text: 'Xin chào! Tôi là **PruMate**. \nTôi có thể giúp bạn tra cứu nhanh:\n- Thông tin hợp đồng & phí\n- Quyền lợi & Điều khoản sản phẩm\n- Lịch sử chăm sóc khách hàng' }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  
  // Voice Recognition State
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Check if we are on the Advisory page to hide the button
  const isAdvisoryPage = location.pathname.includes('/advisory');

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isOpen, isExpanded]);

  // --- Voice Recognition Setup ---
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false; // Stop automatically after silence
      recognition.interimResults = true; // Show results while speaking
      recognition.lang = 'vi-VN'; // Vietnamese

      recognition.onstart = () => setIsListening(true);
      
      recognition.onend = () => setIsListening(false);
      
      recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          transcript += event.results[i][0].transcript;
        }
        setQuery(transcript);
      };

      recognition.onerror = (event: any) => {
        console.error("Speech recognition error", event.error);
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      alert("Trình duyệt của bạn không hỗ trợ nhận diện giọng nói. Vui lòng dùng Chrome hoặc Safari.");
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
    } else {
      setQuery(''); // Clear input when starting new recording
      recognitionRef.current.start();
    }
  };

  const handleSend = async () => {
    if (!query.trim()) return;

    const userMessage = query;
    setQuery('');
    setMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setIsLoading(true);

    const history = messages.map(m => ({
        role: m.role,
        parts: [{ text: m.text }]
    }));

    const response = await chatWithData(userMessage, state, history);

    setMessages(prev => [...prev, { role: 'model', text: response }]);
    setIsLoading(false);
  };

  // --- Advanced Message Formatter ---
  const formatMessage = (text: string) => {
    let html = text;
    html = html.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    // Tables
    const tableRegex = /((?:\|.*\|\n?)+)/g;
    html = html.replace(tableRegex, (match) => {
        const rows = match.trim().split('\n');
        let tableHtml = '<div class="overflow-x-auto my-3 border border-gray-200 rounded-lg"><table class="min-w-full text-sm text-left">';
        rows.forEach((row, index) => {
            const cols = row.split('|').filter(c => c.trim() !== '').map(c => c.trim());
            if (cols.length === 0 || row.includes('---')) return;
            if (index === 0) {
                tableHtml += '<thead class="bg-red-50 text-gray-700 font-bold"><tr>';
                cols.forEach(col => tableHtml += `<th class="px-3 py-2 border-b border-red-100 whitespace-nowrap">${col}</th>`);
                tableHtml += '</tr></thead><tbody>';
            } else {
                tableHtml += `<tr class="${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}">`;
                cols.forEach(col => tableHtml += `<td class="px-3 py-2 border-b border-gray-100 text-gray-600">${col}</td>`);
                tableHtml += '</tr>';
            }
        });
        tableHtml += '</tbody></table></div>';
        return tableHtml;
    });

    // Headers
    html = html.replace(/^### (.*$)/gim, '<h3 class="text-pru-red font-bold text-base mt-4 mb-2 border-b border-red-100 pb-1 flex items-center"><i class="fas fa-info-circle mr-2 text-xs"></i>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2 class="text-gray-800 font-bold text-lg mt-3 mb-2">$1</h2>');
    // Bold
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-gray-900">$1</strong>');
    // Lists
    html = html.replace(/^\- (.*$)/gim, '<li class="ml-4 list-disc marker:text-pru-red pl-1 text-gray-700 mb-1">$1</li>');
    html = html.replace(/((?:<li.*?>.*?<\/li>\n?)+)/g, '<ul class="my-2 space-y-1">$1</ul>');
    // Highlights
    html = html.replace(/(\d{1,3}(?:\.\d{3})+(?:\s?đ|\s?VND))/g, '<span class="font-mono font-bold text-pru-red bg-red-50 px-1 rounded">$1</span>');
    html = html.replace(/(Đang hiệu lực)/g, '<span class="text-green-700 font-bold bg-green-100 px-2 py-0.5 rounded text-xs border border-green-200">$1</span>');
    html = html.replace(/(Mất hiệu lực|Đã hủy)/g, '<span class="text-red-700 font-bold bg-red-100 px-2 py-0.5 rounded text-xs border border-red-200">$1</span>');
    html = html.replace(/(Chờ thẩm định|Tiềm năng)/g, '<span class="text-yellow-700 font-bold bg-yellow-100 px-2 py-0.5 rounded text-xs border border-yellow-200">$1</span>');
    // Breaks
    html = html.replace(/\n/g, '<br />');

    return html;
  };

  // Dynamic Classes based on Expanded State
  // Moved to LEFT-6 instead of RIGHT-6
  const containerClasses = isExpanded
    ? "fixed top-0 right-0 h-full w-[500px] max-w-full bg-white shadow-2xl flex flex-col border-l border-gray-200 z-[60] transition-all duration-300 ease-in-out" // Docked Mode
    : "fixed bottom-24 left-6 w-[400px] max-w-[90vw] h-[600px] max-h-[80vh] bg-white rounded-2xl shadow-2xl flex flex-col border border-gray-200 overflow-hidden transform transition-all ease-in-out duration-300 z-50"; // Floating Mode (Moved to Left)

  // If in Advisory Page and NOT open, do not render the floating button
  if (isAdvisoryPage && !isOpen) return null;

  return (
    <>
      {/* Dimmed Background when Expanded */}
      {isOpen && isExpanded && (
        <div 
            className="fixed inset-0 bg-black/20 backdrop-blur-[1px] z-[55] transition-opacity" 
            onClick={() => setIsOpen(false)}
        />
      )}

      {/* Main Chat Container */}
      {isOpen && (
        <div className={`${containerClasses} animate-fade-in`}>
          
          {/* Header */}
          <div className={`bg-gradient-to-r from-pru-red to-red-700 p-4 flex justify-between items-center text-white shadow-md ${isExpanded ? '' : 'cursor-move'}`}>
            <div className="flex items-center">
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center mr-3 backdrop-blur-sm border border-white/30">
                    <i className="fas fa-robot text-lg"></i>
                </div>
                <div>
                    <h3 className="font-bold text-base">PruMate AI</h3>
                    <p className="text-xs opacity-90 flex items-center">
                        <span className="w-2 h-2 bg-green-400 rounded-full mr-1.5 animate-pulse"></span>
                        Trực tuyến
                    </p>
                </div>
            </div>
            <div className="flex gap-1">
                 <button 
                    onClick={() => setIsExpanded(!isExpanded)} 
                    className="text-white/80 hover:bg-white/10 p-2 rounded transition w-8 h-8 flex items-center justify-center" 
                    title={isExpanded ? "Thu nhỏ" : "Mở rộng"}
                 >
                    <i className={`fas ${isExpanded ? 'fa-compress-alt' : 'fa-expand-alt'} text-sm`}></i>
                </button>
                
                 <button 
                    onClick={() => setMessages([])} 
                    className="text-white/80 hover:bg-white/10 p-2 rounded transition w-8 h-8 flex items-center justify-center" 
                    title="Xóa đoạn chat"
                >
                    <i className="fas fa-trash-alt text-sm"></i>
                </button>
                
                <button 
                    onClick={() => setIsOpen(false)} 
                    className="text-white/80 hover:bg-white/10 p-2 rounded transition w-8 h-8 flex items-center justify-center"
                    title="Đóng"
                >
                    <i className="fas fa-times text-lg"></i>
                </button>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 bg-gray-50 space-y-5 scroll-smooth">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start items-start'}`}>
                {msg.role === 'model' && (
                    <div className="w-8 h-8 rounded-full bg-white border border-gray-200 flex-shrink-0 mr-2 flex items-center justify-center shadow-sm mt-1">
                        <i className="fas fa-robot text-pru-red text-xs"></i>
                    </div>
                )}
                <div 
                  className={`max-w-[85%] p-3.5 rounded-2xl text-sm leading-relaxed shadow-sm ${
                    msg.role === 'user' 
                      ? 'bg-pru-red text-white rounded-br-none' 
                      : 'bg-white border border-gray-100 text-gray-800 rounded-bl-none'
                  }`}
                >
                  {msg.role === 'model' ? (
                      <div className="prose prose-sm max-w-none text-gray-800" 
                        dangerouslySetInnerHTML={{ __html: formatMessage(msg.text) }} 
                      />
                  ) : (
                      msg.text
                  )}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start items-end">
                <div className="w-8 h-8 rounded-full bg-white border border-gray-200 flex-shrink-0 mr-2 flex items-center justify-center shadow-sm">
                        <i className="fas fa-robot text-pru-red text-xs"></i>
                </div>
                <div className="bg-white border border-gray-100 p-4 rounded-2xl rounded-bl-none shadow-sm">
                  <div className="flex space-x-1.5 items-center h-full">
                    <div className="w-2 h-2 bg-pru-red/40 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-pru-red/60 rounded-full animate-bounce" style={{animationDelay: '0.15s'}}></div>
                    <div className="w-2 h-2 bg-pru-red rounded-full animate-bounce" style={{animationDelay: '0.3s'}}></div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-4 bg-white border-t border-gray-100">
            {isListening && (
               <div className="text-center text-xs text-red-500 font-bold mb-2 animate-pulse flex justify-center items-center">
                   <div className="w-2 h-2 bg-red-500 rounded-full mr-2"></div>
                   Đang nghe bạn nói...
               </div>
            )}
            <div className="relative shadow-sm rounded-full">
                {/* Voice Input Button */}
                <button
                    onClick={toggleListening}
                    className={`absolute left-1.5 top-1.5 w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                        isListening 
                        ? 'bg-red-100 text-red-600 ring-2 ring-red-400 ring-opacity-50' 
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                    title="Nhập bằng giọng nói"
                >
                    <i className={`fas ${isListening ? 'fa-microphone-slash' : 'fa-microphone'}`}></i>
                </button>

                <input
                    type="text"
                    className="w-full pl-14 pr-12 py-3.5 bg-gray-50 border border-gray-200 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-300 transition-all placeholder-gray-400 text-gray-700"
                    placeholder={isListening ? "Đang nghe..." : "Hỏi PruMate (hoặc micro để nói)..."}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                    disabled={isLoading}
                    autoFocus
                />
                
                <button 
                    onClick={handleSend}
                    disabled={isLoading || !query.trim()}
                    className="absolute right-1.5 top-1.5 w-10 h-10 bg-gradient-to-br from-pru-red to-red-600 text-white rounded-full flex items-center justify-center hover:shadow-md disabled:opacity-50 disabled:shadow-none transition-all transform hover:scale-105 active:scale-95"
                >
                    <i className="fas fa-paper-plane text-xs"></i>
                </button>
            </div>
            <div className="mt-2 flex justify-center gap-3 text-[10px] text-gray-400">
                <span className="flex items-center"><i className="fas fa-shield-alt mr-1"></i>Bảo mật dữ liệu</span>
                <span className="flex items-center"><i className="fas fa-bolt mr-1"></i>Gemini Flash AI</span>
            </div>
          </div>
        </div>
      )}

      {/* Floating Launcher Button - MOVED TO LEFT-6 */}
      {!isOpen && !isAdvisoryPage && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 left-6 z-50 group w-16 h-16 bg-gradient-to-br from-pru-red to-red-700 text-white rounded-full shadow-lg shadow-red-500/30 flex items-center justify-center transition-all hover:scale-110 hover:-translate-y-1"
        >
          <span className="absolute w-full h-full rounded-full bg-red-400 opacity-75 animate-ping group-hover:opacity-0"></span>
          <i className="fas fa-comment-dots text-2xl relative z-10"></i>
          
          {/* Badge */}
          <span className="absolute top-0 right-0 w-4 h-4 bg-green-500 border-2 border-white rounded-full z-20"></span>
          
          {/* Tooltip - MOVED TO RIGHT SIDE OF BUTTON */}
          <span className="absolute left-full ml-3 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
            Hỏi PruMate AI
          </span>
        </button>
      )}
    </>
  );
};

export default AIChat;
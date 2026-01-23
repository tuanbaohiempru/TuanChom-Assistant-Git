
import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { User } from 'firebase/auth';
import { logout } from '../services/auth';

interface LayoutProps {
  children: React.ReactNode;
  onToggleChat: () => void;
  user?: User;
}

const Layout: React.FC<LayoutProps> = ({ children, onToggleChat, user }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMagicOpen, setIsMagicOpen] = useState(false); // State for Magic Button expansion

  const navItems = [
    { path: '/', label: 'Tổng quan', icon: 'fa-chart-pie' },
    { path: '/customers', label: 'Khách hàng', icon: 'fa-users' },
    { path: '/appointments', label: 'Lịch', icon: 'fa-calendar-alt' },
    { path: '/products', label: 'Sản phẩm', icon: 'fa-book-open' }, // Hidden on mobile bottom bar usually
    { path: '/settings', label: 'Cài đặt', icon: 'fa-cog' }, 
  ];

  const isActive = (path: string) => location.pathname === path;
  const pageTitle = navItems.find(item => item.path === location.pathname)?.label || 'Chi tiết';

  const handleLogout = async () => {
      if(window.confirm('Bạn chắc chắn muốn đăng xuất?')) {
          await logout();
      }
  }

  // --- MAGIC ACTIONS ---
  const handleMagicAction = (action: 'voice' | 'scan' | 'note') => {
      setIsMagicOpen(false); // Close menu
      switch (action) {
          case 'scan':
              // Navigate to Customers page with a trigger state to open Scan Modal immediately
              navigate('/customers', { state: { triggerScan: true } });
              break;
          case 'voice':
              // We can emit a custom event or navigate to Dashboard with trigger
              // For simplicity, let's navigate to Dashboard and trigger voice
              navigate('/', { state: { triggerVoice: true } });
              break;
          case 'note':
              // Navigate to Dashboard with trigger for Note
              navigate('/', { state: { triggerNote: true } });
              break;
      }
  };

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-pru-dark overflow-hidden transition-colors duration-300">
      
      {/* 1. DESKTOP SIDEBAR (Hidden on Mobile) */}
      <aside className="hidden md:flex flex-col w-64 bg-white dark:bg-pru-card border-r border-gray-200 dark:border-gray-800 z-30 transition-colors">
        <div className="flex items-center justify-center h-16 border-b border-gray-200 dark:border-gray-800 bg-pru-red text-white">
          <span className="text-xl font-bold tracking-wider">TuanChom</span>
        </div>
        <nav className="flex-1 overflow-y-auto py-4">
          <ul className="space-y-1 px-2">
            {navItems.map((item) => (
              <li key={item.path}>
                <Link
                  to={item.path}
                  className={`flex items-center px-4 py-3 rounded-lg transition-colors ${
                    isActive(item.path)
                      ? 'bg-red-50 dark:bg-red-900/20 text-pru-red font-semibold border-l-4 border-pru-red'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  <i className={`fas ${item.icon} w-6 text-center mr-3`}></i>
                  {item.label}
                </Link>
              </li>
            ))}
             {/* Extra items for Desktop only */}
             <li>
                <Link to="/contracts" className={`flex items-center px-4 py-3 rounded-lg transition-colors ${isActive('/contracts') ? 'text-pru-red bg-red-50' : 'text-gray-600 hover:bg-gray-100'}`}>
                    <i className="fas fa-file-contract w-6 text-center mr-3"></i> Hợp đồng
                </Link>
             </li>
             <li>
                <Link to="/marketing" className={`flex items-center px-4 py-3 rounded-lg transition-colors ${isActive('/marketing') ? 'text-pru-red bg-red-50' : 'text-gray-600 hover:bg-gray-100'}`}>
                    <i className="fas fa-bullhorn w-6 text-center mr-3"></i> Marketing
                </Link>
             </li>
          </ul>
        </nav>
        <div className="p-4 border-t border-gray-200 dark:border-gray-800">
           <div className="flex items-center space-x-3 text-sm text-gray-500 mb-3">
             {user?.photoURL ? (
                 <img src={user.photoURL} alt="Avatar" className="w-8 h-8 rounded-full border border-gray-200" />
             ) : (
                <div className="w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-700 flex items-center justify-center">
                    <i className="fas fa-user text-white dark:text-gray-400"></i>
                </div>
             )}
             <div className="overflow-hidden">
               <p className="font-medium text-gray-900 dark:text-gray-100 truncate">{user?.displayName || 'Tư vấn viên'}</p>
               <Link to="/settings" className="text-xs text-blue-500 hover:underline">Cấu hình</Link>
             </div>
           </div>
           <button onClick={handleLogout} className="w-full py-2 flex items-center justify-center text-xs font-bold text-red-500 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 rounded-lg transition">
               <i className="fas fa-sign-out-alt mr-2"></i> Đăng xuất
           </button>
        </div>
      </aside>

      {/* Main Container */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        
        {/* 2. HEADER (Simplified for Mobile) */}
        <header className="flex items-center justify-between h-14 md:h-16 bg-white dark:bg-pru-card border-b border-gray-200 dark:border-gray-800 px-4 md:px-6 z-20 transition-colors shadow-sm shrink-0">
          <div className="flex items-center gap-3">
             {/* Only show logo on mobile */}
             <div className="md:hidden w-8 h-8 bg-pru-red rounded-full flex items-center justify-center text-white font-bold text-xs">TC</div>
             <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">{pageTitle}</h2>
          </div>

          <div className="flex items-center gap-3">
             {/* AI Button - Always visible but smaller on mobile */}
             <button 
                onClick={onToggleChat}
                className="w-9 h-9 md:w-auto md:px-4 md:py-2 rounded-full bg-red-50 dark:bg-red-900/20 text-pru-red flex items-center justify-center gap-2 hover:bg-pru-red hover:text-white transition group border border-red-100 dark:border-red-900/50"
             >
                <i className="fas fa-robot text-lg md:text-base"></i>
                <span className="hidden md:inline text-sm font-bold">Trợ lý AI</span>
             </button>
          </div>
        </header>

        {/* 3. CONTENT AREA (Scrollable) */}
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-50 dark:bg-pru-dark p-4 md:p-6 pb-24 md:pb-6 relative z-0 scroll-smooth">
          {children}
        </main>

        {/* 4. MAGIC BUTTON (Global FAB) */}
        <div className="fixed bottom-20 right-4 md:bottom-10 md:right-10 z-50 flex flex-col items-end gap-3">
            {/* Expanded Options */}
            {isMagicOpen && (
                <div className="flex flex-col gap-3 animate-slide-up">
                    <button onClick={() => handleMagicAction('voice')} className="flex items-center gap-3 group">
                        <span className="bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 text-xs font-bold px-2 py-1 rounded shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">Ra lệnh giọng nói</span>
                        <div className="w-12 h-12 rounded-full bg-blue-600 text-white shadow-lg flex items-center justify-center hover:scale-110 transition">
                            <i className="fas fa-microphone"></i>
                        </div>
                    </button>
                    <button onClick={() => handleMagicAction('scan')} className="flex items-center gap-3 group">
                        <span className="bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 text-xs font-bold px-2 py-1 rounded shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">Quét CCCD/Tài liệu</span>
                        <div className="w-12 h-12 rounded-full bg-green-600 text-white shadow-lg flex items-center justify-center hover:scale-110 transition">
                            <i className="fas fa-camera"></i>
                        </div>
                    </button>
                    <button onClick={() => handleMagicAction('note')} className="flex items-center gap-3 group">
                        <span className="bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 text-xs font-bold px-2 py-1 rounded shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">Ghi chú nhanh</span>
                        <div className="w-12 h-12 rounded-full bg-yellow-500 text-white shadow-lg flex items-center justify-center hover:scale-110 transition">
                            <i className="fas fa-sticky-note"></i>
                        </div>
                    </button>
                </div>
            )}
            
            {/* Main Trigger Button */}
            <button 
                onClick={() => setIsMagicOpen(!isMagicOpen)}
                className={`w-14 h-14 rounded-full shadow-2xl flex items-center justify-center text-2xl transition-transform duration-200 ${isMagicOpen ? 'bg-gray-700 rotate-45' : 'bg-pru-red hover:scale-105'}`}
            >
                <i className="fas fa-plus text-white"></i>
            </button>
        </div>

        {/* 5. BOTTOM NAVIGATION (Mobile Only) */}
        <nav className="md:hidden fixed bottom-0 left-0 w-full bg-white dark:bg-pru-card border-t border-gray-200 dark:border-gray-800 flex justify-around items-center h-16 z-40 pb-safe shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
            <Link to="/" className={`flex flex-col items-center justify-center w-full h-full ${isActive('/') ? 'text-pru-red' : 'text-gray-400'}`}>
                <i className={`fas fa-home text-lg mb-1 ${isActive('/') ? 'animate-bounce-short' : ''}`}></i>
                <span className="text-[10px] font-medium">Home</span>
            </Link>
            <Link to="/customers" className={`flex flex-col items-center justify-center w-full h-full ${isActive('/customers') ? 'text-pru-red' : 'text-gray-400'}`}>
                <i className="fas fa-users text-lg mb-1"></i>
                <span className="text-[10px] font-medium">Khách</span>
            </Link>
            
            {/* Spacer for Magic Button */}
            <div className="w-full"></div>

            <Link to="/appointments" className={`flex flex-col items-center justify-center w-full h-full ${isActive('/appointments') ? 'text-pru-red' : 'text-gray-400'}`}>
                <i className="fas fa-calendar-alt text-lg mb-1"></i>
                <span className="text-[10px] font-medium">Lịch</span>
            </Link>
            <Link to="/settings" className={`flex flex-col items-center justify-center w-full h-full ${isActive('/settings') ? 'text-pru-red' : 'text-gray-400'}`}>
                <i className="fas fa-cog text-lg mb-1"></i>
                <span className="text-[10px] font-medium">Cài đặt</span>
            </Link>
        </nav>

      </div>
      
      {/* Overlay when Magic Menu is open */}
      {isMagicOpen && (
          <div className="fixed inset-0 bg-black/50 z-40 md:hidden animate-fade-in" onClick={() => setIsMagicOpen(false)}></div>
      )}

      <style>{`
        .pb-safe { padding-bottom: env(safe-area-inset-bottom); }
        .animate-bounce-short { animation: bounce-short 0.3s; }
        @keyframes bounce-short {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-3px); }
        }
      `}</style>
    </div>
  );
};

export default Layout;

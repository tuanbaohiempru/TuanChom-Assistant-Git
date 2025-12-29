
import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { User } from 'firebase/auth';
import { logout } from '../services/auth';

interface LayoutProps {
  children: React.ReactNode;
  onToggleChat: () => void;
  user?: User; // Add user prop
}

const Layout: React.FC<LayoutProps> = ({ children, onToggleChat, user }) => {
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navItems = [
    { path: '/', label: 'Dashboard', icon: 'fa-chart-line' },
    { path: '/customers', label: 'Khách hàng', icon: 'fa-users' },
    { path: '/product-advisory', label: 'Thiết kế Giải pháp', icon: 'fa-magic' },
    { path: '/contracts', label: 'Hợp đồng', icon: 'fa-file-contract' },
    { path: '/products', label: 'Sản phẩm', icon: 'fa-book-open' },
    { path: '/appointments', label: 'Lịch hẹn', icon: 'fa-calendar-check' },
    { path: '/marketing', label: 'Marketing', icon: 'fa-bullhorn' },
    { path: '/templates', label: 'Mẫu tin nhắn', icon: 'fa-comment-alt' },
    { path: '/settings', label: 'Cài đặt', icon: 'fa-cog' }, 
  ];

  const isActive = (path: string) => location.pathname === path;

  // Get Page Title from navItems
  const pageTitle = navItems.find(item => item.path === location.pathname)?.label || 'Chi tiết';

  const handleLogout = async () => {
      if(window.confirm('Bạn chắc chắn muốn đăng xuất?')) {
          await logout();
      }
  }

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-pru-dark overflow-hidden transition-colors duration-300">
      {/* Sidebar for Desktop */}
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
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        
        {/* TOP HEADER BAR (Mobile & Desktop) */}
        <header className="flex items-center justify-between h-16 bg-white dark:bg-pru-card border-b border-gray-200 dark:border-gray-800 px-4 md:px-6 z-40 transition-colors shadow-sm">
          <div className="flex items-center gap-3">
             {/* Mobile Menu Toggle */}
             <button onClick={() => setIsMobileMenuOpen(true)} className="md:hidden p-2 text-gray-500 focus:outline-none">
                <i className="fas fa-bars text-xl"></i>
             </button>
             <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100 md:ml-0">{pageTitle}</h2>
          </div>

          <div className="flex items-center gap-2 md:gap-4">
             {/* THE PRUMATE AI BUTTON - INTEGRATED IN HEADER */}
             <button 
                onClick={onToggleChat}
                className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 text-pru-red px-3 py-1.5 md:px-4 md:py-2 rounded-full border border-red-100 dark:border-red-900/50 hover:bg-pru-red hover:text-white transition-all group"
                title="Hỏi trợ lý AI"
             >
                <div className="relative">
                    <i className="fas fa-robot text-lg"></i>
                    <span className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full border border-white animate-pulse"></span>
                </div>
                <span className="hidden md:inline text-sm font-bold">TuanChom AI</span>
             </button>

             {/* Settings Shortcut */}
             <Link to="/settings" className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition">
                <i className="fas fa-cog"></i>
             </Link>
          </div>
        </header>

        {/* Mobile Menu Overlay */}
        {isMobileMenuOpen && (
          <div className="md:hidden fixed inset-0 z-50 bg-gray-900/75 dark:bg-black/80 backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)}>
            <div className="absolute top-0 left-0 w-64 h-full bg-white dark:bg-pru-card shadow-2xl overflow-y-auto transition-colors flex flex-col" onClick={e => e.stopPropagation()}>
               <div className="flex items-center justify-between p-4 border-b dark:border-gray-800 bg-pru-red text-white">
                  <span className="font-bold">Danh mục</span>
                  <button onClick={() => setIsMobileMenuOpen(false)}><i className="fas fa-times"></i></button>
               </div>
               <nav className="py-2 flex-1">
                <ul className="space-y-1 px-2">
                  {navItems.map((item) => (
                    <li key={item.path}>
                      <Link
                        to={item.path}
                        onClick={() => setIsMobileMenuOpen(false)}
                        className={`flex items-center px-4 py-3 rounded-lg ${
                          isActive(item.path) ? 'bg-red-50 dark:bg-red-900/20 text-pru-red font-medium' : 'text-gray-600 dark:text-gray-400'
                        }`}
                      >
                         <i className={`fas ${item.icon} w-6 mr-3`}></i>
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
              <div className="p-4 border-t border-gray-200 dark:border-gray-800">
                  <button onClick={handleLogout} className="w-full py-2 flex items-center justify-center text-sm font-bold text-red-500 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 rounded-lg transition">
                    <i className="fas fa-sign-out-alt mr-2"></i> Đăng xuất
                  </button>
              </div>
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-50 dark:bg-pru-dark p-4 md:p-6 relative z-0 transition-colors duration-300">
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;

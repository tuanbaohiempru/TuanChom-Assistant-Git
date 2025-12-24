
import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navItems = [
    { path: '/', label: 'Dashboard', icon: 'fa-chart-line' },
    { path: '/customers', label: 'Khách hàng', icon: 'fa-users' },
    { path: '/contracts', label: 'Hợp đồng', icon: 'fa-file-contract' },
    { path: '/products', label: 'Sản phẩm', icon: 'fa-book-open' },
    { path: '/appointments', label: 'Lịch hẹn', icon: 'fa-calendar-check' },
    { path: '/marketing', label: 'Marketing', icon: 'fa-bullhorn' },
    { path: '/templates', label: 'Mẫu tin nhắn', icon: 'fa-comment-alt' },
    { path: '/settings', label: 'Cài đặt', icon: 'fa-cog' }, 
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-pru-dark overflow-hidden transition-colors duration-300">
      {/* Sidebar for Desktop */}
      <aside className="hidden md:flex flex-col w-64 bg-white dark:bg-pru-card border-r border-gray-200 dark:border-gray-800 z-30 transition-colors">
        <div className="flex items-center justify-center h-16 border-b border-gray-200 dark:border-gray-800 bg-pru-red text-white">
          <span className="text-xl font-bold tracking-wider">PruMate</span>
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
           <div className="flex items-center space-x-3 text-sm text-gray-500">
             <div className="w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-700 flex items-center justify-center">
               <i className="fas fa-user text-white dark:text-gray-400"></i>
             </div>
             <div>
               <p className="font-medium text-gray-900 dark:text-gray-100">Tư vấn viên</p>
               <Link to="/settings" className="text-xs text-blue-500 hover:underline">Cập nhật hồ sơ</Link>
             </div>
           </div>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <header className="md:hidden flex items-center justify-between h-16 bg-pru-red px-4 text-white shadow-md z-50 relative">
          <span className="text-lg font-bold">PruMate</span>
          <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 focus:outline-none">
            <i className={`fas ${isMobileMenuOpen ? 'fa-times' : 'fa-bars'} text-xl`}></i>
          </button>
        </header>

        {/* Mobile Menu Overlay */}
        {isMobileMenuOpen && (
          <div className="md:hidden fixed inset-0 top-16 z-40 bg-gray-900/75 dark:bg-black/80 backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)}>
            <div className="absolute top-0 left-0 w-64 h-full bg-white dark:bg-pru-card shadow-2xl overflow-y-auto transition-colors" onClick={e => e.stopPropagation()}>
               <nav className="py-4">
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
            </div>
          </div>
        )}

        {/* Main Content */}
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-50 dark:bg-pru-dark p-4 md:p-6 relative z-0 transition-colors duration-300">
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;
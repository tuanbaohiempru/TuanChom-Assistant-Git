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
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Sidebar for Desktop */}
      <aside className="hidden md:flex flex-col w-64 bg-white border-r border-gray-200">
        <div className="flex items-center justify-center h-16 border-b border-gray-200 bg-pru-red text-white">
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
                      ? 'bg-red-50 text-pru-red font-semibold border-l-4 border-pru-red'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <i className={`fas ${item.icon} w-6 text-center mr-3`}></i>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="p-4 border-t border-gray-200">
           <div className="flex items-center space-x-3 text-sm text-gray-500">
             <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center">
               <i className="fas fa-user text-white"></i>
             </div>
             <div>
               <p className="font-medium text-gray-900">Tư vấn viên</p>
               <p className="text-xs">Prudential VN</p>
             </div>
           </div>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <header className="md:hidden flex items-center justify-between h-16 bg-pru-red px-4 text-white shadow-md z-20">
          <span className="text-lg font-bold">PruMate</span>
          <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2">
            <i className={`fas ${isMobileMenuOpen ? 'fa-times' : 'fa-bars'} text-xl`}></i>
          </button>
        </header>

        {/* Mobile Menu Overlay */}
        {isMobileMenuOpen && (
          <div className="md:hidden absolute inset-0 z-10 bg-gray-800 bg-opacity-75" onClick={() => setIsMobileMenuOpen(false)}>
            <div className="absolute top-16 left-0 w-64 h-full bg-white shadow-xl" onClick={e => e.stopPropagation()}>
               <nav className="py-4">
                <ul className="space-y-1 px-2">
                  {navItems.map((item) => (
                    <li key={item.path}>
                      <Link
                        to={item.path}
                        onClick={() => setIsMobileMenuOpen(false)}
                        className={`flex items-center px-4 py-3 rounded-lg ${
                          isActive(item.path) ? 'bg-red-50 text-pru-red font-medium' : 'text-gray-600'
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
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-50 p-4 md:p-6 relative">
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;
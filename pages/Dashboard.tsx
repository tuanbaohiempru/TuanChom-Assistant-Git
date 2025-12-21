
import React from 'react';
import { AppState, ContractStatus, AppointmentStatus, Contract, PaymentFrequency } from '../types';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as ReTooltip } from 'recharts';

interface DashboardProps {
  state: AppState;
  onUpdateContract: (c: Contract) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ state, onUpdateContract }) => {
  const { customers, contracts, appointments } = state;

  // Helper: Format Date to dd/mm/yyyy
  const formatDateVN = (dateStr: string) => {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  };

  // Stats
  const totalCustomers = customers.length;
  const activeContracts = contracts.filter(c => c.status === ContractStatus.ACTIVE).length;
  const totalRevenue = contracts.reduce((sum, c) => sum + c.totalFee, 0);
  const upcomingAppointments = appointments.filter(a => a.status === AppointmentStatus.UPCOMING).length;

  // Upcoming Birthdays (Next 30 days)
  const today = new Date();
  const upcomingBirthdays = customers.filter(c => {
    const dob = new Date(c.dob);
    const nextBday = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());
    if (nextBday < today) nextBday.setFullYear(today.getFullYear() + 1);
    const diffTime = Math.abs(nextBday.getTime() - today.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays <= 30;
  });

  // Upcoming Payments (Next 30 days)
  const upcomingPayments = contracts.filter(c => {
    // Filter out lapsed contracts, pending ones, etc.
    if (c.status === ContractStatus.LAPSED) return false;
    
    const dueDate = new Date(c.nextPaymentDate);
    const diffTime = dueDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    // Show overdue (but not yet lapsed) and upcoming 30 days
    return diffDays >= -60 && diffDays <= 30;
  });

  // Chart Data
  const contractStatusData = [
    { name: 'Hiệu lực', value: activeContracts },
    { name: 'Mất hiệu lực', value: contracts.filter(c => c.status === ContractStatus.LAPSED).length },
    { name: 'Chờ thẩm định', value: contracts.filter(c => c.status === ContractStatus.PENDING).length },
  ];
  const COLORS = ['#00C49F', '#FF8042', '#FFBB28'];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Tổng quan</h1>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center">
          <div className="p-3 bg-blue-100 rounded-full text-blue-600 mr-4">
            <i className="fas fa-users text-xl"></i>
          </div>
          <div>
            <p className="text-sm text-gray-500">Tổng khách hàng</p>
            <p className="text-2xl font-bold text-gray-800">{totalCustomers}</p>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center">
          <div className="p-3 bg-green-100 rounded-full text-green-600 mr-4">
            <i className="fas fa-file-contract text-xl"></i>
          </div>
          <div>
            <p className="text-sm text-gray-500">Hợp đồng hiệu lực</p>
            <p className="text-2xl font-bold text-gray-800">{activeContracts}</p>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center">
          <div className="p-3 bg-yellow-100 rounded-full text-yellow-600 mr-4">
            <i className="fas fa-dollar-sign text-xl"></i>
          </div>
          <div>
            <p className="text-sm text-gray-500">Tổng phí (VND)</p>
            <p className="text-2xl font-bold text-gray-800">{(totalRevenue / 1000000).toFixed(0)} Tr</p>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center">
          <div className="p-3 bg-red-100 rounded-full text-red-600 mr-4">
            <i className="fas fa-calendar-alt text-xl"></i>
          </div>
          <div>
            <p className="text-sm text-gray-500">Lịch hẹn sắp tới</p>
            <p className="text-2xl font-bold text-gray-800">{upcomingAppointments}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content Column */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Action Required: Upcoming Payments */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
             <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-800"><i className="fas fa-money-bill-wave text-yellow-500 mr-2"></i>Sắp đến hạn đóng phí</h2>
                <span className="text-sm text-gray-500">{upcomingPayments.length} hợp đồng</span>
             </div>
             {upcomingPayments.length > 0 ? (
               <div className="overflow-x-auto">
                 <table className="w-full text-left text-sm text-gray-600">
                    <thead className="bg-gray-50 text-gray-700">
                      <tr>
                        <th className="px-4 py-2">Số HĐ</th>
                        <th className="px-4 py-2">Khách hàng</th>
                        <th className="px-4 py-2">Hạn đóng</th>
                        <th className="px-4 py-2">Số tiền</th>
                      </tr>
                    </thead>
                    <tbody>
                      {upcomingPayments.map(c => {
                        const dueDate = new Date(c.nextPaymentDate);
                        const isOverdue = dueDate < today;
                        return (
                          <tr key={c.id} className="border-b hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium text-pru-red">{c.contractNumber}</td>
                            <td className="px-4 py-3">{customers.find(cus => cus.id === c.customerId)?.fullName}</td>
                            <td className="px-4 py-3">
                                <span className={`font-medium ${isOverdue ? 'text-red-600' : 'text-gray-800'}`}>
                                    {formatDateVN(c.nextPaymentDate)}
                                </span>
                                {isOverdue && <span className="ml-2 text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded">Quá hạn</span>}
                            </td>
                            <td className="px-4 py-3">{c.totalFee.toLocaleString('vi-VN')} đ</td>
                          </tr>
                        );
                      })}
                    </tbody>
                 </table>
               </div>
             ) : (
               <p className="text-gray-500 text-sm">Không có hợp đồng nào đến hạn trong 30 ngày tới.</p>
             )}
          </div>

          {/* Action Required: Birthdays */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
             <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-800"><i className="fas fa-birthday-cake text-pink-500 mr-2"></i>Sinh nhật sắp tới</h2>
             </div>
             {upcomingBirthdays.length > 0 ? (
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 {upcomingBirthdays.map(c => (
                   <div key={c.id} className="flex items-center p-3 bg-pink-50 rounded-lg border border-pink-100">
                      <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-pink-500 font-bold border border-pink-200 mr-3">
                        {new Date(c.dob).getDate()}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-800">{c.fullName}</p>
                        <p className="text-xs text-gray-500">Sinh ngày: {formatDateVN(c.dob)}</p>
                      </div>
                      <button className="ml-auto px-3 py-1 bg-white text-pink-500 text-xs rounded border border-pink-200 hover:bg-pink-100">
                        Gửi tin
                      </button>
                   </div>
                 ))}
               </div>
             ) : (
                <p className="text-gray-500 text-sm">Không có sinh nhật nào trong 30 ngày tới.</p>
             )}
          </div>

        </div>

        {/* Right Column: Charts & Agenda */}
        <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-lg font-bold text-gray-800 mb-4">Tình trạng hợp đồng</h2>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={contractStatusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      fill="#8884d8"
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {contractStatusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <ReTooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex justify-center space-x-4 text-xs">
                 {contractStatusData.map((entry, index) => (
                   <div key={index} className="flex items-center">
                     <span className="w-3 h-3 rounded-full mr-1" style={{backgroundColor: COLORS[index]}}></span>
                     {entry.name} ({entry.value})
                   </div>
                 ))}
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
               <h2 className="text-lg font-bold text-gray-800 mb-4">Lịch trình hôm nay</h2>
               {appointments.filter(a => a.date === new Date().toISOString().split('T')[0]).length > 0 ? (
                 <ul className="space-y-3">
                   {appointments.filter(a => a.date === new Date().toISOString().split('T')[0]).map(a => (
                     <li key={a.id} className="flex flex-col p-3 bg-gray-50 rounded-lg border-l-4 border-pru-red">
                        <div className="flex justify-between items-start">
                          <span className="font-bold text-gray-800">{a.time}</span>
                          <span className="text-xs px-2 py-0.5 bg-gray-200 rounded text-gray-600">{a.type}</span>
                        </div>
                        <p className="text-sm font-medium mt-1">{a.customerName}</p>
                        <p className="text-xs text-gray-500 truncate">{a.note}</p>
                     </li>
                   ))}
                 </ul>
               ) : (
                 <div className="text-center py-6 text-gray-400">
                    <i className="fas fa-coffee text-2xl mb-2"></i>
                    <p>Hôm nay không có lịch.</p>
                 </div>
               )}
            </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;

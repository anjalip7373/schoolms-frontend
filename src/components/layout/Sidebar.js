import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', icon: '📊', path: '/dashboard' },
  { key: 'students', label: 'Students', icon: '👨‍🎓', path: '/students' },
  { key: 'daily_attendance', label: 'Daily Attendance', icon: '📋', path: '/attendance' },
  { key: 'attendance_report', label: 'Attendance Report', icon: '📈', path: '/attendance-report' },
  { key: 'fee_payment', label: 'Fee Payment', icon: '💰', path: '/fees' },
  { key: 'salary_slip', label: 'Salary Slip', icon: '💵', path: '/salary' },
  { key: 'employees', label: 'Employees', icon: '👨‍💼', path: '/employees' },
  { key: 'reports', label: 'Reports', icon: '📑', path: '/reports' },
  { key: 'marks', label: 'Marks', icon: '📝', path: '/marks' },
  { key: 'marks', label: 'Marksheet Report', icon: '📊', path: '/marksheet-report' },
  { key: 'configuration', label: 'Configuration', icon: '⚙️', path: '/configuration' },
  { key: 'dashboard', label: 'My Profile', icon: '👤', path: '/profile' },
  { key: 'broadcast', label: 'Broadcast', icon: '📢', path: '/broadcast' },
];

const Sidebar = ({ isOpen, onClose }) => {
  const { user, hasAccess } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleNav = (path) => {
    navigate(path);
    onClose(); // close sidebar on mobile after navigation
  };

  return (
    <div className={`sidebar ${isOpen ? 'open' : ''}`}>
      <div className="sidebar-logo">
        <h1>🏫 <span>School</span>MS</h1>
        <p>Management System</p>
      </div>
      <nav className="sidebar-nav">
        <div className="nav-section-title">Main Menu</div>
        {NAV_ITEMS.filter(item => hasAccess(item.key)).map((item, index) => (
          <button
            key={index}
            className={"nav-item " + (location.pathname === item.path ? 'active' : '')}
            onClick={() => handleNav(item.path)}
          >
            <span className="nav-icon">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>
    </div>
  );
};

export default Sidebar;
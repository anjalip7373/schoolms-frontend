import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const Topbar = ({ title, subtitle, onMenuClick }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const initials = user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <div className="topbar">
      <div className="topbar-left">
        {/* ✅ Hamburger menu — only shows on mobile */}
        <button className="hamburger-btn" onClick={onMenuClick}>
          ☰
        </button>
        <div>
          <h2>{title || 'Dashboard'}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>
      <div className="topbar-right">
        <div className="user-badge">
          <div className="user-avatar">{initials}</div>
          <div className="user-info">
            <span className="user-name">{user?.name}</span>
            <span className="user-role">{user?.role?.toUpperCase()}</span>
          </div>
        </div>
        <button className="btn btn-logout btn-sm" onClick={handleLogout}>
          🚪 <span className="logout-text">Logout</span>
        </button>
      </div>
    </div>
  );
};

export default Topbar;
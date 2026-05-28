import React, { createContext, useContext, useState, useEffect } from 'react';
import API from '../utils/api';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
  });
  const [token, setToken] = useState(() => localStorage.getItem('token'));

  // Refresh access from server every 60 seconds for live config updates
  useEffect(() => {
    if (!token || !user) return;
    const interval = setInterval(async () => {
      try {
        const { data } = await API.get('/auth/me');
        const updated = { ...user, access: data.access };
        setUser(updated);
        localStorage.setItem('user', JSON.stringify(updated));
      } catch (e) {}
    }, 60000);
    return () => clearInterval(interval);
  }, [token]);

  const login = (userData, tokenData) => {
    setUser(userData);
    setToken(tokenData);
    localStorage.setItem('user', JSON.stringify(userData));
    localStorage.setItem('token', tokenData);
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('user');
    localStorage.removeItem('token');
  };

  const hasAccess = (page) => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    return Array.isArray(user.access) && user.access.includes(page);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, hasAccess }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
import React, { useState } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

const AppLayout = ({ children, title, subtitle }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="app-layout-container">
      {/* Strict UI Engine Injection to enforce tablet floating drawers and remove page overlaps */}
      <style>{`
        .app-layout-container {
          display: flex;
          width: 100vw;
          min-height: 100vh;
          overflow-x: hidden;
          background: #f8fafc;
          position: relative;
        }
        
        .main-viewport-wrapper {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-width: 0;
          width: 100%;
          overflow-x: hidden;
        }

        .page-content {
          flex: 1;
          padding: 24px;
          width: 100%;
          max-width: 100%;
          box-sizing: border-box;
        }

        /* ── TABLET PORTRAIT & LANDSCAPE OVERRIDES (MAX-WIDTH: 1366px) ── */
        @media (max-width: 1366px) {
          /* 1. Reset original positioning to force sidebar off-screen drawer rules */
          .app-layout-container > aside,
          .app-layout-container .sidebar,
          [class*="sidebar"] {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            bottom: 0 !important;
            width: 280px !important;
            height: 100vh !important;
            z-index: 99999 !important; /* Ensure it stays above everything */
            transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
            transform: ${sidebarOpen ? 'translateX(0)' : 'translateX(-100%)'} !important;
          }

          /* 2. Force structural content viewport wrapper to span full 100% screen width */
          .main-viewport-wrapper {
            padding-left: 0 !important;
            margin-left: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
          }

          .page-content {
            padding: 16px !important;
          }

          /* 3. Re-align topbar and force real original 3-line hamburger menu to show up */
          .topbar {
            display: flex !important;
            align-items: center !important;
            padding-left: 16px !important;
          }
          
          .topbar-left {
            display: flex !important;
            align-items: center !important;
            gap: 12px !important;
          }

          .hamburger-btn {
            display: flex !important;
            visibility: visible !important;
            opacity: 1 !important;
            background: #f1f5f9 !important;
            border: 1px solid #cbd5e1 !important;
            color: #334155 !important;
            padding: 8px 12px !important;
            border-radius: 6px !important;
            font-size: 18px !important;
            cursor: pointer !important;
          }
        }
      `}</style>

      {/* Dim overlay background that appears and allows click-away closing */}
      {sidebarOpen && (
        <div
          className="custom-sidebar-dimmer"
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(15, 23, 42, 0.4)',
            backdropFilter: 'blur(3px)',
            zIndex: 99990, /* Placed right underneath the sidebar drawer index layer */
            cursor: 'pointer'
          }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Navigation frame block */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Core main wrapper tracking content updates dynamically */}
      <div className="main-viewport-wrapper">
        <Topbar
          title={title}
          subtitle={subtitle}
          onMenuClick={() => setSidebarOpen(!sidebarOpen)}
        />
        <div className="page-content">
          {children}
        </div>
      </div>
    </div>
  );
};

export default AppLayout;
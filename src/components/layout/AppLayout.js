import React, { useState } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

const AppLayout = ({ children, title, subtitle }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="app-layout">
      {/* Global strict override to fix layout breaks on landscape and portrait tablets */}
      <style>{`
        .app-layout {
          display: flex;
          width: 100vw;
          min-height: 100vh;
          overflow-x: hidden;
          background: #f8fafc;
        }

        /* ── GLOBAL TABLET AND MOBILE RESPONSIVE RE-ARCHITECTURE ── */
        @media (max-width: 1366px) {
          .app-layout {
            position: relative;
          }

          /* 1. Sidebar turns into a smooth off-screen slide drawer */
          .app-layout > aside, 
          .app-layout .sidebar,
          [class*="sidebar"] {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            bottom: 0 !important;
            width: 260px !important;
            z-index: 10000 !important;
            transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
            transform: ${sidebarOpen ? 'translateX(0)' : 'translateX(-100%)'} !important;
          }

          /* 2. Forces main viewport content to stretch beautifully to full width */
          .main-content {
            padding-left: 0 !important;
            margin-left: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            flex: 1 !important;
          }
          
          .page-content {
            padding: 16px !important;
            width: 100% !important;
          }

          /* 3. Forces top header bar to seamlessly show the original 3-line hamburger button */
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
            z-index: 10005 !important;
          }
        }
      `}</style>

      {/* Dim overlay background that appears and allows click-away closing */}
      {sidebarOpen && (
        <div
          className="sidebar-overlay"
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(15, 23, 42, 0.4)',
            backdropFilter: 'blur(3px)',
            zIndex: 9999
          }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="main-content">
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
import React, { useState } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

const AppLayout = ({ children, title, subtitle }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="app-layout">
      <style>{`
        .app-layout {
          display: flex;
          width: 100vw;
          min-height: 100vh;
          overflow-x: hidden;
          background: #f8fafc;
        }
        .main-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-width: 0;
          width: 100%;
          overflow-x: hidden;
          transition: padding-left 0.3s ease;
        }
        .page-content {
          flex: 1;
          padding: 24px;
          width: 100%;
          max-width: 100%;
          box-sizing: border-box;
        }

        /* ── TABLET RESPONSIVE SYSTEM BUTTON FIXED ALIGNMENT ── */
        @media (max-width: 1300px) {
          .app-layout {
            position: relative;
          }
          .main-content {
            width: 100% !important;
            max-width: 100% !important;
            padding-left: 0 !important;
          }
          .page-content {
            padding: 16px !important;
          }

          /* Forces Topbar hamburger button to sit gracefully at the green zone */
          .topbar {
            display: flex !important;
            align-items: center;
            padding-left: 12px !important;
          }
          .topbar-left {
            display: flex !important;
            align-items: center;
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
            z-index: 10000 !important; /* Raised z-index to guarantee click layer availability */
          }
        }
      `}</style>

      {/* Dim Blur Overlay layer visible whenever open state is true */}
      {sidebarOpen && (
        <div
          className="sidebar-overlay"
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(15, 23, 42, 0.4)',
            backdropFilter: 'blur(3px)',
            zIndex: 999
          }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Core navigation controls frame modules passing parameters */}
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
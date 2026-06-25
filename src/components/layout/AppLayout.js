import React, { useState } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

const AppLayout = ({ children, title, subtitle }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="app-layout">
      {/* Structural layout rules forcing tablet portrait behavior modifications */}
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
        }
        .page-content {
          flex: 1;
          padding: 24px;
          width: 100%;
          max-width: 100%;
          box-sizing: border-box;
        }

        /* ── GLOBAL TABLET RESPONSIVE SYSTEM RE-ALIGNMENT ── */
        @media (max-width: 1300px) {
          .app-layout {
            position: relative;
          }
          /* Forces right main wrapper page to take full portrait screen boundaries */
          .main-content {
            width: 100% !important;
            max-width: 100% !important;
            padding-left: 0 !important;
          }
          .page-content {
            padding: 16px !important;
          }

          /* Force global top bar header menu buttons visibility */
          .main-content > div:first-of-type button,
          .main-content [class*="menu"],
          .main-content [class*="hamburger"],
          .main-content [onClick*="onMenuClick"] {
            display: flex !important;
            visibility: visible !important;
            opacity: 1 !important;
          }
        }
      `}</style>

      {/* Mobile & Tablet overlay — click to close sidebar */}
      {sidebarOpen && (
        <div
          className="sidebar-overlay"
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(15, 23, 42, 0.3)',
            backdropFilter: 'blur(2px)',
            zIndex: 999
          }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Actual core navigation container layout */}
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
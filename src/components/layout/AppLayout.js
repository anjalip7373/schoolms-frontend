import React, { useState } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

const AppLayout = ({ children, title, subtitle }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="app-layout">
      {/* Dynamic Responsive Injector to force perfect layout stretching on Portrait tablets */}
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

        /* ── TABLET PORTRAIT AND MOBILE BREAKPOINT OVERRIDES ── */
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
        }
      `}</style>

      {/* Mobile overlay — click to close sidebar */}
      {sidebarOpen && (
        <div
          className="sidebar-overlay"
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
import React, { useState } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

const AppLayout = ({ children, title, subtitle }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="system-layout-root">
      {/* Strict grid calculation engine to stop horizontal overlaps on small screens / tablets */}
      <style>{`
        .system-layout-root {
          display: grid;
          grid-template-columns: 260px 1fr; /* Fixed sidebar width, right side takes dynamic remaining space */
          width: 100vw;
          min-height: 100vh;
          overflow: hidden;
          background: #f8fafc;
        }

        .main-viewport-wrapper {
          display: flex;
          flex-direction: column;
          min-width: 0; /* CRITICAL: Allows flex child to shrink below contents safely preventing breakage */
          width: 100%;
          height: 100vh;
          overflow-y: auto; /* Handles page scrolling inside viewport natively */
        }

        .page-content {
          flex: 1;
          padding: 24px;
          width: 100%;
          box-sizing: border-box;
        }

        /* ── SYSTEM ADAPTABILITY OVERRIDES FOR PORTRAIT TABLETS & SMALL MOBILES ── */
        @media (max-width: 1024px) {
          .system-layout-root {
            display: block; /* Fallback layout engine for portrait mobile phones */
            position: relative;
          }

          /* Turns sidebar layout container into an absolute overlay panel menu */
          .system-layout-root > aside,
          .system-layout-root .sidebar,
          [class*="sidebar"] {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            bottom: 0 !important;
            width: 260px !important;
            height: 100vh !important;
            z-index: 99999 !important;
            transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
            transform: ${sidebarOpen ? 'translateX(0)' : 'translateX(-100%)'} !important;
          }

          .main-viewport-wrapper {
            width: 100% !important;
            height: auto !important;
            overflow-y: visible !important;
          }

          .page-content {
            padding: 16px !important;
          }

          /* Force Topbar hamburger trigger to flex display standard states */
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

      {/* Background dark dimmed layer for mobile pull-out triggers closure handling */}
      {sidebarOpen && (
        <div
          className="custom-sidebar-dimmer"
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(15, 23, 42, 0.4)',
            backdropFilter: 'blur(3px)',
            zIndex: 99990,
            cursor: 'pointer'
          }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Navigation panel anchor frame code module */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Right side isolated clean scroll track container viewport workspace */}
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
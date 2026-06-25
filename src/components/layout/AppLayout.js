import React, { useState } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

const AppLayout = ({ children, title, subtitle }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="app-layout">
      {/* Absolute strict positioning layout rules to force sliding behavior on tablets */}
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

        /* ── TABLET AND MOBILE SYSTEM TRANSITION OVERRIDES ── */
        @media (max-width: 1300px) {
          .app-layout {
            position: relative;
          }
          
          /* Removes the fixed desktop left sidebar spacing completely */
          .main-content, .app-layout > .main-content {
            padding-left: 0 !important;
            margin-left: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
          }
          .page-content {
            padding: 16px !important;
          }

          /* Force Topbar hamburger button to become active and touchable */
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
            z-index: 10001 !important;
          }

          /* Captures the sidebar and turns it into a responsive sliding drawer */
          .sidebar-wrapper {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            bottom: 0 !important;
            width: 260px !important; /* Matches standard sidebar widths */
            z-index: 10000 !important;
            transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
            transform: translateX(-100%) !important; /* Hides sidebar off-screen initially */
            box-shadow: 5px 0 25px rgba(0,0,0,0.15);
          }
          
          /* Slider Active Class Trigger rule */
          .sidebar-wrapper.open {
            transform: translateX(0) !important; /* Slides sidebar into the view screen */
          }

          /* Forces children elements inside wrapper to expand correctly */
          .sidebar-wrapper > div, .sidebar-wrapper .sidebar, .sidebar-wrapper [class*="sidebar"] {
            width: 100% !important;
            height: 100% !important;
            display: block !important;
            visibility: visible !important;
          }
        }
      `}</style>

      {/* Dim Overlay backdrop panel layout background sheets layer */}
      {sidebarOpen && (
        <div
          className="sidebar-overlay"
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(15, 23, 42, 0.4)',
            backdropFilter: 'blur(3px)',
            zIndex: 9999 /* Just right underneath the sidebar drawer */
          }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Custom Wrapper component tracking the open state condition directly */}
      <div className={`sidebar-wrapper ${sidebarOpen ? 'open' : ''}`}>
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      </div>

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
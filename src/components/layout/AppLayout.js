import React, { useState } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

const AppLayout = ({ children, title, subtitle }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className={`app-layout-engine-root ${sidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`} style={{
      display: 'flex',
      width: '100vw',
      minHeight: '100vh',
      overflowX: 'hidden',
      background: '#f8fafc',
      position: 'relative'
    }}>

      {/* Compile-safe CSS Engine */}
      <style>{`
        /* ── DEFAULT DESKTOP HIDDEN ELEMENTS ── */
        .hamburger-btn {
          display: none;
        }

        /* ── RESPONSIVE SYSTEM OVERRIDES FOR TABLETS & MOBILES ── */
        @media (max-width: 1366px) {
          .app-layout-engine-root {
            position: relative;
          }
          
          /* Sidebar drawer settings */
          .app-layout-engine-root > aside,
          .app-layout-engine-root .sidebar,
          [class*="sidebar"] {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            bottom: 0 !important;
            width: 260px !important;
            height: 100vh !important;
            z-index: 999999 !important;
            transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1) !important;
          }

          /* State transitions handled safely via standard clean classes */
          .sidebar-closed > aside,
          .sidebar-closed .sidebar,
          .sidebar-closed [class*="sidebar"] {
            transform: translateX(-100%) !important;
          }

          .sidebar-open > aside,
          .sidebar-open .sidebar,
          .sidebar-open [class*="sidebar"] {
            transform: translateX(0) !important;
          }

          /* Viewport resets */
          .main-content-viewport,
          .main-content {
            padding-left: 0 !important;
            margin-left: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            flex: 1 !important;
          }

          /* Force show Topbar hamburger menu lines */
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
          className="custom-sidebar-backdrop-dimmer"
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(15, 23, 42, 0.4)',
            backdropFilter: 'blur(3px)',
            zIndex: 99999,
            cursor: 'pointer'
          }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar Component */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Content Viewport */}
      <div className="main-content-viewport" style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        width: '100%',
        overflowX: 'hidden'
      }}>
        <Topbar
          title={title}
          subtitle={subtitle}
          onMenuClick={() => setSidebarOpen(!sidebarOpen)}
        />
        <div className="page-content" style={{
          flex: 1,
          padding: '24px',
          width: '100%',
          boxSizing: 'border-box'
        }}>
          {children}
        </div>
      </div>
    </div>
  );
};

export default AppLayout;
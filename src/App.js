import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './index.css';

import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Students from './pages/Students';
import Attendance from './pages/Attendance';
import AttendanceReport from './pages/AttendanceReport';
import Fees from './pages/Fees';
import Salary from './pages/Salary';
import EmployeePage from './pages/Employees';
import Configuration from './pages/Configuration';
import Reports from './pages/Reports';
import Profile from './pages/Profile';
import Marks from './pages/Marks';
import MarksheetReport from './pages/MarksheetReport';
import Broadcast from './pages/Broadcast';

const ProtectedRoute = ({ children, page }) => {
  const { user, hasAccess } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (page && !hasAccess(page)) return <Navigate to="/dashboard" replace />;
  return children;
};

const AppRoutes = () => {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" /> : <Login />} />
      <Route path="/dashboard" element={<ProtectedRoute page="dashboard"><Dashboard /></ProtectedRoute>} />
      <Route path="/students" element={<ProtectedRoute page="students"><Students /></ProtectedRoute>} />
      <Route path="/attendance" element={<ProtectedRoute page="daily_attendance"><Attendance /></ProtectedRoute>} />
      <Route path="/attendance-report" element={<ProtectedRoute page="attendance_report"><AttendanceReport /></ProtectedRoute>} />
      <Route path="/fees" element={<ProtectedRoute page="fee_payment"><Fees /></ProtectedRoute>} />
      <Route path="/salary" element={<ProtectedRoute page="salary_slip"><Salary /></ProtectedRoute>} />
      <Route path="/employees" element={<ProtectedRoute page="employees"><EmployeePage /></ProtectedRoute>} />
      <Route path="/reports" element={<ProtectedRoute page="reports"><Reports /></ProtectedRoute>} />
      <Route path="/configuration" element={<ProtectedRoute page="configuration"><Configuration /></ProtectedRoute>} />
      <Route path="/" element={<Navigate to={user ? "/dashboard" : "/login"} />} />
      <Route path="*" element={<Navigate to="/" />} />
      <Route path="/profile" element={<ProtectedRoute page="dashboard"><Profile /></ProtectedRoute>} />
      <Route path="/marks" element={<ProtectedRoute page="marks"><Marks /></ProtectedRoute>} />
      <Route path="/marksheet-report" element={<ProtectedRoute page="marks"><MarksheetReport /></ProtectedRoute>} />
      <Route path="/broadcast" element={<ProtectedRoute page="broadcast"><Broadcast /></ProtectedRoute>} />
    </Routes>

  );
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
        <ToastContainer position="top-right" autoClose={3000} hideProgressBar={false} newestOnTop closeOnClick pauseOnHover />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;

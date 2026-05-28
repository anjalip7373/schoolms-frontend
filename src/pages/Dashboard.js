import React, { useState, useEffect } from 'react';
import AppLayout from '../components/layout/AppLayout';
import API from '../utils/api';
import { toast } from 'react-toastify';
import { useAuth } from '../context/AuthContext';

const Dashboard = () => {
  const [data, setData] = useState(null);
  const { user } = useAuth();
  const isTeacher = user?.role === 'Teacher' || user?.role === 'teacher';
  const [loading, setLoading] = useState(true);
  const [selectedClass, setSelectedClass] = useState('');
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [showExport, setShowExport] = useState(false);
  // const handleExportExcel = () => { toast.info('Export Excel coming soon'); };
  // const handleExportPDF = () => { toast.info('Export PDF coming soon'); };
  const [feeModal, setFeeModal] = useState(null);
  const [salaryModal, setSalaryModal] = useState(null);
  const [feeDetails, setFeeDetails] = useState([]);
  const [salaryDetails, setSalaryDetails] = useState([]);

  const fetchDashboard = async () => {
    setLoading(true);
    try {
      const params = { month, year };
      if (selectedClass) params.class_id = selectedClass;
      const { data: res } = await API.get('/dashboard', { params });
      setData(res);
    } catch (err) { toast.error('Failed to load dashboard'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchDashboard(); }, [month, year, selectedClass]);

  const showFeeDetails = async (type) => {
    try {
      const params = { month, year };
      if (selectedClass) params.class_id = selectedClass;
      const { data: res } = await API.get('/fees/dashboard-stats', { params });
      const filtered = type === 'paid' ? res.details.filter(d => d.payment_count > 0) : res.details.filter(d => d.payment_count === 0);
      setFeeDetails(filtered);
      setFeeModal(type);
    } catch (err) { toast.error('Failed to load fee details'); }
  };

  const showSalaryDetails = async (type) => {
    try {
      const params = { month, year };
      const { data: res } = await API.get('/salary/dashboard-stats', { params });
      const filtered = type === 'generated' ? res.details.filter(d => d.slip_id) : res.details.filter(d => !d.slip_id);
      setSalaryDetails(filtered);
      setSalaryModal(type);
    } catch (err) { toast.error('Failed to load salary details'); }
  };

  const years = [];
  for (let y = 2020; y <= new Date().getFullYear() + 1; y++) years.push(y);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  return (
    <AppLayout title="Dashboard" subtitle="School overview and statistics">
      {/* Filters */}
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', background:'#fff', padding:'16px 20px', borderRadius:'12px', marginBottom:'20px', border:'1px solid #e2e8f0', flexWrap:'wrap', gap:'12px'}}>
        <div style={{display:'flex', gap:'10px', flexWrap:'wrap', alignItems:'center'}}>
          <select className="form-control" value={month} onChange={e => setMonth(e.target.value)}>
            {months.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
          </select>
          <select className="form-control" value={year} onChange={e => setYear(e.target.value)}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select className="form-control" value={selectedClass} onChange={e => setSelectedClass(e.target.value)}>
            <option value="">All Classes</option>
            {data?.classes?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        {/* <div className="dropdown-export">
          <button className="btn btn-primary" onClick={() => setShowExport(!showExport)}>📤 Export ▾</button> */}
          {/* {showExport && (
            <div className="dropdown-menu">
              <button className="dropdown-item" onClick={handleExportExcel}>📊 Excel (.xlsx)</button>
              <button className="dropdown-item" onClick={handleExportPDF}>📄 PDF</button>
            </div>
          )} */}
        </div>
      {/* </div> */}

   

      {loading ? (
        <div className="loading"><div className="spinner"></div><p>Loading dashboard...</p></div>
      ) : data ? (
        <>
          {/* Fee Stats */}
          <div style={{marginBottom:'12px'}}><h3 style={{fontWeight:700, fontSize:'14px', color:'#64748b', textTransform:'uppercase', letterSpacing:'0.5px'}}>💰 Fee Summary</h3></div>
          <div className="stats-grid" style={{marginBottom:'28px'}}>
            <div className="stat-card blue">
              <span className="stat-icon">👥</span>
              <span className="stat-label">Total Students</span>
              <span className="stat-value">{data.fees.total}</span>
            </div>
            <div className="stat-card green" onClick={() => showFeeDetails('paid')} title="Click to view">
              <span className="stat-icon">✅</span>
              <span className="stat-label">Fee Paid</span>
              <span className="stat-value">{data.fees.paid}</span>
              <span className="stat-sub">Click to view details →</span>
            </div>
            <div className="stat-card red" onClick={() => showFeeDetails('unpaid')} title="Click to view">
              <span className="stat-icon">❌</span>
              <span className="stat-label">Fee Not Paid</span>
              <span className="stat-value">{data.fees.not_paid}</span>
              <span className="stat-sub">Click to view details →</span>
            </div>
          </div>
          {/* Salary Stats */}
          {!isTeacher && (
            <>
              <div style={{marginBottom:'12px'}}><h3 style={{fontWeight:700, fontSize:'14px', color:'#64748b', textTransform:'uppercase', letterSpacing:'0.5px'}}>💵 Salary Summary</h3></div>
              <div className="stats-grid">
                <div className="stat-card blue">
                  <span className="stat-icon">👨‍💼</span>
                  <span className="stat-label">Total Employees</span>
                  <span className="stat-value">{data.salary.total}</span>
                </div>
                <div className="stat-card green" onClick={() => showSalaryDetails('generated')}>
                  <span className="stat-icon">📄</span>
                  <span className="stat-label">Salary Generated</span>
                  <span className="stat-value">{data.salary.generated}</span>
                  <span className="stat-sub">Click to view details →</span>
                </div>
                <div className="stat-card red" onClick={() => showSalaryDetails('not_generated')}>
                  <span className="stat-icon">⏳</span>
                  <span className="stat-label">Not Generated</span>
                  <span className="stat-value">{data.salary.not_generated}</span>
                  <span className="stat-sub">Click to view details →</span>
                </div>
              </div>
            </>
          )}
        </>
      ) : null}

      {/* Fee Modal */}
      {feeModal && (
        <div className="modal-overlay" onClick={() => setFeeModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{feeModal === 'paid' ? '✅ Fee Paid Students' : '❌ Fee Not Paid Students'}</h2>
              <button className="modal-close" onClick={() => setFeeModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="table-wrapper">
                <table>
                  <thead><tr><th>Roll No</th><th>Name</th><th>Class</th></tr></thead>
                  <tbody>
                    {feeDetails.map(s => (
                      <tr key={s.id}><td>{s.roll_no}</td><td>{s.full_name}</td><td>{s.class_name}</td></tr>
                    ))}
                    {!feeDetails.length && <tr><td colSpan="3"><div className="empty-state"><p>No records found</p></div></td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Salary Modal */}
      {salaryModal && (
        <div className="modal-overlay" onClick={() => setSalaryModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{salaryModal === 'generated' ? '📄 Salary Generated' : '⏳ Salary Not Generated'}</h2>
              <button className="modal-close" onClick={() => setSalaryModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="table-wrapper">
                <table>
                  <thead><tr><th>Emp ID</th><th>Name</th><th>Role</th><th>Status</th></tr></thead>
                  <tbody>
                    {salaryDetails.map(e => (
                      <tr key={e.id}>
                        <td>{e.emp_id}</td><td>{e.full_name}</td><td>{e.role_name}</td>
                        <td><span className={"badge " + (e.slip_id ? 'badge-success' : 'badge-danger')}>{e.slip_id ? 'Generated' : 'Pending'}</span></td>
                      </tr>
                    ))}
                    {!salaryDetails.length && <tr><td colSpan="4"><div className="empty-state"><p>No records found</p></div></td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
};

export default Dashboard;

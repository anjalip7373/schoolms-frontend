import React, { useState, useEffect } from 'react';
import AppLayout from '../components/layout/AppLayout';
import API from '../utils/api';
import { toast } from 'react-toastify';
import { useAuth } from '../context/AuthContext';

const Dashboard = () => {
  const [data, setData] = useState({
    fees: { total: 0, paid: 0, not_paid: 0, paid_students: [], not_paid_students: [], all_students: [] },
    salary: { total: 0, generated: 0, not_generated: 0, generated_list: [], not_generated_list: [], all_employees: [] },
    classes: []
  });
  const { user } = useAuth();
  const isTeacher = user?.role === 'Teacher' || user?.role === 'teacher';
  const [loading, setLoading] = useState(true);
  const [selectedClass, setSelectedClass] = useState('');
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());

  // Modal state: null = closed, string = which list to show
  const [modal, setModal] = useState(null);
  // modal values: 'fee_paid' | 'fee_not_paid' | 'fee_all' | 'salary_generated' | 'salary_not_generated' | 'salary_all'

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

  const years = [];
  for (let y = 2020; y <= new Date().getFullYear() + 1; y++) years.push(y);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  // Get modal config based on type
  const getModalConfig = () => {
    switch (modal) {
      case 'fee_paid':
        return { title: '✅ Fee Paid Students', rows: data?.fees?.paid_students || [], type: 'student' };
      case 'fee_not_paid':
        return { title: '❌ Fee Not Paid Students', rows: data?.fees?.not_paid_students || [], type: 'student' };
      case 'fee_all':
        return { title: '👥 All Students', rows: data?.fees?.all_students || [], type: 'student' };
      case 'salary_generated':
        return { title: '📄 Salary Generated', rows: data?.salary?.generated_list || [], type: 'employee' };
      case 'salary_not_generated':
        return { title: '⏳ Salary Not Generated', rows: data?.salary?.not_generated_list || [], type: 'employee' };
      case 'salary_all':
        return { title: '👨‍💼 All Employees', rows: data?.salary?.all_employees || [], type: 'employee' };
      default:
        return { title: '', rows: [], type: 'student' };
    }
  };

  const modalConfig = getModalConfig();

  const cardStyle = {
    background: '#fff',
    borderRadius: '16px',
    padding: '24px',
    border: '1px solid #e2e8f0',
    boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    position: 'relative',
    overflow: 'hidden',
  };

  const clickableCardStyle = {
    ...cardStyle,
    cursor: 'pointer',
    transition: 'transform 0.15s, box-shadow 0.15s',
  };

  return (
    <AppLayout title="Dashboard" subtitle="School overview and statistics">

      {/* Filters */}
      <div style={{display:'flex', alignItems:'center', background:'#fff', padding:'16px 20px', borderRadius:'12px', marginBottom:'20px', border:'1px solid #e2e8f0', flexWrap:'wrap', gap:'12px'}}>
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

      {loading ? (
        <div className="loading"><div className="spinner"></div><p>Loading dashboard...</p></div>
      ) : (
        <>
          {/* ── FEE SUMMARY ─────────────────────────────────────────────── */}
          <div style={{marginBottom:'12px'}}>
            <h3 style={{fontWeight:700, fontSize:'14px', color:'#64748b', textTransform:'uppercase', letterSpacing:'0.5px'}}>💰 Fee Summary</h3>
          </div>
          <div className="stats-grid" style={{marginBottom:'28px'}}>

            {/* Total Students — clickable */}
            <div
              style={{...clickableCardStyle, borderLeft:'4px solid #3b82f6'}}
              onClick={() => setModal('fee_all')}
              onMouseEnter={e => { e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='0 4px 12px rgba(0,0,0,0.1)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow='0 1px 4px rgba(0,0,0,0.05)'; }}
            >
              <span style={{fontSize:'28px'}}>👥</span>
              <span style={{fontSize:'13px', color:'#64748b', fontWeight:600}}>Total Students</span>
              <span style={{fontSize:'32px', fontWeight:800, color:'#1e293b'}}>{data?.fees?.total ?? 0}</span>
              <span style={{fontSize:'12px', color:'#3b82f6', fontWeight:500}}>Click to view details →</span>
            </div>

            {/* Fee Paid — clickable */}
            <div
              style={{...clickableCardStyle, borderLeft:'4px solid #22c55e'}}
              onClick={() => setModal('fee_paid')}
              onMouseEnter={e => { e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='0 4px 12px rgba(0,0,0,0.1)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow='0 1px 4px rgba(0,0,0,0.05)'; }}
            >
              <span style={{fontSize:'28px'}}>✅</span>
              <span style={{fontSize:'13px', color:'#64748b', fontWeight:600}}>Fee Paid</span>
              <span style={{fontSize:'32px', fontWeight:800, color:'#16a34a'}}>{data?.fees?.paid ?? 0}</span>
              <span style={{fontSize:'12px', color:'#22c55e', fontWeight:500}}>Click to view details →</span>
            </div>

            {/* Fee Not Paid — clickable */}
            <div
              style={{...clickableCardStyle, borderLeft:'4px solid #ef4444'}}
              onClick={() => setModal('fee_not_paid')}
              onMouseEnter={e => { e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='0 4px 12px rgba(0,0,0,0.1)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow='0 1px 4px rgba(0,0,0,0.05)'; }}
            >
              <span style={{fontSize:'28px'}}>❌</span>
              <span style={{fontSize:'13px', color:'#64748b', fontWeight:600}}>Fee Not Paid</span>
              <span style={{fontSize:'32px', fontWeight:800, color:'#dc2626'}}>{data?.fees?.not_paid ?? 0}</span>
              <span style={{fontSize:'12px', color:'#ef4444', fontWeight:500}}>Click to view details →</span>
            </div>
          </div>

          {/* ── SALARY SUMMARY ───────────────────────────────────────────── */}
          {!isTeacher && (
            <>
              <div style={{marginBottom:'12px'}}>
                <h3 style={{fontWeight:700, fontSize:'14px', color:'#64748b', textTransform:'uppercase', letterSpacing:'0.5px'}}>💵 Salary Summary</h3>
              </div>
              <div className="stats-grid">

                {/* Total Employees — clickable */}
                <div
                  style={{...clickableCardStyle, borderLeft:'4px solid #3b82f6'}}
                  onClick={() => setModal('salary_all')}
                  onMouseEnter={e => { e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='0 4px 12px rgba(0,0,0,0.1)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow='0 1px 4px rgba(0,0,0,0.05)'; }}
                >
                  <span style={{fontSize:'28px'}}>👨‍💼</span>
                  <span style={{fontSize:'13px', color:'#64748b', fontWeight:600}}>Total Employees</span>
                  <span style={{fontSize:'32px', fontWeight:800, color:'#1e293b'}}>{data?.salary?.total ?? 0}</span>
                  <span style={{fontSize:'12px', color:'#3b82f6', fontWeight:500}}>Click to view details →</span>
                </div>

                {/* Salary Generated — clickable */}
                <div
                  style={{...clickableCardStyle, borderLeft:'4px solid #22c55e'}}
                  onClick={() => setModal('salary_generated')}
                  onMouseEnter={e => { e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='0 4px 12px rgba(0,0,0,0.1)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow='0 1px 4px rgba(0,0,0,0.05)'; }}
                >
                  <span style={{fontSize:'28px'}}>📄</span>
                  <span style={{fontSize:'13px', color:'#64748b', fontWeight:600}}>Salary Generated</span>
                  <span style={{fontSize:'32px', fontWeight:800, color:'#16a34a'}}>{data?.salary?.generated ?? 0}</span>
                  <span style={{fontSize:'12px', color:'#22c55e', fontWeight:500}}>Click to view details →</span>
                </div>

                {/* Not Generated — clickable */}
                <div
                  style={{...clickableCardStyle, borderLeft:'4px solid #ef4444'}}
                  onClick={() => setModal('salary_not_generated')}
                  onMouseEnter={e => { e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='0 4px 12px rgba(0,0,0,0.1)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow='0 1px 4px rgba(0,0,0,0.05)'; }}
                >
                  <span style={{fontSize:'28px'}}>⏳</span>
                  <span style={{fontSize:'13px', color:'#64748b', fontWeight:600}}>Not Generated</span>
                  <span style={{fontSize:'32px', fontWeight:800, color:'#dc2626'}}>{data?.salary?.not_generated ?? 0}</span>
                  <span style={{fontSize:'12px', color:'#ef4444', fontWeight:500}}>Click to view details →</span>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* ── UNIFIED MODAL ──────────────────────────────────────────────────── */}
      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{maxWidth:'600px'}}>
            <div className="modal-header">
              <h2>{modalConfig.title}</h2>
              <button className="modal-close" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              {/* Desktop: table view */}
              <div className="table-wrapper dashboard-modal-table desktop-table-view">
                {modalConfig.type === 'student' ? (
                  <table>
                    <thead>
                      <tr><th>Roll No</th><th>Name</th><th>Class</th></tr>
                    </thead>
                    <tbody>
                      {modalConfig.rows.map(s => (
                        <tr key={s.id}>
                          <td><code style={{fontFamily:'JetBrains Mono', fontSize:'12px', background:'#f1f5f9', padding:'2px 6px', borderRadius:'4px'}}>{s.roll_no}</code></td>
                          <td><strong>{s.full_name}</strong></td>
                          <td>{s.class_name}</td>
                        </tr>
                      ))}
                      {!modalConfig.rows.length && (
                        <tr><td colSpan="3"><div className="empty-state"><p>No records found</p></div></td></tr>
                      )}
                    </tbody>
                  </table>
                ) : (
                  <table>
                    <thead>
                      <tr><th>Emp ID</th><th>Name</th><th>Role</th></tr>
                    </thead>
                    <tbody>
                      {modalConfig.rows.map(e => (
                        <tr key={e.id}>
                          <td><code style={{fontFamily:'JetBrains Mono', fontSize:'12px', background:'#f1f5f9', padding:'2px 6px', borderRadius:'4px'}}>{e.emp_id}</code></td>
                          <td><strong>{e.full_name}</strong></td>
                          <td>{e.role_name}</td>
                        </tr>
                      ))}
                      {!modalConfig.rows.length && (
                        <tr><td colSpan="3"><div className="empty-state"><p>No records found</p></div></td></tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Mobile: card view */}
              <div className="mobile-card-list">
                {modalConfig.type === 'student' ? (
                  modalConfig.rows.map(s => (
                    <div className="data-card" key={s.id}>
                      <div className="data-card-row">
                        <span className="dc-label">Roll No</span>
                        <span className="dc-value"><code style={{fontFamily:'JetBrains Mono', fontSize:'12px', background:'#f1f5f9', padding:'2px 6px', borderRadius:'4px'}}>{s.roll_no}</code></span>
                      </div>
                      <div className="data-card-row">
                        <span className="dc-label">Name</span>
                        <span className="dc-value"><strong>{s.full_name}</strong></span>
                      </div>
                      <div className="data-card-row">
                        <span className="dc-label">Class</span>
                        <span className="dc-value">{s.class_name}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  modalConfig.rows.map(e => (
                    <div className="data-card" key={e.id}>
                      <div className="data-card-row">
                        <span className="dc-label">Emp ID</span>
                        <span className="dc-value"><code style={{fontFamily:'JetBrains Mono', fontSize:'12px', background:'#f1f5f9', padding:'2px 6px', borderRadius:'4px'}}>{e.emp_id}</code></span>
                      </div>
                      <div className="data-card-row">
                        <span className="dc-label">Name</span>
                        <span className="dc-value"><strong>{e.full_name}</strong></span>
                      </div>
                      <div className="data-card-row">
                        <span className="dc-label">Role</span>
                        <span className="dc-value">{e.role_name}</span>
                      </div>
                    </div>
                  ))
                )}
                {!modalConfig.rows.length && (
                  <div className="empty-state"><p>No records found</p></div>
                )}
              </div>

              <div style={{padding:'12px 0 0', color:'#64748b', fontSize:'13px', textAlign:'right'}}>
                Total: <strong>{modalConfig.rows.length}</strong>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
};

export default Dashboard;
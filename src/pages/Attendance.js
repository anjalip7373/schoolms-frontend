import React, { useState, useEffect } from 'react';
import AppLayout from '../components/layout/AppLayout';
import API from '../utils/api';
import { toast } from 'react-toastify';
import { useAuth } from '../context/AuthContext';

// Class level grouping for the "All Levels" filter (Pre-Primary: Jr/Sr Kg, Primary: 1-8, Secondary: 9-10)
const levelOfClass = (name) => {
  const n = String(name || '').toLowerCase();
  if (/nursery|play\s*group|pre[- ]?primary|kindergarten|\b[lu]\.?\s*kg\b|\bjr\.?\s*kg\b|\bsr\.?\s*kg\b|junior\s*kg|senior\s*kg|\bkg\b/.test(n)) return 'Pre-Primary';
  const m = n.match(/(\d+)/);
  if (!m) return '';
  const num = parseInt(m[1], 10);
  if (num >= 1 && num <= 8) return 'Primary';
  if (num >= 9) return 'Secondary';
  return '';
};

const Attendance = () => {
  const { user } = useAuth();
  const isTeacher = user?.role === 'Teacher' || user?.role === 'teacher';

  const [records, setRecords] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [personType, setPersonType] = useState('student');
  const [classFilter, setClassFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    if (!isTeacher) {
      API.get('/config/classes').then(r => setClasses(r.data));
    }
  }, []);

  const fetchAttendance = async () => {
    setLoading(true);
    try {
      const params = { date: today, person_type: personType };
      // Admin/Principal can filter by class
      if (!isTeacher && classFilter) params.class_id = classFilter;
      const { data } = await API.get('/attendance', { params });
      setRecords(data.attendance || []);
    } catch (err) { toast.error('Failed to load attendance'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchAttendance(); }, [personType, classFilter]);

  const setStatus = (id, status) => {
    setRecords(prev => prev.map(r =>
      r.id === id && r.person_type === personType ? { ...r, status } : r
    ));
  };

  const markAllPresent = () => {
    setRecords(prev => prev.map(r => {
      if (r.person_type !== personType) return r;
      if (r.person_type === 'student' && levelFilter && levelOfClass(r.class_name) !== levelFilter) return r;
      const isDeactivated = r.person_type === 'student' ? (r.fee_status && r.fee_status !== 'active') : !r.is_active;
      if (isDeactivated) return r;
      return { ...r, status: 'present' };
    }));
  };

  const saveAttendance = async () => {
  setSaving(true);
  try {
    const payload = records
      .filter(r => r.person_type === personType)
      .filter(r => personType !== 'student' || !levelFilter || levelOfClass(r.class_name) === levelFilter)
      .map(r => ({
        person_type: r.person_type,
        person_id: r.id,
        status: r.status
      }));

    await API.post('/attendance', {
      attendance_date: today,
      records: payload
    });

    toast.success('Attendance saved successfully!');

    // WhatsApp notifications for absent/late/halfday students
    if (personType === 'student') {
      const notifyStudents = records.filter(r =>
        r.person_type === 'student' && (!levelFilter || levelOfClass(r.class_name) === levelFilter) && ['absent', 'late', 'halfday'].includes(r.status) &&
        !(r.fee_status && r.fee_status !== 'active')
      );

      if (notifyStudents.length > 0) {
        setTimeout(() => {
          notifyStudents.forEach((student, index) => {
            setTimeout(() => {
              const phone = student.whatsapp_no || student.phone;
              if (!phone) return;

              const statusEmoji = { absent: '❌', late: '⏰', halfday: '🌓' };
              const statusText = { absent: 'ABSENT', late: 'LATE', halfday: 'HALF DAY' };

              const message =
                `🏫 *SchoolMS Attendance Alert*\n\n` +
                `${statusEmoji[student.status]} Dear Parent/Guardian,\n\n` +
                `Your child *${student.full_name}* has been marked *${statusText[student.status]}* today.\n\n` +
                `👤 Student: *${student.full_name}*\n` +
                `🎯 Roll No: *${student.identifier}*\n` +
                `🏫 Class: *${student.class_name}*\n` +
                `📅 Date: *${today}*\n\n` +
                `_SchoolMS - School Management System_`;

              const cleaned = phone.toString().replace(/[\s\-\(\)]/g, '');
              const withCountry = cleaned.startsWith('91') ? cleaned : '91' + cleaned;
              window.open(`https://wa.me/${withCountry}?text=${encodeURIComponent(message)}`, '_blank');
            }, index * 2000);
          });
          toast.info(`📱 Sending WhatsApp notifications to ${notifyStudents.length} student(s)...`);
        }, 500);
      }
    }

  } catch (err) {
    toast.error(err.response?.data?.message || 'Failed to save attendance');
  } finally {
    setSaving(false);
  }
};


  
  const currentRecords = records.filter(r =>
    r.person_type === personType &&
    (personType !== 'student' || !levelFilter || levelOfClass(r.class_name) === levelFilter)
  );
  const counts = ['present','absent','late','halfday'].reduce((acc, s) => {
    acc[s] = currentRecords.filter(r => r.status === s).length;
    return acc;
  }, {});

  return (
    <AppLayout title="Daily Attendance" subtitle={`Mark attendance for ${today}`}>
      <div className="page-header">
        <div>
          <h1>Daily Attendance</h1>
          <p>📅 {new Date().toLocaleDateString('en-IN', {weekday:'long', year:'numeric', month:'long', day:'numeric'})}</p>
        </div>
        <div style={{display:'flex', gap:'10px', flexWrap:'wrap'}}>
          <button className="btn btn-success" onClick={markAllPresent}>✅ Mark All Present</button>
          <button className="btn btn-primary" onClick={saveAttendance} disabled={saving}>
            {saving ? '⏳ Saving...' : '💾 Save Attendance'}
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="stats-grid" style={{marginBottom:'20px'}}>
        <div className="stat-card green static"><span className="stat-icon">✅</span><span className="stat-label">Present</span><span className="stat-value">{counts.present || 0}</span></div>
        <div className="stat-card red static"><span className="stat-icon">❌</span><span className="stat-label">Absent</span><span className="stat-value">{counts.absent || 0}</span></div>
        <div className="stat-card yellow static"><span className="stat-icon">⏰</span><span className="stat-label">Late</span><span className="stat-value">{counts.late || 0}</span></div>
        <div className="stat-card blue static"><span className="stat-icon">🌓</span><span className="stat-label">Half Day</span><span className="stat-value">{counts.halfday || 0}</span></div>
      </div>

      {/* Filters Row */}
      <div style={{background:'#fff', padding:'16px 20px', borderRadius:'12px', marginBottom:'20px', border:'1px solid #e2e8f0'}}>
      <div className="filter-bar" style={{flexWrap:'wrap'}}>
        {/* Level filter — narrows the class list and the records shown */}
        {!isTeacher && (
          <select
            className="form-control"
            style={{minWidth:'140px'}}
            disabled={personType !== 'student'}
            value={levelFilter}
            onChange={e => {
              const lvl = e.target.value;
              setLevelFilter(lvl);
              const sel = classes.find(c => c.id == classFilter);
              if (sel && (!lvl || levelOfClass(sel.name) !== lvl)) setClassFilter('');
            }}>
            <option value="">All Levels</option><option value="Pre-Primary">Pre-Primary</option><option value="Primary">Primary</option><option value="Secondary">Secondary</option>
          </select>
        )}

        {/* Class filter — only for admin/principal/other employees, not teacher */}
        {!isTeacher && (
          <select
            className="form-control"
            style={{minWidth:'160px'}}
            disabled={personType !== 'student' || !levelFilter}
            value={classFilter}
            onChange={e => setClassFilter(e.target.value)}>
            <option value="">All Classes</option>
            {classes.filter(c => !levelFilter || levelOfClass(c.name) === levelFilter).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}

        {/* Student/Employee toggle */}
        {isTeacher ? (
          <div style={{background:'#1e40af', color:'#fff', padding:'8px 16px', borderRadius:'8px', fontSize:'14px', fontWeight:'600'}}>
            👨‍🎓 Students
          </div>
        ) : (
          <button
            className={"btn " + (personType === 'student' ? 'btn-primary' : 'btn-outline')}
            onClick={() => setPersonType('student')}>
            👨‍🎓 Students
          </button>
        )}
        {!isTeacher && (
          <button
            className={"btn " + (personType === 'employee' ? 'btn-primary' : 'btn-outline')}
            onClick={() => setPersonType('employee')}>
            👨‍💼 Employees
          </button>
        )}

        {isTeacher && (
          <div style={{background:'#dbeafe', padding:'6px 14px', borderRadius:'8px', fontSize:'13px', fontWeight:'600', color:'#1e40af'}}>
            📚 Your class students only
          </div>
        )}
      </div>
      </div>

      <div className="card">
        {loading ? <div className="loading"><div className="spinner"></div></div> : (
          <>
            {/* Desktop: table view */}
            <div className="desktop-table-view">
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>{personType === 'student' ? 'Roll No' : 'Emp ID'}</th>
                      <th>Name</th>
                      {personType === 'student' && <th>Class</th>}
                      <th>Mark Attendance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentRecords.map((r, i) => {
                      const isDeactivated = personType === 'student' ? (r.fee_status && r.fee_status !== 'active') : !r.is_active;
                      return (
                      <tr key={r.id + '-' + r.person_type} style={isDeactivated ? {background:'#fef2f2', opacity:0.7} : undefined}>
                        <td data-label="#">{i + 1}</td>
                        <td data-label={personType === 'student' ? 'Roll No' : 'Emp ID'}>
                          <code style={{fontFamily:'JetBrains Mono', fontSize:'12px', background:'#f1f5f9', padding:'2px 6px', borderRadius:'4px'}}>
                            {r.identifier}
                          </code>
                        </td>
                        <td data-label="Name">
                          <strong>{r.full_name}</strong>
                          {isDeactivated && (
                            <span style={{marginLeft:'8px', background:'#fee2e2', color:'#dc2626', padding:'2px 7px', borderRadius:'8px', fontSize:'10px', fontWeight:'800'}}>DEACTIVATED</span>
                          )}
                        </td>
                        {personType === 'student' && <td data-label="Class">{r.class_name}</td>}
                        <td data-label="Mark Attendance">
                          <div className="attendance-status-btns">
                            {['present','absent','late','halfday'].map(s => (
                              <button
                                key={s}
                                disabled={isDeactivated}
                                className={"att-btn " + s + (r.status === s ? ' active' : '')}
                                style={isDeactivated ? {opacity:0.4, cursor:'not-allowed'} : undefined}
                                onClick={() => setStatus(r.id, s)}>
                                {s === 'present' ? 'P' : s === 'absent' ? 'A' : s === 'late' ? 'L' : 'H'}
                              </button>
                            ))}
                          </div>
                        </td>
                      </tr>
                      );
                    })}
                    {!currentRecords.length && (
                      <tr>
                        <td colSpan="6">
                          <div className="empty-state">
                            <div className="empty-icon">📋</div>
                            <p>No records found</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile: card view */}
            <div className="mobile-card-list" style={{ padding: currentRecords.length ? '16px' : '0' }}>
              {currentRecords.map((r, i) => {
                const isDeactivated = personType === 'student' ? (r.fee_status && r.fee_status !== 'active') : !r.is_active;
                return (
                  <div className="data-card" key={r.id + '-' + r.person_type} style={isDeactivated ? {background:'#fef2f2'} : undefined}>
                    <div className="data-card-row">
                      <span className="dc-label">#</span>
                      <span className="dc-value">{i + 1}</span>
                    </div>
                    <div className="data-card-row">
                      <span className="dc-label">{personType === 'student' ? 'Roll No' : 'Emp ID'}</span>
                      <span className="dc-value">
                        <code style={{fontFamily:'JetBrains Mono', fontSize:'12px', background:'#f1f5f9', padding:'2px 6px', borderRadius:'4px'}}>
                          {r.identifier}
                        </code>
                      </span>
                    </div>
                    <div className="data-card-row">
                      <span className="dc-label">Name</span>
                      <span className="dc-value">
                        <strong>{r.full_name}</strong>
                        {isDeactivated && (
                          <span style={{marginLeft:'8px', background:'#fee2e2', color:'#dc2626', padding:'2px 7px', borderRadius:'8px', fontSize:'10px', fontWeight:'800'}}>DEACTIVATED</span>
                        )}
                      </span>
                    </div>
                    {personType === 'student' && (
                      <div className="data-card-row">
                        <span className="dc-label">Class</span>
                        <span className="dc-value">{r.class_name}</span>
                      </div>
                    )}
                    <div className="data-card-row">
                      <span className="dc-label">Mark Attendance</span>
                      <span className="dc-value">
                        <div className="attendance-status-btns">
                          {['present','absent','late','halfday'].map(s => (
                            <button
                              key={s}
                              disabled={isDeactivated}
                              className={"att-btn " + s + (r.status === s ? ' active' : '')}
                              style={isDeactivated ? {opacity:0.4, cursor:'not-allowed'} : undefined}
                              onClick={() => setStatus(r.id, s)}>
                              {s === 'present' ? 'P' : s === 'absent' ? 'A' : s === 'late' ? 'L' : 'H'}
                            </button>
                          ))}
                        </div>
                      </span>
                    </div>
                  </div>
                );
              })}
              {!currentRecords.length && (
                <div className="empty-state">
                  <div className="empty-icon">📋</div>
                  <p>No records found</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
};

export default Attendance;
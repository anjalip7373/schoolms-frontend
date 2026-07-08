import React, { useState, useEffect } from 'react';
import AppLayout from '../components/layout/AppLayout';
import API from '../utils/api';
import { toast } from 'react-toastify';
import { useAuth } from '../context/AuthContext';

const emptyForm = {
  full_name:'', role_id:'', login_user_id:'', login_password:'',
  phone:'', email:'', qualification:'', subject:'', salary:'', joining_date:'', class_assigned:''
};

const EmployeePage = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [activeTab, setActiveTab] = useState('employee');
  const [employees, setEmployees] = useState([]);
  const [roles, setRoles] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [allSubjects, setAllSubjects] = useState([]);
  const [classSubjects, setClassSubjects] = useState([]);
  const [selectedSubjectIds, setSelectedSubjectIds] = useState([]);

  const isPrincipalTab = activeTab === 'principal';
  const selectedRole = roles.find(r => r.id == form.role_id);
  const isTeacherRole = selectedRole?.name?.toLowerCase() === 'teacher';

 const fetchAll = async () => {
  setLoading(true);
  try {
    const [empRes, rolesRes, classesRes, subjectsRes] = await Promise.all([
      API.get('/employees'),
      API.get('/config/roles'),
      API.get('/config/classes'),
      API.get('/subjects'),
    ]);
    // ✅ Sort by emp_id ascending (EMP001, EMP002, EMP003...)
const sorted = empRes.data
  .filter(e => e.role_name !== 'admin')
  .sort((a, b) => a.emp_id.localeCompare(b.emp_id, undefined, { numeric: true }));
setEmployees(sorted);
    setRoles(rolesRes.data);
    setClasses(classesRes.data);
    setAllSubjects(subjectsRes.data); // ← was never being set
  } catch (err) { toast.error('Failed to load data'); }
  finally { setLoading(false); }
};


  useEffect(() => {
    if (form.class_assigned) {
      API.get('/class-subjects', { params: { class_id: form.class_assigned } })
        .then(r => setClassSubjects(r.data))
        .catch(() => setClassSubjects([]));
    } else {
      setClassSubjects([]);
      setSelectedSubjectIds([]);
    }
  }, [form.class_assigned]);

  useEffect(() => { fetchAll(); }, []);

  const openAdd = () => {
    setForm(emptyForm);
    setEditMode(false);
    setEditId(null);
    setShowModal(true);
  };

  const openEdit = async (e) => {
    setForm({
      full_name: e.full_name, role_id: e.role_id,
      login_user_id: e.login_user_id, login_password: '',
      phone: e.phone, email: e.email || '',
      qualification: e.qualification,
      subject: e.subject || '', salary: e.salary,
      joining_date: e.joining_date?.split('T')[0],
      class_assigned: e.class_assigned
    });
    setEditMode(true);
    setEditId(e.id);
    // Load assigned subjects
    try {
      const { data } = await API.get('/teacher-assigned-subjects', { params: { teacher_id: e.id } });
      setSelectedSubjectIds(data.map(s => s.subject_id));
    } catch { setSelectedSubjectIds([]); }
    setShowModal(true);
  };

  const handleDeactivate = async (emp) => {
    const action = emp.is_active === 1 || emp.is_active === true ? 'deactivate' : 'activate';
    if (!window.confirm(`Are you sure you want to ${action} "${emp.full_name}"?`)) return;
    try {
      await API.put(`/employees/${emp.id}/toggle-status`);
      toast.success(`${action}d successfully!`);
      fetchAll();
    } catch (err) { toast.error('Failed'); }
  };

const handleSubmit = async (ev) => {
  ev.preventDefault();

  // ✅ Password validation for new staff only
  if (!editMode) {
    const pwd = form.login_password;
    const hasUpper = /[A-Z]/.test(pwd);
    const hasLower = /[a-z]/.test(pwd);
    const hasNumber = /[0-9]/.test(pwd);
    const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pwd);
    const hasMinLength = pwd.length >= 8;

    if (!hasMinLength || !hasUpper || !hasLower || !hasNumber || !hasSpecial) {
      toast.error('Password must be 8+ chars with uppercase, lowercase, number & special character');
      return;
    }
  }

  setSaving(true);
  try {
      let empId = editId;
      if (editMode) {
        await API.put(`/employees/${editId}`, form);
        toast.success('Updated successfully!');
      } else {
        const { data } = await API.post('/employees', form);
        empId = data.id;
        toast.success(`Added! Emp ID: ${data.emp_id}`);
      }
      // Save teacher subjects if teacher role
      if (isTeacherRole && empId) {
        await API.post('/teacher-assigned-subjects', {
          teacher_id: empId,
          subject_ids: selectedSubjectIds
        });
      }
      setShowModal(false);
      setSelectedSubjectIds([]);
      fetchAll();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  const currentList = isPrincipalTab ? principals : employees;

  const getFilteredRoles = () => {
    if (isAdmin) {
      return roles.filter(r => r.name !== 'admin');
    }
    return roles.filter(r => !['admin', 'principal'].includes(r.name));
  };

  return (
    <AppLayout title="Employees" subtitle="Manage employees and principals">
      <div className="page-header">
        <div>
          <h1>Staff Management</h1>
          <p>Total: {employees.length} staff members</p>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>
          ➕ Add Staff
        </button>
      </div>

  
      {/* Table */}
      <div className="card">
        <div className="table-wrapper employees-table">
          {loading ? <div className="loading"><div className="spinner"></div></div> : (
            <table>
              <thead>
                <tr>
                  <th>Emp ID</th>
                  <th>Name</th>
                  <th>Role</th>
                  <th>User ID</th>
                  <th>Phone</th>
                  <th>Class</th>
                  <th>Subject</th>
                  <th>Salary</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {currentList.map(e => (
                  <tr key={e.id}>
                    <td>
                      <code style={{fontFamily:'JetBrains Mono', fontSize:'12px', background:'#f1f5f9', padding:'2px 6px', borderRadius:'4px'}}>
                        {e.emp_id}
                      </code>
                    </td>
                    <td><strong>{e.full_name}</strong></td>
                    <td><span className="badge badge-info">{e.role_name}</span></td>
                    <td>
                      <code style={{fontFamily:'JetBrains Mono', fontSize:'12px', background:'#f1f5f9', padding:'2px 6px', borderRadius:'4px'}}>
                        {e.login_user_id}
                      </code>
                    </td>
                    <td>{e.phone}</td>
                    <td>{e.class_name || '—'}</td>
                    <td>{e.subject || '—'}</td>
                    <td>Rs. {parseFloat(e.salary || 0).toLocaleString()}</td>
                    <td>
                      <span className={"badge " + (e.is_active ? 'badge-success' : 'badge-danger')}>
                        {e.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <div style={{display:'flex', gap:'6px'}}>
                        {e.is_active ? (
                          <button className="btn btn-outline btn-sm" onClick={() => openEdit(e)}>✏️ Edit</button>
                        ) : null}
                        <button
                          className={"btn btn-sm " + (e.is_active ? 'btn-warning' : 'btn-success')}
                          onClick={() => handleDeactivate(e)}>
                          {e.is_active ? '🔴 Deactivate' : '🟢 Activate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!currentList.length && !loading && (
                  <tr>
                    <td colSpan="10">
                      <div className="empty-state">
                      <div className="empty-icon">👨‍💼</div>
                      <p>No staff members found</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{maxWidth:'700px'}}>
            <div className="modal-header">
              <h2>{editMode ? '✏️ Edit Staff Member' : '➕ Add Staff Member'}</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-grid">
                  {editMode && (
                    <div className="form-group">
                      <label>Emp ID</label>
                      <input className="form-control" value={editId} disabled />
                    </div>
                  )}
                  <div className="form-group" style={editMode ? {} : {gridColumn:'1/-1'}}>
                    <label>Full Name <span>*</span></label>
                    <input className="form-control" value={form.full_name}
                      onChange={e => setForm({...form, full_name: e.target.value})}
                      required placeholder="Full name" />
                  </div>
                  {!editMode && (
                    <div className="form-group">
                      <label>Role <span>*</span></label>
                      <select className="form-control" value={form.role_id}
                        onChange={e => setForm({...form, role_id: e.target.value})} required>
                        <option value="">Select Role</option>
                        {getFilteredRoles().map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                    </div>
                  )}
                  {!editMode && (
                    <>
                      <div className="form-group">
                        <label>Login User ID <span>*</span></label>
                        <input className="form-control" value={form.login_user_id}
                          onChange={e => setForm({...form, login_user_id: e.target.value})}
                          required placeholder="Login username" />
                      </div>
                      <div className="form-group">
  <label>Login Password <span>*</span></label>
  <input type="password" className="form-control" value={form.login_password}
    onChange={e => setForm({...form, login_password: e.target.value})}
    required placeholder="Password" />
  {/* ✅ Live password strength indicators */}
  {form.login_password && (
    <div style={{marginTop:'6px', display:'flex', flexWrap:'wrap', gap:'4px'}}>
      {[
        { label: '8+ chars',        ok: form.login_password.length >= 8 },
        { label: 'Uppercase',       ok: /[A-Z]/.test(form.login_password) },
        { label: 'Lowercase',       ok: /[a-z]/.test(form.login_password) },
        { label: 'Number',          ok: /[0-9]/.test(form.login_password) },
        { label: 'Special (!@#..)', ok: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(form.login_password) },
      ].map(({ label, ok }) => (
        <span key={label} style={{
          fontSize:'11px', fontWeight:'600', padding:'2px 8px', borderRadius:'20px',
          background: ok ? '#dcfce7' : '#fee2e2',
          color: ok ? '#16a34a' : '#dc2626'
        }}>
          {ok ? '✓' : '✗'} {label}
        </span>
      ))}
    </div>
  )}
</div>
                    </>
                  )}
                  <div className="form-group">
                    <label>Phone No <span>*</span></label>
                    <input className="form-control" value={form.phone}
                      onChange={e => setForm({...form, phone: e.target.value})}
                      required placeholder="Phone number" />
                  </div>
                  <div className="form-group">
                    <label>Email <span>*</span></label>
                    <input type="email" className="form-control" value={form.email || ''}
                      onChange={e => setForm({...form, email: e.target.value})}
                      required placeholder="Email address" />
                  </div>
                  <div className="form-group">
                    <label>Qualification <span>*</span></label>
                 
                    <input className="form-control" value={form.qualification}
                      onChange={e => setForm({...form, qualification: e.target.value})}
                      required placeholder="e.g. B.Ed, M.A." />
                  </div>
                  {isTeacherRole && (
                    <div className="form-group">
                      <label>Class Assigned</label>
                      <select className="form-control" value={form.class_assigned}
                        onChange={e => setForm({...form, class_assigned: e.target.value})}>
                        <option value="">No Class</option>
                        {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                  )}
                  {isTeacherRole && (
                    <div className="form-group">
                      <label>Subject <span>*</span></label>
                      <input className="form-control" value={form.subject}
                        onChange={e => setForm({...form, subject: e.target.value})}
                        required placeholder="Subject taught" />
                    </div>
                  )}


                  {isTeacherRole && classSubjects.length > 0 && (
                    <div className="form-group" style={{gridColumn:'1/-1'}}>
                      <label>Subjects Assigned to This Teacher</label>
                      <div style={{display:'flex', flexWrap:'wrap', gap:'8px', padding:'10px', background:'#f8fafc', borderRadius:'8px', border:'1px solid #e2e8f0'}}>
                        {classSubjects.map(cs => (
                          <label key={cs.id} style={{display:'flex', alignItems:'center', gap:'6px', cursor:'pointer', padding:'6px 10px', background:'#fff', borderRadius:'6px', border:`1px solid ${selectedSubjectIds.includes(cs.subject_id) ? '#1e40af' : '#e2e8f0'}`, fontSize:'13px', fontWeight:'600'}}>
                            <input
                              type="checkbox"
                              checked={selectedSubjectIds.includes(cs.subject_id)}
                              onChange={e => {
                                if (e.target.checked) {
                                  setSelectedSubjectIds(prev => [...prev, cs.subject_id]);
                                } else {
                                  setSelectedSubjectIds(prev => prev.filter(id => id !== cs.subject_id));
                                }
                              }}
                            />
                            {cs.subject_name}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="form-group">
                    <label>Salary (Rs.) <span>*</span></label>
                    <input type="number" className="form-control" value={form.salary}
                      onChange={e => setForm({...form, salary: e.target.value})}
                      required placeholder="0.00" />
                  </div>
                  <div className="form-group">
                    <label>Joining Date <span>*</span></label>
                    <input type="date" className="form-control" value={form.joining_date}
                      onChange={e => setForm({...form, joining_date: e.target.value})} required />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? '⏳ Saving...' : (editMode ? '💾 Update' : '✅ Add')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      
    </AppLayout>  
  );
};


export default EmployeePage;
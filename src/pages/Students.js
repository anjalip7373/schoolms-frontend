import React, { useState, useEffect } from 'react';
import AppLayout from '../components/layout/AppLayout';
import API from '../utils/api';
import { toast } from 'react-toastify';
import { useAuth } from '../context/AuthContext';

const emptyForm = { full_name:'', class_id:'', phone:'', whatsapp_no:'', email:'', date_of_birth:'', address:'', fee_status:'active' };

const Students = () => {
  const { user } = useAuth();
  const isTeacher = user?.role === 'Teacher' || user?.role === 'teacher';

  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [teacherClassId, setTeacherClassId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);

  const fetchClasses = async () => {
    const { data } = await API.get('/config/classes');
    setClasses(data);
  };

  // Get teacher's assigned class
  const fetchTeacherClass = async () => {
    if (!isTeacher) return;
    try {
      const { data } = await API.get('/employees/' + user.id);
      const classId = data.class_assigned;
      setTeacherClassId(classId);
      setClassFilter(classId); // auto-filter to their class
    } catch (err) {}
  };

  const fetchStudents = async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      // Teacher always filtered to their class
      if (isTeacher && teacherClassId) {
        params.class_id = teacherClassId;
      } else if (classFilter) {
        params.class_id = classFilter;
      }
      
      const { data } = await API.get('/students', { params });
// ✅ Sort by roll_no ascending (STU001, STU002, STU003...)
const sorted = data.sort((a, b) => a.roll_no.localeCompare(b.roll_no, undefined, { numeric: true }));
setStudents(sorted);
      
    } catch (err) { toast.error('Failed to load students'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchClasses(); fetchTeacherClass(); }, []);
  useEffect(() => { fetchStudents(); }, [search, classFilter, teacherClassId]);

  const openAdd = () => {
    const defaultClass = isTeacher && teacherClassId ? String(teacherClassId) : '';
    setForm({...emptyForm, class_id: defaultClass});
    setEditMode(false);
    setEditId(null);
    setShowModal(true);
  };

  const openEdit = (s) => {
    setForm({
      full_name: s.full_name, class_id: s.class_id, phone: s.phone,
      whatsapp_no: s.whatsapp_no, email: s.email,
      date_of_birth: s.date_of_birth?.split('T')[0],
      address: s.address, fee_status: s.fee_status
    });
    setEditMode(true); setEditId(s.id); setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editMode) {
        await API.put(`/students/${editId}`, form);
        toast.success('Student updated!');
      } else {
        const { data } = await API.post('/students', form);
        toast.success(`Student added! Roll No: ${data.roll_no}`);
      }
      setShowModal(false);
      fetchStudents();
    } catch (err) { toast.error(err.response?.data?.message || 'Operation failed'); }
    finally { setSaving(false); }
  };

  const toggleFeeStatus = async (student) => {
    const newStatus = student.fee_status === 'active' ? 'inactive' : 'active';
    const action = newStatus === 'inactive' ? 'deactivate' : 'activate';
    if (!window.confirm(`Are you sure you want to ${action} "${student.full_name}"?`)) return;
    try {
      await API.put(`/students/${student.id}`, {
        full_name: student.full_name,
        class_id: student.class_id,
        phone: student.phone,
        whatsapp_no: student.whatsapp_no,
        email: student.email,
        date_of_birth: student.date_of_birth?.split('T')[0],
        address: student.address,
        fee_status: newStatus
      });
      toast.success(`Student ${action}d successfully!`);
      fetchStudents();
    } catch (err) {
      toast.error('Failed to update status');
    }
  };

  // Classes shown in dropdown — teacher sees only their class
  const visibleClasses = isTeacher && teacherClassId
    ? classes.filter(c => c.id == teacherClassId)
    : classes;

  return (
    <AppLayout title="Students" subtitle="Manage all student records">
      <div className="page-header">
        <div>
          <h1>Students</h1>
          <p>Total: {students.length} students</p>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>➕ Add Student</button>
      </div>

      <div className="filter-bar">
        <input
          className="form-control search-input"
          placeholder="🔍 Search by name or roll no..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {/* Class filter dropdown — teacher sees only their class */}
        {!isTeacher ? (
          <select className="form-control" value={classFilter} onChange={e => setClassFilter(e.target.value)}>
            <option value="">All Classes</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        ) : (
          <div style={{background:'#dbeafe', padding:'6px 14px', borderRadius:'8px', fontSize:'13px', fontWeight:'600', color:'#1e40af'}}>
            📚 {visibleClasses[0]?.name || 'Your Class'}
          </div>
        )}
      </div>

      <div className="card">
        <div className="table-wrapper students-table">
          {loading ? <div className="loading"><div className="spinner"></div></div> : (
            <table>
              <thead>
                <tr>
                  <th>Roll No</th><th>Name</th><th>Class</th><th>Phone</th>
                  <th>WhatsApp</th><th>Fee Status</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {students.map(s => (
                  <tr key={s.id}>
                    <td><code style={{fontFamily:'JetBrains Mono', fontSize:'12px', background:'#f1f5f9', padding:'2px 6px', borderRadius:'4px'}}>{s.roll_no}</code></td>
                    <td><strong>{s.full_name}</strong></td>
                    <td>{s.class_name}</td>
                    <td>{s.phone}</td>
                    <td>{s.whatsapp_no}</td>
                    <td>
                      <span className={"badge " + (s.fee_status === 'active' ? 'badge-success' : 'badge-danger')}>
                        {s.fee_status === 'active' ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <div style={{display:'flex', gap:'6px'}}>
                        <button className="btn btn-outline btn-sm" onClick={() => openEdit(s)}>✏️ Edit</button>
                        <button
                          className={"btn btn-sm " + (s.fee_status === 'active' ? 'btn-warning' : 'btn-success')}
                          onClick={() => toggleFeeStatus(s)}>
                          {s.fee_status === 'active' ? '🔴 Deactivate' : '🟢 Activate'}
                        </button>
                      </div>
                    </td>
                    
                  </tr>
                ))}
                {!students.length && !loading && (
                  <tr><td colSpan="7"><div className="empty-state"><div className="empty-icon">👨‍🎓</div><p>No students found</p></div></td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{maxWidth:'700px'}}>
            <div className="modal-header">
              <h2>{editMode ? '✏️ Edit Student' : '➕ Add New Student'}</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-grid">
                  <div className="form-group" style={{gridColumn:'1/-1'}}>
                    <label>Full Name <span>*</span></label>
                    <input className="form-control" value={form.full_name}
                      onChange={e => setForm({...form, full_name: e.target.value})}
                      required placeholder="Enter full name" />
                  </div>
                  <div className="form-group">
                    <label>Class <span>*</span></label>
                    {/* Teacher sees only their class in dropdown */}
                    <select className="form-control" value={form.class_id}
                      onChange={e => setForm({...form, class_id: e.target.value})}
                      required disabled={isTeacher && visibleClasses.length === 1}>
                      <option value="">Select Class</option>
                      {visibleClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Roll No</label>
                    <input className="form-control" value="Will be auto-generated" disabled />
                  </div>
                  <div className="form-group">
                    <label>Phone No <span>*</span></label>
                    <input className="form-control" value={form.phone}
                      onChange={e => setForm({...form, phone: e.target.value})}
                      required placeholder="Phone number" />
                  </div>
                  <div className="form-group">
                    <label>WhatsApp No <span>*</span></label>
                    <input className="form-control" value={form.whatsapp_no}
                      onChange={e => setForm({...form, whatsapp_no: e.target.value})}
                      required placeholder="WhatsApp number" />
                  </div>
                  <div className="form-group">
                    <label>Email <span>*</span></label>
                    <input type="email" className="form-control" value={form.email}
                      onChange={e => setForm({...form, email: e.target.value})}
                      required placeholder="Email address" />
                  </div>
                  <div className="form-group">
                    <label>Date of Birth <span>*</span></label>
                    <input type="date" className="form-control" value={form.date_of_birth}
                      onChange={e => setForm({...form, date_of_birth: e.target.value})} required />
                  </div>
                  {editMode && (
                    <div className="form-group">
                      <label>Fee Status</label>
                      <select className="form-control" value={form.fee_status}
                        onChange={e => setForm({...form, fee_status: e.target.value})}>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </div>
                  )}
                  <div className="form-group" style={{gridColumn:'1/-1'}}>
                    <label>Address <span>*</span></label>
                    <textarea className="form-control" rows="3" value={form.address}
                      onChange={e => setForm({...form, address: e.target.value})}
                      required placeholder="Full address" />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? '⏳ Saving...' : (editMode ? '💾 Update' : '✅ Add Student')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
};

export default Students;
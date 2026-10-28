import React, { useState, useEffect } from 'react';
import AppLayout from '../components/layout/AppLayout';
import API from '../utils/api';
import { toast } from 'react-toastify';

const ACCESS_OPTIONS = ['dashboard','students','daily_attendance','attendance_report','fee_payment','salary_slip','employees','principals','reports','broadcast'];

const ConfigSection = ({ title, icon, items, onAdd, onEdit, onDelete, fields, editFields }) => {
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  const handleAdd = async (e) => {
    e.preventDefault(); setSaving(true);
    try { await onAdd(form); setShowAdd(false); setForm({}); toast.success('Added!'); }
    catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  const handleEdit = async (e) => {
    e.preventDefault(); setSaving(true);
    try { await onEdit(editItem.id, form); setEditItem(null); setForm({}); toast.success('Updated!'); }
    catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Delete "${item.name}"?`)) return;
    try { await onDelete(item.id); toast.success('Deleted!'); }
    catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };

  const openEdit = (item) => {
    setEditItem(item);
    const f = {};
    (editFields || fields).forEach(field => { f[field.key] = item[field.key] || (field.type === 'access' ? item.access || [] : ''); });
    setForm(f);
  };

  const renderField = (field) => {
    if (field.type === 'access') {
      return (
        <div className="form-group" key={field.key} style={{gridColumn:'1/-1'}}>
          <label>Page Access</label>
          <div style={{display:'flex', flexWrap:'wrap', gap:'8px', marginTop:'6px'}}>
            {ACCESS_OPTIONS.map(opt => (
              <label key={opt} style={{display:'flex', alignItems:'center', gap:'6px', cursor:'pointer', fontSize:'13px', background:'#f1f5f9', padding:'6px 12px', borderRadius:'20px'}}>
                <input type="checkbox" checked={(form[field.key] || []).includes(opt)}
                  onChange={e => {
                    const cur = form[field.key] || [];
                    setForm({...form, [field.key]: e.target.checked ? [...cur, opt] : cur.filter(a => a !== opt)});
                  }} />
                {opt.replace(/_/g,' ')}
              </label>
            ))}
          </div>
        </div>
      );
    }
    return (
      <div className="form-group" key={field.key}>
        <label>{field.label} <span>*</span></label>
        <input type={field.type || 'text'} className="form-control" value={form[field.key] || ''}
          onChange={e => setForm({...form, [field.key]: e.target.value})}
          required={field.required !== false} placeholder={field.placeholder || ''} />
      </div>
    );
  };

  return (
    <div className="card" style={{marginBottom:'20px'}}>
      <div className="card-header">
        <h3>{icon} {title}</h3>
        <button className="btn btn-primary btn-sm" onClick={() => { setShowAdd(true); setForm({}); }}>➕ Add {title}</button>
      </div>
      <div className="desktop-table-view">
       <div className="table-wrapper config-table" style={{maxHeight:'260px', overflowY:'auto', border:'1px solid #e2e8f0', borderRadius:'8px'}}>  
        <table>
          <thead style={{position:'sticky', top:0, zIndex:1, background:'#f8fafc'}}>
            <tr>
              <th>Name</th>
              {fields.filter(f => f.key !== 'name').map(f => <th key={f.key}>{f.label}</th>)}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.id}>
                <td><strong>{item.name}</strong></td>
                {fields.filter(f => f.key !== 'name').map(f => (
                  <td key={f.key}>
                    {f.type === 'access'
                      ? (Array.isArray(item.access) && item.access.length > 0
                          ? <span className="badge badge-success">{item.access.length} pages</span>
                          : <span className="badge badge-danger">0 pages</span>)
                      : (item[f.key] || '—')}
                  </td>
                ))}
                <td>
                  <div style={{display:'flex', gap:'6px'}}>
                    <button className="btn btn-outline btn-sm" onClick={() => openEdit(item)}>✏️</button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(item)}>🗑️</button>
                  </div>
                </td>
              </tr>
            ))}
            {!items.length && (
              <tr><td colSpan="10"><div className="empty-state"><p>No {title.toLowerCase()} added yet</p></div></td></tr>
            )}
          </tbody>
        </table>
       </div>
      </div>

      {/* Mobile: card view */}
      <div className="mobile-card-list mobile-card-scroll" style={{maxHeight:'240px', overflowY:'auto', border:'1px solid #e2e8f0', borderRadius:'8px', padding:'10px'}}>
        {items.map(item => (
          <div className="data-card" key={item.id}>
            <div className="data-card-row">
              <span className="dc-label">Name</span>
              <span className="dc-value"><strong>{item.name}</strong></span>
            </div>
            {fields.filter(f => f.key !== 'name').map(f => (
              <div className="data-card-row" key={f.key}>
                <span className="dc-label">{f.label}</span>
                <span className="dc-value">
                  {f.type === 'access'
                    ? (Array.isArray(item.access) && item.access.length > 0
                        ? <span className="badge badge-success">{item.access.length} pages</span>
                        : <span className="badge badge-danger">0 pages</span>)
                    : (item[f.key] || '—')}
                </span>
              </div>
            ))}
            <div className="data-card-actions">
              <div style={{display:'flex', gap:'6px'}}>
                <button className="btn btn-outline btn-sm" onClick={() => openEdit(item)}>✏️ Edit</button>
                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(item)}>🗑️ Delete</button>
              </div>
            </div>
          </div>
        ))}
        {!items.length && (
          <div className="empty-state"><p>No {title.toLowerCase()} added yet</p></div>
        )}
      </div>

      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>➕ Add {title}</h2>
              <button className="modal-close" onClick={() => setShowAdd(false)}>✕</button>
            </div>
            <form onSubmit={handleAdd}>
              <div className="modal-body"><div className="form-grid">{fields.map(renderField)}</div></div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowAdd(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? '...⏳' : '✅ Add'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editItem && (
        <div className="modal-overlay" onClick={() => setEditItem(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>✏️ Edit {title}</h2>
              <button className="modal-close" onClick={() => setEditItem(null)}>✕</button>
            </div>
            <form onSubmit={handleEdit}>
              <div className="modal-body"><div className="form-grid">{(editFields || fields).map(renderField)}</div></div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setEditItem(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? '⏳' : '💾 Update'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const Configuration = () => {
  const [classes, setClasses] = useState([]);
  const [feeTypes, setFeeTypes] = useState([]);
  const [roles, setRoles] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [classSubjects, setClassSubjects] = useState([]);
  const [selectedConfigClass, setSelectedConfigClass] = useState('');
  const [selectedSubjectToAdd, setSelectedSubjectToAdd] = useState('');

  const [examType, setExamType] = useState('Unit 1');
  const [maxMarks, setMaxMarks] = useState(20);
  const [passMarks, setPassMarks] = useState(7);
  const [examConfigs, setExamConfigs] = useState([]);
  const [examTypes, setExamTypes] = useState([]);

  // ─── TEACHER ASSIGNMENT STATES ──────────────────────────────
  const [teachers, setTeachers] = useState([]);
  const [teacherAssignments, setTeacherAssignments] = useState([]);
  const [selectedTeacher, setSelectedTeacher] = useState('');
  const [selectedAssignClass, setSelectedAssignClass] = useState('');
  const [selectedAssignSubject, setSelectedAssignSubject] = useState('');
  const [assigningTeacher, setAssigningTeacher] = useState(false);

  // ─── SCHOOL PROFILE ─────────────────────────────────────────
  const [school, setSchool] = useState({ school_name: '', address: '', academic_year: '', reopen_date: '' });
  const [savingSchool, setSavingSchool] = useState(false);

  const fetchAll = async () => {
    try {
      const [classesRes, feeTypesRes, rolesRes, subjectsRes, classSubjectsRes, examSettingsRes, examTypesRes, teacherAssignmentsRes] = await Promise.all([
        API.get('/config/classes'),
        API.get('/config/fee-types'),
        API.get('/config/roles'),
        API.get('/subjects'),
        API.get('/class-subjects'),
        API.get('/config/exam-settings'),
        API.get('/exam-types'),
        API.get('/config/teacher-assignments').catch(() => ({ data: [] })),
      ]);
      setClasses(classesRes.data);
      setFeeTypes(feeTypesRes.data);
      setRoles(rolesRes.data);
      setSubjects(subjectsRes.data);
      setClassSubjects(classSubjectsRes.data);
      setExamConfigs(examSettingsRes.data);
      setExamTypes(examTypesRes.data);
      setTeacherAssignments(teacherAssignmentsRes.data || []);

      // Staff/employee fetch for the teacher dropdown
      let usersData = [];
      try {
        const empRes = await API.get('/employees');
        usersData = Array.isArray(empRes.data) ? empRes.data : (empRes.data?.employees || empRes.data?.users || []);
      } catch (e) {
        try {
          const uRes = await API.get('/users');
          usersData = Array.isArray(uRes.data) ? uRes.data : (uRes.data?.users || []);
        } catch (err) {}
      }
      const teacherUsers = usersData.filter(u => {
        const role = String(u.role_name || u.role || u.designation || '').toLowerCase();
        return role.includes('teacher');
      });
      setTeachers(teacherUsers.length > 0 ? teacherUsers : usersData);
    } catch (err) { toast.error('Failed to load configuration'); }
  };

  const fetchSchool = async () => {
    try {
      const res = await API.get('/config/school-settings');
      setSchool({
        school_name: res.data.school_name || '',
        address: res.data.address || '',
        academic_year: res.data.academic_year || '',
        reopen_date: res.data.reopen_date || ''
      });
    } catch (e) {}
  };

  const handleSaveSchool = async () => {
    if (!school.school_name.trim()) return toast.error('School name is required');
    setSavingSchool(true);
    try {
      await API.put('/config/school-settings', school);
      toast.success('School profile saved. Marksheets will use the new details.');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save school profile');
    } finally {
      setSavingSchool(false);
    }
  };

  useEffect(() => { fetchAll(); fetchSchool(); }, []);

  const handleExamTypeChange = (type) => {
    setExamType(type);
    if (type.startsWith('Unit')) {
      setMaxMarks(20);
      setPassMarks(7);
    } else {
      setMaxMarks(100);
      setPassMarks(35);
    }
  };

  const handleSaveExamMapping = async () => {
    if (!selectedConfigClass || !selectedSubjectToAdd) {
      return toast.error('Please choose Class and Subject first.');
    }
    try {
      await API.post('/config/exam-settings', {
        class_id: selectedConfigClass,
        exam_type: examType,
        subject_id: selectedSubjectToAdd,
        max_marks: maxMarks,
        pass_marks: passMarks
      });
      toast.success('Exam criteria assigned successfully!');
      setSelectedSubjectToAdd('');
      fetchAll();
    } catch (err) { toast.error('Failed to map exam structure'); }
  };

  const handleDeleteExamSetting = async (id) => {
    if (!window.confirm('Are you sure you want to delete this criteria?')) return;
    try {
      await API.delete(`/config/exam-settings/${id}`);
      toast.success('Criteria deleted successfully!');
      fetchAll();
    } catch (err) { toast.error('Failed to delete configuration entry'); }
  };

  const handleEditExamSetting = (cfg) => {
    setSelectedConfigClass(cfg.class_id);
    setExamType(cfg.exam_type);
    setSelectedSubjectToAdd(cfg.subject_id);
    setMaxMarks(cfg.max_marks);
    setPassMarks(cfg.pass_marks);
  };

  // ─── TEACHER ASSIGNMENT HANDLERS ────────────────────────────
  const handleAssignTeacher = async () => {
    if (!selectedTeacher || !selectedAssignClass || !selectedAssignSubject) {
      return toast.error('Please select Teacher, Class, and Subject');
    }
    setAssigningTeacher(true);
    try {
      await API.post('/config/teacher-assignments', {
        teacher_id: selectedTeacher,
        class_id: selectedAssignClass,
        subject_id: selectedAssignSubject
      });
      toast.success('Teacher assigned successfully!');
      setSelectedAssignSubject('');
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.error || err.response?.data?.message || 'Failed to assign teacher');
    } finally {
      setAssigningTeacher(false);
    }
  };

  const handleDeleteTeacherAssignment = async (id, name, cls, sub) => {
    if (!window.confirm(`Revoke assignment of ${name} for ${cls} (${sub})?`)) return;
    try {
      await API.delete(`/config/teacher-assignments/${id}`);
      toast.success('Assignment removed');
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete assignment');
    }
  };

  // Subjects assigned to the class chosen in the teacher allocation panel
  const assignableSubjectsForClass = subjects.filter(sub =>
    classSubjects.some(cs => cs.class_id == selectedAssignClass && cs.subject_id == sub.id)
  );

  const wrap = (fn) => async (...args) => { await fn(...args); fetchAll(); };

  const filteredAvailableSubjects = subjects.filter(sub => 
    classSubjects.some(cs => cs.class_id == selectedConfigClass && cs.subject_id == sub.id)
  );

  return (
    <AppLayout title="Configuration" subtitle="Manage system settings">
      <div className="page-header"><div><h1>Configuration</h1><p>Admin-only system settings</p></div></div>

      {/* ─── SCHOOL PROFILE (used on marksheet) ─── */}
      <div className="card" style={{marginBottom:'20px', border:'2px solid #f59e0b'}}>
        <div style={{padding:'16px 20px', borderBottom:'1px solid #e2e8f0', background:'#fffbeb'}}>
          <h3 style={{margin:0, fontSize:'15px', fontWeight:'800', color:'#92400e'}}>🏫 School Profile (shown on Marksheet)</h3>
          <p style={{margin:'4px 0 0', fontSize:'12px', color:'#b45309'}}>
            Changes here are applied automatically to all student marksheet reports.
          </p>
        </div>
        <div style={{padding:'16px 20px', display:'flex', gap:'12px', flexWrap:'wrap', alignItems:'flex-end'}}>
          <div className="form-group" style={{margin:0, flex:'1 1 260px'}}>
            <label style={{fontSize:'11px', fontWeight:'700'}}>School Name</label>
            <input className="form-control" value={school.school_name}
              onChange={e => setSchool({ ...school, school_name: e.target.value })} />
          </div>
          <div className="form-group" style={{margin:0, flex:'1 1 320px'}}>
            <label style={{fontSize:'11px', fontWeight:'700'}}>Address</label>
            <input className="form-control" value={school.address}
              onChange={e => setSchool({ ...school, address: e.target.value })} />
          </div>
          <div className="form-group" style={{margin:0, minWidth:'140px'}}>
            <label style={{fontSize:'11px', fontWeight:'700'}}>Academic Year</label>
            <input className="form-control" placeholder="2026-27" value={school.academic_year}
              onChange={e => setSchool({ ...school, academic_year: e.target.value })} />
          </div>
          <div className="form-group" style={{margin:0, minWidth:'160px'}}>
            <label style={{fontSize:'11px', fontWeight:'700'}}>School Reopen Date</label>
            <input type="date" className="form-control" value={school.reopen_date}
              onChange={e => setSchool({ ...school, reopen_date: e.target.value })} />
          </div>
          <button className="btn btn-primary" onClick={handleSaveSchool} disabled={savingSchool}>
            {savingSchool ? 'Saving...' : '💾 Save'}
          </button>
        </div>
      </div>

      {/* ─── TEACHER + CLASS + SUBJECT ALLOCATION PANEL ─── */}
      <div className="card" style={{marginBottom:'20px', border:'2px solid #10b981'}}>
        <div style={{padding:'16px 20px', borderBottom:'1px solid #e2e8f0', background:'#f0fdf4'}}>
          <h3 style={{margin:0, fontSize:'15px', fontWeight:'800', color:'#065f46'}}>
            👨‍🏫 Teacher + Class + Subject Assignment (Broadcast & Class Control)
          </h3>
          <p style={{margin:'4px 0 0', fontSize:'12px', color:'#047857'}}>
            Assign teachers to classes and subjects to allow them to broadcast to their assigned classes.
          </p>
        </div>

        <div style={{padding:'16px 20px'}}>
          <div style={{display:'flex', gap:'12px', flexWrap:'wrap', alignItems:'flex-end', marginBottom:'16px'}}>
            <div className="form-group" style={{margin:0, minWidth:'180px'}}>
              <label style={{fontSize:'11px', fontWeight:'700'}}>1. Select Teacher</label>
              <select className="form-control" value={selectedTeacher} onChange={e => setSelectedTeacher(e.target.value)}>
                <option value="">Choose Teacher</option>
                {teachers.map(t => {
                  const name = t.full_name || t.name || `${t.first_name || ''} ${t.last_name || ''}`.trim() || t.username || 'Staff Member';
                  return <option key={t.id} value={t.id}>{name}</option>;
                })}
              </select>
            </div>

            <div className="form-group" style={{margin:0, minWidth:'150px'}}>
              <label style={{fontSize:'11px', fontWeight:'700'}}>2. Select Class</label>
              <select className="form-control" value={selectedAssignClass}
                onChange={e => { setSelectedAssignClass(e.target.value); setSelectedAssignSubject(''); }}>
                <option value="">Choose Class</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <div className="form-group" style={{margin:0, minWidth:'160px'}}>
              <label style={{fontSize:'11px', fontWeight:'700'}}>3. Select Subject</label>
              <select className="form-control" value={selectedAssignSubject}
                onChange={e => setSelectedAssignSubject(e.target.value)} disabled={!selectedAssignClass}>
                <option value="">{selectedAssignClass ? 'Choose Subject' : '⚠️ Choose Class First'}</option>
                {(assignableSubjectsForClass.length > 0 ? assignableSubjectsForClass : subjects).map(s => (
                  <option key={s.id} value={s.id}>{s.name} {s.code ? `(${s.code})` : ''}</option>
                ))}
              </select>
            </div>

            <button className="btn btn-primary" style={{background:'#059669', borderColor:'#059669'}}
              onClick={handleAssignTeacher} disabled={assigningTeacher}>
              {assigningTeacher ? '⏳ Assigning...' : '➕ Assign Teacher'}
            </button>
          </div>

          {/* Desktop Table */}
          <div className="desktop-table-view">
            <div className="table-wrapper config-table" style={{maxHeight:'260px', overflowY:'auto', border:'1px solid #e2e8f0', borderRadius:'8px'}}>
              <table>
                <thead style={{position:'sticky', top:0, zIndex:1, background:'#f8fafc'}}>
                  <tr>
                    <th>Teacher Name</th>
                    <th>Assigned Class</th>
                    <th>Subject</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {teacherAssignments.map(assign => (
                    <tr key={assign.id}>
                      <td><strong>👨‍🏫 {assign.teacher_name}</strong></td>
                      <td><span className="badge badge-info">{assign.class_name}</span></td>
                      <td><strong>{assign.subject_name}</strong></td>
                      <td>
                        <button className="btn btn-danger btn-sm"
                          onClick={() => handleDeleteTeacherAssignment(assign.id, assign.teacher_name, assign.class_name, assign.subject_name)}>
                          🗑️ Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                  {teacherAssignments.length === 0 && (
                    <tr><td colSpan="4" style={{textAlign:'center', color:'#94a3b8'}}>No teacher assignments configured yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Card List */}
          <div className="mobile-card-list mobile-card-scroll" style={{maxHeight:'240px', overflowY:'auto', border:'1px solid #e2e8f0', borderRadius:'8px', padding:'10px'}}>
            {teacherAssignments.map(assign => (
              <div className="data-card" key={assign.id}>
                <div className="data-card-row">
                  <span className="dc-label">Teacher</span>
                  <span className="dc-value"><strong>👨‍🏫 {assign.teacher_name}</strong></span>
                </div>
                <div className="data-card-row">
                  <span className="dc-label">Class</span>
                  <span className="dc-value"><span className="badge badge-info">{assign.class_name}</span></span>
                </div>
                <div className="data-card-row">
                  <span className="dc-label">Subject</span>
                  <span className="dc-value">{assign.subject_name}</span>
                </div>
                <div className="data-card-actions">
                  <button className="btn btn-danger btn-sm"
                    onClick={() => handleDeleteTeacherAssignment(assign.id, assign.teacher_name, assign.class_name, assign.subject_name)}>
                    🗑️ Remove
                  </button>
                </div>
              </div>
            ))}
            {teacherAssignments.length === 0 && (
              <div className="empty-state"><p>No teacher assignments configured yet.</p></div>
            )}
          </div>
        </div>
      </div>

      <ConfigSection
        title="Classes" icon="🏫" items={classes}
        fields={[{ key: 'name', label: 'Class Name', placeholder: 'e.g. Class 11' }]}
        onAdd={wrap(d => API.post('/config/classes', d))}
        onEdit={wrap((id, d) => API.put(`/config/classes/${id}`, d))}
        onDelete={wrap(id => API.delete(`/config/classes/${id}`))}
      />

      <div className="card" style={{marginBottom:'20px'}}>
        <div style={{padding:'14px 20px', borderBottom:'1px solid #e2e8f0'}}>
          <h3 style={{margin:0, fontSize:'14px', fontWeight:'800'}}>🏫 Classes & Their Subjects</h3>
        </div>
        <div className="mobile-card-scroll" style={{margin:'14px 20px', padding:'12px', maxHeight:'250px', overflowY:'auto', border:'1px solid #e2e8f0', borderRadius:'8px'}}>
          {classes.map(cls => {
            const clsSubjects = classSubjects.filter(cs => cs.class_id === cls.id);
            return (
              <div key={cls.id} style={{marginBottom:'10px', padding:'10px 14px', background:'#f8fafc', borderRadius:'8px', border:'1px solid #e2e8f0'}}>
                <div style={{fontWeight:'800', color:'#1e40af', fontSize:'12px', marginBottom:'6px'}}>🏫 {cls.name}</div>
                <div style={{display:'flex', flexWrap:'wrap', gap:'6px'}}>
                  {clsSubjects.length > 0 ? clsSubjects.map(cs => (
                    <span key={cs.id} style={{background:'#dbeafe', color:'#1e40af', padding:'2px 8px', borderRadius:'20px', fontSize:'11px', fontWeight:'600'}}>
                      {cs.subject_name}
                    </span>
                  )) : (
                    <span style={{color:'#94a3b8', fontSize:'11px'}}>No subjects assigned yet</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── EXAM PATTERN CONFIG PANEL WITH SCROLL WRAPPER ─── */}
      <div className="card" style={{marginBottom:'20px'}}>
        <div style={{padding:'16px 20px', borderBottom:'1px solid #e2e8f0'}}>
          <h3 style={{margin:0, fontSize:'15px', fontWeight:'800'}}>📝 Exam Type Wise Subjects & Marks Configuration</h3>
        </div>
        <div style={{padding:'16px 20px'}}>
          <div style={{display:'flex', gap:'12px', flexWrap:'wrap', alignItems:'flex-end', marginBottom:'16px'}}>
            <div className="form-group" style={{margin:0, minWidth:'140px'}}>
              <label style={{fontSize:'11px', fontWeight:'700'}}>1. Choose Class</label>
              <select className="form-control" value={selectedConfigClass} onChange={e => { setSelectedConfigClass(e.target.value); setSelectedSubjectToAdd(''); }}>
                <option value="">Select Class</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <div className="form-group" style={{margin:0, minWidth:'140px'}}>
              <label style={{fontSize:'11px', fontWeight:'700'}}>2. Exam Type</label>
              <select className="form-control" value={examType} onChange={e => handleExamTypeChange(e.target.value)}>
                {examTypes.map(et => <option key={et.id} value={et.name}>{et.name}</option>)}
              </select>
            </div>

            <div className="form-group" style={{margin:0, minWidth:'160px'}}>
              <label style={{fontSize:'11px', fontWeight:'700'}}>3. Select Subject</label>
              <select className="form-control" value={selectedSubjectToAdd} onChange={e => setSelectedSubjectToAdd(e.target.value)} disabled={!selectedConfigClass}>
                <option value="">{selectedConfigClass ? 'Choose Subject' : '⚠️ Choose Class First'}</option>
                {filteredAvailableSubjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            <div className="form-group" style={{margin:0, width:'85px'}}>
              <label style={{fontSize:'11px', fontWeight:'700'}}>Max Marks</label>
              <input type="number" className="form-control" value={maxMarks} onChange={e => setMaxMarks(e.target.value)} />
            </div>

            <div className="form-group" style={{margin:0, width:'85px'}}>
              <label style={{fontSize:'11px', fontWeight:'700'}}>Pass Marks</label>
              <input type="number" className="form-control" value={passMarks} onChange={e => setPassMarks(e.target.value)} />
            </div>

            <button className="btn btn-primary" onClick={handleSaveExamMapping}>💾 Save Criteria</button>
          </div>
          <div className="desktop-table-view">
           <div className="table-wrapper exam-config-table" style={{maxHeight:'260px', overflowY:'auto', border:'1px solid #e2e8f0', borderRadius:'8px'}}>
            <table>
              <thead style={{position:'sticky', top:0, zIndex:1, background:'#f8fafc'}}>
                <tr>
                  <th>Class Name</th>
                  <th>Exam Type</th>
                  <th>Subject</th>
                  <th>Max Marks</th>
                  <th>Passing Marks</th>
                  <th>Action Controls</th>
                </tr>
              </thead>
              <tbody>
                {examConfigs
                  .filter(cfg => !selectedConfigClass || cfg.class_id == selectedConfigClass)
                  .map(cfg => (
                    <tr key={cfg.id}>
                      <td><strong>{cfg.class_name}</strong></td>
                      <td><span className={`badge ${cfg.exam_type.startsWith('Unit') ? 'badge-info' : 'badge-success'}`}>{cfg.exam_type}</span></td>
                      <td>{cfg.subject_name}</td>
                      <td><strong>{cfg.max_marks} Marks</strong></td>
                      <td><strong style={{color:'#dc2626'}}>{cfg.pass_marks} Marks</strong></td>
                      <td>
                        <div style={{display:'flex', gap:'6px'}}>
                          <button className="btn btn-outline btn-sm" onClick={() => handleEditExamSetting(cfg)}>✏️</button>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDeleteExamSetting(cfg.id)}>🗑️</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                {examConfigs.filter(cfg => !selectedConfigClass || cfg.class_id == selectedConfigClass).length === 0 && (
                  <tr><td colSpan="6" style={{textAlign:'center', color:'#94a3b8'}}>No criteria found for selection.</td></tr>
                )}
              </tbody>
            </table>
           </div>
          </div>

          {/* Mobile: card view */}
          <div className="mobile-card-list mobile-card-scroll" style={{maxHeight:'240px', overflowY:'auto', border:'1px solid #e2e8f0', borderRadius:'8px', padding:'10px'}}>
            {examConfigs
              .filter(cfg => !selectedConfigClass || cfg.class_id == selectedConfigClass)
              .map(cfg => (
                <div className="data-card" key={cfg.id}>
                  <div className="data-card-row">
                    <span className="dc-label">Class</span>
                    <span className="dc-value"><strong>{cfg.class_name}</strong></span>
                  </div>
                  <div className="data-card-row">
                    <span className="dc-label">Exam Type</span>
                    <span className="dc-value"><span className={`badge ${cfg.exam_type.startsWith('Unit') ? 'badge-info' : 'badge-success'}`}>{cfg.exam_type}</span></span>
                  </div>
                  <div className="data-card-row">
                    <span className="dc-label">Subject</span>
                    <span className="dc-value">{cfg.subject_name}</span>
                  </div>
                  <div className="data-card-row">
                    <span className="dc-label">Max Marks</span>
                    <span className="dc-value"><strong>{cfg.max_marks} Marks</strong></span>
                  </div>
                  <div className="data-card-row">
                    <span className="dc-label">Pass Marks</span>
                    <span className="dc-value"><strong style={{color:'#dc2626'}}>{cfg.pass_marks} Marks</strong></span>
                  </div>
                  <div className="data-card-actions">
                    <div style={{display:'flex', gap:'6px'}}>
                      <button className="btn btn-outline btn-sm" onClick={() => handleEditExamSetting(cfg)}>✏️ Edit</button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDeleteExamSetting(cfg.id)}>🗑️ Delete</button>
                    </div>
                  </div>
                </div>
              ))}
            {examConfigs.filter(cfg => !selectedConfigClass || cfg.class_id == selectedConfigClass).length === 0 && (
              <div className="empty-state"><p>No criteria found for selection.</p></div>
            )}
          </div>
        </div>
      </div>

      {/* ─── NEW ADD-ON EXAM TYPES CONTROL MANAGER BLOCK ─── */}
      <ConfigSection
        title="Exam Types" icon="📝" items={examTypes}
        fields={[{ key: 'name', label: 'Exam Type Name', placeholder: 'e.g. Unit 1, Final Exam' }]}
        onAdd={wrap(d => API.post('/exam-types', d))}
        onEdit={wrap((id, d) => API.put(`/exam-types/${id}`, d))}
        onDelete={wrap(id => API.delete(`/exam-types/${id}`))}
      />

      <ConfigSection
        title="Fee Types" icon="💰" items={feeTypes}
        fields={[{ key: 'name', label: 'Fee Type Name', placeholder: 'e.g. Annual Fee' }]}
        onAdd={wrap(d => API.post('/config/fee-types', d))}
        onEdit={wrap((id, d) => API.put(`/config/fee-types/${id}`, d))}
        onDelete={wrap(id => API.delete(`/config/fee-types/${id}`))}
      />

      <ConfigSection
        title="Roles" icon="👤" items={roles}
        fields={[{ key: 'name', label: 'Role Name', placeholder: 'e.g. Teacher' }, { key: 'access', label: 'Page Access', type: 'access' }]}
        onAdd={wrap(d => API.post('/config/roles', d))}
        onEdit={wrap((id, d) => API.put(`/config/roles/${id}`, d))}
        onDelete={wrap(id => API.delete(`/config/roles/${id}`))}
      />

      <ConfigSection
        title="Subjects" icon="📚" items={subjects}
        fields={[
          { key: 'name', label: 'Subject Name', placeholder: 'e.g. Mathematics' },
          { key: 'code', label: 'Subject Code', placeholder: 'e.g. MATH' }
        ]}
        onAdd={wrap(d => API.post('/subjects', d))}
        onEdit={wrap((id, d) => API.put(`/subjects/${id}`, d))}
        onDelete={wrap(id => API.delete(`/subjects/${id}`))}
      />

      <div className="card" style={{marginTop:'20px'}}>
        <div style={{padding:'16px 20px', borderBottom:'1px solid #e2e8f0', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <h3 style={{margin:0, fontSize:'15px', fontWeight:'800'}}>📚 Class-wise Subject Assignment</h3>
        </div>
        <div style={{padding:'16px 20px'}}>
          <div style={{display:'flex', gap:'10px', marginBottom:'16px', flexWrap:'wrap', alignItems:'flex-end'}}>
            <div className="form-group" style={{margin:0, minWidth:'160px'}}>
              <label style={{fontSize:'11px', color:'#64748b'}}>Select Class</label>
              <select className="form-control" value={selectedConfigClass} onChange={e => setSelectedConfigClass(e.target.value)}>
                <option value="">Choose Class</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group" style={{margin:0, minWidth:'180px'}}>
              <label style={{fontSize:'11px', color:'#64748b'}}>Select Subject</label>
              <select className="form-control" value={selectedSubjectToAdd} onChange={e => setSelectedSubjectToAdd(e.target.value)}>
                <option value="">Choose Subject</option>
                {subjects
                  .filter(s => !classSubjects.some(cs => cs.class_id == selectedConfigClass && cs.subject_id == s.id))
                  .map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <button className="btn btn-primary"
              onClick={async () => {
                if (!selectedConfigClass || !selectedSubjectToAdd) return toast.error('Select class and subject');
                await API.post('/class-subjects', { class_id: selectedConfigClass, subject_id: selectedSubjectToAdd });
                setSelectedSubjectToAdd('');
                fetchAll();
                toast.success('Subject assigned to class!');
              }}>
              ➕ Assign Subject
            </button>
          </div>

          <div style={{maxHeight:'250px', overflowY:'auto'}}>
            {classes.map(cls => {
              const clsSubjects = classSubjects.filter(cs => cs.class_id === cls.id);
              if (!clsSubjects.length) return null;
              return (
                <div key={cls.id} style={{marginBottom:'12px', background:'#f8fafc', borderRadius:'10px', padding:'12px 14px', border:'1px solid #e2e8f0'}}>
                  <div style={{fontSize:'12px', fontWeight:'800', color:'#1e40af', marginBottom:'8px'}}>🏫 {cls.name}</div>
                  <div style={{display:'flex', flexWrap:'wrap', gap:'8px'}}>
                    {clsSubjects.map(cs => (
                      <div key={cs.id} style={{display:'flex', alignItems:'center', gap:'6px', background:'#fff', border:'1px solid #dbeafe', borderRadius:'20px', padding:'3px 10px'}}>
                        <span style={{fontSize:'12px', fontWeight:'700', color:'#1e40af'}}>{cs.subject_name}</span>
                        {cs.code && <span style={{fontSize:'10px', color:'#94a3b8'}}>({cs.code})</span>}
                        <button
                          onClick={async () => {
                            if (!window.confirm(`Remove ${cs.subject_name} from ${cls.name}?`)) return;
                            await API.delete(`/class-subjects/${cs.id}`);
                            fetchAll();
                            toast.success('Subject removed from class');
                          }}
                          style={{background:'none', border:'none', color:'#ef4444', cursor:'pointer', fontSize:'13px', lineHeight:1, padding:'0 2px'}}>
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

    </AppLayout>
  );
};

export default Configuration;
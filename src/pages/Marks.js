import React, { useState, useEffect } from 'react';
import AppLayout from '../components/layout/AppLayout';
import API from '../utils/api';
import { toast } from 'react-toastify';
import { useAuth } from '../context/AuthContext';

const Marks = () => {
  const { user } = useAuth();
  const isTeacher = user?.role === 'Teacher' || user?.role === 'teacher';
  const isAdminOrPrincipal = user?.role === 'admin' || user?.role === 'principal';

  const [classes, setClasses] = useState([]);
  const [examTypes, setExamTypes] = useState([]);
  const [students, setStudents] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [marksMap, setMarksMap] = useState({});
  const [inputMarks, setInputMarks] = useState({});
  const [remarksMap, setRemarksMap] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [effectiveClassId, setEffectiveClassId] = useState(null);

  const [selectedSubjectId, setSelectedSubjectId] = useState('');

  const currentYear = new Date().getFullYear();
  const academicYears = [
    `${currentYear-1}-${currentYear}`,
    `${currentYear}-${currentYear+1}`
  ];

  const [filters, setFilters] = useState({
    class_id: '',
    exam_type_id: '',
    academic_year: `${currentYear}-${currentYear+1}`
  });

  useEffect(() => {
    API.get('/config/classes').then(r => setClasses(r.data));
    API.get('/exam-types').then(r => setExamTypes(r.data));
  }, []);

  const fetchMarks = async () => {
    if (!filters.exam_type_id || (!filters.class_id && !isTeacher)) return;
    setLoading(true);
    try {
      const params = {
        exam_type_id: filters.exam_type_id,
        academic_year: filters.academic_year,
      };
      if (!isTeacher && filters.class_id) {
        params.class_id = filters.class_id;
      }

      const [marksRes, remarksRes] = await Promise.all([
        API.get('/marks', { params }),
        API.get('/marks/remarks', { params })
      ]);

      setStudents(marksRes.data.students);
      setSubjects(marksRes.data.subjects);
      setMarksMap(marksRes.data.marksMap);
      setRemarksMap(remarksRes.data || {});
      setEffectiveClassId(marksRes.data.class_id);

      if (marksRes.data.subjects?.length > 0) {
        setSelectedSubjectId(marksRes.data.subjects[0].id);
      }

      const init = {};
      marksRes.data.students.forEach(s => {
        init[s.id] = {};
        marksRes.data.subjects.forEach(sub => {
          const existing = marksRes.data.marksMap[s.id]?.[sub.id];
          init[s.id][sub.id] = {
            marks: existing?.is_absent ? '' : (existing?.marks ?? ''),
            is_absent: existing?.is_absent ? true : false
          };
        });
      });
      setInputMarks(init);
    } catch (err) {
      console.error('fetchMarks error:', err);
      toast.error(err.response?.data?.message || 'Failed to load marks');
    } finally { setLoading(false); }
  };

  useEffect(() => {
    if (filters.exam_type_id && (filters.class_id || isTeacher)) fetchMarks();
  }, [filters]);

  const handleMarkChange = (studentId, subjectId, value) => {
    const sub = subjects.find(s => s.id === subjectId);
    const max = sub?.max_marks || 100;
    if (value !== '' && (parseFloat(value) < 0 || parseFloat(value) > max)) return;
    setInputMarks(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        [subjectId]: {
          marks: value,
          is_absent: false
        }
      }
    }));
  };

  const handleAbsentToggle = (studentId, subjectId) => {
    setInputMarks(prev => {
      const current = prev[studentId]?.[subjectId];
      const nowAbsent = !current?.is_absent;
      return {
        ...prev,
        [studentId]: {
          ...prev[studentId],
          [subjectId]: {
            marks: nowAbsent ? '' : current?.marks || '',
            is_absent: nowAbsent
          }
        }
      };
    });
  };

  const handleRemarkChange = (studentId, value) => {
    setRemarksMap(prev => ({ ...prev, [studentId]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const marks = [];
      Object.entries(inputMarks).forEach(([studentId, subjectMarks]) => {
        Object.entries(subjectMarks).forEach(([subjectId, data]) => {
          const marksObtained = data.marks;
          const isAbsent = data.is_absent || false;

          if (!isAbsent && (marksObtained === '' || marksObtained === null || marksObtained === undefined)) return;

          marks.push({
            student_id: parseInt(studentId),
            subject_id: parseInt(subjectId),
            marks_obtained: isAbsent ? null : parseFloat(marksObtained),
            is_absent: isAbsent,
          });
        });
      });
      const classIdToSend = isTeacher ? effectiveClassId : filters.class_id;

      await API.post('/marks', {
        class_id: classIdToSend,
        exam_type_id: filters.exam_type_id,
        academic_year: filters.academic_year,
        marks
      });

      const remarks = Object.entries(remarksMap)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([student_id, overall_remark]) => ({
          student_id: parseInt(student_id),
          overall_remark: overall_remark || ''
        }));

      if (remarks.length > 0) {
        await API.post('/marks/remarks', {
          class_id: classIdToSend,
          exam_type_id: filters.exam_type_id,
          academic_year: filters.academic_year,
          remarks
        });
      }

      toast.success('Marks and remarks saved successfully!');
      fetchMarks();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save');
    } finally { setSaving(false); }
  };

  const currentMobileSubject = subjects.find(s => s.id === parseInt(selectedSubjectId));

  return (
    <AppLayout title="Marks Entry" subtitle="Enter student marks">
      <style>{`
        .desktop-marks-view { display: block; }
        .mobile-marks-view { display: none; }

        /* Breakpoint forces grid containers to collapse beautifully on portrait tablet ratios */
        @media (max-width: 1300px) {
          .desktop-marks-view { display: none !important; }
          .mobile-marks-view { 
            display: block !important; 
            width: 100% !important;
            max-width: 100% !important;
          }

          .mobile-subject-banner {
            background: #fff;
            padding: 16px;
            border-radius: 12px;
            border: 1px solid #e2e8f0;
            margin-bottom: 16px;
          }
          .mobile-subject-header h2 {
            font-size: 16px;
            font-weight: 800;
            color: #1e293b;
            margin: 0 0 12px 0;
          }
          
          .mobile-student-card {
            background: #fff;
            border-radius: 12px;
            border: 1px solid #e2e8f0;
            padding: 16px;
            margin-bottom: 12px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.02);
            width: 100% !important;
            box-sizing: border-box;
          }
          .mobile-student-name {
            font-size: 15px;
            font-weight: 700;
            color: #1e293b;
            margin: 0 0 12px 0;
          }
          .mobile-input-row {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 12px;
          }
          .mobile-input-label {
            font-size: 13px;
            font-weight: 600;
            color: #64748b;
            width: 50px;
          }
        }
      `}</style>

      <div style={{ width: '100%', overflowX: 'hidden' }}>
        <div className="page-header">
          <div><h1>Marks Entry</h1><p>Enter marks for students</p></div>
        </div>

        <div style={{background:'#fff', padding:'16px 20px', borderRadius:'12px', marginBottom:'20px', border:'1px solid #e2e8f0'}}>
          <div style={{display:'flex', gap:'10px', flexWrap:'wrap', alignItems:'center'}}>
            {!isTeacher && (
              <select className="form-control" value={filters.class_id}
                onChange={e => setFilters({...filters, class_id: e.target.value})}>
                <option value="">Select Class *</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
            <select className="form-control" value={filters.exam_type_id}
              onChange={e => setFilters({...filters, exam_type_id: e.target.value})}>
              <option value="">Select Exam Type *</option>
              {examTypes.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            <select className="form-control" value={filters.academic_year}
              onChange={e => setFilters({...filters, academic_year: e.target.value})}>
              {academicYears.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="loading"><div className="spinner"></div></div>
        ) : students.length > 0 ? (
          <>
            {/* ========================================== */}
            {/* 1. NEW MOBILE VIEW (PORTRAIT DRIVEN CARDS) */}
            {/* ========================================== */}
            <div className="mobile-marks-view">
              <div className="mobile-subject-banner">
                <div className="mobile-subject-header">
                  <h2>
                    Marks Entry - {classes.find(c => c.id == (filters.class_id || effectiveClassId))?.name || 'Class'}
                  </h2>
                </div>
                <div style={{display:'flex', flexDirection:'column', gap:'4px'}}>
                  <label style={{fontSize:'12px', fontWeight:'700', color:'#64748b'}}>Subject Focus:</label>
                  <select 
                    className="form-control" 
                    value={selectedSubjectId} 
                    onChange={e => setSelectedSubjectId(e.target.value)}
                    style={{width:'100%', padding:'10px', fontWeight:'700'}}
                  >
                    {subjects.map(s => (
                      <option key={s.id} value={s.id}>{s.name} (Max: {s.max_marks})</option>
                    ))}
                  </select>
                </div>
              </div>

              {students.map((student, i) => {
                if (!selectedSubjectId) return null;
                const cellData = inputMarks[student.id]?.[selectedSubjectId];
                const isAbsent = cellData?.is_absent || false;
                const markVal = cellData?.marks ?? '';
                const numVal = parseFloat(markVal);
                
                const currentSub = currentMobileSubject;
                const isFail = !isAbsent && !isNaN(numVal) && markVal !== '' && currentSub && numVal < currentSub.pass_marks;
                const isPass = !isAbsent && !isNaN(numVal) && markVal !== '' && currentSub && numVal >= currentSub.pass_marks;

                return (
                  <div key={student.id} className="mobile-student-card">
                    <h3 className="mobile-student-name">{i + 1}. {student.full_name}</h3>
                    
                    <div className="mobile-input-row">
                      <span className="mobile-input-label">Score:</span>
                      <input
                        type="number" 
                        min="0" 
                        max={currentSub?.max_marks || 100}
                        value={isAbsent ? '' : markVal}
                        disabled={isAbsent}
                        onChange={e => handleMarkChange(student.id, parseInt(selectedSubjectId), e.target.value)}
                        placeholder={isAbsent ? 'AB' : 'Enter score'}
                        style={{
                          flex:'1', padding:'10px', fontWeight:'800', fontSize:'15px',
                          border: isAbsent ? '1px solid #fcd34d' : '1px solid #cbd5e1',
                          borderRadius:'8px', outline:'none', textAlign:'center',
                          background: isAbsent ? '#fef3c7' : isFail ? '#fee2e2' : isPass ? '#f0fdf4' : '#fff',
                          color: isAbsent ? '#d97706' : isFail ? '#dc2626' : isPass ? '#16a34a' : '#1e293b',
                        }}
                      />

                      <button
                        onClick={() => handleAbsentToggle(student.id, parseInt(selectedSubjectId))}
                        style={{
                          padding:'10px 14px', borderRadius:'8px', fontSize:'13px', fontWeight:'700',
                          border: isAbsent ? '1px solid #f59e0b' : '1px solid #cbd5e1',
                          background: isAbsent ? '#f59e0b' : '#f8fafc',
                          color: isAbsent ? '#fff' : '#64748b',
                          cursor:'pointer'
                        }}
                      >
                        {isAbsent ? '✓ Absent' : 'Mark Absent'}
                      </button>
                    </div>

                    <div style={{display:'flex', alignItems:'center', gap:'12px'}}>
                      <span className="mobile-input-label">Remark:</span>
                      <input
                        type="text"
                        value={remarksMap[student.id] ?? ''}
                        onChange={e => handleRemarkChange(student.id, e.target.value)}
                        placeholder="Overall performance remark..."
                        style={{
                          flex:'1', padding:'8px 12px', border:'1px solid #cbd5e1',
                          borderRadius:'8px', fontSize:'13px', outline:'none'
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ========================================== */}
            {/* 2. ORIGINAL DESKTOP SPREADSHEET TABLE VIEW */}
            {/* ========================================== */}
            <div className="desktop-marks-view">
              <div style={{background:'#fff', borderRadius:'14px', border:'1px solid #e2e8f0', overflow:'hidden', marginBottom:'16px'}}>
                <div style={{overflowX:'auto'}}>
                  <table style={{width:'100%', borderCollapse:'collapse', minWidth:'600px'}}>
                    <thead>
                      <tr style={{background:'#1e40af'}}>
                        <th style={{padding:'12px 10px', color:'#fff', fontSize:'11px', fontWeight:'700', textAlign:'left', width:'40px'}}>#</th>
                        <th style={{padding:'12px 10px', color:'#fff', fontSize:'11px', fontWeight:'700', textAlign:'left', minWidth:'150px'}}>STUDENT NAME</th>
                        <th style={{padding:'12px 10px', color:'#fff', fontSize:'11px', fontWeight:'700', textAlign:'left', width:'80px'}}>ROLL NO</th>
                        {subjects.map(s => (
                          <th key={s.id} style={{padding:'8px 6px', color:'#fff', fontSize:'10px', fontWeight:'700', textAlign:'center', minWidth:'90px'}}>
                            {s.name}<br/><span style={{opacity:0.7, fontSize:'9px'}}>/{s.max_marks}</span>
                          </th>
                        ))}
                        <th style={{padding:'12px 8px', color:'#fff', fontSize:'11px', fontWeight:'700', textAlign:'center', minWidth:'70px'}}>TOTAL</th>
                        <th style={{padding:'12px 8px', color:'#fff', fontSize:'11px', fontWeight:'700', textAlign:'center', minWidth:'60px'}}>%</th>
                        <th style={{padding:'12px 10px', color:'#fff', fontSize:'11px', fontWeight:'700', textAlign:'center', minWidth:'140px'}}>OVERALL REMARK</th>
                      </tr>
                    </thead>
                    <tbody>
                      {students.map((student, i) => {
                        let total = 0, maxTotal = 0;
                        subjects.forEach(s => {
                          const cellData = inputMarks[student.id]?.[s.id];
                          if (cellData?.is_absent) return;
                          const v = parseFloat(cellData?.marks || 0);
                          if (!isNaN(v) && cellData?.marks !== '') {
                            total += v;
                            maxTotal += s.max_marks;
                          }
                        });
                        const pct = maxTotal > 0 ? ((total / maxTotal) * 100).toFixed(1) : '—';

                        return (
                          <tr key={student.id} style={{borderBottom:'1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#f8fafc'}}>
                            <td style={{padding:'10px', fontSize:'12px', color:'#64748b'}}>{i + 1}</td>
                            <td style={{padding:'10px', fontWeight:'700', color:'#1e293b'}}>{student.full_name}</td>
                            <td style={{padding:'10px', fontSize:'12px', color:'#64748b'}}>
                              <code style={{background:'#f1f5f9', padding:'2px 6px', borderRadius:'4px'}}>{student.roll_no}</code>
                            </td>
                            {subjects.map(s => {
                              const cellData = inputMarks[student.id]?.[s.id];
                              const isAbsent = cellData?.is_absent || false;
                              const markVal = cellData?.marks ?? '';
                              const numVal = parseFloat(markVal);
                              const isFail = !isAbsent && !isNaN(numVal) && markVal !== '' && numVal < s.pass_marks;
                              const isPass = !isAbsent && !isNaN(numVal) && markVal !== '' && numVal >= s.pass_marks;

                              return (
                                <td key={s.id} style={{padding:'4px', textAlign:'center'}}>
                                  <div style={{display:'flex', flexDirection:'column', alignItems:'center', gap:'3px'}}>
                                    <input
                                      type="number" min="0" max={s.max_marks}
                                      value={isAbsent ? '' : markVal}
                                      disabled={isAbsent}
                                      onChange={e => handleMarkChange(student.id, s.id, e.target.value)}
                                      style={{
                                        width:'65px', padding:'5px', textAlign:'center',
                                        border: isAbsent ? '1px solid #fcd34d' : '1px solid #e2e8f0',
                                        borderRadius:'6px',
                                        fontSize:'12px', fontWeight:'700', outline:'none',
                                        background: isAbsent ? '#fef3c7' : isFail ? '#fee2e2' : isPass ? '#f0fdf4' : '#fff',
                                        color: isAbsent ? '#d97706' : isFail ? '#dc2626' : isPass ? '#16a34a' : '#1e293b',
                                        cursor: isAbsent ? 'not-allowed' : 'text',
                                      }}
                                      placeholder={isAbsent ? 'AB' : '—'}
                                    />
                                    <button
                                      onClick={() => handleAbsentToggle(student.id, s.id)}
                                      style={{
                                        width:'65px', padding:'2px 0',
                                        border: isAbsent ? '1px solid #f59e0b' : '1px solid #e2e8f0',
                                        borderRadius:'4px', cursor:'pointer',
                                        fontSize:'10px', fontWeight:'700',
                                        background: isAbsent ? '#f59e0b' : '#f8fafc',
                                        color: isAbsent ? '#fff' : '#94a3b8',
                                        fontFamily:'inherit',
                                        transition:'all 0.15s'
                                      }}>
                                      {isAbsent ? '✓ AB' : 'Mark AB'}
                                    </button>
                                  </div>
                                </td>
                              );
                            })}
                            <td style={{padding:'10px', textAlign:'center'}}>
                              <span style={{fontWeight:'800', color:'#1e40af'}}>{maxTotal > 0 ? `${total}/${maxTotal}` : '—'}</span>
                            </td>
                            <td style={{padding:'10px', textAlign:'center'}}>
                              <span style={{
                                background: pct === '—' ? '#f1f5f9' : parseFloat(pct) >= 35 ? '#dcfce7' : '#fee2e2',
                                color: pct === '—' ? '#94a3b8' : parseFloat(pct) >= 35 ? '#16a34a' : '#dc2626',
                                padding:'2px 8px', borderRadius:'10px', fontSize:'12px', fontWeight:'700'
                              }}>{pct === '—' ? '—' : `${pct}%`}</span>
                            </td>
                            <td style={{padding:'6px 8px'}}>
                              <input
                                type="text"
                                value={remarksMap[student.id] ?? ''}
                                onChange={e => handleRemarkChange(student.id, e.target.value)}
                                placeholder="Enter remark..."
                                style={{
                                  width:'130px', padding:'6px 8px',
                                  border:'1px solid #e2e8f0', borderRadius:'6px',
                                  fontSize:'11px', outline:'none', fontFamily:'inherit'
                                }}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={{display:'flex', gap:'16px', padding:'10px 14px', background:'#fff', borderRadius:'8px', border:'1px solid #e2e8f0', marginBottom:'16px', flexWrap:'wrap', alignItems:'center'}}>
                <span style={{fontSize:'12px', fontWeight:'700', color:'#64748b'}}>Cell colors:</span>
                <span style={{background:'#f0fdf4', color:'#16a34a', padding:'2px 10px', borderRadius:'6px', fontSize:'11px', fontWeight:'700'}}>Green = Pass</span>
                <span style={{background:'#fee2e2', color:'#dc2626', padding:'2px 10px', borderRadius:'6px', fontSize:'11px', fontWeight:'700'}}>Red = Fail</span>
                <span style={{background:'#fef3c7', color:'#d97706', padding:'2px 10px', borderRadius:'6px', fontSize:'11px', fontWeight:'700', border:'1px solid #fcd34d'}}>AB = Absent</span>
              </div>
            </div>

            <div style={{display:'flex', justifyContent:'stretch', width:'100%'}}>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}
                style={{padding:'14px 32px', fontSize:'16px', width:'100%', borderRadius:'12px', fontWeight:'700'}}>
                {saving ? '⏳ Saving Marks...' : '💾 Save All Marks'}
              </button>
            </div>
          </>
        ) : (
          <div className="card">
            <div className="empty-state">
              <div className="empty-icon">📝</div>
              <p>Select class and exam type to enter marks</p>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default Marks;
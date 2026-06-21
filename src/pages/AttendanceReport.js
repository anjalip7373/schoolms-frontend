import React, { useState, useEffect } from 'react';
import AppLayout from '../components/layout/AppLayout';
import API from '../utils/api';
import { toast } from 'react-toastify';
import { useAuth } from '../context/AuthContext';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { saveWorkbook, saveDocument } from '../utils/exportUtils';

const AttendanceReport = () => {
  const { user } = useAuth();
  const isTeacher = user?.role === 'Teacher' || user?.role === 'teacher';
  const canSeeEmployees = user?.role === 'admin' || user?.role === 'principal';

  const [rawData, setRawData] = useState([]);
  const [dailyData, setDailyData] = useState({});
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showDownloadPopup, setShowDownloadPopup] = useState(false);

  const [filters, setFilters] = useState({
    from_month: new Date().getMonth() + 1,
    from_year: new Date().getFullYear(),
    to_month: new Date().getMonth() + 1,
    to_year: new Date().getFullYear(),
    class_id: '',
    person_type: 'student'
  });

  const shortMonths = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const fullMonths = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const years = [];
  for (let y = 2020; y <= new Date().getFullYear() + 1; y++) years.push(y);

  // KEY LOGIC — is single view mode?
  const isSingleMonth = filters.from_month === filters.to_month && filters.from_year === filters.to_year;
  const isSingleClass = !!filters.class_id || isTeacher;
  const showInUI = isSingleMonth && isSingleClass;

  const daysInMonth = new Date(filters.from_year, filters.from_month, 0).getDate();
  const dayNumbers = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  useEffect(() => {
    if (!isTeacher) API.get('/config/classes').then(r => setClasses(r.data));
  }, []);

  // Show popup when multi-month or all classes selected
  useEffect(() => {
    if (!isSingleMonth || !isSingleClass) {
      setShowDownloadPopup(true);
    } else {
      setShowDownloadPopup(false);
    }
  }, [filters]);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const [summaryRes, dailyRes] = await Promise.all([
        API.get('/attendance/report', {
          params: {
            from_month: filters.from_month,
            from_year: filters.from_year,
            to_month: filters.to_month,
            to_year: filters.to_year,
            class_id: filters.class_id,
            person_type: filters.person_type
          }
        }),
        API.get('/attendance/daily-report', {
          params: {
            month: filters.from_month,
            year: filters.from_year,
            class_id: filters.class_id,
            person_type: filters.person_type
          }
        })
      ]);
      setRawData(summaryRes.data || []);
      setDailyData(dailyRes.data || {});
    } catch (err) {
      toast.error('Failed to load report');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
    const interval = setInterval(fetchReport, 30000);
    return () => clearInterval(interval);
  }, [filters]);

  const getStatus = (personId, day) => {
    const dateKey = `${filters.from_year}-${String(filters.from_month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    return dailyData[String(personId)]?.[dateKey] || dailyData[personId]?.[dateKey] || null;
  };

  const getPercentage = (row) => {
    if (!row.total_marked || row.total_marked === 0) return 0;
    const present = (row.present_days || 0) + (row.halfday_days || 0) * 0.5;
    return Math.round((present / row.total_marked) * 100);
  };

  const getDotColor = (status) => {
    if (status === 'present') return '#3b82f6';
    if (status === 'absent') return '#ef4444';
    if (status === 'late') return '#f59e0b';
    if (status === 'halfday') return '#8b5cf6';
    return null;
  };

  const getDailyPresentCount = (day) => {
    const dateKey = `${filters.from_year}-${String(filters.from_month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    return Object.values(dailyData).filter(p => p[dateKey] === 'present').length;
  };

  const maxDailyCount = Math.max(...dayNumbers.map(d => getDailyPresentCount(d)), 1);

  const periodLabel = isSingleMonth
    ? `${fullMonths[filters.from_month - 1]} ${filters.from_year}`
    : `${shortMonths[filters.from_month - 1]} ${filters.from_year} - ${shortMonths[filters.to_month - 1]} ${filters.to_year}`;

   const teacherClassName = rawData.length > 0 ? rawData[0]?.class_name : null;

const classLabel = filters.class_id
  ? classes.find(c => c.id == filters.class_id)?.name || 'Selected Class'
  : isTeacher && teacherClassName
    ? teacherClassName
    : 'All Classes';

  const getStatusLabel = (status) => {
    if (status === 'present') return 'P';
    if (status === 'absent') return 'A';
    if (status === 'late') return 'L';
    if (status === 'halfday') return 'H';
    return '-';
  };

  // ===== EXPORT EXCEL =====
const exportExcel = async () => {
  const wb = XLSX.utils.book_new();

  // Build list of months between from and to
  const monthRanges = [];
  let y = filters.from_year;
  let m = filters.from_month;
  while (y < filters.to_year || (y === filters.to_year && m <= filters.to_month)) {
    monthRanges.push({ month: m, year: y });
    m++;
    if (m > 12) { m = 1; y++; }
  }

  for (const { month, year } of monthRanges) {
    // Fetch daily data for this specific month
    let monthDailyData = {};
    try {
      const dailyRes = await API.get('/attendance/daily-report', {
        params: {
          month,
          year,
          class_id: filters.class_id,
          person_type: filters.person_type
        }
      });
      monthDailyData = dailyRes.data || {};
    } catch (e) {}

    const daysInThisMonth = new Date(year, month, 0).getDate();
    const days = Array.from({ length: daysInThisMonth }, (_, i) => i + 1);

    const getMonthStatus = (personId, day) => {
      const dateKey = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      return monthDailyData[String(personId)]?.[dateKey] || monthDailyData[personId]?.[dateKey] || null;
    };

    // Filter rawData for this month and sort by class name then student name
    const monthData = [...rawData].sort((a, b) => {
      const classCompare = (a.class_name || '').localeCompare(b.class_name || '');
      if (classCompare !== 0) return classCompare;
      return (a.full_name || '').localeCompare(b.full_name || '');
    });

    // Group by class
    const grouped = {};
    monthData.forEach(row => {
      const cls = row.class_name || 'No Class';
      if (!grouped[cls]) grouped[cls] = [];
      grouped[cls].push(row);
    });

    // Build sheet rows
    const monthLabel = `${fullMonths[month - 1]} ${year}`;
    const titleRow     = [`Attendance Report — ${monthLabel}`];
    const infoRow      = [`Class: ${classLabel} | Type: ${filters.person_type} | Generated: ${new Date().toLocaleDateString('en-IN')}`];
    const legendRow    = ['P=Present | A=Absent | L=Late | H=Half Day | -=Not Marked'];
    const emptyRow     = [];

    const headers = ['No.', 'Name', 'Class', ...days.map(String), 'Present', 'Absent', 'Late', 'Half Day', 'Attendance %'];

    const wsData = [titleRow, infoRow, legendRow, emptyRow, headers];

    let rowNo = 1;

    Object.entries(grouped).forEach(([className, students]) => {
  // Class group header row
  wsData.push([`— ${className} —`]);

  students.forEach(row => {
    const rowData = [rowNo++, row.full_name, row.class_name || ''];
    days.forEach(day => {
      const status = getMonthStatus(row.id, day);
      rowData.push(getStatusLabel(status));
    });
    rowData.push(
      row.present_days || 0,
      row.absent_days || 0,
      row.late_days || 0,
      row.halfday_days || 0,
      `${getPercentage(row)}%`
    );
    wsData.push(rowData);
  });

  wsData.push([]); // empty row between classes
});

    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Column widths
    ws['!cols'] = [
      { wch: 5 }, { wch: 22 }, { wch: 14 },
      ...days.map(() => ({ wch: 4 })),
      { wch: 9 }, { wch: 9 }, { wch: 7 }, { wch: 10 }, { wch: 13 }
    ];

    // Sheet name = "May 2025", "April 2025" etc (max 31 chars for Excel)
    const sheetName = monthLabel.substring(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  await saveWorkbook(wb, `attendance-${periodLabel}-${classLabel}.xlsx`);
  setShowExport(false);
  toast.success('✅ Excel downloaded successfully!');
};

// ===== EXPORT PDF =====
 const exportPDF = async () => {
  const doc = new jsPDF({ orientation: 'landscape' });

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 64, 175);
  doc.text('SchoolMS', 14, 14);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  doc.text(`Attendance Report — ${periodLabel} — ${classLabel}`, 14, 22);

  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(`Generated on: ${new Date().toLocaleDateString('en-IN')}`, 14, 29);

  const headers = ['No.', 'Name', ...dayNumbers.map(String), 'P', 'A', 'L', 'H', '%'];

  const body = rawData.map((row, i) => [
    i + 1,
    row.full_name,
    ...dayNumbers.map(day => getStatusLabel(getStatus(row.id, day))),
    row.present_days || 0,
    row.absent_days || 0,
    row.late_days || 0,
    row.halfday_days || 0,
    `${getPercentage(row)}%`
  ]);

  autoTable(doc, {
    head: [headers],
    body,
    startY: 34,
    styles: { fontSize: 7, cellPadding: 2, font: 'helvetica' },
    headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [241, 245, 249] },
    margin: { left: 14, right: 14 },
  });

  await saveDocument(doc, `attendance-${periodLabel}-${classLabel}.pdf`);
  setShowExport(false);
  toast.success('✅ PDF downloaded successfully!');
};

  return (
    <AppLayout title="Attendance Report" subtitle="Monthly day-wise attendance sheet">
      <div className="page-header">
        <div>
          <h1>Attendance Report</h1>
          <p>{rawData.length} records • {periodLabel} • {classLabel}</p>
        </div>
        <div className="dropdown-export">
          <button className="btn btn-primary" onClick={() => setShowExport(!showExport)}>
            📤 Export ▾
          </button>
          {showExport && (
            <div className="dropdown-menu">
              <button className="dropdown-item" onClick={exportExcel}>
                📊 Excel (.xlsx)
              </button>
              <button
                className="dropdown-item"
                onClick={showInUI ? exportPDF : () => toast.error('PDF only available for single month + single class')}
                style={{
                  opacity: showInUI ? 1 : 0.4,
                  cursor: showInUI ? 'pointer' : 'not-allowed',
                  color: showInUI ? '' : '#94a3b8'
                }}>
                📄 PDF {!showInUI && '(Select 1 month + 1 class)'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div style={{background:'#fff', padding:'14px 20px', borderRadius:'12px', marginBottom:'20px', border:'1px solid #e2e8f0'}}>
        <div style={{display:'flex', flexWrap:'wrap', gap:'10px', alignItems:'center'}}>
          <div style={{display:'flex', alignItems:'center', gap:'6px'}}>
            <span style={{fontSize:'12px', fontWeight:'700', color:'#64748b'}}>FROM</span>
            <select className="form-control" value={filters.from_month} onChange={e => setFilters({...filters, from_month: parseInt(e.target.value)})}>
              {shortMonths.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
            </select>
            <select className="form-control" value={filters.from_year} onChange={e => setFilters({...filters, from_year: parseInt(e.target.value)})}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div style={{display:'flex', alignItems:'center', gap:'6px'}}>
            <span style={{fontSize:'12px', fontWeight:'700', color:'#64748b'}}>TO</span>
            <select className="form-control" value={filters.to_month} onChange={e => setFilters({...filters, to_month: parseInt(e.target.value)})}>
              {shortMonths.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
            </select>
            <select className="form-control" value={filters.to_year} onChange={e => setFilters({...filters, to_year: parseInt(e.target.value)})}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          {!isTeacher && (
            <select className="form-control" value={filters.class_id} onChange={e => setFilters({...filters, class_id: e.target.value})}>
              <option value="">All Classes</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          {!isTeacher && (
            <div style={{display:'flex', gap:'6px'}}>
              <button className={"btn btn-sm " + (filters.person_type === 'student' ? 'btn-primary' : 'btn-outline')}
                onClick={() => setFilters({...filters, person_type: 'student'})}>👨‍🎓 Students</button>
              {canSeeEmployees && (
                <button className={"btn btn-sm " + (filters.person_type === 'employee' ? 'btn-primary' : 'btn-outline')}
                  onClick={() => setFilters({...filters, person_type: 'employee'})}>👨‍💼 Employees</button>
              )}
            </div>
          )}
          <button className="btn btn-outline btn-sm" onClick={fetchReport}>🔄 Refresh</button>
        </div>

        {/* Mode indicator */}
        <div style={{marginTop:'10px', display:'flex', gap:'8px', alignItems:'center', flexWrap:'wrap'}}>
          {showInUI ? (
            <span style={{background:'#dcfce7', color:'#16a34a', padding:'4px 12px', borderRadius:'20px', fontSize:'12px', fontWeight:'700'}}>
              ✅ Showing data in UI — Excel + PDF export available
            </span>
          ) : (
            <span style={{background:'#fef3c7', color:'#d97706', padding:'4px 12px', borderRadius:'20px', fontSize:'12px', fontWeight:'700'}}>
              ⚠️ Multiple months or All Classes selected — Use Export to download Excel only
            </span>
          )}
        </div>
      </div>

      {/* POPUP — shown when multi-month or all classes */}
      {showDownloadPopup && (
        <div style={{
          background:'linear-gradient(135deg, #fef3c7, #fff7ed)',
          border:'2px solid #f59e0b',
          borderRadius:'16px',
          padding:'32px',
          textAlign:'center',
          marginBottom:'20px',
          boxShadow:'0 4px 20px rgba(245,158,11,0.15)'
        }}>
          <div style={{fontSize:'52px', marginBottom:'12px'}}>📊</div>
          <h2 style={{fontSize:'20px', fontWeight:'800', color:'#92400e', margin:'0 0 8px'}}>
            Large Dataset Selected
          </h2>
          <p style={{color:'#78350f', fontSize:'14px', margin:'0 0 20px', lineHeight:'1.6'}}>
            You have selected <strong>{!isSingleMonth ? 'multiple months' : ''}</strong>
            {!isSingleMonth && !isSingleClass ? ' and ' : ''}
            <strong>{!isSingleClass ? 'All Classes' : ''}</strong>.
            <br/>
            This data is too large to display in the UI.
            <br/>
            Please use the <strong>Export → Excel</strong> button to download the full report.
          </p>
          <div style={{display:'flex', gap:'12px', justifyContent:'center', flexWrap:'wrap'}}>
            <button
              className="btn btn-primary"
              onClick={exportExcel}
              style={{fontSize:'15px', padding:'10px 24px'}}>
              📊 Download Excel Report
            </button>
            <button
              className="btn btn-outline"
              onClick={() => {
                setFilters(f => ({...f, class_id: classes[0]?.id || f.class_id, to_month: f.from_month, to_year: f.from_year}));
                setShowDownloadPopup(false);
              }}
              style={{fontSize:'14px', padding:'10px 20px'}}>
              ← Select Single Month + Class
            </button>
          </div>
          <p style={{marginTop:'16px', fontSize:'12px', color:'#92400e', opacity:0.7}}>
            💡 Tip: Select a specific class + same FROM and TO month to view data in the UI
          </p>
        </div>
      )}

      {/* DATA VIEW — only shown when single month + single class */}
      {loading ? (
        <div className="loading"><div className="spinner"></div><p>Loading attendance sheet...</p></div>
      ) : showInUI ? (
        <>
          {/* Header Banner */}
          <div style={{background:'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)', borderRadius:'14px', padding:'18px 24px', marginBottom:'16px', color:'#fff', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:'12px'}}>
            <div>
              <h2 style={{fontSize:'20px', fontWeight:'800', margin:0}}>📋 Attendance Sheet</h2>
              <p style={{margin:'4px 0 0', opacity:0.85, fontSize:'13px'}}>
                {classLabel} • {filters.person_type === 'student' ? 'Students' : 'Employees'} • {periodLabel}
              </p>
            </div>
            <div style={{textAlign:'right'}}>
              <div style={{fontSize:'24px', fontWeight:'800'}}>{fullMonths[filters.from_month - 1]}</div>
              <div style={{fontSize:'13px', opacity:0.8}}>{filters.from_year}</div>
            </div>
          </div>

          {/* Summary Stats */}
          <div style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:'12px', marginBottom:'16px'}}>
            {[
              { label:'Total People', value: rawData.length, color:'#1e40af', icon:'👥' },
              { label:'Avg Present', value: rawData.length ? Math.round(rawData.reduce((a,r) => a + (r.present_days||0), 0) / rawData.length) : 0, color:'#10b981', icon:'✅' },
              { label:'Avg Absent', value: rawData.length ? Math.round(rawData.reduce((a,r) => a + (r.absent_days||0), 0) / rawData.length) : 0, color:'#ef4444', icon:'❌' },
              { label:'Working Days', value: daysInMonth, color:'#f59e0b', icon:'📅' },
            ].map(s => (
              <div key={s.label} style={{background:'#fff', borderRadius:'12px', padding:'14px 16px', border:'1px solid #e2e8f0', borderLeft:`4px solid ${s.color}`}}>
                <div style={{fontSize:'11px', color:'#64748b', fontWeight:'700'}}>{s.icon} {s.label}</div>
                <div style={{fontSize:'26px', fontWeight:'800', color:'#1e293b', lineHeight:1.2, marginTop:'4px'}}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Bar Chart */}
          <div style={{background:'#fff', borderRadius:'14px', padding:'16px 20px', marginBottom:'16px', border:'1px solid #e2e8f0'}}>
            <div style={{fontSize:'12px', fontWeight:'700', color:'#64748b', marginBottom:'10px', textTransform:'uppercase', letterSpacing:'0.5px'}}>📊 Daily Attendance Status — {periodLabel}</div>
            <div style={{display:'flex', alignItems:'flex-end', gap:'2px', height:'70px'}}>
              {dayNumbers.map(day => {
                const count = getDailyPresentCount(day);
                const heightPct = maxDailyCount > 0 ? (count / maxDailyCount) : 0;
                return (
                  <div key={day} style={{flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:'2px', minWidth:'3px'}}>
                    <div style={{
                      width:'100%', borderRadius:'3px 3px 0 0',
                      background: count > 0 ? '#3b82f6' : '#e2e8f0',
                      height:`${Math.max(heightPct * 55, count > 0 ? 8 : 3)}px`,
                      transition:'height 0.3s ease'
                    }} title={`Day ${day}: ${count} present`} />
                    <span style={{fontSize:'8px', color:'#94a3b8'}}>{day}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Main Table */}
          <div style={{background:'#fff', borderRadius:'14px', border:'1px solid #e2e8f0', overflow:'hidden', marginBottom:'16px'}}>
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%', borderCollapse:'collapse', minWidth:'800px'}}>
                <thead>
                  <tr style={{background:'#1e40af'}}>
                    <th style={{padding:'11px 10px', color:'#fff', fontSize:'11px', fontWeight:'700', textAlign:'left', width:'40px'}}>NO.</th>
                    <th style={{padding:'11px 10px', color:'#fff', fontSize:'11px', fontWeight:'700', textAlign:'left', minWidth:'130px'}}>NAME</th>
                    {dayNumbers.map(d => (
                      <th key={d} style={{padding:'8px 2px', color:'#fff', fontSize:'10px', fontWeight:'700', textAlign:'center', width:'22px', minWidth:'22px'}}>{d}</th>
                    ))}
                    <th style={{padding:'11px 6px', color:'#fff', fontSize:'10px', fontWeight:'700', textAlign:'center', minWidth:'36px'}}>P</th>
                    <th style={{padding:'11px 6px', color:'#fff', fontSize:'10px', fontWeight:'700', textAlign:'center', minWidth:'36px'}}>A</th>
                    <th style={{padding:'11px 6px', color:'#fff', fontSize:'10px', fontWeight:'700', textAlign:'center', minWidth:'36px'}}>L</th>
                    <th style={{padding:'11px 6px', color:'#fff', fontSize:'10px', fontWeight:'700', textAlign:'center', minWidth:'36px'}}>H</th>
                    <th style={{padding:'11px 8px', color:'#fff', fontSize:'10px', fontWeight:'700', textAlign:'center', minWidth:'50px'}}>%</th>
                  </tr>
                </thead>
                <tbody>
                  {rawData.map((row, i) => {
                    const pct = getPercentage(row);
                    return (
                      <tr key={row.id || i} style={{borderBottom:'1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#f8fafc'}}>
                        <td style={{padding:'10px', fontSize:'12px', color:'#64748b', fontWeight:'600'}}>{i + 1}</td>
                        <td style={{padding:'10px', whiteSpace:'nowrap'}}>
                          <div style={{fontSize:'13px', fontWeight:'700', color:'#1e293b'}}>{row.full_name}</div>
                          {row.class_name && <div style={{fontSize:'10px', color:'#94a3b8'}}>{row.class_name}</div>}
                        </td>
                        {dayNumbers.map(day => {
                          const status = getStatus(row.id, day);
                          const color = getDotColor(status);
                          return (
                            <td key={day} style={{padding:'4px 2px', textAlign:'center'}}>
                              {color
                                ? <div style={{width:'9px', height:'9px', borderRadius:'50%', background:color, margin:'0 auto'}} title={status} />
                                : <div style={{width:'9px', height:'9px', margin:'0 auto'}} />
                              }
                            </td>
                          );
                        })}
                        <td style={{padding:'8px 4px', textAlign:'center'}}>
                          <span style={{background:'#dcfce7', color:'#16a34a', padding:'2px 6px', borderRadius:'10px', fontSize:'11px', fontWeight:'700'}}>{row.present_days || 0}</span>
                        </td>
                        <td style={{padding:'8px 4px', textAlign:'center'}}>
                          <span style={{background:'#fee2e2', color:'#dc2626', padding:'2px 6px', borderRadius:'10px', fontSize:'11px', fontWeight:'700'}}>{row.absent_days || 0}</span>
                        </td>
                        <td style={{padding:'8px 4px', textAlign:'center'}}>
                          <span style={{background:'#fef3c7', color:'#d97706', padding:'2px 6px', borderRadius:'10px', fontSize:'11px', fontWeight:'700'}}>{row.late_days || 0}</span>
                        </td>
                        <td style={{padding:'8px 4px', textAlign:'center'}}>
                          <span style={{background:'#ede9fe', color:'#7c3aed', padding:'2px 6px', borderRadius:'10px', fontSize:'11px', fontWeight:'700'}}>{row.halfday_days || 0}</span>
                        </td>
                        <td style={{padding:'8px 4px', textAlign:'center'}}>
                          <span style={{
                            background: pct >= 75 ? '#dcfce7' : pct >= 50 ? '#fef3c7' : '#fee2e2',
                            color: pct >= 75 ? '#16a34a' : pct >= 50 ? '#d97706' : '#dc2626',
                            padding:'2px 6px', borderRadius:'10px', fontSize:'11px', fontWeight:'700'
                          }}>{pct}%</span>
                        </td>
                      </tr>
                    );
                  })}
                  {!rawData.length && !loading && (
                    <tr>
                      <td colSpan={dayNumbers.length + 7} style={{padding:'40px', textAlign:'center', color:'#94a3b8'}}>
                        <div style={{fontSize:'36px', marginBottom:'8px'}}>📋</div>
                        <p>No attendance data found for this period</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Legend */}
          <div style={{display:'flex', gap:'16px', padding:'12px 16px', background:'#fff', borderRadius:'10px', border:'1px solid #e2e8f0', flexWrap:'wrap', alignItems:'center'}}>
            <span style={{fontSize:'12px', fontWeight:'700', color:'#64748b'}}>Legend:</span>
            {[
              {color:'#3b82f6', label:'Present (P)'},
              {color:'#ef4444', label:'Absent (A)'},
              {color:'#f59e0b', label:'Late (L)'},
              {color:'#8b5cf6', label:'Half Day (H)'},
            ].map(l => (
              <div key={l.label} style={{display:'flex', alignItems:'center', gap:'6px'}}>
                <div style={{width:'10px', height:'10px', borderRadius:'50%', background:l.color}} />
                <span style={{fontSize:'12px', color:'#64748b'}}>{l.label}</span>
              </div>
            ))}
            <span style={{marginLeft:'auto', fontSize:'11px', color:'#94a3b8'}}>
              P=Present | A=Absent | L=Late | H=Half Day | %=Attendance %
            </span>
          </div>
        </>
      ) : null}
    </AppLayout>
  );
};

export default AttendanceReport;
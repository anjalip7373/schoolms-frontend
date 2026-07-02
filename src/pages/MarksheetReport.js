import React, { useState, useEffect } from 'react';
import AppLayout from '../components/layout/AppLayout';
import API from '../utils/api';
import { toast } from 'react-toastify';
import { useAuth } from '../context/AuthContext';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { saveWorkbook, saveDocument } from '../utils/exportUtils';

const MarksheetReport = () => {
  const { user } = useAuth();
  const isTeacher = user?.role === 'Teacher' || user?.role === 'teacher';

  const [classes, setClasses] = useState([]);
  const [examTypes, setExamTypes] = useState([]);
  const [marksheetData, setMarksheetData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [search, setSearch] = useState('');

  const [expandedStudentId, setExpandedStudentId] = useState(null);

  const currentYear = new Date().getFullYear();
  const academicYears = [
    `${currentYear - 1}-${currentYear}`,
    `${currentYear}-${currentYear + 1}`
  ];

  const [filters, setFilters] = useState({
    class_id: '',
    exam_type_id: '',
    academic_year: `${currentYear}-${currentYear + 1}`
  });

  useEffect(() => {
    API.get('/config/classes').then(r => setClasses(r.data));
    API.get('/exam-types').then(r => setExamTypes(r.data));
  }, []);

  const fetchMarksheet = async () => {
    if (!filters.exam_type_id) {
      return toast.error('Please select exam type');
    }
    if (!isTeacher && !filters.class_id) {
      return toast.error('Please select a class');
    }
    setLoading(true);
    try {
      const params = {
        exam_type_id: filters.exam_type_id,
        academic_year: filters.academic_year,
      };
      if (!isTeacher && filters.class_id) {
        params.class_id = filters.class_id;
      }

      const { data } = await API.get('/marks/marksheet', { params });
      setMarksheetData(data);
      if (!data.length) toast.info('No marks data found. Make sure marks are entered first.');
    } catch (err) {
      console.error('Marksheet error:', err.response?.data);
      toast.error(err.response?.data?.message || 'Failed to load marksheet');
    } finally { setLoading(false); }
  };

  useEffect(() => {
    if (filters.exam_type_id && (filters.class_id || isTeacher)) {
      fetchMarksheet();
    }
  }, [filters]);

  const buildData = (dataSource) => {
    if (!dataSource.length) return { rows: [], subjects: [] };
    
    const subjectMap = {};
    dataSource.forEach(m => {
      subjectMap[m.subject_id] = {
        id: m.subject_id, name: m.subject_name,
        code: m.code, pass_marks: m.pass_marks, max_marks: m.max_marks
      };
    });
    const subjects = Object.values(subjectMap);
    const studentMap = {};

    const isFinalCumulative = examType.toLowerCase().includes('final');

    dataSource.forEach(m => {
      if (!studentMap[m.student_id]) {
        studentMap[m.student_id] = {
          id: m.student_id, name: m.student_name,
          roll_no: m.roll_no, class_name: m.class_name,
          exam_type: m.exam_type_name, marks: {}
        };
      }

      if (isFinalCumulative) {
        if (!studentMap[m.student_id].marks[m.subject_id]) {
          studentMap[m.student_id].marks[m.subject_id] = { obtained: 0, max: 0, pass: 0, is_absent: false };
        }
        const currentScore = studentMap[m.student_id].marks[m.subject_id];
        currentScore.obtained += m.marks_obtained ? parseFloat(m.marks_obtained) : 0;
        currentScore.max += parseInt(m.max_marks || 0);
        currentScore.pass += parseInt(m.pass_marks || 0);
        if (m.is_absent === 1 || m.is_absent === true) currentScore.is_absent = true;
      } else {
        studentMap[m.student_id].marks[m.subject_id] = {
          obtained: m.marks_obtained,
          max: m.max_marks,
          pass: m.pass_marks,
          is_absent: m.is_absent === 1 || m.is_absent === true,
        };
      }
     
      if (m.overall_remark) {
        studentMap[m.student_id].overall_remark = m.overall_remark;
      }
    });

    const rows = Object.values(studentMap).map(s => {
      let total = 0, maxTotal = 0, passed = true;
      subjects.forEach(sub => {
        const m = s.marks[sub.id];
        if (m) {
          if (m.is_absent) {
            maxTotal += parseInt(m.max);
            passed = false;
          } else {
            total += parseFloat(m.obtained || 0);
            maxTotal += parseInt(m.max);
            if (parseFloat(m.obtained) < m.pass) passed = false;
          }
        } else {
          maxTotal += sub.max_marks;
          passed = false;
        }
      });
      const percentage = maxTotal > 0 ? ((total / maxTotal) * 100).toFixed(1) : 0;
      
      const grade = !passed ? '—' : (percentage >= 90 ? 'A+' : percentage >= 80 ? 'A' :
        percentage >= 70 ? 'B+' : percentage >= 60 ? 'B' :
        percentage >= 50 ? 'C' : percentage >= 35 ? 'D' : 'F');
        
      return { ...s, total, maxTotal, percentage, grade, passed };
    });

    return { rows, subjects };
  };

  const { rows: allRows, subjects } = buildData(marksheetData);

  const rows = allRows.filter(r => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return r.name.toLowerCase().includes(q) || (r.roll_no && String(r.roll_no).toLowerCase().includes(q));
  });

  const className = classes.find(c => c.id == filters.class_id)?.name || 'All Classes';
  const examType = examTypes.find(e => e.id == filters.exam_type_id)?.name || '';

  const exportSingleStudentPDF = async (student) => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.width;
    const pageH = doc.internal.pageSize.height;

    doc.setDrawColor(30, 64, 175);
    doc.setLineWidth(1.5);
    doc.rect(8, 8, pageW - 16, pageH - 16);
    doc.setLineWidth(0.5);
    doc.rect(10, 10, pageW - 20, pageH - 20);

    doc.setFillColor(30, 64, 175);
    doc.rect(10, 10, pageW - 20, 28, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20); doc.setFont('helvetica', 'bold');
    doc.text('SchoolMS', pageW / 2, 22, { align: 'center' });
    doc.setFontSize(10); doc.setFont('helvetica', 'normal');
    doc.text('School Management System', pageW / 2, 30, { align: 'center' });

    doc.setFillColor(241, 245, 249);
    doc.rect(10, 38, pageW - 20, 12, 'F');
    doc.setTextColor(30, 64, 175);
    doc.setFontSize(13); doc.setFont('helvetica', 'bold');
    doc.text(`MARK SHEET — ${examType.toUpperCase()}`, pageW / 2, 46, { align: 'center' });

    const infoY = 58;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.rect(12, infoY - 4, pageW - 24, 30, 'FD');

    const leftX = 16;
    const leftValX = 50;
    const rightX = pageW / 2 + 4;
    const rightValX = pageW / 2 + 38;

    const infoLeft = [
      ['Student Name', student.name],
      ['Roll No', student.roll_no],
      ['Class', student.class_name],
    ];
    const infoRight = [
      ['Academic Year', filters.academic_year],
      ['Exam Type', examType],
      ['Date', new Date().toLocaleDateString('en-IN')],
    ];

    const lineH = 9;
    infoLeft.forEach(([label, value], i) => {
      doc.setFontSize(9); doc.setFont('helvetica', 'bold');
      doc.setTextColor(100, 116, 139);
      doc.text(`${label}:`, leftX, infoY + i * lineH);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(30, 41, 59);
      doc.text(String(value || '—'), leftValX, infoY + i * lineH);
    });
    infoRight.forEach(([label, value], i) => {
      doc.setFontSize(9); doc.setFont('helvetica', 'bold');
      doc.setTextColor(100, 116, 139);
      doc.text(`${label}:`, rightX, infoY + i * lineH);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(30, 41, 59);
      doc.text(String(value || '—'), rightValX, infoY + i * lineH);
    });

    const tableY = infoY + 32;
    const tableHeaders = [['#', 'Subject', 'Code', 'Max Marks', 'Pass Marks', 'Marks Obtained', 'Status']];
    const tableBody = subjects.map((s, i) => {
      const m = student.marks[s.id];
      const isAbsent = m?.is_absent;
      const obtained = isAbsent ? 'AB' : (m?.obtained ?? '—');
      const status = isAbsent ? 'ABSENT' : m
        ? (parseFloat(m.obtained) >= m.pass ? 'PASS' : 'FAIL')
        : '—';
      return [
        String(i + 1),
        s.name,
        s.code || '—',
        String(m ? m.max : s.max_marks),
        String(m ? m.pass : s.pass_marks),
        String(obtained),
        status
      ];
    });

    autoTable(doc, {
      head: tableHeaders,
      body: tableBody,
      startY: tableY,
      styles: { fontSize: 9, cellPadding: 3, halign: 'center', font: 'helvetica' },
      headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold', fontSize: 9 },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { halign: 'left', cellWidth: 50 },
        2: { cellWidth: 18, halign: 'center' },
        3: { cellWidth: 24, halign: 'center' },
        4: { cellWidth: 24, halign: 'center' },
        5: { cellWidth: 28, halign: 'center' },
        6: { cellWidth: 22, halign: 'center' },
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      didParseCell: (data) => {
        if (data.section === 'body') {
          if (data.column.index === 6) {
            const val = data.cell.text[0];
            if (val === 'PASS') {
              data.cell.styles.textColor = [22, 163, 74];
              data.cell.styles.fontStyle = 'bold';
            }
            if (val === 'FAIL' || val === 'ABSENT') {
              data.cell.styles.textColor = [220, 38, 38];
              data.cell.styles.fontStyle = 'bold';
            }
          }
        }
      },
      margin: { left: 12, right: 12 }
    });
    const summaryY = doc.lastAutoTable.finalY + 8;
    const isPassed = student.passed;
    const summaryH = 30;

    doc.setFillColor(isPassed ? 240 : 254, isPassed ? 253 : 242, isPassed ? 244 : 242);
    doc.setDrawColor(isPassed ? 22 : 220, isPassed ? 163 : 38, isPassed ? 74 : 38);
    doc.setLineWidth(0.8);
    doc.roundedRect(12, summaryY, pageW - 24, summaryH, 3, 3, 'FD');

    const summaryItems = [
      ['Total Marks', `${student.total} / ${student.maxTotal}`],
      ['Percentage', isPassed ? `${student.percentage}%` : '—'],
      ['Grade', student.grade],
      ['Result', isPassed ? 'PASS' : 'FAIL'],
    ];

    const colW = (pageW - 24) / 4;
    summaryItems.forEach(([label, value], i) => {
      const x = 12 + i * colW + colW / 2;
      doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 116, 139);
      doc.text(label, x, summaryY + 10, { align: 'center' });
      doc.setFontSize(12); doc.setFont('helvetica', 'bold');
      if (i === 3) {
        doc.setTextColor(isPassed ? 22 : 220, isPassed ? 163 : 38, isPassed ? 74 : 38);
      } else {
        doc.setTextColor(30, 64, 175);
      }
      doc.text(String(value), x, summaryY + 22, { align: 'center' });
    });

    const remarkY = summaryY + summaryH + 6;
    doc.setFillColor(254, 243, 199); doc.setDrawColor(245, 158, 11); doc.setLineWidth(0.5);
    doc.roundedRect(12, remarkY, pageW - 24, 14, 2, 2, 'FD');
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(146, 64, 14);
    doc.text("Teacher's Remark:", 16, remarkY + 9);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(120, 53, 15);
    const remarkText = student.overall_remark || 'No remarks';
    doc.text(remarkText, 52, remarkY + 9, { maxWidth: pageW - 68 });

    const gradeY = remarkY + 20;
    doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(100, 116, 139);
    doc.text('GRADE SCALE:', 14, gradeY);
    const gradeScale = [
      ['A+', '90-100'], ['A', '80-89'], ['B+', '70-79'],
      ['B', '60-69'], ['C', '50-59'], ['D', '35-49'], ['F', '<35']
    ];
    gradeScale.forEach(([g, r], i) => {
      doc.setFont('helvetica', 'normal');
      doc.text(`${g}:${r}%`, 36 + i * 24, gradeY);
    });

    const sigY = pageH - 36;
    doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.5);
    const sigPositions = [
      { x: 18, label: 'Class Teacher' },
      { x: pageW / 2 - 22, label: 'Principal' },
      { x: pageW - 65, label: 'Parent / Guardian' }
    ];
    sigPositions.forEach(({ x, label }) => {
      doc.line(x, sigY, x + 48, sigY);
      doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 116, 139);
      doc.text(label, x + 24, sigY + 6, { align: 'center' });
    });

    doc.setFontSize(7); doc.setTextColor(148, 163, 184);
    doc.text('This is a computer generated marksheet. — SchoolMS', pageW / 2, pageH - 14, { align: 'center' });

    await saveDocument(doc, `marksheet-${student.name.replace(/\s+/g, '_')}-${examType}.pdf`);
    toast.success(`Marksheet for ${student.name} downloaded!`);
  };

  const exportExcel = async () => {
    setShowExport(false);
    const wb = XLSX.utils.book_new();

    const buildSheetData = (clsRows, clsSubjects, clsName, etName) => {
      const headers = [
        '#', 'Roll No', 'Student Name',
        ...clsSubjects.map(s => `${s.name} (Max:${s.max_marks})`),
        'Total', 'Max Marks', 'Percentage', 'Grade', 'Result', 'Remark'
      ];
      const title = [`${clsName} — ${etName} — ${filters.academic_year}`];
      const dataRows = clsRows.map((r, i) => [
        i + 1, r.roll_no, r.name,
        ...clsSubjects.map(s => r.marks[s.id]?.obtained ?? '—'),
        r.total, r.maxTotal, r.passed ? `${r.percentage}%` : '—', r.grade, r.passed ? 'PASS' : 'FAIL', r.overall_remark || '—'
      ]);
      return [title, [], headers, ...dataRows, [], []];
    };

    try {
      if (!isTeacher && !filters.class_id && filters.exam_type_id) {
        for (const cls of classes) {
          try {
            const { data } = await API.get('/marks/marksheet', {
              params: { class_id: cls.id, exam_type_id: filters.exam_type_id, academic_year: filters.academic_year }
            });
            if (!data.length) continue;
            const { rows: clsRows, subjects: clsSubjects } = buildData(data);
            const ws = XLSX.utils.aoa_to_sheet(buildSheetData(clsRows, clsSubjects, cls.name, examType));
            ws['!cols'] = [{ wch: 5 }, { wch: 10 }, { wch: 22 }, ...clsSubjects.map(() => ({ wch: 16 })), { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 8 }, { wch: 8 }, { wch: 30 }];
            XLSX.utils.book_append_sheet(wb, ws, cls.name.slice(0, 31));
          } catch { continue; }
        }
        if (!wb.SheetNames.length) { toast.error('No data found'); return; }
        await saveWorkbook(wb, `marksheet-AllClasses-${examType}.xlsx`);
        toast.success(`Downloaded! ${wb.SheetNames.length} class(es) for ${examType}`);

      } else {
        const headers = ['#', 'Roll No', 'Student Name', ...subjects.map(s => `${s.name}`), 'Total', 'Max Marks', 'Percentage', 'Grade', 'Result', 'Remark'];
        const title = [`${className} — ${examType} — ${filters.academic_year}`];
        const dataRows = rows.map((r, i) => [
          i + 1, r.roll_no, r.name,
          ...subjects.map(s => r.marks[s.id]?.obtained ?? '—'),
          r.total, r.maxTotal, r.passed ? `${r.percentage}%` : '—', r.grade, r.passed ? 'PASS' : 'FAIL', r.overall_remark || '—'
        ]);
        const ws = XLSX.utils.aoa_to_sheet([title, [], headers, ...dataRows]);
        ws['!cols'] = [{ wch: 5 }, { wch: 10 }, { wch: 22 }, ...subjects.map(() => ({ wch: 16 })), { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 8 }, { wch: 8 }, { wch: 30 }];
        XLSX.utils.book_append_sheet(wb, ws, examType.slice(0, 31));
        await saveWorkbook(wb, `marksheet-${className.replace(/\s+/g, '_')}-${examType}.xlsx`);
        toast.success('Excel downloaded!');
      }
    } catch (err) { toast.error('Export failed'); }
  };

  const exportPDF = async () => {
    const doc = new jsPDF({ orientation: 'landscape', format: 'a3' });
    doc.setFillColor(30, 64, 175); doc.rect(0, 0, doc.internal.pageSize.width, 36, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(18); doc.setFont('helvetica', 'bold');
    doc.text('SchoolMS — Marksheet Report', 14, 16);
    doc.setFontSize(10); doc.setFont('helvetica', 'normal');
    doc.text(`${examType} | ${className} | ${filters.academic_year} | Generated: ${new Date().toLocaleDateString('en-IN')}`, 14, 28);

    const headers = ['#', 'Roll No', 'Student Name', ...subjects.map(s => `${s.name}`), 'Total', '%', 'Grade', 'Result', 'Remark'];
    const body = rows.map((r, i) => [
      i + 1, r.roll_no, r.name,
      ...subjects.map(s => {
        const m = r.marks[s.id];
        if (!m) return '—';
        if (m.is_absent) return 'AB';
        return m.obtained ?? '—';
      }),
      `${r.total}/${r.maxTotal}`, r.passed ? `${r.percentage}%` : '—', r.grade, r.passed ? 'PASS' : 'FAIL', r.overall_remark || '—'
    ]);

    autoTable(doc, {
      head: [headers], body, startY: 42,
      styles: { fontSize: 7, cellPadding: 2, halign: 'center' },
      headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold' },
      columnStyles: { 2: { halign: 'left', cellWidth: 28 }, [headers.length - 1]: { halign: 'left', cellWidth: 35 } },
      alternateRowStyles: { fillColor: [241, 245, 249] },
      didParseCell: (data) => {
        if (data.section === 'body') {
          const val = data.cell.text[0];
          if (val === 'PASS') data.cell.styles.textColor = [22, 163, 74];
          if (val === 'FAIL' || val === '—') data.cell.styles.textColor = [220, 38, 38];
        }
      },
      margin: { left: 14, right: 14 }
    });
    await saveDocument(doc, `marksheet-${className.replace(/\s+/g, '_')}-${examType}.pdf`);
    toast.success('PDF downloaded!');
    setShowExport(false);
  };

  const toggleStudentCard = (id) => {
    setExpandedStudentId(expandedStudentId === id ? null : id);
  };

  return (
    <AppLayout title="Marksheet Report" subtitle="View and export student marksheets">
      <style>{`
        .desktop-report-view { display: block; }
        .mobile-report-view { display: none; }
        @media (max-width: 1300px) {
          .desktop-report-view { display: none !important; }
          .mobile-report-view { display: block !important; width: 100% !important; }
          .mobile-student-card { background: #fff; border-radius: 12px; border: 1px solid #cbd5e1; margin-bottom: 12px; overflow: hidden; }
          .mobile-card-header { padding: 14px 16px; background: #1e293b; color: #fff; cursor: pointer; }
          .mobile-header-top { display: flex; justify-content: space-between; align-items: center; }
          .mobile-header-stats { display: grid; grid-template-columns: repeat(3, 1fr); font-size: 11px; padding-top: 4px; }
          .mobile-collapsible-content { padding: 16px; background: #f8fafc; border-top: 1px solid #e2e8f0; }
          .mobile-subject-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #e2e8f0; font-size: 13px; }
        }
      `}</style>

      <div style={{ width: '100%', overflowX: 'hidden' }}>
        <div className="page-header">
          <div><h1>Marksheet Report</h1><p>{rows.length} students loaded</p></div>
          {rows.length > 0 && (
            <div className="dropdown-export">
              <button className="btn btn-primary" onClick={() => setShowExport(!showExport)}>📤 Export ▾</button>
              {showExport && (
                <div className="dropdown-menu">
                  <button className="dropdown-item" onClick={exportExcel}>📊 Excel (.xlsx)</button>
                  <button className="dropdown-item" onClick={exportPDF}>📄 PDF</button>
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{background:'#fff', padding:'16px 20px', borderRadius:'12px', marginBottom:'20px', border:'1px solid #e2e8f0'}}>
          <div style={{display:'flex', gap:'10px', flexWrap:'wrap', alignItems:'center'}}>
            {!isTeacher && (
              <select className="form-control" value={filters.class_id} onChange={e => setFilters({...filters, class_id: e.target.value})}>
                <option value="">All Classes</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
            <select className="form-control" value={filters.exam_type_id} onChange={e => setFilters({...filters, exam_type_id: e.target.value})}>
              <option value="">Select Exam Type *</option>
              {examTypes.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            <select className="form-control" value={filters.academic_year} onChange={e => setFilters({...filters, academic_year: e.target.value})}>
              {academicYears.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>

        {loading ? <div className="loading"><div className="spinner"></div></div> : rows.length > 0 ? (
          <>
            <div className="mobile-report-view">
              {rows.map((row) => {
                const isOpen = expandedStudentId === row.id;
                return (
                  <div key={row.id} className="mobile-student-card">
                    <div className="mobile-card-header" onClick={() => toggleStudentCard(row.id)}>
                      <div className="mobile-header-top">
                        <h3>{row.name}</h3>
                        <span className={`badge ${row.passed ? 'badge-success' : 'badge-danger'}`}>{row.passed ? 'PASS' : 'FAIL'}</span>
                      </div>
                      <div className="mobile-header-stats">
                        <div>Total: <strong>{row.total}/{row.maxTotal}</strong></div>
                        <div>%: <strong>{row.passed ? `${row.percentage}%` : '—'}</strong></div>
                        <div>Grade: <strong>{row.grade}</strong></div>
                      </div>
                    </div>
                    {isOpen && (
                      <div className="mobile-collapsible-content">
                        {subjects.map(s => {
                          const m = row.marks[s.id];
                          return (
                            <div key={s.id} className="mobile-subject-row">
                              <span>{s.name}:</span>
                              <strong>{m?.is_absent ? 'AB' : m?.obtained ?? '—'}</strong>
                            </div>
                          );
                        })}
                        <button className="btn btn-primary btn-sm" style={{width:'100%', marginTop:'12px'}} onClick={() => exportSingleStudentPDF(row)}>📄 View Full PDF</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="desktop-report-view">
              <div style={{background:'#fff', borderRadius:'14px', border:'1px solid #e2e8f0', overflow:'hidden'}}>
                <div className="table-wrapper" style={{overflowX:'auto', maxHeight:'400px', overflowY:'auto'}}>
                  <table>
                    <thead style={{position:'sticky', top:0, zIndex:2}}>
                      <tr style={{background:'#1e40af', color:'#fff'}}>
                        <th>#</th><th>ROLL NO</th><th>STUDENT NAME</th>
                        {subjects.map(s => <th key={s.id}>{s.name}</th>)}
                        <th>TOTAL</th><th>%</th><th>GRADE</th><th>RESULT</th><th>REMARK</th><th>ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, i) => (
                        <tr key={row.id} style={{background: i % 2 === 0 ? '#fff' : '#f8fafc'}}>
                          <td>{i + 1}</td>
                          <td><code>{row.roll_no}</code></td>
                          <td><strong>{row.name}</strong></td>
                          {subjects.map(s => {
                            const m = row.marks[s.id];
                            return <td key={s.id}>{m?.is_absent ? 'AB' : m?.obtained ?? '—'}</td>;
                          })}
                          <td><strong>{row.total}/{row.maxTotal}</strong></td>
                          <td>{row.passed ? `${row.percentage}%` : '—'}</td>
                          <td>{row.grade}</td>
                          <td><span className={`badge ${row.passed ? 'badge-success' : 'badge-danger'}`}>{row.passed ? 'PASS' : 'FAIL'}</span></td>
                          <td>{row.overall_remark || '—'}</td>
                          <td><button className="btn btn-outline btn-sm" onClick={() => exportSingleStudentPDF(row)}>📄 Card</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        ) : <div className="card"><div className="empty-state"><p>No reports match selection.</p></div></div>}
      </div>
    </AppLayout>
  );
};

export default MarksheetReport;

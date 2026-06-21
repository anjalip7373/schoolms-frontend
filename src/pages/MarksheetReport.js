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
      // Build params — don't send class_id for teacher (backend uses assigned class)
      const params = {
        exam_type_id: filters.exam_type_id,
        academic_year: filters.academic_year,
      };
      if (!isTeacher && filters.class_id) {
        params.class_id = filters.class_id;
      }

      console.log('Fetching marksheet with params:', params);
      const { data } = await API.get('/marks/marksheet', { params });
      console.log('Marksheet data received:', data.length, 'rows');
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
 

  // Build structured rows and subjects
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
    dataSource.forEach(m => {
      if (!studentMap[m.student_id]) {
        studentMap[m.student_id] = {
          id: m.student_id, name: m.student_name,
          roll_no: m.roll_no, class_name: m.class_name,
          exam_type: m.exam_type_name, marks: {}
        };
      }

      studentMap[m.student_id].marks[m.subject_id] = {
        obtained: m.marks_obtained,
        max: m.max_marks,
        pass: m.pass_marks,
        is_absent: m.is_absent === 1 || m.is_absent === true,
      };
     
      // Overall remark is same for all subjects of a student
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
            // Absent — counts as 0, fails that subject
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
      const grade = percentage >= 90 ? 'A+' : percentage >= 80 ? 'A' :
        percentage >= 70 ? 'B+' : percentage >= 60 ? 'B' :
        percentage >= 50 ? 'C' : percentage >= 35 ? 'D' : 'F';
      return { ...s, total, maxTotal, percentage, grade, passed };
    });

    return { rows, subjects };
  };

  const { rows: allRows, subjects } = buildData(marksheetData);

  // Search filter
  const rows = allRows.filter(r => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return r.name.toLowerCase().includes(q) || r.roll_no.toLowerCase().includes(q);
  });

  const className = classes.find(c => c.id == filters.class_id)?.name || 'All Classes';
  const examType = examTypes.find(e => e.id == filters.exam_type_id)?.name || '';

  // ── SINGLE STUDENT MARKSHEET PDF (like real exam marksheet) ──
  const exportSingleStudentPDF = async (student) => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.width;
    const pageH = doc.internal.pageSize.height;

    // Outer border
    doc.setDrawColor(30, 64, 175);
    doc.setLineWidth(1.5);
    doc.rect(8, 8, pageW - 16, pageH - 16);
    doc.setLineWidth(0.5);
    doc.rect(10, 10, pageW - 20, pageH - 20);

    // School header
    doc.setFillColor(30, 64, 175);
    doc.rect(10, 10, pageW - 20, 28, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20); doc.setFont('helvetica', 'bold');
    doc.text('SchoolMS', pageW / 2, 22, { align: 'center' });
    doc.setFontSize(10); doc.setFont('helvetica', 'normal');
    doc.text('School Management System', pageW / 2, 30, { align: 'center' });

    // MARKSHEET title
    doc.setFillColor(241, 245, 249);
    doc.rect(10, 38, pageW - 20, 12, 'F');
    doc.setTextColor(30, 64, 175);
    doc.setFontSize(13); doc.setFont('helvetica', 'bold');
    doc.text(`MARK SHEET — ${examType.toUpperCase()}`, pageW / 2, 46, { align: 'center' });

    // Student info section
    const infoY = 58;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.rect(12, infoY - 4, pageW - 24, 30, 'FD');

    // Left info
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

    // Marks table — NO remark column (only per-subject)
    const tableY = infoY + 32;
    const tableHeaders = [['#', 'Subject', 'Code', 'Max Marks', 'Pass Marks', 'Marks Obtained', 'Status']];
    const tableBody = subjects.map((s, i) => {
      const m = student.marks[s.id];
      const isAbsent = m?.is_absent;
      const obtained = isAbsent ? 'AB' : (m?.obtained ?? '—');
      const status = isAbsent ? 'ABSENT' : m
        ? (parseFloat(m.obtained) >= s.pass_marks ? 'PASS' : 'FAIL')
        : '—';
      return [
        String(i + 1),
        s.name,
        s.code || '—',
        String(s.max_marks),
        String(s.pass_marks),
        String(obtained),
        status
      ];
    });

    autoTable(doc, {
      head: tableHeaders,
      body: tableBody,
      startY: tableY,
      styles: {
        fontSize: 9,
        cellPadding: 3,
        halign: 'center',
        font: 'helvetica'
      },
      headStyles: {
        fillColor: [30, 64, 175],
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 9
      },
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
          if (data.column.index === 5) {
            const subj = subjects[data.row.index];
            const val = parseFloat(data.cell.text[0]);
            if (subj && !isNaN(val) && val < subj.pass_marks) {
              data.cell.styles.textColor = [220, 38, 38];
              data.cell.styles.fontStyle = 'bold';
            }
          }
        }
      },
      margin: { left: 12, right: 12 }
    });

    // Result summary box — fixed position
    const summaryY = doc.lastAutoTable.finalY + 8;
    const isPassed = student.passed;
    const summaryH = 30;

    doc.setFillColor(
      isPassed ? 240 : 254,
      isPassed ? 253 : 242,
      isPassed ? 244 : 242
    );
    doc.setDrawColor(
      isPassed ? 22 : 220,
      isPassed ? 163 : 38,
      isPassed ? 74 : 38
    );
    doc.setLineWidth(0.8);
    doc.roundedRect(12, summaryY, pageW - 24, summaryH, 3, 3, 'FD');

    // Summary items — evenly spaced
    const summaryItems = [
      ['Total Marks', `${student.total} / ${student.maxTotal}`],
      ['Percentage', `${student.percentage}%`],
      ['Grade', student.grade],
      ['Result', isPassed ? 'PASS' : 'FAIL'],
    ];

    const colW = (pageW - 24) / 4;
    summaryItems.forEach(([label, value], i) => {
      const x = 12 + i * colW + colW / 2;
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text(label, x, summaryY + 10, { align: 'center' });

      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      if (i === 3) {
        doc.setTextColor(isPassed ? 22 : 220, isPassed ? 163 : 38, isPassed ? 74 : 38);
      } else {
        doc.setTextColor(30, 64, 175);
      }
      doc.text(String(value), x, summaryY + 22, { align: 'center' });
    });

    // Teacher's Overall Remark box
    const remarkY = summaryY + summaryH + 6;
    doc.setFillColor(254, 243, 199);
    doc.setDrawColor(245, 158, 11);
    doc.setLineWidth(0.5);
    doc.roundedRect(12, remarkY, pageW - 24, 14, 2, 2, 'FD');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(146, 64, 14);
    doc.text("Teacher's Remark:", 16, remarkY + 9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120, 53, 15);
    const remarkText = student.overall_remark || 'No remarks';
    doc.text(remarkText, 52, remarkY + 9, { maxWidth: pageW - 68 });

    // Grade scale
    const gradeY = remarkY + 20;
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text('GRADE SCALE:', 14, gradeY);
    const gradeScale = [
      ['A+', '90-100'], ['A', '80-89'], ['B+', '70-79'],
      ['B', '60-69'], ['C', '50-59'], ['D', '35-49'], ['F', '<35']
    ];
    gradeScale.forEach(([g, r], i) => {
      doc.setFont('helvetica', 'normal');
      doc.text(`${g}:${r}%`, 36 + i * 24, gradeY);
    });

    // NOTE below grade scale
    const noteY = gradeY + 7;
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(220, 38, 38);
    doc.text('NOTE:', 14, noteY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 60, 60);
    doc.text('Absence in any subject is treated as FAIL for that subject and will affect the overall result.', 28, noteY);

    // Signature lines — fixed at bottom
    const sigY = pageH - 36;
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    const sigPositions = [
      { x: 18, label: 'Class Teacher' },
      { x: pageW / 2 - 22, label: 'Principal' },
      { x: pageW - 65, label: 'Parent / Guardian' }
    ];
    sigPositions.forEach(({ x, label }) => {
      doc.line(x, sigY, x + 48, sigY);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text(label, x + 24, sigY + 6, { align: 'center' });
    });

    // Footer
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(
      'This is a computer generated marksheet. — SchoolMS',
      pageW / 2, pageH - 14, { align: 'center' }
    );

    await saveDocument(doc, `attendance-${periodLabel}-${classLabel}.pdf`);
    toast.success(`Marksheet for ${student.name} downloaded!`);
  };

  // ── EXPORT ALL EXCEL ──────────────────────────────────────────
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
      r.total, r.maxTotal, `${r.percentage}%`,
      r.grade, r.passed ? 'PASS' : 'FAIL',
      r.overall_remark || '—'
    ]);
    return [title, [], headers, ...dataRows, [], []]; // blank rows between sections
  };

  try {
    if (!isTeacher && !filters.class_id && filters.exam_type_id) {
      // ── ALL CLASSES + SPECIFIC EXAM → one sheet per class, only that exam
      for (const cls of classes) {
        try {
          const { data } = await API.get('/marks/marksheet', {
            params: { class_id: cls.id, exam_type_id: filters.exam_type_id, academic_year: filters.academic_year }
          });
          if (!data.length) continue;
          const { rows: clsRows, subjects: clsSubjects } = buildData(data);
          const ws = XLSX.utils.aoa_to_sheet(buildSheetData(clsRows, clsSubjects, cls.name, examType));
          ws['!cols'] = [
            { wch: 5 }, { wch: 10 }, { wch: 22 },
            ...clsSubjects.map(() => ({ wch: 16 })),
            { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 8 }, { wch: 8 }, { wch: 30 }
          ];
          XLSX.utils.book_append_sheet(wb, ws, cls.name.slice(0, 31));
        } catch { continue; }
      }
      if (!wb.SheetNames.length) { toast.error('No data found'); return; }
      await saveWorkbook(wb, `attendance-${periodLabel}-${classLabel}.xlsx`);
      toast.success(`Downloaded! ${wb.SheetNames.length} class(es) for ${examType}`);

    } else if (!isTeacher && !filters.class_id && !filters.exam_type_id) {
      // ── ALL CLASSES + NO EXAM → one sheet per class, all exams stacked
      for (const cls of classes) {
        const allSectionRows = [];
        for (const et of examTypes) {
          try {
            const { data } = await API.get('/marks/marksheet', {
              params: { class_id: cls.id, exam_type_id: et.id, academic_year: filters.academic_year }
            });
            if (!data.length) continue;
            const { rows: etRows, subjects: etSubjects } = buildData(data);
            allSectionRows.push(...buildSheetData(etRows, etSubjects, cls.name, et.name));
          } catch { continue; }
        }
        if (!allSectionRows.length) continue;
        const ws = XLSX.utils.aoa_to_sheet(allSectionRows);
        ws['!cols'] = [{ wch: 5 }, { wch: 10 }, { wch: 22 }, ...Array(10).fill({ wch: 16 }), { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 8 }, { wch: 8 }, { wch: 30 }];
        XLSX.utils.book_append_sheet(wb, ws, cls.name.slice(0, 31));
      }
      if (!wb.SheetNames.length) { toast.error('No data found'); return; }
      await saveWorkbook(wb, `attendance-${periodLabel}-${classLabel}.xlsx`);
      toast.success(`Downloaded! ${wb.SheetNames.length} class sheets`);

    } else if (filters.class_id && !filters.exam_type_id) {
      // ── CLASS SELECTED, NO EXAM TYPE → one sheet, all exams stacked vertically
      const allSectionRows = [];

      for (const et of examTypes) {
        try {
          const { data } = await API.get('/marks/marksheet', {
            params: { class_id: filters.class_id, exam_type_id: et.id, academic_year: filters.academic_year }
          });
          if (!data.length) continue;
          const { rows: etRows, subjects: etSubjects } = buildData(data);
          const section = buildSheetData(etRows, etSubjects, className, et.name);
          allSectionRows.push(...section);
        } catch { continue; }
      }

      if (!allSectionRows.length) { toast.error('No data found'); return; }

      const ws = XLSX.utils.aoa_to_sheet(allSectionRows);
      ws['!cols'] = [
        { wch: 5 }, { wch: 10 }, { wch: 22 },
        ...Array(10).fill({ wch: 16 }),
        { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 8 }, { wch: 8 }, { wch: 30 }
      ];
      XLSX.utils.book_append_sheet(wb, ws, className.slice(0, 31));
      await saveWorkbook(wb, `attendance-${periodLabel}-${classLabel}.xlsx`);
      toast.success('Downloaded! All exams in one sheet');

    } else {
      // ── CLASS + EXAM TYPE SELECTED → single sheet, single exam
      const headers = [
        '#', 'Roll No', 'Student Name',
        ...subjects.map(s => `${s.name} (Max:${s.max_marks})`),
        'Total', 'Max Marks', 'Percentage', 'Grade', 'Result', 'Remark'
      ];
      const title = [`${className} — ${examType} — ${filters.academic_year}`];
      const dataRows = rows.map((r, i) => [
        i + 1, r.roll_no, r.name,
        ...subjects.map(s => r.marks[s.id]?.obtained ?? '—'),
        r.total, r.maxTotal, `${r.percentage}%`,
        r.grade, r.passed ? 'PASS' : 'FAIL',
        r.overall_remark || '—'
      ]);

      const ws = XLSX.utils.aoa_to_sheet([title, [], headers, ...dataRows]);
      ws['!cols'] = [
        { wch: 5 }, { wch: 10 }, { wch: 22 },
        ...subjects.map(() => ({ wch: 16 })),
        { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 8 }, { wch: 8 }, { wch: 30 }
      ];
      XLSX.utils.book_append_sheet(wb, ws, examType.slice(0, 31));
      await saveWorkbook(wb, `attendance-${periodLabel}-${classLabel}.xlsx`);
      toast.success('Excel downloaded!');
    }

  } catch (err) {
    console.error('Export error:', err);
    toast.error('Export failed');
  }
};

  // ── EXPORT ALL PDF ────────────────────────────────────────────
    const exportPDF = async () => {
    const doc = new jsPDF({ orientation: 'landscape', format: 'a3' });
    doc.setFillColor(30, 64, 175);
    doc.rect(0, 0, doc.internal.pageSize.width, 36, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18); doc.setFont('helvetica', 'bold');
    doc.text('SchoolMS — Marksheet Report', 14, 16);
    doc.setFontSize(10); doc.setFont('helvetica', 'normal');
    doc.text(`${examType} | ${className} | ${filters.academic_year} | Generated: ${new Date().toLocaleDateString('en-IN')}`, 14, 28);

    const headers = ['#', 'Roll No', 'Student Name',
      ...subjects.map(s => `${s.name}/${s.max_marks}`),
      'Total', '%', 'Grade', 'Result', 'Remark'
    ];
    const body = rows.map((r, i) => [
      i + 1, r.roll_no, r.name,
      ...subjects.map(s => {
        const m = r.marks[s.id];
        if (!m) return '—';
        if (m.is_absent) return 'AB';
        return m.obtained ?? '—';
      }),
      `${r.total}/${r.maxTotal}`,
      `${r.percentage}%`,
      r.grade,
      r.passed ? 'PASS' : 'FAIL',
      r.overall_remark || '—'
    ]);

    autoTable(doc, {
      head: [headers], body,
      startY: 42,
      styles: { fontSize: 7, cellPadding: 2, halign: 'center' },
      headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold' },
      columnStyles: {
        2: { halign: 'left', cellWidth: 28 },
        [headers.length - 1]: { halign: 'left', cellWidth: 35 }
      },
      alternateRowStyles: { fillColor: [241, 245, 249] },
     didParseCell: (data) => {
        if (data.section === 'body') {
          const val = data.cell.text[0];
          if (val === 'PASS') data.cell.styles.textColor = [22, 163, 74];
          if (val === 'FAIL') data.cell.styles.textColor = [220, 38, 38];
          if (val === 'AB') {
            data.cell.styles.textColor = [217, 119, 6];
            data.cell.styles.fontStyle = 'bold';
          }
          if (data.column.index === headers.length - 1) {
            data.cell.styles.halign = 'left';
            data.cell.styles.textColor = [100, 116, 139];
          }
        }
      },
      margin: { left: 14, right: 14 }
    });
    await saveDocument(doc, `attendance-${periodLabel}-${classLabel}.pdf`);
    toast.success('PDF downloaded!');
    setShowExport(false);
  };


  return (
    <AppLayout title="Marksheet Report" subtitle="View and export student marksheets">
      <div className="page-header">
        <div>
          <h1>Marksheet Report</h1>
          <p>{rows.length} students • {examType || 'Select exam type'} • {filters.academic_year}</p>
        </div>
       {(rows.length > 0 || (!isTeacher && !filters.class_id && filters.exam_type_id) || (!isTeacher && filters.class_id)) && (
  <div className="dropdown-export">
    <button className="btn btn-primary" onClick={() => setShowExport(!showExport)}>
      📤 Export ▾
    </button>
    {showExport && (
      <div className="dropdown-menu">
        <button className="dropdown-item" onClick={exportExcel}>
          📊 {!isTeacher && !filters.class_id
            ? 'Excel — All Classes'
            : !filters.exam_type_id
              ? 'Excel — All Exams'
              : 'Excel (.xlsx)'}
        </button>
        {/* ✅ PDF only when specific class + exam selected */}
        {(filters.class_id || isTeacher) && filters.exam_type_id && rows.length > 0 && (
          <button className="dropdown-item" onClick={exportPDF}>📄 PDF</button>
        )}
      </div>
    )}
  </div>
)}
      </div>

      {/* Filters */}
      <div style={{background:'#fff', padding:'16px 20px', borderRadius:'12px', marginBottom:'20px', border:'1px solid #e2e8f0'}}>
        <div style={{display:'flex', gap:'10px', flexWrap:'wrap', alignItems:'center'}}>
          {!isTeacher && (
            <select className="form-control" value={filters.class_id}
              onChange={e => setFilters({...filters, class_id: e.target.value})}>
              <option value="">All Classes</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <select className="form-control" value={filters.exam_type_id}
            onChange={e => setFilters({...filters, exam_type_id: e.target.value})}>
            <option value="">Select Exam Type *</option>
            <option value="all">📋 All Exams</option>
            {examTypes.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <select className="form-control" value={filters.academic_year}
            onChange={e => setFilters({...filters, academic_year: e.target.value})}>
            {academicYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button className="btn btn-outline btn-sm" onClick={fetchMarksheet}>🔄 Refresh</button>
        </div>

        {/* Search */}
        {rows.length > 0 || search ? (
          <div style={{marginTop:'12px'}}>
            <input
              className="form-control"
              placeholder="🔍 Search by student name or roll no..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{maxWidth:'360px'}}
            />
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className="loading"><div className="spinner"></div><p>Loading marksheet...</p></div>
      ) : rows.length > 0 ? (
        <>
          {/* Summary Stats */}
          <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(130px,1fr))', gap:'12px', marginBottom:'16px'}}>
            {[
              { label:'Total', value: allRows.length, color:'#1e40af', icon:'👥' },
              { label:'Passed', value: allRows.filter(r => r.passed).length, color:'#10b981', icon:'✅' },
              { label:'Failed', value: allRows.filter(r => !r.passed).length, color:'#ef4444', icon:'❌' },
              { label:'Average', value: `${(allRows.reduce((a,r) => a+parseFloat(r.percentage),0)/allRows.length).toFixed(1)}%`, color:'#f59e0b', icon:'📊' },
              { label:'Highest', value: `${Math.max(...allRows.map(r=>parseFloat(r.percentage))).toFixed(1)}%`, color:'#8b5cf6', icon:'🏆' },
            ].map(s => (
              <div key={s.label} style={{background:'#fff', borderRadius:'12px', padding:'12px 14px', border:'1px solid #e2e8f0', borderLeft:`4px solid ${s.color}`}}>
                <div style={{fontSize:'11px', color:'#64748b', fontWeight:'700'}}>{s.icon} {s.label}</div>
                <div style={{fontSize:'22px', fontWeight:'800', color:'#1e293b', marginTop:'4px'}}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Table */}
          <div style={{background:'#fff', borderRadius:'14px', border:'1px solid #e2e8f0', overflow:'hidden', marginBottom:'16px'}}>
            <div style={{padding:'12px 20px', borderBottom:'1px solid #e2e8f0', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
              <h3 style={{margin:0, fontSize:'14px', fontWeight:'700', color:'#1e293b'}}>
                📋 {examType} — {className} — {filters.academic_year}
              </h3>
              <span style={{fontSize:'12px', color:'#64748b'}}>
                {search ? `${rows.length} of ${allRows.length}` : `${rows.length}`} students
              </span>
            </div>
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%', borderCollapse:'collapse', minWidth:'700px'}}>
                <thead>
                  <tr style={{background:'#1e40af'}}>
                    <th style={{padding:'11px 10px', color:'#fff', fontSize:'11px', fontWeight:'700', textAlign:'center', width:'36px'}}>#</th>
                    <th style={{padding:'11px 10px', color:'#fff', fontSize:'11px', fontWeight:'700', textAlign:'left', width:'80px'}}>ROLL NO</th>
                    <th style={{padding:'11px 10px', color:'#fff', fontSize:'11px', fontWeight:'700', textAlign:'left', minWidth:'150px'}}>STUDENT NAME</th>
                    {!isTeacher && <th style={{padding:'11px 8px', color:'#fff', fontSize:'11px', fontWeight:'700', textAlign:'left', minWidth:'80px'}}>CLASS</th>}
                    {subjects.map(s => (
                      <th key={s.id} style={{padding:'8px 6px', color:'#fff', fontSize:'10px', fontWeight:'700', textAlign:'center', minWidth:'75px'}}>
                        {s.name}<br/><span style={{opacity:0.7, fontSize:'9px'}}>/{s.max_marks} (P:{s.pass_marks})</span>
                      </th>
                    ))}
                    <th style={{padding:'11px 8px', color:'#fff', fontSize:'10px', fontWeight:'700', textAlign:'center', minWidth:'65px'}}>TOTAL</th>
                    <th style={{padding:'11px 8px', color:'#fff', fontSize:'10px', fontWeight:'700', textAlign:'center', minWidth:'50px'}}>%</th>
                    <th style={{padding:'11px 8px', color:'#fff', fontSize:'10px', fontWeight:'700', textAlign:'center', minWidth:'48px'}}>GRADE</th>
                    <th style={{padding:'11px 8px', color:'#fff', fontSize:'10px', fontWeight:'700', textAlign:'center', minWidth:'58px'}}>RESULT</th>
                    <th style={{padding:'11px 10px', color:'#fff', fontSize:'10px', fontWeight:'700', textAlign:'left', minWidth:'120px'}}>REMARK</th>
                    <th style={{padding:'11px 8px', color:'#fff', fontSize:'10px', fontWeight:'700', textAlign:'center', minWidth:'80px'}}>MARKSHEET</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={row.id} style={{borderBottom:'1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#f8fafc'}}>
                      <td style={{padding:'10px', fontSize:'12px', color:'#64748b', textAlign:'center'}}>{i + 1}</td>
                      <td style={{padding:'10px'}}>
                        <code style={{background:'#f1f5f9', padding:'2px 6px', borderRadius:'4px', fontSize:'11px'}}>{row.roll_no}</code>
                      </td>
                      <td style={{padding:'10px', fontWeight:'700', color:'#1e293b'}}>{row.name}</td>
                      {!isTeacher && <td style={{padding:'10px', fontSize:'12px', color:'#64748b'}}>{row.class_name}</td>}
                      {subjects.map(s => {
                        const m = row.marks[s.id];
                        const obtained = m?.obtained;
                        const isAbsent = m?.is_absent;
                        const failed = !isAbsent && obtained !== undefined && parseFloat(obtained) < s.pass_marks;
                        return (
                          <td key={s.id} style={{padding:'8px 6px', textAlign:'center'}}>
                            {isAbsent ? (
                              <span style={{
                                background:'#fef3c7', color:'#d97706',
                                padding:'3px 8px', borderRadius:'8px',
                                fontSize:'12px', fontWeight:'800',
                                border:'1px solid #fcd34d'
                              }}>AB</span>
                            ) : obtained !== undefined ? (
                              <span style={{
                                background: failed ? '#fee2e2' : '#f0fdf4',
                                color: failed ? '#dc2626' : '#16a34a',
                                padding:'3px 8px', borderRadius:'8px',
                                fontSize:'12px', fontWeight:'700'
                              }}>{obtained}</span>
                            ) : (
                              <span style={{color:'#94a3b8'}}>—</span>
                            )}
                          </td>
                        );
                      })}
                      <td style={{padding:'10px', textAlign:'center', fontWeight:'800', color:'#1e40af'}}>{row.total}/{row.maxTotal}</td>
                      <td style={{padding:'10px', textAlign:'center'}}>
                        <span style={{
                          background: parseFloat(row.percentage) >= 35 ? '#dcfce7' : '#fee2e2',
                          color: parseFloat(row.percentage) >= 35 ? '#16a34a' : '#dc2626',
                          padding:'2px 8px', borderRadius:'10px', fontSize:'12px', fontWeight:'700'
                        }}>{row.percentage}%</span>
                      </td>
                      <td style={{padding:'10px', textAlign:'center'}}>
                        <span style={{background:'#dbeafe', color:'#1e40af', padding:'2px 8px', borderRadius:'10px', fontSize:'12px', fontWeight:'800'}}>{row.grade}</span>
                      </td>
                      <td style={{padding:'10px', textAlign:'center'}}>
                        <span className={`badge ${row.passed ? 'badge-success' : 'badge-danger'}`}>
                          {row.passed ? 'PASS' : 'FAIL'}
                        </span>
                      </td>
                      <td style={{padding:'10px', fontSize:'12px', color:'#64748b', fontStyle: row.overall_remark ? 'normal' : 'italic'}}>
                        {row.overall_remark || '—'}
                      </td>
                      <td style={{padding:'8px', textAlign:'center'}}>
                        <button
                          onClick={() => exportSingleStudentPDF(row)}
                          style={{background:'#1e40af', color:'#fff', border:'none', borderRadius:'6px', padding:'5px 10px', cursor:'pointer', fontSize:'11px', fontWeight:'700', fontFamily:'inherit'}}>
                          📄 Marksheet
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Grade Legend */}
          <div style={{background:'#fff', borderRadius:'10px', border:'1px solid #e2e8f0', overflow:'hidden'}}>
            <div style={{display:'flex', gap:'8px', padding:'12px 16px', flexWrap:'wrap', alignItems:'center'}}>
              <span style={{fontSize:'12px', fontWeight:'700', color:'#64748b'}}>Grade Scale:</span>
              {[
                {g:'A+', r:'90-100%'}, {g:'A', r:'80-89%'}, {g:'B+', r:'70-79%'},
                {g:'B', r:'60-69%'}, {g:'C', r:'50-59%'}, {g:'D', r:'35-49%'}, {g:'F', r:'<35%'}
              ].map(({g, r}) => (
                <span key={g} style={{background:'#f8fafc', border:'1px solid #e2e8f0', padding:'2px 10px', borderRadius:'8px', fontSize:'11px', fontWeight:'700', color:'#1e40af'}}>
                  {g}: {r}
                </span>
              ))}
            </div>
            <div style={{padding:'8px 16px', borderTop:'1px solid #fee2e2', background:'#fff5f5', display:'flex', alignItems:'center', gap:'6px'}}>
              <span style={{fontSize:'11px', fontWeight:'800', color:'#dc2626'}}>📌 NOTE:</span>
              <span style={{fontSize:'11px', color:'#7f1d1d'}}>
                Absence in any subject is treated as <strong>FAIL</strong> for that subject and will affect the overall result.
              </span>
            </div>
          </div>
        </>
      ) : (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon">📋</div>
            <p style={{fontWeight:'700', color:'#1e293b'}}>
              {isTeacher
                ? 'Select Exam Type to view your class marksheet'
                : 'Select Class and Exam Type to view marksheet'
              }
            </p>
            <p style={{fontSize:'13px', color:'#94a3b8', marginTop:'6px'}}>
              {isTeacher
                ? 'Your class is automatically loaded'
                : 'Both fields are required'
              }
            </p>
          </div>
        </div>
      )}
    </AppLayout>
  );
};

export default MarksheetReport;
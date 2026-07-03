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
    
    // ✅ ADD-ON FIX: Build subject tracking maps filtered strictly by matching the student's own class context
    const subjectMap = {};
    dataSource.forEach(m => {
      if (!filters.class_id || m.class_id == filters.class_id) {
        subjectMap[m.subject_id] = {
          id: m.subject_id, name: m.subject_name,
          code: m.code, pass_marks: m.pass_marks, max_marks: m.max_marks
        };
      }
    });
    const subjects = Object.values(subjectMap);
    const studentMap = {};

    const activeSelectedExamObj = examTypes.find(e => e.id == filters.exam_type_id);
    const activeExamStringName = activeSelectedExamObj ? String(activeSelectedExamObj.name).toLowerCase() : '';
    const isFinalCumulative = activeExamStringName.includes('final') || activeExamStringName.includes('annual');

    dataSource.forEach(m => {
      if (!studentMap[m.student_id]) {
        studentMap[m.student_id] = {
          id: m.student_id, name: m.student_name,
          roll_no: m.roll_no, class_name: m.class_name,
          exam_type: m.exam_type_name, marks: {}
        };
      }

      // Filter data parsing checks strictly against current class parameters
      if (!filters.class_id || m.class_id == filters.class_id) {
        if (isFinalCumulative) {
          if (!studentMap[m.student_id].marks[m.subject_id]) {
            studentMap[m.student_id].marks[m.subject_id] = { obtained: 0, max: 0, pass: 0, is_absent: false, count: 0 };
          }
          const currentScore = studentMap[m.student_id].marks[m.subject_id];
          if (m.marks_obtained !== null && m.marks_obtained !== undefined) {
            currentScore.obtained += parseFloat(m.marks_obtained);
            currentScore.max += parseInt(m.max_marks || 100);
            currentScore.pass = parseInt(m.pass_marks || 35);
            currentScore.count += 1;
          }
          if (m.is_absent === 1 || m.is_absent === true) currentScore.is_absent = true;
        } else {
          studentMap[m.student_id].marks[m.subject_id] = {
            obtained: m.marks_obtained,
            max: m.max_marks,
            pass: m.pass_marks,
            is_absent: m.is_absent === 1 || m.is_absent === true,
          };
        }
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
            maxTotal += isFinalCumulative ? (m.max || sub.max_marks) : parseInt(m.max || sub.max_marks);
            passed = false;
          } else {
            total += parseFloat(m.obtained || 0);
            maxTotal += isFinalCumulative ? (m.max || sub.max_marks) : parseInt(m.max || sub.max_marks);
            
            // Validation criteria verification metrics mapped accurately
            const individualObtained = parseFloat(m.obtained || 0);
            const individualPassTarget = isFinalCumulative ? (m.pass || sub.pass_marks) * (m.count || 1) : (m.pass || sub.pass_marks);
            if (individualObtained < individualPassTarget) passed = false;
          }
        } else {
          maxTotal += sub.max_marks;
          passed = false;
        }
      });

      // Avoid unexpected multiplication by locking evaluation out of zero values
      if (maxTotal === 0) maxTotal = subjects.reduce((acc, sub) => acc + sub.max_marks, 0);

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
        ? (parseFloat(m.obtained) >= (m.pass || s.pass_marks) ? 'PASS' : 'FAIL')
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

    const noteY = gradeY + 7;
    doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(220, 38, 38);
    doc.text('NOTE:', 14, noteY);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(60, 60, 60);
    doc.text('Absence in any subject is treated as FAIL for that subject and will affect the overall result.', 28, noteY);

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

      } else if (!isTeacher && !filters.class_id && !filters.exam_type_id) {
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
        await saveWorkbook(wb, `marksheet-AllClasses-${filters.academic_year || 'AllYears'}.xlsx`);
        toast.success(`Downloaded! ${wb.SheetNames.length} class sheets`);

      } else if (filters.class_id && !filters.exam_type_id) {
        const allSectionRows = [];
        for (const et of examTypes) {
          try {
            const { data } = await API.get('/marks/marksheet', {
              params: { class_id: filters.class_id, font_type_id: et.id, academic_year: filters.academic_year }
            });
            if (!data.length) continue;
            const { rows: etRows, subjects: etSubjects } = buildData(data);
            allSectionRows.push(...buildSheetData(etRows, etSubjects, className, et.name));
          } catch { continue; }
        }
        if (!allSectionRows.length) { toast.error('No data found'); return; }
        const ws = XLSX.utils.aoa_to_sheet(allSectionRows);
        ws['!cols'] = [{ wch: 5 }, { wch: 10 }, { wch: 22 }, ...Array(10).fill({ wch: 16 }), { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 8 }, { wch: 8 }, { wch: 30 }];
        XLSX.utils.book_append_sheet(wb, ws, className.slice(0, 31));
        await saveWorkbook(wb, `marksheet-${className.replace(/\s+/g, '_')}-AllExams.xlsx`);
        toast.success('Downloaded! All exams in one sheet');

      } else {
        const headers = ['#', 'Roll No', 'Student Name', ...subjects.map(s => `${s.name} (Max:${s.max_marks})`), 'Total', 'Max Marks', 'Percentage', 'Grade', 'Result', 'Remark'];
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
    } catch (err) {
      console.error('Export error:', err);
      toast.error('Export failed');
    }
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
          if (val === 'FAIL') data.cell.styles.textColor = [220, 38, 38];
          if (val === 'AB') { data.cell.styles.textColor = [217, 119, 6]; data.cell.styles.fontStyle = 'bold'; }
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
          .mobile-report-view { 
            display: block !important; 
            width: 100% !important;
            max-width: 100% !important;
            overflow-x: hidden !important;
            padding: 4px;
          }

          .mobile-student-card {
            background: #fff;
            border-radius: 12px;
            border: 1px solid #cbd5e1;
            margin-bottom: 12px;
            overflow: hidden;
            box-shadow: 0 2px 4px rgba(0,0,0,0.02);
            width: 100% !important;
            box-sizing: border-box;
          }
          .mobile-card-header {
            padding: 14px 16px;
            background: #1e293b;
            color: #fff;
            cursor: pointer;
          }
          .mobile-header-top {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 4px;
          }
          .mobile-header-title { font-size: 15px; font-weight: 700; margin: 0; }
          .mobile-header-badge { font-size: 12px; font-weight: 800; padding: 2px 8px; border-radius: 6px; }
          
          .mobile-header-stats {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            font-size: 11px;
            opacity: 0.9;
            padding-top: 4px;
            border-top: 1px solid rgba(255,255,255,0.1);
          }

          .mobile-collapsible-content {
            padding: 16px;
            background: #f8fafc;
            border-top: 1px solid #e2e8f0;
          }
          .mobile-section-title {
            font-size: 12px;
            font-weight: 800;
            color: #475569;
            margin: 0 0 10px 0;
            text-transform: uppercase;
          }
          .mobile-subject-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 6px 0;
            border-bottom: 1px solid #e2e8f0;
            font-size: 13px;
          }
          .mobile-subj-name { font-weight: 600; color: #334155; }
          .mobile-subj-score { font-weight: 700; }
        }
      `}</style>

      <div style={{ width: '100%', overflowX: 'hidden' }}>
        <div className="page-header">
          <div>
            <h1>Marksheet Report</h1>
            <p>{rows.length} students • {examType || 'Select exam type'} • {filters.academic_year}</p>
          </div>
          {(rows.length > 0 || (!isTeacher && !filters.class_id && filters.exam_type_id) || (!isTeacher && filters.class_id)) && (
            <div className="dropdown-export">
              <button className="btn btn-primary" onClick={() => setShowExport(!showExport)}>📤 Export ▾</button>
              {showExport && (
                <div className="dropdown-menu">
                  <button className="dropdown-item" onClick={exportExcel}>
                    📊 {!isTeacher && !filters.class_id ? 'Excel — All Classes' : !filters.exam_type_id ? 'Excel — All Exams' : 'Excel (.xlsx)'}
                  </button>
                  {(filters.class_id || isTeacher) && filters.exam_type_id && rows.length > 0 && (
                    <button className="dropdown-item" onClick={exportPDF}>📄 PDF</button>
                  )}
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
            <button className="btn btn-outline btn-sm" onClick={fetchMarksheet}>🔄 Refresh</button>
          </div>

          {rows.length > 0 || search ? (
            <div style={{marginTop:'12px'}}>
              <input
                className="form-control"
                placeholder="🔍 Search by student name or roll no..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{maxWidth:'360px', padding:'8px 12px', borderRadius:'8px', border:'1px solid #cbd5e1'}}
              />
            </div>
          ) : null}
        </div>

        {loading ? (
          <div className="loading"><div className="spinner"></div><p>Loading marksheets...</p></div>
        ) : rows.length > 0 ? (
          <>
            <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(130px,1fr))', gap:'12px', marginBottom:'16px'}}>
              {[
                { label:'Total', value: allRows.length, color:'#1e40af', icon:'👥' },
                { label:'Passed', value: allRows.filter(r => r.passed).length, color:'#10b981', icon:'✅' },
                { label:'Failed', value: allRows.filter(r => !r.passed).length, color:'#ef4444', icon:'❌' },
                { label:'Average', value: allRows.length ? `${(allRows.reduce((a,r) => a+parseFloat(r.percentage),0)/allRows.length).toFixed(1)}%` : '0%', color:'#f59e0b', icon:'📊' },
              ].map(s => (
                <div key={s.label} style={{background:'#fff', borderRadius:'12px', padding:'12px 14px', border:'1px solid #e2e8f0', borderLeft:`4px solid ${s.color}`}}>
                  <div style={{fontSize:'11px', color:'#64748b', fontWeight:'700'}}>{s.icon} {s.label}</div>
                  <div style={{fontSize:'22px', fontWeight:'800', color:'#1e293b', marginTop:'4px'}}>{s.value}</div>
                </div>
              ))}
            </div>

            <div className="mobile-report-view">
              {rows.map((row) => {
                const isOpen = expandedStudentId === row.id;
                return (
                  <div key={row.id} className="mobile-student-card">
                    <div className="mobile-card-header" onClick={() => toggleStudentCard(row.id)}>
                      <div className="mobile-header-top">
                        <h3 className="mobile-header-title">
                          {row.name} {row.roll_no ? `[${row.roll_no}]` : ''}
                        </h3>
                        <span className="mobile-header-badge" style={{
                          background: row.passed ? '#dcfce7' : '#fee2e2',
                          color: row.passed ? '#16a34a' : '#dc2626'
                        }}>
                          Result: {row.passed ? 'PASS' : 'FAIL'}
                        </span>
                      </div>
                      <div className="mobile-header-stats">
                        <div>Total: <strong>{row.total}/{row.maxTotal}</strong></div>
                        <div>%: <strong>{row.passed ? `${row.percentage}%` : '—'}</strong></div>
                        <div>Grade: <strong>{row.passed ? row.grade : '—'}</strong></div>
                      </div>
                    </div>

                    {isOpen && (
                      <div className="mobile-collapsible-content">
                        <h4 className="mobile-section-title">▼ Subject Marks Breakdown</h4>
                        <div style={{marginBottom:'14px'}}>
                          {subjects.map(s => {
                            const m = row.marks[s.id];
                            const isAbsent = m?.is_absent;
                            const obtained = m?.obtained;
                            const failed = !isAbsent && obtained !== undefined && parseFloat(obtained) < (m.pass || s.pass_marks);

                            return (
                              <div key={s.id} className="mobile-subject-row">
                                <span className="mobile-subj-name">• {s.name}:</span>
                                <span className="mobile-subj-score" style={{
                                  color: isAbsent ? '#d97706' : failed ? '#dc2626' : '#16a34a'
                                }}>
                                  {isAbsent ? 'AB (Absent)' : obtained !== undefined ? `${obtained} / ${m.max || s.max_marks}` : '—'}
                                </span>
                              </div>
                            );
                          })}
                        </div>

                        <div style={{fontSize:'13px', color:'#475569', marginBottom:'14px'}}>
                          <strong>Remark:</strong> <span style={{fontStyle: row.overall_remark ? 'normal' : 'italic'}}>{row.overall_remark || 'No remark added'}</span>
                        </div>

                        <button
                          onClick={() => exportSingleStudentPDF(row)}
                          style={{
                            width:'100%', background:'#1e40af', color:'#fff', border:'none',
                            padding:'10px', borderRadius:'8px', fontWeight:'700', fontSize:'13px',
                            display:'flex', alignItems:'center', justifyContent:'center', gap:'6px'
                          }}
                        >
                          📄 View Full Marksheet
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="desktop-report-view">
              <div style={{background:'#fff', borderRadius:'14px', border:'1px solid #e2e8f0', overflow:'hidden', marginBottom:'16px'}}>
                <div className="table-wrapper" style={{overflowX:'auto', maxHeight:'400px', overflowY:'auto'}}>
                  <table style={{width:'100%', borderCollapse:'collapse', minWidth:'700px'}}>
                    <thead>
                      <tr style={{background:'#1e40af'}}>
                        <th style={{padding:'11px 10px', color:'#fff', fontSize:'11px', fontWeight:'700', textAlign:'center', width:'36px'}}>#</th>
                        <th style={{padding:'11px 10px', color:'#fff', fontSize:'11px', fontWeight:'700', textAlign:'left', width:'80px'}}>ROLL NO</th>
                        <th style={{padding:'11px 10px', color:'#fff', fontSize:'11px', fontWeight:'700', textAlign:'left', minWidth:'150px'}}>STUDENT NAME</th>
                        {!isTeacher && <th style={{padding:'11px 8px', color:'#fff', fontSize:'11px', fontWeight:'700', textAlign:'left', minWidth:'80px'}}>CLASS</th>}
                        {subjects.map(s => (
                          <th key={s.id} style={{padding:'8px 6px', color:'#fff', fontSize:'10px', fontWeight:'700', textAlign:'center', minWidth:'75px'}}>
                            {s.name}
                          </th>
                        ))}
                        <th style={{padding:'11px 8px', color:'#fff', fontSize:'10px', fontWeight:'700', textAlign:'center', minWidth:'65px'}}>TOTAL</th>
                        <th style={{padding:'11px 8px', color:'#fff', fontSize:'10px', fontWeight:'700', textAlign:'center', minWidth:'50px'}}>%</th>
                        <th style={{padding:'11px 8px', color:'#fff', fontSize:'10px', fontWeight:'700', textAlign:'center', minWidth:'48px'}}>GRADE</th>
                        <th style={{padding:'11px 8px', color:'#fff', fontSize:'10px', fontWeight:'700', textAlign:'center', minWidth:'58px'}}>RESULT</th>
                        <th style={{padding:'11px 10px', color:'#fff', fontSize:'11px', fontWeight:'700', textAlign:'left', minWidth:'120px'}}>REMARK</th>
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
                            const failed = !isAbsent && obtained !== undefined && parseFloat(obtained) < (m.pass || s.pass_marks);
                            return (
                              <td key={s.id} style={{padding:'8px 6px', textAlign:'center'}}>
                                {isAbsent ? (
                                  <span style={{background:'#fef3c7', color:'#d97706', padding:'3px 8px', borderRadius:'8px', fontSize:'12px', fontWeight:'800', border:'1px solid #fcd34d'}}>AB</span>
                                ) : obtained !== undefined ? (
                                  <span style={{background: failed ? '#fee2e2' : '#f0fdf4', color: failed ? '#dc2626' : '#16a34a', padding:'3px 8px', borderRadius:'8px', fontSize:'12px', fontWeight:'700'}}>{obtained}</span>
                                ) : (
                                  <span style={{color:'#94a3b8'}}>—</span>
                                )}
                              </td>
                            );
                          })}
                          <td style={{padding:'10px', textAlign:'center', fontWeight:'800', color:'#1e40af'}}>{row.total}/{row.maxTotal}</td>
                          <td style={{padding:'10px', textAlign:'center'}}>
                            {row.passed ? (
                              <span style={{background:'#dcfce7', color:'#16a34a', padding:'2px 8px', borderRadius:'10px', fontSize:'12px', fontWeight:'700'}}>{row.percentage}%</span>
                            ) : (
                              <span style={{background:'#fee2e2', color:'#dc2626', padding:'2px 8px', borderRadius:'10px', fontSize:'12px', fontWeight:'700'}}>—</span>
                            )}
                          </td>
                          <td style={{padding:'10px', textAlign:'center'}}>
                            {row.passed ? (
                              <span style={{background:'#dbeafe', color:'#1e40af', padding:'2px 8px', borderRadius:'10px', fontSize:'12px', fontWeight:'800'}}>{row.grade}</span>
                            ) : (
                              <span style={{background:'#f1f5f9', color:'#94a3b8', padding:'2px 8px', borderRadius:'10px', fontSize:'12px', fontWeight:'700'}}>—</span>
                            )}
                          </td>
                          <td style={{padding:'10px', textAlign:'center'}}>
                            <span className={`badge ${row.passed ? 'badge-success' : 'badge-danger'}`}>{row.passed ? 'PASS' : 'FAIL'}</span>
                          </td>
                          <td style={{padding:'10px', fontSize:'12px', color:'#64748b', fontStyle: row.overall_remark ? 'normal' : 'italic'}}>{row.overall_remark || '—'}</td>
                          <td style={{padding:'8px', textAlign:'center'}}>
                            <button onClick={() => exportSingleStudentPDF(row)} style={{background:'#1e40af', color:'#fff', border:'none', borderRadius:'6px', padding:'5px 10px', cursor:'pointer', fontSize:'11px', fontWeight:'700', fontFamily:'inherit'}}>📄 Marksheet</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="card">
            <div className="empty-state">
              <div className="empty-icon">📋</div>
              <p style={{fontWeight:'700', color:'#1e293b'}}>{isTeacher ? 'Select Exam Type to view your class marksheet' : 'Select Class and Exam Type to view marksheet'}</p>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default MarksheetReport;
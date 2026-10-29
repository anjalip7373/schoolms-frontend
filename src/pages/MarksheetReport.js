import React, { useState, useEffect } from 'react';
import AppLayout from '../components/layout/AppLayout';
import API from '../utils/api';
import { toast } from 'react-toastify';
import { useAuth } from '../context/AuthContext';
import * as XLSX from 'xlsx-js-style'; // was 'xlsx'
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { saveWorkbook, saveDocument } from '../utils/exportUtils';

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

// RTE (Right to Education Act) no-detention policy applies from Nursery/KG through Class 8.
// From Class 9 onward, a fail/absent in any subject is a straightforward FAIL.
const isRTEProtectedClass = (className) => {
  if (!className) return false;
  const n = String(className).toLowerCase();
  if (/nursery|jr\.?\s*kg|junior\s*kg|sr\.?\s*kg|senior\s*kg|pre[- ]?primary|play\s*group|kindergarten/.test(n)) {
    return true;
  }
  const match = n.match(/(\d+)/);
  if (match) {
    return parseInt(match[1], 10) <= 8;
  }
  return false;
};

const resultLabel = (status) => status === 'PROMOTED' ? 'PROMOTED (RTE)' : status;

// Fixed academic sequence for grouped cumulative/annual columns: Unit 1 -> Semester 1 -> Unit 2 -> Semester 2 -> Annual (last)
const getExamRank = (name) => {
  const n = String(name || '').toLowerCase();
  if (/unit.*1(?!\d)/.test(n)) return 1;
  if (/sem(ester)?.*1(?!\d)/.test(n)) return 2;
  if (/unit.*2(?!\d)/.test(n)) return 3;
  if (/sem(ester)?.*2(?!\d)/.test(n)) return 4;
  if (/annual|final/.test(n)) return 99;
  return 50;
};

const examOrderKey = (name) => {
  const n = String(name || '').toLowerCase();
  if (/annual|final/.test(n)) return 99;
  const d = n.match(/(\d+)/);
  const num = d ? parseInt(d[1], 10) : (/first/.test(n) ? 1 : /second/.test(n) ? 2 : 0);
  const isSem = /sem|term/.test(n);
  const isUnit = /unit|test/.test(n);
  if (!num || num > 2 || (!isSem && !isUnit)) return 50;
  return (num - 1) * 2 + (isSem ? 2 : 1); // 1st Unit=1, 1st Sem=2, 2nd Unit=3, 2nd Sem=4
};

const MarksheetReport = () => {
  const { user } = useAuth();
  const isTeacher = user?.role === 'Teacher' || user?.role === 'teacher';

  const [classes, setClasses] = useState([]);
  const [levelFilter, setLevelFilter] = useState('');
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
    // teachers get only their own classes (own class + classes where they teach a subject)
    API.get(isTeacher ? '/marks/my-classes' : '/config/classes').then(r => {
      const list = r.data || [];
      setClasses(list);
      if (isTeacher && list.length > 0) {
        setFilters(f => f.class_id ? f : { ...f, class_id: String(list[0].id) });
      }
    }).catch(() => setClasses([]));
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
      if (filters.class_id) {
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
    if (!dataSource.length) return { rows: [], subjects: [], examTypesFound: [] };
    
    // 1. Identify active selected exam type text
    const activeSelectedExamObj = examTypes.find(e => e.id == filters.exam_type_id);
    const activeExamStringName = activeSelectedExamObj ? String(activeSelectedExamObj.name) : '';
    const isFinalCumulative = activeExamStringName.toLowerCase().includes('final') || activeExamStringName.toLowerCase().includes('annual') || filters.exam_type_id === 'FINAL';

    // 2. Build subject tracking map safely containing dynamic max rules
    const subjectMap = {};
    dataSource.forEach(m => {
      if (!filters.class_id || m.class_id == filters.class_id) {
        // Fallback name verification safety checks
        const currentExamName = m.exam_type_name || activeExamStringName || 'Default';
        
        if (!subjectMap[m.subject_id]) {
          subjectMap[m.subject_id] = {
            id: m.subject_id, 
            name: m.subject_name,
            code: m.code, 
            pass_marks: m.pass_marks, 
            max_marks: m.max_marks,
            examMaxes: {},
            examPasses: {}
          };
        }
        // Save the precise exam-specific config details
        subjectMap[m.subject_id].examMaxes[currentExamName] = m.max_marks;
        subjectMap[m.subject_id].examPasses[currentExamName] = m.pass_marks;
      }
    });
    const subjects = Object.values(subjectMap);

    // 3. Track all unique exam cycles found in this dataset
    const distinctExamsMap = {};
    dataSource.forEach(m => {
      const nameKey = m.exam_type_name || activeExamStringName || 'Default';
      distinctExamsMap[nameKey] = true;
    });
    const examTypesFound = Object.keys(distinctExamsMap).sort((a, b) => examOrderKey(a) - examOrderKey(b) || a.localeCompare(b));

    // 4. Group student marks metrics map cleanly
    const studentMap = {};
    dataSource.forEach(m => {
      if (!studentMap[m.student_id]) {
        studentMap[m.student_id] = {
          id: m.student_id, name: m.student_name,
          roll_no: m.roll_no, class_name: m.class_name,
          fee_status: m.student_fee_status,
          gr_no: m.gr_no,
          mother_name: m.mother_name,
          dob: m.dob,
          yearly_attendance: m.yearly_attendance,
          school_name: m.school_name,
          school_address: m.school_address,
          school_reopen_date: m.school_reopen_date,
          school_logo: m.school_logo,
          marks: {}, 
          overall_remark: null
        };
      }

      const currentExamName = m.exam_type_name || activeExamStringName || 'Default';

      if (!filters.class_id || m.class_id == filters.class_id) {
        if (!studentMap[m.student_id].marks[m.subject_id]) {
          studentMap[m.student_id].marks[m.subject_id] = {};
        }
        
        studentMap[m.student_id].marks[m.subject_id][currentExamName] = {
          obtained: m.marks_obtained,
          max: m.max_marks,
          pass: m.pass_marks,
          is_absent: m.is_absent === 1 || m.is_absent === true
        };
      }
     
      if (m.overall_remark) {
        studentMap[m.student_id].overall_remark = m.overall_remark;
      }
    });

    // 5. Generate final row totals using explicit dynamic limits
    const rows = Object.values(studentMap).map(s => {
      let totalObtainedYear = 0;
      let totalMaxYear = 0;
      let passedYear = true;

      subjects.forEach(sub => {
        // Cycle through all visible/loaded exam configurations
        const examsToProcess = isFinalCumulative ? examTypesFound : [activeExamStringName || 'Default'];

        examsToProcess.forEach(etName => {
          const m = s.marks[sub.id]?.[etName];
          const configuredMax = sub.examMaxes[etName] || sub.max_marks || 100;
          const configuredPass = sub.examPasses[etName] || sub.pass_marks || 35;

          if (m) {
            if (m.is_absent) {
              passedYear = false;
              totalMaxYear += parseInt(configuredMax);
            } else if (m.obtained !== null && m.obtained !== undefined && m.obtained !== '') {
              totalObtainedYear += parseFloat(m.obtained);
              totalMaxYear += parseInt(configuredMax);
              if (parseFloat(m.obtained) < parseInt(configuredPass)) {
                passedYear = false;
              }
            }
          } else {
            // Missing score entries automatically add max value boundaries for safety totals
            totalMaxYear += parseInt(configuredMax);
            passedYear = false;
          }
        });
      });

      // Overall % = each subject converted to 100, averaged per exam, then averaged across exams that have marks
      const examPcts = [];
      (isFinalCumulative ? examTypesFound : [activeExamStringName || 'Default']).forEach(etName => {
        let t = 0, any = false;
        subjects.forEach(sub => {
          const m = s.marks[sub.id]?.[etName];
          if (!m) return;
          if (m.is_absent) { any = true; return; }
          if (m.obtained !== null && m.obtained !== undefined && m.obtained !== '') {
            const mx = parseFloat(m.max) || parseFloat(sub.examMaxes[etName]) || parseFloat(sub.max_marks) || 100;
            t += (parseFloat(m.obtained) / mx) * 100;
            any = true;
          }
        });
        if (any && subjects.length) examPcts.push(t / subjects.length);
      });
      const percentage = examPcts.length ? (examPcts.reduce((a, b) => a + b, 0) / examPcts.length).toFixed(1) : 0;

      // RTE no-detention promotion is a year-end decision — it only applies when viewing
      // the Annual Exam. Interim exams (Unit Test, Semester, etc.) always show a plain
      // PASS/FAIL, even for RTE-protected classes (Nursery/KG - Class 8), since nobody
      // gets "promoted" off a mid-year test.
      const isRTE = isRTEProtectedClass(s.class_name) && isFinalCumulative;
      // showMetrics: percentage/grade are visible whenever all subjects were passed, OR the
      // class falls under the RTE no-detention policy on the Annual Exam, where a fail/absent
      // in a subject still surfaces the percentage & grade instead of hiding them.
      const showMetrics = passedYear || isRTE;

      const grade = !showMetrics ? '—' : (percentage >= 90 ? 'A+' : percentage >= 80 ? 'A' :
        percentage >= 70 ? 'B+' : percentage >= 60 ? 'B' :
        percentage >= 50 ? 'C' : percentage >= 35 ? 'D' : 'F');

      // resultStatus: PASS (all subjects cleared), PROMOTED (RTE no-detention class, fail/absent
      // in a subject but still moved up per policy — Annual Exam only), or FAIL (Class 9+, or
      // any interim exam, with a fail/absent in any subject).
      const resultStatus = passedYear ? 'PASS' : (isRTE ? 'PROMOTED' : 'FAIL');

      return { 
        ...s, 
        total: totalObtainedYear, 
        maxTotal: totalMaxYear, 
        percentage, 
        grade, 
        passed: passedYear,
        isRTE,
        showMetrics,
        resultStatus
      };
    });

    return { rows, subjects, examTypesFound, isFinalCumulative };
  };

  const { rows: allRows, subjects, examTypesFound, isFinalCumulative } = buildData(marksheetData);

  const restrictedView = marksheetData.some(m => m.restricted_view); // subject teacher: own subjects only

  const rows = allRows.filter(r => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return r.name.toLowerCase().includes(q) || (r.roll_no && String(r.roll_no).toLowerCase().includes(q));
  });

  const className = classes.find(c => c.id == filters.class_id)?.name || 'All Classes';
  const examType = examTypes.find(e => e.id == filters.exam_type_id)?.name || (filters.exam_type_id === 'FINAL' ? 'Final Report' : '');
  
const getMarksForExport = (rowMarks, subjectId, examTypeName, isFinalCumulative) => {
  if (!rowMarks || !rowMarks[subjectId]) return { obtained: null, max: 0, pass: 0, is_absent: false };
  const subjectMarks = rowMarks[subjectId];
  if (isFinalCumulative) {
    let total = 0, maxTotal = 0, passTotal = 0, anyAbsent = false, hasData = false;
    Object.values(subjectMarks).forEach(m => {
      if (m.is_absent) { anyAbsent = true; maxTotal += parseInt(m.max || 0); }
      else if (m.obtained !== null && m.obtained !== undefined && m.obtained !== '') {
        total += parseFloat(m.obtained); maxTotal += parseInt(m.max || 0); passTotal += parseInt(m.pass || 0); hasData = true;
      }
    });
    return { obtained: hasData ? total : null, max: maxTotal, pass: passTotal, is_absent: anyAbsent && !hasData };
  } else {
    const m = subjectMarks[examTypeName];
    if (!m) return { obtained: null, max: 0, pass: 0, is_absent: false };
    return m;
  }
};

// ── SINGLE STUDENT PDF ──────────────────────────────────────────────────────
const exportSingleStudentPDF = async (row) => {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.width;
  const pageH = doc.internal.pageSize.height;

  // Border
  doc.setDrawColor(30, 64, 175); doc.setLineWidth(1.5);
  doc.rect(8, 8, pageW - 16, pageH - 16);
  doc.setLineWidth(0.5); doc.rect(10, 10, pageW - 20, pageH - 20);

  // Header
  doc.setFillColor(30, 64, 175); doc.rect(10, 10, pageW - 20, 24, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20); doc.setFont('helvetica', 'bold');
  doc.text('SchoolMS', pageW / 2, 20, { align: 'center' });
  doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  doc.text('School Management System', pageW / 2, 27, { align: 'center' });

  // Sub-title
  doc.setFillColor(241, 245, 249); doc.rect(10, 34, pageW - 20, 10, 'F');
  doc.setTextColor(30, 64, 175); doc.setFontSize(12); doc.setFont('helvetica', 'bold');
  doc.text(`MARK SHEET — ${examType.toUpperCase()}`, pageW / 2, 41, { align: 'center' });

  // Student info
  const infoY = 52;
  doc.setFillColor(248, 250, 252); doc.setDrawColor(226, 232, 240);
  doc.rect(12, infoY - 4, pageW - 24, 24, 'FD');
  const infoLeft = [['Student Name', row.name], ['Roll No', row.roll_no], ['Class', row.class_name || className]];
  const infoRight = [['Academic Year', filters.academic_year], ['Exam Type', examType], ['Date', new Date().toLocaleDateString('en-IN')]];
  const lineH = 7;
  infoLeft.forEach(([label, value], idx) => {
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(100, 116, 139);
    doc.text(`${label}:`, 16, infoY + idx * lineH);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 41, 59);
    doc.text(String(value || '—'), 50, infoY + idx * lineH);
  });
  infoRight.forEach(([label, value], idx) => {
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(100, 116, 139);
    doc.text(`${label}:`, pageW / 2 + 4, infoY + idx * lineH);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 41, 59);
    doc.text(String(value || '—'), pageW / 2 + 38, infoY + idx * lineH);
  });

  const tableY = infoY + 28;
  let tableHeaders, tableBody;

  if (isFinalCumulative) {
    // Annual: rows = subjects, columns = exam types + Total + Max + Status
    // Header row 1: # | Subject | ExamType1 (/max) | ExamType2 (/max) | ... | Total | Max | Status
    const examCols = examTypesFound;

    // Calculate per-exam max for each subject
    const examSubjectMax = {};
    examCols.forEach(etName => {
      examSubjectMax[etName] = {};
      subjects.forEach(s => {
        const m = row.marks[s.id]?.[etName];
        examSubjectMax[etName][s.id] = m ? (m.max || 0) : 0;
      });
    });

    // Build header with max marks per exam type (use first subject's max as representative)
    const headerRow = [
      '#', 'Subject',
      ...examCols.map(etName => {
        const repMax = subjects.length > 0 ? (examSubjectMax[etName][subjects[0].id] || 0) : 0;
        return repMax > 0 ? `${etName}\n(Max:${repMax})` : etName;
      }),
      'Total', 'Max', 'Status'
    ];
    tableHeaders = [headerRow];

    tableBody = subjects.map((s, i) => {
      let subTotal = 0, subMax = 0, subPass = 0, anyFail = false, anyAbsent = false;
      const examCells = examCols.map(etName => {
        const m = row.marks[s.id]?.[etName];
        if (!m) return '—';
        if (m.is_absent) { anyAbsent = true; subMax += parseInt(m.max || 0); return 'AB'; }
        const obt = parseFloat(m.obtained || 0);
        subTotal += obt; subMax += parseInt(m.max || 0); subPass += parseInt(m.pass || 0);
        if (obt < parseInt(m.pass)) anyFail = true;
        return String(m.obtained);
      });
      const status = anyAbsent ? 'ABSENT' : anyFail ? 'FAIL' : 'PASS';
      return [String(i + 1), s.name, ...examCells, String(subTotal), String(subMax), status];
    });

  } else {
    tableHeaders = [['#', 'Subject', 'Code', 'Max Marks', 'Pass Marks', 'Marks Obtained', 'Status']];
    tableBody = subjects.map((s, i) => {
      const m = getMarksForExport(row.marks, s.id, examType, false);
      const isAbsent = m.is_absent;
      const obtained = isAbsent ? 'AB' : (m.obtained !== null && m.obtained !== undefined ? m.obtained : '—');
      let status = '—';
      if (isAbsent) status = 'ABSENT';
      else if (m.obtained !== null && m.obtained !== undefined) {
        status = parseFloat(m.obtained) >= m.pass ? 'PASS' : 'FAIL';
      }
      return [String(i + 1), s.name, s.code || '—', String(m.max || s.max_marks || 100), String(m.pass || s.pass_marks || 35), String(obtained), status];
    });
  }

  autoTable(doc, {
    head: tableHeaders, body: tableBody, startY: tableY,
    styles: { fontSize: 9, cellPadding: 3, halign: 'center', font: 'helvetica' },
    headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold', fontSize: 9 },
    columnStyles: { 1: { halign: 'left', cellWidth: isFinalCumulative ? 35 : 65 } },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    didParseCell: (data) => {
      if (data.section === 'body') {
        const val = data.cell.text[0];
        if (val === 'PASS') { data.cell.styles.textColor = [22, 163, 74]; data.cell.styles.fontStyle = 'bold'; }
        else if (val === 'FAIL') { data.cell.styles.textColor = [220, 38, 38]; data.cell.styles.fontStyle = 'bold'; }
        else if (val === 'ABSENT') { data.cell.styles.textColor = [217, 119, 6]; data.cell.styles.fontStyle = 'bold'; }
        else if (val === 'AB') { data.cell.styles.fillColor = [254, 243, 199]; data.cell.styles.textColor = [217, 119, 6]; data.cell.styles.fontStyle = 'bold'; }
      }
    },
    margin: { left: 12, right: 12 }
  });

  const summaryY = doc.lastAutoTable.finalY + 6;
  const isPassed = row.resultStatus === 'PASS';
  const isPromoted = row.resultStatus === 'PROMOTED';
  // Box color: green for PASS, amber for RTE PROMOTED, red for FAIL
  const boxColor = isPassed ? [240, 253, 244] : isPromoted ? [255, 251, 235] : [254, 242, 242];
  const lineColor = isPassed ? [22, 163, 74] : isPromoted ? [217, 119, 6] : [220, 38, 38];

  // Summary box
  doc.setFillColor(...boxColor);
  doc.setDrawColor(...lineColor);
  doc.setLineWidth(0.6);
  doc.roundedRect(12, summaryY, pageW - 24, 20, 2, 2, 'FD');

  const summaryItems = [
    ['Total Marks', `${row.total} / ${row.maxTotal}`],
    ['Percentage', row.showMetrics ? `${row.percentage}%` : '—'],
    ['Grade', row.grade],
    ['Result', resultLabel(row.resultStatus)],
  ];
  const colW = (pageW - 24) / 4;
  summaryItems.forEach(([label, value], idx) => {
    const x = 12 + idx * colW + colW / 2;
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 116, 139);
    doc.text(label, x, summaryY + 6, { align: 'center' });
    doc.setFontSize(11); doc.setFont('helvetica', 'bold');
    doc.setTextColor(idx === 3 ? lineColor[0] : 30, idx === 3 ? lineColor[1] : 64, idx === 3 ? lineColor[2] : 175);
    doc.text(String(value), x, summaryY + 14, { align: 'center' });
  });

  const remarkY = summaryY + 26;

  // Grade legend box
  const gradeY = remarkY;
  doc.setFillColor(239, 246, 255); doc.setDrawColor(147, 197, 253); doc.setLineWidth(0.4);
  doc.roundedRect(12, gradeY, pageW - 24, 14, 1.5, 1.5, 'FD');
  doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 64, 175);
  doc.text('Grade Scale:', 16, gradeY + 5);
  doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 41, 59);
  doc.text(
    `A+ (90-100%)   A (80-89%)   B+ (70-79%)   B (60-69%)   C (50-59%)   D (35-49%)   F (Below 35%)   Note: ${row.isRTE ? 'As per RTE policy, students up to Class 8 are promoted even if they fail/are absent in a subject' : 'Absent in any subject = FAIL'}`,
    42, gradeY + 5
  );

  // Remark box
  const remarkBoxY = gradeY + 18;
  doc.setFillColor(254, 243, 199); doc.setDrawColor(245, 158, 11); doc.setLineWidth(0.5);
  doc.roundedRect(12, remarkBoxY, pageW - 24, 10, 1.5, 1.5, 'FD');
  doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(146, 64, 14);
  doc.text("Teacher's Remark:", 16, remarkBoxY + 6.5);
  doc.setFont('helvetica', 'normal'); doc.setTextColor(120, 53, 15);
  doc.text(row.overall_remark || 'No remarks added', 52, remarkBoxY + 6.5, { maxWidth: pageW - 68 });

  // Signatures
  const sigY = pageH - 22;
  doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.5);
  [{ x: 20, label: 'Class Teacher' }, { x: pageW / 2 - 25, label: 'Principal' }, { x: pageW - 75, label: 'Parent / Guardian' }].forEach(({ x, label }) => {
    doc.line(x, sigY, x + 50, sigY);
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 116, 139);
    doc.text(label, x + 24, sigY + 5, { align: 'center' });
  });

  doc.setFontSize(7); doc.setTextColor(148, 163, 184);
  doc.text('This is a computer generated marksheet. — SchoolMS', pageW / 2, pageH - 8, { align: 'center' });

  await saveDocument(doc, `marksheet-${row.name.replace(/\s+/g, '_')}-${examType}.pdf`);
  toast.success(`Marksheet for ${row.name} downloaded!`);
};

  const getExamOrder = (name) => {
  const n = String(name || '').toLowerCase();
  if (/annual|final/.test(n)) return 99;
  const d = n.match(/(\d+)/);
  const num = d ? parseInt(d[1], 10) : (/first/.test(n) ? 1 : /second/.test(n) ? 2 : 0);
  const isSem = /sem|term/.test(n);
  const isUnit = /unit|test/.test(n);
  if (!num || num > 2 || (!isSem && !isUnit)) return 50;
  return (num - 1) * 2 + (isSem ? 2 : 1); // 1st Unit=1, 1st Sem=2, 2nd Unit=3, 2nd Sem=4
};

const loadSchoolLogo = async (src) => {
  const base = String(API?.defaults?.baseURL || '').replace(/\/api\/?$/, '').replace(/\/$/, '');
  const candidates = [];
  if (src) candidates.push(/^(data:|https?:)/.test(src) ? src : `${base}/${String(src).replace(/^\//, '')}`);
  candidates.push('/logo.png'); // fallback: logo.png in the frontend public folder
  for (const url of candidates) {
    try {
      if (url.startsWith('data:image')) return { data: url, fmt: url.includes('image/jpeg') ? 'JPEG' : 'PNG' };
      const res = await fetch(url);
      const blob = await res.blob();
      if (!res.ok || !blob.type.startsWith('image/')) continue;
      const data = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(blob);
      });
      return { data, fmt: blob.type.includes('jpeg') ? 'JPEG' : 'PNG' };
    } catch (e) { /* try next */ }
  }
  return null;
};

const GRADE_SCALE = [
  { range: '91% to 100%', grade: 'A-1', min: 91 },
  { range: '81% to 90%', grade: 'A-2', min: 81 },
  { range: '71% to 80%', grade: 'B-1', min: 71 },
  { range: '61% to 70%', grade: 'B-2', min: 61 },
  { range: '51% to 60%', grade: 'C-1', min: 51 },
  { range: '41% to 50%', grade: 'C-2', min: 41 },
  { range: '33% to 40%', grade: 'D', min: 33 },
  { range: '21% to 32%', grade: 'E-1', min: 21 },
  { range: '20% or Less', grade: 'E-2', min: 0 }
];
const gradeFromPct = (pct) => (GRADE_SCALE.find(g => pct >= g.min) || GRADE_SCALE[GRADE_SCALE.length - 1]).grade;

const fmtDateIN = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  return isNaN(dt) ? String(d) : dt.toLocaleDateString('en-IN');
};

const sectionOf = (cls) => {
  const n = String(cls || '').toLowerCase();
  if (/nursery|play\s*group|pre[- ]?primary|kindergarten|\b[lu]\.?\s*kg\b|\bjr\.?\s*kg\b|\bsr\.?\s*kg\b|junior\s*kg|senior\s*kg|\bkg\b/.test(n)) return 'PRE-PRIMARY';
  const num = parseInt((n.match(/(\d+)/) || [])[1], 10);
  if (!isNaN(num) && num <= 5) return 'PRIMARY';
  return 'SECONDARY';
};

const nextStdOf = (cls) => {
  const n = String(cls || '').toLowerCase();
  if (/nursery|play\s*group/.test(n)) return 'LKG';
  if (/\blkg\b|\bl\.?\s*kg\b|jr\.?\s*kg|junior\s*kg/.test(n)) return 'UKG';
  if (/\bukg\b|\bu\.?\s*kg\b|sr\.?\s*kg|senior\s*kg/.test(n)) return '1';
  const m = n.match(/(\d+)/);
  if (!m) return '';
  const next = parseInt(m[1], 10) + 1;
  return next > 10 ? '' : String(next);
};

// ── MARKSHEET IN SCHOOL FORMAT (annual = full, unit/sem = without annual-only fields) ──
const exportFormatMarksheetPDF = async (row) => {
  const logo = await loadSchoolLogo(row.school_logo);
  const isAnnual = !!isFinalCumulative; // true for "Final Report" (and Annual/Final exam types)
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.width;
  const pageH = doc.internal.pageSize.height;
  const L = 12, W = pageW - 24;
  const cls = row.class_name || className;
  const BLUE = [30, 64, 175], SLATE = [100, 116, 139], DARK = [30, 41, 59], BORDER = [203, 213, 225];
  const GREEN = [22, 163, 74], RED = [220, 38, 38];
  const fmtNum = (n) => String(Number(Number(n).toFixed(2)));

  // Columns: Final Report = every exam type; any other exam = only that exam
  const regularExams = examTypes.map(e => String(e.name)).filter(n => !/annual|final/i.test(n));
  const knownNames = new Set(examTypes.map(e => String(e.name)));
  const cols = isAnnual
    ? Array.from(new Set([
        ...regularExams,
        ...examTypesFound.filter(n => knownNames.has(n) && /annual|final/i.test(n))
      ])).sort((a, b) => getExamOrder(a) - getExamOrder(b) || a.localeCompare(b))
    : [examType];

  // Every subject mark is converted to 100 first: (obtained / max) x 100
  const to100 = (m) => {
    const mx = parseFloat(m.max);
    return mx > 0 ? (parseFloat(m.obtained) / mx) * 100 : parseFloat(m.obtained);
  };
  const examStats = cols.map(et => {
    let t = 0, raw = 0, rawMax = 0, hasData = false;
    subjects.forEach(s => {
      const m = row.marks[s.id]?.[et];
      if (!m) return;
      if (m.is_absent) { rawMax += parseFloat(m.max) || 0; hasData = true; return; }
      if (m.obtained !== null && m.obtained !== undefined && m.obtained !== '') {
        t += to100(m); raw += parseFloat(m.obtained); rawMax += parseFloat(m.max) || 0; hasData = true;
      }
    });
    const max = hasData ? subjects.length * 100 : 0;
    return { total: t, raw, rawMax, max, outOf100: max > 0 ? (t / max) * 100 : 0 };
  });

  // Overall percentage = average of every filled exam's percentage
  const validStats = examStats.filter(x => x.max > 0);
  const hasPct = validStats.length > 0;
  const overallPct = hasPct ? validStats.reduce((a, x) => a + x.outOf100, 0) / validStats.length : 0;

  // Pass / Fail (absent in any subject = fail, missing marks = fail)
  const activeCols = cols.filter((et, i) => examStats[i].max > 0);
  const failedIn = (m) => !m || m.is_absent || m.obtained === null || m.obtained === undefined || m.obtained === '' || parseFloat(m.obtained) < parseFloat(m.pass);
  const subjectResult = (s) => {
    if (!activeCols.length) return '';
    return activeCols.some(et => failedIn(row.marks[s.id]?.[et])) ? 'FAIL' : 'PASS';
  };
  const allPassed = activeCols.length > 0 && subjects.every(s => subjectResult(s) === 'PASS');
  const isRteClass = isRTEProtectedClass(cls) || /\b[lu]\.?\s*kg\b/i.test(String(cls));

  // ── Page frame ──
  doc.setDrawColor(...BLUE); doc.setLineWidth(1.2); doc.rect(6, 6, pageW - 12, pageH - 12);
  doc.setLineWidth(0.3); doc.rect(7.8, 7.8, pageW - 15.6, pageH - 15.6);

  // ── School header band ──
  doc.setFillColor(...BLUE); doc.rect(L, 11, W, 22, 'F');
  if (logo) {
    try {
      doc.setFillColor(255, 255, 255); doc.roundedRect(L + 4, 13, 18, 18, 2, 2, 'F');
      doc.addImage(logo.data, logo.fmt, L + 5, 14, 16, 16);
    } catch (e) { /* skip logo if the image can't be embedded */ }
  }
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
  doc.text(String(row.school_name || 'SCHOOL NAME').toUpperCase(), pageW / 2, 21, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
  if (row.school_address) doc.text(String(row.school_address), pageW / 2, 28, { align: 'center', maxWidth: W - 10 });

  // ── Title band ──
  doc.setFillColor(241, 245, 249); doc.rect(L, 33, W, 12, 'F');
  doc.setTextColor(...BLUE); doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
  doc.text(`MARK SHEET — ${String(examType).toUpperCase()}`, pageW / 2, 38.5, { align: 'center' });
  doc.setFontSize(9); doc.setTextColor(...SLATE);
  doc.text(`SECTION: ${sectionOf(cls)}     |     ACADEMIC YEAR: ${filters.academic_year}`, pageW / 2, 43, { align: 'center' });

  // ── Student info box ──
  const infoY = 48, rowH = 7, mid = L + W / 2;
  doc.setFillColor(248, 250, 252); doc.setDrawColor(...BORDER); doc.setLineWidth(0.4);
  doc.roundedRect(L, infoY, W, rowH * 3, 1.5, 1.5, 'FD');
  doc.line(L, infoY + rowH, L + W, infoY + rowH);
  doc.line(L, infoY + rowH * 2, L + W, infoY + rowH * 2);
  doc.line(mid, infoY, mid, infoY + rowH * 3);
  const drawInfo = (label, val, x, y) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...SLATE);
    doc.text(`${label}:`, x, y);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...DARK);
    doc.text(String(val || '—'), x + 38, y);
  };
  [['Name of the Student', row.name], ['Roll No', row.roll_no], ['Mother Name', row.mother_name]]
    .forEach(([l, v], i) => drawInfo(l, v, L + 3, infoY + rowH * i + 4.7));
  [['Std', cls], ['GR No', row.gr_no], ['DOB', fmtDateIN(row.dob)]]
    .forEach(([l, v], i) => drawInfo(l, v, mid + 3, infoY + rowH * i + 4.7));

  // ── Marks table ──
  const tableY = infoY + rowH * 3 + 5;
  const panelW = 68;
  const colLabel = (n) => `${String(n).toUpperCase()}${/marks$/i.test(String(n)) ? '' : ' MARKS'}`;

  const head = [['Sr. No.', 'Subjects', ...cols.map(colLabel)]];
  const body = subjects.map((s, i) => [
    String(i + 1), s.name,
    ...cols.map(et => {
      const m = row.marks[s.id]?.[et];
      if (!m) return isAnnual ? '' : '—';
      if (m.is_absent) return 'AB';
      return (m.obtained !== null && m.obtained !== undefined && m.obtained !== '') ? fmtNum(m.obtained) : (isAnnual ? '' : '—');
    })
  ]);
  body.push([
    String(subjects.length + 1), 'Total',
    ...examStats.map(x => x.max > 0 ? `${fmtNum(x.raw)}/${fmtNum(x.rawMax)}` : '')
  ]);
  if (isAnnual) {
    body.push([
      '', 'Percentage',
      ...examStats.map(x => x.max > 0 ? `${x.outOf100.toFixed(1)}%` : '')
    ]);
  }

  autoTable(doc, {
    head, body, startY: tableY, theme: 'grid',
    margin: { left: L, right: L + panelW + 4 },
    styles: { fontSize: subjects.length > 9 ? 7.5 : 9, cellPadding: subjects.length > 9 ? 0.9 : 1.5, halign: 'center', valign: 'middle', lineColor: BORDER, lineWidth: 0.25, textColor: DARK },
    headStyles: { fillColor: BLUE, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 0: { cellWidth: 16 }, 1: { halign: 'left', cellWidth: 48 } },
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      const ri = data.row.index, ci = data.column.index;
      if (ri >= subjects.length) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [219, 234, 254];
        data.cell.styles.textColor = BLUE;
        return;
      }
      if (ci >= 2) {
        const m = row.marks[subjects[ri].id]?.[cols[ci - 2]];
        if (m?.is_absent) { data.cell.styles.textColor = [217, 119, 6]; data.cell.styles.fontStyle = 'bold'; }
        else if (m && m.obtained !== null && m.obtained !== undefined && parseFloat(m.obtained) < parseFloat(m.pass)) {
          data.cell.styles.textColor = RED; data.cell.styles.fontStyle = 'bold';
        }
      }
    }
  });

  // ── Mark Graduation table (all exam types) ──
  {
    const gy = doc.lastAutoTable.finalY + 4;
    const gw = W - panelW - 4;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...BLUE);
    doc.text('MARK GRADUATION', L, gy + 2.5);
    autoTable(doc, {
      startY: gy + 4,
      head: [['Marks %', ...GRADE_SCALE.map(g => g.range)]],
      body: [['Grade', ...GRADE_SCALE.map(g => g.grade)]],
      theme: 'grid',
      margin: { left: L, right: pageW - L - gw },
      styles: { fontSize: 7.5, cellPadding: 1.2, halign: 'center', valign: 'middle', lineColor: BORDER, lineWidth: 0.25, textColor: DARK },
      headStyles: { fillColor: [241, 245, 249], textColor: DARK, fontStyle: 'bold' },
      bodyStyles: { fontStyle: 'bold', textColor: BLUE }
    });
  }

  // ── Right-side cards ──
  const panelX = pageW - L - panelW;
  let py = tableY;
  const nextStd = nextStdOf(cls);
  const failed = hasPct && !allPassed && !isRteClass;
  const pctText = hasPct ? `${overallPct.toFixed(1)}%` : '—';
  const resultText = hasPct ? (allPassed ? 'PASS' : 'FAIL') : '—';
  const resultAccent = !hasPct ? DARK : (allPassed ? GREEN : RED);
  const promotedText = !hasPct ? '—' : (failed
    ? 'Not Promoted'
    : (nextStd
        ? `${allPassed ? 'Passed' : 'Promoted (RTE)'} to Std ${nextStd}`
        : (allPassed ? 'Passed' : 'Promoted (RTE)')));

  const items = isAnnual ? [
    { label: 'Overall Percentage', value: hasPct ? `${pctText}   |   Grade: ${gradeFromPct(overallPct)}` : '—', accent: hasPct ? BLUE : DARK },
    { label: 'Result', value: resultText, accent: resultAccent },
    { label: 'Remark', value: row.overall_remark || '—' },
    { label: 'Passed/Promoted to Std', value: promotedText, accent: failed ? RED : (hasPct ? GREEN : DARK) },
    {
      label: 'Yearly Attendance',
      value: (() => {
        const mt = String(row.yearly_attendance || '').match(/(\d+)\s*\/\s*(\d+)/);
        if (!mt || !parseInt(mt[2], 10)) return '—';
        const p = (parseInt(mt[1], 10) / parseInt(mt[2], 10)) * 100;
        return `${p.toFixed(1)}% (${mt[1]}/${mt[2]} days)`;
      })()
    },
    { label: 'School Re-Open', value: fmtDateIN(row.school_reopen_date) || '—' }
  ] : [
    { label: 'Percentage', value: hasPct ? `${pctText}   |   Grade: ${gradeFromPct(overallPct)}` : '—', accent: hasPct ? BLUE : DARK },
    { label: 'Result', value: resultText, accent: resultAccent },
    { label: 'Remark', value: row.overall_remark || '—' }
  ];
  items.forEach(({ label, value, accent }) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    const lines = doc.splitTextToSize(String(value), panelW - 8);
    const rh = 11 + (lines.length - 1) * 4.2;
    doc.setFillColor(248, 250, 252); doc.setDrawColor(...BORDER); doc.setLineWidth(0.3);
    doc.roundedRect(panelX, py, panelW, rh, 1.5, 1.5, 'FD');
    doc.setFillColor(...BLUE); doc.rect(panelX, py + 1, 1.2, rh - 2, 'F');
    doc.setFontSize(7.5); doc.setTextColor(...SLATE);
    doc.text(label.toUpperCase(), panelX + 4, py + 4);
    doc.setFontSize(10); doc.setTextColor(...(accent || DARK));
    doc.text(lines, panelX + 4, py + 9);
    py += rh + 3;
  });

  // ── Note + signatures ──
  const sigY = pageH - 22;
  doc.setFont('helvetica', 'italic'); doc.setFontSize(6.5); doc.setTextColor(...SLATE);
  const noteText = 'Note: Absent (AB) in any subject is considered as Fail.'
    + (isRteClass && isAnnual ? ' As per RTE policy, students up to Class 8 are promoted even if they fail or are absent in a subject.' : '');
  const noteLines = doc.splitTextToSize(noteText, W - 6);
  doc.text(noteLines, L + 3, pageH - 11.5 - (noteLines.length - 1) * 2.8);

  doc.setDrawColor(148, 163, 184); doc.setLineWidth(0.4);
  [['Principal Seal/Sign', L + W / 6], ['Class Teacher Sign', L + W / 2], ["Parent's Sign", L + (W * 5) / 6]]
    .forEach(([label, cx]) => {
      doc.line(cx - 28, sigY, cx + 28, sigY);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...SLATE);
      doc.text(label, cx, sigY + 5, { align: 'center' });
    });

  await saveDocument(doc, `marksheet-${row.name.replace(/\s+/g, '_')}-${examType}.pdf`);
  toast.success(`Marksheet for ${row.name} downloaded!`);
};

// ── EXCEL EXPORT ─────────────────────────────────────────────────────────────
  const applyHighlight = (ws, rowIndices) => {
  if (!rowIndices.length || !ws['!ref']) return;
  const range = XLSX.utils.decode_range(ws['!ref']);
  rowIndices.forEach(r => {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const ref = XLSX.utils.encode_cell({ r, c });
      if (!ws[ref]) continue;
      ws[ref].s = { fill: { fgColor: { rgb: 'FEF08A' } }, font: { color: { rgb: '92400E' }, bold: true } };
    }
  });
};

const exportExcel = async () => {
  setShowExport(false);
  const wb = XLSX.utils.book_new();

  const buildSheetData = (clsRows, clsSubjects, clsName, etName, clsExamTypesFound, clsIsCumulative) => {
    let headers, dataRows;
    const highlightOffsets = [];

    if (clsIsCumulative) {
      const groupRow = ['', '', ''];
      const subRow = ['#', 'Roll No', 'Student Name'];
      clsExamTypesFound.forEach(et => {
        clsSubjects.forEach((s, si) => {
          groupRow.push(si === 0 ? et : '');
          subRow.push(`${s.name}\n(Max:${clsRows[0]?.marks[s.id]?.[et]?.max || s.max_marks || '?'})`);
        });
      });
      ['Total', 'Max Marks', 'Percentage', 'Grade', 'Result', 'Remark'].forEach(h => {
        groupRow.push(''); subRow.push(h);
      });

      dataRows = clsRows.map((r, i) => {
        const examCells = clsExamTypesFound.flatMap(et =>
          clsSubjects.map(s => {
            const m = r.marks[s.id]?.[et];
            if (!m) return '—';
            if (m.is_absent) return 'AB';
            return m.obtained ?? '—';
          })
        );
        const isDeact = r.fee_status && r.fee_status !== 'active';
        if (isDeact) highlightOffsets.push(4 + i); // title,blank,group,sub = 4 rows before data
        return [
          i + 1, r.roll_no, isDeact ? `${r.name} (DEACTIVATED)` : r.name,        
          ...examCells,
          r.total, r.maxTotal,
          r.showMetrics ? `${r.percentage}%` : '—',
          r.grade, resultLabel(r.resultStatus), r.overall_remark || '—'
        ];
      });

      const title = [`${clsName} — ${etName} — ${filters.academic_year}`];
      return { sheetRows: [title, [], groupRow, subRow, ...dataRows, [], []], highlightOffsets };

    } else {
      headers = ['#', 'Roll No', 'Student Name',
        ...clsSubjects.map(s => `${s.name} (Max:${s.max_marks})`),
        'Total', 'Max Marks', 'Percentage', 'Grade', 'Result', 'Remark'
      ];
      dataRows = clsRows.map((r, i) => {
        const isDeact = r.fee_status && r.fee_status !== 'active';
        if (isDeact) highlightOffsets.push(3 + i); // title,blank,headers = 3 rows before data
        return [
          i + 1, r.roll_no, isDeact ? `${r.name} (DEACTIVATED)` : r.name,
          ...clsSubjects.map(s => {
            const m = getMarksForExport(r.marks, s.id, etName, false);
            if (m.is_absent) return 'AB';
            return m.obtained ?? '—';
          }),
          r.total, r.maxTotal, r.showMetrics ? `${r.percentage}%` : '—', r.grade, resultLabel(r.resultStatus), r.overall_remark || '—'
        ];
      });
      const title = [`${clsName} — ${etName} — ${filters.academic_year}`];
      return { sheetRows: [title, [], headers, ...dataRows, [], []], highlightOffsets };
    }
  };

  try {
    if (!isTeacher && !filters.class_id && filters.exam_type_id) {
      for (const cls of classes.filter(c => !levelFilter || levelOfClass(c.name) === levelFilter)) {
        try {
          const { data } = await API.get('/marks/marksheet', { params: { class_id: cls.id, exam_type_id: filters.exam_type_id, academic_year: filters.academic_year } });
          if (!data.length) continue;
          const built = buildData(data);
          const { sheetRows, highlightOffsets } = buildSheetData(built.rows, built.subjects, cls.name, examType, built.examTypesFound, built.isFinalCumulative);
          const ws = XLSX.utils.aoa_to_sheet(sheetRows);
          applyHighlight(ws, highlightOffsets);
          XLSX.utils.book_append_sheet(wb, ws, cls.name.slice(0, 31));
        } catch { continue; }
      }
      if (!wb.SheetNames.length) { toast.error('No data found'); return; }
      await saveWorkbook(wb, `marksheet-AllClasses-${examType}.xlsx`);
      toast.success(`Downloaded! ${wb.SheetNames.length} class(es) for ${examType}`);

    } else if (!isTeacher && !filters.class_id && !filters.exam_type_id) {
      for (const cls of classes.filter(c => !levelFilter || levelOfClass(c.name) === levelFilter)) {
        const allSectionRows = [];
        const allHighlightOffsets = [];
        for (const et of examTypes) {
          try {
            const { data } = await API.get('/marks/marksheet', { params: { class_id: cls.id, exam_type_id: et.id, academic_year: filters.academic_year } });
            if (!data.length) continue;
            const built = buildData(data);
            const { sheetRows, highlightOffsets } = buildSheetData(built.rows, built.subjects, cls.name, et.name, built.examTypesFound, built.isFinalCumulative);
            const baseOffset = allSectionRows.length;
            highlightOffsets.forEach(o => allHighlightOffsets.push(baseOffset + o));
            allSectionRows.push(...sheetRows);
          } catch { continue; }
        }
        if (!allSectionRows.length) continue;
        const ws = XLSX.utils.aoa_to_sheet(allSectionRows);
        applyHighlight(ws, allHighlightOffsets);
        XLSX.utils.book_append_sheet(wb, ws, cls.name.slice(0, 31));
      }
      if (!wb.SheetNames.length) { toast.error('No data found'); return; }
      await saveWorkbook(wb, `marksheet-AllClasses-${filters.academic_year || 'AllYears'}.xlsx`);
      toast.success(`Downloaded! ${wb.SheetNames.length} class sheets`);

    } else if (filters.class_id && !filters.exam_type_id) {
      const allSectionRows = [];
      const allHighlightOffsets = [];
      for (const et of examTypes) {
        try {
          const { data } = await API.get('/marks/marksheet', { params: { class_id: filters.class_id, exam_type_id: et.id, academic_year: filters.academic_year } });
          if (!data.length) continue;
          const built = buildData(data);
          const { sheetRows, highlightOffsets } = buildSheetData(built.rows, built.subjects, className, et.name, built.examTypesFound, built.isFinalCumulative);
          const baseOffset = allSectionRows.length;
          highlightOffsets.forEach(o => allHighlightOffsets.push(baseOffset + o));
          allSectionRows.push(...sheetRows);
        } catch { continue; }
      }
      if (!allSectionRows.length) { toast.error('No data found'); return; }
      const ws = XLSX.utils.aoa_to_sheet(allSectionRows);
      applyHighlight(ws, allHighlightOffsets);
      XLSX.utils.book_append_sheet(wb, ws, className.slice(0, 31));
      await saveWorkbook(wb, `marksheet-${className.replace(/\s+/g, '_')}-AllExams.xlsx`);
      toast.success('Downloaded! All exams in one sheet');

    } else {
      const { sheetRows, highlightOffsets } = buildSheetData(rows, subjects, className, examType, examTypesFound, isFinalCumulative);
      const ws = XLSX.utils.aoa_to_sheet(sheetRows);
      applyHighlight(ws, highlightOffsets);
      ws['!cols'] = [{ wch: 5 }, { wch: 10 }, { wch: 22 }, ...Array(sheetRows[2]?.length - 3 || 10).fill({ wch: 18 })];
      XLSX.utils.book_append_sheet(wb, ws, examType.slice(0, 31));
      await saveWorkbook(wb, `marksheet-${className.replace(/\s+/g, '_')}-${examType}.xlsx`);
      toast.success('Excel downloaded!');
    }
  } catch (err) {
    console.error('Export error:', err);
    toast.error('Export failed');
  }
};

// ── PDF CLASS REPORT ─────────────────────────────────────────────────────────
const exportPDF = async () => {
  const doc = new jsPDF({ orientation: 'landscape', format: 'a3' });
  const pageW = doc.internal.pageSize.width;

  doc.setFillColor(30, 64, 175); doc.rect(0, 0, pageW, 36, 'F');
  doc.setTextColor(255, 255, 255); doc.setFontSize(18); doc.setFont('helvetica', 'bold');
  doc.text('SchoolMS — Marksheet Report', 14, 16);
  doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  doc.text(`${examType} | ${className} | ${filters.academic_year} | Generated: ${new Date().toLocaleDateString('en-IN')}`, 14, 28);

  let headers, body;

  if (isFinalCumulative) {
    const headRow1 = [
      { content: '#', rowSpan: 2 }, { content: 'Roll No', rowSpan: 2 }, { content: 'Student Name', rowSpan: 2 },
      ...examTypesFound.map(et => ({ content: et.toUpperCase(), colSpan: subjects.length })),
      { content: 'Total', rowSpan: 2 }, { content: '%', rowSpan: 2 }, { content: 'Grade', rowSpan: 2 }, { content: 'Result', rowSpan: 2 }, { content: 'Remark', rowSpan: 2 }
    ];
    const headRow2 = examTypesFound.flatMap(et =>
      subjects.map(s => `${s.name}\n/${s.examMaxes?.[et] || s.max_marks || 100}`)
    );
    headers = [headRow1, headRow2];

    body = rows.map((r, i) => {
      const row = [i + 1, r.roll_no, (r.fee_status && r.fee_status !== 'active') ? `${r.name} (DEACTIVATED)` : r.name,];
      examTypesFound.forEach(et => {
        subjects.forEach(s => {
          const m = r.marks[s.id]?.[et];
          if (!m) row.push('—');
          else row.push(m.is_absent ? 'AB' : (m.obtained ?? '—'));
        });
      });
      row.push(`${r.total}/${r.maxTotal}`, r.showMetrics ? `${r.percentage}%` : '—', r.grade, resultLabel(r.resultStatus), r.overall_remark || '—');
      return row;
    });
  } else {
    headers = [['#', 'Roll No', 'Student Name', ...subjects.map(s => `${s.name}\n(Max:${s.max_marks})`), 'Total', '%', 'Grade', 'Result', 'Remark']];
   body = rows.map((r, i) => [
      i + 1, r.roll_no, (r.fee_status && r.fee_status !== 'active') ? `${r.name} (DEACTIVATED)` : r.name,
      ...subjects.map(s => {
        const m = getMarksForExport(r.marks, s.id, examType, false);
        if (m.is_absent) return 'AB';
        return m.obtained ?? '—';
      }),
      `${r.total}/${r.maxTotal}`, r.showMetrics ? `${r.percentage}%` : '—', r.grade, resultLabel(r.resultStatus), r.overall_remark || '—'
    ]);
  }
  const lastColIndex = (body[0]?.length || 1) - 1;

  autoTable(doc, {
    head: headers, body, startY: 42,
    styles: { fontSize: 7, cellPadding: 2, halign: 'center', overflow: 'linebreak' },
    headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold' },
    columnStyles: { 2: { halign: 'left', cellWidth: 28 }, [lastColIndex]: { halign: 'left', cellWidth: 35 } },
    alternateRowStyles: { fillColor: [241, 245, 249] },
    didParseCell: (data) => {
      if (data.section === 'body') {
        const val = data.cell.text[0];
        if (val === 'PASS') data.cell.styles.textColor = [22, 163, 74];
        if (val === 'FAIL') data.cell.styles.textColor = [220, 38, 38];
        if (val === 'PROMOTED (RTE)') { data.cell.styles.textColor = [217, 119, 6]; data.cell.styles.fontStyle = 'bold'; }
        if (val === 'AB') { data.cell.styles.textColor = [217, 119, 6]; data.cell.styles.fontStyle = 'bold'; }
        if (val === 'ABSENT') { data.cell.styles.textColor = [220, 38, 38]; data.cell.styles.fontStyle = 'bold'; }

        const rowData = rows[data.row.index];
        if (rowData && rowData.fee_status && rowData.fee_status !== 'active') {
          data.cell.styles.fillColor = [254, 240, 138];
        }
      }
    },
    margin: { left: 14, right: 14 }
  });

  // Grade legend at the bottom
  const legendY = doc.lastAutoTable.finalY + 6;
  doc.setFillColor(239, 246, 255); doc.setDrawColor(147, 197, 253); doc.setLineWidth(0.4);
  doc.roundedRect(14, legendY, pageW - 28, 10, 1.5, 1.5, 'FD');
  doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 64, 175);
  doc.text('Grade Scale:', 18, legendY + 6);
  doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 41, 59);
  const classIsRTE = isRTEProtectedClass(className);
  doc.text(
    `A+ (90-100%)   A (80-89%)   B+ (70-79%)   B (60-69%)   C (50-59%)   D (35-49%)   F (Below 35%)   |   Note: ${classIsRTE ? 'As per RTE policy, students are promoted even if they fail/are absent in a subject' : 'Absent in any subject counts as FAIL'}`,
    50, legendY + 6
  );

  await saveDocument(doc, `marksheet-${className.replace(/\s+/g, '_')}-${examType}.pdf`);
  toast.success('PDF downloaded!');
  setShowExport(false);
};

  const renderStudentDetails = (row) => {
    const regular = examTypes.map(e => String(e.name)).filter(n => !/annual|final/i.test(n));
    const cols = isFinalCumulative
      ? Array.from(new Set([...regular, ...examTypesFound.filter(n => /annual|final/i.test(n))]))
          .sort((a, b) => examOrderKey(a) - examOrderKey(b) || a.localeCompare(b))
      : [examType];

        const stats = cols.map(et => {
      let t = 0, mx = 0, conv = 0, any = false;
      subjects.forEach(s => {
        const m = row.marks[s.id]?.[et];
        if (!m) return;
        mx += parseFloat(m.max) || 0;
        if (m.is_absent) { any = true; return; }
        if (m.obtained !== null && m.obtained !== undefined && m.obtained !== '') {
          t += parseFloat(m.obtained);
          conv += (parseFloat(m.obtained) / (parseFloat(m.max) || 100)) * 100;
          any = true;
        }
      });
      return { t, mx, any, pct: subjects.length ? conv / subjects.length : 0 };
    });
    const examPassed = (et, i) => stats[i].any && subjects.every(s => {
      const m = row.marks[s.id]?.[et];
      return m && !m.is_absent && m.obtained !== null && m.obtained !== undefined && m.obtained !== '' && parseFloat(m.obtained) >= parseFloat(m.pass);
    });

    const filled = stats.filter(x => x.any && x.mx > 0);
    const overallPct = filled.length ? filled.reduce((a, x) => a + x.pct, 0) / filled.length : null;
    const attMatch = String(row.yearly_attendance || '').match(/(\d+)\s*\/\s*(\d+)/);
    const attText = attMatch && parseInt(attMatch[2], 10)
      ? `${((parseInt(attMatch[1], 10) / parseInt(attMatch[2], 10)) * 100).toFixed(1)}%`
      : '—';

    const resColor = row.resultStatus === 'PASS' ? '#16a34a' : row.resultStatus === 'PROMOTED' ? '#b45309' : '#dc2626';
    const chips = [
      { label: isFinalCumulative ? 'Overall %' : 'Percentage', value: overallPct !== null ? `${overallPct.toFixed(1)}%` : '—', color: '#1e40af' },
      { label: 'Result', value: resultLabel(row.resultStatus), color: resColor },
      { label: 'Grade', value: row.showMetrics ? row.grade : '—', color: '#6366f1' },
      ...(isFinalCumulative ? [{ label: 'Attendance', value: attText, color: '#0891b2' }] : [])
    ];

    const th = { padding: '10px 6px', textAlign: 'center', fontSize: '11px', fontWeight: 800, color: '#ffffff', letterSpacing: '0.3px' };
    const td = { padding: '7px 6px', textAlign: 'center', borderTop: '1px solid #e2e8f0' };

    return (
      <>
        {!restrictedView && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '8px', marginBottom: '12px' }}>
            {chips.map(c => (
              <div key={c.label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderLeft: `3px solid ${c.color}`, borderRadius: '8px', padding: '6px 10px' }}>
                <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 700 }}>{c.label}</div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: c.color }}>{c.value}</div>
              </div>
            ))}
          </div>
        )}

        <h4 className="mobile-section-title">▼ Exam-wise Marks</h4>
        <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', marginBottom: '14px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: '#1e40af', color: '#fff' }}>
                <th style={{ ...th, textAlign: 'left' }}>SUBJECT</th>
                {cols.map(et => <th key={et} style={th}>{String(et).toUpperCase()}</th>)}
              </tr>
            </thead>
            <tbody>
              {subjects.map((s, i) => (
                <tr key={s.id} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                  <td style={{ ...td, textAlign: 'left', fontWeight: 600, color: '#334155' }}>{s.name}</td>
                  {cols.map(et => {
                    const m = row.marks[s.id]?.[et];
                    if (!m) return <td key={et} style={{ ...td, color: '#cbd5e1' }}>—</td>;
                    if (m.is_absent) return <td key={et} style={{ ...td, color: '#d97706', fontWeight: 700 }}>AB</td>;
                    const failed = parseFloat(m.obtained) < parseFloat(m.pass);
                    return (
                      <td key={et} style={{ ...td, color: failed ? '#dc2626' : '#16a34a', fontWeight: 700 }}>
                        {m.obtained}<span style={{ color: '#94a3b8', fontWeight: 500, fontSize: '10px' }}>/{m.max}</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
              {!restrictedView && (
                <tr style={{ background: '#dbeafe' }}>
                  <td style={{ ...td, textAlign: 'left', fontWeight: 800, color: '#1e40af' }}>Total</td>
                  {stats.map((x, i) => <td key={cols[i]} style={{ ...td, fontWeight: 800, color: '#1e40af' }}>{x.any ? `${x.t}/${x.mx}` : '—'}</td>)}
                </tr>
              )}
              {!restrictedView && (
                <tr style={{ background: '#eff6ff' }}>
                  <td style={{ ...td, textAlign: 'left', fontWeight: 800, color: '#1e40af' }}>Percentage</td>
                  {stats.map((x, i) => <td key={cols[i]} style={{ ...td, fontWeight: 800, color: '#1e40af' }}>{x.any && x.mx > 0 ? `${x.pct.toFixed(1)}%` : '—'}</td>)}
                </tr>
              )}
              {!restrictedView && (
                <tr style={{ background: '#f8fafc' }}>
                  <td style={{ ...td, textAlign: 'left', fontWeight: 800, color: '#334155' }}>Result</td>
                  {cols.map((et, i) => (
                    <td key={et} style={{ ...td, fontWeight: 800, color: stats[i].any ? (examPassed(et, i) ? '#16a34a' : '#dc2626') : '#cbd5e1' }}>
                      {stats[i].any ? (examPassed(et, i) ? 'PASS' : 'FAIL') : '—'}
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </>
    );
  };

  const toggleStudentCard = (id) => {
    setExpandedStudentId(expandedStudentId === id ? null : id);
  };

  return (
    <AppLayout title="Marksheet Report" subtitle="View and export student marksheets">
      <style>{`
        .desktop-report-view { display: block; }
        .mobile-report-view { display: none; }

        @media (min-width: 0px) {
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
          {!restrictedView && (rows.length > 0 || (!isTeacher && !filters.class_id && filters.exam_type_id) || (!isTeacher && filters.class_id)) && (
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
              <select className="form-control" value={levelFilter} onChange={e => {
                const lvl = e.target.value;
                setLevelFilter(lvl);
                const sel = classes.find(c => c.id == filters.class_id);
                if (sel && (!lvl || levelOfClass(sel.name) !== lvl)) setFilters({...filters, class_id: ''});
              }}>
                <option value="">All Levels</option><option value="Pre-Primary">Pre-Primary</option><option value="Primary">Primary</option><option value="Secondary">Secondary</option>
              </select>
            )}
            {!isTeacher && (
              <select className="form-control" disabled={!levelFilter} value={filters.class_id} onChange={e => setFilters({...filters, class_id: e.target.value})}>
                <option value="">All Classes</option>
                {classes.filter(c => !levelFilter || levelOfClass(c.name) === levelFilter).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
            {isTeacher && classes.length > 1 && (
              <select className="form-control" value={filters.class_id} onChange={e => setFilters({...filters, class_id: e.target.value})}>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}{c.is_class_teacher ? ' (Class Teacher)' : ''}</option>)}
              </select>
            )}
            <select className="form-control" value={filters.exam_type_id} onChange={e => setFilters({...filters, exam_type_id: e.target.value})}>
              <option value="">Select Exam Type *</option>
              {examTypes.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              <option value="FINAL">Final Report</option>
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
            {restrictedView && (
              <div style={{background:'#eff6ff', border:'1px solid #bfdbfe', color:'#1e40af', padding:'10px 14px', borderRadius:'10px', fontSize:'12px', fontWeight:'600', marginBottom:'16px'}}>
                📝 Showing marks and grade for your assigned subject(s) only.
              </div>
            )}

            {!restrictedView && (
            <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(130px,1fr))', gap:'12px', marginBottom:'16px'}}>
              {[
                { label:'Total', value: allRows.length, color:'#1e40af', icon:'👥' },
                { label:'Passed', value: allRows.filter(r => r.resultStatus === 'PASS').length, color:'#10b981', icon:'✅' },
                { label:'Promoted (RTE)', value: allRows.filter(r => r.resultStatus === 'PROMOTED').length, color:'#f59e0b', icon:'⬆️' },
                { label:'Failed', value: allRows.filter(r => r.resultStatus === 'FAIL').length, color:'#ef4444', icon:'❌' },
                { label:'Average', value: allRows.length ? `${(allRows.reduce((a,r) => a+parseFloat(r.percentage),0)/allRows.length).toFixed(1)}%` : '0%', color:'#6366f1', icon:'📊' },
              ].map(s => (
                <div key={s.label} style={{background:'#fff', borderRadius:'12px', padding:'12px 14px', border:'1px solid #e2e8f0', borderLeft:`4px solid ${s.color}`}}>
                  <div style={{fontSize:'11px', color:'#64748b', fontWeight:'700'}}>{s.icon} {s.label}</div>
                  <div style={{fontSize:'22px', fontWeight:'800', color:'#1e293b', marginTop:'4px'}}>{s.value}</div>
                </div>
              ))}
            </div>
            )}

            <div className="mobile-report-view">
              {rows.map((row) => {
                const isOpen = expandedStudentId === row.id;
                return (
                  <div key={row.id} className="mobile-student-card">
                    <div className="mobile-card-header" onClick={() => toggleStudentCard(row.id)}>
                      <div className="mobile-header-top">
                        <h3 className="mobile-header-title">
                          {row.name} {row.roll_no ? `[${row.roll_no}]` : ''}
                          {row.fee_status && row.fee_status !== 'active' && (
                            <span style={{marginLeft:'8px', background:'#fee2e2', color:'#dc2626', padding:'2px 7px', borderRadius:'8px', fontSize:'10px', fontWeight:'800'}}>DEACTIVATED</span>
                          )}
                        </h3>
                        {!restrictedView && (
                        <span className="mobile-header-badge" style={{
                          background: row.resultStatus === 'PASS' ? '#dcfce7' : row.resultStatus === 'PROMOTED' ? '#fef3c7' : '#fee2e2',
                          color: row.resultStatus === 'PASS' ? '#16a34a' : row.resultStatus === 'PROMOTED' ? '#b45309' : '#dc2626'
                        }}>
                          Result: {resultLabel(row.resultStatus)}
                        </span>
                        )}
                      </div>
                      <div className="mobile-header-stats">
                        {!restrictedView && <div>Total: <strong>{row.total}/{row.maxTotal}</strong></div>}
                        {!restrictedView && <div>%: <strong>{row.showMetrics ? `${row.percentage}%` : '—'}</strong></div>}
                        <div>Grade: <strong>{row.showMetrics ? row.grade : '—'}</strong></div>
                      </div>
                    </div>

                    {isOpen && (
                      <div className="mobile-collapsible-content">
                        {renderStudentDetails(row)}

                        {!restrictedView && (<>
                        <div style={{fontSize:'13px', color:'#475569', marginBottom:'14px'}}>
                          <strong>Remark:</strong> <span style={{fontStyle: row.overall_remark ? 'normal' : 'italic'}}>{row.overall_remark || 'No remark added'}</span>
                        </div>

                        <button
                          onClick={() => exportFormatMarksheetPDF(row)}
                          style={{
                            width:'100%', background:'#1e40af', color:'#fff', border:'none',
                            padding:'10px', borderRadius:'8px', fontWeight:'700', fontSize:'13px',
                            display:'flex', alignItems:'center', justifyContent:'center', gap:'6px'
                          }}
                        >
                          📄 View Full Marksheet
                        </button>
                        </>)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="desktop-report-view">
              <div style={{background:'#fff', borderRadius:'14px', border:'1px solid #e2e8f0', overflow:'hidden', marginBottom:'16px'}}>
                <div className="table-wrapper" style={{ overflowX: 'auto', maxHeight: '500px', overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1000px' }}>
                    <thead>
                      <tr style={{ background: '#1e40af', color: '#ffffff' }}>
                        <th rowSpan={2} style={{ padding: '10px', fontSize: '11px', textAlign: 'center', border: '1px solid #cbd5e1', color: '#ffffff' }}>#</th>
                        <th rowSpan={2} style={{ padding: '10px', fontSize: '11px', textAlign: 'left', border: '1px solid #cbd5e1', color: '#ffffff' }}>ROLL NO</th>
                        <th rowSpan={2} style={{ padding: '10px', fontSize: '11px', textAlign: 'left', border: '1px solid #cbd5e1', minWidth: '150px', color: '#ffffff' }}>STUDENT NAME</th>
                        
                        {isFinalCumulative ? (
                          examTypesFound.map(etName => (
                            <th key={etName} colSpan={subjects.length} style={{ padding: '8px 6px', fontSize: '12px', fontWeight: '800', textAlign: 'center', border: '1px solid #cbd5e1', background: '#111827', color: '#ffffff', letterSpacing: '0.5px' }}>
                              {etName.toUpperCase()}
                            </th>
                          ))
                        ) : (
                          subjects.map(s => {
                            // Extract configuration details for the currently active exam context
                            const activeExamLabel = examType || 'Default';
                            const maxMarksValue = s.examMaxes && s.examMaxes[activeExamLabel] 
                              ? s.examMaxes[activeExamLabel] 
                              : (s.lastCalculatedMax || s.max_marks || 100);

                            return (
                              <th key={s.id} rowSpan={2} style={{ padding: '8px 6px', fontSize: '11px', textAlign: 'center', border: '1px solid #cbd5e1', color: '#ffffff' }}>
                                {s.name}<br/>
                                <span style={{ opacity: 0.8, fontSize: '10px', color: '#d1d5db', fontWeight: '500' }}>/{maxMarksValue}</span>
                              </th>
                            );
                          })
                        )}

                        {!restrictedView && <th rowSpan={2} style={{ padding: '10px', fontSize: '11px', textAlign: 'center', border: '1px solid #cbd5e1', color: '#ffffff' }}>TOTAL</th>}
                        {!restrictedView && <th rowSpan={2} style={{ padding: '10px', fontSize: '11px', textAlign: 'center', border: '1px solid #cbd5e1', color: '#ffffff' }}>%</th>}
                        <th rowSpan={2} style={{ padding: '10px', fontSize: '11px', textAlign: 'center', border: '1px solid #cbd5e1', color: '#ffffff' }}>GRADE</th>
                        {!restrictedView && <th rowSpan={2} style={{ padding: '10px', fontSize: '11px', textAlign: 'center', border: '1px solid #cbd5e1', color: '#ffffff' }}>RESULT</th>}
                        {!restrictedView && <th rowSpan={2} style={{ padding: '10px', fontSize: '11px', textAlign: 'left', border: '1px solid #cbd5e1', minWidth: '120px', color: '#ffffff' }}>REMARK</th>}
                        {!restrictedView && <th rowSpan={2} style={{ padding: '10px', fontSize: '11px', textAlign: 'center', border: '1px solid #cbd5e1', color: '#ffffff' }}>MARKSHEET</th>}
                      </tr>
                      
                      {isFinalCumulative && (
                        <tr style={{ background: '#1e293b', color: '#ffffff' }}>
                          {examTypesFound.map(etName => 
                            subjects.map(s => {
                              const maxForThisExam = s.examMaxes && s.examMaxes[etName] ? s.examMaxes[etName] : (s.max_marks || 100);
                              return (
                                <th key={`${etName}-${s.id}`} style={{ padding: '6px 4px', fontSize: '10px', textAlign: 'center', border: '1px solid #cbd5e1', fontWeight: '700', color: '#ffffff', background: '#334155' }}>
                                  {s.name}<br/>
                                  <span style={{ color: '#94a3b8', fontSize: '9px', fontWeight: '500' }}>/{maxForThisExam}</span>
                                </th>
                              );
                            })
                          )}
                        </tr>
                      )}
                    </thead>
                    <tbody>
                      {rows.map((row, i) => {
                        const isDeactivated = row.fee_status && row.fee_status !== 'active';
                        return (
                        <tr key={row.id} style={{ borderBottom: '1px solid #f1f5f9', background: isDeactivated ? '#fef2f2' : (i % 2 === 0 ? '#fff' : '#f8fafc'), opacity: isDeactivated ? 0.75 : 1 }}>
                          <td style={{ padding: '10px', fontSize: '12px', color: '#64748b', textAlign: 'center', border: '1px solid #e2e8f0' }}>{i + 1}</td>
                          <td style={{ padding: '10px', border: '1px solid #e2e8f0' }}>
                            <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', fontSize: '11px' }}>{row.roll_no}</code>
                          </td>
                          <td style={{ padding: '10px', fontWeight: '700', color: '#1e293b', border: '1px solid #e2e8f0' }}>
                            {row.name}
                            {isDeactivated && (
                              <span style={{marginLeft:'8px', background:'#fee2e2', color:'#dc2626', padding:'2px 7px', borderRadius:'8px', fontSize:'10px', fontWeight:'800'}}>DEACTIVATED</span>
                            )}
                          </td>
                          
                          {isFinalCumulative ? (
                            examTypesFound.map(etName => 
                              subjects.map(s => {
                                const m = row.marks[s.id]?.[etName];
                                if (!m) return <td key={`${etName}-${s.id}`} style={{ textAlign: 'center', color: '#cbd5e1', border: '1px solid #e2e8f0' }}>—</td>;
                                if (m.is_absent) return <td key={`${etName}-${s.id}`} style={{ textAlign: 'center', background: '#fef3c7', color: '#d97706', fontWeight: 'bold', border: '1px solid #e2e8f0', fontSize: '11px' }}>AB</td>;
                                const isFailedCell = parseFloat(m.obtained) < m.pass;
                                return (
                                  <td key={`${etName}-${s.id}`} style={{ textAlign: 'center', background: isFailedCell ? '#fee2e2' : '#f0fdf4', color: isFailedCell ? '#dc2626' : '#16a34a', fontWeight: '600', border: '1px solid #e2e8f0', fontSize: '12px' }}>
                                    {m.obtained}
                                  </td>
                                );
                              })
                            )
                          ) : (
                            subjects.map(s => {
                              const singleExamName = examTypes.find(e => e.id == filters.exam_type_id)?.name || '';
                              const m = row.marks[s.id]?.[singleExamName];
                              if (!m) return <td key={s.id} style={{ textAlign: 'center', color: '#94a3b8', border: '1px solid #e2e8f0' }}>—</td>;
                              if (m.is_absent) return <td key={s.id} style={{ textAlign: 'center', background: '#fef3c7', color: '#d97706', fontWeight: 'bold', border: '1px solid #e2e8f0' }}>AB</td>;
                              const isFailedCell = parseFloat(m.obtained) < m.pass;
                              return (
                                <td key={s.id} style={{ textAlign: 'center', background: isFailedCell ? '#fee2e2' : '#f0fdf4', color: isFailedCell ? '#dc2626' : '#16a34a', fontWeight: '700', border: '1px solid #e2e8f0' }}>
                                  {m.obtained}
                                </td>
                              );
                            })
                          )}

                          {!restrictedView && (<>
                          <td style={{ padding: '10px', textAlign: 'center', fontWeight: '800', color: '#1e40af', border: '1px solid #e2e8f0' }}>{row.total}/{row.maxTotal}</td>
                          <td style={{ padding: '10px', textAlign: 'center', border: '1px solid #e2e8f0' }}>
                            {row.showMetrics ? (
                              <span style={{ background: '#dcfce7', color: '#16a34a', padding: '2px 8px', borderRadius: '10px', fontSize: '12px', fontWeight: '700' }}>{row.percentage}%</span>
                            ) : (
                              <span style={{ background: '#fee2e2', color: '#dc2626', padding: '2px 8px', borderRadius: '10px', fontSize: '12px', fontWeight: '700' }}>—</span>
                            )}
                          </td>
                          </>)}
                          <td style={{ padding: '10px', textAlign: 'center', border: '1px solid #e2e8f0' }}>
                            {row.showMetrics ? (
                              <span style={{ background: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: '10px', fontSize: '12px', fontWeight: '800' }}>{row.grade}</span>
                            ) : (
                              <span style={{ background: '#f1f5f9', color: '#94a3b8', padding: '2px 8px', borderRadius: '10px', fontSize: '12px', fontWeight: '700' }}>—</span>
                            )}
                          </td>
                          {!restrictedView && (<>
                          <td style={{ padding: '10px', textAlign: 'center', border: '1px solid #e2e8f0' }}>
                            <span className={`badge ${row.resultStatus === 'PASS' ? 'badge-success' : row.resultStatus === 'PROMOTED' ? 'badge-warning' : 'badge-danger'}`} style={row.resultStatus === 'PROMOTED' ? { background: '#fef3c7', color: '#b45309' } : undefined}>{resultLabel(row.resultStatus)}</span>
                          </td>
                          <td style={{ padding: '10px', fontSize: '12px', color: '#64748b', border: '1px solid #e2e8f0', fontStyle: row.overall_remark ? 'normal' : 'italic' }}>{row.overall_remark || '—'}</td>
                          <td style={{ padding: '8px', textAlign: 'center', border: '1px solid #e2e8f0' }}>
                            <button onClick={() => exportFormatMarksheetPDF(row)} style={{ background: '#1e40af', color: '#fff', border: 'none', borderRadius: '6px', padding: '5px 10px', cursor: 'pointer', fontSize: '11px', fontWeight: '700' }}>📄 Marksheet</button>
                          </td>
                          </>)}
                        </tr>
                        );
                      })}
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
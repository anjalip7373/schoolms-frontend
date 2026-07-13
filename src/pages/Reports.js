import React, { useState, useEffect } from 'react';
import AppLayout from '../components/layout/AppLayout';
import API from '../utils/api';
import { toast } from 'react-toastify';
import { exportToExcel, exportToPDF } from '../utils/exportUtils';
import { useAuth } from '../context/AuthContext';

const Reports = () => {
  const { user } = useAuth();
  const isTeacher = user?.role === 'Teacher' || user?.role === 'teacher';
  const isAdmin = user?.role === 'admin';
  const isPrincipal = user?.role === 'principal';
  const isAdminOrPrincipal = isAdmin || isPrincipal;

  const [students, setStudents] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [fees, setFees] = useState([]);
  const [salary, setSalary] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [showExport, setShowExport] = useState(false);
  const [activeTab, setActiveTab] = useState('students');
  const [filters, setFilters] = useState({
    class_id: '',
    from_month: new Date().getMonth() + 1,
    from_year: new Date().getFullYear(),
    to_month: new Date().getMonth() + 1,
    to_year: new Date().getFullYear(),
  });

  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const years = []; for (let y = 2020; y <= new Date().getFullYear() + 1; y++) years.push(y);

  useEffect(() => {
    if (!isTeacher) API.get('/config/classes').then(r => setClasses(r.data));
  }, []);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const classParam = (!isTeacher && filters.class_id) ? { class_id: filters.class_id } : {};
      
      const [studRes, feeRes] = await Promise.all([
        API.get('/students', { params: { ...classParam, search } }).catch(() => ({ data: [] })),
        API.get('/fees/all-students-status', { params: {
          ...classParam,
          from_month: filters.from_month,
          from_year: filters.from_year,
          to_month: filters.to_month,
          to_year: filters.to_year,
        }}).catch(() => ({ data: [] })),
      ]);
      
      setStudents(studRes.data);
      setFees(feeRes.data);

      if (isAdminOrPrincipal) {
        const [empRes, salRes] = await Promise.all([
          API.get('/employees', { params: { role_type: 'employee' } }).catch(() => ({ data: [] })),
          API.get('/salary/all-employees-status', { params: {
            from_month: filters.from_month,
            from_year: filters.from_year,
            to_month: filters.to_month,
            to_year: filters.to_year,
          }}).catch(() => ({ data: [] })),
        ]); 
        setEmployees(empRes.data);
        setSalary(salRes.data);
      }
    } catch (err) {
      toast.error('Failed to load reports');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchReports(); }, [filters, search]);

  // Column definitions with full details for export
  const studentCols = [
    { key:'roll_no', label:'Roll No' },
    { key:'full_name', label:'Name' },
    { key:'class_name', label:'Class' },
    { key:'phone', label:'Phone' },
    { key:'whatsapp_no', label:'WhatsApp' },
    { key:'email', label:'Email' },
    { key:'date_of_birth', label:'Date of Birth' },
    { key:'fee_status', label:'Fee Status' },
    { key:'address', label:'Address' },
  ];

  const feeCols = [
    { key:'roll_no', label:'Roll No' },
    { key:'full_name', label:'Student Name' },
    { key:'class_name', label:'Class' },
    { key:'fee_types_paid', label:'Fee Types Paid' },
    { key:'paid_amount', label:'Amount Paid (Rs.)' },
    { key:'last_payment_date', label:'Last Payment Date' },
    { key:'payment_method', label:'Payment Method' },
    { key:'fee_status', label:'Status' },
  ];
  

  const employeeCols = [
    { key:'emp_id', label:'Emp ID' },
    { key:'full_name', label:'Name' },
    { key:'role_name', label:'Role' },
    { key:'login_user_id', label:'User ID' },
    { key:'phone', label:'Phone' },
    { key:'qualification', label:'Qualification' },
    { key:'subject', label:'Subject' },
    { key:'salary', label:'Salary (Rs.)' },
    { key:'joining_date', label:'Joining Date' },
    { key:'is_active', label:'Status' },
  ];

  const salaryCols = [
    { key:'emp_id', label:'Emp ID' },
    { key:'full_name', label:'Employee Name' },
    { key:'role_name', label:'Role' },
    { key:'slip_no', label:'Slip No' },
    { key:'salary_month', label:'Salary Month' },
    { key:'basic_salary', label:'Basic Salary (Rs.)' },
    { key:'deductions', label:'Deductions (Rs.)' },
    { key:'net_salary', label:'Net Salary (Rs.)' },
    { key:'payment_status', label:'Status' },
  ];

  const getActiveConfig = () => {
    if (activeTab === 'students') return { data: students, cols: studentCols, title: 'Student Report' };
    if (activeTab === 'fees') return { data: fees, cols: feeCols, title: 'Fee Payment Report' };
    if (activeTab === 'employees') return { data: employees, cols: employeeCols, title: 'Employee Report' };
    if (activeTab === 'salary') return { data: salary, cols: salaryCols, title: 'Salary Report' };
    return { data: [], cols: [], title: '' };
  };

  const { data: activeData, cols: activeCols, title: activeTitle } = getActiveConfig();

  const filteredData = activeData.filter(r =>
    !search ||
    r.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    r.roll_no?.toLowerCase().includes(search.toLowerCase()) ||
    r.emp_id?.toLowerCase().includes(search.toLowerCase())
  );

  // Format data for export — make all values readable
  const formatForExport = (data, cols) => data.map(row => {
    const formatted = {};
    cols.forEach(col => {
      let val = row[col.key];
      if (col.key === 'is_active') val = val ? 'Active' : 'Inactive';
      else if (col.key === 'payment_date' || col.key === 'joining_date') val = val?.split('T')[0] || '';
      else if (col.key === 'date_of_birth') val = val?.split('T')[0] || '';
      else if (col.key === 'amount' || col.key === 'net_salary' || col.key === 'basic_salary' || col.key === 'deductions' || col.key === 'salary') val = parseFloat(val || 0).toLocaleString();
      else if (col.key === 'status' && activeTab === 'fees') val = 'Paid';
      else val = val || '';
      formatted[col.label] = val;
    });
    return formatted;
  });

  // Change this if your actual column name differs (see SQL check above)
 const DEACTIVATION_DATE_FIELD = 'deactivated_date';

const isRowDeactivated = (row) => {
  if (activeTab === 'employees' || activeTab === 'salary') {
    return row.is_active === false || row.is_active === 0;
  }
  if (activeTab === 'students') {
    return row.fee_status === 'inactive';
  }
  if (activeTab === 'fees') {
    return row.student_status === 'inactive';
  }
  return false;
};

const getExportRows = (data) => {
  const periodFromYM = Number(filters.from_year) * 12 + Number(filters.from_month);
  const periodToYM = Number(filters.to_year) * 12 + Number(filters.to_month);
  const rows = [];
  const highlightRows = [];

  data.forEach(row => {
    let include = true;
    let highlight = false;

    if (isRowDeactivated(row)) {
      const rawDate = row[DEACTIVATION_DATE_FIELD];
      if (rawDate) {
        const d = new Date(rawDate);
        const deactYM = d.getFullYear() * 12 + (d.getMonth() + 1);
        if (deactYM < periodFromYM) include = false;
        else if (deactYM <= periodToYM) highlight = true;
      } else {
        highlight = true;
      }
    }

    if (include) {
      if (highlight) highlightRows.push(rows.length);
      rows.push(row);
    }
  });

  return { rows, highlightRows };
};

  const renderCell = (row, col) => {
    switch(col.key) {
      case 'roll_no': case 'emp_id': case 'slip_no': case 'receipt_no':
        return <code style={{fontFamily:'JetBrains Mono', fontSize:'11px', background:'#f1f5f9', padding:'2px 6px', borderRadius:'4px'}}>{row[col.key] || '—'}</code>;
      case 'fee_status':
        return <span className={"badge " + (row[col.key] === 'Paid' ? 'badge-success' : 'badge-danger')}>{row[col.key]}</span>;
      case 'payment_status':
        return <span className={"badge " + (
          row[col.key] === 'paid' ? 'badge-success' :
          row[col.key] === 'generated' ? 'badge-warning' : 'badge-danger'
        )}>{row[col.key] === 'not_generated' ? 'Not Generated' : row[col.key]}</span>;
      case 'status':
        return <span className={"badge " + (row[col.key] === 'paid' ? 'badge-success' : 'badge-warning')}>{row[col.key]}</span>;
      case 'is_active':
        return <span className={"badge " + (row[col.key] ? 'badge-success' : 'badge-danger')}>{row[col.key] ? 'Active' : 'Inactive'}</span>;
      case 'paid_amount': case 'net_salary': case 'basic_salary': case 'deductions': case 'salary':
        return row[col.key] ? `Rs. ${parseFloat(row[col.key] || 0).toLocaleString()}` : '—';
      case 'payment_date': case 'joining_date': case 'date_of_birth': case 'last_payment_date':
        return row[col.key]?.split('T')[0] || '—';
      case 'remarks':
        return row[col.key] || <span style={{color:'#94a3b8', fontSize:'12px'}}>—</span>;
      default:
        return row[col.key] || '—';
    }
  };

  const periodLabel = `${months[filters.from_month-1]} ${filters.from_year} to ${months[filters.to_month-1]} ${filters.to_year}`;

  return (
    <AppLayout title="Reports" subtitle="Comprehensive school reports">
      <div className="page-header">
        <div><h1>Reports</h1><p>{filteredData.length} records • {periodLabel}</p></div>
        <div className="dropdown-export">
          <button className="btn btn-primary" onClick={() => setShowExport(!showExport)}>📤 Export ▾</button>
          {showExport && (
            <div className="dropdown-menu">
              <button className="dropdown-item" onClick={() => {
  const { rows, highlightRows } = getExportRows(filteredData);
  const exportData = formatForExport(rows, activeCols);
  exportToExcel(exportData, activeCols, `${activeTab}-report-${periodLabel}`, highlightRows);
  setShowExport(false);
}}>📊 Excel (.xlsx)</button>

<button className="dropdown-item" onClick={() => {
  const { rows, highlightRows } = getExportRows(filteredData);
  const exportData = formatForExport(rows, activeCols);
  exportToPDF(exportData, activeCols, `${activeTab}-report-${periodLabel}`, `${activeTitle} — ${periodLabel}`, highlightRows);
  setShowExport(false);
}}>📄 PDF</button>
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div style={{background:'#fff', padding:'16px 20px', borderRadius:'12px', marginBottom:'20px', border:'1px solid #e2e8f0'}}>
        <div className="filter-bar" style={{marginBottom:'12px', flexWrap:'wrap', alignItems:'center'}}>
          {!isTeacher && (
            <select className="form-control" value={filters.class_id} onChange={e => setFilters({...filters, class_id: e.target.value})}>
              <option value="">All Classes</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}

          {/* From date */}
          <div style={{display:'flex', alignItems:'center', gap:'6px'}}>
            <span style={{fontSize:'12px', fontWeight:'700', color:'#64748b', whiteSpace:'nowrap'}}>FROM</span>
            <select className="form-control" value={filters.from_month} onChange={e => setFilters({...filters, from_month: e.target.value})}>
              {months.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
            </select>
            <select className="form-control" value={filters.from_year} onChange={e => setFilters({...filters, from_year: e.target.value})}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          {/* To date */}
          <div style={{display:'flex', alignItems:'center', gap:'6px'}}>
            <span style={{fontSize:'12px', fontWeight:'700', color:'#64748b', whiteSpace:'nowrap'}}>TO</span>
            <select className="form-control" value={filters.to_month} onChange={e => setFilters({...filters, to_month: e.target.value})}>
              {months.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
            </select>
            <select className="form-control" value={filters.to_year} onChange={e => setFilters({...filters, to_year: e.target.value})}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          {isTeacher && (
            <div style={{background:'#dbeafe', padding:'6px 14px', borderRadius:'8px', fontSize:'13px', fontWeight:'600', color:'#1e40af'}}>
              📚 Showing your class only
            </div>
          )}
        </div>
        <input className="form-control" placeholder="🔍 Search by name, roll no, emp id..." value={search} onChange={e => setSearch(e.target.value)} style={{maxWidth:'400px'}} />
      </div>

      {/* Tabs */}
      <div style={{display:'flex', gap:'8px', marginBottom:'16px', flexWrap:'wrap'}}>
        <button className={"btn btn-sm " + (activeTab === 'students' ? 'btn-primary' : 'btn-outline')} onClick={() => setActiveTab('students')}>
          👨‍🎓 Students
        </button>
        <button className={"btn btn-sm " + (activeTab === 'fees' ? 'btn-primary' : 'btn-outline')} onClick={() => setActiveTab('fees')}>
          💰 Fee Payments
        </button>
        {isAdminOrPrincipal && (
          <>
            <button className={"btn btn-sm " + (activeTab === 'employees' ? 'btn-primary' : 'btn-outline')} onClick={() => setActiveTab('employees')}>
              👨‍💼 Employees
            </button>
            <button className={"btn btn-sm " + (activeTab === 'salary' ? 'btn-primary' : 'btn-outline')} onClick={() => setActiveTab('salary')}>
              💵 Salary
            </button>
          </>
        )}
      </div>

      <div className="card">
        <div className="table-wrapper">
          {loading ? <div className="loading"><div className="spinner"></div></div> : (
            <table className="reports-table">
              <thead>
                <tr>{activeCols.map(c => <th key={c.key}>{c.label}</th>)}</tr>
              </thead>
              <tbody>
                {filteredData.map((row, i) => (
                  <tr key={i}>
                    {activeCols.map(c => (
                      <td key={c.key} data-label={c.label}>{renderCell(row, c)}</td>
                    ))}
                  </tr>
                ))}
                {!filteredData.length && !loading && (
                  <tr>
                    <td colSpan={activeCols.length}>
                      <div className="empty-state">
                        <div className="empty-icon">📑</div>
                        <p>No data found</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AppLayout>
  );
};

export default Reports;
import React, { useState, useEffect } from 'react';
import AppLayout from '../components/layout/AppLayout';
import API from '../utils/api';
import { toast } from 'react-toastify';
import { exportToExcel, exportToPDF } from '../utils/exportUtils';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// Academic years run April -> March. Build a dropdown list e.g. "2026-2027"
const buildAcademicYears = () => {
  const now = new Date();
  const currentStartYear = (now.getMonth() + 1) >= 4 ? now.getFullYear() : now.getFullYear() - 1;
  const years = [];
  for (let y = currentStartYear + 1; y >= 2020; y--) {
    years.push(`${y}-${y + 1}`);
  }
  return { years, currentAcademicYear: `${currentStartYear}-${currentStartYear + 1}` };
};

const buildYearOptions = () => {
  const years = [];
  for (let y = 2020; y <= new Date().getFullYear() + 1; y++) years.push(y);
  return years;
};

const Audit = () => {
  const { years: academicYears, currentAcademicYear } = buildAcademicYears();
  const yearOptions = buildYearOptions();

  const [academicYear, setAcademicYear] = useState(currentAcademicYear);

  // Custom date range — overrides academicYear when all 4 are set
  const [fromMonth, setFromMonth] = useState('');
  const [fromYear, setFromYear] = useState('');
  const [toMonth, setToMonth] = useState('');
  const [toYear, setToYear] = useState('');

  const [feeTypes, setFeeTypes] = useState([]);
  const [bills, setBills] = useState([]);
  const [grandTotal, setGrandTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showExport, setShowExport] = useState(false);

  const hasCustomRange = fromMonth && fromYear && toMonth && toYear;

  const fetchAudit = async () => {
    setLoading(true);
    try {
      const params = hasCustomRange
        ? { from_month: fromMonth, from_year: fromYear, to_month: toMonth, to_year: toYear }
        : { academic_year: academicYear };
      const { data } = await API.get('/fees/audit', { params });
      setFeeTypes(data.fee_types || []);
      setBills(data.bills || []);
      setGrandTotal(data.grand_total || 0);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load audit data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAudit(); }, [academicYear, fromMonth, fromYear, toMonth, toYear]);

  const clearCustomRange = () => {
    setFromMonth(''); setFromYear(''); setToMonth(''); setToYear('');
  };

  const handleAcademicYearChange = (val) => {
    setAcademicYear(val);
    clearCustomRange();
  };

  // Used during render to only show the date on the first bill of each date (merged-cell look)
  let lastDate = null;

  const periodLabel = hasCustomRange
    ? `${MONTHS[fromMonth - 1]} ${fromYear} to ${MONTHS[toMonth - 1]} ${toYear}`
    : academicYear;

  // Export columns: Date, Class, Bill No, one column per fee type, Total
  const auditCols = [
    { key: 'date', label: 'Date' },
    { key: 'class_name', label: 'Class' },
    { key: 'bill_no', label: 'Bill No' },
    ...feeTypes.map(ft => ({ key: ft, label: ft })),
    { key: 'total', label: 'Total (Rs.)' },
  ];

  const buildExportRows = () => {
    const rows = bills.map(b => {
      const row = {};
      row['Date'] = b.payment_date?.split('T')[0] || '';
      row['Class'] = b.class_name || '-';
      row['Bill No'] = b.bill_no;
      feeTypes.forEach(ft => {
        row[ft] = b.fees[ft] ? `Rs. ${parseFloat(b.fees[ft]).toLocaleString()}` : '-';
      });
      row['Total (Rs.)'] = `Rs. ${parseFloat(b.total).toLocaleString()}`;
      return row;
    });

    // Append a Grand Total summary row
    if (bills.length) {
      const totalRow = {};
      totalRow['Date'] = '';
      totalRow['Class'] = '';
      totalRow['Bill No'] = 'GRAND TOTAL';
      feeTypes.forEach(ft => { totalRow[ft] = ''; });
      totalRow['Total (Rs.)'] = `Rs. ${parseFloat(grandTotal).toLocaleString()}`;
      rows.push(totalRow);
    }
    return rows;
  };

  return (
    <AppLayout title="Fee Audit" subtitle="Full academic year fee payments — grouped by date and bill no">
      <div className="page-header">
        <div>
          <h1>Fee Audit</h1>
          <p>{bills.length} bill(s) • {periodLabel}</p>
        </div>
        <div className="dropdown-export">
          <button className="btn btn-primary" onClick={() => setShowExport(!showExport)}>📤 Export ▾</button>
          {showExport && (
            <div className="dropdown-menu">
              <button className="dropdown-item" onClick={() => {
                if (!bills.length) { toast.error('No data to export'); return; }
                exportToExcel(buildExportRows(), auditCols, `fee-audit-${periodLabel}`);
                setShowExport(false);
              }}>📊 Excel (.xlsx)</button>
              <button className="dropdown-item" onClick={() => {
                if (!bills.length) { toast.error('No data to export'); return; }
                exportToPDF(buildExportRows(), auditCols, `fee-audit-${periodLabel}`, `Fee Audit Report — ${periodLabel}`);
                setShowExport(false);
              }}>📄 PDF</button>
            </div>
          )}
        </div>
      </div>

      <div className="filter-bar" style={{ marginBottom: '20px', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-end' }}>
        <div>
          <label style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px' }}>
            Academic Year
          </label>
          <select
            className="form-control"
            style={{ maxWidth: '220px' }}
            value={academicYear}
            onChange={e => handleAcademicYearChange(e.target.value)}
            disabled={hasCustomRange}
          >
            {academicYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        <div>
          <label style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px' }}>
            From
          </label>
          <div style={{ display: 'flex', gap: '6px' }}>
            <select className="form-control" value={fromMonth} onChange={e => setFromMonth(e.target.value)}>
              <option value="">Month</option>
              {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
            <select className="form-control" value={fromYear} onChange={e => setFromYear(e.target.value)}>
              <option value="">Year</option>
              {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px' }}>
            To
          </label>
          <div style={{ display: 'flex', gap: '6px' }}>
            <select className="form-control" value={toMonth} onChange={e => setToMonth(e.target.value)}>
              <option value="">Month</option>
              {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
            <select className="form-control" value={toYear} onChange={e => setToYear(e.target.value)}>
              <option value="">Year</option>
              {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>

        {hasCustomRange && (
          <button className="btn btn-outline btn-sm" onClick={clearCustomRange}>
            ✕ Clear custom range
          </button>
        )}
      </div>

      <div className="card">
        {loading ? (
          <div className="loading"><div className="spinner"></div></div>
        ) : (
          <>
            {/* Desktop: table view */}
            <div className="desktop-table-view">
             <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Class</th>
                    <th>Bill No</th>
                    {feeTypes.map(ft => <th key={ft}>{ft}</th>)}
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {bills.map(b => {
                    const dateStr = b.payment_date?.split('T')[0];
                    const showDate = dateStr !== lastDate;
                    lastDate = dateStr;
                    return (
                      <tr key={b.bill_no}>
                        <td style={{ fontWeight: showDate ? 700 : 400 }}>
                          {showDate ? dateStr : ''}
                        </td>
                        <td>{b.class_name || '-'}</td>
                        <td>
                          <code style={{ fontFamily: 'JetBrains Mono', fontSize: '12px', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>
                            {b.bill_no}
                          </code>
                        </td>
                        {feeTypes.map(ft => (
                          <td key={ft}>
                            {b.fees[ft] ? `Rs. ${parseFloat(b.fees[ft]).toLocaleString()}` : '-'}
                          </td>
                        ))}
                        <td><strong style={{ color: '#16a34a' }}>Rs. {parseFloat(b.total).toLocaleString()}</strong></td>
                      </tr>
                    );
                  })}
                  {!bills.length && (
                    <tr>
                      <td colSpan={4 + feeTypes.length}>
                        <div className="empty-state">
                          <div className="empty-icon">💰</div>
                          <p>No fee payments found for this period</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
                {bills.length > 0 && (
                  <tfoot>
                    <tr style={{ background: '#f8fafc' }}>
                      <td colSpan={3 + feeTypes.length} style={{ textAlign: 'right', padding: '12px', fontWeight: 800 }}>
                        Grand Total
                      </td>
                      <td style={{ padding: '12px', fontWeight: 800, color: '#1e40af' }}>
                        Rs. {parseFloat(grandTotal).toLocaleString()}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
             </div>
            </div>

            {/* Mobile: card view */}
            <div className="mobile-card-list" style={{ padding: bills.length ? '16px' : '0' }}>
              {bills.map(b => {
                const dateStr = b.payment_date?.split('T')[0];
                return (
                  <div className="data-card" key={b.bill_no}>
                    <div className="data-card-row">
                      <span className="dc-label">Date</span>
                      <span className="dc-value"><strong>{dateStr}</strong></span>
                    </div>
                    <div className="data-card-row">
                      <span className="dc-label">Class</span>
                      <span className="dc-value">{b.class_name || '-'}</span>
                    </div>
                    <div className="data-card-row">
                      <span className="dc-label">Bill No</span>
                      <span className="dc-value">
                        <code style={{ fontFamily: 'JetBrains Mono', fontSize: '12px', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>
                          {b.bill_no}
                        </code>
                      </span>
                    </div>
                    {feeTypes.map(ft => (
                      <div className="data-card-row" key={ft}>
                        <span className="dc-label">{ft}</span>
                        <span className="dc-value">
                          {b.fees[ft] ? `Rs. ${parseFloat(b.fees[ft]).toLocaleString()}` : '-'}
                        </span>
                      </div>
                    ))}
                    <div className="data-card-row">
                      <span className="dc-label">Total</span>
                      <span className="dc-value"><strong style={{ color: '#16a34a' }}>Rs. {parseFloat(b.total).toLocaleString()}</strong></span>
                    </div>
                  </div>
                );
              })}
              {!bills.length && (
                <div className="empty-state">
                  <div className="empty-icon">💰</div>
                  <p>No fee payments found for this period</p>
                </div>
              )}
              {bills.length > 0 && (
                <div className="data-card" style={{ background: '#f8fafc', border: '1px solid #1e40af' }}>
                  <div className="data-card-row" style={{ borderBottom: 'none' }}>
                    <span className="dc-label" style={{ fontSize: '13px' }}>Grand Total</span>
                    <span className="dc-value"><strong style={{ color: '#1e40af', fontSize: '15px' }}>Rs. {parseFloat(grandTotal).toLocaleString()}</strong></span>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
};

export default Audit;
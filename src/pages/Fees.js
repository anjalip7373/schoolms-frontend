import React, { useState, useEffect, useRef } from 'react';
import AppLayout from '../components/layout/AppLayout';
import API from '../utils/api';
import { toast } from 'react-toastify';
import { shareOnWhatsApp } from '../utils/exportUtils';
import { useReactToPrint } from 'react-to-print';

const FeeReceipt = React.forwardRef(({ receipt }, ref) => (
  <div ref={ref} style={{padding:'32px', fontFamily:'Plus Jakarta Sans, sans-serif', maxWidth:'600px', margin:'0 auto', background: '#fff'}}>
    <div style={{textAlign:'center', borderBottom:'2px solid #1e40af', paddingBottom:'16px', marginBottom:'20px'}}>
      <h1 style={{fontSize:'22px', fontWeight:'800', color:'#1e40af'}}>🏫 SchoolMS</h1>
      <p style={{fontSize:'13px', color:'#64748b'}}>Fee Payment Receipt</p>
    </div>
    <div style={{display:'flex', justifyContent:'space-between', marginBottom:'16px'}}>
      <div><strong>Receipt No:</strong> {receipt?.receipt_no}</div>
      <div><strong>Date:</strong> {receipt?.payment_date?.split('T')[0]}</div>
    </div>
    <table style={{width:'100%', borderCollapse:'collapse', marginBottom:'20px'}}>
      <tbody>
        {[
          ['Student Name', receipt?.full_name],
          ['Roll No', receipt?.roll_no],
          ['Class', receipt?.class_name],
          ['Fee Type', receipt?.fee_type_name],
          ['Month', receipt?.payment_month],
          ['Payment Method', receipt?.payment_method || '—'],
          ['Amount', `Rs. ${receipt?.amount}`]
        ].map(([k, v]) => (
          <tr key={k}>
            <td style={{padding:'8px', borderBottom:'1px solid #e2e8f0', color:'#64748b', width:'40%'}}>{k}</td>
            <td style={{padding:'8px', borderBottom:'1px solid #e2e8f0', fontWeight:'600'}}>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
    <div style={{background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:'8px', padding:'16px', textAlign:'center'}}>
      <div style={{fontSize:'24px', fontWeight:'800', color:'#16a34a'}}>Rs. {receipt?.amount}</div>
      <div style={{fontSize:'12px', color:'#64748b'}}>Amount Received</div>
    </div>
  </div>
));

const emptyForm = { student_id: '', fee_type_id: '', amount: '', payment_date: new Date().toISOString().split('T')[0], payment_month: '', payment_method: 'Cash', class_id: '', remarks: '' };

const Fees = () => {
  const [payments, setPayments] = useState([]);
  const [students, setStudents] = useState([]);
  const [allStudents, setAllStudents] = useState([]);
  const [feeTypes, setFeeTypes] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const receiptRef = useRef();

  // ─── NEW BLOB DOWNLOAD LOGIC FOR ANDROID WEBVIEW BYPASS ───
  const downloadReceiptPDFDirectly = () => {
    try {
      const htmlContent = `
        <html>
          <head>
            <title>Fee-Receipt-${receipt?.receipt_no || 'Receipt'}</title>
            <style>
              body { font-family: 'Plus Jakarta Sans', sans-serif; padding: 20px; color: #1e293b; }
              .card { max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; padding: 24px; border-radius: 8px; }
              .header { text-align: center; border-bottom: 2px solid #1e40af; padding-bottom: 12px; margin-bottom: 16px; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
              td { padding: 10px; border-bottom: 1px solid #e2e8f0; }
              .total-box { background: #f0fdf4; padding: 16px; text-align: center; border-radius: 6px; font-size: 20px; font-weight: bold; color: #16a34a; }
            </style>
          </head>
          <body>
            <div class="card">
              <div class="header">
                <h1 style="color:#1e40af;margin:0;">🏫 SchoolMS</h1>
                <p style="color:#64748b;margin:4px 0 0;">Fee Payment Receipt</p>
              </div>
              <table>
                <tr><td>Receipt No</td><td><strong>${receipt?.receipt_no || ''}</strong></td></tr>
                <tr><td>Student Name</td><td><strong>${receipt?.full_name || ''}</strong></td></tr>
                <tr><td>Roll No</td><td>${receipt?.roll_no || ''}</td></tr>
                <tr><td>Class</td><td>${receipt?.class_name || ''}</td></tr>
                <tr><td>Fee Type</td><td>${receipt?.fee_type_name || ''}</td></tr>
                <tr><td>Month</td><td>${receipt?.payment_month || ''}</td></tr>
                <tr><td>Amount</td><td><strong>Rs. ${receipt?.amount || '0'}</strong></td></tr>
              </table>
              <div class="total-box">Rs. ${receipt?.amount || '0'}</div>
            </div>
            <script>window.onload = function() { window.print(); }</script>
          </body>
        </html>
      `;

      const blob = new Blob([htmlContent], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Fee-Receipt-${receipt?.receipt_no || 'Receipt'}.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success("Receipt generated successfully!");
    } catch (err) {
      toast.error("Receipt generation failed");
    }
  };

  const fetchAll = async () => {
    setLoading(true);
    try {
      const params = {}; if (search) params.search = search;
      const [paymentsRes, studentsRes, feeTypesRes, classesRes] = await Promise.all([
        API.get('/fees', { params }), API.get('/students'), API.get('/config/fee-types'), API.get('/config/classes')
      ]);
      setPayments(paymentsRes.data);
      setAllStudents(studentsRes.data);
      setStudents(studentsRes.data);
      setFeeTypes(feeTypesRes.data);
      setClasses(classesRes.data);
    } catch (err) { toast.error('Failed to load data'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchAll(); }, [search]);

  useEffect(() => {
    if (form.class_id) {
      setStudents(allStudents.filter(s => s.class_id == form.class_id));
      setForm(f => ({ ...f, student_id: '' }));
    } else { setStudents(allStudents); }
  }, [form.class_id, allStudents]);

  const viewReceipt = async (id) => {
    try {
      const { data } = await API.get(`/fees/receipt/${id}`);
      setReceipt(data);
      setShowReceipt(true);
    } catch (err) { toast.error('Failed to load receipt'); }
  };

  return (
    <AppLayout title="Fee Payment" subtitle="Manage student fee payments">
      <div className="page-header">
        <h1>Fee Payments</h1>
      </div>
      <div className="filter-bar">
        <input className="form-control" placeholder="🔍 Search..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="card"><div className="table-wrapper">
        <table>
          <thead><tr><th>Receipt No</th><th>Student</th><th>Class</th><th>Amount</th><th>Actions</th></tr></thead>
          <tbody>
            {payments.map(p => (
              <tr key={p.id}>
                <td>{p.receipt_no}</td>
                <td>{p.full_name}</td>
                <td>{p.class_name}</td>
                <td>Rs. {parseFloat(p.amount).toLocaleString()}</td>
                <td><button className="btn btn-outline btn-sm" onClick={() => viewReceipt(p.id)}>👁️ View</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div></div>

      {showReceipt && receipt && (
        <div className="modal-overlay" onClick={() => setShowReceipt(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>🧾 Fee Receipt</h2>
              <div style={{display:'flex', gap:'8px'}}>
                <button className="btn btn-primary btn-sm" onClick={downloadReceiptPDFDirectly}>📥 Download File</button>
                <button className="modal-close" onClick={() => setShowReceipt(false)}>✕</button>
              </div>
            </div>
            <FeeReceipt receipt={receipt} />
          </div>
        </div>
      )}
    </AppLayout>
  );
};

export default Fees;
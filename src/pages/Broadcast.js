import React, { useState, useEffect } from 'react';
import AppLayout from '../components/layout/AppLayout';
import API from '../utils/api';
import { toast } from 'react-toastify';
import { useAuth } from '../context/AuthContext';

const cleanPhone = (phone) => {
  if (!phone) return null;
  let cleaned = phone.toString().replace(/[\s\-\(\)\+]/g, '');
  if (cleaned.startsWith('0')) cleaned = '91' + cleaned.slice(1);
  if (!cleaned.startsWith('91') && cleaned.length === 10) cleaned = '91' + cleaned;
  return cleaned;
};

const Broadcast = () => {
  const { user } = useAuth();
  const [broadcasts, setBroadcasts] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    title: '',
    message: '',
    target_type: 'all',
    target_class_id: ''
  });
  const [sentResult, setSentResult] = useState(null);
  const [whatsappProgress, setWhatsappProgress] = useState({ current: 0, total: 0 });

  useEffect(() => {
    fetchBroadcasts();
    API.get('/config/classes').then(r => setClasses(r.data));
  }, []);

  const fetchBroadcasts = async () => {
    setLoading(true);
    try {
      const { data } = await API.get('/broadcasts');
      setBroadcasts(data);
    } catch (err) { toast.error('Failed to load broadcasts'); }
    finally { setLoading(false); }
  };

  // ─── FETCH RECIPIENTS WITH PHONE NUMBERS ─────────────────────
  const fetchRecipientsWithPhone = async () => {
    let recipients = [];
    try {
      if (form.target_type === 'all') {
        const [stuRes, empRes] = await Promise.all([
          API.get('/students'),
          API.get('/employees'),
        ]);
        const students = (stuRes.data || []).map(s => ({ ...s, type: 'student' }));
        const employees = (empRes.data || []).map(e => ({ ...e, type: 'employee' }));
        recipients = [...students, ...employees];
      } else if (form.target_type === 'students') {
        const { data } = await API.get('/students');
        recipients = (data || []).map(s => ({ ...s, type: 'student' }));
      } else if (form.target_type === 'employees') {
        const { data } = await API.get('/employees');
        recipients = (data || []).map(e => ({ ...e, type: 'employee' }));
      } else if (form.target_type === 'class') {
        const { data } = await API.get('/students', { params: { class_id: form.target_class_id } });
        recipients = (data || []).map(s => ({ ...s, type: 'student' }));
      }
    } catch (err) {
      toast.error('Failed to fetch recipients');
    }
    return recipients;
  };

  // ─── SEND VIA EMAIL ──────────────────────────────────────────
  const handleSendEmail = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) { toast.error('Please enter a title'); return; }
    if (!form.message.trim()) { toast.error('Please enter a message'); return; }
    if (form.target_type === 'class' && !form.target_class_id) {
      toast.error('Please select a class'); return;
    }
    setSending(true);
    setSentResult(null);
    try {
      const { data } = await API.post('/broadcasts', form);
      setSentResult({ ...data, channel: 'email' });
      toast.success(data.message);
      setForm({ title: '', message: '', target_type: 'all', target_class_id: '' });
      fetchBroadcasts();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send broadcast');
    } finally { setSending(false); }
  };

  // ─── SEND VIA WHATSAPP ───────────────────────────────────────
  const handleSendWhatsApp = async () => {
  if (!form.title.trim()) { toast.error('Please enter a title'); return; }
  if (!form.message.trim()) { toast.error('Please enter a message'); return; }
  if (form.target_type === 'class' && !form.target_class_id) {
    toast.error('Please select a class'); return;
  }

  setSendingWhatsApp(true);
  setSentResult(null);
  try {
    const { data } = await API.post('/broadcasts/whatsapp', form);
    setSentResult({ channel: 'whatsapp', sent_count: data.sent_count, skipped: data.skipped });
    toast.success(`✅ WhatsApp broadcast sent to ${data.sent_count} recipients!`);
    if (data.skipped > 0) toast.warn(`⚠️ ${data.skipped} skipped — no phone number`);
    setForm({ title: '', message: '', target_type: 'all', target_class_id: '' });
    fetchBroadcasts();
  } catch (err) {
    toast.error(err.response?.data?.message || 'Failed to send WhatsApp broadcast');
  } finally {
    setSendingWhatsApp(false);
  }
};

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this broadcast record?')) return;
    try {
      await API.delete(`/broadcasts/${id}`);
      toast.success('Deleted');
      fetchBroadcasts();
    } catch (err) { toast.error('Failed to delete'); }
  };

  const targetOptions = [
    { value: 'all', label: '👥 Everyone (Students + Employees)', color: '#1e40af' },
    { value: 'students', label: '👨‍🎓 All Students', color: '#10b981' },
    { value: 'employees', label: '👨‍💼 All Employees', color: '#7c3aed' },
    { value: 'class', label: '🏫 Specific Class', color: '#f59e0b' },
  ];

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const targetBadge = (type, className) => {
    const map = {
      all: { label: 'Everyone', bg: '#dbeafe', color: '#1e40af' },
      students: { label: 'All Students', bg: '#dcfce7', color: '#16a34a' },
      employees: { label: 'All Employees', bg: '#ede9fe', color: '#7c3aed' },
      class: { label: className || 'Class', bg: '#fef3c7', color: '#d97706' },
    };
    const b = map[type] || map.all;
    return (
      <span style={{ background: b.bg, color: b.color, padding: '2px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '700' }}>
        {b.label}
      </span>
    );
  };

  return (
    <AppLayout title="Broadcast" subtitle="Send announcements to students and staff">
      <div className="page-header">
        <div>
          <h1>📢 Broadcast</h1>
          <p>{broadcasts.length} broadcasts sent</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setShowForm(!showForm); setSentResult(null); }}>
          {showForm ? '✕ Cancel' : '📢 New Broadcast'}
        </button>
      </div>

      {/* New Broadcast Form */}
      {showForm && (
        <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '24px', marginBottom: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <h3 style={{ margin: '0 0 20px', fontSize: '16px', fontWeight: '800', color: '#1e293b' }}>
            📢 Create New Broadcast
          </h3>

          <form onSubmit={handleSendEmail}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              {/* Title */}
              <div className="form-group" style={{ gridColumn: '1/-1', margin: 0 }}>
                <label>Broadcast Title <span style={{ color: 'red' }}>*</span></label>
                <input
                  className="form-control"
                  placeholder="e.g. School Holiday Notice, Exam Schedule..."
                  value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })}
                  required
                />
              </div>

              {/* Target */}
              <div className="form-group" style={{ margin: 0 }}>
                <label>Send To <span style={{ color: 'red' }}>*</span></label>
                <select className="form-control" value={form.target_type}
                  onChange={e => setForm({ ...form, target_type: e.target.value, target_class_id: '' })}>
                  {targetOptions.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              {/* Class selector */}
              {form.target_type === 'class' && (
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Select Class <span style={{ color: 'red' }}>*</span></label>
                  <select className="form-control" value={form.target_class_id}
                    onChange={e => setForm({ ...form, target_class_id: e.target.value })} required>
                    <option value="">Choose Class</option>
                    {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}
            </div>

            {/* Message */}
            <div className="form-group" style={{ margin: '0 0 20px' }}>
              <label>Message <span style={{ color: 'red' }}>*</span></label>
              <textarea
                className="form-control"
                rows="5"
                placeholder="Type your announcement message here..."
                value={form.message}
                onChange={e => setForm({ ...form, message: e.target.value })}
                required
                style={{ resize: 'vertical', fontFamily: 'inherit', lineHeight: '1.6' }}
              />
              <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
                {form.message.length} characters
              </div>
            </div>

            {/* Preview */}
            {form.target_type && (
              <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '10px', padding: '12px 16px', marginBottom: '20px' }}>
                <div style={{ fontSize: '12px', fontWeight: '700', color: '#0369a1', marginBottom: '4px' }}>📋 Preview</div>
                <div style={{ fontSize: '13px', color: '#0c4a6e' }}>
                  Sending to{' '}
                  <strong>
                    {form.target_type === 'all' && 'all students and employees'}
                    {form.target_type === 'students' && 'all students'}
                    {form.target_type === 'employees' && 'all employees'}
                    {form.target_type === 'class' && (form.target_class_id ? classes.find(c => c.id == form.target_class_id)?.name : 'selected class')}
                  </strong>
                </div>
              </div>
            )}

            {/* WhatsApp Progress Bar */}
            {sendingWhatsApp && (
              <div style={{ background: '#f0fdf4', border: '1px solid #16a34a', borderRadius: '10px', padding: '14px 16px', marginBottom: '16px' }}>
                <div style={{ fontWeight: '700', color: '#16a34a', marginBottom: '6px', fontSize: '13px' }}>
                  📲 Sending WhatsApp... {whatsappProgress.current}/{whatsappProgress.total}
                </div>
                <div style={{ background: '#dcfce7', borderRadius: '999px', height: '8px', overflow: 'hidden' }}>
                  <div style={{
                    background: '#16a34a', height: '100%', borderRadius: '999px',
                    width: `${whatsappProgress.total > 0 ? (whatsappProgress.current / whatsappProgress.total) * 100 : 0}%`,
                    transition: 'width 0.3s ease'
                  }} />
                </div>
                <div style={{ fontSize: '11px', color: '#166534', marginTop: '6px' }}>
                  ⏳ Keep this window open. WhatsApp opens for each recipient with a 2-second gap.
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-outline"
                onClick={() => { setShowForm(false); setSentResult(null); }}>
                Cancel
              </button>

              {/* WhatsApp Button */}
              <button
                type="button"
                onClick={handleSendWhatsApp}
                disabled={sending || sendingWhatsApp}
                style={{
                  padding: '10px 20px', borderRadius: '8px', border: 'none',
                  background: sendingWhatsApp ? '#bbf7d0' : '#25d366',
                  color: '#fff', fontWeight: '700', fontSize: '14px',
                  cursor: sending || sendingWhatsApp ? 'not-allowed' : 'pointer',
                }}>
                {sendingWhatsApp
                  ? `⏳ ${whatsappProgress.current}/${whatsappProgress.total}`
                  : '📲 Send via WhatsApp'}
              </button>

              {/* Email Button */}
              <button type="submit" className="btn btn-primary"
                disabled={sending || sendingWhatsApp}
                style={{ padding: '10px 20px' }}>
                {sending ? '⏳ Sending...' : '📧 Send via Email'}
              </button>
            </div>
          </form>

          {/* Sent Result */}
          {sentResult && (
            <div style={{ background: '#f0fdf4', border: '2px solid #16a34a', borderRadius: '12px', padding: '20px', marginTop: '20px', textAlign: 'center' }}>
              <div style={{ fontSize: '36px', marginBottom: '8px' }}>🎉</div>
              <div style={{ fontSize: '16px', fontWeight: '800', color: '#16a34a', marginBottom: '6px' }}>
                Broadcast Sent Successfully!
              </div>
              <div style={{ fontSize: '14px', color: '#166534' }}>
                {sentResult.channel === 'whatsapp' ? '📲 WhatsApp' : '📧 Email'} sent to{' '}
                <strong>{sentResult.sent_count}</strong> recipients
                {sentResult.skipped > 0 && (
                  <span style={{ color: '#d97706', marginLeft: '8px' }}>
                    ({sentResult.skipped} skipped — no phone)
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Broadcasts History */}
      <div className="card">
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '800' }}>📋 Broadcast History</h3>
          <button className="btn btn-outline btn-sm" onClick={fetchBroadcasts}>🔄 Refresh</button>
        </div>

        {loading ? (
          <div className="loading"><div className="spinner"></div></div>
        ) : broadcasts.length > 0 ? (
          <div style={{ padding: '8px' }}>
            {broadcasts.map(b => (
              <div key={b.id} style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                <div style={{
                  width: '44px', height: '44px', borderRadius: '12px',
                  background: b.title?.startsWith('[WhatsApp]') ? '#dcfce7' : '#dbeafe',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0
                }}>
                  {b.title?.startsWith('[WhatsApp]') ? '📲' : '📧'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                    <span style={{ fontWeight: '800', fontSize: '14px', color: '#1e293b' }}>
                      {b.title?.replace('[WhatsApp] ', '')}
                    </span>
                    {targetBadge(b.target_type, b.class_name)}
                    <span style={{ background: '#f1f5f9', color: '#64748b', padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: '600' }}>
                      {b.title?.startsWith('[WhatsApp]') ? '📲' : '📧'} {b.sent_count} recipients
                    </span>
                  </div>
                  <p style={{ margin: '4px 0 8px', fontSize: '13px', color: '#64748b', lineHeight: '1.5', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {b.message}
                  </p>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                    Sent by <strong>{b.sent_by_name}</strong> • {formatDate(b.created_at)}
                  </div>
                </div>
                <button onClick={() => handleDelete(b.id)}
                  style={{ background: 'none', border: '1px solid #fee2e2', borderRadius: '6px', color: '#ef4444', cursor: 'pointer', padding: '4px 10px', fontSize: '12px', flexShrink: 0 }}>
                  🗑️
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">📢</div>
            <p>No broadcasts sent yet</p>
            <p style={{ fontSize: '13px', color: '#94a3b8' }}>Click "New Broadcast" to send your first announcement</p>
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default Broadcast;
import React, { useState, useEffect } from 'react';
import AppLayout from '../components/layout/AppLayout';
import API from '../utils/api';
import { toast } from 'react-toastify';
import { useAuth } from '../context/AuthContext';


const checkPasswordStrength = (password) => {
  const checks = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /\d/.test(password),
    special: /[@$!%*?&]/.test(password),
  };
  const passed = Object.values(checks).filter(Boolean).length;
  return { checks, passed };
};

const PasswordStrengthBar = ({ password }) => {
  const { checks, passed } = checkPasswordStrength(password);
  if (!password) return null;
  const color = passed <= 2 ? '#ef4444' : passed <= 3 ? '#f59e0b' : passed <= 4 ? '#3b82f6' : '#10b981';
  const label = passed <= 2 ? 'Weak' : passed <= 3 ? 'Fair' : passed <= 4 ? 'Good' : 'Strong';
  return (
    <div style={{marginTop:'8px'}}>
      <div style={{display:'flex', gap:'4px', marginBottom:'6px'}}>
        {[1,2,3,4,5].map(i => (
          <div key={i} style={{flex:1, height:'4px', borderRadius:'2px', background: i <= passed ? color : '#e2e8f0'}} />
        ))}
      </div>
      <div style={{fontSize:'11px', color, fontWeight:'700', marginBottom:'6px'}}>{label}</div>
      <div style={{display:'flex', flexWrap:'wrap', gap:'4px'}}>
        {[
          {key:'length',label:'8+ chars'},{key:'uppercase',label:'Uppercase'},
          {key:'lowercase',label:'Lowercase'},{key:'number',label:'Number'},
          {key:'special',label:'Special (@$!%*?&)'}
        ].map(item => (
          <span key={item.key} style={{fontSize:'10px', padding:'2px 8px', borderRadius:'12px', fontWeight:'700',
            background: checks[item.key] ? '#dcfce7' : '#fee2e2', color: checks[item.key] ? '#16a34a' : '#dc2626'}}>
            {checks[item.key] ? '✓' : '✗'} {item.label}
          </span>
        ))}
      </div>
    </div>
  );
};

const Profile = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({});
  const [pwForm, setPwForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [showPwSection, setShowPwSection] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('profile');
  const [teacherSubjects, setTeacherSubjects] = useState([]);


  // For admin/principal — reset other users passwords
  const [users, setUsers] = useState([]);
  const [resetUserId, setResetUserId] = useState('');
  const [resetNewPw, setResetNewPw] = useState('');
  const [resetSaving, setResetSaving] = useState(false);
 
  const isAdminOrPrincipal = user?.role === 'admin' || user?.role === 'principal';

  useEffect(() => {
    fetchProfile();
    if (isAdminOrPrincipal) fetchUsers();
  }, []);

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const { data } = await API.get('/auth/profile');
      setProfile(data);
      setForm({
        full_name: data.full_name || '',
        phone: data.phone || '',
        email: data.email || '',
        address: data.address?.replace(/\|RESET:.*$/,'') || '',
      });

      // Fetch teacher assigned subjects
    if (user?.role === 'Teacher' || user?.role === 'teacher') {
      try {
        const { data: subData } = await API.get('/teacher-assigned-subjects');
        setTeacherSubjects(subData);
      } catch { setTeacherSubjects([]); }
    }      

    } catch (err) { toast.error('Failed to load profile'); }
    finally { setLoading(false); }
  };

  const fetchUsers = async () => {
    try {
      const { data } = await API.get('/auth/users-for-reset');
      setUsers(data);
    } catch (err) {}
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await API.put('/auth/profile', form);
      toast.success('Profile updated successfully!');
      setEditMode(false);
      fetchProfile();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to update'); }
    finally { setSaving(false); }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (pwForm.new_password !== pwForm.confirm_password) {
      toast.error('New passwords do not match!');
      return;
    }
    if (pwForm.new_password.length < 6) {
      toast.error('Password must be at least 6 characters!');
      return;
    }
    setPwSaving(true);
    try {
      await API.put('/auth/change-password', {
        current_password: pwForm.current_password,
        new_password: pwForm.new_password
      });
      toast.success('Password changed successfully!');
      setPwForm({ current_password: '', new_password: '', confirm_password: '' });
      setShowPwSection(false);
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to change password'); }
    finally { setPwSaving(false); }
  };

  const handleAdminResetPassword = async (e) => {
    e.preventDefault();
    if (!resetUserId) { toast.error('Please select a user'); return; }
    if (resetNewPw.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    if (!window.confirm('Are you sure you want to reset this user\'s password?')) return;
    setResetSaving(true);
    try {
      await API.put('/auth/admin-reset-password', { user_id: resetUserId, new_password: resetNewPw });
      toast.success('Password reset successfully!');
      setResetUserId('');
      setResetNewPw('');
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to reset password'); }
    finally { setResetSaving(false); }
  };

  const tabStyle = (tab) => ({
    padding: '10px 20px', border: 'none', cursor: 'pointer',
    fontWeight: '700', fontSize: '14px', fontFamily: 'inherit',
    borderBottom: activeTab === tab ? '2px solid #1e40af' : '2px solid transparent',
    color: activeTab === tab ? '#1e40af' : '#64748b',
    background: 'transparent', marginBottom: '-2px', transition: 'all 0.15s'
  });

  if (loading) return <AppLayout title="My Profile"><div className="loading"><div className="spinner"></div></div></AppLayout>;

  return (
    <AppLayout title="My Profile" subtitle="View and manage your personal information">
      <div className="page-header">
        <div>
          <h1>My Profile</h1>
          <p>{profile?.role_name?.toUpperCase()} • {profile?.emp_id}</p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:'flex', gap:'4px', marginBottom:'24px', borderBottom:'2px solid #e2e8f0', paddingBottom:'0'}}>
        <button style={tabStyle('profile')} onClick={() => setActiveTab('profile')}>
          👤 Personal Details
        </button>
        <button style={tabStyle('password')} onClick={() => setActiveTab('password')}>
          🔐 Change Password
        </button>
        {isAdminOrPrincipal && (
          <button style={tabStyle('reset')} onClick={() => setActiveTab('reset')}>
            🔑 Reset User Password
          </button>
        )}
      </div>

      {/* PERSONAL DETAILS TAB */}
      {activeTab === 'profile' && (
        <div className="profile-grid" style={{display:'grid', gridTemplateColumns:'1fr 2fr', gap:'24px', alignItems:'start'}}>
          {/* Avatar Card */}
          <div className="card" style={{textAlign:'center', padding:'32px 24px'}}>
            <div style={{
              width:'90px', height:'90px', borderRadius:'50%',
              background:'linear-gradient(135deg, #1e40af, #3b82f6)',
              display:'flex', alignItems:'center', justifyContent:'center',
              margin:'0 auto 16px', fontSize:'36px', fontWeight:'800', color:'#fff'
            }}>
              {profile?.full_name?.charAt(0).toUpperCase()}
            </div>
            <h2 style={{fontSize:'18px', fontWeight:'800', margin:'0 0 4px', wordBreak:'break-word'}}>{profile?.full_name}</h2>
            <p style={{color:'#64748b', fontSize:'13px', margin:'0 0 8px'}}>{profile?.role_name}</p>
            <span className="badge badge-success">{profile?.emp_id}</span>
            <div style={{marginTop:'20px', borderTop:'1px solid #e2e8f0', paddingTop:'16px'}}>
              <div style={{fontSize:'12px', color:'#64748b', marginBottom:'4px'}}>Login User ID</div>
              <code style={{background:'#f1f5f9', padding:'4px 10px', borderRadius:'6px', fontSize:'13px', fontWeight:'700'}}>
                {profile?.login_user_id}
              </code>
            </div>
          </div>

          {/* Details Form */}
          <div className="card">
            <div className="card-header">
              <h3>Personal Information</h3>
              <button
                className={"btn btn-sm " + (editMode ? 'btn-outline' : 'btn-primary')}
                onClick={() => setEditMode(!editMode)}>
                {editMode ? '✕ Cancel' : '✏️ Edit'}
              </button>
            </div>
            <div className="card-body">
              {!editMode ? (
                <div style={{display:'grid', gap:'16px'}}>
                  {[
                    { label:'Full Name', value: profile?.full_name, icon:'👤' },
                    { label:'Employee ID', value: profile?.emp_id, icon:'🪪' },
                    { label:'Role', value: profile?.role_name, icon:'🎭' },
                    { label:'Login User ID', value: profile?.login_user_id, icon:'🔑' },
                    { label:'Phone Number', value: profile?.phone || 'Not set', icon:'📱' },
                    { label:'Email Address', value: profile?.email || 'Not set', icon:'📧' },
                    { label:'Address', value: profile?.address?.replace(/\|RESET:.*$/,'') || 'Not set', icon:'🏠' },
                    { label:'Qualification', value: profile?.qualification || 'Not set', icon:'🎓' },
                    { label:'Joining Date', value: profile?.joining_date?.split('T')[0] || 'Not set', icon:'📅' },
                  ].map(item => (
                    <div key={item.label} style={{display:'flex', alignItems:'flex-start', gap:'12px', padding:'12px', background:'#f8fafc', borderRadius:'10px'}}>
                      <span style={{fontSize:'20px', flexShrink:0}}>{item.icon}</span>
                      <div style={{minWidth:0, flex:1}}>
                        <div style={{fontSize:'11px', color:'#94a3b8', fontWeight:'700', textTransform:'uppercase', letterSpacing:'0.5px'}}>{item.label}</div>
                        <div style={{fontSize:'14px', fontWeight:'600', color:'#1e293b', marginTop:'2px', wordBreak:'break-word'}}>{item.value}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <form onSubmit={handleSaveProfile}>
                  <div className="form-grid">
                    <div className="form-group" style={{gridColumn:'1/-1'}}>
                      <label>Full Name <span>*</span></label>
                      <input className="form-control" value={form.full_name}
                        onChange={e => setForm({...form, full_name: e.target.value})} required />
                    </div>
                    <div className="form-group">
                      <label>Phone Number</label>
                      <input className="form-control" value={form.phone}
                        onChange={e => setForm({...form, phone: e.target.value})} placeholder="Phone number" />
                    </div>
                    <div className="form-group">
                      <label>Email Address</label>
                      <input type="email" className="form-control" value={form.email}
                        onChange={e => setForm({...form, email: e.target.value})} placeholder="Email address" />
                    </div>
                    <div className="form-group" style={{gridColumn:'1/-1'}}>
                      <label>Address</label>
                      <textarea className="form-control" rows="3" value={form.address}
                        onChange={e => setForm({...form, address: e.target.value})} placeholder="Your address" />
                    </div>
                  </div>
                  <div style={{display:'flex', gap:'10px', marginTop:'16px', justifyContent:'flex-end'}}>
                    <button type="button" className="btn btn-outline" onClick={() => setEditMode(false)}>Cancel</button>
                    <button type="submit" className="btn btn-primary" disabled={saving}>
                      {saving ? '⏳ Saving...' : '💾 Save Changes'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {teacherSubjects.length > 0 && (
                    <div style={{padding:'12px', background:'#f8fafc', borderRadius:'10px', display:'flex', alignItems:'flex-start', gap:'12px'}}>
                      <span style={{fontSize:'20px', flexShrink:0}}>📚</span>
                      <div>
                        <div style={{fontSize:'11px', color:'#94a3b8', fontWeight:'700', textTransform:'uppercase', letterSpacing:'0.5px'}}>Assigned Subjects</div>
                        <div style={{display:'flex', flexWrap:'wrap', gap:'6px', marginTop:'6px'}}>
                          {teacherSubjects.map(s => (
                            <span key={s.id} style={{background:'#dbeafe', color:'#1e40af', padding:'3px 10px', borderRadius:'20px', fontSize:'12px', fontWeight:'700'}}>
                              {s.subject_name}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

      {/* CHANGE PASSWORD TAB */}
      {activeTab === 'password' && (
        <div style={{maxWidth:'500px'}}>
          <div className="card">
            <div className="card-header">
              <h3>🔐 Change Your Password</h3>
            </div>
            <div className="card-body">
              <form onSubmit={handleChangePassword}>
                <div style={{display:'flex', flexDirection:'column', gap:'16px'}}>
                  <div className="form-group">
                    <label>Current Password <span>*</span></label>
                    <input type="password" className="form-control"
                      value={pwForm.current_password}
                      onChange={e => setPwForm({...pwForm, current_password: e.target.value})}
                      required placeholder="Enter current password" />
                  </div>
                  <div className="form-group">
                    <label>New Password <span>*</span></label>
                    <input type="password" className="form-control"
                      value={pwForm.new_password}
                      onChange={e => setPwForm({...pwForm, new_password: e.target.value})}
                      required placeholder="Enter new password" />
                    <PasswordStrengthBar password={pwForm.new_password} />
                  </div>
                  <div className="form-group">
                    <label>Confirm New Password <span>*</span></label>
                    <input type="password" className="form-control"
                      value={pwForm.confirm_password}
                      onChange={e => setPwForm({...pwForm, confirm_password: e.target.value})}
                      required placeholder="Confirm new password" />
                    {pwForm.confirm_password && pwForm.new_password !== pwForm.confirm_password && (
                      <div style={{color:'#ef4444', fontSize:'12px', marginTop:'4px'}}>⚠️ Passwords do not match</div>
                    )}
                    {pwForm.confirm_password && pwForm.new_password === pwForm.confirm_password && (
                      <div style={{color:'#10b981', fontSize:'12px', marginTop:'4px'}}>✅ Passwords match</div>
                    )}
                  </div>
                  <button type="submit" className="btn btn-primary" disabled={pwSaving}>
                    {pwSaving ? '⏳ Changing...' : '🔐 Change Password'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ADMIN RESET PASSWORD TAB */}
      {activeTab === 'reset' && isAdminOrPrincipal && (
        <div style={{maxWidth:'500px'}}>
          <div className="card">
            <div className="card-header">
              <h3>🔑 Reset User Password</h3>
            </div>
            <div className="card-body">
              <form onSubmit={handleAdminResetPassword}>
                <div style={{display:'flex', flexDirection:'column', gap:'16px'}}>
                  <div className="form-group">
                    <label>Select User <span>*</span></label>
                    <select className="form-control" value={resetUserId}
                      onChange={e => setResetUserId(e.target.value)} required>
                      <option value="">Select a user...</option>
                      {users.map(u => (
                        <option key={u.id} value={u.id}>
                          {u.full_name} ({u.login_user_id}) — {u.role_name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>New Password <span>*</span></label>
                    <input type="password" className="form-control"
                      value={resetNewPw}
                      onChange={e => setResetNewPw(e.target.value)}
                      required placeholder="Enter new password (min 6 chars)"
                      minLength={6} />
                  </div>
                  <div style={{background:'#fef3c7', border:'1px solid #f59e0b', borderRadius:'8px', padding:'12px', fontSize:'13px', color:'#92400e'}}>
                    ⚠️ This will immediately change the selected user's password. They will need to use the new password on their next login.
                  </div>
                  <button type="submit" className="btn btn-primary" disabled={resetSaving}>
                    {resetSaving ? '⏳ Resetting...' : '🔑 Reset Password'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

    </AppLayout>
  );
};

export default Profile;
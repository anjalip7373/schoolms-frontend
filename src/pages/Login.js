import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import API from '../utils/api';
import { toast } from 'react-toastify';

const checkPassword = (pw) => ({
  length: pw.length >= 8,
  upper: /[A-Z]/.test(pw),
  lower: /[a-z]/.test(pw),
  number: /\d/.test(pw),
  special: /[@$!%*?&]/.test(pw),
});

const StrengthBar = ({ pw }) => {
  if (!pw) return null;
  const c = checkPassword(pw);
  const passed = Object.values(c).filter(Boolean).length;
  const color = passed < 3 ? '#ef4444' : passed < 4 ? '#f59e0b' : passed < 5 ? '#3b82f6' : '#10b981';
  const label = passed < 3 ? 'Weak' : passed < 4 ? 'Fair' : passed < 5 ? 'Good' : 'Strong ✓';
  return (
    <div style={{marginTop:'8px'}}>
      <div style={{display:'flex', gap:'3px', marginBottom:'5px'}}>
        {[1,2,3,4,5].map(i=>(
          <div key={i} style={{flex:1,height:'4px',borderRadius:'2px',background:i<=passed?color:'#e2e8f0',transition:'all 0.3s'}}/>
        ))}
      </div>
      <div style={{fontSize:'11px',color,fontWeight:'700',marginBottom:'5px'}}>{label}</div>
      <div style={{display:'flex',flexWrap:'wrap',gap:'3px'}}>
        {[
          [c.length,'8+ chars'],[c.upper,'A-Z'],[c.lower,'a-z'],
          [c.number,'0-9'],[c.special,'@$!%*?&']
        ].map(([ok,lbl])=>(
          <span key={lbl} style={{fontSize:'10px',padding:'2px 7px',borderRadius:'10px',fontWeight:'700',
            background:ok?'#dcfce7':'#fee2e2',color:ok?'#16a34a':'#dc2626'}}>
            {ok?'✓':'✗'} {lbl}
          </span>
        ))}
      </div>
    </div>
  );
};

export default function Login() {
  const [form, setForm] = useState({login_user_id:'',login_password:''});
  const [loading, setLoading] = useState(false);
  const {login} = useAuth();
  const navigate = useNavigate();

  // steps: login | enterid | enterotp | success
  const [step, setStep] = useState('login');
  const [userId, setUserId] = useState('');
  const [emailHint, setEmailHint] = useState('');
  const [otp, setOtp] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [busy, setBusy] = useState(false);

  const pwChecks = checkPassword(newPw);
  const pwStrong = Object.values(pwChecks).every(Boolean);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const {data} = await API.post('/auth/login', form);
      login(data.user, data.token);
      navigate('/dashboard');
    } catch(err) {
      toast.error(err.response?.data?.message || 'Login failed');
    } finally { setLoading(false); }
  };

  const handleSendOTP = async (e) => {
    e.preventDefault();
    if (!userId.trim()) { toast.error('Enter your Login User ID'); return; }
    setBusy(true);
    try {
      const {data} = await API.post('/auth/forgot-password', { 
        login_user_id: userId.trim() 
      });
      setEmailHint(data.email_hint || '');
      setOtp(''); // Clear any old OTP
      setNewPw('');
      setConfirmPw('');
      setStep('enterotp');
      toast.success('OTP sent!');
    } catch(err) {
      toast.error(err.response?.data?.message || 'Failed. Check your User ID.');
    } finally { setBusy(false); }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    if (otp.length !== 6) { toast.error('Please enter the complete 6-digit OTP'); return; }
    if (!pwStrong) { toast.error('Password does not meet all requirements'); return; }
    if (newPw !== confirmPw) { toast.error('Passwords do not match'); return; }

    setBusy(true);
    try {
      await API.post('/auth/verify-reset', {
        login_user_id: userId.trim(),
        reset_code: otp.trim(),
        new_password: newPw
      });
      setStep('success');
      toast.success('Password reset successfully!');
    } catch(err) {
      const msg = err.response?.data?.message || 'Failed';
      toast.error(msg);
      // If OTP wrong, clear it so user types fresh
      if (msg.includes('OTP') || msg.includes('Incorrect')) {
        setOtp('');
      }
    } finally { setBusy(false); }
  };

  

  const card = {maxWidth:'420px'};

  return (
    <div className="login-page">
      <div className="login-card" style={card}>
        <div className="login-logo">
          <h1>🏫 SchoolMS</h1>
          <p>School Management System</p>
        </div>

        {/* ── LOGIN ── */}
        {step === 'login' && (
          <>
            <form className="login-form" onSubmit={handleLogin}>
              <div className="form-group">
                <label>User ID <span style={{color:'red'}}>*</span></label>
                <input className="form-control" placeholder="Enter your user ID"
                  value={form.login_user_id}
                  onChange={e=>setForm({...form,login_user_id:e.target.value})} required/>
              </div>
              <div className="form-group">
                <label>Password <span style={{color:'red'}}>*</span></label>
                <input type="password" className="form-control" placeholder="Enter your password"
                  value={form.login_password}
                  onChange={e=>setForm({...form,login_password:e.target.value})} required/>
              </div>
              <button type="submit" className="btn btn-primary" disabled={loading}
                style={{marginTop:'8px',justifyContent:'center',width:'100%'}}>
                {loading ? '⏳ Signing in...' : '🔐 Sign In'}
              </button>
            </form>
            <div style={{textAlign:'center',marginTop:'14px'}}>
              <button onClick={()=>setStep('enterid')}
                style={{background:'none',border:'none',color:'#3b82f6',cursor:'pointer',fontSize:'13px',fontWeight:'600',fontFamily:'inherit'}}>
                🔑 Forgot Password?
              </button>
            </div>
            <p style={{textAlign:'center',marginTop:'10px',fontSize:'12px',color:'#94a3b8'}}>
              Default: admin / admin123
            </p>
          </>
        )}

        {/* ── STEP 1: ENTER USER ID ── */}
        {step === 'enterid' && (
          <>
            <div style={{textAlign:'center',marginBottom:'20px'}}>
              <div style={{fontSize:'40px',marginBottom:'8px'}}>🔑</div>
              <h2 style={{fontSize:'17px',fontWeight:'800',margin:'0 0 6px'}}>Reset Password</h2>
              <p style={{fontSize:'13px',color:'#64748b',margin:0,lineHeight:1.6}}>
                Enter your Login User ID.<br/>
                A 6-digit OTP will be sent to your registered email & WhatsApp.
              </p>
            </div>
            <form onSubmit={handleSendOTP}>
              <div className="form-group" style={{marginBottom:'16px'}}>
                <label>Your Login User ID <span style={{color:'red'}}>*</span></label>
                <input className="form-control" placeholder="e.g. admin or ganesh"
                  value={userId} onChange={e=>setUserId(e.target.value)} required/>
                <div style={{fontSize:'11px',color:'#94a3b8',marginTop:'4px'}}>
                  Same ID you use to login every day
                </div>
              </div>
              <button type="submit" className="btn btn-primary" disabled={busy}
                style={{justifyContent:'center',width:'100%'}}>
                {busy ? '⏳ Sending OTP...' : '📤 Send OTP'}
              </button>
            </form>
            <div style={{textAlign:'center',marginTop:'14px'}}>
              <button onClick={()=>setStep('login')}
                style={{background:'none',border:'none',color:'#64748b',cursor:'pointer',fontSize:'13px',fontFamily:'inherit'}}>
                ← Back to Login
              </button>
            </div>
          </>
        )}

        {/* ── STEP 2: ENTER OTP + NEW PASSWORD ── */}
        {step === 'enterotp' && (
          <>
            <div style={{textAlign:'center',marginBottom:'16px'}}>
             <div style={{fontSize:'36px',marginBottom:'6px'}}>📤</div>
<h2 style={{fontSize:'17px',fontWeight:'800',margin:'0 0 4px'}}>OTP Sent!</h2>
<p style={{fontSize:'13px',color:'#64748b',margin:0,lineHeight:1.6}}>
  A 6-digit OTP was sent to your email & WhatsApp<br/>
                <strong style={{color:'#1e40af'}}>{emailHint}</strong><br/>
                <span style={{fontSize:'12px',color:'#f59e0b'}}>⏰ OTP valid for 15 minutes</span>
              </p>
            </div>

            <form onSubmit={handleVerify}>
              <div style={{display:'flex',flexDirection:'column',gap:'14px'}}>

                <div className="form-group">
                  <label>Enter 6-digit OTP <span style={{color:'red'}}>*</span></label>
                  <input className="form-control"
                    placeholder="Enter OTP"
                    value={otp}
                    onChange={e=>setOtp(e.target.value.replace(/\D/g,'').slice(0,6))}
                    maxLength={6} required
                    style={{textAlign:'center',fontSize:'28px',fontWeight:'900',letterSpacing:'12px',fontFamily:'monospace'}}
                  />
                  <div style={{fontSize:'11px',color:'#94a3b8',marginTop:'4px',textAlign:'center'}}>
                    
                  </div>Numbers only — check your email or WhatsApp
                </div>

                <div className="form-group">
                  <label>New Password <span style={{color:'red'}}>*</span></label>
                  <input type="password" className="form-control"
                    placeholder="Create a strong password"
                    value={newPw}
                    onChange={e=>setNewPw(e.target.value)}
                    required/>
                  <StrengthBar pw={newPw}/>
                </div>

                <div className="form-group">
                  <label>Confirm Password <span style={{color:'red'}}>*</span></label>
                  <input type="password" className="form-control"
                    placeholder="Confirm new password"
                    value={confirmPw}
                    onChange={e=>setConfirmPw(e.target.value)}
                    required/>
                  {confirmPw && (
                    <div style={{fontSize:'12px',marginTop:'4px',fontWeight:'700',
                      color:newPw===confirmPw?'#10b981':'#ef4444'}}>
                      {newPw===confirmPw ? '✅ Passwords match' : '⚠️ Do not match'}
                    </div>
                  )}
                </div>

                <button type="submit" className="btn btn-primary"
                  disabled={busy || !pwStrong || newPw!==confirmPw || otp.length<6}
                  style={{justifyContent:'center',width:'100%'}}>
                  {busy ? '⏳ Resetting...' : '🔐 Reset Password'}
                </button>
              </div>
            </form>

            <div style={{display:'flex',justifyContent:'space-between',marginTop:'14px'}}>
              <button onClick={()=>{setStep('enterid');setOtp('');}}
                style={{background:'none',border:'none',color:'#3b82f6',cursor:'pointer',fontSize:'12px',fontFamily:'inherit',fontWeight:'600'}}>
                📧 Resend OTP
              </button>
              <button onClick={()=>setStep('login')}
                style={{background:'none',border:'none',color:'#64748b',cursor:'pointer',fontSize:'12px',fontFamily:'inherit'}}>
                Back to Login
              </button>
            </div>
          </>
        )}

        {/* ── SUCCESS ── */}
        {step === 'success' && (
          <div style={{textAlign:'center'}}>
            <div style={{background:'#f0fdf4',border:'2px solid #16a34a',borderRadius:'14px',padding:'28px',marginBottom:'16px'}}>
              <div style={{fontSize:'48px',marginBottom:'10px'}}>🎉</div>
              <h2 style={{fontSize:'18px',fontWeight:'800',color:'#15803d',margin:'0 0 8px'}}>
                Password Reset!
              </h2>
              <p style={{fontSize:'14px',color:'#166534',margin:'0 0 20px',lineHeight:1.6}}>
                Your password has been changed successfully.<br/>
                Login with your new password now.
              </p>
              <button className="btn btn-primary"
                onClick={()=>{setStep('login');setUserId('');setOtp('');setNewPw('');setConfirmPw('');}}
                style={{justifyContent:'center',width:'100%',fontSize:'15px',padding:'12px'}}>
                🔐 Go to Login
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
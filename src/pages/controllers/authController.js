const { sendPasswordResetEmail, sendPasswordChangedEmail } = require('../config/emailService');
const { sendPasswordResetWhatsApp, sendPasswordChangedWhatsApp } = require('../config/whatsappService');

const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// ─── CREATE OTP TABLE IF IT DOESN'T EXIST ───────────────────────────────────
pool.execute(`
  CREATE TABLE IF NOT EXISTS otp_store (
    login_user_id VARCHAR(100) PRIMARY KEY,
    otp VARCHAR(6) NOT NULL,
    user_id INT NOT NULL,
    email VARCHAR(255),
    full_name VARCHAR(255),
    expiry BIGINT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`).then(() => {
  console.log('otp_store table ready');
}).catch(err => {
  console.error('Failed to create otp_store table:', err.message);
});

// --- LOGIN ---
exports.login = async (req, res) => {
  try {
    const { login_user_id, login_password } = req.body;

    const [rows] = await pool.execute(
      `SELECT u.*, r.name as role_name, r.access as role_access 
       FROM users u 
       LEFT JOIN roles r ON u.role_id = r.id 
       WHERE u.login_user_id = ? AND u.is_active = 1`,
      [login_user_id]
    );

    if (!rows.length) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const user = rows[0];
    const validPass = await bcrypt.compare(login_password, user.login_password);
    if (!validPass) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    let access = [];
    try {
      const raw = user.role_access;
      access = typeof raw === 'string' ? JSON.parse(raw) : (Array.isArray(raw) ? raw : []);
    } catch (e) { access = []; }

    if (user.role_name === 'admin') {
      access = ['dashboard','students','daily_attendance','attendance_report','fee_payment','salary_slip','employees','principals','reports','configuration','marks','marksheet_report'];
    }

    const token = jwt.sign(
      { id: user.id, role: user.role_name, name: user.full_name, emp_id: user.emp_id },
      process.env.JWT_SECRET || 'school_secret_key',
      { expiresIn: '8h' }
    );

    return res.json({
      token,
      user: { id: user.id, name: user.full_name, role: user.role_name, emp_id: user.emp_id, access }
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// --- FORGOT PASSWORD: SEND OTP ---
exports.resetPasswordRequest = async (req, res) => {
  try {
    const { login_user_id } = req.body;
    const key = login_user_id.trim().toLowerCase();

    const [rows] = await pool.execute(
      `SELECT u.id, u.full_name, u.email, u.phone
       FROM users u WHERE LOWER(u.login_user_id) = ? AND u.is_active = 1`,
      [key]
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'User ID not found.' });
    }

    const user = rows[0];

    if (!user.email) {
      return res.status(400).json({ message: 'No email registered for this account. Contact your administrator.' });
    }

    await pool.execute(`DELETE FROM otp_store WHERE login_user_id = ?`, [key]);

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = Date.now() + 15 * 60 * 1000;

    await pool.execute(
      `INSERT INTO otp_store (login_user_id, otp, user_id, email, full_name, expiry)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [key, otp, user.id, user.email, user.full_name, expiry]
    );

    try {
      await sendPasswordResetEmail(user.email, user.full_name, otp);
    } catch (e) {
      await pool.execute(`DELETE FROM otp_store WHERE login_user_id = ?`, [key]);
      console.error('Email failed:', e.message);
      return res.status(500).json({ message: 'Failed to send email. Please check your email settings.' });
    }

    if (user.phone) {
      sendPasswordResetWhatsApp(user.phone, user.full_name, otp)
        .catch(e => console.error('OTP WhatsApp failed:', e.message));
    }

    res.json({
      success: true,
      email_hint: user.email.replace(/(.{2})(.*)(@.*)/, '$1***$3')
    });

  } catch (err) {
    console.error('resetPasswordRequest error:', err);
    res.status(500).json({ message: err.message });
  }
};

// --- VERIFY OTP + SET NEW PASSWORD ---
exports.verifyResetAndSetPassword = async (req, res) => {
  try {
    const { login_user_id, reset_code, new_password } = req.body;

    if (!login_user_id || !reset_code || !new_password) {
      return res.status(400).json({ message: 'All fields are required.' });
    }

    const key = login_user_id.trim().toLowerCase();
    const enteredOtp = reset_code.toString().trim();

    const [storedRows] = await pool.execute(
      `SELECT * FROM otp_store WHERE login_user_id = ?`,
      [key]
    );

    if (!storedRows.length) {
      return res.status(400).json({ message: 'OTP expired or not found. Please click Resend OTP.' });
    }

    const stored = storedRows[0];

    if (Date.now() > Number(stored.expiry)) {
      await pool.execute(`DELETE FROM otp_store WHERE login_user_id = ?`, [key]);
      return res.status(400).json({ message: 'OTP expired. Please request a new one.' });
    }

    if (stored.otp !== enteredOtp) {
      return res.status(400).json({ message: 'Incorrect OTP. Please use the latest OTP from your email.' });
    }

    const strongPw = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!strongPw.test(new_password)) {
      return res.status(400).json({ message: 'Password must be 8+ chars with uppercase, lowercase, number and special character (@$!%*?&).' });
    }

    const hashed = await bcrypt.hash(new_password, 10);
    await pool.execute(
      `UPDATE users SET login_password = ? WHERE id = ?`,
      [hashed, stored.user_id]
    );

    await pool.execute(`DELETE FROM otp_store WHERE login_user_id = ?`, [key]);

    if (stored.email) {
      try { await sendPasswordChangedEmail(stored.email, stored.full_name); } catch(e) {}
    }

    const [userRows] = await pool.execute('SELECT phone FROM users WHERE id = ?', [stored.user_id]);
    const userPhone = userRows[0]?.phone;
    if (userPhone) {
      sendPasswordChangedWhatsApp(userPhone, stored.full_name)
        .catch(e => console.error('Password changed WhatsApp failed:', e.message));
    }

    res.json({ message: 'Password reset successfully!' });

  } catch (err) {
    console.error('verifyResetAndSetPassword error:', err);
    res.status(500).json({ message: err.message });
  }
};

// --- PROFILE FUNCTIONS ---
exports.me = async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT r.access as role_access, r.name as role_name FROM users u LEFT JOIN roles r ON u.role_id = r.id WHERE u.id = ?`,
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'User not found' });
    let access = [];
    try {
      const raw = rows[0].role_access;
      access = typeof raw === 'string' ? JSON.parse(raw) : (Array.isArray(raw) ? raw : []);
    } catch (e) { access = []; }
    if (rows[0].role_name === 'admin') access = ['dashboard','students','daily_attendance','attendance_report','fee_payment','salary_slip','employees','principals','reports','configuration','marks','marksheet_report'];
    return res.json({ access });
  } catch (err) { return res.status(500).json({ message: err.message }); }
};

exports.getProfile = async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT u.id, u.emp_id, u.full_name, u.login_user_id, u.phone, u.email, u.address, u.qualification, u.joining_date, r.name as role_name FROM users u LEFT JOIN roles r ON u.role_id = r.id WHERE u.id = ?`,
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'User not found' });
    return res.json(rows[0]);
  } catch (err) { return res.status(500).json({ message: err.message }); }
};

exports.updateProfile = async (req, res) => {
  try {
    const { full_name, phone, email, address } = req.body;
    await pool.execute(
      `UPDATE users SET full_name=?, phone=?, email=?, address=? WHERE id=?`,
      [full_name, phone, email, address, req.user.id]
    );
    return res.json({ message: 'Profile updated successfully' });
  } catch (err) { 
    return res.status(500).json({ message: err.message }); 
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    const [rows] = await pool.execute('SELECT login_password FROM users WHERE id = ?', [req.user.id]);
    const validPass = await bcrypt.compare(current_password, rows[0].login_password);
    if (!validPass) return res.status(400).json({ message: 'Current password is incorrect' });
    const hashed = await bcrypt.hash(new_password, 10);
    await pool.execute('UPDATE users SET login_password = ? WHERE id = ?', [hashed, req.user.id]);
    return res.json({ message: 'Password changed successfully' });
  } catch (err) { return res.status(500).json({ message: err.message }); }
};

// ─── ADMIN RESET PASSWORD WITH AUTO-WHATSAPP AND EMAIL NOTIFICATIONS ───
exports.adminResetPassword = async (req, res) => {
  try {
    const { user_id, new_password } = req.body;
    if (!['admin', 'principal'].includes(req.user.role)) return res.status(403).json({ message: 'Not authorized' });
    
    const hashed = await bcrypt.hash(new_password, 10);
    await pool.execute('UPDATE users SET login_password = ? WHERE id = ?', [hashed, user_id]);

    const [targetUser] = await pool.execute('SELECT full_name, email, phone FROM users WHERE id = ?', [user_id]);
    if (targetUser.length > 0) {
      const user = targetUser[0];
      if (user.email) {
        sendPasswordChangedEmail(user.email, user.full_name)
          .catch(e => console.error('Admin Reset Email failed:', e.message));
      }
      if (user.phone) {
        sendPasswordChangedWhatsApp(user.phone, user.full_name)
          .catch(e => console.error('Admin Reset WhatsApp failed:', e.message));
      }
    }
    return res.json({ message: 'Password reset successfully' });
  } catch (err) { return res.status(500).json({ message: err.message }); }
};

exports.getAllUsersForReset = async (req, res) => {
  try {
    if (!['admin', 'principal'].includes(req.user.role)) return res.status(403).json({ message: 'Not authorized' });
    const [rows] = await pool.execute(`SELECT u.id, u.emp_id, u.full_name, u.login_user_id, r.name as role_name FROM users u LEFT JOIN roles r ON u.role_id = r.id WHERE u.is_active = 1`);
    return res.json(rows);
  } catch (err) { return res.status(500).json({ message: err.message }); }
};
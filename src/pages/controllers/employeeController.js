const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const { sendEmployeeWelcomeEmail, sendEmployeeUpdateEmail } = require('../config/emailService');
const { sendEmployeeWelcomeWhatsApp, sendEmployeeUpdateWhatsApp } = require('../config/whatsappService');

const generateEmpId = async () => {
  const [rows] = await pool.execute('SELECT COUNT(*) as cnt FROM users');
  return `EMP${String(rows[0].cnt + 1).padStart(3,'0')}`;
};

exports.getAllEmployees = async (req, res) => {
  try {
    const { role_type } = req.query;
    const userRole = req.user.role;
    let query = `SELECT u.*, r.name as role_name, c.name as class_name 
                 FROM users u LEFT JOIN roles r ON u.role_id = r.id
                 LEFT JOIN classes c ON u.class_assigned = c.id WHERE 1=1`;
    const params = [];
    if (role_type === 'employee') {
      query += ` AND r.name NOT IN ('admin','principal')`;
    } else if (role_type === 'principal') {
      query += ` AND r.name = 'principal'`;
    }
    if (userRole === 'principal') {
      query += ` AND r.name NOT IN ('admin','principal')`;
    }
    query += ' ORDER BY u.created_at DESC';
    const [rows] = await pool.execute(query, params);
    res.json(rows.map(r => { const {login_password, ...rest} = r; return rest; }));
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.addEmployee = async (req, res) => {
  try {
    const { full_name, role_id, login_user_id, login_password, phone, email, date_of_birth, qualification, subject, salary, joining_date, class_assigned } = req.body;

    // Guard: no duplicate employee (same name + date of birth + phone), across active AND deactivated records
    const [dupRows] = await pool.execute(
      `SELECT id, is_active FROM users WHERE LOWER(TRIM(full_name)) = LOWER(TRIM(?)) AND date_of_birth = ? AND phone = ?`,
      [full_name, date_of_birth, phone]
    );
    if (dupRows.length) {
      const existing = dupRows[0];
      if (!existing.is_active) {
        return res.status(409).json({ message: `${full_name} already exists (deactivated) — reactivate instead of adding a new record.` });
      }
      return res.status(409).json({ message: `${full_name} already exists as an active employee with the same date of birth and phone number.` });
    }

    const emp_id = await generateEmpId();
    const hashedPass = await bcrypt.hash(login_password, 10);
    const classVal = class_assigned && class_assigned !== '' ? class_assigned : null;
    const subjectVal = subject && subject !== '' ? subject : null;

    const [result] = await pool.execute(
      `INSERT INTO users (emp_id, full_name, role_id, login_user_id, login_password, phone, email, date_of_birth, qualification, subject, salary, joining_date, class_assigned)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [emp_id, full_name, role_id, login_user_id, hashedPass, phone, email || null, date_of_birth || null, qualification, subjectVal, salary, joining_date, classVal]
    );

    // Get role name for notification
    const [roleRows] = await pool.execute('SELECT name FROM roles WHERE id = ?', [role_id]);
    const roleName = roleRows[0]?.name || 'Staff';

    // ✅ Send welcome email
    if (email) {
  sendEmployeeWelcomeEmail(email, full_name, emp_id, login_user_id, roleName, login_password)
    .catch(e => console.error('Employee welcome email failed:', e.message));
}

if (phone) {
  sendEmployeeWelcomeWhatsApp(phone, full_name, emp_id, login_user_id, roleName, login_password)
    .catch(e => console.error('Employee welcome WhatsApp failed:', e.message));
}

    res.json({ message: 'Employee added successfully', emp_id, id: result.insertId });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.updateEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    const { full_name, phone, email, date_of_birth, qualification, subject, salary, joining_date, class_assigned } = req.body;

    // Guard: deactivated employees cannot be edited (use the reactivate button first)
    const [activeCheck] = await pool.execute('SELECT is_active, full_name FROM users WHERE id = ?', [id]);
    if (!activeCheck.length) return res.status(404).json({ message: 'Employee not found' });
    if (!activeCheck[0].is_active) {
      return res.status(403).json({ message: `${activeCheck[0].full_name} is deactivated and cannot be edited. Reactivate first.` });
    }

    await pool.execute(
      `UPDATE users SET full_name=?, phone=?, email=?, date_of_birth=?, qualification=?, subject=?, salary=?, joining_date=?, class_assigned=? WHERE id=?`,
      [full_name, phone, email || null, date_of_birth || null, qualification, subject, salary, joining_date, class_assigned, id]
    );

    // ✅ Send update email
    if (email) {
      sendEmployeeUpdateEmail(email, full_name)
        .catch(e => console.error('Employee update email failed:', e.message));
    }

    // ✅ Send update WhatsApp
    if (phone) {
      sendEmployeeUpdateWhatsApp(phone, full_name)
        .catch(e => console.error('Employee update WhatsApp failed:', e.message));
    }

    res.json({ message: 'Employee updated successfully' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.getEmployeeById = async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT u.*, r.name as role_name, c.name as class_name 
       FROM users u LEFT JOIN roles r ON u.role_id = r.id LEFT JOIN classes c ON u.class_assigned = c.id
       WHERE u.id = ?`, [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Employee not found' });
    const {login_password, ...rest} = rows[0];
    res.json(rest);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.toggleEmployeeStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute('SELECT is_active, login_user_id FROM users WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ message: 'Employee not found' });
    if (rows[0].login_user_id === 'admin') return res.status(403).json({ message: 'Cannot deactivate admin' });
    const newStatus = rows[0].is_active ? 0 : 1;

    await pool.execute(
      'UPDATE users SET is_active = ?, deactivated_date = ? WHERE id = ?',
      [newStatus, newStatus ? null : new Date().toISOString().split('T')[0], id]
    );

    res.json({ message: newStatus ? 'Employee activated' : 'Employee deactivated' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};
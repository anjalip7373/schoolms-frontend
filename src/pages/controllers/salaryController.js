const { sendSalaryWhatsApp } = require('../config/whatsappService');
const { sendSalarySlipNotification } = require('../config/emailService');


const pool = require('../config/db');

const generateSlipNo = async () => {
  const [rows] = await pool.execute('SELECT COUNT(*) as cnt FROM salary_slips');
  return `SAL${String(rows[0].cnt + 1).padStart(6,'0')}`;
};

exports.getSalarySlips = async (req, res) => {
  try {
    const { employee_id, from_month, from_year, to_month, to_year } = req.query;

    let query = `SELECT ss.*, u.full_name, u.emp_id, u.phone, r.name as role_name
                 FROM salary_slips ss JOIN users u ON ss.employee_id = u.id
                 LEFT JOIN roles r ON u.role_id = r.id WHERE 1=1`;
    const params = [];

    // Date range filter
    if (from_month && from_year) {
      const fromStr = `${from_year}-${String(from_month).padStart(2,'0')}`;
      query += ' AND ss.month >= ?';
      params.push(fromStr);
    }
    if (to_month && to_year) {
      const toStr = `${to_year}-${String(to_month).padStart(2,'0')}`;
      query += ' AND ss.month <= ?';
      params.push(toStr);
    }

    if (employee_id) { query += ' AND ss.employee_id = ?'; params.push(employee_id); }

    // Principal can only see employees not admin/principal
    if (req.user.role === 'principal') {
      query += ` AND u.role_id IN (SELECT id FROM roles WHERE name NOT IN ('admin','principal'))`;
    }

    query += ' ORDER BY ss.created_at DESC';
    const [rows] = await pool.execute(query, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.generateSalarySlip = async (req, res) => {
  try {
    const { employee_id, month, year, basic_salary, deductions, remarks } = req.body;

    // Guard: deactivated employees cannot have salary slips generated
    const [empCheck] = await pool.execute('SELECT is_active, full_name FROM users WHERE id = ?', [employee_id]);
    if (!empCheck.length) return res.status(404).json({ message: 'Employee not found' });
    if (!empCheck[0].is_active) {
      return res.status(403).json({ message: `${empCheck[0].full_name} is deactivated and cannot receive a salary slip` });
    }
    
    // Check if principal trying to generate for admin/principal
    if (req.user.role === 'principal') {
      const [emp] = await pool.execute(`SELECT r.name FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = ?`, [employee_id]);
      if (emp.length && ['admin','principal'].includes(emp[0].name)) {
        return res.status(403).json({ message: 'Principal cannot generate salary for admin or principal' });
      }
    }
    
    const monthStr = `${year}-${String(month).padStart(2,'0')}`;
    const net_salary = parseFloat(basic_salary) - parseFloat(deductions || 0);
    const slip_no = await generateSlipNo();
    
    await pool.execute(
      `INSERT INTO salary_slips (slip_no, employee_id, month, basic_salary, deductions, net_salary, generated_by)
       VALUES (?,?,?,?,?,?,?)`,
      [slip_no, employee_id, monthStr, basic_salary, deductions || 0, net_salary, req.user.id]
    );

    // ── Send salary slip email with PDF ──
    try {
      const [empRows] = await pool.execute(
        `SELECT u.full_name, u.email, u.emp_id, u.phone,
         r.name as role_name
         FROM users u LEFT JOIN roles r ON u.role_id = r.id
         WHERE u.id = ?`,
        [employee_id]
      );

      if (empRows.length && empRows[0].email) {
        const emp = empRows[0];
        const slipData = {
          slip_no,
          full_name: emp.full_name,
          emp_id: emp.emp_id,
          role_name: emp.role_name,
          month: monthStr,
          basic_salary,
          deductions: deductions || 0,
          net_salary,
          status: 'paid'
        };
        sendSalarySlipNotification(emp.email, slipData)
          .then(() => console.log('Salary slip PDF email sent to:', emp.email))
          .catch(e => console.error('Salary email failed:', e.message));

       // Send WhatsApp
      if (empRows[0]?.phone) {
        sendSalaryWhatsApp(
          empRows[0].phone,
          empRows[0].full_name,
          monthStr,
          net_salary,
          slip_no
        ).catch(e => console.error('Salary WhatsApp failed:', e.message));
      }
       
      }
    } catch (emailErr) {
      console.error('Salary email error:', emailErr.message);
    }

    res.json({ message: 'Salary slip generated', slip_no });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.updateSalaryStatus = async (req, res) => {
  try {
    await pool.execute(`UPDATE salary_slips SET status = 'paid' WHERE id = ?`, [req.params.id]);
    res.json({ message: 'Salary marked as paid' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.getSalarySlipById = async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT ss.*, u.full_name, u.emp_id, u.phone, r.name as role_name, u.qualification, u.subject,
       gen.full_name as generated_by_name
       FROM salary_slips ss JOIN users u ON ss.employee_id = u.id
       LEFT JOIN roles r ON u.role_id = r.id
       LEFT JOIN users gen ON ss.generated_by = gen.id
       WHERE ss.id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Slip not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.getDashboardSalaryStats = async (req, res) => {
  try {
    const { month, year } = req.query;
    const monthStr = `${year}-${String(month).padStart(2,'0')}`;

    // Teachers cannot see salary stats
    const isTeacher = req.user.role === 'Teacher' || req.user.role === 'teacher';
    if (isTeacher) {
      return res.json({ total: 0, generated: 0, not_generated: 0, details: [] });
    }

    const [rows] = await pool.execute(
      `SELECT u.id, u.full_name, u.emp_id, r.name as role_name, u.is_active,
       ss.id as slip_id, ss.status, ss.net_salary
       FROM users u 
       LEFT JOIN roles r ON u.role_id = r.id
       LEFT JOIN salary_slips ss ON ss.employee_id = u.id AND ss.month = ?
       ORDER BY u.full_name`,
      [monthStr]
    );

    const generated = rows.filter(r => r.slip_id).length;
    const notGenerated = rows.filter(r => !r.slip_id).length;

    res.json({
      total: rows.length,
      generated,
      not_generated: notGenerated,
      details: rows
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getAllEmployeesWithSalaryStatus = async (req, res) => {
  try {
    const { from_month, from_year, to_month, to_year } = req.query;
    const userRole = req.user.role;

    const fromM = String(from_month || (new Date().getMonth() + 1)).padStart(2, '0');
    const fromY = String(from_year || new Date().getFullYear());
    const toM = String(to_month || (new Date().getMonth() + 1)).padStart(2, '0');
    const toY = String(to_year || new Date().getFullYear());

    const fromStr = `${fromY}-${fromM}`;
    const toStr = `${toY}-${toM}`;

    console.log('Salary status range:', fromStr, 'to', toStr);

    let query = `
      SELECT 
        u.id, u.emp_id, u.full_name, r.name as role_name, u.is_active, u.deactivated_date,
        ss.id as slip_id, ss.slip_no, ss.month as salary_month,
        ss.basic_salary, ss.deductions, ss.net_salary,
        CASE WHEN ss.id IS NOT NULL THEN ss.status ELSE 'not_generated' END as payment_status
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      LEFT JOIN salary_slips ss 
        ON ss.employee_id = u.id
        AND ss.month >= ?
        AND ss.month <= ?
      WHERE 1=1`;

    const params = [fromStr, toStr];

    if (userRole === 'principal') {
      query += ` AND r.name NOT IN ('admin','principal')`;
    }

    query += ` ORDER BY 
      CASE WHEN ss.id IS NOT NULL THEN 0 ELSE 1 END,
      u.full_name`;

    const [rows] = await pool.execute(query, params);
    console.log('Salary status results:', rows.length, 'rows');
    res.json(rows);
  } catch (err) {
    console.error('Salary status error:', err.message);
    res.status(500).json({ message: err.message });
  }
};
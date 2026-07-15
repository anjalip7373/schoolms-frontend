const { sendFeeWhatsApp } = require('../config/whatsappService');
const { sendFeePaymentNotification } = require('../config/emailService');


const pool = require('../config/db');

const generateReceiptNo = async () => {
  const [rows] = await pool.execute('SELECT COUNT(*) as cnt FROM fee_payments');
  return `RCP${String(rows[0].cnt + 1).padStart(6,'0')}`;
};

exports.getFeePayments = async (req, res) => {
  try {
    const { search, from_month, from_year, to_month, to_year } = req.query;
    let { class_id } = req.query;

    // Force teacher to their class only
    const isTeacher = req.user.role === 'Teacher' || req.user.role === 'teacher';
    if (isTeacher) {
      const [empRows] = await pool.execute('SELECT class_assigned FROM users WHERE id = ?', [req.user.id]);
      class_id = empRows[0]?.class_assigned || null;
    }

    let query = `SELECT fp.*, fp.remarks, fp.receipt_no, s.full_name, s.roll_no, 
                 c.name as class_name, ft.name as fee_type_name, s.phone
                 FROM fee_payments fp 
                 JOIN students s ON fp.student_id = s.id
                 LEFT JOIN classes c ON s.class_id = c.id
                 JOIN fee_types ft ON fp.fee_type_id = ft.id
                 WHERE 1=1`;
    const params = [];

    if (class_id) { query += ' AND s.class_id = ?'; params.push(class_id); }
    if (search) { query += ' AND (s.full_name LIKE ? OR s.roll_no LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }

    // Date range filter
    if (from_month && from_year) {
      const fromDate = `${from_year}-${String(from_month).padStart(2,'0')}-01`;
      query += ' AND fp.payment_date >= ?';
      params.push(fromDate);
    }
    if (to_month && to_year) {
      // Last day of to_month
      const toDate = `${to_year}-${String(to_month).padStart(2,'0')}-31`;
      query += ' AND fp.payment_date <= ?';
      params.push(toDate);
    }

    query += ' ORDER BY fp.created_at DESC';
    const [rows] = await pool.execute(query, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.createFeePayment = async (req, res) => {
  try {
    const { student_id, fee_type_id, amount, payment_date, payment_month, payment_method, remarks } = req.body;

    // Guard: deactivated students cannot have fee payments recorded
    const [studentCheck] = await pool.execute('SELECT fee_status, full_name FROM students WHERE id = ?', [student_id]);
    if (!studentCheck.length) return res.status(404).json({ message: 'Student not found' });
    if (studentCheck[0].fee_status !== 'active') {
      return res.status(403).json({ message: `${studentCheck[0].full_name} is deactivated and cannot receive fee payments` });
    }

    const receipt_no = await generateReceiptNo();

    await pool.execute(
      `INSERT INTO fee_payments (receipt_no, student_id, fee_type_id, amount, payment_date, payment_month, payment_method, remarks, generated_by)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [receipt_no, student_id, fee_type_id, amount, payment_date, payment_month, payment_method || 'Cash', remarks, req.user.id]
    );

    // Fetch student and fee type details for email
    // Send fee payment email with PDF
    try {
      const [studentRows] = await pool.execute(
        `SELECT s.full_name, s.email, s.phone, s.roll_no,
         c.name as class_name, ft.name as fee_type_name
         FROM students s
         LEFT JOIN classes c ON s.class_id = c.id
         LEFT JOIN fee_types ft ON ft.id = ?
         WHERE s.id = ?`,
        [fee_type_id, student_id]
      );

      if (studentRows.length && studentRows[0].email) {
        const s = studentRows[0];
        const receiptData = {
          receipt_no,
          full_name: s.full_name,
          roll_no: s.roll_no,
          class_name: s.class_name,
          fee_type_name: s.fee_type_name,
          amount,
          payment_date,
          payment_month,
          payment_method: payment_method || 'Cash',
          remarks: remarks || ''
        };
        sendFeePaymentNotification(s.email, receiptData)
          .then(() => console.log('Fee receipt PDF email sent to:', s.email))
          .catch(e => console.error('Fee email failed:', e.message));

        // ── Send WhatsApp notification ──
       // Send WhatsApp
      if (studentRows[0].phone) {
        sendFeeWhatsApp(
          studentRows[0].phone,
          studentRows[0].full_name,
          studentRows[0].class_name,
          receipt_no,
          amount,
          studentRows[0].fee_type_name,
          payment_date,
          payment_method || 'Cash'
        ).catch(e => console.error('Fee WhatsApp failed:', e.message));
      }
      }
    } catch (emailErr) {
      console.error('Fee email error:', emailErr.message);
    
    }

    res.json({ message: 'Fee payment recorded', receipt_no });
  } catch (err) {
    console.error('Create fee payment error:', err);
    res.status(500).json({ message: err.message });
  }
};

exports.getReceiptById = async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT fp.*, fp.payment_method, s.full_name, s.roll_no, s.phone, s.email, 
       c.name as class_name, ft.name as fee_type_name, u.full_name as generated_by_name
       FROM fee_payments fp 
       JOIN students s ON fp.student_id = s.id
       LEFT JOIN classes c ON s.class_id = c.id
       JOIN fee_types ft ON fp.fee_type_id = ft.id
       LEFT JOIN users u ON fp.generated_by = u.id
       WHERE fp.id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Receipt not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.getDashboardFeeStats = async (req, res) => {
  try {
    const { month, year } = req.query;
    let { class_id } = req.query;
    const monthStr = `${year}-${String(month).padStart(2,'0')}`;

    // Force teacher to their class only
    const isTeacher = req.user.role === 'Teacher' || req.user.role === 'teacher';
    if (isTeacher) {
      const [empRows] = await pool.execute(
        'SELECT class_assigned FROM users WHERE id = ?', [req.user.id]
      );
      class_id = empRows[0]?.class_assigned || null;
    }

    let query = `
      SELECT s.id, s.full_name, s.roll_no, c.name as class_name,
      SUM(CASE WHEN DATE_FORMAT(fp.payment_date,'%Y-%m') = ? THEN fp.amount ELSE 0 END) as paid_amount,
      COUNT(CASE WHEN DATE_FORMAT(fp.payment_date,'%Y-%m') = ? THEN 1 END) as payment_count
      FROM students s 
      LEFT JOIN classes c ON s.class_id = c.id
      LEFT JOIN fee_payments fp ON fp.student_id = s.id
      WHERE 1=1`;
    const params = [monthStr, monthStr];

    if (class_id) {
      query += ' AND s.class_id = ?';
      params.push(class_id);
    }

    query += ' GROUP BY s.id ORDER BY c.name, s.roll_no';
    const [rows] = await pool.execute(query, params);

    const paid = rows.filter(r => r.payment_count > 0).length;
    const notPaid = rows.filter(r => r.payment_count === 0).length;

    res.json({
      total: rows.length,
      paid,
      not_paid: notPaid,
      details: rows
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getFeeAudit = async (req, res) => {
  try {
    // Admin-only — this report is not gated by the configurable Roles/access system
    const role = (req.user.role || '').toLowerCase();
    if (role !== 'admin') {
      return res.status(403).json({ message: 'Only Admin can view the fee audit report.' });
    }

    const { academic_year, from_month, from_year, to_month, to_year } = req.query;

    let fromDate, toDate;
    if (from_month && from_year && to_month && to_year) {
      // Custom range takes priority when provided
      fromDate = `${from_year}-${String(from_month).padStart(2, '0')}-01`;
      const lastDay = new Date(parseInt(to_year), parseInt(to_month), 0).getDate();
      toDate = `${to_year}-${String(to_month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    } else if (academic_year && academic_year.includes('-')) {
      const [y1, y2] = academic_year.split('-');
      fromDate = `${y1}-04-01`;
      toDate = `${y2}-03-31`;
    } else {
      const now = new Date();
      const startYear = (now.getMonth() + 1) >= 4 ? now.getFullYear() : now.getFullYear() - 1;
      fromDate = `${startYear}-04-01`;
      toDate = `${startYear + 1}-03-31`;
    }

    // Columns = every configured fee type
    const [feeTypeRows] = await pool.execute('SELECT name FROM fee_types ORDER BY name');
    const feeTypeNames = feeTypeRows.map(f => f.name);

    // All payments in this academic year
    const [rows] = await pool.execute(`
      SELECT fp.receipt_no as bill_no, fp.payment_date, fp.amount,
             ft.name as fee_type_name, c.name as class_name
      FROM fee_payments fp
      JOIN students s ON fp.student_id = s.id
      LEFT JOIN classes c ON s.class_id = c.id
      JOIN fee_types ft ON fp.fee_type_id = ft.id
      WHERE fp.payment_date >= ? AND fp.payment_date <= ?
      ORDER BY fp.payment_date ASC, fp.receipt_no ASC
    `, [fromDate, toDate]);

    // Group by bill no (receipt_no) — pivot fee types into columns
    const billMap = {};
    rows.forEach(r => {
      if (!billMap[r.bill_no]) {
        billMap[r.bill_no] = {
          bill_no: r.bill_no,
          payment_date: r.payment_date,
          class_name: r.class_name,
          fees: {},
          total: 0
        };
      }
      billMap[r.bill_no].fees[r.fee_type_name] = (billMap[r.bill_no].fees[r.fee_type_name] || 0) + parseFloat(r.amount);
      billMap[r.bill_no].total += parseFloat(r.amount);
    });

    const bills = Object.values(billMap).sort((a, b) => {
      const dateDiff = new Date(a.payment_date) - new Date(b.payment_date);
      if (dateDiff !== 0) return dateDiff;
      return a.bill_no.localeCompare(b.bill_no);
    });

    const grandTotal = bills.reduce((sum, b) => sum + b.total, 0);

    res.json({
      academic_year: academic_year || `${fromDate.slice(0,4)}-${toDate.slice(0,4)}`,
      fee_types: feeTypeNames,
      bills,
      grand_total: grandTotal
    });
  } catch (err) {
    console.error('Fee audit error:', err.message);
    res.status(500).json({ message: err.message });
  }
};

exports.getAllStudentsWithFeeStatus = async (req, res) => {
  try {
    const { from_month, from_year, to_month, to_year, class_id } = req.query;

    // Build date range properly
    const fromM = String(from_month || (new Date().getMonth() + 1)).padStart(2, '0');
    const fromY = String(from_year || new Date().getFullYear());
    const toM = String(to_month || (new Date().getMonth() + 1)).padStart(2, '0');
    const toY = String(to_year || new Date().getFullYear());

    const fromDate = `${fromY}-${fromM}-01`;
    
    // Calculate actual last day of to_month
    const lastDay = new Date(parseInt(toY), parseInt(toM), 0).getDate();
    const toDate = `${toY}-${toM}-${String(lastDay).padStart(2,'0')}`;
    
    console.log('Fee status date range:', fromDate, 'to', toDate);

    

    // Force teacher to their class
    let effectiveClassId = class_id || null;
    const isTeacher = req.user.role === 'Teacher' || req.user.role === 'teacher';
    if (isTeacher) {
      const [empRows] = await pool.execute('SELECT class_assigned FROM users WHERE id = ?', [req.user.id]);
      effectiveClassId = empRows[0]?.class_assigned || null;
    }

    let query = `
      SELECT 
        s.id, 
        s.roll_no, 
        s.full_name, 
        c.name as class_name,
        s.fee_status as student_status,
        s.deactivated_date,
        COALESCE(SUM(fp.amount), 0) as paid_amount,
        COUNT(fp.id) as payment_count,
        GROUP_CONCAT(DISTINCT ft.name ORDER BY fp.payment_date SEPARATOR ', ') as fee_types_paid,
        MAX(fp.payment_date) as last_payment_date,
        MAX(fp.payment_method) as payment_method,
        CASE WHEN COUNT(fp.id) > 0 THEN 'Paid' ELSE 'Unpaid' END as fee_status
      FROM students s
      LEFT JOIN classes c ON s.class_id = c.id
      LEFT JOIN fee_payments fp 
        ON fp.student_id = s.id
        AND DATE(fp.payment_date) >= ?
        AND DATE(fp.payment_date) <= ?
      LEFT JOIN fee_types ft ON fp.fee_type_id = ft.id
      WHERE 1=1`;

    const params = [fromDate, toDate];

    if (effectiveClassId) {
      query += ' AND s.class_id = ?';
      params.push(effectiveClassId);
    }

    query += ` GROUP BY s.id, s.roll_no, s.full_name, c.name,  s.deactivated_date
               ORDER BY 
                 CASE WHEN COUNT(fp.id) > 0 THEN 0 ELSE 1 END,
                 c.name, s.roll_no`;

    console.log('Executing fee status query with params:', params);
    const [rows] = await pool.execute(query, params);
    console.log('Fee status results:', rows.length, 'rows');
    res.json(rows);
  } catch (err) {
    console.error('Fee status error:', err.message);
    res.status(500).json({ message: err.message });
  }
};
const { sendAttendanceWhatsApp } = require('../config/whatsappService');
const { sendAttendanceNotification } = require('../config/emailService');
const pool = require('../config/db');

const getTeacherClass = async (userId, role) => {
  const isTeacher = role === 'Teacher' || role === 'teacher';
  if (!isTeacher) return null;
  const [rows] = await pool.execute('SELECT class_assigned FROM users WHERE id = ?', [userId]);
  return rows[0]?.class_assigned || null;
};

exports.getAttendance = async (req, res) => {
  try {
    const { date, person_type } = req.query;
    const attendanceDate = date || new Date().toISOString().split('T')[0];
    const teacherClass = await getTeacherClass(req.user.id, req.user.role);
    const effectiveClassId = teacherClass || req.query.class_id || null;
    let people = [];

    if (person_type === 'student' || !person_type) {
      let query = `
        SELECT s.id, s.full_name, s.roll_no as identifier, c.name as class_name, 'student' as person_type,
        s.fee_status, COALESCE(a.status, 'absent') as status
        FROM students s 
        LEFT JOIN classes c ON s.class_id = c.id
        LEFT JOIN attendance a ON a.person_id = s.id 
          AND a.person_type = 'student' 
          AND a.attendance_date = ?
        WHERE 1=1`;
      const params = [attendanceDate];
      if (effectiveClassId) { query += ' AND s.class_id = ?'; params.push(effectiveClassId); }
      query += ' ORDER BY c.name, s.roll_no';
      const [students] = await pool.execute(query, params);
      people = [...people, ...students];
    }

    if (person_type === 'employee') {
      if (teacherClass) return res.json({ date: attendanceDate, attendance: [] });

      const userRole = req.user.role;
      let empQuery = `
        SELECT u.id, u.full_name, u.emp_id as identifier, r.name as class_name, 'employee' as person_type,
        u.is_active, COALESCE(a.status, 'absent') as status
        FROM users u LEFT JOIN roles r ON u.role_id = r.id
        LEFT JOIN attendance a ON a.person_id = u.id 
          AND a.person_type = 'employee' 
          AND a.attendance_date = ?
        WHERE 1=1`;

      const empParams = [attendanceDate];

      // Principal cannot see admin or other principals
      if (userRole === 'principal') {
        empQuery += ` AND r.name NOT IN ('admin', 'principal')`;
      }

      empQuery += ` ORDER BY u.full_name`;

      const [employees] = await pool.execute(empQuery, empParams);
      people = [...people, ...employees];
    }
    res.json({ date: attendanceDate, attendance: people });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.saveAttendance = async (req, res) => {
  try {
    const { attendance_date, records } = req.body;
    const today = new Date().toISOString().split('T')[0];
    if (attendance_date !== today) {
      return res.status(400).json({ message: 'Can only edit today\'s attendance' });
    }

    // Deactivated students/employees stay visible in the attendance list (for roster completeness),
    // but marking them is silently skipped here — no error, no popup, the rest of the class/staff saves fine.
    const studentIds = records.filter(r => r.person_type === 'student').map(r => r.person_id);
    const employeeIds = records.filter(r => r.person_type === 'employee').map(r => r.person_id);

    let activeStudentIds = new Set();
    if (studentIds.length) {
      const placeholders = studentIds.map(() => '?').join(',');
      const [rows] = await pool.execute(`SELECT id FROM students WHERE id IN (${placeholders}) AND fee_status = 'active'`, studentIds);
      activeStudentIds = new Set(rows.map(r => r.id));
    }

    let activeEmployeeIds = new Set();
    if (employeeIds.length) {
      const placeholders = employeeIds.map(() => '?').join(',');
      const [rows] = await pool.execute(`SELECT id FROM users WHERE id IN (${placeholders}) AND is_active = 1`, employeeIds);
      activeEmployeeIds = new Set(rows.map(r => r.id));
    }

    for (const rec of records) {
      const isActivePerson = rec.person_type === 'student'
        ? activeStudentIds.has(rec.person_id)
        : activeEmployeeIds.has(rec.person_id);
      if (!isActivePerson) continue; // deactivated — no record written, no notification sent

      await pool.execute(
        `INSERT INTO attendance (person_type, person_id, attendance_date, status, marked_by)
         VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE status=?, marked_by=?`,
        [rec.person_type, rec.person_id, attendance_date, rec.status, req.user.id, rec.status, req.user.id]
      );

      // ─── ORIGINAL STUDENT NOTIFICATION (UNTOUCHED) ───
      if (rec.person_type === 'student' && ['absent','late','halfday'].includes(rec.status)) {
        try {
          const [studentRows] = await pool.execute(
            `SELECT s.full_name, s.email, s.phone, s.whatsapp_no, c.name as class_name
             FROM students s LEFT JOIN classes c ON s.class_id = c.id
             WHERE s.id = ?`,
            [rec.person_id]
          );

          if (studentRows.length) {
            const student = studentRows[0];

            // Send WhatsApp
            const waPhone = student.whatsapp_no || student.phone;
            if (waPhone) {
              sendAttendanceWhatsApp(
                waPhone,
                student.full_name,
                student.class_name,
                attendance_date,
                rec.status
              ).catch(e => console.error('WhatsApp failed:', e.message));
            }

            // Send Email
            if (student.email) {
              sendAttendanceNotification(
                student.email,
                'Parent/Guardian',
                student.full_name,
                student.class_name,
                attendance_date,
                rec.status
              ).catch(e => console.error('Email failed:', e.message));
            }
          }
        } catch (err) {
          console.error('Notification error:', err.message);
        }
      }

      // ─── NEW ADD-ON: AUTOMATED EMPLOYEE NOTIFICATION SYSTEM ───
      if (rec.person_type === 'employee' && ['absent','late','halfday'].includes(rec.status)) {
        try {
          // Fetching Employee details directly from users and roles tables
          const [employeeRows] = await pool.execute(
            `SELECT u.full_name, u.email, u.phone, r.name as role_name
             FROM users u 
             LEFT JOIN roles r ON u.role_id = r.id
             WHERE u.id = ?`,
            [rec.person_id]
          );

          if (employeeRows.length) {
            const employee = employeeRows[0];

            // 1. WhatsApp Notification Trigger (Using Twilio WhatsApp connection service)
            if (employee.phone) {
              sendAttendanceWhatsApp(
                employee.phone,
                employee.full_name,
                employee.role_name || 'Staff',
                attendance_date,
                rec.status
              ).catch(e => console.error('Employee Attendance WhatsApp failed:', e.message));
            }

            // 2. Email Notification Trigger (Using Nodemailer connection service)
            if (employee.email) {
              sendAttendanceNotification(
                employee.email,
                employee.role_name || 'Staff',
                employee.full_name,
                'Staff Management',
                attendance_date,
                rec.status
              ).catch(e => console.error('Employee Attendance Email failed:', e.message));
            }
          }
        } catch (err) {
          console.error('Employee Notification system error:', err.message);
        }
      }
      // ─── END OF ADD-ON ───
    }

    res.json({ message: 'Attendance saved successfully' });
  } catch (err) {
    console.error('Save attendance error:', err);
    res.status(500).json({ message: err.message });
  }
};

exports.getAttendanceReport = async (req, res) => {
  try {
    const { class_id, person_type, from_month, from_year, to_month, to_year } = req.query;

    const fromM = String(parseInt(from_month) || (new Date().getMonth() + 1)).padStart(2, '0');
    const fromY = String(parseInt(from_year) || new Date().getFullYear());
    const toM = String(parseInt(to_month) || (new Date().getMonth() + 1)).padStart(2, '0');
    const toY = String(parseInt(to_year) || new Date().getFullYear());

    const lastDay = new Date(parseInt(toY), parseInt(toM), 0).getDate();
    const fromDate = `${fromY}-${fromM}-01`;
    const toDate = `${toY}-${toM}-${lastDay}`;

    console.log('REPORT DATE RANGE:', fromDate, 'to', toDate);

    const teacherClass = await getTeacherClass(req.user.id, req.user.role);
    const effectiveClassId = teacherClass || class_id || null;

    let results = [];

    if (person_type === 'student' || !person_type) {
      let query = `
        SELECT s.id, s.roll_no, s.full_name, c.name as class_name, s.fee_status, s.deactivated_date,
        COUNT(CASE WHEN a.status = 'present' THEN 1 END) as present_days,
        COUNT(CASE WHEN a.status = 'absent' THEN 1 END) as absent_days,
        COUNT(CASE WHEN a.status = 'late' THEN 1 END) as late_days,
        COUNT(CASE WHEN a.status = 'halfday' THEN 1 END) as halfday_days,
        COUNT(a.id) as total_marked
        FROM students s
        LEFT JOIN classes c ON s.class_id = c.id
        LEFT JOIN attendance a 
          ON a.person_id = s.id
          AND a.person_type = 'student'
          AND a.attendance_date >= ?
          AND a.attendance_date <= ?
        WHERE 1=1`;

      const params = [fromDate, toDate];
      if (effectiveClassId) {
        query += ' AND s.class_id = ?';
        params.push(parseInt(effectiveClassId));
      }
      query += ' GROUP BY s.id, s.roll_no, s.full_name, c.name, s.deactivated_date ORDER BY c.name, s.roll_no';

      console.log('EXECUTING STUDENT QUERY with params:', params);
      const [rows] = await pool.execute(query, params);
      results = [...results, ...rows];
    }

    if (person_type === 'employee' && !teacherClass) {
      const userRole = req.user.role;

      let empQuery = `
        SELECT u.id, u.emp_id as roll_no, u.full_name, r.name as class_name, u.is_active, u.deactivated_date,
        COUNT(CASE WHEN a.status = 'present' THEN 1 END) as present_days,
        COUNT(CASE WHEN a.status = 'absent' THEN 1 END) as absent_days,
        COUNT(CASE WHEN a.status = 'late' THEN 1 END) as late_days,
        COUNT(CASE WHEN a.status = 'halfday' THEN 1 END) as halfday_days,
        COUNT(a.id) as total_marked
        FROM users u
        LEFT JOIN roles r ON u.role_id = r.id
        LEFT JOIN attendance a ON a.person_id = u.id
          AND a.person_type = 'employee'
          AND a.attendance_date >= ?
          AND a.attendance_date <= ?
        WHERE 1=1`;

      const empParams = [fromDate, toDate];

      if (userRole === 'principal') {
        empQuery += ` AND r.name NOT IN ('admin', 'principal')`;
      }

      empQuery += ` GROUP BY u.id, u.emp_id, u.full_name, r.name, u.is_active, u.deactivated_date ORDER BY u.full_name`;

      const [rows] = await pool.execute(empQuery, empParams);
      results = [...results, ...rows];
    }

    res.json(results);
  } catch (err) {
    console.error('REPORT ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
};

exports.getDailyReport = async (req, res) => {
  try {
    const m = parseInt(req.query.month) || (new Date().getMonth() + 1);
    const y = parseInt(req.query.year) || new Date().getFullYear();
    const class_id = req.query.class_id || null;
    const person_type = req.query.person_type || 'student';

    const firstDay = `${y}-${String(m).padStart(2,'0')}-01`;
    const lastDay = `${y}-${String(m).padStart(2,'0')}-${new Date(y, m, 0).getDate()}`;

    const teacherClass = await getTeacherClass(req.user.id, req.user.role);
    const effectiveClassId = teacherClass || class_id || null;

    let sql = '';
    let params = [];

    if (person_type === 'employee') {
      sql = `SELECT a.person_id, a.attendance_date, a.status
             FROM attendance a
             INNER JOIN users u ON a.person_id = u.id
             LEFT JOIN roles r ON u.role_id = r.id
             WHERE a.person_type = 'employee'
             AND a.attendance_date >= ? AND a.attendance_date <= ?`;
      params = [firstDay, lastDay];
      if (req.user.role === 'principal') {
        sql += ` AND r.name NOT IN ('admin','principal')`;
      }
    } else {
      sql = `SELECT a.person_id, a.attendance_date, a.status
             FROM attendance a
             INNER JOIN students s ON a.person_id = s.id
             WHERE a.person_type = 'student'
             AND a.attendance_date >= ? AND a.attendance_date <= ?`;
      params = [firstDay, lastDay];
      if (effectiveClassId) {
        sql += ` AND s.class_id = ?`;
        params.push(effectiveClassId);
      }
    }

    const [rows] = await pool.execute(sql, params);
    const result = {};

    rows.forEach(row => {
      const personId = String(row.person_id);
      let dateStr;
      const rawDate = row.attendance_date;

      if (rawDate instanceof Date) {
        const offset = rawDate.getTimezoneOffset();
        const corrected = new Date(rawDate.getTime() - (offset * 60 * 1000));
        dateStr = corrected.toISOString().split('T')[0];
      } else if (typeof rawDate === 'string') {
        dateStr = rawDate.includes('T') ? rawDate.split('T')[0] : rawDate.substring(0, 10);
      } else {
        dateStr = String(rawDate).substring(0, 10);
      }

      if (!result[personId]) result[personId] = {};
      result[personId][dateStr] = row.status;
    });

    res.json(result);
  } catch (err) {
    console.error('getDailyReport ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
};
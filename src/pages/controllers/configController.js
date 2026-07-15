const pool = require('../config/db');

// ─── COMPLETE SAFE DATABASE STRUCT & SCHEMA UPDATE INITIALIZER ───
pool.execute(`
  CREATE TABLE IF NOT EXISTS exam_subject_config (
    id INT AUTO_INCREMENT PRIMARY KEY,
    class_id INT NOT NULL,
    exam_type VARCHAR(50) NOT NULL,
    subject_id INT NOT NULL,
    max_marks INT NOT NULL,
    pass_marks INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
    UNIQUE KEY unique_class_exam_subject (class_id, exam_type, subject_id)
  )
`).then(async () => {
  // 1. Safe verification check if pass_marks missing inside older container run
  const [cols] = await pool.execute("SHOW COLUMNS FROM exam_subject_config LIKE 'pass_marks'");
  if(!cols.length) {
    await pool.execute("ALTER TABLE exam_subject_config ADD COLUMN pass_marks INT NOT NULL DEFAULT 7");
  }

  // 2. CRITICAL FIX: Convert student_marks table column to VARCHAR to accept dynamic exam strings
  try {
    await pool.execute("ALTER TABLE student_marks MODIFY COLUMN exam_type_id VARCHAR(50) NOT NULL");
    console.log("SCHEMA DUAL INTEGRITY: student_marks column migrated to VARCHAR successfully.");
  } catch (err) { console.log("Schema sync trace skipped for marks container:", err.message); }

  // 3. CRITICAL FIX: Convert student_exam_remarks table column to VARCHAR to accept text IDs
  try {
    await pool.execute("ALTER TABLE student_exam_remarks MODIFY COLUMN exam_type_id VARCHAR(50) NOT NULL");
    console.log("SCHEMA DUAL INTEGRITY: student_exam_remarks column migrated to VARCHAR successfully.");
  } catch (err) { console.log("Schema sync trace skipped for remarks container:", err.message); }

  console.log('CRITICAL LOG: exam_subject_config matrix engine running clean with structural text mappings!');
}).catch(err => console.error('Database configuration load error:', err.message));

// Classes Management - Fully Intact
exports.getClasses = async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM classes ORDER BY LENGTH(name), name');
    res.json(rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.addClass = async (req, res) => {
  try {
    await pool.execute('INSERT INTO classes (name) VALUES (?)', [req.body.name]);
    res.json({ message: 'Class added' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.updateClass = async (req, res) => {
  try {
    await pool.execute('UPDATE classes SET name=? WHERE id=?', [req.body.name, req.params.id]);
    res.json({ message: 'Class updated' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.deleteClass = async (req, res) => {
  try {
    const classId = req.params.id;

    // Block deletion if any students are still assigned to this class
    const [students] = await pool.execute('SELECT COUNT(*) as count FROM students WHERE class_id = ?', [classId]);
    if (students[0].count > 0) {
      return res.status(400).json({
        message: `Cannot delete this class — ${students[0].count} student(s) are still assigned to it. Please reassign or remove them first.`
      });
    }

    // Block deletion if any teacher is still assigned to this class
    const [teachers] = await pool.execute('SELECT COUNT(*) as count FROM users WHERE class_assigned = ?', [classId]);
    if (teachers[0].count > 0) {
      return res.status(400).json({
        message: `Cannot delete this class — a teacher is still assigned to it. Please reassign the teacher first.`
      });
    }

    await pool.execute('DELETE FROM classes WHERE id=?', [classId]);
    res.json({ message: 'Class deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// Fee Types Management - Fully Intact
exports.getFeeTypes = async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM fee_types ORDER BY name');
    res.json(rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.addFeeType = async (req, res) => {
  try {
    await pool.execute('INSERT INTO fee_types (name, amount) VALUES (?,?)', [req.body.name, req.body.amount || 0]);
    res.json({ message: 'Fee type added' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.updateFeeType = async (req, res) => {
  try {
    await pool.execute('UPDATE fee_types SET name=?, amount=? WHERE id=?', [req.body.name, req.body.amount || 0, req.params.id]);
    res.json({ message: 'Fee type updated' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.deleteFeeType = async (req, res) => {
  try {
    const feeTypeId = req.params.id;

    // Block deletion if any fee payments already reference this fee type
    const [payments] = await pool.execute('SELECT COUNT(*) as count FROM fee_payments WHERE fee_type_id = ?', [feeTypeId]);
    if (payments[0].count > 0) {
      return res.status(400).json({
        message: `Cannot delete this fee type — ${payments[0].count} payment record(s) already reference it. Payment history must be preserved.`
      });
    }

    await pool.execute('DELETE FROM fee_types WHERE id=?', [feeTypeId]);
    res.json({ message: 'Fee type deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// Roles Management - Fully Intact
exports.getRoles = async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM roles ORDER BY name');
    res.json(rows.map(r => {
      let access = [];
      try {
        if (typeof r.access === 'string' && r.access) access = JSON.parse(r.access);
        else if (Array.isArray(r.access)) access = r.access;
      } catch(e) { access = []; }
      return { ...r, access };
    }));
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.addRole = async (req, res) => {
  try {
    const access = Array.isArray(req.body.access) ? req.body.access : [];
    await pool.execute('INSERT INTO roles (name, access) VALUES (?,?)', [req.body.name, JSON.stringify(access)]);
    res.json({ message: 'Role added' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.updateRole = async (req, res) => {
  try {
    const access = Array.isArray(req.body.access) ? req.body.access : [];
    await pool.execute('UPDATE roles SET name=?, access=? WHERE id=?', [req.body.name, JSON.stringify(access), req.params.id]);
    res.json({ message: 'Role updated' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.deleteRole = async (req, res) => {
  try {
    const roleId = req.params.id;

    // Block deletion if any user still has this role assigned
    const [usersWithRole] = await pool.execute('SELECT COUNT(*) as count FROM users WHERE role_id = ?', [roleId]);
    if (usersWithRole[0].count > 0) {
      return res.status(400).json({
        message: `Cannot delete this role — ${usersWithRole[0].count} user(s) are still assigned to it. Please reassign them first.`
      });
    }

    await pool.execute('DELETE FROM roles WHERE id=?', [roleId]);
    res.json({ message: 'Role deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ─── ADD-ON EXAM MAPPINGS AND DELETION CONTROL MATRIX — FULLY ACTIVE ───
exports.getExamSettings = async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT esc.*, s.name as subject_name, c.name as class_name 
      FROM exam_subject_config esc
      JOIN subjects s ON esc.subject_id = s.id
      JOIN classes c ON esc.class_id = c.id
      ORDER BY c.name, esc.exam_type
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.saveExamSettings = async (req, res) => {
  try {
    const { class_id, exam_type, subject_id, max_marks, pass_marks } = req.body;
    await pool.execute(`
      INSERT INTO exam_subject_config (class_id, exam_type, subject_id, max_marks, pass_marks)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE max_marks = VALUES(max_marks), pass_marks = VALUES(pass_marks)
    `, [class_id, exam_type, subject_id, max_marks, pass_marks || 7]);
    res.json({ message: 'Exam criteria mapped successfully!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.deleteExamSetting = async (req, res) => {
  try {
    await pool.execute('DELETE FROM exam_subject_config WHERE id = ?', [req.params.id]);
    res.json({ message: 'Exam configuration deleted successfully!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};
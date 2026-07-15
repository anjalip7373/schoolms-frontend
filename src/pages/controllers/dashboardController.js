const pool = require('../config/db');

const getTeacherClass = async (userId, role) => {
  const isTeacher = role === 'Teacher' || role === 'teacher';
  if (!isTeacher) return null;
  const [rows] = await pool.execute('SELECT class_assigned FROM users WHERE id = ?', [userId]);
  return rows[0]?.class_assigned || null;
};

exports.getDashboard = async (req, res) => {
  try {
    const { month, year, class_id } = req.query;
    const currentMonth = month || new Date().getMonth() + 1;
    const currentYear = year || new Date().getFullYear();
    const monthStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
    const userRole = req.user.role;
    const userId = req.user.id;

    const teacherClass = await getTeacherClass(userId, userRole);
    const isTeacher = !!teacherClass;
    const effectiveClassId = isTeacher ? teacherClass : (class_id || null);

    const [allClasses] = await pool.execute('SELECT * FROM classes ORDER BY LENGTH(name), name');
    const visibleClasses = isTeacher ? allClasses.filter(c => c.id == teacherClass) : allClasses;

    // ── FEE STATS ──────────────────────────────────────────────────────────
    // Count distinct students who paid at least once this month (not row count)
    let classCond = effectiveClassId ? ' AND s.class_id = ?' : '';
    let classParams = effectiveClassId ? [effectiveClassId] : [];

    // Total active students
    const [totalStudentsRes] = await pool.execute(
      `SELECT COUNT(*) as cnt FROM students s WHERE s.is_active = 1${classCond}`,
      classParams
    );
    const totalStudents = totalStudentsRes[0].cnt;

    // Students who paid at least one fee this month (DISTINCT to avoid double count)
    const [paidRes] = await pool.execute(
      `SELECT COUNT(DISTINCT fp.student_id) as cnt
       FROM fee_payments fp
       JOIN students s ON s.id = fp.student_id
       WHERE DATE_FORMAT(fp.payment_date,'%Y-%m') = ? AND s.is_active = 1${classCond}`,
      [monthStr, ...classParams]
    );
    const paidCount = paidRes[0].cnt;
    const notPaidCount = totalStudents - paidCount;

    // ── FEE DETAIL LISTS ───────────────────────────────────────────────────
    // Students who PAID this month
    const [paidStudents] = await pool.execute(
      `SELECT DISTINCT s.id, s.roll_no, s.full_name, c.name as class_name
       FROM fee_payments fp
       JOIN students s ON s.id = fp.student_id
       JOIN classes c ON c.id = s.class_id
       WHERE DATE_FORMAT(fp.payment_date,'%Y-%m') = ? AND s.is_active = 1${classCond}
       ORDER BY s.roll_no`,
      [monthStr, ...classParams]
    );

    // Students who have NOT paid this month
    const [notPaidStudents] = await pool.execute(
      `SELECT s.id, s.roll_no, s.full_name, c.name as class_name
       FROM students s
       JOIN classes c ON c.id = s.class_id
       WHERE s.is_active = 1${classCond}
       AND s.id NOT IN (
         SELECT DISTINCT fp.student_id FROM fee_payments fp
         WHERE DATE_FORMAT(fp.payment_date,'%Y-%m') = ?
       )
       ORDER BY s.roll_no`,
      [...classParams, monthStr]
    );

    // All active students list
    const [allStudentsList] = await pool.execute(
      `SELECT s.id, s.roll_no, s.full_name, c.name as class_name
       FROM students s
       JOIN classes c ON c.id = s.class_id
       WHERE s.is_active = 1${classCond}
       ORDER BY s.roll_no`,
      classParams
    );

    // ── SALARY STATS ───────────────────────────────────────────────────────
    let salaryTotal = 0, salaryGenerated = 0;
    let salaryGeneratedList = [], salaryNotGeneratedList = [], allEmployeesList = [];

    if (!isTeacher) {
      const [salaryRes] = await pool.execute(
        `SELECT COUNT(DISTINCT u.id) as total_employees,
         COUNT(DISTINCT CASE WHEN ss.id IS NOT NULL THEN u.id END) as generated_count
         FROM users u
         LEFT JOIN salary_slips ss ON ss.employee_id = u.id AND ss.month = ?
         WHERE u.is_active = 1`,
        [monthStr]
      );
      salaryTotal = salaryRes[0].total_employees;
      salaryGenerated = salaryRes[0].generated_count || 0;

      // Employees WITH salary slip this month (DISTINCT so employees with
      // multiple slip rows in the same month don't appear/count more than once)
      const [genRes] = await pool.execute(
        `SELECT DISTINCT u.id, u.emp_id, u.full_name, r.name as role_name
         FROM salary_slips ss
         JOIN users u ON u.id = ss.employee_id
         LEFT JOIN roles r ON r.id = u.role_id
         WHERE ss.month = ? AND u.is_active = 1
         ORDER BY u.full_name`,
        [monthStr]
      );
      salaryGeneratedList = genRes;

      // Employees WITHOUT salary slip this month
      const [notGenRes] = await pool.execute(
        `SELECT u.id, u.emp_id, u.full_name, r.name as role_name
         FROM users u
         LEFT JOIN roles r ON r.id = u.role_id
         WHERE u.is_active = 1
         AND u.id NOT IN (
           SELECT DISTINCT ss.employee_id FROM salary_slips ss WHERE ss.month = ?
         )
         ORDER BY u.full_name`,
        [monthStr]
      );
      salaryNotGeneratedList = notGenRes;

      // All active employees
      const [allEmpRes] = await pool.execute(
        `SELECT u.id, u.emp_id, u.full_name, r.name as role_name
         FROM users u
         LEFT JOIN roles r ON r.id = u.role_id
         WHERE u.is_active = 1
         ORDER BY u.full_name`,
        []
      );
      allEmployeesList = allEmpRes;
    }

    res.json({
      classes: visibleClasses,
      fees: {
        total: totalStudents,
        paid: paidCount,
        not_paid: notPaidCount,
        // Detail lists for modals
        paid_students: paidStudents,
        not_paid_students: notPaidStudents,
        all_students: allStudentsList,
      },
      salary: {
        total: salaryTotal,
        generated: salaryGenerated,
        not_generated: salaryTotal - salaryGenerated,
        // Detail lists for modals
        generated_list: salaryGeneratedList,
        not_generated_list: salaryNotGeneratedList,
        all_employees: allEmployeesList,
      },
      month: currentMonth,
      year: currentYear,
      isTeacher,
      teacherClassId: teacherClass
    });
  } catch (err) {
    console.error('Dashboard error:', err.message);
    res.status(500).json({ message: err.message });
  }
};
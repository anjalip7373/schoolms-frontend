const { sendBroadcastWhatsApp } = require('../config/whatsappService');

const pool = require('../config/db');
const { sendBroadcastEmail } = require('../config/emailService');
// const { sendWhatsAppMessage } = require('../config/whatsappService');


exports.getBroadcasts = async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT b.*, u.full_name as sent_by_name, c.name as class_name
       FROM broadcasts b
       JOIN users u ON b.sent_by = u.id
       LEFT JOIN classes c ON b.target_class_id = c.id
       ORDER BY b.created_at DESC`
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.sendBroadcast = async (req, res) => {
  try {
    const { title, message, target_type, target_class_id } = req.body;

    if (!title || !message) {
      return res.status(400).json({ message: 'Title and message are required' });
    }

    // Get recipients based on target
    let recipients = [];

    if (target_type === 'all') {
      // All students + all employees
      const [students] = await pool.execute(
        `SELECT s.full_name, s.email, 'student' as type FROM students s WHERE s.fee_status = 'active' AND s.email IS NOT NULL AND s.email != ''`
      );
      const [employees] = await pool.execute(
        `SELECT u.full_name, u.email, 'employee' as type FROM users u WHERE u.is_active = 1 AND u.email IS NOT NULL AND u.email != ''`
      );
      recipients = [...students, ...employees];

    } else if (target_type === 'class') {
      // All students in a class
      const [students] = await pool.execute(
        `SELECT s.full_name, s.email, 'student' as type FROM students s 
         WHERE s.class_id = ? AND s.fee_status = 'active' AND s.email IS NOT NULL AND s.email != ''`,
        [target_class_id]
      );
      recipients = students;

    } else if (target_type === 'students') {
      // All students
      const [students] = await pool.execute(
        `SELECT s.full_name, s.email, 'student' as type FROM students s WHERE s.fee_status = 'active' AND s.email IS NOT NULL AND s.email != ''`
      );
      recipients = students;

    } else if (target_type === 'employees') {
      // All employees
      const [employees] = await pool.execute(
        `SELECT u.full_name, u.email, 'employee' as type FROM users u WHERE u.is_active = 1 AND u.email IS NOT NULL AND u.email != ''`
      );
      recipients = employees;
    }

    console.log(`Broadcasting to ${recipients.length} recipients`);

    // Save broadcast record
    const [result] = await pool.execute(
      `INSERT INTO broadcasts (title, message, target_type, target_class_id, sent_by, sent_count)
       VALUES (?,?,?,?,?,?)`,
      [title, message, target_type, target_class_id || null, req.user.id, recipients.length]
    );

    // Send emails async
    if (recipients.length > 0) {
      sendBroadcastNotifications(recipients, title, message, req.user.full_name || 'SchoolMS')
        .catch(e => console.error('Broadcast notification error:', e.message));
    }

    res.json({
      message: `Broadcast sent to ${recipients.length} recipients`,
      broadcast_id: result.insertId,
      sent_count: recipients.length
    });

  } catch (err) {
    console.error('Broadcast error:', err.message);
    res.status(500).json({ message: err.message });
  }
};

exports.deleteBroadcast = async (req, res) => {
  try {
    await pool.execute('DELETE FROM broadcasts WHERE id=?', [req.params.id]);
    res.json({ message: 'Broadcast deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// Send emails in batches
const sendBroadcastNotifications = async (recipients, title, message, senderName) => {
  const { sendBroadcastEmail } = require('../config/emailService');
  let emailSent = 0, whatsappSent = 0;

  for (const recipient of recipients) {
    // Send Email
    if (recipient.email) {
      try {
        await sendBroadcastEmail(recipient.email, recipient.full_name, title, message, senderName);
        emailSent++;
      } catch (e) {
        console.error(`Email failed for ${recipient.email}:`, e.message);
      }
    }

    // Send WhatsApp
    const phone = recipient.whatsapp_no || recipient.phone;
    if (phone) {
      try {
        await sendBroadcastWhatsApp(phone, recipient.full_name, title, message);
        whatsappSent++;
      } catch (e) {
        console.error(`WhatsApp failed for ${phone}:`, e.message);
      }
    }

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log(`Broadcast complete: ${emailSent} emails, ${whatsappSent} WhatsApp sent`);
};

exports.sendWhatsAppBroadcast = async (req, res) => {
  try {
    const { title, message, target_type, target_class_id } = req.body;

    if (!title || !message) {
      return res.status(400).json({ message: 'Title and message are required' });
    }

    // Get recipients with phone numbers
    let recipients = [];

    if (target_type === 'all') {
      const [students] = await pool.execute(
        `SELECT s.full_name, s.email, s.phone, s.whatsapp_no, 'student' as type 
         FROM students s WHERE s.fee_status = 'active'`
      );
      const [employees] = await pool.execute(
        `SELECT u.full_name, u.email, u.phone, NULL as whatsapp_no, 'employee' as type 
         FROM users u WHERE u.is_active = 1`
      );
      recipients = [...students, ...employees];

    } else if (target_type === 'class') {
      const [students] = await pool.execute(
        `SELECT s.full_name, s.email, s.phone, s.whatsapp_no, 'student' as type 
         FROM students s WHERE s.class_id = ? AND s.fee_status = 'active'`,
        [target_class_id]
      );
      recipients = students;

    } else if (target_type === 'students') {
      const [students] = await pool.execute(
        `SELECT s.full_name, s.email, s.phone, s.whatsapp_no, 'student' as type 
         FROM students s WHERE s.fee_status = 'active'`
      );
      recipients = students;

    } else if (target_type === 'employees') {
      const [employees] = await pool.execute(
        `SELECT u.full_name, u.email, u.phone, NULL as whatsapp_no, 'employee' as type 
         FROM users u WHERE u.is_active = 1`
      );
      recipients = employees;
    }

    

    // Filter only those with phone
    const withPhone = recipients.filter(r => r.phone || r.phone2);
    console.log(`WhatsApp broadcast to ${withPhone.length} recipients`);

    // Save to broadcast history
    const [result] = await pool.execute(
      `INSERT INTO broadcasts (title, message, target_type, target_class_id, sent_by, sent_count)
       VALUES (?,?,?,?,?,?)`,
      [`[WhatsApp] ${title}`, message, target_type, target_class_id || null, req.user.id, withPhone.length]
    );

    // Send WhatsApp messages async — don't block response
    sendWhatsAppMessages(withPhone, title, message)
      .catch(e => console.error('WhatsApp broadcast error:', e.message));

    res.json({
      message: `WhatsApp broadcast sending to ${withPhone.length} recipients`,
      broadcast_id: result.insertId,
      sent_count: withPhone.length,
      skipped: recipients.length - withPhone.length
    });

  } catch (err) {
    console.error('WhatsApp broadcast error:', err.message);
    res.status(500).json({ message: err.message });
  }
};

const sendWhatsAppMessages = async (recipients, title, message, senderName) => {
  let sent = 0;
  for (const recipient of recipients) {
    try {
      const phone = recipient.phone || recipient.phone2;
      await sendBroadcastWhatsApp(phone, recipient.full_name, title, message, senderName);
      sent++;
      console.log(`WhatsApp sent to: ${recipient.full_name}`);
    } catch (e) {
      console.error(`WhatsApp failed for ${recipient.full_name}:`, e.message);
    }
  }
  console.log(`WhatsApp broadcast complete: ${sent}/${recipients.length}`);
};
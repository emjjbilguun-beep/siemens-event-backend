require('dotenv').config();
const express = require('express');
const cors = require('cors');
const QRCode = require('qrcode');
const nodemailer = require('nodemailer');
const db = require('./database');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Generate unique code
function generateCode() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `SIE-${timestamp}-${random}`;
}

// Email transporter (SendGrid SMTP - needs API key in .env)
const transporter = nodemailer.createTransport({
  host: 'smtp.sendgrid.net',
  port: 587,
  auth: {
    user: 'apikey',
    pass: process.env.SENDGRID_API_KEY || 'placeholder'
  }
});

// Check if guest exists
app.post('/api/guests/check', (req, res) => {
  const { type, query } = req.body;
  console.log('Check request:', { type, query });
  
  if (!query) {
    return res.status(400).json({ error: 'Мэдээлэл оруулна уу' });
  }

  let sql;
  let params;
  
  if (type === 'name') {
    sql = 'SELECT * FROM guests WHERE name LIKE ? COLLATE NOCASE';
    params = [`%${query}%`];
  } else {
    sql = 'SELECT * FROM guests WHERE phone LIKE ?';
    params = [`%${query}%`];
  }

  db.get(sql, params, (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Олдсонгүй' });
    
    res.json({
      found: true,
      guest: {
        id: row.id,
        name: row.name,
        company: row.company,
        title: row.title,
        phone: row.phone,
        email: row.email,
        status: row.status,
        code: row.code
      }
    });
  });
});

// Confirm guest and generate QR code
app.post('/api/guests/confirm', async (req, res) => {
  const { guestId } = req.body;
  
  if (!guestId) {
    return res.status(400).json({ error: 'Guest ID оруулна уу' });
  }

  db.get('SELECT * FROM guests WHERE id = ?', [guestId], async (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Зочин олдсонгүй' });
    
    if (row.status === 'confirmed') {
      return res.json({
        success: true,
        alreadyConfirmed: true,
        code: row.code,
        qrCode: row.qr_code
      });
    }

    const code = generateCode();
    const checkinUrl = `${process.env.BASE_URL || 'https://clear-aura-x2tq.here.now'}/checkin.html?code=${code}`;
    
    try {
      const qrCodeData = await QRCode.toDataURL(checkinUrl, {
        width: 400,
        margin: 2,
        color: { dark: '#009999', light: '#ffffff' }
      });

      db.run(
        'UPDATE guests SET code = ?, qr_code = ?, status = ?, confirmed_at = CURRENT_TIMESTAMP WHERE id = ?',
        [code, qrCodeData, 'confirmed', guestId],
        function(err) {
          if (err) return res.status(500).json({ error: err.message });
          
          // Send email if email exists and SendGrid API key is set
          if (row.email && process.env.SENDGRID_API_KEY && process.env.SENDGRID_API_KEY !== 'placeholder') {
            const mailOptions = {
              from: process.env.FROM_EMAIL || 'siemens@example.com',
              to: row.email,
              subject: 'Siemens Олон улсын сименар - Баталгаажуулалт',
              html: `
                <h2>Тавтай морилно уу, ${row.name}!</h2>
                <p>Та Siemens олон улсын сименар урилганд баталгаажлаа.</p>
                <p><strong>Огноо:</strong> 8 сарын 14-15</p>
                <p><strong>Цаг:</strong> 07:30</p>
                <p><strong>Байршил:</strong> The Corporate Hotel, Mahatma Gandhi street-39</p>
                <p><strong>Таны код:</strong> ${code}</p>
                <p>QR кодоо хадгална уу. Арга хэмжээнд ирэхдээ QR кодоо скан хийнэ.</p>
                <img src="${qrCodeData}" alt="QR Code" style="max-width: 300px;"/>
                <p><a href="${checkinUrl}">Check-in хуудас</a></p>
              `
            };
            
            transporter.sendMail(mailOptions, (err, info) => {
              if (err) console.error('Email error:', err);
              else console.log('Email sent:', info.messageId);
            });
          }

          res.json({
            success: true,
            code: code,
            qrCode: qrCodeData,
            checkinUrl: checkinUrl
          });
        }
      );
    } catch (err) {
      res.status(500).json({ error: 'QR код үүсгэхэд алдаа гарлаа' });
    }
  });
});

// Check-in endpoint
app.post('/api/checkin', (req, res) => {
  const { code } = req.body;
  
  if (!code) {
    return res.status(400).json({ error: 'Код оруулна уу' });
  }

  db.get('SELECT * FROM guests WHERE code = ?', [code.toUpperCase()], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Код олдсонгүй' });
    
    if (row.checked_in_at) {
      return res.json({
        success: true,
        alreadyCheckedIn: true,
        guest: {
          name: row.name,
          company: row.company,
          checkedInAt: row.checked_in_at
        }
      });
    }

    db.run(
      'UPDATE guests SET checked_in_at = CURRENT_TIMESTAMP WHERE id = ?',
      [row.id],
      function(err) {
        if (err) return res.status(500).json({ error: err.message });
        
        db.run(
          'INSERT INTO checkins (guest_id, code) VALUES (?, ?)',
          [row.id, code],
          (err) => {
            if (err) console.error('Checkin insert error:', err);
          }
        );

        res.json({
          success: true,
          guest: {
            name: row.name,
            company: row.company,
            title: row.title,
            phone: row.phone
          }
        });
      }
    );
  });
});

// Get all guests (admin)
app.get('/api/guests', (req, res) => {
  db.all('SELECT * FROM guests ORDER BY created_at', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Get guest stats
app.get('/api/stats', (req, res) => {
  db.get('SELECT COUNT(*) as total FROM guests', (err, total) => {
    if (err) return res.status(500).json({ error: err.message });
    db.get('SELECT COUNT(*) as confirmed FROM guests WHERE status = ?', ['confirmed'], (err, confirmed) => {
      if (err) return res.status(500).json({ error: err.message });
      db.get('SELECT COUNT(*) as checkedIn FROM guests WHERE checked_in_at IS NOT NULL', (err, checkedIn) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({
          total: total.total,
          confirmed: confirmed.confirmed,
          checkedIn: checkedIn.checkedIn,
          pending: total.total - confirmed.confirmed
        });
      });
    });
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;

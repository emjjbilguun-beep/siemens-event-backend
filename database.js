const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, 'siemens.db'));

db.serialize(() => {
  // Guests table
  db.run(`
    CREATE TABLE IF NOT EXISTS guests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      company TEXT,
      title TEXT,
      phone TEXT NOT NULL,
      email TEXT,
      code TEXT UNIQUE,
      qr_code TEXT,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      confirmed_at DATETIME,
      checked_in_at DATETIME
    )
  `);

  // Checkins table
  db.run(`
    CREATE TABLE IF NOT EXISTS checkins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guest_id INTEGER,
      code TEXT NOT NULL,
      checked_in_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (guest_id) REFERENCES guests(id)
    )
  `);

  // Insert demo guests if empty
  db.get('SELECT COUNT(*) as count FROM guests', (err, row) => {
    if (err) return console.error(err);
    if (row.count === 0) {
      const demoGuests = [
        ['Батболд', 'СТМ', 'МТ инженер', '99119911', 'batbold@example.com'],
        ['Оюунчимэг', 'ХБНГУЭ', 'Эмч', '99112233', 'oyunchimeg@example.com'],
        ['Ганбат', 'Алтайн Ирээдүй', 'Менежер', '99113344', 'ganbat@example.com'],
        ['Сарантуяа', 'Монгол Төмөр', 'Инженер', '99114455', 'sarantuya@example.com'],
        ['Дорж', 'Улаанбаатар Смарт', 'ИТ', '99115566', 'dorj@example.com']
      ];

      const stmt = db.prepare('INSERT INTO guests (name, company, title, phone, email) VALUES (?, ?, ?, ?, ?)');
      demoGuests.forEach(g => stmt.run(g));
      stmt.finalize();
      console.log('Demo guests inserted');
    }
  });
});

module.exports = db;

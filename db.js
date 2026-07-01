const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const dataDir = process.env.DATA_DIR || '/home/container/.scottyhub_data';
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, 'scottyhub.db'));

function initDB() {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      is_verified INTEGER DEFAULT 0,
      role TEXT DEFAULT 'user',
      avatar TEXT DEFAULT '',
      bio TEXT DEFAULT '',
      wallet_balance REAL DEFAULT 0,
      otp_code TEXT,
      otp_expires TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS wallet_transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      description TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      author_id TEXT NOT NULL,
      content TEXT NOT NULL,
      media_url TEXT DEFAULT '',
      pinned INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS likes (
      post_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      PRIMARY KEY (post_id, user_id),
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL,
      author_id TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
      FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS news (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      icon TEXT DEFAULT 'newspaper',
      color TEXT DEFAULT '#00ffcc',
      category TEXT DEFAULT 'general',
      author_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS follows (
      follower_id TEXT NOT NULL,
      following_id TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (follower_id, following_id),
      FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      type TEXT DEFAULT 'info',
      is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      user_a TEXT NOT NULL,
      user_b TEXT NOT NULL,
      last_message TEXT DEFAULT '',
      last_at TEXT DEFAULT (datetime('now')),
      unread_a INTEGER DEFAULT 0,
      unread_b INTEGER DEFAULT 0,
      UNIQUE(user_a, user_b),
      FOREIGN KEY (user_a) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (user_b) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      content TEXT NOT NULL,
      type TEXT DEFAULT 'text',
      is_read INTEGER DEFAULT 0,
      deleted INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS boost_services (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      platform TEXT NOT NULL,
      type TEXT NOT NULL,
      price_per_1000 REAL NOT NULL,
      min_qty INTEGER DEFAULT 100,
      max_qty INTEGER DEFAULT 10000,
      description TEXT DEFAULT '',
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS boost_orders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      service_id TEXT,
      platform TEXT NOT NULL,
      type TEXT NOT NULL,
      link TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      total_cost REAL NOT NULL,
      status TEXT DEFAULT 'pending',
      admin_note TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (service_id) REFERENCES boost_services(id) ON DELETE SET NULL
    );
  `);

  // Migrate: add pinned column to existing posts table if missing
  try {
    db.exec('ALTER TABLE posts ADD COLUMN pinned INTEGER DEFAULT 0');
  } catch(e) { /* already exists */ }
  try {
    db.exec("ALTER TABLE users ADD COLUMN last_seen TEXT DEFAULT (datetime('now'))");
  } catch(e) { /* already exists */ }

  console.log('✅ SQLite DB ready');
}

// Wrap sync API to match async interface used in routes
const dbAsync = {
  execute: (sqlOrObj, args) => {
    const sql = typeof sqlOrObj === 'string' ? sqlOrObj : sqlOrObj.sql;
    const params = typeof sqlOrObj === 'string' ? (args || []) : (sqlOrObj.args || []);
    const upper = sql.trim().toUpperCase();
    if (upper.startsWith('SELECT') || upper.startsWith('WITH')) {
      const stmt = db.prepare(sql);
      const rows = stmt.all(...params);
      return Promise.resolve({ rows });
    } else {
      const stmt = db.prepare(sql);
      const info = stmt.run(...params);
      return Promise.resolve({ rows: [], info });
    }
  }
};

module.exports = { db: dbAsync, initDB };

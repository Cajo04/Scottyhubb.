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
      points_balance INTEGER DEFAULT 0,
      xp INTEGER DEFAULT 0,
      level INTEGER DEFAULT 1,
      streak_count INTEGER DEFAULT 0,
      last_checkin TEXT,
      referral_code TEXT UNIQUE,
      referred_by TEXT,
      cover_photo TEXT DEFAULT '',
      is_verified_badge INTEGER DEFAULT 0,
      otp_code TEXT,
      otp_expires TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS missions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      type TEXT DEFAULT 'daily',
      xp_reward INTEGER DEFAULT 0,
      points_reward INTEGER DEFAULT 0,
      target_action TEXT NOT NULL,
      target_count INTEGER DEFAULT 1,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_missions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      mission_id TEXT NOT NULL,
      progress INTEGER DEFAULT 0,
      completed INTEGER DEFAULT 0,
      claimed INTEGER DEFAULT 0,
      period_key TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE,
      UNIQUE(user_id, mission_id, period_key)
    );

    CREATE TABLE IF NOT EXISTS spin_history (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      prize_type TEXT NOT NULL,
      prize_value TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS badges (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      icon TEXT DEFAULT 'award',
      description TEXT DEFAULT '',
      color TEXT DEFAULT '#00e5ff'
    );

    CREATE TABLE IF NOT EXISTS user_badges (
      user_id TEXT NOT NULL,
      badge_id TEXT NOT NULL,
      earned_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, badge_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (badge_id) REFERENCES badges(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS social_links (
      user_id TEXT PRIMARY KEY,
      website TEXT DEFAULT '',
      twitter TEXT DEFAULT '',
      instagram TEXT DEFAULT '',
      tiktok TEXT DEFAULT '',
      telegram TEXT DEFAULT '',
      whatsapp TEXT DEFAULT '',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
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

    CREATE TABLE IF NOT EXISTS earn_tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      category TEXT DEFAULT 'social',
      link TEXT DEFAULT '',
      reward_points INTEGER DEFAULT 0,
      reward_cash REAL DEFAULT 0,
      cooldown_hours INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS task_completions (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      status TEXT DEFAULT 'completed',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (task_id) REFERENCES earn_tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS bots_marketplace (
      id TEXT PRIMARY KEY,
      owner_id TEXT,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      icon TEXT DEFAULT 'bot',
      listing_type TEXT DEFAULT 'buy',
      price REAL DEFAULT 0,
      download_url TEXT DEFAULT '',
      status TEXT DEFAULT 'approved',
      featured INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS bot_reviews (
      id TEXT PRIMARY KEY,
      bot_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      rating INTEGER DEFAULT 5,
      comment TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (bot_id) REFERENCES bots_marketplace(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS bot_orders (
      id TEXT PRIMARY KEY,
      bot_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      type TEXT DEFAULT 'buy',
      price REAL DEFAULT 0,
      expires_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (bot_id) REFERENCES bots_marketplace(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS wallet_requests (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      method TEXT NOT NULL,
      amount REAL NOT NULL,
      details TEXT DEFAULT '',
      status TEXT DEFAULT 'pending',
      admin_note TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS coupons (
      code TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      value REAL NOT NULL,
      uses_left INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS coupon_redemptions (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      user_id TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(code, user_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS downloads_library (
      id TEXT PRIMARY KEY,
      uploader_id TEXT,
      category TEXT DEFAULT 'apps',
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      url TEXT NOT NULL,
      size_label TEXT DEFAULT '',
      status TEXT DEFAULT 'approved',
      downloads_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (uploader_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS polls (
      id TEXT PRIMARY KEY,
      author_id TEXT NOT NULL,
      question TEXT NOT NULL,
      options_json TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS poll_votes (
      poll_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      option_index INTEGER NOT NULL,
      PRIMARY KEY (poll_id, user_id),
      FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS groups_table (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      creator_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS group_members (
      group_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      PRIMARY KEY (group_id, user_id),
      FOREIGN KEY (group_id) REFERENCES groups_table(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS events_table (
      id TEXT PRIMARY KEY,
      creator_id TEXT,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      start_time TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS event_rsvps (
      event_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      PRIMARY KEY (event_id, user_id),
      FOREIGN KEY (event_id) REFERENCES events_table(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      reporter_id TEXT,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      reason TEXT DEFAULT '',
      status TEXT DEFAULT 'open',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      label TEXT DEFAULT 'API Key',
      key_value TEXT UNIQUE NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      last_used TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS activity_log (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      kind TEXT NOT NULL,
      label TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT DEFAULT ''
    );
  `);

  // Migrate: add pinned column to existing posts table if missing
  try {
    db.exec('ALTER TABLE posts ADD COLUMN pinned INTEGER DEFAULT 0');
  } catch(e) { /* already exists */ }
  try {
    db.exec("ALTER TABLE users ADD COLUMN last_seen TEXT DEFAULT (datetime('now'))");
  } catch(e) { /* already exists */ }

  const newUserCols = [
    "points_balance INTEGER DEFAULT 0",
    "xp INTEGER DEFAULT 0",
    "level INTEGER DEFAULT 1",
    "streak_count INTEGER DEFAULT 0",
    "last_checkin TEXT",
    "referral_code TEXT",
    "referred_by TEXT",
    "cover_photo TEXT DEFAULT ''",
    "is_verified_badge INTEGER DEFAULT 0",
    "plan TEXT DEFAULT 'free'",
    "plan_expiry TEXT",
    "status TEXT DEFAULT 'active'",
    "warn_count INTEGER DEFAULT 0",
    "two_fa_enabled INTEGER DEFAULT 0",
    "dark_mode INTEGER DEFAULT 1",
    "notif_prefs TEXT DEFAULT '{}'",
    "ai_credits INTEGER DEFAULT 100"
  ];
  for (const col of newUserCols) {
    try { db.exec(`ALTER TABLE users ADD COLUMN ${col}`); } catch(e) { /* already exists */ }
  }

  // Backfill referral codes for existing users that don't have one
  try {
    const rows = db.prepare("SELECT id, username FROM users WHERE referral_code IS NULL").all();
    for (const u of rows) {
      const code = 'SP-' + u.username.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) + Math.floor(Math.random() * 900 + 100);
      try { db.prepare("UPDATE users SET referral_code = ? WHERE id = ?").run(code, u.id); } catch(e) {}
    }
  } catch(e) { /* users table may not exist yet on first run */ }

  // Seed default missions if none exist
  try {
    const { count } = db.prepare("SELECT COUNT(*) as count FROM missions").get();
    if (count === 0) {
      const seed = [
        ['Daily Login', 'Log in to Spider Hub today', 'daily', 10, 5, 'login', 1],
        ['Make a Post', 'Share something with the community', 'daily', 15, 10, 'post_create', 1],
        ['Watch 3 Ads', 'Watch rewarded ads to earn points', 'daily', 20, 15, 'watch_ad', 3],
        ['Refer a Friend', 'Invite someone using your referral link', 'weekly', 50, 100, 'referral', 1],
        ['Spin the Wheel', 'Try your luck on the daily spin', 'daily', 5, 0, 'spin', 1]
      ];
      const stmt = db.prepare("INSERT INTO missions (id, title, description, type, xp_reward, points_reward, target_action, target_count) VALUES (?,?,?,?,?,?,?,?)");
      for (const m of seed) {
        stmt.run('mis_' + Math.random().toString(36).slice(2, 10), ...m);
      }
    }
  } catch(e) { /* missions table may not exist yet on first run */ }

  // Seed default badges if none exist
  try {
    const { count } = db.prepare("SELECT COUNT(*) as count FROM badges").get();
    if (count === 0) {
      const badgeSeed = [
        ['badge_welcome', 'Welcome Aboard', 'star', 'Joined Spider Hub', '#00D9FF'],
        ['badge_verified', 'Verified', 'check', 'Verified account', '#0066FF'],
        ['badge_streak7', 'Streak Master', 'fire', '7-day check-in streak', '#ff6b35'],
        ['badge_streak30', 'Unstoppable', 'fire', '30-day check-in streak', '#FFD700'],
        ['badge_referrer', 'Super Referrer', 'handshake', 'Referred 5+ users', '#F0B90B'],
        ['badge_level10', 'Rising Star', 'trophy', 'Reached Level 10', '#9944ff']
      ];
      const stmt = db.prepare("INSERT INTO badges (id, name, icon, description, color) VALUES (?,?,?,?,?)");
      for (const b of badgeSeed) stmt.run(...b);
    }
  } catch(e) { /* badges table may not exist yet on first run */ }

  // Seed a monthly mission if missing
  try {
    const monthly = db.prepare("SELECT COUNT(*) as c FROM missions WHERE type = 'monthly'").get();
    if (monthly.c === 0) {
      db.prepare("INSERT INTO missions (id, title, description, type, xp_reward, points_reward, target_action, target_count) VALUES (?,?,?,?,?,?,?,?)")
        .run('mis_' + Math.random().toString(36).slice(2, 10), 'Monthly Grinder', 'Check in 20 times this month', 'monthly', 200, 300, 'login', 20);
    }
  } catch(e) {}

  // Seed earn tasks if none exist
  try {
    const { count } = db.prepare("SELECT COUNT(*) as count FROM earn_tasks").get();
    if (count === 0) {
      const taskSeed = [
        ['Follow us on TikTok', 'Follow @scottyhub and stay tuned', 'social', 'https://tiktok.com/@scottyhub', 20, 0, 24],
        ['Follow us on Instagram', 'Follow our Instagram page', 'social', 'https://instagram.com/scottyhub', 20, 0, 24],
        ['Join our Telegram channel', 'Join for updates & drops', 'social', 'https://t.me/scottyhub', 15, 0, 0],
        ['Like us on Facebook', 'Like our Facebook page', 'social', 'https://facebook.com/scottyhub', 15, 0, 24],
        ['Watch a sponsored video', 'Watch a short video to earn points', 'watch', '', 10, 0, 4],
        ['Complete a quick survey', 'Answer a short survey', 'survey', '', 0, 0.10, 24],
        ['Install a partner app', 'Install & open a partner app', 'install', '', 0, 0.25, 0],
        ['Visit partner website', 'Visit and browse for 30s', 'visit', '', 5, 0, 6],
      ];
      const stmt = db.prepare("INSERT INTO earn_tasks (id, title, description, category, link, reward_points, reward_cash, cooldown_hours) VALUES (?,?,?,?,?,?,?,?)");
      for (const t of taskSeed) stmt.run('task_' + Math.random().toString(36).slice(2, 10), ...t);
    }
  } catch(e) {}

  // Seed marketplace bots if none exist
  try {
    const { count } = db.prepare("SELECT COUNT(*) as count FROM bots_marketplace").get();
    if (count === 0) {
      const botSeed = [
        ['ScottyMD Free', 'Full-featured WhatsApp bot, 50+ commands', 'bot', 'buy', 0, 'https://scottymd.malvintech.sbs', 1],
        ['Pro Bot Rental', 'Monthly rental with priority support', 'zap', 'rent', 50, '', 1],
        ['Custom Build Slot', 'Get a bot custom-built to your spec', 'wrench', 'buy', 170, '', 0],
      ];
      const stmt = db.prepare("INSERT INTO bots_marketplace (id, name, description, icon, listing_type, price, download_url, featured) VALUES (?,?,?,?,?,?,?,?)");
      for (const b of botSeed) stmt.run('mkt_' + Math.random().toString(36).slice(2, 10), ...b);
    }
  } catch(e) {}

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

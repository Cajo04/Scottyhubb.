const { Pool } = require('pg');

// FIX: SQLite (node:sqlite) stored data on local disk, which Render wipes on every
// restart/redeploy/sleep-wake since the filesystem isn't persistent. Moved to a
// managed Postgres instance so data survives restarts.
//
// Set DATABASE_URL in your Render environment variables — e.g. a free Neon or
// Supabase Postgres instance. Do NOT commit real credentials to the repo.
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('[db] DATABASE_URL is not set. Set it in Render\'s environment variables ' +
    'to your Postgres connection string (e.g. from Neon or Supabase).');
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  // Neon/Supabase (and most hosted Postgres) require SSL. rejectUnauthorized:false
  // avoids needing their CA cert bundle — fine for this use case.
  ssl: { rejectUnauthorized: false }
});

pool.on('error', (err) => {
  console.error('[db] Unexpected error on idle Postgres client', err);
});

async function initDB() {
  await pool.query(`
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
      created_at TEXT DEFAULT (NOW()::text)
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
      created_at TEXT DEFAULT (NOW()::text)
    );

    CREATE TABLE IF NOT EXISTS user_missions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      mission_id TEXT NOT NULL,
      progress INTEGER DEFAULT 0,
      completed INTEGER DEFAULT 0,
      claimed INTEGER DEFAULT 0,
      period_key TEXT NOT NULL,
      created_at TEXT DEFAULT (NOW()::text),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE,
      UNIQUE(user_id, mission_id, period_key)
    );

    CREATE TABLE IF NOT EXISTS spin_history (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      prize_type TEXT NOT NULL,
      prize_value TEXT NOT NULL,
      created_at TEXT DEFAULT (NOW()::text),
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
      earned_at TEXT DEFAULT (NOW()::text),
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

    CREATE TABLE IF NOT EXISTS withdrawals (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      amount INTEGER NOT NULL,
      method TEXT NOT NULL,
      account_details TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      admin_note TEXT DEFAULT '',
      created_at TEXT DEFAULT (NOW()::text),
      resolved_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS coupons (
      code TEXT PRIMARY KEY,
      type TEXT DEFAULT 'cops',
      value INTEGER NOT NULL,
      max_uses INTEGER DEFAULT 1,
      used_count INTEGER DEFAULT 0,
      expires_at TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (NOW()::text)
    );

    CREATE TABLE IF NOT EXISTS coupon_redemptions (
      coupon_code TEXT NOT NULL,
      user_id TEXT NOT NULL,
      redeemed_at TEXT DEFAULT (NOW()::text),
      PRIMARY KEY (coupon_code, user_id),
      FOREIGN KEY (coupon_code) REFERENCES coupons(code) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS bot_listings (
      id TEXT PRIMARY KEY,
      seller_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      category TEXT DEFAULT 'whatsapp',
      cover_image TEXT DEFAULT '',
      download_url TEXT NOT NULL,
      demo_url TEXT DEFAULT '',
      price_cops INTEGER NOT NULL,
      rental_price_cops_per_day INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      sales_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (NOW()::text),
      FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS bot_purchases (
      id TEXT PRIMARY KEY,
      listing_id TEXT NOT NULL,
      buyer_id TEXT NOT NULL,
      type TEXT NOT NULL,
      price_paid INTEGER NOT NULL,
      rented_until TEXT,
      created_at TEXT DEFAULT (NOW()::text),
      FOREIGN KEY (listing_id) REFERENCES bot_listings(id) ON DELETE CASCADE,
      FOREIGN KEY (buyer_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS bot_reviews (
      id TEXT PRIMARY KEY,
      listing_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      rating INTEGER NOT NULL,
      comment TEXT DEFAULT '',
      created_at TEXT DEFAULT (NOW()::text),
      UNIQUE(listing_id, user_id),
      FOREIGN KEY (listing_id) REFERENCES bot_listings(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS download_log (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      query TEXT NOT NULL,
      source TEXT DEFAULT 'music',
      created_at TEXT DEFAULT (NOW()::text),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      key_hash TEXT NOT NULL UNIQUE,
      key_preview TEXT NOT NULL,
      name TEXT DEFAULT 'API Key',
      last_used_at TEXT,
      created_at TEXT DEFAULT (NOW()::text),
      revoked INTEGER DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      reporter_id TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (NOW()::text),
      resolved_at TEXT,
      FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ai_generations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      tool TEXT NOT NULL,
      prompt TEXT NOT NULL,
      result TEXT DEFAULT '',
      created_at TEXT DEFAULT (NOW()::text),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      platform TEXT DEFAULT 'general',
      link TEXT DEFAULT '',
      points_reward INTEGER DEFAULT 0,
      xp_reward INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (NOW()::text)
    );

    CREATE TABLE IF NOT EXISTS user_tasks (
      user_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      status TEXT DEFAULT 'completed',
      completed_at TEXT DEFAULT (NOW()::text),
      PRIMARY KEY (user_id, task_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS wallet_transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      description TEXT,
      created_at TEXT DEFAULT (NOW()::text),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      author_id TEXT NOT NULL,
      content TEXT NOT NULL,
      media_url TEXT DEFAULT '',
      media_type TEXT DEFAULT '',
      media_public_id TEXT DEFAULT '',
      channel TEXT DEFAULT 'community',
      pinned INTEGER DEFAULT 0,
      group_id TEXT,
      poll_options TEXT,
      created_at TEXT DEFAULT (NOW()::text),
      FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS poll_votes (
      post_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      option_index INTEGER NOT NULL,
      created_at TEXT DEFAULT (NOW()::text),
      PRIMARY KEY (post_id, user_id),
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      cover_image TEXT DEFAULT '',
      creator_id TEXT NOT NULL,
      is_private INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (NOW()::text),
      FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS group_members (
      group_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT DEFAULT 'member',
      joined_at TEXT DEFAULT (NOW()::text),
      PRIMARY KEY (group_id, user_id),
      FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
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
      created_at TEXT DEFAULT (NOW()::text),
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
      created_at TEXT DEFAULT (NOW()::text),
      FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS follows (
      follower_id TEXT NOT NULL,
      following_id TEXT NOT NULL,
      created_at TEXT DEFAULT (NOW()::text),
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
      created_at TEXT DEFAULT (NOW()::text),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
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
      created_at TEXT DEFAULT (NOW()::text)
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
      created_at TEXT DEFAULT (NOW()::text),
      updated_at TEXT DEFAULT (NOW()::text),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (service_id) REFERENCES boost_services(id) ON DELETE SET NULL
    );

    -- Referenced by routes/social.js but were missing from the original schema
    CREATE TABLE IF NOT EXISTS standalone_polls (
      id TEXT PRIMARY KEY,
      author_id TEXT NOT NULL,
      question TEXT NOT NULL,
      options_json TEXT NOT NULL,
      created_at TEXT DEFAULT (NOW()::text),
      FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS standalone_poll_votes (
      poll_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      option_index INTEGER NOT NULL,
      created_at TEXT DEFAULT (NOW()::text),
      PRIMARY KEY (poll_id, user_id),
      FOREIGN KEY (poll_id) REFERENCES standalone_polls(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Referenced by routes/library.js but were missing from the original schema
    CREATE TABLE IF NOT EXISTS downloads_library (
      id TEXT PRIMARY KEY,
      uploader_id TEXT NOT NULL,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      url TEXT NOT NULL,
      size_label TEXT DEFAULT '',
      downloads_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (NOW()::text),
      FOREIGN KEY (uploader_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS activity_log (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      label TEXT DEFAULT '',
      created_at TEXT DEFAULT (NOW()::text),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // Courage App (DM messaging) was fully removed — drop any leftover tables from older deploys
  await pool.query('DROP TABLE IF EXISTS messages').catch(() => {});
  await pool.query('DROP TABLE IF EXISTS conversations').catch(() => {});

  // Migrate: add columns that may be missing on an existing database
  await pool.query(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS pinned INTEGER DEFAULT 0`);
  await pool.query(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'community'`);
  await pool.query(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS media_type TEXT DEFAULT ''`);
  await pool.query(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS media_public_id TEXT DEFAULT ''`);
  await pool.query(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS group_id TEXT`);
  await pool.query(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS poll_options TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen TEXT DEFAULT (NOW()::text)`);

  const newUserCols = [
    ['points_balance', 'INTEGER DEFAULT 0'],
    ['xp', 'INTEGER DEFAULT 0'],
    ['level', 'INTEGER DEFAULT 1'],
    ['streak_count', 'INTEGER DEFAULT 0'],
    ['last_checkin', 'TEXT'],
    ['referral_code', 'TEXT'],
    ['referred_by', 'TEXT'],
    ['cover_photo', "TEXT DEFAULT ''"],
    ['is_verified_badge', 'INTEGER DEFAULT 0'],
    ['ai_daily_used', 'INTEGER DEFAULT 0'],
    ['ai_daily_date', 'TEXT'],
    ['plan', "TEXT DEFAULT 'free'"],
    ['plan_expires_at', 'TEXT'],
    ['totp_secret', 'TEXT'],
    ['totp_enabled', 'INTEGER DEFAULT 0'],
    ['notification_prefs', `TEXT DEFAULT '{"rewards":true,"referrals":true,"social":true,"marketing":true}'`],
    ['profile_visibility', "TEXT DEFAULT 'public'"],
    ['show_online_status', 'INTEGER DEFAULT 1'],
    ['google_linked', 'INTEGER DEFAULT 0'],
    ['account_status', "TEXT DEFAULT 'active'"],
    ['warning_count', 'INTEGER DEFAULT 0'],
    ['suspended_until', 'TEXT']
  ];
  for (const [col, def] of newUserCols) {
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ${col} ${def}`);
  }

  // Backfill referral codes for existing users that don't have one
  try {
    const { rows } = await pool.query("SELECT id, username FROM users WHERE referral_code IS NULL");
    for (const u of rows) {
      const code = 'SP-' + u.username.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) + Math.floor(Math.random() * 900 + 100);
      try { await pool.query("UPDATE users SET referral_code = $1 WHERE id = $2", [code, u.id]); } catch (e) {}
    }
  } catch (e) { /* users table may not exist yet on first run */ }

  // Seed default missions if none exist
  try {
    const { rows: [{ count }] } = await pool.query("SELECT COUNT(*) as count FROM missions");
    if (Number(count) === 0) {
      const seed = [
        ['Daily Login', 'Log in to ScottyHub today', 'daily', 10, 5, 'login', 1],
        ['Make a Post', 'Share something with the community', 'daily', 15, 10, 'post_create', 1],
        ['Refer a Friend', 'Invite someone using your referral link', 'weekly', 50, 100, 'referral', 1],
        ['Spin the Wheel', 'Try your luck on the daily spin', 'daily', 5, 0, 'spin', 1]
      ];
      for (const m of seed) {
        await pool.query(
          "INSERT INTO missions (id, title, description, type, xp_reward, points_reward, target_action, target_count) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
          ['mis_' + Math.random().toString(36).slice(2, 10), ...m]
        );
      }
    }
  } catch (e) { /* missions table may not exist yet on first run */ }

  // Seed default badges if none exist
  try {
    const { rows: [{ count }] } = await pool.query("SELECT COUNT(*) as count FROM badges");
    if (Number(count) === 0) {
      const badgeSeed = [
        ['badge_welcome', 'Welcome Aboard', 'star', 'Joined ScottyHub', '#00D9FF'],
        ['badge_verified', 'Verified', 'check', 'Verified account', '#0066FF'],
        ['badge_streak7', 'Streak Master', 'fire', '7-day check-in streak', '#ff6b35'],
        ['badge_streak30', 'Unstoppable', 'fire', '30-day check-in streak', '#FFD700'],
        ['badge_referrer', 'Super Referrer', 'handshake', 'Referred 5+ users', '#F0B90B'],
        ['badge_level10', 'Rising Star', 'trophy', 'Reached Level 10', '#9944ff']
      ];
      for (const b of badgeSeed) {
        await pool.query("INSERT INTO badges (id, name, icon, description, color) VALUES ($1,$2,$3,$4,$5)", b);
      }
    }
  } catch (e) { /* badges table may not exist yet on first run */ }

  // Seed default earn-center tasks if none exist
  try {
    const { rows: [{ count }] } = await pool.query("SELECT COUNT(*) as count FROM tasks");
    if (Number(count) === 0) {
      const taskSeed = [
        ['task_telegram', 'Join our Telegram Channel', 'Join for updates, drops and announcements', 'telegram', 'https://t.me/Scottycrg', 30, 10],
        ['task_youtube', 'Subscribe on YouTube', 'Subscribe to @scottyx-tech for tutorials', 'youtube', 'https://youtube.com/@scottyx-tech?si=w_ywEbFzNOfDb6Yv', 30, 10],
        ['task_whatsapp', 'Follow our WhatsApp Channel', 'Stay updated on bot releases & offers', 'whatsapp', 'https://wa.me/263719080917', 20, 5],
      ];
      for (const t of taskSeed) {
        await pool.query("INSERT INTO tasks (id, title, description, platform, link, points_reward, xp_reward) VALUES ($1,$2,$3,$4,$5,$6,$7)", t);
      }
    }
  } catch (e) { /* tasks table may not exist yet on first run */ }

  console.log('[db] Postgres (SparkDB) ready');
}

// Converts '?' positional placeholders (SQLite-style, used throughout routes/) into
// Postgres's $1, $2... style. Keeps every route file untouched — this is the only
// place that needs to know which DB driver is underneath.
function toPgPlaceholders(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

// Wrap pg's API to match the async { rows } interface the routes already use
const dbAsync = {
  execute: async (sqlOrObj, args) => {
    const sql = typeof sqlOrObj === 'string' ? sqlOrObj : sqlOrObj.sql;
    const params = typeof sqlOrObj === 'string' ? (args || []) : (sqlOrObj.args || []);
    const pgSql = toPgPlaceholders(sql);
    const result = await pool.query(pgSql, params);
    return { rows: result.rows, info: { changes: result.rowCount } };
  }
};

module.exports = { db: dbAsync, initDB };

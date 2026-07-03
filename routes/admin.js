const { createNotification } = require('./notifications');
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db');
const { protect, adminOnly } = require('../middleware/auth');

// All admin routes require auth + admin role
router.use(protect, adminOnly);

// ── USERS ─────────────────────────────────────────
// GET /api/admin/users?search=
router.get('/users', async (req, res) => {
  try {
    const search = req.query.search;
    const sql = search
      ? `SELECT id, username, email, role, avatar, bio, wallet_balance, is_verified, status, warn_count, plan, created_at FROM users WHERE username LIKE ? OR email LIKE ? ORDER BY created_at DESC LIMIT 200`
      : `SELECT id, username, email, role, avatar, bio, wallet_balance, is_verified, status, warn_count, plan, created_at FROM users ORDER BY created_at DESC LIMIT 200`;
    const result = await db.execute({ sql, args: search ? [`%${search}%`, `%${search}%`] : [] });
    res.json({ users: result.rows });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/admin/users/:id/status — ban | suspend | warn | unban
router.put('/users/:id/status', async (req, res) => {
  try {
    const { action } = req.body; // ban | unban | suspend | warn
    if (action === 'ban') await db.execute({ sql: "UPDATE users SET status = 'banned' WHERE id = ?", args: [req.params.id] });
    else if (action === 'unban') await db.execute({ sql: "UPDATE users SET status = 'active' WHERE id = ?", args: [req.params.id] });
    else if (action === 'suspend') await db.execute({ sql: "UPDATE users SET status = 'suspended' WHERE id = ?", args: [req.params.id] });
    else if (action === 'warn') await db.execute({ sql: "UPDATE users SET warn_count = warn_count + 1 WHERE id = ?", args: [req.params.id] });
    else return res.status(400).json({ message: 'Invalid action' });

    if (action === 'ban' || action === 'suspend') {
      await createNotification(req.params.id, `Account ${action}ed`, `Your account has been ${action}ed by an admin. Contact support if you believe this is a mistake.`, 'warn').catch(()=>{});
    } else if (action === 'warn') {
      await createNotification(req.params.id, 'Account Warning', 'You have received a warning for violating community guidelines.', 'warn').catch(()=>{});
    }
    res.json({ message: `User ${action}${action.endsWith('e')?'d':'ed'}` });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', async (req, res) => {
  try {
    await db.execute({ sql: 'DELETE FROM users WHERE id = ?', args: [req.params.id] });
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/admin/users/:id/role
router.put('/users/:id/role', async (req, res) => {
  try {
    const { role } = req.body;
    if (!['user', 'admin'].includes(role)) return res.status(400).json({ message: 'Invalid role' });
    await db.execute({ sql: 'UPDATE users SET role = ? WHERE id = ?', args: [role, req.params.id] });
    res.json({ message: 'Role updated' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/admin/wallet/topup
router.post('/wallet/topup', async (req, res) => {
  try {
    const { userId, amount, description } = req.body;
    if (!userId || !amount || isNaN(amount)) return res.status(400).json({ message: 'userId and amount required' });
    const result = await db.execute({ sql: 'SELECT wallet_balance FROM users WHERE id = ?', args: [userId] });
    if (result.rows.length === 0) return res.status(404).json({ message: 'User not found' });
    const newBalance = (result.rows[0].wallet_balance || 0) + parseFloat(amount);
    await db.execute({ sql: 'UPDATE users SET wallet_balance = ? WHERE id = ?', args: [newBalance, userId] });
    await db.execute({
      sql: 'INSERT INTO wallet_transactions (id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)',
      args: [uuidv4(), userId, 'topup', parseFloat(amount), description || 'Admin top-up']
    });
    await createNotification(userId, '⚡ COPS Added to Your Wallet', `${parseFloat(amount)} COPS have been added. New balance: ${newBalance} COPS.`, 'success');
    res.json({ message: 'Wallet topped up', balance: newBalance });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/admin/wallet/deduct
router.post('/wallet/deduct', async (req, res) => {
  try {
    const { userId, amount, description } = req.body;
    if (!userId || !amount || isNaN(amount)) return res.status(400).json({ message: 'userId and amount required' });
    const result = await db.execute({ sql: 'SELECT wallet_balance FROM users WHERE id = ?', args: [userId] });
    if (result.rows.length === 0) return res.status(404).json({ message: 'User not found' });
    const newBalance = Math.max(0, (result.rows[0].wallet_balance || 0) - parseFloat(amount));
    await db.execute({ sql: 'UPDATE users SET wallet_balance = ? WHERE id = ?', args: [newBalance, userId] });
    await db.execute({
      sql: 'INSERT INTO wallet_transactions (id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)',
      args: [uuidv4(), userId, 'deduct', parseFloat(amount), description || 'Admin deduction']
    });
    await createNotification(userId, '⚠ COPS Deducted', `${parseFloat(amount)} COPS were deducted. New balance: ${newBalance} COPS.`, 'warn');
    res.json({ message: 'Wallet deducted', balance: newBalance });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ── NEWS ──────────────────────────────────────────
// GET /api/admin/news
router.get('/news', async (req, res) => {
  try {
    const result = await db.execute(
      'SELECT * FROM news ORDER BY created_at DESC'
    );
    res.json({ news: result.rows });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/admin/news
router.post('/news', async (req, res) => {
  try {
    const { title, body, icon, color, category } = req.body;
    if (!title || !body) return res.status(400).json({ message: 'title and body required' });
    const id = uuidv4();
    await db.execute({
      sql: 'INSERT INTO news (id, title, body, icon, color, category, author_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      args: [id, title, body, icon || 'newspaper', color || '#00ffcc', category || 'general', req.user.id]
    });
    const result = await db.execute({ sql: 'SELECT * FROM news WHERE id = ?', args: [id] });
    res.status(201).json({ message: 'News created', news: result.rows[0] });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/admin/news/:id
router.put('/news/:id', async (req, res) => {
  try {
    const { title, body, icon, color, category } = req.body;
    await db.execute({
      sql: 'UPDATE news SET title=COALESCE(?,title), body=COALESCE(?,body), icon=COALESCE(?,icon), color=COALESCE(?,color), category=COALESCE(?,category) WHERE id=?',
      args: [title||null, body||null, icon||null, color||null, category||null, req.params.id]
    });
    const result = await db.execute({ sql: 'SELECT * FROM news WHERE id = ?', args: [req.params.id] });
    res.json({ message: 'News updated', news: result.rows[0] });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/admin/news/:id
router.delete('/news/:id', async (req, res) => {
  try {
    await db.execute({ sql: 'DELETE FROM news WHERE id = ?', args: [req.params.id] });
    res.json({ message: 'News deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ── POSTS ─────────────────────────────────────────
// GET /api/admin/posts
router.get('/posts', async (req, res) => {
  try {
    const result = await db.execute({
      sql: `SELECT p.id, p.content, p.media_url, p.created_at,
                   u.id as author_id, u.username as author_username
            FROM posts p JOIN users u ON p.author_id = u.id
            ORDER BY p.created_at DESC LIMIT 100`
    });
    res.json({ posts: result.rows });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/admin/posts/:id
router.delete('/posts/:id', async (req, res) => {
  try {
    await db.execute({ sql: 'DELETE FROM posts WHERE id = ?', args: [req.params.id] });
    res.json({ message: 'Post deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/admin/posts — post as admin/announcement
router.post('/posts', async (req, res) => {
  try {
    const { content, mediaUrl } = req.body;
    if (!content) return res.status(400).json({ message: 'Content required' });
    const id = uuidv4();
    await db.execute({
      sql: 'INSERT INTO posts (id, author_id, content, media_url) VALUES (?, ?, ?, ?)',
      args: [id, req.user.id, content, mediaUrl || '']
    });
    res.status(201).json({ message: 'Post created', id });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ── STATS ─────────────────────────────────────────
// GET /api/admin/stats
router.get('/stats', async (req, res) => {
  try {
    const users = await db.execute('SELECT COUNT(*) as total FROM users');
    const verified = await db.execute('SELECT COUNT(*) as total FROM users WHERE is_verified=1');
    const posts = await db.execute('SELECT COUNT(*) as total FROM posts');
    const news = await db.execute('SELECT COUNT(*) as total FROM news');
    const totalCops = await db.execute('SELECT COALESCE(SUM(wallet_balance),0) as total FROM users');
    res.json({
      totalUsers: users.rows[0].total,
      verifiedUsers: verified.rows[0].total,
      totalPosts: posts.rows[0].total,
      totalNews: news.rows[0].total,
      totalCopsInCirculation: totalCops.rows[0].total
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ── ANNOUNCEMENTS (broadcast post) ────────────────
// POST /api/admin/announce — pin a message to top of feed
router.post('/announce', async (req, res) => {
  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ message: 'Content required' });
    // Clear old pinned posts
    await db.execute({ sql: 'UPDATE posts SET pinned=0 WHERE pinned=1' });
    const id = uuidv4();
    await db.execute({
      sql: 'INSERT INTO posts (id, author_id, content, media_url, pinned) VALUES (?, ?, ?, ?, 1)',
      args: [id, req.user.id, content, '']
    });
    res.status(201).json({ message: 'Announcement posted', id });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ── EARNINGS ──────────────────────────────────────
// GET /api/admin/earnings — referral payouts, CPA/task tracking, revenue overview
router.get('/earnings', async (req, res) => {
  try {
    const referralPayouts = await db.execute({
      sql: `SELECT wt.user_id, u.username, SUM(wt.amount) as total FROM wallet_transactions wt
            JOIN users u ON u.id = wt.user_id WHERE wt.type = 'referral' GROUP BY wt.user_id ORDER BY total DESC LIMIT 20`,
      args: []
    });
    const taskPayouts = await db.execute({ sql: `SELECT COUNT(*) as completions, COALESCE(SUM(t.reward_cash),0) as cashPaid FROM task_completions tc JOIN earn_tasks t ON t.id = tc.task_id`, args: [] });
    const spinPayouts = await db.execute({ sql: `SELECT COUNT(*) as spins FROM spin_history`, args: [] });
    const marketplaceRevenue = await db.execute({ sql: `SELECT COUNT(*) as orders, COALESCE(SUM(price),0) as total FROM bot_orders`, args: [] });
    const premiumRevenue = await db.execute({ sql: `SELECT plan, COUNT(*) as c FROM users WHERE plan != 'free' GROUP BY plan`, args: [] });
    const totalWalletBalance = await db.execute({ sql: `SELECT COALESCE(SUM(wallet_balance),0) as t FROM users`, args: [] });
    res.json({
      referralPayouts: referralPayouts.rows,
      taskPayouts: taskPayouts.rows[0],
      totalSpins: spinPayouts.rows[0]?.spins || 0,
      marketplaceRevenue: marketplaceRevenue.rows[0],
      premiumByPlan: premiumRevenue.rows,
      totalWalletLiability: totalWalletBalance.rows[0]?.t || 0
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error loading earnings' });
  }
});

// ── AI ─────────────────────────────────────────────
router.get('/ai-stats', async (req, res) => {
  try {
    const totalChats = await db.execute({ sql: `SELECT COUNT(*) as c FROM activity_log WHERE kind = 'ai_chat'`, args: [] });
    const today = await db.execute({ sql: `SELECT COUNT(*) as c FROM activity_log WHERE kind = 'ai_chat' AND created_at >= datetime('now','-1 day')`, args: [] });
    const topUsers = await db.execute({
      sql: `SELECT u.username, COUNT(*) as c FROM activity_log a JOIN users u ON u.id = a.user_id WHERE a.kind = 'ai_chat' GROUP BY a.user_id ORDER BY c DESC LIMIT 10`,
      args: []
    });
    const lowCredits = await db.execute({ sql: `SELECT COUNT(*) as c FROM users WHERE plan = 'free' AND ai_credits <= 5`, args: [] });
    res.json({ totalChats: totalChats.rows[0].c, chatsToday: today.rows[0].c, topUsers: topUsers.rows, usersLowOnCredits: lowCredits.rows[0].c });
  } catch (err) {
    res.status(500).json({ message: 'Server error loading AI stats' });
  }
});

router.post('/ai/grant-credits', async (req, res) => {
  try {
    const { userId, amount } = req.body;
    await db.execute({ sql: 'UPDATE users SET ai_credits = ai_credits + ? WHERE id = ?', args: [amount, userId] });
    res.json({ message: `Granted ${amount} AI credits` });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

// ── MOVIES / FEATURED CONTENT ─────────────────────
router.get('/settings/:key', async (req, res) => {
  try {
    const row = await db.execute({ sql: 'SELECT value FROM app_settings WHERE key = ?', args: [req.params.key] });
    res.json({ key: req.params.key, value: row.rows[0]?.value || '' });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

router.put('/settings/:key', async (req, res) => {
  try {
    await db.execute({ sql: 'INSERT INTO app_settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', args: [req.params.key, req.body.value || ''] });
    res.json({ message: 'Setting saved' });
  } catch (err) { res.status(500).json({ message: 'Server error saving setting' }); }
});

router.get('/settings', async (req, res) => {
  try {
    const rows = await db.execute({ sql: 'SELECT * FROM app_settings', args: [] });
    res.json({ settings: Object.fromEntries(rows.rows.map(r => [r.key, r.value])) });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

// ── COMMUNITY MODERATION OVERVIEW ─────────────────
router.get('/moderation-summary', async (req, res) => {
  try {
    const openReports = await db.execute({ sql: `SELECT COUNT(*) as c FROM reports WHERE status = 'open'`, args: [] });
    const pendingBots = await db.execute({ sql: `SELECT COUNT(*) as c FROM bots_marketplace WHERE status = 'pending'`, args: [] });
    const pendingLibrary = await db.execute({ sql: `SELECT COUNT(*) as c FROM downloads_library WHERE status = 'pending'`, args: [] });
    const pendingWithdrawals = await db.execute({ sql: `SELECT COUNT(*) as c FROM wallet_requests WHERE type = 'withdraw' AND status = 'pending'`, args: [] });
    const pendingDeposits = await db.execute({ sql: `SELECT COUNT(*) as c FROM wallet_requests WHERE type = 'deposit' AND status = 'pending'`, args: [] });
    res.json({
      openReports: openReports.rows[0].c,
      pendingBots: pendingBots.rows[0].c,
      pendingLibrary: pendingLibrary.rows[0].c,
      pendingWithdrawals: pendingWithdrawals.rows[0].c,
      pendingDeposits: pendingDeposits.rows[0].c,
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error loading moderation summary' });
  }
});

module.exports = router;

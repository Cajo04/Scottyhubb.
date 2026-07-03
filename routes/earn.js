const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { protect } = require('../middleware/auth');

// GET /api/earn/referral — link, code, commission history
router.get('/referral', protect, async (req, res) => {
  try {
    const uid = req.user.id;
    const history = await db.execute({
      sql: `SELECT id, amount, description, created_at FROM wallet_transactions
            WHERE user_id = ? AND type = 'referral' ORDER BY created_at DESC LIMIT 50`,
      args: [uid]
    });
    const referredUsers = await db.execute({
      sql: `SELECT id, username, avatar, created_at FROM users WHERE referred_by = ? ORDER BY created_at DESC LIMIT 50`,
      args: [req.user.referral_code]
    });
    // Multi-level: level 2 = people referred by my referrals
    const level1Codes = await db.execute({
      sql: `SELECT referral_code FROM users WHERE referred_by = ?`,
      args: [req.user.referral_code]
    });
    let level2Count = 0;
    if (level1Codes.rows.length) {
      const codes = level1Codes.rows.map(r => r.referral_code).filter(Boolean);
      if (codes.length) {
        const placeholders = codes.map(() => '?').join(',');
        const l2 = await db.execute({
          sql: `SELECT COUNT(*) as c FROM users WHERE referred_by IN (${placeholders})`,
          args: codes
        });
        level2Count = l2.rows[0]?.c || 0;
      }
    }
    res.json({
      code: req.user.referral_code,
      link: `${req.protocol}://${req.get('host')}?ref=${req.user.referral_code}`,
      totalReferrals: referredUsers.rows.length,
      level2Count,
      history: history.rows,
      referredUsers: referredUsers.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error loading referral data' });
  }
});

// GET /api/earn/leaderboard?period=weekly|monthly|alltime
router.get('/leaderboard', async (req, res) => {
  try {
    const period = req.query.period || 'alltime';
    let dateFilter = '';
    if (period === 'weekly') dateFilter = "AND wt.created_at >= datetime('now', '-7 days')";
    else if (period === 'monthly') dateFilter = "AND wt.created_at >= datetime('now', '-30 days')";

    const rows = await db.execute({
      sql: `SELECT u.id, u.username, u.avatar, u.level, COALESCE(SUM(wt.amount),0) as earnings,
                   (SELECT COUNT(*) FROM users u2 WHERE u2.referred_by = u.referral_code) as referrals
            FROM users u
            LEFT JOIN wallet_transactions wt ON wt.user_id = u.id AND wt.type = 'referral' ${dateFilter}
            GROUP BY u.id
            HAVING referrals > 0 OR earnings > 0
            ORDER BY earnings DESC, referrals DESC
            LIMIT 25`,
      args: []
    });
    res.json({ period, leaderboard: rows.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error loading leaderboard' });
  }
});

// GET /api/earn/tasks — list active tasks with completion state
router.get('/tasks', protect, async (req, res) => {
  try {
    const uid = req.user.id;
    const tasks = await db.execute({
      sql: `SELECT t.*, 
              (SELECT COUNT(*) FROM task_completions tc WHERE tc.task_id = t.id AND tc.user_id = ?
                AND (t.cooldown_hours = 0 OR tc.created_at >= datetime('now', '-' || t.cooldown_hours || ' hours'))
              ) as done_recently
            FROM earn_tasks t WHERE t.active = 1 ORDER BY t.category ASC`,
      args: [uid]
    });
    res.json({ tasks: tasks.rows.map(t => ({ ...t, completed: !!t.done_recently })) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error loading tasks' });
  }
});

// POST /api/earn/tasks/:id/complete
router.post('/tasks/:id/complete', protect, async (req, res) => {
  try {
    const uid = req.user.id;
    const task = await db.execute({ sql: 'SELECT * FROM earn_tasks WHERE id = ? AND active = 1', args: [req.params.id] });
    const t = task.rows[0];
    if (!t) return res.status(404).json({ message: 'Task not found' });

    if (t.cooldown_hours > 0) {
      const recent = await db.execute({
        sql: `SELECT COUNT(*) as c FROM task_completions WHERE task_id = ? AND user_id = ? AND created_at >= datetime('now', '-' || ? || ' hours')`,
        args: [t.id, uid, t.cooldown_hours]
      });
      if (recent.rows[0].c > 0) return res.status(400).json({ message: 'Task already completed. Check back later.' });
    } else {
      const done = await db.execute({ sql: 'SELECT COUNT(*) as c FROM task_completions WHERE task_id = ? AND user_id = ?', args: [t.id, uid] });
      if (done.rows[0].c > 0) return res.status(400).json({ message: 'Task already completed.' });
    }

    await db.execute({
      sql: 'INSERT INTO task_completions (id, task_id, user_id) VALUES (?,?,?)',
      args: ['tc_' + Math.random().toString(36).slice(2, 12), t.id, uid]
    });
    if (t.reward_points > 0) {
      await db.execute({ sql: 'UPDATE users SET points_balance = points_balance + ? WHERE id = ?', args: [t.reward_points, uid] });
    }
    if (t.reward_cash > 0) {
      await db.execute({ sql: 'UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?', args: [t.reward_cash, uid] });
      await db.execute({
        sql: 'INSERT INTO wallet_transactions (id, user_id, type, amount, description) VALUES (?,?,?,?,?)',
        args: ['wt_' + Math.random().toString(36).slice(2, 12), uid, 'task', t.reward_cash, `Task: ${t.title}`]
      });
    }
    res.json({ message: 'Task completed!', pointsEarned: t.reward_points, cashEarned: t.reward_cash });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error completing task' });
  }
});

// POST /api/earn/spin — daily lucky spin (24h cooldown)
const SPIN_PRIZES = [
  { type: 'points', value: 10, weight: 30 },
  { type: 'points', value: 25, weight: 25 },
  { type: 'points', value: 50, weight: 15 },
  { type: 'cash', value: 0.10, weight: 12 },
  { type: 'cash', value: 0.25, weight: 8 },
  { type: 'premium_days', value: 1, weight: 5 },
  { type: 'ai_credits', value: 20, weight: 4 },
  { type: 'cash', value: 1.00, weight: 1 },
];
function rollPrize() {
  const total = SPIN_PRIZES.reduce((s, p) => s + p.weight, 0);
  let r = Math.random() * total;
  for (const p of SPIN_PRIZES) { if (r < p.weight) return p; r -= p.weight; }
  return SPIN_PRIZES[0];
}

router.get('/spin/status', protect, async (req, res) => {
  try {
    const last = await db.execute({
      sql: `SELECT created_at FROM spin_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`,
      args: [req.user.id]
    });
    const lastAt = last.rows[0]?.created_at || null;
    const canSpin = !lastAt || (Date.now() - new Date(lastAt.includes('T') ? lastAt : lastAt.replace(' ', 'T') + 'Z').getTime()) >= 24 * 3600 * 1000;
    res.json({ canSpin, lastSpin: lastAt });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/spin', protect, async (req, res) => {
  try {
    const uid = req.user.id;
    const last = await db.execute({ sql: `SELECT created_at FROM spin_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`, args: [uid] });
    const lastAt = last.rows[0]?.created_at;
    if (lastAt) {
      const elapsed = Date.now() - new Date(lastAt.includes('T') ? lastAt : lastAt.replace(' ', 'T') + 'Z').getTime();
      if (elapsed < 24 * 3600 * 1000) return res.status(400).json({ message: 'You already spun today. Come back tomorrow!' });
    }
    const prize = rollPrize();
    await db.execute({
      sql: 'INSERT INTO spin_history (id, user_id, prize_type, prize_value) VALUES (?,?,?,?)',
      args: ['spin_' + Math.random().toString(36).slice(2, 12), uid, prize.type, String(prize.value)]
    });
    if (prize.type === 'points') {
      await db.execute({ sql: 'UPDATE users SET points_balance = points_balance + ? WHERE id = ?', args: [prize.value, uid] });
    } else if (prize.type === 'cash') {
      await db.execute({ sql: 'UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?', args: [prize.value, uid] });
      await db.execute({ sql: 'INSERT INTO wallet_transactions (id, user_id, type, amount, description) VALUES (?,?,?,?,?)', args: ['wt_' + Math.random().toString(36).slice(2, 12), uid, 'spin', prize.value, 'Daily Spin Win'] });
    } else if (prize.type === 'ai_credits') {
      await db.execute({ sql: 'UPDATE users SET ai_credits = ai_credits + ? WHERE id = ?', args: [prize.value, uid] });
    } else if (prize.type === 'premium_days') {
      const curExpiry = req.user.plan_expiry;
      const base = curExpiry && new Date(curExpiry) > new Date() ? new Date(curExpiry) : new Date();
      base.setDate(base.getDate() + prize.value);
      await db.execute({ sql: `UPDATE users SET plan = CASE WHEN plan = 'free' THEN 'silver' ELSE plan END, plan_expiry = ? WHERE id = ?`, args: [base.toISOString(), uid] });
    }
    res.json({ message: 'Spin complete!', prize });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error spinning wheel' });
  }
});

module.exports = router;

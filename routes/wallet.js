const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { protect, adminOnly } = require('../middleware/auth');

const PAYMENT_METHODS = ['ecocash', 'mukuru', 'paypal', 'stripe', 'paystack', 'flutterwave', 'crypto'];

// GET /api/wallet/transactions
router.get('/transactions', protect, async (req, res) => {
  try {
    const rows = await db.execute({
      sql: 'SELECT id, type, amount, description, created_at FROM wallet_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 100',
      args: [req.user.id]
    });
    res.json({ transactions: rows.rows, balance: req.user.wallet_balance, points: req.user.points_balance });
  } catch (err) {
    res.status(500).json({ message: 'Server error loading transactions' });
  }
});

// POST /api/wallet/deposit — creates a pending deposit request (admin manually confirms once funds received)
router.post('/deposit', protect, async (req, res) => {
  try {
    const { amount, method, details } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ message: 'Enter a valid amount' });
    if (!PAYMENT_METHODS.includes(method)) return res.status(400).json({ message: 'Unsupported payment method' });
    const id = 'req_' + Math.random().toString(36).slice(2, 12);
    await db.execute({
      sql: `INSERT INTO wallet_requests (id, user_id, type, method, amount, details) VALUES (?,?,?,?,?,?)`,
      args: [id, req.user.id, 'deposit', method, amount, details || '']
    });
    res.json({ message: `Deposit request submitted via ${method.toUpperCase()}. It will reflect once confirmed by an admin.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error creating deposit request' });
  }
});

// POST /api/wallet/withdraw
router.post('/withdraw', protect, async (req, res) => {
  try {
    const { amount, method, details } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ message: 'Enter a valid amount' });
    if (!PAYMENT_METHODS.includes(method)) return res.status(400).json({ message: 'Unsupported payment method' });
    if ((req.user.wallet_balance || 0) < amount) return res.status(400).json({ message: 'Insufficient balance' });
    const id = 'req_' + Math.random().toString(36).slice(2, 12);
    // Hold the funds immediately so they can't double-spend while pending
    await db.execute({ sql: 'UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?', args: [amount, req.user.id] });
    await db.execute({
      sql: `INSERT INTO wallet_requests (id, user_id, type, method, amount, details) VALUES (?,?,?,?,?,?)`,
      args: [id, req.user.id, 'withdraw', method, amount, details || '']
    });
    await db.execute({ sql: 'INSERT INTO wallet_transactions (id, user_id, type, amount, description) VALUES (?,?,?,?,?)', args: ['wt_' + Math.random().toString(36).slice(2, 12), req.user.id, 'withdraw', -amount, `Withdrawal requested via ${method.toUpperCase()} (pending)`] });
    res.json({ message: `Withdrawal request submitted via ${method.toUpperCase()}. Funds are on hold pending admin approval.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error creating withdrawal request' });
  }
});

// GET /api/wallet/requests — my pending/past requests
router.get('/requests', protect, async (req, res) => {
  try {
    const rows = await db.execute({ sql: 'SELECT * FROM wallet_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 50', args: [req.user.id] });
    res.json({ requests: rows.rows });
  } catch (err) {
    res.status(500).json({ message: 'Server error loading requests' });
  }
});

// POST /api/wallet/redeem — coupon / gift card code
router.post('/redeem', protect, async (req, res) => {
  try {
    const code = (req.body.code || '').trim().toUpperCase();
    if (!code) return res.status(400).json({ message: 'Enter a code' });
    const c = await db.execute({ sql: 'SELECT * FROM coupons WHERE code = ?', args: [code] });
    const coupon = c.rows[0];
    if (!coupon || coupon.uses_left <= 0) return res.status(404).json({ message: 'Invalid or expired code' });

    const already = await db.execute({ sql: 'SELECT 1 FROM coupon_redemptions WHERE code = ? AND user_id = ?', args: [code, req.user.id] });
    if (already.rows.length) return res.status(400).json({ message: 'You already redeemed this code' });

    if (coupon.type === 'cash') {
      await db.execute({ sql: 'UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?', args: [coupon.value, req.user.id] });
      await db.execute({ sql: 'INSERT INTO wallet_transactions (id, user_id, type, amount, description) VALUES (?,?,?,?,?)', args: ['wt_' + Math.random().toString(36).slice(2, 12), req.user.id, 'coupon', coupon.value, `Redeemed code ${code}`] });
    } else if (coupon.type === 'points') {
      await db.execute({ sql: 'UPDATE users SET points_balance = points_balance + ? WHERE id = ?', args: [coupon.value, req.user.id] });
    } else if (coupon.type === 'premium_days') {
      const cur = req.user.plan_expiry;
      const base = cur && new Date(cur) > new Date() ? new Date(cur) : new Date();
      base.setDate(base.getDate() + coupon.value);
      await db.execute({ sql: `UPDATE users SET plan = CASE WHEN plan = 'free' THEN 'silver' ELSE plan END, plan_expiry = ? WHERE id = ?`, args: [base.toISOString(), req.user.id] });
    } else if (coupon.type === 'ai_credits') {
      await db.execute({ sql: 'UPDATE users SET ai_credits = ai_credits + ? WHERE id = ?', args: [coupon.value, req.user.id] });
    }

    await db.execute({ sql: 'INSERT INTO coupon_redemptions (id, code, user_id) VALUES (?,?,?)', args: ['cr_' + Math.random().toString(36).slice(2, 12), code, req.user.id] });
    await db.execute({ sql: 'UPDATE coupons SET uses_left = uses_left - 1 WHERE code = ?', args: [code] });
    res.json({ message: `Code redeemed! +${coupon.value} ${coupon.type.replace('_', ' ')}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error redeeming code' });
  }
});

// ── ADMIN ──
router.get('/admin/requests', protect, adminOnly, async (req, res) => {
  try {
    const status = req.query.status || 'pending';
    const rows = await db.execute({
      sql: `SELECT r.*, u.username FROM wallet_requests r JOIN users u ON u.id = r.user_id WHERE r.status = ? ORDER BY r.created_at DESC LIMIT 100`,
      args: [status]
    });
    res.json({ requests: rows.rows });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

router.put('/admin/requests/:id', protect, adminOnly, async (req, res) => {
  try {
    const { action, note } = req.body; // action: approve | reject
    const r = await db.execute({ sql: 'SELECT * FROM wallet_requests WHERE id = ?', args: [req.params.id] });
    const reqRow = r.rows[0];
    if (!reqRow || reqRow.status !== 'pending') return res.status(400).json({ message: 'Request already processed' });

    if (action === 'approve') {
      if (reqRow.type === 'deposit') {
        await db.execute({ sql: 'UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?', args: [reqRow.amount, reqRow.user_id] });
        await db.execute({ sql: 'INSERT INTO wallet_transactions (id, user_id, type, amount, description) VALUES (?,?,?,?,?)', args: ['wt_' + Math.random().toString(36).slice(2, 12), reqRow.user_id, 'deposit', reqRow.amount, `Deposit via ${reqRow.method.toUpperCase()} approved`] });
      }
      // withdrawals: funds already deducted at request time, nothing more to do
    } else if (action === 'reject') {
      if (reqRow.type === 'withdraw') {
        await db.execute({ sql: 'UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?', args: [reqRow.amount, reqRow.user_id] });
        await db.execute({ sql: 'INSERT INTO wallet_transactions (id, user_id, type, amount, description) VALUES (?,?,?,?,?)', args: ['wt_' + Math.random().toString(36).slice(2, 12), reqRow.user_id, 'refund', reqRow.amount, 'Withdrawal rejected - refunded'] });
      }
    }
    await db.execute({ sql: `UPDATE wallet_requests SET status = ?, admin_note = ?, updated_at = datetime('now') WHERE id = ?`, args: [action === 'approve' ? 'approved' : 'rejected', note || '', req.params.id] });
    res.json({ message: `Request ${action}d` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error processing request' });
  }
});

router.post('/admin/coupons', protect, adminOnly, async (req, res) => {
  try {
    const { code, type, value, usesLeft } = req.body;
    await db.execute({
      sql: 'INSERT INTO coupons (code, type, value, uses_left) VALUES (?,?,?,?)',
      args: [(code || '').toUpperCase(), type, value, usesLeft || 1]
    });
    res.json({ message: 'Coupon created' });
  } catch (err) { res.status(500).json({ message: 'Server error creating coupon' }); }
});

router.get('/admin/coupons', protect, adminOnly, async (req, res) => {
  try {
    const rows = await db.execute({ sql: 'SELECT * FROM coupons ORDER BY created_at DESC LIMIT 100', args: [] });
    res.json({ coupons: rows.rows });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;

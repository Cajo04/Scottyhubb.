const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { protect } = require('../middleware/auth');

const PLANS = {
  free:     { name: 'Free',     price: 0,  days: 0,  benefits: ['Standard download speed', 'Limited AI credits/day', 'Ads supported'] },
  silver:   { name: 'Silver',   price: 3,  days: 30, benefits: ['Faster downloads', '3x AI credits', 'Fewer ads', 'Silver badge'] },
  gold:     { name: 'Gold',     price: 7,  days: 30, benefits: ['Faster downloads', 'Unlimited AI chat', 'No ads', 'Exclusive bots', 'Gold badge', 'Higher withdrawal limits'] },
  platinum: { name: 'Platinum', price: 15, days: 30, benefits: ['Fastest downloads', 'Unlimited AI + priority', 'No ads', 'Exclusive bots', 'Extra storage', 'VIP badge', 'Highest withdrawal limits', 'Early access to new features'] },
};

router.get('/plans', protect, async (req, res) => {
  res.json({ plans: PLANS, currentPlan: req.user.plan, expiry: req.user.plan_expiry });
});

router.post('/upgrade', protect, async (req, res) => {
  try {
    const { plan } = req.body;
    const target = PLANS[plan];
    if (!target || plan === 'free') return res.status(400).json({ message: 'Invalid plan selected' });
    if ((req.user.wallet_balance || 0) < target.price) return res.status(400).json({ message: 'Insufficient wallet balance. Top up first.' });

    await db.execute({ sql: 'UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?', args: [target.price, req.user.id] });
    const base = req.user.plan_expiry && new Date(req.user.plan_expiry) > new Date() ? new Date(req.user.plan_expiry) : new Date();
    base.setDate(base.getDate() + target.days);
    await db.execute({ sql: 'UPDATE users SET plan = ?, plan_expiry = ? WHERE id = ?', args: [plan, base.toISOString(), req.user.id] });
    await db.execute({ sql: 'INSERT INTO wallet_transactions (id, user_id, type, amount, description) VALUES (?,?,?,?,?)', args: ['wt_' + Math.random().toString(36).slice(2, 12), req.user.id, 'spend', -target.price, `Upgraded to ${target.name}`] });
    res.json({ message: `Upgraded to ${target.name}! Active until ${base.toISOString().slice(0, 10)}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error upgrading plan' });
  }
});

module.exports = router;

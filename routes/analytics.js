const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { protect } = require('../middleware/auth');

router.get('/', protect, async (req, res) => {
  try {
    const uid = req.user.id;

    // Earnings by day (last 14 days)
    const earningsSeries = await db.execute({
      sql: `SELECT date(created_at) as day, SUM(amount) as total FROM wallet_transactions
            WHERE user_id = ? AND amount > 0 AND created_at >= datetime('now', '-14 days')
            GROUP BY day ORDER BY day ASC`,
      args: [uid]
    });

    // Referral growth by day (last 30 days)
    const referralSeries = await db.execute({
      sql: `SELECT date(created_at) as day, COUNT(*) as count FROM users
            WHERE referred_by = ? AND created_at >= datetime('now', '-30 days')
            GROUP BY day ORDER BY day ASC`,
      args: [req.user.referral_code]
    });

    // AI usage count (logged via activity_log kind='ai_chat')
    const aiUsage = await db.execute({
      sql: `SELECT COUNT(*) as c FROM activity_log WHERE user_id = ? AND kind = 'ai_chat' AND created_at >= datetime('now', '-30 days')`,
      args: [uid]
    });

    // Download history count
    const downloadHistory = await db.execute({
      sql: `SELECT COUNT(*) as c FROM activity_log WHERE user_id = ? AND kind = 'download'`,
      args: [uid]
    });

    // Achievement progress
    const badgeCount = await db.execute({ sql: 'SELECT COUNT(*) as c FROM user_badges WHERE user_id = ?', args: [uid] });
    const totalBadges = await db.execute({ sql: 'SELECT COUNT(*) as c FROM badges', args: [] });

    // Totals
    const totalEarnings = await db.execute({ sql: 'SELECT COALESCE(SUM(amount),0) as t FROM wallet_transactions WHERE user_id = ? AND amount > 0', args: [uid] });
    const weekEarnings = await db.execute({ sql: `SELECT COALESCE(SUM(amount),0) as t FROM wallet_transactions WHERE user_id = ? AND amount > 0 AND created_at >= datetime('now','-7 days')`, args: [uid] });

    res.json({
      earningsSeries: earningsSeries.rows,
      referralSeries: referralSeries.rows,
      aiUsageCount: aiUsage.rows[0]?.c || 0,
      downloadCount: downloadHistory.rows[0]?.c || 0,
      achievements: { earned: badgeCount.rows[0]?.c || 0, total: totalBadges.rows[0]?.c || 0 },
      totalEarnings: totalEarnings.rows[0]?.t || 0,
      weekEarnings: weekEarnings.rows[0]?.t || 0,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error loading analytics' });
  }
});

module.exports = router;

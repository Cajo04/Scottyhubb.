const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { protect, adminOnly } = require('../middleware/auth');

// GET /api/marketplace/bots
router.get('/bots', async (req, res) => {
  try {
    const bots = await db.execute({
      sql: `SELECT b.*, u.username as ownerName,
              (SELECT ROUND(AVG(rating),1) FROM bot_reviews WHERE bot_id = b.id) as avgRating,
              (SELECT COUNT(*) FROM bot_reviews WHERE bot_id = b.id) as reviewCount
            FROM bots_marketplace b LEFT JOIN users u ON u.id = b.owner_id
            WHERE b.status = 'approved' ORDER BY b.featured DESC, b.created_at DESC`,
      args: []
    });
    res.json({ bots: bots.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error loading bots' });
  }
});

// POST /api/marketplace/bots — submit a bot to sell (goes to pending review)
router.post('/bots', protect, async (req, res) => {
  try {
    const { name, description, icon, listingType, price, downloadUrl } = req.body;
    if (!name) return res.status(400).json({ message: 'Bot name is required' });
    const id = 'mkt_' + Math.random().toString(36).slice(2, 12);
    await db.execute({
      sql: `INSERT INTO bots_marketplace (id, owner_id, name, description, icon, listing_type, price, download_url, status)
            VALUES (?,?,?,?,?,?,?,?,'pending')`,
      args: [id, req.user.id, name, description || '', icon || 'bot', listingType || 'buy', price || 0, downloadUrl || '']
    });
    res.json({ message: 'Bot submitted for review! We\'ll notify you once approved.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error submitting bot' });
  }
});

// POST /api/marketplace/bots/:id/buy  (also handles rent)
router.post('/bots/:id/buy', protect, async (req, res) => {
  try {
    const uid = req.user.id;
    const b = await db.execute({ sql: 'SELECT * FROM bots_marketplace WHERE id = ? AND status = ?', args: [req.params.id, 'approved'] });
    const bot = b.rows[0];
    if (!bot) return res.status(404).json({ message: 'Bot not found' });

    if (bot.price > 0) {
      if ((req.user.wallet_balance || 0) < bot.price) return res.status(400).json({ message: 'Insufficient wallet balance. Top up first.' });
      await db.execute({ sql: 'UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?', args: [bot.price, uid] });
      await db.execute({ sql: 'INSERT INTO wallet_transactions (id, user_id, type, amount, description) VALUES (?,?,?,?,?)', args: ['wt_' + Math.random().toString(36).slice(2, 12), uid, 'spend', -bot.price, `${bot.listing_type === 'rent' ? 'Rented' : 'Bought'}: ${bot.name}`] });
      if (bot.owner_id && bot.owner_id !== uid) {
        const cut = bot.price * 0.8; // 20% marketplace fee
        await db.execute({ sql: 'UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?', args: [cut, bot.owner_id] });
        await db.execute({ sql: 'INSERT INTO wallet_transactions (id, user_id, type, amount, description) VALUES (?,?,?,?,?)', args: ['wt_' + Math.random().toString(36).slice(2, 12), bot.owner_id, 'sale', cut, `Sold: ${bot.name}`] });
      }
    }
    const expiresAt = bot.listing_type === 'rent' ? new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString() : null;
    await db.execute({
      sql: 'INSERT INTO bot_orders (id, bot_id, user_id, type, price, expires_at) VALUES (?,?,?,?,?,?)',
      args: ['ord_' + Math.random().toString(36).slice(2, 12), bot.id, uid, bot.listing_type, bot.price, expiresAt]
    });
    res.json({ message: `${bot.listing_type === 'rent' ? 'Rental' : 'Purchase'} successful!`, downloadUrl: bot.download_url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error processing order' });
  }
});

// GET /api/marketplace/bots/:id/reviews
router.get('/bots/:id/reviews', async (req, res) => {
  try {
    const rows = await db.execute({
      sql: `SELECT r.*, u.username, u.avatar FROM bot_reviews r JOIN users u ON u.id = r.user_id
            WHERE r.bot_id = ? ORDER BY r.created_at DESC LIMIT 50`,
      args: [req.params.id]
    });
    res.json({ reviews: rows.rows });
  } catch (err) {
    res.status(500).json({ message: 'Server error loading reviews' });
  }
});

// POST /api/marketplace/bots/:id/review
router.post('/bots/:id/review', protect, async (req, res) => {
  try {
    const { rating, comment } = req.body;
    await db.execute({
      sql: 'INSERT INTO bot_reviews (id, bot_id, user_id, rating, comment) VALUES (?,?,?,?,?)',
      args: ['rev_' + Math.random().toString(36).slice(2, 12), req.params.id, req.user.id, Math.min(5, Math.max(1, rating || 5)), comment || '']
    });
    res.json({ message: 'Review posted!' });
  } catch (err) {
    res.status(500).json({ message: 'Server error posting review' });
  }
});

// GET /api/marketplace/my-orders
router.get('/my-orders', protect, async (req, res) => {
  try {
    const rows = await db.execute({
      sql: `SELECT o.*, b.name, b.download_url, b.icon FROM bot_orders o JOIN bots_marketplace b ON b.id = o.bot_id
            WHERE o.user_id = ? ORDER BY o.created_at DESC`,
      args: [req.user.id]
    });
    res.json({ orders: rows.rows });
  } catch (err) {
    res.status(500).json({ message: 'Server error loading orders' });
  }
});

// ── ADMIN ──
router.get('/admin/pending', protect, adminOnly, async (req, res) => {
  try {
    const rows = await db.execute({ sql: `SELECT * FROM bots_marketplace WHERE status = 'pending' ORDER BY created_at DESC`, args: [] });
    res.json({ bots: rows.rows });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

router.put('/admin/bots/:id', protect, adminOnly, async (req, res) => {
  try {
    const { status, featured } = req.body;
    if (status) await db.execute({ sql: 'UPDATE bots_marketplace SET status = ? WHERE id = ?', args: [status, req.params.id] });
    if (typeof featured === 'boolean') await db.execute({ sql: 'UPDATE bots_marketplace SET featured = ? WHERE id = ?', args: [featured ? 1 : 0, req.params.id] });
    res.json({ message: 'Bot updated' });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;

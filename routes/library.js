const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { protect, adminOnly } = require('../middleware/auth');

const CATEGORIES = ['apps', 'games', 'movies', 'music', 'books', 'pdfs', 'software', 'wallpapers', 'themes'];

// GET /api/library?category=apps
router.get('/', async (req, res) => {
  try {
    const cat = req.query.category;
    const sql = cat
      ? `SELECT l.*, u.username as uploaderName FROM downloads_library l LEFT JOIN users u ON u.id = l.uploader_id WHERE l.status = 'approved' AND l.category = ? ORDER BY l.created_at DESC LIMIT 100`
      : `SELECT l.*, u.username as uploaderName FROM downloads_library l LEFT JOIN users u ON u.id = l.uploader_id WHERE l.status = 'approved' ORDER BY l.created_at DESC LIMIT 100`;
    const rows = await db.execute({ sql, args: cat ? [cat] : [] });
    res.json({ items: rows.rows, categories: CATEGORIES });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error loading library' });
  }
});

// POST /api/library — submit a resource (goes to pending review)
router.post('/', protect, async (req, res) => {
  try {
    const { category, title, description, url, sizeLabel } = req.body;
    if (!title || !url) return res.status(400).json({ message: 'Title and URL are required' });
    if (!CATEGORIES.includes(category)) return res.status(400).json({ message: 'Invalid category' });
    const id = 'lib_' + Math.random().toString(36).slice(2, 12);
    await db.execute({
      sql: `INSERT INTO downloads_library (id, uploader_id, category, title, description, url, size_label, status)
            VALUES (?,?,?,?,?,?,?,'pending')`,
      args: [id, req.user.id, category, title, description || '', url, sizeLabel || '']
    });
    res.json({ message: 'Submitted for review! It\'ll be live once approved.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error submitting resource' });
  }
});

// POST /api/library/:id/download — track download count + log activity
router.post('/:id/download', protect, async (req, res) => {
  try {
    await db.execute({ sql: 'UPDATE downloads_library SET downloads_count = downloads_count + 1 WHERE id = ?', args: [req.params.id] });
    await db.execute({ sql: 'INSERT INTO activity_log (id, user_id, kind, label) VALUES (?,?,?,?)', args: ['log_' + Math.random().toString(36).slice(2, 12), req.user.id, 'download', req.params.id] });
    const item = await db.execute({ sql: 'SELECT url FROM downloads_library WHERE id = ?', args: [req.params.id] });
    res.json({ url: item.rows[0]?.url || '' });
  } catch (err) {
    res.status(500).json({ message: 'Server error tracking download' });
  }
});

// ── ADMIN ──
router.get('/admin/pending', protect, adminOnly, async (req, res) => {
  try {
    const rows = await db.execute({ sql: `SELECT * FROM downloads_library WHERE status = 'pending' ORDER BY created_at DESC`, args: [] });
    res.json({ items: rows.rows });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

router.put('/admin/:id', protect, adminOnly, async (req, res) => {
  try {
    await db.execute({ sql: 'UPDATE downloads_library SET status = ? WHERE id = ?', args: [req.body.status, req.params.id] });
    res.json({ message: 'Resource updated' });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;

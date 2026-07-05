const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { protect } = require('../middleware/auth');

// ── POLLS ── (standalone community polls — separate from post-attached polls in posts.js)

// GET /api/social/polls
router.get('/polls', protect, async (req, res) => {
  try {
    const rows = await db.execute({
      sql: `SELECT p.*, u.username, u.avatar FROM standalone_polls p JOIN users u ON u.id = p.author_id ORDER BY p.created_at DESC LIMIT 30`,
      args: []
    });
    const myVotes = await db.execute({ sql: 'SELECT poll_id, option_index FROM standalone_poll_votes WHERE user_id = ?', args: [req.user.id] });
    const voteMap = Object.fromEntries(myVotes.rows.map(v => [v.poll_id, v.option_index]));
    const polls = [];
    for (const p of rows.rows) {
      const counts = await db.execute({ sql: 'SELECT option_index, COUNT(*) as c FROM standalone_poll_votes WHERE poll_id = ? GROUP BY option_index', args: [p.id] });
      const options = JSON.parse(p.options_json);
      const tally = options.map((_, i) => counts.rows.find(c => c.option_index === i)?.c || 0);
      polls.push({ ...p, options, tally, myVote: voteMap[p.id] ?? null });
    }
    res.json({ polls });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error loading polls' });
  }
});

// POST /api/social/polls — { question, options: string[] }
router.post('/polls', protect, async (req, res) => {
  try {
    const { question, options } = req.body;
    if (!question || !question.trim() || !Array.isArray(options) || options.filter(o => o && o.trim()).length < 2) {
      return res.status(400).json({ message: 'Question + at least 2 options are required' });
    }
    const cleanOptions = options.filter(o => o && o.trim()).map(o => o.trim()).slice(0, 6);
    const id = 'poll_' + Math.random().toString(36).slice(2, 12);
    await db.execute({
      sql: 'INSERT INTO standalone_polls (id, author_id, question, options_json) VALUES (?,?,?,?)',
      args: [id, req.user.id, question.trim(), JSON.stringify(cleanOptions)]
    });
    res.json({ message: 'Poll created!', id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error creating poll' });
  }
});

// POST /api/social/polls/:id/vote — { optionIndex }
router.post('/polls/:id/vote', protect, async (req, res) => {
  try {
    const optionIndex = parseInt(req.body.optionIndex, 10);
    if (isNaN(optionIndex)) return res.status(400).json({ message: 'optionIndex is required' });
    await db.execute({
      sql: `INSERT INTO standalone_poll_votes (poll_id, user_id, option_index) VALUES (?,?,?)
            ON CONFLICT(poll_id, user_id) DO UPDATE SET option_index = excluded.option_index`,
      args: [req.params.id, req.user.id, optionIndex]
    });
    res.json({ message: 'Vote counted!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error voting' });
  }
});

module.exports = router;

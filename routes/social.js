const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { protect, adminOnly } = require('../middleware/auth');

// ── POLLS ──
router.get('/polls', protect, async (req, res) => {
  try {
    const rows = await db.execute({
      sql: `SELECT p.*, u.username, u.avatar FROM polls p JOIN users u ON u.id = p.author_id ORDER BY p.created_at DESC LIMIT 30`,
      args: []
    });
    const myVotes = await db.execute({ sql: 'SELECT poll_id, option_index FROM poll_votes WHERE user_id = ?', args: [req.user.id] });
    const voteMap = Object.fromEntries(myVotes.rows.map(v => [v.poll_id, v.option_index]));
    const polls = [];
    for (const p of rows.rows) {
      const counts = await db.execute({ sql: 'SELECT option_index, COUNT(*) as c FROM poll_votes WHERE poll_id = ? GROUP BY option_index', args: [p.id] });
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

router.post('/polls', protect, async (req, res) => {
  try {
    const { question, options } = req.body;
    if (!question || !Array.isArray(options) || options.length < 2) return res.status(400).json({ message: 'Question + at least 2 options required' });
    const id = 'poll_' + Math.random().toString(36).slice(2, 12);
    await db.execute({ sql: 'INSERT INTO polls (id, author_id, question, options_json) VALUES (?,?,?,?)', args: [id, req.user.id, question, JSON.stringify(options)] });
    res.json({ message: 'Poll created!', id });
  } catch (err) { res.status(500).json({ message: 'Server error creating poll' }); }
});

router.post('/polls/:id/vote', protect, async (req, res) => {
  try {
    await db.execute({
      sql: 'INSERT INTO poll_votes (poll_id, user_id, option_index) VALUES (?,?,?) ON CONFLICT(poll_id, user_id) DO UPDATE SET option_index = excluded.option_index',
      args: [req.params.id, req.user.id, req.body.optionIndex]
    });
    res.json({ message: 'Vote counted!' });
  } catch (err) { res.status(500).json({ message: 'Server error voting' }); }
});

// ── GROUPS ──
router.get('/groups', protect, async (req, res) => {
  try {
    const rows = await db.execute({
      sql: `SELECT g.*, (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id) as memberCount,
            (SELECT 1 FROM group_members gm2 WHERE gm2.group_id = g.id AND gm2.user_id = ?) as joined
            FROM groups_table g ORDER BY g.created_at DESC LIMIT 50`,
      args: [req.user.id]
    });
    res.json({ groups: rows.rows.map(g => ({ ...g, joined: !!g.joined })) });
  } catch (err) { res.status(500).json({ message: 'Server error loading groups' }); }
});

router.post('/groups', protect, async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ message: 'Group name required' });
    const id = 'grp_' + Math.random().toString(36).slice(2, 12);
    await db.execute({ sql: 'INSERT INTO groups_table (id, name, description, creator_id) VALUES (?,?,?,?)', args: [id, name, description || '', req.user.id] });
    await db.execute({ sql: 'INSERT INTO group_members (group_id, user_id) VALUES (?,?)', args: [id, req.user.id] });
    res.json({ message: 'Group created!', id });
  } catch (err) { res.status(500).json({ message: 'Server error creating group' }); }
});

router.post('/groups/:id/join', protect, async (req, res) => {
  try {
    await db.execute({ sql: 'INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?,?)', args: [req.params.id, req.user.id] });
    res.json({ message: 'Joined group!' });
  } catch (err) { res.status(500).json({ message: 'Server error joining group' }); }
});

router.post('/groups/:id/leave', protect, async (req, res) => {
  try {
    await db.execute({ sql: 'DELETE FROM group_members WHERE group_id = ? AND user_id = ?', args: [req.params.id, req.user.id] });
    res.json({ message: 'Left group' });
  } catch (err) { res.status(500).json({ message: 'Server error leaving group' }); }
});

// ── EVENTS ──
router.get('/events', protect, async (req, res) => {
  try {
    const rows = await db.execute({
      sql: `SELECT e.*, (SELECT COUNT(*) FROM event_rsvps er WHERE er.event_id = e.id) as rsvpCount,
            (SELECT 1 FROM event_rsvps er2 WHERE er2.event_id = e.id AND er2.user_id = ?) as going
            FROM events_table e ORDER BY e.start_time ASC LIMIT 50`,
      args: [req.user.id]
    });
    res.json({ events: rows.rows.map(e => ({ ...e, going: !!e.going })) });
  } catch (err) { res.status(500).json({ message: 'Server error loading events' }); }
});

router.post('/events', protect, async (req, res) => {
  try {
    const { title, description, startTime } = req.body;
    if (!title || !startTime) return res.status(400).json({ message: 'Title + start time required' });
    const id = 'evt_' + Math.random().toString(36).slice(2, 12);
    await db.execute({ sql: 'INSERT INTO events_table (id, creator_id, title, description, start_time) VALUES (?,?,?,?,?)', args: [id, req.user.id, title, description || '', startTime] });
    res.json({ message: 'Event created!', id });
  } catch (err) { res.status(500).json({ message: 'Server error creating event' }); }
});

router.post('/events/:id/rsvp', protect, async (req, res) => {
  try {
    await db.execute({ sql: 'INSERT OR IGNORE INTO event_rsvps (event_id, user_id) VALUES (?,?)', args: [req.params.id, req.user.id] });
    res.json({ message: 'You\'re going!' });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

// ── REPORTS ──
router.post('/reports', protect, async (req, res) => {
  try {
    const { targetType, targetId, reason } = req.body;
    const id = 'rpt_' + Math.random().toString(36).slice(2, 12);
    await db.execute({ sql: 'INSERT INTO reports (id, reporter_id, target_type, target_id, reason) VALUES (?,?,?,?,?)', args: [id, req.user.id, targetType, targetId, reason || ''] });
    res.json({ message: 'Report submitted. Our team will review it.' });
  } catch (err) { res.status(500).json({ message: 'Server error submitting report' }); }
});

router.get('/admin/reports', protect, adminOnly, async (req, res) => {
  try {
    const rows = await db.execute({ sql: `SELECT r.*, u.username as reporterName FROM reports r LEFT JOIN users u ON u.id = r.reporter_id WHERE r.status = 'open' ORDER BY r.created_at DESC LIMIT 100`, args: [] });
    res.json({ reports: rows.rows });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

router.put('/admin/reports/:id', protect, adminOnly, async (req, res) => {
  try {
    await db.execute({ sql: 'UPDATE reports SET status = ? WHERE id = ?', args: [req.body.status || 'resolved', req.params.id] });
    res.json({ message: 'Report updated' });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;

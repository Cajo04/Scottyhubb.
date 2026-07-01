const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { protect, adminOnly } = require('../middleware/auth');

// GET /api/users/me
router.get('/me', protect, (req, res) => {
  res.json(req.user);
});

// PUT /api/users/me — update username, bio, avatar
router.put('/me', protect, async (req, res) => {
  try {
    const { username, bio, avatar } = req.body;
    // check username not taken by someone else
    if (username) {
      const taken = await db.execute({
        sql: 'SELECT id FROM users WHERE username = ? AND id != ?',
        args: [username, req.user.id]
      });
      if (taken.rows.length > 0)
        return res.status(400).json({ message: 'Username already taken' });
    }
    await db.execute({
      sql: `UPDATE users SET
              username = COALESCE(?, username),
              bio = COALESCE(?, bio),
              avatar = COALESCE(?, avatar)
            WHERE id = ?`,
      args: [username || null, bio !== undefined ? bio : null, avatar !== undefined ? avatar : null, req.user.id]
    });
    const result = await db.execute({
      sql: 'SELECT id, username, email, role, avatar, bio, wallet_balance, is_verified FROM users WHERE id = ?',
      args: [req.user.id]
    });
    res.json({ message: 'Profile updated', user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/users/me/password — change password (requires current password)
router.put('/me/password', protect, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword)
      return res.status(400).json({ message: 'Current and new password required' });
    if (newPassword.length < 6)
      return res.status(400).json({ message: 'New password must be at least 6 characters' });

    const result = await db.execute({
      sql: 'SELECT password FROM users WHERE id = ?',
      args: [req.user.id]
    });
    const user = result.rows[0];
    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match)
      return res.status(400).json({ message: 'Current password is incorrect' });

    const hashed = await bcrypt.hash(newPassword, 10);
    await db.execute({
      sql: 'UPDATE users SET password = ? WHERE id = ?',
      args: [hashed, req.user.id]
    });
    res.json({ message: 'Password changed successfully!' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/users/wallet
router.get('/wallet', protect, async (req, res) => {
  try {
    const user = await db.execute({
      sql: 'SELECT wallet_balance FROM users WHERE id = ?',
      args: [req.user.id]
    });
    const txns = await db.execute({
      sql: 'SELECT * FROM wallet_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
      args: [req.user.id]
    });
    res.json({ balance: user.rows[0]?.wallet_balance || 0, transactions: txns.rows });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/users/wallet/spend
router.post('/wallet/spend', protect, async (req, res) => {
  try {
    const { amount, description } = req.body;
    const result = await db.execute({
      sql: 'SELECT wallet_balance FROM users WHERE id = ?',
      args: [req.user.id]
    });
    const balance = result.rows[0]?.wallet_balance || 0;
    if (balance < amount) return res.status(400).json({ message: 'Insufficient COPS balance' });

    const newBalance = balance - amount;
    await db.execute({
      sql: 'UPDATE users SET wallet_balance = ? WHERE id = ?',
      args: [newBalance, req.user.id]
    });
    await db.execute({
      sql: 'INSERT INTO wallet_transactions (id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)',
      args: [uuidv4(), req.user.id, 'spend', amount, description || '']
    });
    res.json({ message: 'Payment successful', balance: newBalance });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/users — admin only
router.get('/', protect, adminOnly, async (req, res) => {
  try {
    const result = await db.execute(
      'SELECT id, username, email, role, avatar, bio, wallet_balance, is_verified, created_at FROM users ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/users/:id — admin only
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    await db.execute({ sql: 'DELETE FROM users WHERE id = ?', args: [req.params.id] });
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});


// GET /api/users/:id/profile — public profile
router.get('/:id/profile', protect, async (req, res) => {
  try {
    const uid = req.params.id;
    const user = await db.execute({
      sql: 'SELECT id, username, avatar, bio, last_seen, created_at FROM users WHERE id = ?',
      args: [uid]
    });
    if (user.rows.length === 0) return res.status(404).json({ message: 'User not found' });
    const u = user.rows[0];

    const followers = await db.execute({ sql: 'SELECT COUNT(*) as c FROM follows WHERE following_id = ?', args: [uid] });
    const following = await db.execute({ sql: 'SELECT COUNT(*) as c FROM follows WHERE follower_id = ?', args: [uid] });
    const posts = await db.execute({
      sql: `SELECT p.id, p.content, p.media_url, p.created_at,
                   (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as like_count,
                   (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count
            FROM posts p WHERE p.author_id = ? ORDER BY p.created_at DESC LIMIT 20`,
      args: [uid]
    });
    const isFollowing = await db.execute({
      sql: 'SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?',
      args: [req.user.id, uid]
    });

    res.json({
      ...u,
      followerCount: followers.rows[0].c,
      followingCount: following.rows[0].c,
      postCount: posts.rows.length,
      posts: posts.rows,
      isFollowing: isFollowing.rows.length > 0
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;

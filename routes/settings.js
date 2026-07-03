const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { db } = require('../db');
const { protect } = require('../middleware/auth');

router.get('/', protect, async (req, res) => {
  try {
    const keys = await db.execute({ sql: 'SELECT id, label, key_value, created_at, last_used FROM api_keys WHERE user_id = ?', args: [req.user.id] });
    let notifPrefs = {};
    try { notifPrefs = JSON.parse(req.user.notif_prefs || '{}'); } catch (e) {}
    res.json({
      darkMode: !!req.user.dark_mode,
      twoFaEnabled: !!req.user.two_fa_enabled,
      notifPrefs,
      apiKeys: keys.rows,
      plan: req.user.plan,
      planExpiry: req.user.plan_expiry
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error loading settings' });
  }
});

router.put('/dark-mode', protect, async (req, res) => {
  try {
    await db.execute({ sql: 'UPDATE users SET dark_mode = ? WHERE id = ?', args: [req.body.enabled ? 1 : 0, req.user.id] });
    res.json({ message: 'Preference saved' });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

router.put('/notifications', protect, async (req, res) => {
  try {
    await db.execute({ sql: 'UPDATE users SET notif_prefs = ? WHERE id = ?', args: [JSON.stringify(req.body.prefs || {}), req.user.id] });
    res.json({ message: 'Notification preferences saved' });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

router.post('/2fa/toggle', protect, async (req, res) => {
  try {
    const enable = !!req.body.enabled;
    await db.execute({ sql: 'UPDATE users SET two_fa_enabled = ? WHERE id = ?', args: [enable ? 1 : 0, req.user.id] });
    res.json({ message: enable ? '2FA enabled — a code will be emailed to you at login' : '2FA disabled' });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

router.post('/api-keys', protect, async (req, res) => {
  try {
    const key = 'sk_' + crypto.randomBytes(24).toString('hex');
    const id = 'key_' + Math.random().toString(36).slice(2, 12);
    await db.execute({ sql: 'INSERT INTO api_keys (id, user_id, label, key_value) VALUES (?,?,?,?)', args: [id, req.user.id, req.body.label || 'API Key', key] });
    res.json({ message: 'API key created', key, id });
  } catch (err) { res.status(500).json({ message: 'Server error creating key' }); }
});

router.delete('/api-keys/:id', protect, async (req, res) => {
  try {
    await db.execute({ sql: 'DELETE FROM api_keys WHERE id = ? AND user_id = ?', args: [req.params.id, req.user.id] });
    res.json({ message: 'API key revoked' });
  } catch (err) { res.status(500).json({ message: 'Server error revoking key' }); }
});

module.exports = router;

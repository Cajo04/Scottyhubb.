const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { db } = require('../db');

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

// Soft auth — attaches req.user if a valid token is present, but never blocks the request
async function softAuth(req) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
    const result = await db.execute({ sql: 'SELECT id, plan, ai_credits FROM users WHERE id = ?', args: [decoded.id] });
    return result.rows[0] || null;
  } catch (e) { return null; }
}

// POST /api/ai/chat — proxies to OpenRouter
router.post('/chat', async (req, res) => {
  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ message: 'messages array is required' });
  }

  const user = await softAuth(req);
  if (user && user.plan === 'free' && (user.ai_credits ?? 0) <= 0) {
    return res.status(429).json({ message: 'You\'re out of free AI credits today. Upgrade to Premium for unlimited AI, or earn more via Daily Rewards.' });
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://scottyhub.malvintech.sbs',
        'X-Title': 'ScottyHub AI'
      },
      body: JSON.stringify({
        model: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
        max_tokens: 1000,
        messages: [
          {
            role: 'system',
            content: 'You are ScottyAI, a friendly and helpful assistant created by Scotty for ScottyHub — a digital income and WhatsApp bot platform from Zimbabwe. Help users with WhatsApp bots using Baileys.js, JavaScript, Node.js, deploying on Render, making money online, and ScottyHub features. Always respond in English only. Never say you are DeepSeek or any other AI — you are ScottyAI. Be concise, friendly, and practical. Keep responses short and mobile-friendly.'
          },
          ...messages
        ]
      })
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ message: data.error?.message || 'AI API error' });
    }

    if (user) {
      db.execute({ sql: 'INSERT INTO activity_log (id, user_id, kind, label) VALUES (?,?,?,?)', args: ['log_' + Math.random().toString(36).slice(2, 12), user.id, 'ai_chat', ''] }).catch(() => {});
      if (user.plan === 'free') {
        db.execute({ sql: 'UPDATE users SET ai_credits = MAX(0, ai_credits - 1) WHERE id = ?', args: [user.id] }).catch(() => {});
      }
    }

    res.json({
      content: [{ type: 'text', text: data.choices?.[0]?.message?.content || 'No response' }]
    });

  } catch (err) {
    console.error('AI proxy error:', err);
    res.status(500).json({ message: 'AI service temporarily unavailable' });
  }
});

module.exports = router;

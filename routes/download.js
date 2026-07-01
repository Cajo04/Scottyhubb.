const express = require('express');
const router = express.Router();

// ── Song Search via drexapp ──
// GET /api/download/song?query=Faded
router.get('/song', async (req, res) => {
  const { query } = req.query;
  if (!query) return res.status(400).json({ error: 'query is required' });

  try {
    const r = await fetch(
      `https://api.drexapp.space/downloader/yta?q=${encodeURIComponent(query)}`,
      { signal: AbortSignal.timeout(20000) }
    );
    if (!r.ok) return res.status(502).json({ error: 'Music API error' });
    const data = await r.json();
    return res.json(data);
  } catch (e) {
    return res.status(502).json({ error: 'Music API unavailable. Try again shortly.' });
  }
});

// ── Song Downloader via drexapp ──
// POST /api/download
// Body: { url }  url = YouTube link OR song title/query
router.post('/', async (req, res) => {
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'url or query is required' });

  try {
    const r = await fetch(
      `https://api.drexapp.space/downloader/yta?q=${encodeURIComponent(url)}`,
      { signal: AbortSignal.timeout(25000) }
    );
    if (!r.ok) return res.status(502).json({ error: 'Downloader API error' });
    const data = await r.json();
    return res.json(data);
  } catch (e) {
    return res.status(502).json({ error: 'Downloader unavailable. Try again shortly.' });
  }
});

module.exports = router;

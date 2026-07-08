require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { initDB } = require('./db');

const authRoutes     = require('./routes/auth');
const userRoutes     = require('./routes/users');
const postRoutes     = require('./routes/posts');
const aiRoutes       = require('./routes/ai');
const moviesRoutes   = require('./routes/movies');
const sportsRoutes   = require('./routes/sports');
const downloadRoutes = require('./routes/download');
const adminRoutes    = require('./routes/admin');
const notifRoutes    = require('./routes/notifications');
const followRoutes   = require('./routes/follows');
const searchRoutes   = require('./routes/search');
const uploadRoutes   = require('./routes/upload');
const boostRoutes    = require('./routes/boost');
const dashboardRoutes = require('./routes/dashboard');
const earnRoutes = require('./routes/earn');
const walletRoutes = require('./routes/wallet');
const groupsRoutes = require('./routes/groups');
const premiumRoutes = require('./routes/premium');
const marketplaceRoutes = require('./routes/marketplace');
const analyticsRoutes = require('./routes/analytics');
const settingsRoutes = require('./routes/settings');

const app = express();
const PORT = process.env.PORT || 3004;

// Render sits behind a reverse proxy — trust the first hop so
// express-rate-limit reads the real client IP from X-Forwarded-For.
app.set('trust proxy', 1);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests, slow down!'
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many auth attempts, try again later.'
});

app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
app.use(express.json());
app.use(limiter);

const frontendDir = path.join(__dirname, 'public');
app.use(express.static(frontendDir));

app.get('/api', (req, res) => {
  res.json({ status: 'ScottyHub API is running', version: '2.0.0', db: 'SQLite' });
});

app.use('/api/auth',     authLimiter, authRoutes);
app.use('/api/users',    userRoutes);
app.use('/api/posts',    postRoutes);
app.use('/api/ai',       aiRoutes);
app.use('/api/movies',   moviesRoutes);
app.use('/api/sports',   sportsRoutes);
app.use('/api/download', downloadRoutes);
app.use('/api/admin',    adminRoutes);
app.use('/api/notifications', notifRoutes);
app.use('/api/follows',       followRoutes);
app.use('/api/search',        searchRoutes);
app.use('/api/upload',        uploadRoutes);
app.use('/api/boost',         boostRoutes);
app.use('/api/dashboard',     dashboardRoutes);
app.use('/api/earn',          earnRoutes);
app.use('/api/wallet',        walletRoutes);
app.use('/api/groups',        groupsRoutes);
app.use('/api/premium',       premiumRoutes);
app.use('/api/marketplace',   marketplaceRoutes);
app.use('/api/analytics',     analyticsRoutes);
app.use('/api/settings',      settingsRoutes);

// Public news endpoint (anyone logged-in can read)
const { db } = require('./db');
const { protect } = require('./middleware/auth');
app.get('/api/news', protect, async (req, res) => {
  try {
    const result = await db.execute('SELECT * FROM news ORDER BY created_at DESC');
    res.json({ news: result.rows });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Public announcements endpoint — returns pinned/admin posts
app.get('/api/announcements', protect, async (req, res) => {
  try {
    const result = await db.execute({
      sql: `SELECT p.id, p.content, p.media_url, p.created_at, p.pinned,
                   u.username as author_username
            FROM posts p
            JOIN users u ON p.author_id = u.id
            WHERE p.pinned = 1 OR u.is_admin = 1
            ORDER BY p.pinned DESC, p.created_at DESC
            LIMIT 50`,
    });
    res.json({ announcements: result.rows });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(frontendDir, 'index.html'));
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong' });
});

try {
  initDB();
  app.listen(PORT, () => console.log(`ScottyHub running on port ${PORT}`));
} catch (err) {
  console.error('DB init failed:', err.message);
  process.exit(1);
}

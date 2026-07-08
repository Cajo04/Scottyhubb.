const express = require('express');
const router = express.Router();
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { protect } = require('../middleware/auth');

// Works with ANY S3-compatible storage — Cloudflare R2, Backblaze B2, AWS S3,
// DigitalOcean Spaces, Wasabi, etc. Just point the env vars at whichever
// provider is available/affordable in your region:
//
//   S3_ENDPOINT          e.g. https://<accountid>.r2.cloudflarestorage.com  (R2)
//                         or   https://s3.us-west-004.backblazeb2.com       (B2)
//                         omit entirely for real AWS S3
//   S3_REGION             'auto' for R2, your region id for B2/AWS
//   S3_ACCESS_KEY_ID
//   S3_SECRET_ACCESS_KEY
//   S3_BUCKET
//   S3_PUBLIC_BASE_URL    the public URL prefix files are served from
//                         e.g. https://pub-xxxx.r2.dev  or a custom domain
//                         you've mapped to the bucket

let s3 = null;
function getClient() {
  if (s3) return s3;
  if (!process.env.S3_ACCESS_KEY_ID || !process.env.S3_SECRET_ACCESS_KEY || !process.env.S3_BUCKET) return null;
  s3 = new S3Client({
    region: process.env.S3_REGION || 'auto',
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: !!process.env.S3_ENDPOINT, // needed for R2/B2/most non-AWS endpoints
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY
    }
  });
  return s3;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB
});

function mediaTypeFor(mimetype) {
  if (mimetype.startsWith('video/')) return 'video';
  if (mimetype.startsWith('audio/')) return 'audio';
  if (mimetype.startsWith('image/')) return 'image';
  return 'file';
}

function safeName(name) {
  return (name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
}

// POST /api/upload — multipart/form-data, field name "file"
router.post('/', protect, (req, res) => {
  const client = getClient();
  if (!client || !process.env.S3_PUBLIC_BASE_URL) {
    return res.status(500).json({ message: 'File uploads are not configured yet (missing storage credentials).' });
  }

  upload.single('file')(req, res, async (err) => {
    if (err) return res.status(400).json({ message: err.message || 'Upload failed' });
    if (!req.file) return res.status(400).json({ message: 'No file provided' });

    const key = `scottyhub/${req.user.id}/${Date.now()}-${uuidv4().slice(0, 8)}-${safeName(req.file.originalname)}`;

    try {
      await client.send(new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: key,
        Body: req.file.buffer,
        ContentType: req.file.mimetype
      }));

      const base = process.env.S3_PUBLIC_BASE_URL.replace(/\/$/, '');
      res.status(201).json({
        url: `${base}/${key}`,
        key,
        mediaType: mediaTypeFor(req.file.mimetype),
        bytes: req.file.size
      });
    } catch (error) {
      console.error('S3 upload error:', error);
      res.status(500).json({ message: 'Upload to storage failed' });
    }
  });
});

module.exports = router;

const express = require('express');
const router = express.Router();
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { protect } = require('../middleware/auth');

// Cloudinary reads CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET
// from process.env automatically if CLOUDINARY_URL isn't set, but we configure
// explicitly so a clear error is thrown if they're missing.
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB — covers short video/audio clips and bot packages
});

function resourceTypeFor(mimetype) {
  if (mimetype.startsWith('video/')) return 'video';
  if (mimetype.startsWith('audio/')) return 'video'; // Cloudinary treats audio under 'video'
  if (mimetype.startsWith('image/')) return 'image';
  return 'raw'; // zips, code, docs, etc. — for marketplace listings and other file uploads
}

function mediaTypeFor(mimetype) {
  if (mimetype.startsWith('video/')) return 'video';
  if (mimetype.startsWith('audio/')) return 'audio';
  if (mimetype.startsWith('image/')) return 'image';
  return 'file';
}

// POST /api/upload — multipart/form-data, field name "file"
router.post('/', protect, (req, res) => {
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    return res.status(500).json({ message: 'File uploads are not configured yet (missing Cloudinary credentials).' });
  }

  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message || 'Upload failed' });
    if (!req.file) return res.status(400).json({ message: 'No file provided' });

    const resourceType = resourceTypeFor(req.file.mimetype);
    const uploadOptions = {
      resource_type: resourceType,
      folder: `scottyhub/${req.user.id}`,
    };
    if (resourceType === 'raw') {
      uploadOptions.use_filename = true;
      uploadOptions.unique_filename = true;
      uploadOptions.filename_override = req.file.originalname;
    }
    const stream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) {
          console.error('Cloudinary upload error:', error);
          return res.status(500).json({ message: 'Upload to storage failed' });
        }
        res.status(201).json({
          url: result.secure_url,
          publicId: result.public_id,
          mediaType: mediaTypeFor(req.file.mimetype),
          format: result.format,
          bytes: result.bytes,
          duration: result.duration || null
        });
      }
    );
    stream.end(req.file.buffer);
  });
});

module.exports = router;

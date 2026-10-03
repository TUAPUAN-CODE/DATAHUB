import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Router } from 'express';
import multer from 'multer';
import { env } from '../config/env';
import { ah, badRequest, forbidden, ok } from '../shared/http';

const router = Router();
const dir = path.resolve(env.uploadDir);
fs.mkdirSync(dir, { recursive: true });

const EXT: Record<string, string> = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp' };

const upload = multer({
  storage: multer.diskStorage({
    destination: dir,
    filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${EXT[file.mimetype] ?? ''}`),
  }),
  limits: { fileSize: env.maxUploadMb * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype in EXT),
});

router.post(
  '/uploads/image',
  (req, _res, next) => (req.user?.role === 'viewer' ? next(forbidden('บทบาท Viewer อัปโหลดไฟล์ไม่ได้')) : next()),
  upload.single('file'),
  ah(async (req, res) => {
    if (!req.file) throw badRequest('รองรับเฉพาะไฟล์รูปภาพ PNG, JPG, GIF, WEBP');
    ok(res, { url: `/uploads/${req.file.filename}`, size: req.file.size }, 201);
  }),
);

export default router;

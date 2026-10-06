import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Request } from 'express';
import multer from 'multer';
import { env } from '../env';
import { fail, HttpError } from './http';

// SVG is deliberately absent: it can carry script and we serve uploads from our own origin.
const imageTypes: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };

type Folder = 'avatars' | 'courts' | 'equipment' | 'slips';

// public images are served at /uploads/<folder>; payment slips stay in uploads/private
export const folderPath = (folder: Folder) => join(env.uploadDir, folder === 'slips' ? 'private/slips' : `public/${folder}`);

export function imageUpload(folder: Folder) {
  const dir = folderPath(folder);
  mkdirSync(dir, { recursive: true });
  return multer({
    storage: multer.diskStorage({
      destination: dir,
      filename: (_req, file, cb) => cb(null, randomUUID() + imageTypes[file.mimetype]),
    }),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) =>
      imageTypes[file.mimetype] ? cb(null, true) : cb(new HttpError(400, 'FILE_ERROR', 'รองรับเฉพาะไฟล์รูป JPG, PNG, WEBP หรือ GIF')),
  }).single('image');
}

export function uploadedFile(req: Request) {
  return req.file ?? fail(400, 'FILE_REQUIRED', 'กรุณาแนบไฟล์รูปในช่อง image');
}

// ponytail: replaced images are not deleted from disk; add cleanup if storage ever matters
export const publicUrl = (folder: Folder, filename: string) => `/uploads/${folder}/${filename}`;

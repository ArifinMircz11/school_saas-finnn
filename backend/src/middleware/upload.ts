import fs from 'fs';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import os from 'os';
import { v2 as cloudinary } from 'cloudinary';
import config from '../config';
import { ApiError } from '../utils/response';

cloudinary.config({
  cloud_name: config.cloudinary.cloudName,
  api_key: config.cloudinary.apiKey,
  api_secret: config.cloudinary.apiSecret,
});

const ALLOWED_IMAGE = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_DOC = [
  'image/jpeg', 'image/png', 'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const ALLOWED_ALL = [...ALLOWED_IMAGE, ...ALLOWED_DOC];

// Uploaded files land in a dedicated temp dir (not the bare OS temp dir) so that
// (a) the OS default never fills up with orphaned multer files and (b) cleanup
// is deterministic. Files are removed after upload (see uploadToStorage below).
const uploadDir = path.join(os.tmpdir(), 'school-saas-uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    cb(null, `${Date.now()}-${crypto.randomUUID()}${ext}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_ALL.includes(file.mimetype)) cb(null, true);
    else cb(new ApiError(415, 'Unsupported file type'));
  },
});

export const uploadImage = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_IMAGE.includes(file.mimetype)) cb(null, true);
    else cb(new ApiError(415, 'Only image files allowed'));
  },
});

/** Best-effort removal of a written temp file. Never throws. */
export async function cleanupTempFile(filePath?: string): Promise<void> {
  if (!filePath) return;
  try {
    await fs.promises.unlink(filePath);
  } catch {
    // Already gone or never existed — nothing to clean up.
  }
}

/** Upload a single local temp file to Cloudinary and return its secure URL.
 *  The temp file is always removed afterwards (success or failure) so the server
 *  can't accumulate orphaned files and slowly fill its disk.
 *  Falls back to a local placeholder when Cloudinary is not configured. */
export async function uploadToStorage(filePath: string, folder = config.cloudinary.folder): Promise<string> {
  const fallback = () => `${config.publicBaseUrl.storage}/${folder}/${path.basename(filePath)}`;
  if (!config.cloudinary.cloudName) {
    await cleanupTempFile(filePath);
    return fallback();
  }
  try {
    const result = await cloudinary.uploader.upload(filePath, { folder });
    await cleanupTempFile(filePath);
    return result.secure_url;
  } catch (e) {
    console.error('Cloudinary upload failed', e);
    await cleanupTempFile(filePath);
    return fallback();
  }
}

export { cloudinary };
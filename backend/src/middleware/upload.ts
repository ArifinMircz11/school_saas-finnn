import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
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

const storage = multer.diskStorage({
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

/** Upload a single local temp file to Cloudinary and return its secure URL.
 *  Falls back to a local placeholder when Cloudinary is not configured. */
export async function uploadToStorage(filePath: string, folder = config.cloudinary.folder): Promise<string> {
  if (!config.cloudinary.cloudName) {
    return `https://storage.local/${folder}/${path.basename(filePath)}`;
  }
  try {
    const result = await cloudinary.uploader.upload(filePath, { folder });
    return result.secure_url;
  } catch (e) {
    console.error('Cloudinary upload failed', e);
    return `https://storage.local/${folder}/${path.basename(filePath)}`;
  }
}

export { cloudinary };
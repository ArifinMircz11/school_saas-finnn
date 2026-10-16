import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  clientUrls: (process.env.CLIENT_URLS || 'http://localhost:3000,http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:5176,http://localhost:5178').split(',').map((u) => u.trim()),
  databaseUrl: process.env.DATABASE_URL || '',
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'dev-access-secret',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret',
    issuer: process.env.JWT_ISSUER || 'school-management-saas',
    accessTtl: process.env.ACCESS_TOKEN_TTL || '15m',
    refreshTtl: process.env.REFRESH_TOKEN_TTL || '7d',
  },
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || '',
    folder: process.env.CLOUDINARY_FOLDER || 'school-saas',
  },
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'noreply@yoursaas.com',
  },
  // Email delivery via REST API. Resend is the primary provider and Brevo is the
  // automatic fallback. Both are fetched from environment variables.
  email: {
    from: process.env.EMAIL_FROM || 'School SaaS <noreply@schoosaas.com>',
    resend: {
      apiKey: process.env.RESEND_API_KEY || '',
      from: process.env.RESEND_FROM || process.env.EMAIL_FROM || 'School SaaS <noreply@schoosaas.com>',
      baseUrl: (process.env.RESEND_BASE_URL || 'https://api.resend.com').replace(/\/$/, ''),
    },
    brevo: {
      apiKey: process.env.BREVO_API_KEY || '',
      from: process.env.BREVO_FROM || process.env.EMAIL_FROM || 'noreply@schoosaas.com',
      fromName: process.env.BREVO_FROM_NAME || 'School SaaS',
      baseUrl: (process.env.BREVO_BASE_URL || 'https://api.brevo.com').replace(/\/$/, ''),
    },
  },
  // Public base URLs for generated artifacts (all from environment variables).
  publicBaseUrl: {
    storage: (process.env.STORAGE_BASE_URL || 'https://storage.local').replace(/\/$/, ''),
    reports: (process.env.REPORTS_BASE_URL || 'https://reports.local').replace(/\/$/, ''),
    certificates: (process.env.CERTIFICATES_BASE_URL || 'https://certificates.local').replace(/\/$/, ''),
  },
};

export default config;

// ---------------------------------------------------------------------------
// Fail-fast production guard: never boot with the dev fallback secrets.
// The dev placeholders ('dev-access-secret' / 'dev-refresh-secret') are public
// (they're in this repo's history), so a production deployment that forgets to
// set either env var would sign tokens with a known secret — a trivial
// impersonation/forgery vector. Refuse to start in that state instead.
// ---------------------------------------------------------------------------
if (config.nodeEnv === 'production') {
  const missing: string[] = [];
  if (!process.env.JWT_ACCESS_SECRET || process.env.JWT_ACCESS_SECRET === 'dev-access-secret' || process.env.JWT_ACCESS_SECRET.length < 16) {
    missing.push('JWT_ACCESS_SECRET');
  }
  if (!process.env.JWT_REFRESH_SECRET || process.env.JWT_REFRESH_SECRET === 'dev-refresh-secret' || process.env.JWT_REFRESH_SECRET.length < 16) {
    missing.push('JWT_REFRESH_SECRET');
  }
  if (missing.length) {
    throw new Error(
      `Refusing to start in NODE_ENV=production without a strong secret. Missing/weak: ${missing.join(', ')}. ` +
      'Set distinct, >= 16 character JWT_ACCESS_SECRET and JWT_REFRESH_SECRET environment variables.'
    );
  }
}
import 'dotenv/config';

const num = (v: string | undefined, d: number) =>
  v !== undefined && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : d;
const bool = (v: string | undefined, d: boolean) =>
  v === undefined || v === '' ? d : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());

const nodeEnv = process.env.NODE_ENV ?? 'development';
const jwtSecret = process.env.JWT_SECRET ?? '';
if (nodeEnv === 'production' && jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be set (32+ chars) in production');
}

export const env = {
  nodeEnv,
  isProd: nodeEnv === 'production',
  port: num(process.env.PORT, 4000),
  tzOffsetMinutes: num(process.env.APP_TZ_OFFSET_MINUTES, 420),
  db: {
    server: process.env.DB_HOST ?? '172.48.0.116',
    port: num(process.env.DB_PORT, 1433),
    instanceName: process.env.DB_INSTANCE || undefined,
    database: process.env.DB_NAME ?? 'DataSheetPro',
    user: process.env.DB_USER ?? 'sa',
    password: process.env.DB_PASSWORD ?? '',
    encrypt: bool(process.env.DB_ENCRYPT, false),
    trustServerCertificate: bool(process.env.DB_TRUST_CERT, true),
    poolMin: num(process.env.DB_POOL_MIN, 2),
    poolMax: num(process.env.DB_POOL_MAX, 30),
  },
  jwt: {
    secret: jwtSecret || 'dev-only-secret-do-not-use-in-production',
    accessTtl: process.env.JWT_ACCESS_TTL ?? '1h',
    refreshDays: num(process.env.REFRESH_TOKEN_DAYS, 7),
  },
  /** Secure cookies need HTTPS (172.48.0.116 is exempt in modern browsers). Override with COOKIE_SECURE=false behind plain HTTP. */
  cookieSecure: bool(process.env.COOKIE_SECURE, nodeEnv === 'production'),
  corsOrigins: (process.env.CORS_ORIGIN ?? 'http://172.48.0.116:5175')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  rateLimitPerMin: num(process.env.RATE_LIMIT_PER_MIN, 600),
  showLockedItems: bool(process.env.SHOW_LOCKED_ITEMS, true),
  uploadDir: process.env.UPLOAD_DIR ?? 'uploads',
  maxUploadMb: num(process.env.MAX_UPLOAD_MB, 5),
  trashRetentionDays: num(process.env.TRASH_RETENTION_DAYS, 30),
  serveClientDir: process.env.SERVE_CLIENT_DIR || '',
  /** Public base URL of the app (used for OAuth redirect URIs). Falls back to the request host. */
  publicUrl: (process.env.PUBLIC_URL ?? '').replace(/\/+$/, ''),
  oauth: {
    google: { clientId: process.env.GOOGLE_CLIENT_ID ?? '', clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '' },
    microsoft: {
      clientId: process.env.MS_CLIENT_ID ?? '',
      clientSecret: process.env.MS_CLIENT_SECRET ?? '',
      /** common | organizations | consumers | <tenant id or domain> */
      tenant: process.env.MS_TENANT ?? 'common',
    },
    /** Create an account (role: user) on first social login. Default: only people an admin already added by e-mail may sign in. */
    autoCreate: bool(process.env.OAUTH_AUTO_CREATE, false),
    /** Comma separated e-mail domains that may use social login (empty = any) */
    allowedDomains: (process.env.OAUTH_ALLOWED_DOMAINS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  },
};

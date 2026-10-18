import dotenv from 'dotenv';

export function loadConfig(env = process.env) {
  if (env === process.env) dotenv.config();
  const production = env.NODE_ENV === 'production';
  const port = Number(env.PORT || 4000);
  const sessionHours = Number(env.SESSION_TTL_HOURS || 8);
  const trustProxyHops = Number(env.TRUST_PROXY_HOPS || 0);
  const origins = (env.CLIENT_ORIGINS ?? (production ? '' : 'http://localhost:5173'))
    .split(',').map((origin) => origin.trim()).filter(Boolean);

  if (!env.MONGODB_URI || !/^mongodb(\+srv)?:\/\//.test(env.MONGODB_URI)) throw new Error('MONGODB_URI is required');
  if (!/^[a-zA-Z0-9_-]{2,64}$/.test(env.MONGODB_DB_NAME || '')) throw new Error('MONGODB_DB_NAME is required');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid port');
  if (!Number.isInteger(sessionHours) || sessionHours < 1 || sessionHours > 168) throw new Error('SESSION_TTL_HOURS must be 1–168');
  if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0 || trustProxyHops > 2) throw new Error('TRUST_PROXY_HOPS must be 0–2');
  if (!origins.length) throw new Error('CLIENT_ORIGINS must contain an exact frontend origin');
  for (const origin of origins) {
    let url;
    try { url = new URL(origin); } catch { throw new Error('CLIENT_ORIGINS contains an invalid origin'); }
    if (url.origin !== origin || !['http:', 'https:'].includes(url.protocol) || (production && url.protocol !== 'https:')) {
      throw new Error('CLIENT_ORIGINS must contain exact origins (HTTPS in production)');
    }
  }
  return {
    production, port, mongoUri: env.MONGODB_URI, dbName: env.MONGODB_DB_NAME,
    // Capacitor serves bundled Android assets from this fixed HTTPS origin.
    // Keep the web origins explicit; the native app still needs a valid bearer token.
    origins: new Set([...origins, 'https://localhost']), sessionTtlMs: sessionHours * 60 * 60 * 1000,
    trustProxyHops, logLevel: env.LOG_LEVEL || 'info',
  };
}

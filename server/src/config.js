import dotenv from 'dotenv';

export function loadConfig(env = process.env) {
  if (env === process.env) dotenv.config();
  const production = env.NODE_ENV === 'production';
  const port = Number(env.PORT || 4000);
  const sessionHours = Number(env.SESSION_TTL_HOURS || 8);
  const trustProxyHops = Number(env.TRUST_PROXY_HOPS || 0);
  const googleClientId = env.GOOGLE_CLIENT_ID?.trim() || null;
  const githubClientId = env.GITHUB_CLIENT_ID?.trim() || null;
  const githubClientSecret = env.GITHUB_CLIENT_SECRET?.trim() || null;
  const groqApiKey = env.GROQ_API_KEY?.trim() || null;
  const groqModel = env.GROQ_MODEL?.trim() || 'openai/gpt-oss-20b';
  const codeRunnerUrl = (env.CODE_RUNNER_URL || 'https://wandbox.org/api').trim().replace(/\/$/, '');
  const origins = (env.CLIENT_ORIGINS ?? (production ? '' : 'http://localhost:5173'))
    .split(',').map((origin) => origin.trim()).filter(Boolean);

  if (!env.MONGODB_URI || !/^mongodb(\+srv)?:\/\//.test(env.MONGODB_URI)) throw new Error('MONGODB_URI is required');
  if (!/^[a-zA-Z0-9_-]{2,64}$/.test(env.MONGODB_DB_NAME || '')) throw new Error('MONGODB_DB_NAME is required');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid port');
  if (!Number.isInteger(sessionHours) || sessionHours < 1 || sessionHours > 168) throw new Error('SESSION_TTL_HOURS must be 1–168');
  if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0 || trustProxyHops > 2) throw new Error('TRUST_PROXY_HOPS must be 0–2');
  if (googleClientId && (googleClientId.length > 255 || !googleClientId.endsWith('.apps.googleusercontent.com') || /\s/.test(googleClientId))) {
    throw new Error('GOOGLE_CLIENT_ID must be a Google web client ID');
  }
  if (Boolean(githubClientId) !== Boolean(githubClientSecret) ||
    (githubClientId && !/^[A-Za-z0-9_]{8,128}$/.test(githubClientId)) ||
    (githubClientSecret && (githubClientSecret.length < 20 || githubClientSecret.length > 256 || /\s/.test(githubClientSecret)))) {
    throw new Error('GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET must both be configured');
  }
  if (groqModel.length > 100 || !/^[A-Za-z0-9._/-]+$/.test(groqModel)) throw new Error('GROQ_MODEL must be a valid model name');
  let runnerUrl;
  try { runnerUrl = new URL(codeRunnerUrl); } catch { throw new Error('CODE_RUNNER_URL must be a valid HTTPS URL'); }
  if (runnerUrl.protocol !== 'https:' || runnerUrl.username || runnerUrl.password || runnerUrl.search || runnerUrl.hash) {
    throw new Error('CODE_RUNNER_URL must be an HTTPS URL without credentials or query parameters');
  }
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
    trustProxyHops, logLevel: env.LOG_LEVEL || 'info', googleClientId, githubClientId, githubClientSecret,
    groqApiKey, groqModel,
    codeRunnerUrl,
  };
}

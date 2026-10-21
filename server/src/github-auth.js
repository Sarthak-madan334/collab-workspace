import { error } from './errors.js';

const githubHeaders = (token) => ({
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'User-Agent': 'Synkro',
});

export async function verifyGitHubCode({ code, codeVerifier, redirectUri }, config, fetcher = fetch) {
  try {
    const response = await fetcher('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.githubClientId,
        client_secret: config.githubClientSecret,
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw Error('Token exchange failed');
    const token = await response.json();
    if (token.error || typeof token.access_token !== 'string' || !token.access_token) throw Error('Invalid token response');

    const options = { headers: githubHeaders(token.access_token), signal: AbortSignal.timeout(8000) };
    const [userResponse, emailsResponse] = await Promise.all([
      fetcher('https://api.github.com/user', options),
      fetcher('https://api.github.com/user/emails?per_page=100', options),
    ]);
    if (!userResponse.ok || !emailsResponse.ok) throw Error('GitHub identity request failed');
    const [user, emails] = await Promise.all([userResponse.json(), emailsResponse.json()]);
    const verified = Array.isArray(emails) && emails.find((item) => item?.primary && item.verified && typeof item.email === 'string')
      || Array.isArray(emails) && emails.find((item) => item?.verified && typeof item.email === 'string');
    if (!Number.isSafeInteger(user?.id) || user.id < 1 || !verified) throw Error('Incomplete GitHub identity');
    return {
      id: String(user.id),
      email: verified.email,
      name: typeof user.name === 'string' && user.name.trim() ? user.name.trim() : user.login,
    };
  } catch {
    throw error(401, 'INVALID_GITHUB_CREDENTIAL', 'GitHub sign-in could not be verified');
  }
}

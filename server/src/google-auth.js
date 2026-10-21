import { OAuth2Client } from 'google-auth-library';
import { error } from './errors.js';

const client = new OAuth2Client();

export async function verifyGoogleCredential(credential, clientId) {
  try {
    const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email || payload.email_verified !== true) throw Error('Incomplete Google identity');
    return payload;
  } catch {
    throw error(401, 'INVALID_GOOGLE_CREDENTIAL', 'Google sign-in could not be verified');
  }
}

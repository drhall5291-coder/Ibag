const { importJWK, jwtVerify, decodeProtectedHeader } = require('jose');
const crypto = require('crypto');

const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID;
const PLAID_SECRET = process.env.PLAID_SECRET;
const PLAID_ENV = process.env.PLAID_ENV || 'sandbox';
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_IAT_AGE_SECONDS = 5 * 60;

const jwkCache = new Map();

function plaidHost(env) {
  return env === 'production' ? 'production.plaid.com' : 'sandbox.plaid.com';
}

async function fetchVerificationJwk(keyId) {
  const now = Date.now();
  const cached = jwkCache.get(keyId);
  if (cached && cached.expiresAt > now) return cached.jwk;

  const res = await fetch(`https://${plaidHost(PLAID_ENV)}/webhook_verification_key/get`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: PLAID_CLIENT_ID, secret: PLAID_SECRET, key_id: keyId }),
  });
  if (!res.ok) throw new Error(`Plaid JWK fetch failed: ${res.status}`);
  const json = await res.json();
  const jwk = json.key;
  if (!jwk) throw new Error('Plaid response missing key field');
  jwkCache.set(keyId, { jwk, expiresAt: now + CACHE_TTL_MS });
  return jwk;
}

async function verifyPlaidWebhook(rawBody, verificationHeader) {
  if (!verificationHeader) return { verified: false, reason: 'MISSING_HEADER' };

  let header;
  try {
    header = decodeProtectedHeader(verificationHeader);
  } catch {
    return { verified: false, reason: 'MALFORMED_JWT' };
  }

  if (header.alg !== 'ES256') return { verified: false, reason: 'WRONG_ALG' };
  if (!header.kid) return { verified: false, reason: 'MISSING_KID' };

  let jwk, payload;
  try {
    jwk = await fetchVerificationJwk(header.kid);
    const key = await importJWK(jwk, 'ES256');
    const result = await jwtVerify(verificationHeader, key, { algorithms: ['ES256'] });
    payload = result.payload;
  } catch (err) {
    return { verified: false, reason: 'BAD_SIGNATURE' };
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!payload.iat || Math.abs(nowSeconds - payload.iat) > MAX_IAT_AGE_SECONDS) {
    return { verified: false, reason: 'STALE_IAT' };
  }

  const bodyHash = crypto.createHash('sha256').update(rawBody).digest('hex');
  const expectedHash = payload.request_body_sha256;
  if (!expectedHash) return { verified: false, reason: 'MISSING_BODY_HASH' };

  const bodyHashBuf = Buffer.from(bodyHash, 'hex');
  const expectedHashBuf = Buffer.from(expectedHash, 'hex');
  if (
    bodyHashBuf.length !== expectedHashBuf.length ||
    !crypto.timingSafeEqual(bodyHashBuf, expectedHashBuf)
  ) {
    return { verified: false, reason: 'BODY_HASH_MISMATCH' };
  }

  return { verified: true, payload };
}

module.exports = { verifyPlaidWebhook };
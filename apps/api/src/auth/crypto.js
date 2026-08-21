const crypto = require('crypto');
const ALGORITHM = 'aes-256-gcm';

const base64Key = process.env.ENCRYPTION_KEY;
if (!base64Key) {
  console.error('FATAL: ENCRYPTION_KEY is not defined.');
  process.exit(1);
}
let KEY;
try {
  KEY = Buffer.from(base64Key, 'base64');
} catch (err) {
  console.error('FATAL: ENCRYPTION_KEY is not valid base64.');
  process.exit(1);
}
if (KEY.length !== 32) {
  console.error(`FATAL: ENCRYPTION_KEY must decode to 32 bytes. Got ${KEY.length}.`);
  process.exit(1);
}

function encrypt(text) {
  if (text === null || text === undefined) throw new Error('encrypt(): text required');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

function decrypt(payload) {
  if (!payload) throw new Error('decrypt(): payload required');
  const data = Buffer.from(payload, 'base64');
  if (data.length < 28) throw new Error('decrypt(): payload too short');
  const iv = data.subarray(0, 12);
  const authTag = data.subarray(12, 28);
  const encrypted = data.subarray(28);
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

module.exports = { encrypt, decrypt };
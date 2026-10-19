import { hashPassword } from '../lib/crypto.js';
import { getDb } from './index.js';

const password = process.env.TARGET_PASSWORD;
if (!password) throw new Error('TARGET_PASSWORD manquant');

const db = getDb();
const hash = hashPassword(password);
const updated = await db.query(
  'UPDATE users SET password_hash = $1 WHERE login = $2 RETURNING id',
  [hash, 'admin'],
);
console.log(`admin mis à jour : ${updated.length} ligne(s)`);
process.exit(0);

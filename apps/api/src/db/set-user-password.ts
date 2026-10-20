import { hashPassword } from '../lib/crypto.js';
import { getDb } from './index.js';

const login = process.env.TARGET_LOGIN?.trim();
const password = process.env.TARGET_PASSWORD;
if (!login || !password) throw new Error('TARGET_LOGIN et TARGET_PASSWORD requis');

const db = getDb();
const hash = hashPassword(password);
const updated = await db.query(
  'UPDATE users SET password_hash = $1 WHERE login = $2 RETURNING id',
  [hash, login],
);
if (updated.length === 0) throw new Error(`Utilisateur introuvable : ${login}`);
console.log(`${login} mis à jour : ${updated.length} ligne(s)`);
process.exit(0);

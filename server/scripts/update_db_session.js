import dotenv from 'dotenv';
import { setSrmSession } from '../lib/srmSession.js';

dotenv.config();

const csrf = process.env.SRM_CSRF_TOKEN;
const cookies = process.env.SRM_SESSION_COOKIES;

if (!csrf || !cookies) {
  console.error('Missing session variables in .env');
  process.exit(1);
}

async function run() {
  try {
    await setSrmSession(csrf, cookies);
    console.log('Successfully updated SRM session in database.');
  } catch (err) {
    console.error('Failed to update session:', err.message);
    process.exit(1);
  }
}

run();

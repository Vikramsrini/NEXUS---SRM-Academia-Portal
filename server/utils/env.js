// Utility to update .env file with new CSRF token and session cookies
import fs from 'fs';
import path from 'path';

const ENV_PATH = path.resolve(process.cwd(), '.env');

export function updateEnvVars(newVars = {}) {
  let envContent = fs.readFileSync(ENV_PATH, 'utf-8');
  for (const [key, value] of Object.entries(newVars)) {
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (envContent.match(regex)) {
      envContent = envContent.replace(regex, `${key}=${value}`);
    } else {
      envContent += `\n${key}=${value}`;
    }
  }
  fs.writeFileSync(ENV_PATH, envContent, 'utf-8');
}

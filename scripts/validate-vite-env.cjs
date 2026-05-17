const fs = require('fs');
const path = require('path');

const requiredKeys = [
  'VITE_TOKEN_SERVER_URL',
  'VITE_LIVEKIT_URL',
  'VITE_CHAT_WS_URL',
  'VITE_SERVER_API_URL',
];

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};

  const env = {};
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

const root = path.resolve(__dirname, '..');
const productionEnv = parseEnvFile(path.join(root, '.env.production'));
const mergedEnv = { ...productionEnv, ...process.env };
const missing = requiredKeys.filter((key) => !String(mergedEnv[key] || '').trim());

if (missing.length > 0) {
  console.error(`Missing required Vite production env: ${missing.join(', ')}`);
  console.error('Set them in .env.production or the build environment before running npm run build.');
  process.exit(1);
}

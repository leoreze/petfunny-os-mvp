import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = process.cwd();
const backend = path.join(root, 'backend');
const checks = [];

function exists(p) { return fs.existsSync(path.join(root, p)); }
function add(label, ok, info = '') { checks.push({ label, ok, info }); }

add('package.json raiz', exists('package.json'));
add('backend/package.json', exists('backend/package.json'));
add('backend/node_modules', fs.existsSync(path.join(backend, 'node_modules')), 'rode npm run install:backend se estiver faltando');
const webPushDir = path.join(backend, 'node_modules', 'web-push');
let webPushOk = fs.existsSync(webPushDir);
let webPushMainOk = false;
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(webPushDir, 'package.json'), 'utf8'));
  webPushMainOk = Boolean(pkg.main && fs.existsSync(path.join(webPushDir, pkg.main)));
} catch {}
add('backend/node_modules/web-push', webPushOk, 'necessário para push real');
add('backend/node_modules/web-push arquivo principal', webPushMainOk, 'se falhar, rode: cd backend && npm install web-push@3.6.7 --save --no-audit --no-fund');

const pushDeps = ['web-push', 'asn1.js', 'http_ece', 'https-proxy-agent', 'jws', 'minimist'];
for (const dep of pushDeps) {
  let ok = false;
  try {
    require.resolve(`${dep}/package.json`, { paths: [path.join(backend, 'node_modules')] });
    ok = true;
  } catch {}
  add(`backend/node_modules/${dep}`, ok, ok ? 'ok' : 'rode npm run push:repair');
}

try {
  const nodeVersion = execSync('node -v', { encoding: 'utf8' }).trim();
  add('Node.js', /^v(2[0-9]|[3-9][0-9])\./.test(nodeVersion), nodeVersion);
} catch {
  add('Node.js', false, 'não encontrado');
}

console.log('\nDiagnóstico de instalação — PetFunny OS\n');
for (const item of checks) {
  console.log(`${item.ok ? '✓' : '✗'} ${item.label}${item.info ? ` — ${item.info}` : ''}`);
}
console.log('\nComandos recomendados quando o npm ficar travado no spinner:');
console.log('npm install --ignore-scripts --no-audit --no-fund');
console.log('npm run install:backend');
console.log('npm run push:repair');
console.log('npm run db:migrate');
console.log('npm start\n');

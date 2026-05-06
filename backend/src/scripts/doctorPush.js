import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const root = path.resolve(process.cwd());
const backendRoot = root.endsWith(`${path.sep}backend`) ? root : path.join(root, 'backend');
const requiredPackages = ['web-push', 'asn1.js', 'http_ece', 'https-proxy-agent', 'jws', 'minimist'];
const checks = [];

function checkPackage(name) {
  try {
    const packageJson = require.resolve(`${name}/package.json`);
    const pkg = JSON.parse(fs.readFileSync(packageJson, 'utf8'));
    checks.push({ name, ok: true, version: pkg.version, path: packageJson });
  } catch (error) {
    checks.push({ name, ok: false, error: error.message });
  }
}

for (const pkg of requiredPackages) checkPackage(pkg);

console.log('\nDiagnóstico de Push — PetFunny OS\n');
for (const item of checks) {
  if (item.ok) {
    console.log(`✓ ${item.name} ${item.version}`);
  } else {
    console.log(`✗ ${item.name} — ${item.error}`);
  }
}

const missing = checks.filter((item) => !item.ok).map((item) => item.name);
if (missing.length) {
  console.log('\nPacotes faltando/corrompidos:');
  console.log(missing.join(', '));
  console.log('\nRode na raiz do projeto:');
  console.log('npm run push:repair');
  console.log('\nOu dentro de backend:');
  console.log('npm run push:repair');
  process.exitCode = 1;
} else {
  console.log('\nPush está com as dependências instaladas. Agora confira VAPID no .env e reinicie o servidor.\n');
}

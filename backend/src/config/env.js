import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '../..');
const projectRoot = path.resolve(backendRoot, '..');

const candidateEnvPaths = [
  path.resolve(projectRoot, '.env'),
  path.resolve(backendRoot, '.env')
];

const loadedEnvFiles = [];
for (const candidatePath of candidateEnvPaths) {
  if (fs.existsSync(candidatePath)) {
    dotenv.config({ path: candidatePath, override: false });
    loadedEnvFiles.push(candidatePath);
  }
}

if (!loadedEnvFiles.length) {
  dotenv.config({ override: false });
}

const loadedEnvFile = loadedEnvFiles.join(', ');

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),
  databaseUrl: String(process.env.DATABASE_URL || '').trim(),
  jwtSecret: String(process.env.JWT_SECRET || 'petfunny-os-dev-secret').trim(),
  jwtExpiresIn: String(process.env.JWT_EXPIRES_IN || '7d').trim(),
  appName: String(process.env.APP_NAME || 'PetFunny OS').trim(),
  appMode: String(process.env.APP_MODE || 'petfunny_single').trim(),
  appUrl: String(process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`).trim(),
  petfunnyName: String(process.env.PETFUNNY_NAME || 'PetFunny - Banho e Tosa').trim(),
  petfunnyWhatsapp: String(process.env.PETFUNNY_WHATSAPP || '5516981535338').trim(),
  petfunnyCity: String(process.env.PETFUNNY_CITY || 'Ribeirão Preto').trim(),
  petfunnyState: String(process.env.PETFUNNY_STATE || 'SP').trim(),
  openaiApiKey: String(process.env.OPENAI_API_KEY || '').trim(),
  openaiModel: String(process.env.OPENAI_MODEL || 'gpt-4.1-mini').trim(),
  vapidPublicKey: String(process.env.VAPID_PUBLIC_KEY || '').trim(),
  vapidPrivateKey: String(process.env.VAPID_PRIVATE_KEY || '').trim(),
  vapidSubject: String(process.env.VAPID_SUBJECT || 'mailto:contato@petfunny.com.br').trim(),
  mercadoPagoAccessToken: String(process.env.MERCADO_PAGO_ACCESS_TOKEN || process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim(),
  mercadoPagoWebhookSecret: String(process.env.MERCADO_PAGO_WEBHOOK_SECRET || '').trim(),
  mercadoPagoPublicKey: String(process.env.MERCADO_PAGO_PUBLIC_KEY || '').trim(),
  mercadoPagoAllowTestPix: String(process.env.MERCADO_PAGO_ALLOW_TEST_PIX || '').trim().toLowerCase() === 'true',
  mercadoPagoPixExpirationMinutes: Math.max(5, Math.min(60, Number(process.env.MERCADO_PAGO_PIX_EXPIRATION_MINUTES || 15) || 15)),
  loadedEnvFile
};

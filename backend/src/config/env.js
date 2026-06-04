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
  googleMapsApiKey: String(process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_ROUTES_API_KEY || '').trim(),
  petfunnyOriginAddress: String(process.env.PETFUNNY_ORIGIN_ADDRESS || process.env.TRANSPORT_ORIGIN_ADDRESS || 'PetFunny Banho e Tosa, Ribeirão Preto, SP').trim(),
  transportBaseFeeCents: Math.max(0, Math.round(Number(process.env.TRANSPORT_BASE_FEE || 6) * 100) || 600),
  transportPricePerKmCents: Math.max(0, Math.round(Number(process.env.TRANSPORT_PRICE_PER_KM || 2.2) * 100) || 220),
  transportMinimumFeeCents: Math.max(0, Math.round(Number(process.env.TRANSPORT_MIN_FEE || 12) * 100) || 1200),
  transportMaxOneWayKm: Math.max(1, Number(process.env.TRANSPORT_MAX_ONE_WAY_KM || process.env.TRANSPORT_MAX_DISTANCE_KM || 20) || 20),
  whatsappAccessToken: String(process.env.WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_CLOUD_ACCESS_TOKEN || '').trim(),
  whatsappPhoneNumberId: String(process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim(),
  whatsappBusinessAccountId: String(process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || process.env.WABA_ID || '').trim(),
  whatsappVerifyToken: String(process.env.WHATSAPP_VERIFY_TOKEN || 'petfunnyos_webhook').trim(),
  whatsappApiVersion: String(process.env.WHATSAPP_API_VERSION || 'v21.0').trim(),
  whatsappAgentEnabled: String(process.env.WHATSAPP_AGENT_ENABLED || 'true').trim().toLowerCase() !== 'false',
  whatsappAgentAutoReply: String(process.env.WHATSAPP_AGENT_AUTO_REPLY || 'true').trim().toLowerCase() !== 'false',
  whatsappAgentUseOpenAi: String(process.env.WHATSAPP_AGENT_USE_OPENAI || 'true').trim().toLowerCase() !== 'false',
  whatsappAgentHandoffKeyword: String(process.env.WHATSAPP_AGENT_HANDOFF_KEYWORD || 'atendente').trim(),
  loadedEnvFile
};

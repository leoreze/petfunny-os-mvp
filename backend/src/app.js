import fs from 'fs';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from './config/env.js';
import { healthcheckDb, query, pool } from './config/db.js';
import { errorMiddleware, notFoundMiddleware } from './middlewares/errorMiddleware.js';
import { requireAuth } from './middlewares/authMiddleware.js';
import { getPetFunnyAiSystemPrompt, getPetFunnyAiPromptMetadata } from './modules/assistente-ia/systemPrompt.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveFrontendRoot() {
  const candidates = [
    process.env.FRONTEND_DIR,
    path.resolve(__dirname, '../../frontend'),
    path.resolve(__dirname, '../../../frontend'),
    path.resolve(process.cwd(), 'frontend'),
    path.resolve(process.cwd(), '../frontend')
  ].filter(Boolean);

  const found = candidates.find((candidate) => {
    try {
      return fs.existsSync(path.resolve(candidate, 'index.html'));
    } catch {
      return false;
    }
  });

  if (!found) {
    console.warn('[frontend] index.html não encontrado. Caminhos testados:');
    candidates.forEach((candidate) => console.warn(`- ${candidate}`));
    return path.resolve(__dirname, '../../../frontend');
  }

  console.log(`[frontend] servindo arquivos de: ${found}`);
  return found;
}

const frontendRoot = resolveFrontendRoot();

function normalizePermissions(value) {
  if (Array.isArray(value)) return value;
  if (!value) return ['full_access'];
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : ['full_access'];
  } catch {
    return ['full_access'];
  }
}

async function getBusinessPayload() {
  const result = await query(`
    SELECT business_name, whatsapp, address_city, address_state
    FROM business_settings
    ORDER BY created_at ASC
    LIMIT 1
  `);

  const business = result.rows[0] || {};
  return {
    name: business.business_name || env.petfunnyName,
    city: business.address_city || env.petfunnyCity,
    state: business.address_state || env.petfunnyState,
    whatsapp: business.whatsapp || env.petfunnyWhatsapp
  };
}


function sanitizeSystemNotification(row = {}) {
  return {
    id: row.id,
    type: row.type || 'info',
    priority: row.priority || 'medium',
    title: row.title,
    message: row.message,
    module: row.module,
    actionUrl: row.action_url,
    entityType: row.entity_type,
    entityId: row.entity_id,
    sourceKey: row.source_key,
    read: Boolean(row.is_read),
    readAt: row.read_at,
    createdAt: row.created_at
  };
}

async function upsertSystemNotification({ sourceKey, type = 'info', priority = 'medium', title, message, module = 'dashboard', actionUrl = null, entityType = null, entityId = null }) {
  if (!sourceKey || !title || !message) return null;
  const result = await query(`
    INSERT INTO system_notifications (source_key, type, priority, title, message, module, action_url, entity_type, entity_id)
    VALUES ($1::text, $2::text, $3::text, $4::text, $5::text, $6::text, $7::text, $8::text, NULLIF($9::text,'')::uuid)
    ON CONFLICT (source_key) DO UPDATE SET
      type = EXCLUDED.type,
      priority = EXCLUDED.priority,
      title = EXCLUDED.title,
      message = EXCLUDED.message,
      module = EXCLUDED.module,
      action_url = EXCLUDED.action_url,
      entity_type = EXCLUDED.entity_type,
      entity_id = EXCLUDED.entity_id,
      deleted_at = NULL,
      updated_at = NOW()
    RETURNING *
  `, [sourceKey, type, priority, title, message, module, actionUrl || null, entityType || null, entityId || '']);
  return result.rows[0];
}

async function generateRealtimeNotifications() {
  const overdue = await query(`
    SELECT ft.id, ft.description, ft.amount_cents, ft.due_date, t.name AS tutor_name
    FROM financial_transactions ft
    LEFT JOIN tutors t ON t.id = ft.tutor_id
    WHERE ft.deleted_at IS NULL
      AND ft.type = 'income'
      AND ft.status <> 'paid'
      AND ft.due_date < CURRENT_DATE
    ORDER BY ft.due_date ASC
    LIMIT 20
  `);
  for (const row of overdue.rows) {
    const amount = (Number(row.amount_cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    await upsertSystemNotification({
      sourceKey: `financeiro-inadimplente-${row.id}`,
      type: 'warning',
      priority: 'high',
      title: 'Cliente inadimplente',
      message: `${row.tutor_name || 'Cliente'} possui cobrança vencida de ${amount}.`,
      module: 'financeiro',
      actionUrl: '/admin/financeiro?tab=inadimplentes',
      entityType: 'financial_transaction',
      entityId: row.id
    });
  }

  const todayOpen = await query(`
    SELECT COUNT(*)::int AS total
    FROM appointments a
    INNER JOIN appointment_statuses s ON s.code = a.status AND s.blocks_slot = TRUE
    WHERE a.deleted_at IS NULL
      AND a.starts_at::date = CURRENT_DATE
  `);
  if (Number(todayOpen.rows[0]?.total || 0) > 0) {
    await upsertSystemNotification({
      sourceKey: `agenda-confirmacao-${new Date().toISOString().slice(0,10)}`,
      type: 'info',
      priority: 'medium',
      title: 'Confirmar agenda do dia',
      message: `Há ${todayOpen.rows[0].total} atendimento(s) ativos hoje. Vale confirmar presença pelo WhatsApp.`,
      module: 'agenda',
      actionUrl: '/admin/agenda'
    });
  }

  const packages = await query(`
    SELECT cp.id, t.name AS tutor_name, p.name AS pet_name, cp.total_sessions, cp.used_sessions
    FROM customer_packages cp
    LEFT JOIN tutors t ON t.id = cp.tutor_id
    LEFT JOIN pets p ON p.id = cp.pet_id
    WHERE cp.deleted_at IS NULL
      AND cp.status = 'active'
      AND (cp.total_sessions - cp.used_sessions) <= 1
    ORDER BY cp.updated_at DESC
    LIMIT 20
  `);
  for (const row of packages.rows) {
    await upsertSystemNotification({
      sourceKey: `pacote-renovacao-${row.id}`,
      type: 'opportunity',
      priority: 'medium',
      title: 'Pacote perto do fim',
      message: `${row.pet_name || 'Pet'} de ${row.tutor_name || 'tutor'} tem ${Number(row.total_sessions || 0) - Number(row.used_sessions || 0)} sessão restante.`,
      module: 'pacotes',
      actionUrl: '/admin/pacotes',
      entityType: 'customer_package',
      entityId: row.id
    });
  }
}

function normalizeWhatsapp(value = '') {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 11) return `55${digits}`;
  if (digits.length === 13 && digits.startsWith('55')) return digits;
  if (digits.length === 12 && digits.startsWith('55')) return digits;
  return digits;
}

function sanitizeTutor(tutor = {}) {
  return {
    id: tutor.id,
    name: tutor.name,
    whatsapp: tutor.whatsapp,
    email: tutor.email,
    address: tutor.address || '',
    addressNumber: tutor.address_number || tutor.addressNumber || '',
    addressNeighborhood: tutor.address_neighborhood || tutor.addressNeighborhood || '',
    addressZipcode: tutor.address_zipcode || tutor.addressZipcode || '',
    city: tutor.city,
    state: tutor.state,
    photoUrl: tutor.photo_url || tutor.photoUrl || null,
    tags: tutor.tags || []
  };
}

function makeSixDigitCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function buildClientAuthWhatsAppUrl(whatsapp, code) {
  const cleanWhatsapp = normalizeWhatsapp(whatsapp);
  const message = [
    `Código de acesso PetFunny: ${code}`,
    '',
    'Copie este código e volte para o app para validar seu acesso.',
    'Se você não solicitou este acesso, ignore esta mensagem.'
  ].join('\n');
  return `https://wa.me/${cleanWhatsapp}?text=${encodeURIComponent(message)}`;
}


async function storeClientAuthCode(whatsapp, tutorExists) {
  const code = makeSixDigitCode();
  const codeHash = await bcrypt.hash(code, 10);
  await query(`
    INSERT INTO client_auth_codes (whatsapp, code_hash, purpose, tutor_exists, expires_at)
    VALUES ($1, $2, 'app_auth', $3, NOW() + INTERVAL '20 minutes')
    ON CONFLICT (whatsapp) DO UPDATE
    SET code_hash = EXCLUDED.code_hash,
        purpose = 'app_auth',
        tutor_exists = EXCLUDED.tutor_exists,
        verified_at = NULL,
        expires_at = EXCLUDED.expires_at,
        updated_at = NOW()
  `, [whatsapp, codeHash, Boolean(tutorExists)]);
  return code;
}

async function verifyClientAuthCode(whatsapp, code) {
  const result = await query(`
    SELECT whatsapp, code_hash, tutor_exists, expires_at, verified_at
    FROM client_auth_codes
    WHERE whatsapp = $1
    LIMIT 1
  `, [whatsapp]);

  const row = result.rows[0];
  if (!row?.code_hash) {
    const error = new Error('Solicite um novo código pelo WhatsApp.');
    error.status = 401;
    throw error;
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    const error = new Error('Código expirado. Solicite um novo código.');
    error.status = 401;
    throw error;
  }
  const ok = await bcrypt.compare(String(code || '').replace(/\D/g, ''), row.code_hash);
  if (!ok) {
    const error = new Error('Código inválido. Confira os 6 números enviados pelo WhatsApp.');
    error.status = 401;
    throw error;
  }
  await query('UPDATE client_auth_codes SET verified_at = NOW(), updated_at = NOW() WHERE whatsapp = $1', [whatsapp]);
  return row;
}

function signClientVerificationToken({ whatsapp, tutorExists = false, tutorId = null, accountId = null }) {
  return jwt.sign(
    { scope: 'client_app_verification', whatsapp, tutorExists: Boolean(tutorExists), tutorId, accountId, tenant: false },
    env.jwtSecret,
    { expiresIn: '30m' }
  );
}

function requireClientVerification(req) {
  const token = String(req.body?.verificationToken || req.headers['x-verification-token'] || '').trim();
  if (!token) {
    const error = new Error('Validação expirada. Informe o WhatsApp e o código novamente.');
    error.status = 401;
    throw error;
  }
  try {
    const payload = jwt.verify(token, env.jwtSecret);
    if (payload.scope !== 'client_app_verification') throw new Error('invalid scope');
    return payload;
  } catch {
    const error = new Error('Validação inválida ou expirada. Solicite um novo código.');
    error.status = 401;
    throw error;
  }
}

function signClientOnboardingToken({ whatsapp, tutorId, accountId }) {
  return jwt.sign(
    { scope: 'client_app_onboarding', whatsapp, tutorId, accountId, tenant: false },
    env.jwtSecret,
    { expiresIn: '45m' }
  );
}

function requireClientOnboarding(req) {
  const token = String(req.body?.onboardingToken || req.headers['x-onboarding-token'] || '').trim();
  if (!token) {
    const error = new Error('Cadastro expirado. Valide o WhatsApp novamente.');
    error.status = 401;
    throw error;
  }
  try {
    const payload = jwt.verify(token, env.jwtSecret);
    if (payload.scope !== 'client_app_onboarding') throw new Error('invalid scope');
    return payload;
  } catch {
    const error = new Error('Cadastro inválido ou expirado. Valide o WhatsApp novamente.');
    error.status = 401;
    throw error;
  }
}

async function activateClientAccount(accountId, password) {
  if (String(password || '').length < 8) {
    const error = new Error('A senha precisa ter pelo menos 8 caracteres.');
    error.status = 400;
    throw error;
  }
  const passwordHash = await bcrypt.hash(String(password), 12);
  await query(`
    UPDATE client_accounts
    SET password_hash = $2,
        first_access_code_hash = NULL,
        first_access_expires_at = NULL,
        first_access_confirmed_at = NOW(),
        is_active = TRUE,
        status = 'active',
        updated_at = NOW()
    WHERE id = $1
  `, [accountId, passwordHash]);
}

async function getClientAppPayload(accountId) {
  const result = await query(`
    SELECT ca.id AS account_id, ca.status, ca.is_active, ca.whatsapp,
           t.id AS tutor_id, t.name, t.email, t.address, t.address_number, t.address_neighborhood, t.address_zipcode, t.city, t.state, t.photo_url, t.tags
    FROM client_accounts ca
    INNER JOIN tutors t ON t.id = ca.tutor_id
    WHERE ca.id = $1
      AND ca.deleted_at IS NULL
      AND t.deleted_at IS NULL
    LIMIT 1
  `, [accountId]);

  const row = result.rows[0];
  if (!row || !row.is_active) return null;
  return {
    account: {
      id: row.account_id,
      status: row.status,
      whatsapp: row.whatsapp
    },
    tutor: sanitizeTutor({ ...row, id: row.tutor_id })
  };
}

async function requireClientAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
    if (!token) return res.status(401).json({ error: 'Token do aplicativo ausente.' });

    let payload;
    try {
      payload = jwt.verify(token, env.jwtSecret);
    } catch {
      return res.status(401).json({ error: 'Token do aplicativo inválido ou expirado.' });
    }

    if (payload.scope !== 'client_app') {
      return res.status(401).json({ error: 'Token não pertence ao aplicativo do cliente.' });
    }

    const appUser = await getClientAppPayload(payload.sub);
    if (!appUser) return res.status(401).json({ error: 'Conta do aplicativo inativa ou não encontrada.' });

    req.clientApp = appUser;
    next();
  } catch (error) {
    next(error);
  }
}


async function logClientAppAccess(req, { tutorId, phone, eventType = 'page_view', page = '', metadata = {} } = {}) {
  try {
    if (!tutorId && !phone) return;
    await query(`
      INSERT INTO app_access_logs (tutor_id, phone, event_type, page, user_agent, ip_address, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
    `, [
      tutorId || null,
      phone || null,
      cleanText(eventType) || 'page_view',
      (cleanText(page) || '').slice(0, 180) || null,
      String(req.headers['user-agent'] || '').slice(0, 500),
      String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim().slice(0, 80),
      JSON.stringify(metadata || {})
    ]);
  } catch (error) {
    console.warn('[app-access-log] registro ignorado:', error.message);
  }
}

function appAccessStatus(lastAccessAt) {
  if (!lastAccessAt) return { code: 'never', label: 'Nunca acessou', tone: 'muted' };
  const days = Math.max(0, Math.floor((Date.now() - new Date(lastAccessAt).getTime()) / 86400000));
  if (days === 0) return { code: 'today', label: 'Acessou hoje', tone: 'success' };
  if (days <= 6) return { code: 'active', label: 'Ativo', tone: 'ok' };
  if (days <= 29) return { code: 'inactive_7', label: 'Inativo 7 dias', tone: 'warning' };
  return { code: 'inactive_30', label: 'Inativo 30 dias', tone: 'danger' };
}

function getPushConfigStatus() {
  const missing = [];
  if (!env.vapidPublicKey) missing.push('VAPID_PUBLIC_KEY');
  if (!env.vapidPrivateKey) missing.push('VAPID_PRIVATE_KEY');
  if (!env.vapidSubject) missing.push('VAPID_SUBJECT');
  return {
    configured: missing.length === 0,
    missing,
    subject: env.vapidSubject || null,
    publicKeyAvailable: Boolean(env.vapidPublicKey),
    privateKeyAvailable: Boolean(env.vapidPrivateKey),
    envFile: env.loadedEnvFile || null
  };
}

function isPushConfigured() {
  return getPushConfigStatus().configured;
}

async function getWebPushClient() {
  const status = getPushConfigStatus();
  if (!status.configured) {
    console.warn(`[push] VAPID incompleto. Faltando: ${status.missing.join(', ')}. .env carregado: ${status.envFile || 'nenhum'}`);
    return null;
  }
  try {
    const mod = await import('web-push');
    const webpush = mod.default || mod;
    webpush.setVapidDetails(env.vapidSubject, env.vapidPublicKey, env.vapidPrivateKey);
    return webpush;
  } catch (error) {
    console.warn(`[push] pacote web-push indisponível: ${error.message}. Rode: cd backend && npm install web-push@3.6.7 --save --no-audit --no-fund`);
    return null;
  }
}

function normalizePushSubscription(subscription = {}) {
  const endpoint = String(subscription.endpoint || '').trim();
  const keys = subscription.keys || {};
  return {
    endpoint,
    p256dh: String(keys.p256dh || '').trim(),
    auth: String(keys.auth || '').trim(),
    subscription
  };
}

function buildPushPayload({ title, body, url = '/app/home', tag = 'petfunny', type = 'info', icon = '/assets/img/icon-192.png' }) {
  return JSON.stringify({
    title: String(title || 'PetFunny').slice(0, 120),
    body: String(body || 'Você tem uma novidade no Meu PetFunny.').slice(0, 240),
    url: String(url || '/app/home'),
    tag: String(tag || 'petfunny'),
    type: String(type || 'info'),
    icon,
    badge: '/assets/img/icon-192.png',
    timestamp: Date.now()
  });
}

async function sendPushToSubscriptions(subscriptions = [], payloadInput = {}) {
  const webpush = await getWebPushClient();
  const payload = buildPushPayload(payloadInput);
  const stats = { configured: isPushConfigured(), sent: 0, failed: 0, skipped: 0, total: subscriptions.length };

  if (!webpush) {
    stats.skipped = subscriptions.length;
    for (const sub of subscriptions) {
      await query(`
        INSERT INTO push_notification_logs (tutor_id, account_id, subscription_id, title, body, url, payload, status, error)
        VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,'skipped',$8)
      `, [sub.tutor_id || null, sub.account_id || null, sub.id || null, payloadInput.title || 'PetFunny', payloadInput.body || '', payloadInput.url || '/app/home', payload, getPushConfigStatus().configured ? 'Pacote web-push não instalado ou indisponível.' : `VAPID incompleto. Faltando: ${getPushConfigStatus().missing.join(', ')}`]);
    }
    return stats;
  }

  for (const sub of subscriptions) {
    try {
      const subscription = sub.subscription || { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } };
      await webpush.sendNotification(subscription, payload);
      stats.sent += 1;
      await query(`
        UPDATE push_subscriptions
        SET last_success_at = NOW(), last_error_at = NULL, last_error = NULL, status = 'active', updated_at = NOW()
        WHERE id = $1
      `, [sub.id]);
      await query(`
        INSERT INTO push_notification_logs (tutor_id, account_id, subscription_id, title, body, url, payload, status, sent_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,'sent',NOW())
      `, [sub.tutor_id || null, sub.account_id || null, sub.id || null, payloadInput.title || 'PetFunny', payloadInput.body || '', payloadInput.url || '/app/home', payload]);
    } catch (error) {
      stats.failed += 1;
      const shouldDisable = [404, 410].includes(Number(error.statusCode));
      await query(`
        UPDATE push_subscriptions
        SET status = CASE WHEN $2::boolean THEN 'expired' ELSE status END,
            deleted_at = CASE WHEN $2::boolean THEN NOW() ELSE deleted_at END,
            last_error_at = NOW(), last_error = $3, updated_at = NOW()
        WHERE id = $1
      `, [sub.id, shouldDisable, String(error.message || 'Erro ao enviar push').slice(0, 500)]);
      await query(`
        INSERT INTO push_notification_logs (tutor_id, account_id, subscription_id, title, body, url, payload, status, error)
        VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,'failed',$8)
      `, [sub.tutor_id || null, sub.account_id || null, sub.id || null, payloadInput.title || 'PetFunny', payloadInput.body || '', payloadInput.url || '/app/home', payload, String(error.message || 'Erro ao enviar push').slice(0, 500)]);
    }
  }
  return stats;
}

function sanitizeUser(user, business) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    permissions: normalizePermissions(user.permissions),
    business
  };
}

async function getDashboardSummary() {
  const demoTutorFilter = `COALESCE('demo' = ANY(t.tags), FALSE) = FALSE AND LOWER(COALESCE(t.email, '')) NOT LIKE '%demo%'`;
  const demoAppointmentFilter = `LOWER(COALESCE(a.notes, '')) NOT LIKE '%exemplo%' AND LOWER(COALESCE(a.notes, '')) NOT LIKE '%demonstra%' AND LOWER(COALESCE(a.notes, '')) NOT LIKE '%popular o dashboard%'`;

  const metricsResult = await query(`
    WITH real_tutors AS (
      SELECT * FROM tutors t
      WHERE t.deleted_at IS NULL
        AND ${demoTutorFilter}
    ), real_pets AS (
      SELECT p.* FROM pets p
      LEFT JOIN real_tutors rt ON rt.id = p.tutor_id
      WHERE p.deleted_at IS NULL
        AND (p.tutor_id IS NULL OR rt.id IS NOT NULL)
    ), real_appointments AS (
      SELECT a.* FROM appointments a
      LEFT JOIN real_tutors rt ON rt.id = a.tutor_id
      WHERE a.deleted_at IS NULL
        AND (a.tutor_id IS NULL OR rt.id IS NOT NULL)
        AND ${demoAppointmentFilter}
    ), today_appointments AS (
      SELECT * FROM real_appointments
      WHERE starts_at::date = CURRENT_DATE
    ), week_appointments AS (
      SELECT * FROM real_appointments
      WHERE starts_at >= date_trunc('week', NOW())
        AND starts_at < date_trunc('week', NOW()) + INTERVAL '7 days'
    ), pending_financial AS (
      SELECT COALESCE(SUM(ft.amount_cents), 0) AS total, COUNT(*) AS count
      FROM financial_transactions ft
      LEFT JOIN real_tutors rt ON rt.id = ft.tutor_id
      LEFT JOIN real_appointments ra ON ra.id = ft.appointment_id
      WHERE ft.type = 'income'
        AND ft.status <> 'paid'
        AND ft.deleted_at IS NULL
        AND (ft.tutor_id IS NULL OR rt.id IS NOT NULL)
        AND (ft.appointment_id IS NULL OR ra.id IS NOT NULL)
        AND LOWER(COALESCE(ft.description, '')) NOT LIKE '%exemplo%'
        AND LOWER(COALESCE(ft.description, '')) NOT LIKE '%demonstra%'
    ), revenue_today AS (
      SELECT COALESCE(SUM(p.amount_cents), 0) AS total
      FROM payments p
      LEFT JOIN financial_transactions ft ON ft.id = p.financial_transaction_id
      LEFT JOIN real_tutors rt ON rt.id = ft.tutor_id
      LEFT JOIN real_appointments ra ON ra.id = ft.appointment_id
      WHERE p.paid_at::date = CURRENT_DATE
        AND (ft.id IS NULL OR ft.deleted_at IS NULL)
        AND (ft.tutor_id IS NULL OR rt.id IS NOT NULL)
        AND (ft.appointment_id IS NULL OR ra.id IS NOT NULL)
        AND LOWER(COALESCE(p.notes, '')) NOT LIKE '%exemplo%'
        AND LOWER(COALESCE(p.notes, '')) NOT LIKE '%demonstra%'
    ), revenue_week AS (
      SELECT COALESCE(SUM(p.amount_cents), 0) AS total
      FROM payments p
      LEFT JOIN financial_transactions ft ON ft.id = p.financial_transaction_id
      LEFT JOIN real_tutors rt ON rt.id = ft.tutor_id
      LEFT JOIN real_appointments ra ON ra.id = ft.appointment_id
      WHERE p.paid_at >= date_trunc('week', NOW())
        AND p.paid_at < date_trunc('week', NOW()) + INTERVAL '7 days'
        AND (ft.id IS NULL OR ft.deleted_at IS NULL)
        AND (ft.tutor_id IS NULL OR rt.id IS NOT NULL)
        AND (ft.appointment_id IS NULL OR ra.id IS NOT NULL)
        AND LOWER(COALESCE(p.notes, '')) NOT LIKE '%exemplo%'
        AND LOWER(COALESCE(p.notes, '')) NOT LIKE '%demonstra%'
    ), active_customer_packages AS (
      SELECT cp.* FROM customer_packages cp
      LEFT JOIN real_tutors rt ON rt.id = cp.tutor_id
      WHERE cp.status = 'active'
        AND cp.deleted_at IS NULL
        AND (cp.tutor_id IS NULL OR rt.id IS NOT NULL)
    )
    SELECT
      (SELECT COUNT(*) FROM today_appointments) AS appointments_today,
      (SELECT COUNT(*) FROM today_appointments WHERE status = 'em_atendimento') AS active_checkins,
      (SELECT COUNT(*) FROM today_appointments WHERE status = 'finalizado') AS finished_today,
      (SELECT COUNT(DISTINCT pet_id) FROM today_appointments WHERE status IN ('em_atendimento','finalizado') AND pet_id IS NOT NULL) AS pets_served_today,
      (SELECT COUNT(*) FROM week_appointments) AS appointments_week,
      (SELECT total FROM pending_financial) AS pending_payments_total_cents,
      (SELECT count FROM pending_financial) AS pending_payments_count,
      (SELECT total FROM revenue_today) AS revenue_today_cents,
      (SELECT total FROM revenue_week) AS revenue_week_cents,
      (SELECT COUNT(*) FROM real_tutors) AS tutors_total,
      (SELECT COUNT(*) FROM real_pets) AS pets_total,
      (SELECT COUNT(*) FROM active_customer_packages) AS active_packages,
      (SELECT COUNT(*) FROM real_tutors rt WHERE ('recorrente' = ANY(rt.tags) OR rt.id IN (SELECT tutor_id FROM active_customer_packages))) AS recurring_clients,
      (SELECT COUNT(*) FROM gifts WHERE status = 'active' AND deleted_at IS NULL) AS active_gifts
  `);

  const agendaResult = await query(`
    SELECT a.id,
           a.starts_at,
           a.ends_at,
           a.status,
           a.total_cents,
           a.discount_percent,
           a.package_session_label,
           a.notes,
           a.payment_status,
           a.payment_method_id,
           ps.name AS payment_status_name,
           ps.color AS payment_status_color,
           pm.name AS payment_method_name,
           t.name AS tutor_name,
           t.whatsapp AS tutor_whatsapp,
           p.name AS pet_name,
           p.size AS pet_size,
           p.photo_url AS pet_photo_url,
           c.name AS collaborator_name,
           COALESCE(string_agg(ai.description, ', ' ORDER BY ai.created_at), '') AS services
    FROM appointments a
    LEFT JOIN tutors t ON t.id = a.tutor_id
    LEFT JOIN pets p ON p.id = a.pet_id
    LEFT JOIN collaborators c ON c.id = a.collaborator_id
    LEFT JOIN payment_statuses ps ON ps.code = a.payment_status
    LEFT JOIN payment_methods pm ON pm.id = a.payment_method_id
    LEFT JOIN appointment_items ai ON ai.appointment_id = a.id
    WHERE a.starts_at::date = CURRENT_DATE
      AND a.deleted_at IS NULL
      AND COALESCE('demo' = ANY(t.tags), FALSE) = FALSE
      AND LOWER(COALESCE(t.email, '')) NOT LIKE '%demo%'
      AND LOWER(COALESCE(a.notes, '')) NOT LIKE '%exemplo%'
      AND LOWER(COALESCE(a.notes, '')) NOT LIKE '%demonstra%'
      AND LOWER(COALESCE(a.notes, '')) NOT LIKE '%popular o dashboard%'
    GROUP BY a.id, t.name, t.whatsapp, p.name, p.size, p.photo_url, c.name, ps.name, ps.color, pm.name
    ORDER BY a.starts_at ASC
    LIMIT 16
  `);

  const statusResult = await query(`
    SELECT s.code AS status,
           s.name AS label,
           s.color,
           s.sort_order,
           COALESCE(COUNT(CASE WHEN a.tutor_id IS NULL OR t.id IS NOT NULL THEN a.id END), 0)::int AS total
    FROM appointment_statuses s
    LEFT JOIN appointments a ON a.status = s.code
      AND a.starts_at::date = CURRENT_DATE
      AND a.deleted_at IS NULL
      AND LOWER(COALESCE(a.notes, '')) NOT LIKE '%exemplo%'
      AND LOWER(COALESCE(a.notes, '')) NOT LIKE '%demonstra%'
      AND LOWER(COALESCE(a.notes, '')) NOT LIKE '%popular o dashboard%'
    LEFT JOIN tutors t ON t.id = a.tutor_id
      AND t.deleted_at IS NULL
      AND COALESCE('demo' = ANY(t.tags), FALSE) = FALSE
      AND LOWER(COALESCE(t.email, '')) NOT LIKE '%demo%'
    WHERE s.deleted_at IS NULL
      AND s.is_active = TRUE
    GROUP BY s.code, s.name, s.color, s.sort_order
    ORDER BY s.sort_order ASC, s.name ASC
  `);

  const upcomingResult = await query(`
    SELECT a.id, a.starts_at, a.status, t.name AS tutor_name, p.name AS pet_name, COALESCE(string_agg(ai.description, ', ' ORDER BY ai.created_at), '') AS services
    FROM appointments a
    LEFT JOIN tutors t ON t.id = a.tutor_id
    LEFT JOIN pets p ON p.id = a.pet_id
    LEFT JOIN appointment_items ai ON ai.appointment_id = a.id
    WHERE a.starts_at > NOW()
      AND a.starts_at < NOW() + INTERVAL '7 days'
      AND a.deleted_at IS NULL
      AND a.status NOT IN ('cancelado','finalizado','nao_compareceu')
      AND COALESCE('demo' = ANY(t.tags), FALSE) = FALSE
      AND LOWER(COALESCE(t.email, '')) NOT LIKE '%demo%'
      AND LOWER(COALESCE(a.notes, '')) NOT LIKE '%exemplo%'
      AND LOWER(COALESCE(a.notes, '')) NOT LIKE '%demonstra%'
    GROUP BY a.id, t.name, p.name
    ORDER BY a.starts_at ASC
    LIMIT 8
  `);

  const calendarResult = await query(`
    SELECT a.id,
           a.starts_at,
           a.ends_at,
           a.status,
           a.total_cents,
           a.package_session_label,
           a.package_session_number,
           a.package_total_sessions,
           a.payment_status,
           a.payment_method_id,
           ps.name AS payment_status_name,
           ps.color AS payment_status_color,
           pm.name AS payment_method_name,
           t.name AS tutor_name,
           p.name AS pet_name,
           p.photo_url AS pet_photo_url,
           p.size AS pet_size,
           COALESCE(string_agg(ai.description, ', ' ORDER BY ai.created_at), '') AS services
    FROM appointments a
    LEFT JOIN tutors t ON t.id = a.tutor_id
    LEFT JOIN pets p ON p.id = a.pet_id
    LEFT JOIN payment_statuses ps ON ps.code = a.payment_status
    LEFT JOIN payment_methods pm ON pm.id = a.payment_method_id
    LEFT JOIN appointment_items ai ON ai.appointment_id = a.id
    WHERE a.starts_at >= date_trunc('month', CURRENT_DATE)
      AND a.starts_at < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
      AND a.deleted_at IS NULL
      AND COALESCE('demo' = ANY(t.tags), FALSE) = FALSE
      AND LOWER(COALESCE(t.email, '')) NOT LIKE '%demo%'
      AND LOWER(COALESCE(a.notes, '')) NOT LIKE '%exemplo%'
      AND LOWER(COALESCE(a.notes, '')) NOT LIKE '%demonstra%'
      AND LOWER(COALESCE(a.notes, '')) NOT LIKE '%popular o dashboard%'
    GROUP BY a.id, t.name, p.name, p.photo_url, p.size, ps.name, ps.color, pm.name
    ORDER BY a.starts_at ASC
  `);

  const slotUsageResult = await query(`
    SELECT TO_CHAR(a.starts_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS slot_date,
           TO_CHAR(date_trunc('hour', a.starts_at AT TIME ZONE 'America/Sao_Paulo'), 'HH24:MI') AS slot_time,
           COUNT(a.id)::int AS used
    FROM appointments a
    INNER JOIN appointment_statuses s ON s.code = a.status AND s.blocks_slot = TRUE
    LEFT JOIN tutors t ON t.id = a.tutor_id
    WHERE a.starts_at >= date_trunc('month', CURRENT_DATE)
      AND a.starts_at < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
      AND a.deleted_at IS NULL
      AND (a.tutor_id IS NULL OR (COALESCE('demo' = ANY(t.tags), FALSE) = FALSE AND LOWER(COALESCE(t.email, '')) NOT LIKE '%demo%'))
      AND LOWER(COALESCE(a.notes, '')) NOT LIKE '%exemplo%'
      AND LOWER(COALESCE(a.notes, '')) NOT LIKE '%demonstra%'
      AND LOWER(COALESCE(a.notes, '')) NOT LIKE '%popular o dashboard%'
    GROUP BY 1, 2
  `);

  const operational = await getOperationalSettingsPayload();

  const row = metricsResult.rows[0] || {};
  const n = (value) => Number(value || 0);
  const money = (value) => n(value);
  const appointmentStatus = Object.fromEntries(statusResult.rows.map((item) => [item.status, n(item.total)]));

  const alerts = [];
  if (n(row.pending_payments_count) > 0) {
    alerts.push({ type: 'warning', title: 'Recebimentos pendentes', message: `${n(row.pending_payments_count)} cobrança(s) aguardando baixa no financeiro.` });
  }
  if (n(row.appointments_today) === 0) {
    alerts.push({ type: 'info', title: 'Agenda livre hoje', message: 'Nenhum atendimento agendado para hoje. Use CRM e WhatsApp para reativar clientes.' });
  }
  if (n(row.active_checkins) > 0) {
    alerts.push({ type: 'success', title: 'Atendimentos em andamento', message: `${n(row.active_checkins)} pet(s) estão em atendimento agora.` });
  }
  if (!alerts.length) {
    alerts.push({ type: 'success', title: 'Operação estável', message: 'Nenhum alerta crítico identificado para o dia.' });
  }

  const insights = [
    n(row.appointments_today) > 0
      ? `Hoje existem ${n(row.appointments_today)} agendamento(s). Priorize confirmação pelo WhatsApp antes dos horários de pico.`
      : 'A agenda de hoje está vazia. Vale disparar mensagem para clientes recorrentes e pacotes ativos.',
    money(row.revenue_today_cents) > 0
      ? `Faturamento registrado hoje: ${money(row.revenue_today_cents)} centavos em pagamentos baixados.`
      : 'Ainda não há pagamento baixado hoje. O dashboard não depende de IA nem API externa para carregar.',
    n(row.active_packages) > 0
      ? `${n(row.active_packages)} pacote(s) ativo(s). Acompanhe uso de sessões para evitar perda de recorrência.`
      : 'Nenhum pacote ativo encontrado. Pacotes entram como alavanca de recorrência nas próximas versões.'
  ];

  return {
    metrics: {
      appointmentsToday: n(row.appointments_today),
      appointmentsWeek: n(row.appointments_week),
      activeCheckins: n(row.active_checkins),
      finishedToday: n(row.finished_today),
      petsServedToday: n(row.pets_served_today),
      pendingPaymentsTotalCents: money(row.pending_payments_total_cents),
      pendingPaymentsCount: n(row.pending_payments_count),
      revenueTodayCents: money(row.revenue_today_cents),
      revenueWeekCents: money(row.revenue_week_cents),
      tutorsTotal: n(row.tutors_total),
      petsTotal: n(row.pets_total),
      activePackages: n(row.active_packages),
      recurringClients: n(row.recurring_clients),
      activeGifts: n(row.active_gifts)
    },
    agendaToday: agendaResult.rows.map((item) => ({
      id: item.id,
      startsAt: item.starts_at,
      endsAt: item.ends_at,
      status: item.status,
      tutorName: item.tutor_name || 'Tutor não informado',
      tutorWhatsapp: item.tutor_whatsapp || '',
      petName: item.pet_name || 'Pet não informado',
      petSize: item.pet_size || '',
      petPhotoUrl: item.pet_photo_url || '',
      collaboratorName: item.collaborator_name || 'Equipe PetFunny',
      services: item.services || 'Serviço não informado',
      totalCents: n(item.total_cents),
      discountPercent: Number(item.discount_percent || 0),
      paymentStatus: item.payment_status || 'pending',
      paymentMethodId: item.payment_method_id || null,
      paymentStatusName: item.payment_status_name || (item.payment_status === 'paid' ? 'Pago' : 'Pendente'),
      paymentStatusColor: item.payment_status_color || (item.payment_status === 'paid' ? '#00A9B7' : '#FF9D98'),
      paymentMethodName: item.payment_method_name || 'A definir',
      packageSessionLabel: item.package_session_label,
      notes: item.notes
    })),
    upcomingAppointments: upcomingResult.rows.map((item) => ({
      id: item.id,
      startsAt: item.starts_at,
      status: item.status,
      tutorName: item.tutor_name || 'Tutor não informado',
      petName: item.pet_name || 'Pet não informado',
      services: item.services || 'Serviço não informado'
    })),
    appointmentStatuses: statusResult.rows.map((item) => ({ code: item.status, name: item.label, color: item.color, total: n(item.total) })),
    statusBreakdown: appointmentStatus,
    calendarAppointments: calendarResult.rows.map((item) => ({
      id: item.id,
      startsAt: item.starts_at,
      endsAt: item.ends_at,
      status: item.status,
      tutorName: item.tutor_name || 'Tutor não informado',
      petName: item.pet_name || 'Pet não informado',
      petPhotoUrl: item.pet_photo_url || '',
      petSize: item.pet_size || '',
      services: item.services || 'Serviço não informado',
      totalCents: n(item.total_cents),
      packageSessionLabel: item.package_session_label || null,
      packageSessionNumber: item.package_session_number ? n(item.package_session_number) : null,
      packageTotalSessions: item.package_total_sessions ? n(item.package_total_sessions) : null,
      paymentStatus: item.payment_status || 'pending',
      paymentMethodId: item.payment_method_id || null,
      paymentStatusName: item.payment_status_name || (item.payment_status === 'paid' ? 'Pago' : 'Pendente'),
      paymentStatusColor: item.payment_status_color || (item.payment_status === 'paid' ? '#00A9B7' : '#FF9D98'),
      paymentMethodName: item.payment_method_name || 'A definir'
    })),
    slotUsage: slotUsageResult.rows.map((row) => ({ date: row.slot_date, slotTime: row.slot_time, used: n(row.used) })),
    operational,
    alerts,
    insights,
    source: 'postgresql',
    generatedAt: new Date().toISOString()
  };

}

function asNumber(value, fallback = 0) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : fallback;
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(asNumber(value))));
}

function brlFromCentsText(cents = 0) {
  return (asNumber(cents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function todayPtBrLabel() {
  return new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
}

const AI_GROWTH_ALLOWED_ROUTES = new Set([
  '/admin/dashboard', '/admin/agenda', '/admin/tutores', '/admin/pets', '/admin/servicos',
  '/admin/pacotes', '/admin/assinaturas', '/admin/financeiro', '/admin/comandas-recibos',
  '/admin/crm', '/admin/promocoes', '/admin/bem-estar', '/admin/saude-360',
  '/admin/roleta-de-mimos', '/admin/relatorios', '/admin/notificacoes', '/admin/app-acessos', '/admin/radar-clientes',
  '/admin/whatsapp', '/admin/assistente-ia', '/admin/avaliacoes', '/admin/configuracoes'
]);

const AI_GROWTH_ROUTE_KEYWORDS = [
  { route: '/admin/agenda', terms: ['agenda', 'agendamento', 'agendamentos', 'horario', 'horário', 'encaixe', 'check-in', 'checkin', 'checkout', 'confirmar'] },
  { route: '/admin/tutores', terms: ['tutor', 'tutores', 'cliente', 'clientes', 'responsavel', 'responsável'] },
  { route: '/admin/pets', terms: ['pet', 'pets', 'animal', 'animais'] },
  { route: '/admin/servicos', terms: ['servico', 'serviço', 'servicos', 'serviços', 'banho', 'tosa', 'hidratacao', 'hidratação', 'desembolo'] },
  { route: '/admin/pacotes', terms: ['pacote', 'pacotes', 'recorrencia', 'recorrência', 'renovacao', 'renovação', 'sessao', 'sessão', 'sessoes', 'sessões'] },
  { route: '/admin/assinaturas', terms: ['assinatura', 'assinaturas', 'mensalidade', 'recorrente'] },
  { route: '/admin/financeiro', terms: ['financeiro', 'pagamento', 'pagamentos', 'recebimento', 'recebimentos', 'pendencia', 'pendência', 'caixa', 'faturamento', 'cobranca', 'cobrança', 'inadimplencia', 'inadimplência'] },
  { route: '/admin/comandas-recibos', terms: ['comanda', 'comandas', 'recibo', 'recibos', 'documento', 'documentos'] },
  { route: '/admin/crm', terms: ['crm', 'marketing', 'lead', 'leads', 'reativar', 'reativacao', 'reativação', 'campanha', 'campanhas', 'whatsapp comercial'] },
  { route: '/admin/promocoes', terms: ['promocao', 'promoção', 'promocoes', 'promoções', 'oferta', 'desconto'] },
  { route: '/admin/bem-estar', terms: ['petfunny 360', 'diagnostico', 'diagnóstico', 'avaliacao', 'avaliação', 'bem-estar', 'bem estar'] },
  { route: '/admin/saude-360', terms: ['saude', 'saúde', 'teleconsulta', 'veterinario', 'veterinário', 'triagem'] },
  { route: '/admin/roleta-de-mimos', terms: ['roleta', 'mimo', 'mimos', 'sorteio', 'brinde', 'brindes'] },
  { route: '/admin/relatorios', terms: ['relatorio', 'relatório', 'relatorios', 'relatórios', 'indicador', 'indicadores', 'kpi'] },
  { route: '/admin/notificacoes', terms: ['notificacao', 'notificação', 'notificacoes', 'notificações', 'alerta', 'alertas', 'push'] },
  { route: '/admin/app-acessos', terms: ['app do tutor', 'acessos do app', 'app', 'engajamento', 'momentos', 'foto', 'fotos', 'video', 'vídeo', 'timeline'] },
  { route: '/admin/radar-clientes', terms: ['radar', 'cliente', 'clientes', 'relacionamento', 'retenção', 'retencao', 'reativação', 'reativacao', 'cadência', 'cadencia', 'whatsapp seguro'] },
  { route: '/admin/whatsapp', terms: ['whatsapp', 'mensagem', 'mensagens', 'lista de transmissao', 'lista de transmissão'] },
  { route: '/admin/assistente-ia', terms: ['ia', 'assistente', 'gerente ia', 'copiloto'] },
  { route: '/admin/avaliacoes', terms: ['avaliacao', 'avaliação', 'avaliacoes', 'avaliações', 'nota', 'notas', 'nps', 'satisfacao', 'satisfação', 'feedback'] },
  { route: '/admin/configuracoes', terms: ['configuracao', 'configuração', 'configuracoes', 'configurações', 'horario de funcionamento', 'horário de funcionamento', 'capacidade'] }
];

function normalizeAdminRoute(route) {
  const value = String(route || '').trim();
  if (!value) return '';
  const withoutOrigin = value.replace(/^https?:\/\/[^/]+/i, '');
  const pathOnly = withoutOrigin.startsWith('/') ? withoutOrigin : `/${withoutOrigin}`;
  const [pathname, query = ''] = pathOnly.split('?');
  const normalizedPath = pathname.replace(/\/+/g, '/').replace(/\/$/, '') || '/admin/dashboard';
  if (!AI_GROWTH_ALLOWED_ROUTES.has(normalizedPath)) return '';
  return query ? `${normalizedPath}?${query.slice(0, 80)}` : normalizedPath;
}

function inferAiTaskRoute(task = {}) {
  const text = [task.module, task.modulo, task.title, task.titulo, task.description, task.descricao, task.kpi].filter(Boolean).join(' ').toLowerCase();
  for (const item of AI_GROWTH_ROUTE_KEYWORDS) {
    if (item.terms.some((term) => text.includes(term))) return item.route;
  }
  return '/admin/dashboard';
}

function resolveAiTaskRoute(task = {}) {
  return normalizeAdminRoute(task.route || task.rota) || inferAiTaskRoute(task);
}

function normalizeAiTask(task = {}, index = 0) {
  const priorities = ['alta', 'media', 'média', 'baixa'];
  const priority = String(task.priority || task.prioridade || (index < 2 ? 'alta' : 'média')).toLowerCase();
  return {
    id: task.id || `task-${index + 1}`,
    title: String(task.title || task.titulo || 'Ação operacional').slice(0, 120),
    description: String(task.description || task.descricao || task.action || 'Executar ação recomendada para melhorar a operação.').slice(0, 520),
    priority: priorities.includes(priority) ? (priority === 'media' ? 'média' : priority) : 'média',
    module: String(task.module || task.modulo || 'Dashboard').slice(0, 80),
    due: String(task.due || task.prazo || 'Hoje').slice(0, 80),
    effort: String(task.effort || task.esforco || '15 min').slice(0, 80),
    kpi: String(task.kpi || task.indicador || 'crescimento').slice(0, 140),
    route: resolveAiTaskRoute(task),
    clientName: String(task.clientName || task.cliente || task.tutorName || task.tutor || '').slice(0, 120),
    petName: String(task.petName || task.pet || '').slice(0, 120),
    appointmentId: task.appointmentId || task.agendamentoId || task.appointment_id || null,
    whatsappPhone: normalizeWhatsapp(task.whatsappPhone || task.phone || task.whatsapp || task.tutorWhatsapp || ''),
    whatsappMessage: String(task.whatsappMessage || task.message || task.mensagemWhatsapp || task.copyWhatsapp || '').slice(0, 900),
    actionLabel: String(task.actionLabel || task.botao || task.cta || 'Enviar WhatsApp').slice(0, 80)
  };
}

function buildAiWhatsappUrl(phone = '', message = '') {
  const digits = normalizeWhatsapp(phone);
  const encoded = encodeURIComponent(String(message || '').trim());
  if (!digits && !encoded) return '';
  return digits ? `https://wa.me/${digits}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
}

function normalizeGrowthPlan(raw = {}, fallback = {}) {
  const safe = raw && typeof raw === 'object' ? raw : {};
  const tasks = Array.isArray(safe.tasks) ? safe.tasks : Array.isArray(safe.tarefas) ? safe.tarefas : [];
  const campaigns = Array.isArray(safe.campaigns) ? safe.campaigns : Array.isArray(safe.campanhas) ? safe.campanhas : [];
  const risks = Array.isArray(safe.risks) ? safe.risks : Array.isArray(safe.riscos) ? safe.riscos : [];
  const opportunities = Array.isArray(safe.opportunities) ? safe.opportunities : Array.isArray(safe.oportunidades) ? safe.oportunidades : [];
  return {
    title: String(safe.title || safe.titulo || fallback.title || 'Gerente IA de Crescimento PetFunny').slice(0, 120),
    dateLabel: String(safe.dateLabel || safe.data || fallback.dateLabel || todayPtBrLabel()).slice(0, 120),
    score: clampScore(safe.score ?? fallback.score ?? 50),
    mood: String(safe.mood || safe.status || fallback.mood || 'atenção').slice(0, 80),
    diagnosis: String(safe.diagnosis || safe.diagnostico || fallback.diagnosis || 'Análise diária gerada a partir dos dados do sistema.').slice(0, 1200),
    mainGoal: String(safe.mainGoal || safe.objetivo || fallback.mainGoal || 'Aumentar agenda, recorrência e recebimentos do PetFunny hoje.').slice(0, 220),
    tasks: (tasks.length ? tasks : fallback.tasks || []).slice(0, 8).map(normalizeAiTask),
    campaigns: (campaigns.length ? campaigns : fallback.campaigns || []).slice(0, 4).map((item, index) => ({
      title: String(item.title || item.titulo || `Campanha ${index + 1}`).slice(0, 120),
      channel: String(item.channel || item.canal || 'WhatsApp').slice(0, 80),
      message: String(item.message || item.mensagem || item.copy || '').slice(0, 700),
      target: String(item.target || item.publico || 'tutores').slice(0, 160)
    })),
    risks: (risks.length ? risks : fallback.risks || []).slice(0, 5).map((item) => String(item.title || item.risk || item.risco || item).slice(0, 260)),
    opportunities: (opportunities.length ? opportunities : fallback.opportunities || []).slice(0, 5).map((item) => String(item.title || item.opportunity || item.oportunidade || item).slice(0, 260)),
    routine: {
      morning: String(safe.routine?.morning || safe.rotina?.manha || fallback.routine?.morning || 'Conferir agenda, confirmar tutores e priorizar pendências.').slice(0, 260),
      afternoon: String(safe.routine?.afternoon || safe.rotina?.tarde || fallback.routine?.afternoon || 'Acompanhar check-ins, fotos/momentos e pagamentos.').slice(0, 260),
      closing: String(safe.routine?.closing || safe.rotina?.fechamento || fallback.routine?.closing || 'Fechar caixa, atualizar status e preparar reativação para amanhã.').slice(0, 260)
    }
  };
}

function buildLocalGrowthPlan({ summary, snapshot }) {
  const metrics = summary.metrics || {};
  const agendaToday = summary.agendaToday || [];
  const pending = asNumber(metrics.pendingPaymentsCount);
  const pendingCents = asNumber(metrics.pendingPaymentsTotalCents);
  const appointmentsToday = asNumber(metrics.appointmentsToday);
  const finishedToday = asNumber(metrics.finishedToday);
  const revenueToday = asNumber(metrics.revenueTodayCents);
  const activePackages = asNumber(metrics.activePackages);
  const recurringClients = asNumber(metrics.recurringClients);
  const upcoming = asNumber(summary.upcomingAppointments?.length);
  const emptyAgenda = appointmentsToday === 0;
  const paymentPressure = pending > 0;
  const conversionPressure = activePackages <= 0 || recurringClients <= Math.max(2, Math.ceil(asNumber(metrics.tutorsTotal) * 0.08));
  const cancellations = asNumber((snapshot.dailyPerformance || []).reduce((sum, row) => sum + asNumber(row.cancelled), 0));

  let score = 58;
  if (appointmentsToday >= 6) score += 12;
  if (appointmentsToday >= 10) score += 8;
  if (revenueToday > 0) score += 8;
  if (activePackages > 0) score += 7;
  if (pending > 0) score -= Math.min(16, pending * 3);
  if (emptyAgenda) score -= 18;
  if (cancellations > 0) score -= Math.min(10, cancellations);
  score = clampScore(score);

  const tasks = [];
  const fmtHour = (value) => value ? new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : '';
  const fmtDateShort = (value) => value ? new Date(value).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' }) : '';
  const firstTodayToConfirm = agendaToday.find((item) => ['agendado', 'confirmado'].includes(String(item.status || '').toLowerCase()) && item.tutorWhatsapp) || agendaToday.find((item) => item.tutorWhatsapp) || null;
  const firstTodayForPackage = agendaToday.find((item) => item.tutorWhatsapp && !String(item.packageSessionLabel || '').trim()) || firstTodayToConfirm || null;
  const firstPendingPayment = (snapshot.paymentPending || []).find((item) => item.tutor_name || item.tutorName) || (snapshot.paymentPending || [])[0] || null;
  const firstInactiveTutor = (snapshot.inactiveTutors || []).find((item) => item.whatsapp) || (snapshot.inactiveTutors || [])[0] || null;
  const firstPackageAttention = (snapshot.packageAttention || [])[0] || null;

  if (firstTodayToConfirm) {
    const hour = fmtHour(firstTodayToConfirm.startsAt);
    const message = `Oi, ${firstTodayToConfirm.tutorName || 'tudo bem'}! Aqui é do PetFunny 🐾 Passando para confirmar o horário do ${firstTodayToConfirm.petName || 'seu pet'} hoje às ${hour}. Podemos confirmar?`;
    tasks.push({
      title: `Confirmar ${firstTodayToConfirm.petName || 'pet'} com ${firstTodayToConfirm.tutorName || 'tutor'}`,
      description: `Agendamento de hoje às ${hour} para ${firstTodayToConfirm.petName || 'pet'} (${firstTodayToConfirm.services || 'serviço'}). Envie a confirmação antes do horário para reduzir atraso, falta e buraco na agenda.`,
      priority: 'alta', module: 'Agenda', due: 'Agora', effort: '3 min', kpi: 'horário confirmado antes do atendimento', route: `/admin/agenda?appointment=${firstTodayToConfirm.id}`,
      clientName: firstTodayToConfirm.tutorName || '', petName: firstTodayToConfirm.petName || '', appointmentId: firstTodayToConfirm.id,
      whatsappPhone: firstTodayToConfirm.tutorWhatsapp || '', whatsappMessage: message, actionLabel: 'Confirmar no WhatsApp'
    });
  } else if (emptyAgenda) {
    const inactiveTarget = firstInactiveTutor || {};
    const message = `Oi, ${inactiveTarget.name || 'tudo bem'}! Aqui é do PetFunny 🐾 Hoje abrimos alguns horários especiais para banho e cuidado. Quer que eu veja um encaixe para o seu pet?`;
    tasks.push({
      title: inactiveTarget.name ? `Reativar ${inactiveTarget.name} para preencher a agenda` : 'Ativar agenda vazia com campanha de encaixe',
      description: inactiveTarget.name
        ? `${inactiveTarget.name} está sem visita recente. Envie uma mensagem direta oferecendo um encaixe e tente trazer o cliente de volta sem depender de anúncio pago.`
        : 'Disparar mensagem para clientes recorrentes, pacotes ativos e tutores sem visita recente oferecendo horários livres de hoje/amanhã.',
      priority: 'alta', module: 'CRM & Marketing', due: 'Hoje até 10h30', effort: '15 min', kpi: '3 a 5 conversas iniciadas', route: '/admin/crm',
      clientName: inactiveTarget.name || '', whatsappPhone: inactiveTarget.whatsapp || '', whatsappMessage: message, actionLabel: 'Reativar no WhatsApp'
    });
  } else {
    tasks.push({
      title: 'Confirmar todos os atendimentos de hoje',
      description: `Conferir os ${appointmentsToday} agendamento(s) do dia, confirmar presença por WhatsApp e marcar risco de atraso/cancelamento antes do horário de pico.`,
      priority: 'alta', module: 'Agenda', due: 'Agora', effort: '15 min', kpi: '100% dos horários confirmados', route: '/admin/agenda'
    });
  }

  if (firstTodayForPackage) {
    const message = `Oi, ${firstTodayForPackage.tutorName || 'tudo bem'}! O ${firstTodayForPackage.petName || 'seu pet'} ficou/ficará em dia com o cuidado no PetFunny 🐶✨ Para facilitar sua rotina, posso deixar os próximos banhos organizados em pacote mensal, com horário garantido e mais previsibilidade. Quer que eu te mostre as opções?`;
    tasks.push({
      title: `Oferecer pacote para ${firstTodayForPackage.tutorName || 'cliente de hoje'}`,
      description: `${firstTodayForPackage.tutorName || 'Tutor'} tem atendimento de ${firstTodayForPackage.petName || 'pet'} hoje (${firstTodayForPackage.services || 'serviço'}). É uma oportunidade concreta para converter banho avulso em recorrência antes ou logo após a entrega do pet.`,
      priority: 'alta', module: 'Pacotes', due: 'Após o atendimento', effort: '5 min', kpi: '1 proposta de pacote enviada', route: '/admin/pacotes?sell=1',
      clientName: firstTodayForPackage.tutorName || '', petName: firstTodayForPackage.petName || '', appointmentId: firstTodayForPackage.id,
      whatsappPhone: firstTodayForPackage.tutorWhatsapp || '', whatsappMessage: message, actionLabel: 'Oferecer pacote'
    });
  } else if (conversionPressure) {
    tasks.push({
      title: 'Converter banhos avulsos em pacote recorrente',
      description: 'Identificar tutores com banho avulso recente e oferecer pacote mensal com benefício claro: agenda garantida, pet sempre cuidado e previsibilidade para o tutor.',
      priority: 'alta', module: 'Pacotes', due: 'Hoje após cada atendimento', effort: '10 min por tutor', kpi: '1 nova venda de pacote', route: '/admin/pacotes'
    });
  }

  if (firstPendingPayment) {
    const amount = brlFromCentsText(firstPendingPayment.amount_cents || firstPendingPayment.amountCents || 0);
    const tutorName = firstPendingPayment.tutor_name || firstPendingPayment.tutorName || 'cliente';
    const dueLabel = firstPendingPayment.due_date ? new Date(firstPendingPayment.due_date).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'sem vencimento informado';
    tasks.push({
      title: `Cobrar pendência de ${tutorName}`,
      description: `${tutorName} possui uma pendência de ${amount} (${firstPendingPayment.description || 'recebimento'}), vencimento ${dueLabel}. Verifique se já foi pago; se não, envie lembrete educado pelo WhatsApp.`,
      priority: 'alta', module: 'Financeiro', due: 'Hoje antes do fechamento', effort: '5 min', kpi: 'reduzir pendências financeiras', route: '/admin/financeiro',
      clientName: tutorName, whatsappPhone: firstPendingPayment.whatsapp || firstPendingPayment.tutor_whatsapp || '',
      whatsappMessage: `Oi, ${tutorName}! Tudo bem? Aqui é do PetFunny 🐾 Estou conferindo o financeiro e consta uma pendência de ${amount}. Você consegue me confirmar se já realizou o pagamento? Se preferir, te envio novamente as informações.`,
      actionLabel: 'Cobrar no WhatsApp'
    });
  } else if (paymentPressure) {
    tasks.push({
      title: 'Baixar ou cobrar recebimentos pendentes',
      description: `Existem ${pending} pendência(s), somando ${brlFromCentsText(pendingCents)}. Separar o que já foi pago, dar baixa e enviar lembrete educado para o restante.`,
      priority: 'alta', module: 'Financeiro', due: 'Hoje antes do fechamento', effort: '20 min', kpi: 'reduzir pendências do dia', route: '/admin/financeiro'
    });
  }

  if (firstPackageAttention) {
    const remaining = Math.max(0, asNumber(firstPackageAttention.total_sessions) - asNumber(firstPackageAttention.finished_sessions || firstPackageAttention.used_sessions));
    const tutorName = firstPackageAttention.tutor_name || 'cliente com pacote';
    const petName = firstPackageAttention.pet_name || 'pet';
    tasks.push({
      title: `Antecipar renovação do pacote de ${petName}`,
      description: `${petName}, de ${tutorName}, tem pacote ativo (${firstPackageAttention.package_name || 'pacote'}) com ${remaining} sessão(ões) restantes. Fale antes da última sessão para evitar intervalo sem recorrência.`,
      priority: remaining <= 1 ? 'alta' : 'média', module: 'Pacotes', due: 'Hoje', effort: '7 min', kpi: 'renovação sem atraso', route: '/admin/pacotes',
      clientName: tutorName, petName,
      whatsappMessage: `Oi, ${tutorName}! Aqui é do PetFunny 🐾 O pacote do ${petName} está chegando perto do fim. Quer que eu já deixe a renovação organizada para manter os próximos banhos garantidos?`,
      actionLabel: 'Enviar renovação'
    });
  } else if (!conversionPressure) {
    tasks.push({
      title: 'Proteger a base recorrente de pacotes',
      description: `Há ${activePackages} pacote(s) ativo(s). Conferir próximas sessões e antecipar renovação dos clientes que estão próximos da última sessão.`,
      priority: 'média', module: 'Pacotes', due: 'Hoje', effort: '20 min', kpi: 'renovações sem atraso', route: '/admin/pacotes'
    });
  }

  tasks.push({
    title: firstTodayToConfirm ? `Registrar momento do ${firstTodayToConfirm.petName || 'pet'}` : 'Registrar momento do pet para aumentar vínculo',
    description: firstTodayToConfirm
      ? `Durante ou após o atendimento do ${firstTodayToConfirm.petName || 'pet'}, salve uma foto/vídeo e envie para ${firstTodayToConfirm.tutorName || 'o tutor'}. Isso aumenta percepção de cuidado e engajamento no app.`
      : 'Durante atendimentos finalizados, salvar foto/vídeo do pet e usar isso como motivo de retorno no app do tutor e WhatsApp.',
    priority: appointmentsToday > 0 ? 'média' : 'baixa', module: 'Acessos do App', due: 'Durante os atendimentos', effort: '5 min por pet', kpi: 'mais engajamento no app', route: '/admin/app-acessos',
    clientName: firstTodayToConfirm?.tutorName || '', petName: firstTodayToConfirm?.petName || '', whatsappPhone: firstTodayToConfirm?.tutorWhatsapp || '',
    whatsappMessage: firstTodayToConfirm ? `Oi, ${firstTodayToConfirm.tutorName || 'tudo bem'}! Olha que especial: registramos um momento do ${firstTodayToConfirm.petName || 'seu pet'} aqui no PetFunny 🐾✨ Você pode acompanhar os momentos pelo app do tutor.` : '',
    actionLabel: 'Enviar momento'
  });

  if (upcoming < 4) {
    const target = firstTodayToConfirm || firstTodayForPackage || {};
    tasks.push({
      title: target.tutorName ? `Agendar próximo cuidado de ${target.petName || 'pet'}` : 'Preencher os próximos 7 dias',
      description: target.tutorName
        ? `Antes de ${target.tutorName} sair, ofereça já o próximo banho do ${target.petName || 'pet'} para manter frequência e evitar que o cliente esqueça de remarcar.`
        : `A agenda futura tem apenas ${upcoming} horário(s) próximos carregados no painel. Ofereça remarcação e próximos banhos antes do tutor sair da loja.`,
      priority: 'média', module: 'Agenda', due: 'Hoje', effort: '5 min', kpi: 'agenda futura mais cheia', route: '/admin/agenda',
      clientName: target.tutorName || '', petName: target.petName || '', whatsappPhone: target.tutorWhatsapp || '',
      whatsappMessage: target.tutorName ? `Oi, ${target.tutorName}! Para manter o ${target.petName || 'pet'} sempre cuidado, quer que eu já reserve o próximo banho? Assim você garante o melhor horário na agenda do PetFunny. 🐶🛁` : '',
      actionLabel: 'Agendar retorno'
    });
  }

  const topService = (snapshot.serviceDemand || [])[0]?.description || 'banho e tosa';
  const inactiveName = (snapshot.inactiveTutors || [])[0]?.name || '{{nome_cliente}}';
  const campaigns = [
    {
      title: 'Reativação de cliente sumido',
      channel: 'WhatsApp',
      target: 'tutores sem visita recente',
      message: `Oi, ${inactiveName}! Tudo bem? Aqui é do PetFunny 🐾 Passando para lembrar que temos horários para deixar seu pet cheiroso, cuidado e feliz. Quer que eu veja um encaixe especial para esta semana?`
    },
    {
      title: 'Venda de pacote no pós-atendimento',
      channel: 'Balcão + WhatsApp',
      target: 'clientes de banho avulso',
      message: 'Seu pet ficou lindo hoje! Para manter esse cuidado sem correria, posso deixar os próximos banhos já organizados em pacote mensal. Assim você garante horário e ainda economiza. 🐶✨'
    },
    {
      title: `Oferta conectada ao serviço mais procurado: ${topService}`,
      channel: 'Status/Lista de transmissão',
      target: 'clientes ativos',
      message: `Hoje o PetFunny está organizando horários para ${topService}. Quem quiser deixar o pet limpinho e cheiroso esta semana, me chama aqui que vejo o melhor encaixe. 🛁🐾`
    }
  ];

  const risks = [];
  if (emptyAgenda) risks.push('Agenda vazia reduz fluxo de caixa e enfraquece rotina da equipe.');
  if (paymentPressure) risks.push('Recebimentos pendentes podem mascarar faturamento real do dia.');
  if (conversionPressure) risks.push('Baixa recorrência aumenta dependência de banho avulso e promoções.');
  if (!risks.length) risks.push('Risco principal: deixar de transformar atendimentos de hoje em próximos agendamentos.');

  const opportunities = [];
  if (appointmentsToday > 0) opportunities.push('Cada atendimento de hoje pode virar próximo banho agendado antes da saída do tutor.');
  if (activePackages > 0) opportunities.push('Pacotes ativos permitem previsibilidade: renovar antes da última sessão aumenta retenção.');
  opportunities.push('Usar momentos/fotos no app do tutor aumenta percepção de cuidado e diferencia o PetFunny.');
  opportunities.push('WhatsApp com mensagem humana pode recuperar clientes sem depender de anúncio pago.');

  return normalizeGrowthPlan({
    title: 'Gerente IA de Crescimento PetFunny',
    dateLabel: todayPtBrLabel(),
    score,
    mood: score >= 75 ? 'crescimento saudável' : score >= 55 ? 'atenção produtiva' : 'ação urgente',
    mainGoal: emptyAgenda ? 'Preencher agenda e gerar conversas comerciais hoje.' : 'Converter a operação de hoje em receita, recorrência e próximos agendamentos.',
    diagnosis: `Análise em tempo real: ${appointmentsToday} agendamento(s) hoje, ${finishedToday} finalizado(s), ${brlFromCentsText(revenueToday)} recebido hoje, ${pending} pendência(s) financeira(s), ${activePackages} pacote(s) ativo(s) e ${recurringClients} cliente(s) recorrente(s). O foco do dia deve ser confirmação da agenda, baixa de pagamentos, venda de recorrência e reativação via WhatsApp.`,
    tasks,
    campaigns,
    risks,
    opportunities,
    routine: {
      morning: emptyAgenda ? 'Abrir CRM, disparar reativação e preencher horários livres.' : 'Confirmar agenda, checar pagamentos e preparar equipe para os horários de pico.',
      afternoon: 'Registrar status dos atendimentos, fotos/momentos e oferecer próximo banho ou pacote antes do tutor sair.',
      closing: 'Dar baixa financeira, revisar cancelamentos/no-shows e montar lista de clientes para reativar amanhã.'
    }
  });
}

async function getDashboardGrowthSnapshot() {
  const [dailyPerformance, serviceDemand, inactiveTutors, packageAttention, paymentPending, weeklyFunnel] = await Promise.all([
    safeAiQuery('growth_daily_performance', `
      SELECT starts_at::date AS date,
             COUNT(*)::int AS appointments,
             COALESCE(SUM(total_cents), 0)::int AS scheduled_cents,
             COUNT(*) FILTER (WHERE status = 'finalizado')::int AS finished,
             COUNT(*) FILTER (WHERE status IN ('cancelado','nao_compareceu'))::int AS cancelled
      FROM appointments
      WHERE deleted_at IS NULL
        AND starts_at >= CURRENT_DATE - INTERVAL '14 days'
        AND starts_at < CURRENT_DATE + INTERVAL '7 days'
      GROUP BY starts_at::date
      ORDER BY starts_at::date DESC
      LIMIT 21
    `),
    safeAiQuery('growth_service_demand', `
      SELECT description, COUNT(*)::int AS total, COALESCE(SUM(total_cents), 0)::int AS total_cents
      FROM appointment_items
      WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY description
      ORDER BY total DESC, total_cents DESC
      LIMIT 8
    `),
    safeAiQuery('growth_inactive_tutors', `
      SELECT t.id, t.name, t.whatsapp, MAX(a.starts_at) AS last_appointment_at, COUNT(a.id)::int AS appointments
      FROM tutors t
      LEFT JOIN appointments a ON a.tutor_id = t.id AND a.deleted_at IS NULL
      WHERE t.deleted_at IS NULL
        AND COALESCE('demo' = ANY(t.tags), FALSE) = FALSE
        AND LOWER(COALESCE(t.email, '')) NOT LIKE '%demo%'
      GROUP BY t.id, t.name, t.whatsapp
      HAVING MAX(a.starts_at) IS NULL OR MAX(a.starts_at) < NOW() - INTERVAL '35 days'
      ORDER BY MAX(a.starts_at) ASC NULLS FIRST, t.created_at ASC
      LIMIT 10
    `),
    safeAiQuery('growth_package_attention', `
      SELECT cp.id, cp.status, cp.total_sessions, cp.used_sessions, cp.amount_cents,
             t.name AS tutor_name, p.name AS pet_name, pk.name AS package_name,
             COUNT(a.id) FILTER (WHERE a.deleted_at IS NULL AND a.status = 'finalizado')::int AS finished_sessions,
             COUNT(a.id) FILTER (WHERE a.deleted_at IS NULL AND a.starts_at >= NOW() AND a.status NOT IN ('cancelado','nao_compareceu'))::int AS future_sessions
      FROM customer_packages cp
      LEFT JOIN tutors t ON t.id = cp.tutor_id
      LEFT JOIN pets p ON p.id = cp.pet_id
      LEFT JOIN packages pk ON pk.id = cp.package_id
      LEFT JOIN appointments a ON a.customer_package_id = cp.id
      WHERE cp.deleted_at IS NULL
        AND cp.status = 'active'
      GROUP BY cp.id, t.name, p.name, pk.name
      ORDER BY cp.updated_at DESC
      LIMIT 10
    `),
    safeAiQuery('growth_payment_pending', `
      SELECT ft.id, ft.description, ft.amount_cents, ft.due_date, ft.status, t.name AS tutor_name, t.whatsapp
      FROM financial_transactions ft
      LEFT JOIN tutors t ON t.id = ft.tutor_id
      WHERE ft.deleted_at IS NULL
        AND ft.type = 'income'
        AND ft.status <> 'paid'
      ORDER BY ft.due_date ASC NULLS LAST, ft.created_at ASC
      LIMIT 10
    `),
    safeAiQuery('growth_weekly_funnel', `
      SELECT
        COUNT(*) FILTER (WHERE starts_at >= date_trunc('week', NOW()) AND starts_at < date_trunc('week', NOW()) + INTERVAL '7 days')::int AS appointments_week,
        COUNT(*) FILTER (WHERE starts_at >= date_trunc('week', NOW()) AND starts_at < date_trunc('week', NOW()) + INTERVAL '7 days' AND status = 'finalizado')::int AS finished_week,
        COUNT(*) FILTER (WHERE starts_at >= date_trunc('week', NOW()) AND starts_at < date_trunc('week', NOW()) + INTERVAL '7 days' AND status IN ('cancelado','nao_compareceu'))::int AS lost_week
      FROM appointments
      WHERE deleted_at IS NULL
    `)
  ]);

  return {
    dailyPerformance,
    serviceDemand,
    inactiveTutors,
    packageAttention,
    paymentPending,
    weeklyFunnel: weeklyFunnel[0] || {},
    generatedAt: new Date().toISOString()
  };
}

async function askOpenAiForGrowthPlan({ summary, snapshot, fallbackPlan }) {
  if (!env.openaiApiKey) return null;
  if (typeof fetch !== 'function') return null;

  const systemPrompt = `${getPetFunnyAiSystemPrompt()}\n\nVocê é o Gerente IA de Crescimento do PetFunny OS. Analise dados reais do dashboard, agenda, financeiro, pacotes, CRM e engajamento. Gere um plano diário prático para crescer o banho e tosa. Não invente números. Se houver poucos dados, use hipótese operacional claramente. Retorne APENAS JSON válido com: title, dateLabel, score, mood, diagnosis, mainGoal, tasks, campaigns, risks, opportunities, routine. tasks deve ter title, description, priority, module, due, effort, kpi, route e, quando houver cliente específico, clientName, petName, whatsappPhone, whatsappMessage e actionLabel. Use somente estas rotas em tasks.route: /admin/dashboard, /admin/agenda, /admin/tutores, /admin/pets, /admin/servicos, /admin/pacotes, /admin/assinaturas, /admin/financeiro, /admin/comandas-recibos, /admin/crm, /admin/promocoes, /admin/bem-estar, /admin/saude-360, /admin/roleta-de-mimos, /admin/relatorios, /admin/notificacoes, /admin/app-acessos, /admin/radar-clientes, /admin/whatsapp, /admin/assistente-ia, /admin/avaliacoes, /admin/configuracoes. campaigns deve ter title, channel, target, message. routine deve ter morning, afternoon, closing.`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8500);
  let response;
  try {
    response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${env.openaiApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: env.openaiModel,
        temperature: 0.28,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: JSON.stringify({ summary, snapshot, fallbackPlan }).slice(0, 22000) }
        ]
      })
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('OpenAI demorou demais para responder e foi substituída pelo plano local.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`OpenAI retornou ${response.status}. ${errorText.slice(0, 240)}`.trim());
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content || '{}';
  return JSON.parse(content);
}

async function getDashboardAiGrowthPlan() {
  const summary = await getDashboardSummary();
  const snapshot = await getDashboardGrowthSnapshot();
  const fallbackPlan = buildLocalGrowthPlan({ summary, snapshot });
  let aiPlan = null;
  let aiError = null;

  try {
    aiPlan = await askOpenAiForGrowthPlan({ summary, snapshot, fallbackPlan });
  } catch (error) {
    console.warn(`[dashboard-growth-ai] OpenAI indisponível: ${error.message}`);
    aiError = error.message;
  }

  const plan = normalizeGrowthPlan(aiPlan, fallbackPlan);
  return {
    status: 'ok',
    assistant: 'Gerente IA de Crescimento PetFunny',
    mode: 'realtime_daily_growth_plan',
    openaiConfigured: Boolean(env.openaiApiKey),
    openaiUsed: Boolean(aiPlan),
    openaiError: aiPlan ? null : aiError,
    plan,
    metrics: summary.metrics,
    snapshotSummary: {
      dailyPerformance: snapshot.dailyPerformance.length,
      serviceDemand: snapshot.serviceDemand.length,
      inactiveTutors: snapshot.inactiveTutors.length,
      packageAttention: snapshot.packageAttention.length,
      paymentPending: snapshot.paymentPending.length
    },
    generatedAt: new Date().toISOString()
  };
}

function sendFrontendFile(res, relativePath) {
  const filePath = path.resolve(frontendRoot, relativePath);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({
      error: 'Arquivo de frontend não encontrado.',
      file: relativePath,
      frontendRoot
    });
  }
  return res.sendFile(filePath);
}

const app = express();
app.disable('etag');

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: true, limit: '8mb' }));

app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    const startedAt = Date.now();
    res.on('finish', () => {
      console.log(`[api] ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - startedAt}ms`);
    });
  }
  next();
});

app.get('/api/health', async (req, res) => {
  const database = await healthcheckDb();
  res.json({
    status: 'ok',
    service: 'PetFunny OS API',
    mode: env.appMode,
    tenant: false,
    database,
    frontend: {
      root: frontendRoot,
      available: fs.existsSync(path.resolve(frontendRoot, 'index.html'))
    },
    business: {
      name: env.petfunnyName,
      city: env.petfunnyCity,
      state: env.petfunnyState,
      whatsapp: env.petfunnyWhatsapp
    },
    timestamp: new Date().toISOString()
  });
});


app.post('/api/auth/login', async (req, res, next) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!email || !password) {
      return res.status(400).json({ error: 'Informe email e senha.' });
    }

    const result = await query(`
      SELECT id, name, email, password_hash, role, permissions, is_active
      FROM users
      WHERE lower(email) = lower($1)
        AND deleted_at IS NULL
      LIMIT 1
    `, [email]);

    const user = result.rows[0];
    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'Email ou senha inválidos.' });
    }

    const passwordOk = await bcrypt.compare(password, user.password_hash);
    if (!passwordOk) {
      return res.status(401).json({ error: 'Email ou senha inválidos.' });
    }

    await query('UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1', [user.id]);

    const token = jwt.sign(
      { sub: user.id, email: user.email, role: user.role, mode: env.appMode, tenant: false },
      env.jwtSecret,
      { expiresIn: env.jwtExpiresIn }
    );

    const business = await getBusinessPayload();
    res.json({
      token,
      tokenType: 'Bearer',
      expiresIn: env.jwtExpiresIn,
      user: sanitizeUser(user, business)
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/auth/me', requireAuth, async (req, res, next) => {
  try {
    const business = await getBusinessPayload();
    res.json({ user: { ...req.user, business } });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/logout', requireAuth, async (req, res) => {
  res.json({ ok: true, message: 'Sessão encerrada no cliente.' });
});


function parseLimit(value, fallback = 20, max = 100) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, max);
}

function parseOffset(page, limit) {
  const n = Number.parseInt(page, 10);
  if (!Number.isFinite(n) || n <= 1) return 0;
  return (n - 1) * limit;
}

function parseTags(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function cleanText(value) {
  const text = String(value || '').trim();
  return text || null;
}

function parsePercent(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'number') return Number.isFinite(value) ? Math.max(0, Math.min(100, Number(value.toFixed(2)))) : fallback;
  const normalized = String(value)
    .trim()
    .replace('%', '')
    .replace(/\s+/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.');
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(100, Number(parsed.toFixed(2))));
}

function cleanJsonObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

function cleanPhotoDataUrl(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  if (text.startsWith('/assets/') || text.startsWith('http://') || text.startsWith('https://')) return text.slice(0, 900000);
  const ok = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=\s]+$/i.test(text);
  if (!ok) return null;
  // limite aproximado de 700 KB para manter o banco leve nesta fase sem storage externo
  if (text.length > 950000) throw new Error('A foto deve ter até aproximadamente 700 KB. Use uma imagem menor.');
  return text;
}

function parseBool(value, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return ['true', '1', 'yes', 'sim', 'active', 'ativo'].includes(String(value).toLowerCase());
}

function normalizeCode(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
}

function sanitizeBusiness(row = {}) {
  const social = cleanJsonObject(row.social_links);
  const seo = cleanJsonObject(row.seo_settings);
  return {
    id: row.id,
    businessName: row.business_name,
    legalName: row.legal_name,
    documentNumber: row.document_number,
    whatsapp: row.whatsapp,
    phone: row.phone,
    email: row.email,
    addressStreet: row.address_street,
    addressNumber: row.address_number,
    addressNeighborhood: row.address_neighborhood,
    addressCity: row.address_city,
    addressState: row.address_state,
    addressZipcode: row.address_zipcode,
    websiteUrl: row.website_url,
    instagramUrl: row.instagram_url || social.instagram || '',
    facebookUrl: row.facebook_url || social.facebook || '',
    tiktokUrl: row.tiktok_url || social.tiktok || '',
    googleBusinessUrl: row.google_business_url || social.googleBusiness || '',
    mapsUrl: row.maps_url || social.maps || '',
    seoTitle: row.seo_title || seo.title || '',
    seoDescription: row.seo_description || seo.description || '',
    seoKeywords: row.seo_keywords || seo.keywords || '',
    seoImageUrl: row.seo_image_url || seo.imageUrl || '',
    landingHeadline: row.landing_headline,
    landingSubheadline: row.landing_subheadline,
    theme: cleanJsonObject(row.theme),
    documentPreferences: cleanJsonObject(row.document_preferences),
    updatedAt: row.updated_at
  };
}

async function getBusinessSettingsRow() {
  const result = await query('SELECT * FROM business_settings ORDER BY created_at ASC LIMIT 1');
  return result.rows[0] || null;
}

function sanitizePetType(row = {}) {
  return { id: row.id, code: row.code, name: row.name, description: row.description, sortOrder: Number(row.sort_order || 0), isActive: Boolean(row.is_active) };
}
function sanitizePetSize(row = {}) {
  return { id: row.id, code: row.code, name: row.name, description: row.description, minWeightKg: row.min_weight_kg === null ? null : Number(row.min_weight_kg), maxWeightKg: row.max_weight_kg === null ? null : Number(row.max_weight_kg), sortOrder: Number(row.sort_order || 0), isActive: Boolean(row.is_active) };
}
function sanitizePetBreed(row = {}) {
  return { id: row.id, petTypeId: row.pet_type_id, petTypeName: row.pet_type_name, petTypeCode: row.pet_type_code, name: row.name, suggestedSizeCode: row.suggested_size_code, coatType: row.coat_type, sortOrder: Number(row.sort_order || 0), isActive: Boolean(row.is_active) };
}


function sanitizeServiceType(row = {}) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    petTypeCode: row.pet_type_code || null,
    petTypeName: row.pet_type_name || null,
    petSizeCode: row.pet_size_code || null,
    petSizeName: row.pet_size_name || null,
    sortOrder: Number(row.sort_order || 0),
    isActive: Boolean(row.is_active)
  };
}

function sanitizeAppointmentStatus(row = {}) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    color: row.color || '#00A9B7',
    sortOrder: Number(row.sort_order || 0),
    isActive: Boolean(row.is_active),
    isFinal: Boolean(row.is_final),
    blocksSlot: Boolean(row.blocks_slot)
  };
}

function sanitizePaymentStatus(row = {}) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    color: row.color || '#00A9B7',
    sortOrder: Number(row.sort_order || 0),
    isActive: Boolean(row.is_active)
  };
}

function sanitizePaymentMethod(row = {}) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    sortOrder: Number(row.sort_order || 0),
    isActive: Boolean(row.is_active)
  };
}

function weekdayName(value) {
  return ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'][Number(value)] || 'Dia';
}

function cleanTime(value, fallback = null) {
  const text = String(value || '').trim();
  if (!text) return fallback;
  const match = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return fallback;
  const hh = Math.max(0, Math.min(23, Number(match[1])));
  const mm = Math.max(0, Math.min(59, Number(match[2])));
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`;
}

function normalizeHour(value) {
  const time = cleanTime(value, null);
  if (!time) return null;
  return `${time.slice(0, 2)}:00:00`;
}

function sanitizeBusinessHour(row = {}) {
  return {
    id: row.id,
    weekday: Number(row.weekday),
    weekdayName: weekdayName(row.weekday),
    opensAt: row.opens_at ? String(row.opens_at).slice(0, 5) : '',
    closesAt: row.closes_at ? String(row.closes_at).slice(0, 5) : '',
    isOpen: Boolean(row.is_open)
  };
}

function sanitizeTimeSlot(row = {}) {
  return {
    id: row.id,
    weekday: Number(row.weekday),
    weekdayName: weekdayName(row.weekday),
    slotTime: row.slot_time ? String(row.slot_time).slice(0, 5) : '',
    capacity: Number(row.capacity || 0)
  };
}

async function getOperationalSettingsPayload() {
  const serviceTypes = await query(`
    SELECT sc.*, pt.name AS pet_type_name, ps.name AS pet_size_name
    FROM service_categories sc
    LEFT JOIN pet_types pt ON pt.code = sc.pet_type_code
    LEFT JOIN pet_sizes ps ON ps.code = sc.pet_size_code
    WHERE sc.deleted_at IS NULL
    ORDER BY sc.sort_order ASC, sc.name ASC
  `);
  const appointmentStatuses = await query(`SELECT * FROM appointment_statuses WHERE deleted_at IS NULL ORDER BY sort_order ASC, name ASC`);
  const paymentStatuses = await query(`SELECT * FROM payment_statuses WHERE deleted_at IS NULL ORDER BY sort_order ASC, name ASC`);
  const paymentMethods = await query(`SELECT * FROM payment_methods WHERE deleted_at IS NULL ORDER BY sort_order ASC, name ASC`);
  const hours = await query(`SELECT * FROM business_hours ORDER BY weekday ASC`);
  const slots = await query(`
    SELECT tsc.*
    FROM time_slot_capacities tsc
    INNER JOIN business_hours bh ON bh.weekday = tsc.weekday
    WHERE bh.is_open = TRUE
      AND tsc.slot_time >= bh.opens_at
      AND tsc.slot_time < bh.closes_at
      AND EXTRACT(MINUTE FROM tsc.slot_time)::int = 0
    ORDER BY tsc.weekday ASC, tsc.slot_time ASC
  `);
  return {
    serviceTypes: serviceTypes.rows.map(sanitizeServiceType),
    appointmentStatuses: appointmentStatuses.rows.map(sanitizeAppointmentStatus),
    paymentStatuses: paymentStatuses.rows.map(sanitizePaymentStatus),
    paymentMethods: paymentMethods.rows.map(sanitizePaymentMethod),
    businessHours: hours.rows.map(sanitizeBusinessHour),
    timeSlotCapacities: slots.rows.map(sanitizeTimeSlot),
    slotPolicy: { intervalMinutes: 60, unit: 'hour', description: 'Limite de agendamentos por hora e por dia da semana.' }
  };
}

async function getPetOptionsPayload({ activeOnly = false } = {}) {
  const activeClause = activeOnly ? 'WHERE is_active = TRUE' : '';
  const types = await query(`SELECT * FROM pet_types ${activeClause} ORDER BY sort_order ASC, name ASC`);
  const sizes = await query(`SELECT * FROM pet_sizes ${activeClause} ORDER BY sort_order ASC, name ASC`);
  const breeds = await query(`
    SELECT b.*, pt.name AS pet_type_name, pt.code AS pet_type_code
    FROM pet_breeds b
    LEFT JOIN pet_types pt ON pt.id = b.pet_type_id
    ${activeOnly ? 'WHERE b.is_active = TRUE' : ''}
    ORDER BY COALESCE(pt.sort_order, 999), b.sort_order ASC, b.name ASC
  `);
  return { types: types.rows.map(sanitizePetType), sizes: sizes.rows.map(sanitizePetSize), breeds: breeds.rows.map(sanitizePetBreed) };
}

function sanitizePet(pet = {}) {
  return {
    id: pet.id,
    tutorId: pet.tutor_id,
    tutorName: pet.tutor_name,
    tutorWhatsapp: pet.tutor_whatsapp,
    name: pet.name,
    photoUrl: pet.photo_url || pet.photoUrl || null,
    species: pet.species,
    breed: pet.breed,
    size: pet.size,
    coatType: pet.coat_type,
    birthDate: pet.birth_date,
    weightKg: pet.weight_kg === null || pet.weight_kg === undefined ? null : Number(pet.weight_kg),
    preferences: pet.preferences,
    restrictions: pet.restrictions,
    notes: pet.notes,
    status: pet.status,
    createdAt: pet.created_at,
    updatedAt: pet.updated_at
  };
}

async function getTutorById(id) {
  const result = await query(`
    SELECT t.*,
           COUNT(DISTINCT p.id) FILTER (WHERE p.deleted_at IS NULL)::int AS pets_count,
           COALESCE(MAX(a.starts_at), NULL) AS last_appointment_at
    FROM tutors t
    LEFT JOIN pets p ON p.tutor_id = t.id AND p.deleted_at IS NULL
    LEFT JOIN appointments a ON a.tutor_id = t.id AND a.deleted_at IS NULL
    WHERE t.id = $1
      AND t.deleted_at IS NULL
    GROUP BY t.id
    LIMIT 1
  `, [id]);
  return result.rows[0] || null;
}

async function getPetById(id) {
  const result = await query(`
    SELECT p.*, t.name AS tutor_name, t.whatsapp AS tutor_whatsapp
    FROM pets p
    INNER JOIN tutors t ON t.id = p.tutor_id AND t.deleted_at IS NULL
    WHERE p.id = $1
      AND p.deleted_at IS NULL
    LIMIT 1
  `, [id]);
  return result.rows[0] || null;
}


app.get('/api/public/site', async (req, res, next) => {
  try {
    const business = await getBusinessSettingsRow();
    if (!business) return res.status(404).json({ error: 'Configurações da loja não encontradas.' });
    const payload = sanitizeBusiness(business);

    const [servicesResult, hoursResult, packagesResult, petSizesResult] = await Promise.all([
      query(`
        SELECT s.id, s.name, s.description, s.pet_size, s.price_cents, s.duration_minutes,
               sc.name AS category_name, ps.name AS pet_size_name, ps.sort_order AS pet_size_sort
        FROM services s
        LEFT JOIN service_categories sc ON sc.id = s.category_id
        LEFT JOIN pet_sizes ps ON ps.code = s.pet_size
        WHERE s.deleted_at IS NULL AND s.is_active = TRUE
        ORDER BY COALESCE(ps.sort_order, 999), sc.sort_order ASC NULLS LAST, sc.name ASC NULLS LAST, s.name ASC
        LIMIT 48
      `).catch(() => ({ rows: [] })),
      query(`
        SELECT *
        FROM business_hours
        ORDER BY weekday ASC
      `).catch(() => ({ rows: [] })),
      query(`
        SELECT id, name, description, sessions_count, price_cents, discount_percent, recurrence_interval_days
        FROM packages
        WHERE deleted_at IS NULL AND is_active = TRUE
        ORDER BY price_cents ASC, name ASC
        LIMIT 3
      `).catch(() => ({ rows: [] })),
      query(`SELECT * FROM pet_sizes WHERE is_active = TRUE ORDER BY sort_order ASC, name ASC`).catch(() => ({ rows: [] }))
    ]);

    res.json({
      business: payload,
      seo: {
        title: payload.seoTitle || `${payload.businessName || 'PetFunny - Banho e Tosa'} em ${payload.addressCity || 'Ribeirão Preto'} · Banho e Tosa premium`,
        description: payload.seoDescription || 'Banho e tosa premium em Ribeirão Preto com agendamento pelo app, pacotes, roleta de mimos e acompanhamento do tutor em tempo real.',
        keywords: payload.seoKeywords || 'banho e tosa, pet shop, Ribeirão Preto, PetFunny, app do tutor, agendamento pet',
        imageUrl: payload.seoImageUrl || '/assets/img/logo-petfunny-full.png'
      },
      services: servicesResult.rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        categoryName: row.category_name,
        petSize: row.pet_size,
        petSizeName: row.pet_size_name,
        priceCents: Number(row.price_cents || 0),
        durationMinutes: Number(row.duration_minutes || 0)
      })),
      packages: packagesResult.rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        sessionsCount: Number(row.sessions_count || 0),
        priceCents: Number(row.price_cents || 0),
        discountPercent: Number(row.discount_percent || 0),
        recurrenceIntervalDays: Number(row.recurrence_interval_days || 0)
      })),
      businessHours: hoursResult.rows.map(sanitizeBusinessHour),
      petSizes: petSizesResult.rows.map(sanitizePetSize),
      ctas: {
        appUrl: '/app/login',
        whatsappUrl: `https://wa.me/${String(payload.whatsapp || env.petfunnyWhatsapp || '5516981535338').replace(/\D/g, '')}?text=${encodeURIComponent('Oi PetFunny! Quero agendar um horário para meu pet.')}`
      },
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/configuracoes', requireAuth, async (req, res, next) => {
  try {
    const business = await getBusinessSettingsRow();
    const petOptions = await getPetOptionsPayload();
    const operational = await getOperationalSettingsPayload();
    res.json({ business: business ? sanitizeBusiness(business) : null, petOptions, operational });
  } catch (error) {
    next(error);
  }
});

app.put('/api/configuracoes/business', requireAuth, async (req, res, next) => {
  try {
    const body = req.body || {};
    const socialLinks = {
      instagram: cleanText(body.instagramUrl),
      facebook: cleanText(body.facebookUrl),
      tiktok: cleanText(body.tiktokUrl),
      googleBusiness: cleanText(body.googleBusinessUrl),
      maps: cleanText(body.mapsUrl)
    };
    const seoSettings = {
      title: cleanText(body.seoTitle),
      description: cleanText(body.seoDescription),
      keywords: cleanText(body.seoKeywords),
      imageUrl: cleanText(body.seoImageUrl)
    };

    const result = await query(`
      UPDATE business_settings
      SET business_name = COALESCE($1::text, business_name),
          legal_name = $2::text,
          document_number = $3::text,
          whatsapp = COALESCE($4::text, whatsapp),
          phone = $5::text,
          email = $6::text,
          address_street = $7::text,
          address_number = $8::text,
          address_neighborhood = $9::text,
          address_city = COALESCE($10::text, address_city),
          address_state = COALESCE($11::text, address_state),
          address_zipcode = $12::text,
          website_url = $13::text,
          instagram_url = $14::text,
          facebook_url = $15::text,
          tiktok_url = $16::text,
          google_business_url = $17::text,
          maps_url = $18::text,
          social_links = $19::jsonb,
          seo_title = $20::text,
          seo_description = $21::text,
          seo_keywords = $22::text,
          seo_image_url = $23::text,
          seo_settings = $24::jsonb,
          landing_headline = $25::text,
          landing_subheadline = $26::text,
          updated_at = NOW()
      WHERE id = (SELECT id FROM business_settings ORDER BY created_at ASC LIMIT 1)
      RETURNING *
    `, [
      cleanText(body.businessName), cleanText(body.legalName), cleanText(body.documentNumber), normalizeWhatsapp(body.whatsapp), cleanText(body.phone), cleanText(body.email),
      cleanText(body.addressStreet), cleanText(body.addressNumber), cleanText(body.addressNeighborhood), cleanText(body.addressCity), cleanText(body.addressState), cleanText(body.addressZipcode),
      cleanText(body.websiteUrl), cleanText(body.instagramUrl), cleanText(body.facebookUrl), cleanText(body.tiktokUrl), cleanText(body.googleBusinessUrl), cleanText(body.mapsUrl), JSON.stringify(socialLinks),
      cleanText(body.seoTitle), cleanText(body.seoDescription), cleanText(body.seoKeywords), cleanText(body.seoImageUrl), JSON.stringify(seoSettings), cleanText(body.landingHeadline), cleanText(body.landingSubheadline)
    ]);

    if (!result.rows[0]) return res.status(404).json({ error: 'Configurações do comércio não encontradas.' });
    await query('INSERT INTO audit_logs (user_id, action, entity, entity_id, metadata) VALUES ($1, $2, $3, $4, $5::jsonb)', [req.user.id, 'config.business.update', 'business_settings', result.rows[0].id, JSON.stringify({ source: 'admin' })]);
    res.json({ business: sanitizeBusiness(result.rows[0]) });
  } catch (error) {
    next(error);
  }
});


app.get('/api/configuracoes/operational', requireAuth, async (req, res, next) => {
  try {
    res.json(await getOperationalSettingsPayload());
  } catch (error) { next(error); }
});

app.post('/api/configuracoes/service-types', requireAuth, async (req, res, next) => {
  try {
    const name = cleanText(req.body?.name);
    if (!name) return res.status(400).json({ error: 'Informe o nome do tipo de serviço.' });
    const result = await query(`
      INSERT INTO service_categories (name, description, sort_order, is_active, pet_type_code, pet_size_code)
      VALUES ($1::text, $2::text, $3::integer, $4::boolean, NULLIF($5::text, ''), NULLIF($6::text, ''))
      ON CONFLICT (name) DO UPDATE
      SET description = EXCLUDED.description,
          sort_order = EXCLUDED.sort_order,
          is_active = EXCLUDED.is_active,
          pet_type_code = EXCLUDED.pet_type_code,
          pet_size_code = EXCLUDED.pet_size_code,
          deleted_at = NULL,
          updated_at = NOW()
      RETURNING *
    `, [name, cleanText(req.body?.description), Number(req.body?.sortOrder || 0), parseBool(req.body?.isActive, true)]);
    res.status(201).json({ serviceType: sanitizeServiceType(result.rows[0]) });
  } catch (error) { next(error); }
});

app.put('/api/configuracoes/service-types/:id', requireAuth, async (req, res, next) => {
  try {
    const name = cleanText(req.body?.name);
    if (!name) return res.status(400).json({ error: 'Informe o nome do tipo de serviço.' });
    const result = await query(`
      UPDATE service_categories
      SET name = $1::text,
          description = $2::text,
          sort_order = $3::integer,
          is_active = $4::boolean,
          pet_type_code = NULLIF($5::text, ''),
          pet_size_code = NULLIF($6::text, ''),
          updated_at = NOW()
      WHERE id = $7::uuid
        AND deleted_at IS NULL
      RETURNING *
    `, [name, cleanText(req.body?.description), Number(req.body?.sortOrder || 0), parseBool(req.body?.isActive, true), req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Tipo de serviço não encontrado.' });
    res.json({ serviceType: sanitizeServiceType(result.rows[0]) });
  } catch (error) { next(error); }
});

app.delete('/api/configuracoes/service-types/:id', requireAuth, async (req, res, next) => {
  try {
    await query('UPDATE service_categories SET is_active = FALSE, deleted_at = NOW(), updated_at = NOW() WHERE id = $1::uuid', [req.params.id]);
    res.json({ ok: true });
  } catch (error) { next(error); }
});


app.post('/api/configuracoes/appointment-statuses', requireAuth, async (req, res, next) => {
  try {
    const name = cleanText(req.body?.name);
    const code = normalizeCode(req.body?.code || name);
    if (!name || !code) return res.status(400).json({ error: 'Informe o nome e o código do status da agenda.' });
    const result = await query(`
      INSERT INTO appointment_statuses (code, name, description, color, sort_order, is_active, is_final, blocks_slot)
      VALUES ($1::text, $2::text, $3::text, $4::text, $5::integer, $6::boolean, $7::boolean, $8::boolean)
      ON CONFLICT (code) DO UPDATE
      SET name = EXCLUDED.name,
          description = EXCLUDED.description,
          color = EXCLUDED.color,
          sort_order = EXCLUDED.sort_order,
          is_active = EXCLUDED.is_active,
          is_final = EXCLUDED.is_final,
          blocks_slot = EXCLUDED.blocks_slot,
          deleted_at = NULL,
          updated_at = NOW()
      RETURNING *
    `, [code, name, cleanText(req.body?.description), cleanText(req.body?.color) || '#00A9B7', Number(req.body?.sortOrder || 0), parseBool(req.body?.isActive, true), parseBool(req.body?.isFinal, false), parseBool(req.body?.blocksSlot, true)]);
    res.status(201).json({ appointmentStatus: sanitizeAppointmentStatus(result.rows[0]) });
  } catch (error) { next(error); }
});

app.put('/api/configuracoes/appointment-statuses/:id', requireAuth, async (req, res, next) => {
  try {
    const name = cleanText(req.body?.name);
    const code = normalizeCode(req.body?.code || name);
    if (!name || !code) return res.status(400).json({ error: 'Informe o nome e o código do status da agenda.' });
    const result = await query(`
      UPDATE appointment_statuses
      SET code = $1::text,
          name = $2::text,
          description = $3::text,
          color = $4::text,
          sort_order = $5::integer,
          is_active = $6::boolean,
          is_final = $7::boolean,
          blocks_slot = $8::boolean,
          updated_at = NOW()
      WHERE id = $9::uuid
        AND deleted_at IS NULL
      RETURNING *
    `, [code, name, cleanText(req.body?.description), cleanText(req.body?.color) || '#00A9B7', Number(req.body?.sortOrder || 0), parseBool(req.body?.isActive, true), parseBool(req.body?.isFinal, false), parseBool(req.body?.blocksSlot, true), req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Status da agenda não encontrado.' });
    res.json({ appointmentStatus: sanitizeAppointmentStatus(result.rows[0]) });
  } catch (error) { next(error); }
});

app.delete('/api/configuracoes/appointment-statuses/:id', requireAuth, async (req, res, next) => {
  try {
    await query('UPDATE appointment_statuses SET is_active = FALSE, deleted_at = NOW(), updated_at = NOW() WHERE id = $1::uuid', [req.params.id]);
    res.json({ ok: true });
  } catch (error) { next(error); }
});


app.post('/api/configuracoes/payment-statuses', requireAuth, async (req, res, next) => {
  try {
    const name = cleanText(req.body?.name);
    const code = normalizeCode(req.body?.code || name);
    if (!name || !code) return res.status(400).json({ error: 'Informe o nome e o código do status de pagamento.' });
    const result = await query(`
      INSERT INTO payment_statuses (code, name, description, color, sort_order, is_active)
      VALUES ($1::text, $2::text, $3::text, $4::text, $5::integer, $6::boolean)
      ON CONFLICT (code) DO UPDATE
      SET name = EXCLUDED.name,
          description = EXCLUDED.description,
          color = EXCLUDED.color,
          sort_order = EXCLUDED.sort_order,
          is_active = EXCLUDED.is_active,
          deleted_at = NULL,
          updated_at = NOW()
      RETURNING *
    `, [code, name, cleanText(req.body?.description), cleanText(req.body?.color) || '#00A9B7', Number(req.body?.sortOrder || 0), parseBool(req.body?.isActive, true)]);
    res.status(201).json({ paymentStatus: sanitizePaymentStatus(result.rows[0]) });
  } catch (error) { next(error); }
});

app.put('/api/configuracoes/payment-statuses/:id', requireAuth, async (req, res, next) => {
  try {
    const name = cleanText(req.body?.name);
    const code = normalizeCode(req.body?.code || name);
    if (!name || !code) return res.status(400).json({ error: 'Informe o nome e o código do status de pagamento.' });
    const result = await query(`
      UPDATE payment_statuses
      SET code = $1::text,
          name = $2::text,
          description = $3::text,
          color = $4::text,
          sort_order = $5::integer,
          is_active = $6::boolean,
          updated_at = NOW()
      WHERE id = $7::uuid
        AND deleted_at IS NULL
      RETURNING *
    `, [code, name, cleanText(req.body?.description), cleanText(req.body?.color) || '#00A9B7', Number(req.body?.sortOrder || 0), parseBool(req.body?.isActive, true), req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Status de pagamento não encontrado.' });
    res.json({ paymentStatus: sanitizePaymentStatus(result.rows[0]) });
  } catch (error) { next(error); }
});

app.delete('/api/configuracoes/payment-statuses/:id', requireAuth, async (req, res, next) => {
  try {
    await query('UPDATE payment_statuses SET is_active = FALSE, deleted_at = NOW(), updated_at = NOW() WHERE id = $1::uuid', [req.params.id]);
    res.json({ ok: true });
  } catch (error) { next(error); }
});

app.post('/api/configuracoes/payment-methods', requireAuth, async (req, res, next) => {
  try {
    const name = cleanText(req.body?.name);
    if (!name) return res.status(400).json({ error: 'Informe o nome da forma de pagamento.' });
    const result = await query(`
      INSERT INTO payment_methods (name, description, sort_order, is_active)
      VALUES ($1::text, $2::text, $3::integer, $4::boolean)
      ON CONFLICT (name) DO UPDATE
      SET description = EXCLUDED.description,
          sort_order = EXCLUDED.sort_order,
          is_active = EXCLUDED.is_active,
          deleted_at = NULL,
          updated_at = NOW()
      RETURNING *
    `, [name, cleanText(req.body?.description), Number(req.body?.sortOrder || 0), parseBool(req.body?.isActive, true)]);
    res.status(201).json({ paymentMethod: sanitizePaymentMethod(result.rows[0]) });
  } catch (error) { next(error); }
});

app.put('/api/configuracoes/payment-methods/:id', requireAuth, async (req, res, next) => {
  try {
    const name = cleanText(req.body?.name);
    if (!name) return res.status(400).json({ error: 'Informe o nome da forma de pagamento.' });
    const result = await query(`
      UPDATE payment_methods
      SET name = $1::text,
          description = $2::text,
          sort_order = $3::integer,
          is_active = $4::boolean,
          updated_at = NOW()
      WHERE id = $5::uuid
        AND deleted_at IS NULL
      RETURNING *
    `, [name, cleanText(req.body?.description), Number(req.body?.sortOrder || 0), parseBool(req.body?.isActive, true), req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Forma de pagamento não encontrada.' });
    res.json({ paymentMethod: sanitizePaymentMethod(result.rows[0]) });
  } catch (error) { next(error); }
});

app.delete('/api/configuracoes/payment-methods/:id', requireAuth, async (req, res, next) => {
  try {
    await query('UPDATE payment_methods SET is_active = FALSE, deleted_at = NOW(), updated_at = NOW() WHERE id = $1::uuid', [req.params.id]);
    res.json({ ok: true });
  } catch (error) { next(error); }
});

app.put('/api/configuracoes/business-hours', requireAuth, async (req, res, next) => {
  try {
    const days = Array.isArray(req.body?.days) ? req.body.days : [];
    if (!days.length) return res.status(400).json({ error: 'Envie os dias de funcionamento.' });

    await query('BEGIN');
    try {
      for (const day of days) {
        const weekday = Number(day.weekday);
        if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) continue;
        const isOpen = parseBool(day.isOpen, true);
        const opensAt = isOpen ? cleanTime(day.opensAt, '08:00:00') : null;
        const closesAt = isOpen ? cleanTime(day.closesAt, '18:00:00') : null;
        await query(`
          INSERT INTO business_hours (weekday, opens_at, closes_at, is_open)
          VALUES ($1::smallint, $2::time, $3::time, $4::boolean)
          ON CONFLICT (weekday) DO UPDATE
          SET opens_at = EXCLUDED.opens_at,
              closes_at = EXCLUDED.closes_at,
              is_open = EXCLUDED.is_open,
              updated_at = NOW()
        `, [weekday, opensAt, closesAt, isOpen]);
      }
      await query('COMMIT');
    } catch (error) {
      await query('ROLLBACK');
      throw error;
    }

    res.json(await getOperationalSettingsPayload());
  } catch (error) { next(error); }
});

app.put('/api/configuracoes/time-slots', requireAuth, async (req, res, next) => {
  try {
    const slots = Array.isArray(req.body?.slots) ? req.body.slots : [];
    if (!slots.length) return res.status(400).json({ error: 'Envie os slots por hora.' });

    await query('BEGIN');
    try {
      for (const slot of slots) {
        const weekday = Number(slot.weekday);
        const slotTime = normalizeHour(slot.slotTime);
        const capacity = Math.max(0, Number.parseInt(slot.capacity, 10) || 0);
        if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6 || !slotTime) continue;
        await query(`
          INSERT INTO time_slot_capacities (weekday, slot_time, capacity)
          VALUES ($1::smallint, $2::time, $3::integer)
          ON CONFLICT (weekday, slot_time) DO UPDATE
          SET capacity = EXCLUDED.capacity,
              updated_at = NOW()
        `, [weekday, slotTime, capacity]);
      }
      await query('COMMIT');
    } catch (error) {
      await query('ROLLBACK');
      throw error;
    }

    res.json(await getOperationalSettingsPayload());
  } catch (error) { next(error); }
});

app.get('/api/configuracoes/pet-options', requireAuth, async (req, res, next) => {
  try {
    res.json(await getPetOptionsPayload({ activeOnly: req.query.activeOnly === 'true' }));
  } catch (error) { next(error); }
});

app.post('/api/configuracoes/pet-types', requireAuth, async (req, res, next) => {
  try {
    const name = cleanText(req.body?.name);
    if (!name) return res.status(400).json({ error: 'Informe o nome do tipo de pet.' });
    const code = normalizeCode(req.body?.code || name);
    const result = await query(`
      INSERT INTO pet_types (code, name, description, sort_order, is_active)
      VALUES ($1, $2, $3, $4::int, $5::boolean)
      ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active, updated_at = NOW()
      RETURNING *
    `, [code, name, cleanText(req.body?.description), Number(req.body?.sortOrder || 0), parseBool(req.body?.isActive, true)]);
    res.status(201).json({ item: sanitizePetType(result.rows[0]) });
  } catch (error) { next(error); }
});

app.put('/api/configuracoes/pet-types/:id', requireAuth, async (req, res, next) => {
  try {
    const name = cleanText(req.body?.name);
    if (!name) return res.status(400).json({ error: 'Informe o nome do tipo de pet.' });
    const code = normalizeCode(req.body?.code || name);
    const result = await query(`UPDATE pet_types SET code=$1, name=$2, description=$3, sort_order=$4::int, is_active=$5::boolean, updated_at=NOW() WHERE id=$6 RETURNING *`, [code, name, cleanText(req.body?.description), Number(req.body?.sortOrder || 0), parseBool(req.body?.isActive, true), req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Tipo de pet não encontrado.' });
    res.json({ item: sanitizePetType(result.rows[0]) });
  } catch (error) { next(error); }
});

app.delete('/api/configuracoes/pet-types/:id', requireAuth, async (req, res, next) => {
  try {
    const result = await query('UPDATE pet_types SET is_active = FALSE, updated_at = NOW() WHERE id = $1 RETURNING *', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Tipo de pet não encontrado.' });
    res.json({ item: sanitizePetType(result.rows[0]) });
  } catch (error) { next(error); }
});

app.post('/api/configuracoes/pet-sizes', requireAuth, async (req, res, next) => {
  try {
    const name = cleanText(req.body?.name);
    if (!name) return res.status(400).json({ error: 'Informe o nome do porte.' });
    const code = normalizeCode(req.body?.code || name);
    const result = await query(`
      INSERT INTO pet_sizes (code, name, description, min_weight_kg, max_weight_kg, sort_order, is_active)
      VALUES ($1, $2, $3, $4::numeric, $5::numeric, $6::int, $7::boolean)
      ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description, min_weight_kg=EXCLUDED.min_weight_kg, max_weight_kg=EXCLUDED.max_weight_kg, sort_order=EXCLUDED.sort_order, is_active=EXCLUDED.is_active, updated_at=NOW()
      RETURNING *
    `, [code, name, cleanText(req.body?.description), req.body?.minWeightKg || null, req.body?.maxWeightKg || null, Number(req.body?.sortOrder || 0), parseBool(req.body?.isActive, true)]);
    res.status(201).json({ item: sanitizePetSize(result.rows[0]) });
  } catch (error) { next(error); }
});

app.put('/api/configuracoes/pet-sizes/:id', requireAuth, async (req, res, next) => {
  try {
    const name = cleanText(req.body?.name);
    if (!name) return res.status(400).json({ error: 'Informe o nome do porte.' });
    const code = normalizeCode(req.body?.code || name);
    const result = await query(`UPDATE pet_sizes SET code=$1, name=$2, description=$3, min_weight_kg=$4::numeric, max_weight_kg=$5::numeric, sort_order=$6::int, is_active=$7::boolean, updated_at=NOW() WHERE id=$8 RETURNING *`, [code, name, cleanText(req.body?.description), req.body?.minWeightKg || null, req.body?.maxWeightKg || null, Number(req.body?.sortOrder || 0), parseBool(req.body?.isActive, true), req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Porte não encontrado.' });
    res.json({ item: sanitizePetSize(result.rows[0]) });
  } catch (error) { next(error); }
});

app.delete('/api/configuracoes/pet-sizes/:id', requireAuth, async (req, res, next) => {
  try {
    const result = await query('UPDATE pet_sizes SET is_active = FALSE, updated_at = NOW() WHERE id = $1 RETURNING *', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Porte não encontrado.' });
    res.json({ item: sanitizePetSize(result.rows[0]) });
  } catch (error) { next(error); }
});

app.post('/api/configuracoes/pet-breeds', requireAuth, async (req, res, next) => {
  try {
    const name = cleanText(req.body?.name);
    if (!name) return res.status(400).json({ error: 'Informe o nome da raça.' });
    const result = await query(`
      INSERT INTO pet_breeds (pet_type_id, name, suggested_size_code, coat_type, sort_order, is_active)
      VALUES ($1::uuid, $2, $3, $4, $5::int, $6::boolean)
      ON CONFLICT (pet_type_id, name) DO UPDATE SET suggested_size_code=EXCLUDED.suggested_size_code, coat_type=EXCLUDED.coat_type, sort_order=EXCLUDED.sort_order, is_active=EXCLUDED.is_active, updated_at=NOW()
      RETURNING *
    `, [req.body?.petTypeId, name, cleanText(req.body?.suggestedSizeCode), cleanText(req.body?.coatType), Number(req.body?.sortOrder || 0), parseBool(req.body?.isActive, true)]);
    const enriched = await query('SELECT b.*, pt.name AS pet_type_name, pt.code AS pet_type_code FROM pet_breeds b LEFT JOIN pet_types pt ON pt.id=b.pet_type_id WHERE b.id=$1', [result.rows[0].id]);
    res.status(201).json({ item: sanitizePetBreed(enriched.rows[0]) });
  } catch (error) { next(error); }
});

app.put('/api/configuracoes/pet-breeds/:id', requireAuth, async (req, res, next) => {
  try {
    const name = cleanText(req.body?.name);
    if (!name) return res.status(400).json({ error: 'Informe o nome da raça.' });
    const result = await query(`UPDATE pet_breeds SET pet_type_id=$1::uuid, name=$2, suggested_size_code=$3, coat_type=$4, sort_order=$5::int, is_active=$6::boolean, updated_at=NOW() WHERE id=$7 RETURNING *`, [req.body?.petTypeId, name, cleanText(req.body?.suggestedSizeCode), cleanText(req.body?.coatType), Number(req.body?.sortOrder || 0), parseBool(req.body?.isActive, true), req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Raça não encontrada.' });
    const enriched = await query('SELECT b.*, pt.name AS pet_type_name, pt.code AS pet_type_code FROM pet_breeds b LEFT JOIN pet_types pt ON pt.id=b.pet_type_id WHERE b.id=$1', [result.rows[0].id]);
    res.json({ item: sanitizePetBreed(enriched.rows[0]) });
  } catch (error) { next(error); }
});

app.delete('/api/configuracoes/pet-breeds/:id', requireAuth, async (req, res, next) => {
  try {
    const result = await query('UPDATE pet_breeds SET is_active = FALSE, updated_at = NOW() WHERE id = $1 RETURNING *', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Raça não encontrada.' });
    res.json({ ok: true });
  } catch (error) { next(error); }
});

app.get('/api/tutores', requireAuth, async (req, res, next) => {
  try {
    const search = cleanText(req.query.search);
    const status = cleanText(req.query.status) || 'active';
    const limit = parseLimit(req.query.limit, 20);
    const offset = parseOffset(req.query.page, limit);
    const params = [];
    const where = ['t.deleted_at IS NULL'];

    if (status !== 'all') {
      params.push(status);
      where.push(`t.status = $${params.length}`);
    }

    if (search) {
      const term = `%${search.replace(/\s+/g, '%')}%`;
      const whatsappDigits = normalizeWhatsapp(search);
      params.push(term);
      const termIndex = params.length;
      const searchSql = [`unaccent(lower(t.name)) ILIKE unaccent(lower($${termIndex}))`, `lower(COALESCE(t.email,'')) ILIKE lower($${termIndex})`];
      if (whatsappDigits) {
        params.push(`%${whatsappDigits}%`);
        searchSql.push(`regexp_replace(COALESCE(t.whatsapp,''), '\D', '', 'g') ILIKE $${params.length}`);
        searchSql.push(`regexp_replace(COALESCE(t.phone,''), '\D', '', 'g') ILIKE $${params.length}`);
      }
      where.push(`(${searchSql.join(' OR ')})`);
    }

    const filterParams = [...params];
    params.push(limit);
    params.push(offset);

    const result = await query(`
      SELECT t.id, t.name, t.whatsapp, t.phone, t.email, t.document_number, t.address, t.address_number, t.address_neighborhood, t.address_zipcode, t.city, t.state, t.photo_url,
             t.tags, t.notes, t.status, t.created_at, t.updated_at,
             COUNT(DISTINCT p.id) FILTER (WHERE p.deleted_at IS NULL)::int AS pets_count,
             COUNT(DISTINCT a.id) FILTER (WHERE a.deleted_at IS NULL)::int AS appointments_count,
             (
               SELECT COUNT(*)::int
               FROM crm_interactions ci
               LEFT JOIN crm_leads cl ON cl.id = ci.lead_id
               WHERE COALESCE(ci.tutor_id, cl.tutor_id) = t.id
                 AND COALESCE(lower(ci.direction), 'outbound') IN ('outbound','sent','enviada','enviado')
             ) AS sent_messages_count,
             (
               SELECT MAX(ci.occurred_at)
               FROM crm_interactions ci
               LEFT JOIN crm_leads cl ON cl.id = ci.lead_id
               WHERE COALESCE(ci.tutor_id, cl.tutor_id) = t.id
                 AND COALESCE(lower(ci.direction), 'outbound') IN ('outbound','sent','enviada','enviado')
             ) AS last_message_at,
             COALESCE(MAX(a.starts_at), NULL) AS last_appointment_at,
             (
               SELECT p_last.name
               FROM pets p_last
               WHERE p_last.tutor_id = t.id AND p_last.deleted_at IS NULL
               ORDER BY p_last.created_at DESC, p_last.updated_at DESC
               LIMIT 1
             ) AS last_pet_name,
             CASE
               WHEN COUNT(DISTINCT a.id) FILTER (WHERE a.deleted_at IS NULL) = 0 THEN NULL
               ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - MAX(a.starts_at))) / 86400))::int
             END AS days_without_appointment,
             CASE
               WHEN COUNT(DISTINCT a.id) FILTER (WHERE a.deleted_at IS NULL) = 0 THEN 'novo_lead'
               WHEN COUNT(DISTINCT a.id) FILTER (WHERE a.deleted_at IS NULL) >= 3 AND GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - MAX(a.starts_at))) / 86400))::int <= 45 THEN 'recorrente'
               WHEN GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - MAX(a.starts_at))) / 86400))::int <= 30 THEN 'ativo'
               WHEN GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - MAX(a.starts_at))) / 86400))::int BETWEEN 46 AND 60 THEN 'em_atencao'
               WHEN GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - MAX(a.starts_at))) / 86400))::int BETWEEN 61 AND 90 THEN 'em_risco'
               ELSE 'perdido'
             END AS crm_status
      FROM tutors t
      LEFT JOIN pets p ON p.tutor_id = t.id AND p.deleted_at IS NULL
      LEFT JOIN appointments a ON a.tutor_id = t.id AND a.deleted_at IS NULL
      WHERE ${where.join(' AND ')}
      GROUP BY t.id
      ORDER BY t.updated_at DESC, t.name ASC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    const totalResult = await query(`SELECT COUNT(*)::int AS total FROM tutors t WHERE ${where.join(' AND ')}`, filterParams);
    const statsResult = await query(`
      WITH tutor_activity AS (
        SELECT
          t.id,
          t.status,
          MAX(a.starts_at) AS last_appointment_at,
          COUNT(a.id)::int AS appointments_count
        FROM tutors t
        LEFT JOIN appointments a ON a.tutor_id = t.id AND a.deleted_at IS NULL
        WHERE ${where.join(' AND ')}
        GROUP BY t.id, t.status
      )
      SELECT
        COUNT(DISTINCT ta.id)::int AS total_tutors,
        COUNT(DISTINCT ta.id) FILTER (WHERE ta.status = 'active')::int AS active_tutors,
        (SELECT COUNT(DISTINCT p.id)::int FROM pets p INNER JOIN tutors t2 ON t2.id = p.tutor_id WHERE p.deleted_at IS NULL AND t2.deleted_at IS NULL) AS pets_count,
        COALESCE(MAX(ta.last_appointment_at), NULL) AS last_appointment_at,
        COUNT(DISTINCT ta.id) FILTER (WHERE ta.appointments_count = 0)::int AS new_leads,
        COUNT(DISTINCT ta.id) FILTER (WHERE ta.appointments_count > 0 AND GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - ta.last_appointment_at)) / 86400))::int BETWEEN 61 AND 90)::int AS at_risk_tutors,
        COUNT(DISTINCT ta.id) FILTER (WHERE ta.appointments_count > 0 AND GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - ta.last_appointment_at)) / 86400))::int > 90)::int AS lost_tutors
      FROM tutor_activity ta
    `, filterParams);
    const stats = statsResult.rows[0] || {};

    res.json({
      items: result.rows.map((row) => ({
        ...sanitizeTutor(row),
        phone: row.phone,
        documentNumber: row.document_number,
        address: row.address,
        status: row.status,
        notes: row.notes,
        petsCount: Number(row.pets_count || 0),
        appointmentsCount: Number(row.appointments_count || 0),
        sentMessagesCount: Number(row.sent_messages_count || 0),
        lastMessageAt: row.last_message_at || null,
        lastAppointmentAt: row.last_appointment_at,
        lastPetName: row.last_pet_name || null,
        daysWithoutAppointment: row.days_without_appointment === null || row.days_without_appointment === undefined ? null : Number(row.days_without_appointment),
        crmStatus: row.crm_status || 'novo_lead',
        createdAt: row.created_at,
        updatedAt: row.updated_at
      })),
      page: Number(req.query.page || 1),
      limit,
      total: Number(totalResult.rows[0]?.total || 0),
      stats: {
        totalTutors: Number(stats.total_tutors || 0),
        activeTutors: Number(stats.active_tutors || 0),
        petsCount: Number(stats.pets_count || 0),
        lastAppointmentAt: stats.last_appointment_at || null,
        newLeads: Number(stats.new_leads || 0),
        atRiskTutors: Number(stats.at_risk_tutors || 0),
        lostTutors: Number(stats.lost_tutors || 0)
      }
    });
  } catch (error) {
    next(error);
  }
});


app.get('/api/tutores/check-whatsapp', requireAuth, async (req, res, next) => {
  try {
    const whatsapp = normalizeWhatsapp(req.query.whatsapp);
    const excludeId = cleanText(req.query.excludeId);
    if (!whatsapp || whatsapp.length < 10) {
      return res.json({ exists: false, tutor: null });
    }

    const params = [whatsapp];
    let excludeSql = '';
    if (excludeId) {
      params.push(excludeId);
      excludeSql = ` AND id <> $${params.length}::uuid`;
    }

    const result = await query(`
      SELECT id, name, whatsapp, email, status, photo_url, created_at, updated_at
      FROM tutors
      WHERE deleted_at IS NULL
        AND whatsapp = $1
        ${excludeSql}
      LIMIT 1
    `, params);

    const tutor = result.rows[0] || null;
    res.json({
      exists: Boolean(tutor),
      tutor: tutor ? {
        ...sanitizeTutor(tutor),
        status: tutor.status,
        createdAt: tutor.created_at,
        updatedAt: tutor.updated_at
      } : null
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/tutores/:id', requireAuth, async (req, res, next) => {
  try {
    const tutor = await getTutorById(req.params.id);
    if (!tutor) return res.status(404).json({ error: 'Tutor não encontrado.' });
    const pets = await query(`
      SELECT p.*, t.name AS tutor_name, t.whatsapp AS tutor_whatsapp
      FROM pets p
      INNER JOIN tutors t ON t.id = p.tutor_id
      WHERE p.tutor_id = $1 AND p.deleted_at IS NULL
      ORDER BY p.name ASC
    `, [req.params.id]);
    res.json({
      tutor: {
        ...sanitizeTutor(tutor),
        phone: tutor.phone,
        documentNumber: tutor.document_number,
        address: tutor.address,
        status: tutor.status,
        notes: tutor.notes,
        petsCount: Number(tutor.pets_count || 0),
        lastAppointmentAt: tutor.last_appointment_at,
        createdAt: tutor.created_at,
        updatedAt: tutor.updated_at
      },
      pets: pets.rows.map(sanitizePet)
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/tutores', requireAuth, async (req, res, next) => {
  try {
    const name = cleanText(req.body.name);
    const whatsapp = normalizeWhatsapp(req.body.whatsapp);
    if (!name) return res.status(400).json({ error: 'Informe o nome do tutor.' });
    if (!whatsapp) return res.status(400).json({ error: 'Informe o WhatsApp do tutor.' });

    const existing = await query('SELECT id, name, whatsapp FROM tutors WHERE whatsapp = $1 AND deleted_at IS NULL LIMIT 1', [whatsapp]);
    if (existing.rows[0]) {
      return res.status(409).json({
        error: 'Já existe um tutor cadastrado com este WhatsApp.',
        tutor: sanitizeTutor(existing.rows[0])
      });
    }

    const result = await query(`
      INSERT INTO tutors (name, whatsapp, phone, email, document_number, address, address_number, address_neighborhood, address_zipcode, city, state, tags, notes, status, photo_url)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10, 'Ribeirão Preto'), COALESCE($11, 'SP'), $12::text[], $13, COALESCE($14, 'active'), $15)
      RETURNING *
    `, [
      name,
      whatsapp,
      cleanText(req.body.phone),
      cleanText(req.body.email),
      cleanText(req.body.documentNumber || req.body.document_number),
      cleanText(req.body.address),
      cleanText(req.body.addressNumber || req.body.address_number),
      cleanText(req.body.addressNeighborhood || req.body.address_neighborhood),
      cleanText(req.body.addressZipcode || req.body.address_zipcode),
      cleanText(req.body.city),
      cleanText(req.body.state),
      parseTags(req.body.tags),
      cleanText(req.body.notes),
      cleanText(req.body.status),
      cleanPhotoDataUrl(req.body.photoDataUrl || req.body.photoUrl)
    ]);

    res.status(201).json({ tutor: sanitizeTutor(result.rows[0]), message: 'Tutor salvo com sucesso.' });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Já existe um tutor cadastrado com este WhatsApp.' });
    next(error);
  }
});

app.put('/api/tutores/:id', requireAuth, async (req, res, next) => {
  try {
    const current = await getTutorById(req.params.id);
    if (!current) return res.status(404).json({ error: 'Tutor não encontrado.' });

    const name = cleanText(req.body.name);
    const whatsapp = normalizeWhatsapp(req.body.whatsapp);
    if (!name) return res.status(400).json({ error: 'Informe o nome do tutor.' });
    if (!whatsapp) return res.status(400).json({ error: 'Informe o WhatsApp do tutor.' });

    const duplicate = await query('SELECT id, name, whatsapp FROM tutors WHERE whatsapp = $1 AND id <> $2::uuid AND deleted_at IS NULL LIMIT 1', [whatsapp, req.params.id]);
    if (duplicate.rows[0]) {
      return res.status(409).json({
        error: 'Já existe outro tutor cadastrado com este WhatsApp.',
        tutor: sanitizeTutor(duplicate.rows[0])
      });
    }

    const result = await query(`
      UPDATE tutors
      SET name = $2,
          whatsapp = $3,
          phone = $4,
          email = $5,
          document_number = $6,
          address = $7,
          address_number = $8,
          address_neighborhood = $9,
          address_zipcode = $10,
          city = COALESCE($11, 'Ribeirão Preto'),
          state = COALESCE($12, 'SP'),
          tags = $13::text[],
          notes = $14,
          status = COALESCE($15, 'active'),
          photo_url = $16,
          updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *
    `, [
      req.params.id,
      name,
      whatsapp,
      cleanText(req.body.phone),
      cleanText(req.body.email),
      cleanText(req.body.documentNumber || req.body.document_number),
      cleanText(req.body.address),
      cleanText(req.body.addressNumber || req.body.address_number),
      cleanText(req.body.addressNeighborhood || req.body.address_neighborhood),
      cleanText(req.body.addressZipcode || req.body.address_zipcode),
      cleanText(req.body.city),
      cleanText(req.body.state),
      parseTags(req.body.tags),
      cleanText(req.body.notes),
      cleanText(req.body.status),
      cleanPhotoDataUrl(req.body.photoDataUrl || req.body.photoUrl)
    ]);

    res.json({ tutor: sanitizeTutor(result.rows[0]), message: 'Tutor atualizado com sucesso.' });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Já existe outro tutor com este WhatsApp.' });
    next(error);
  }
});

app.delete('/api/tutores/:id', requireAuth, async (req, res, next) => {
  try {
    const result = await query(`
      UPDATE tutors
      SET status = 'inactive', updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id, status
    `, [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Tutor não encontrado.' });
    await query(`UPDATE pets SET status = 'inactive', updated_at = NOW() WHERE tutor_id = $1 AND deleted_at IS NULL`, [req.params.id]);
    res.json({ ok: true, status: 'inactive', message: 'Tutor e pets vinculados foram marcados como inativos.' });
  } catch (error) {
    next(error);
  }
});

app.get('/api/tutores/:id/pets', requireAuth, async (req, res, next) => {
  try {
    const result = await query(`
      SELECT p.*, t.name AS tutor_name, t.whatsapp AS tutor_whatsapp
      FROM pets p
      INNER JOIN tutors t ON t.id = p.tutor_id
      WHERE p.tutor_id = $1
        AND p.deleted_at IS NULL
      ORDER BY p.name ASC
    `, [req.params.id]);
    res.json({ items: result.rows.map(sanitizePet) });
  } catch (error) {
    next(error);
  }
});


app.get('/api/tutores/:id/historico', requireAuth, async (req, res, next) => {
  try {
    const tutor = await getTutorById(req.params.id);
    if (!tutor) return res.status(404).json({ error: 'Tutor não encontrado.' });
    const result = await query(`
      SELECT a.*, p.name AS pet_name, p.size AS pet_size,
             s.name AS status_name, s.color AS status_color,
             pm.name AS payment_method_name,
             COALESCE(string_agg(ai.description, ', ' ORDER BY ai.created_at), '') AS services,
             ft.id AS financial_transaction_id,
             ft.status AS financial_status,
             r.public_token AS receipt_token,
             r.document_number AS receipt_number
      FROM appointments a
      LEFT JOIN pets p ON p.id = a.pet_id
      LEFT JOIN appointment_statuses s ON s.code = a.status
      LEFT JOIN payment_methods pm ON pm.id = a.payment_method_id
      LEFT JOIN appointment_items ai ON ai.appointment_id = a.id
      LEFT JOIN financial_transactions ft ON ft.appointment_id = a.id AND ft.deleted_at IS NULL
      LEFT JOIN receipts r ON r.appointment_id = a.id
      WHERE a.tutor_id = $1::uuid AND a.deleted_at IS NULL
      GROUP BY a.id, p.name, p.size, s.name, s.color, pm.name, ft.id, ft.status, r.public_token, r.document_number
      ORDER BY a.starts_at DESC
      LIMIT 120
    `, [req.params.id]);
    res.json({
      tutor: sanitizeTutor(tutor),
      items: result.rows.map((row) => ({
        ...sanitizeAppointment({ ...row, tutor_name: tutor.name, tutor_whatsapp: tutor.whatsapp }),
        financialTransactionId: row.financial_transaction_id || null,
        financialStatus: row.financial_status || null,
        receiptToken: row.receipt_token || null,
        receiptNumber: row.receipt_number || null,
        commandUrl: `/admin/comandas-recibos?appointmentId=${row.id}`,
        receiptUrl: row.receipt_token ? `/documentos/recibo/${row.receipt_token}` : null
      }))
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/pets', requireAuth, async (req, res, next) => {
  try {
    const search = cleanText(req.query.search);
    const status = cleanText(req.query.status) || 'active';
    const size = cleanText(req.query.size);
    const tutorId = cleanText(req.query.tutorId || req.query.tutor_id);
    const limit = parseLimit(req.query.limit, 24);
    const offset = parseOffset(req.query.page, limit);
    const params = [];
    const where = ['p.deleted_at IS NULL', 't.deleted_at IS NULL'];

    if (status !== 'all') {
      params.push(status);
      where.push(`p.status = $${params.length}`);
    }
    if (size && size !== 'all') {
      params.push(size);
      where.push(`p.size = $${params.length}`);
    }
    if (tutorId) {
      params.push(tutorId);
      where.push(`p.tutor_id = $${params.length}`);
    }
    if (search) {
      const term = `%${search.replace(/\s+/g, '%')}%`;
      const whatsappDigits = normalizeWhatsapp(search);
      params.push(term);
      const termIndex = params.length;
      const searchSql = [
        `unaccent(lower(p.name)) ILIKE unaccent(lower($${termIndex}))`,
        `unaccent(lower(COALESCE(p.breed,''))) ILIKE unaccent(lower($${termIndex}))`,
        `unaccent(lower(t.name)) ILIKE unaccent(lower($${termIndex}))`,
        `lower(COALESCE(t.email,'')) ILIKE lower($${termIndex})`
      ];
      if (whatsappDigits) {
        params.push(`%${whatsappDigits}%`);
        searchSql.push(`regexp_replace(COALESCE(t.whatsapp,''), '\D', '', 'g') ILIKE $${params.length}`);
        searchSql.push(`regexp_replace(COALESCE(t.phone,''), '\D', '', 'g') ILIKE $${params.length}`);
      }
      where.push(`(${searchSql.join(' OR ')})`);
    }

    const filterParams = [...params];
    params.push(limit);
    params.push(offset);

    const result = await query(`
      SELECT p.*, t.name AS tutor_name, t.whatsapp AS tutor_whatsapp
      FROM pets p
      INNER JOIN tutors t ON t.id = p.tutor_id
      WHERE ${where.join(' AND ')}
      ORDER BY p.updated_at DESC, p.name ASC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);
    const totalResult = await query(`
      SELECT COUNT(*)::int AS total
      FROM pets p
      INNER JOIN tutors t ON t.id = p.tutor_id
      WHERE ${where.join(' AND ')}
    `, filterParams);
    const statsResult = await query(`
      SELECT
        COUNT(*)::int AS total_pets,
        COUNT(*) FILTER (WHERE p.status = 'active')::int AS active_pets,
        COUNT(DISTINCT p.tutor_id)::int AS tutor_count,
        COUNT(DISTINCT NULLIF(lower(trim(COALESCE(p.breed, ''))), ''))::int AS breed_count
      FROM pets p
      INNER JOIN tutors t ON t.id = p.tutor_id
      WHERE ${where.join(' AND ')}
    `, filterParams);
    const stats = statsResult.rows[0] || {};

    res.json({
      items: result.rows.map(sanitizePet),
      page: Number(req.query.page || 1),
      limit,
      total: Number(totalResult.rows[0]?.total || 0),
      stats: {
        totalPets: Number(stats.total_pets || 0),
        activePets: Number(stats.active_pets || 0),
        tutorCount: Number(stats.tutor_count || 0),
        breedCount: Number(stats.breed_count || 0)
      }
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/pets/:id/media', requireAuth, async (req, res, next) => {
  try {
    const petId = req.params.id;
    const pet = await query(`
      SELECT p.id, p.name, t.name AS tutor_name, t.whatsapp AS tutor_whatsapp
      FROM pets p
      LEFT JOIN tutors t ON t.id = p.tutor_id
      WHERE p.id=$1::uuid AND p.deleted_at IS NULL
      LIMIT 1
    `, [petId]);
    if (!pet.rowCount) return res.status(404).json({ error: 'Pet não encontrado.' });
    const media = await query(`
      SELECT am.id, am.appointment_id, am.pet_id, am.media_type, am.url, am.caption, am.is_featured, am.created_at,
             a.starts_at, COALESCE(string_agg(DISTINCT ai.description, ', '), '') AS services
      FROM appointment_media am
      LEFT JOIN appointments a ON a.id = am.appointment_id
      LEFT JOIN appointment_items ai ON ai.appointment_id = a.id
      WHERE am.pet_id=$1::uuid AND am.deleted_at IS NULL
      GROUP BY am.id, a.starts_at
      ORDER BY am.created_at DESC
      LIMIT 80
    `, [petId]);
    res.json({
      ok: true,
      pet: { id: pet.rows[0].id, name: pet.rows[0].name, tutorName: pet.rows[0].tutor_name || '', tutorWhatsapp: pet.rows[0].tutor_whatsapp || '' },
      media: media.rows.map((row) => ({
        id: row.id,
        appointmentId: row.appointment_id,
        petId: row.pet_id,
        mediaType: row.media_type || 'photo',
        url: row.url,
        caption: row.caption || '',
        featured: !!row.is_featured,
        createdAt: row.created_at,
        startsAt: row.starts_at,
        services: row.services || ''
      }))
    });
  } catch (error) { next(error); }
});

app.get('/api/pets/:id', requireAuth, async (req, res, next) => {
  try {
    const pet = await getPetById(req.params.id);
    if (!pet) return res.status(404).json({ error: 'Pet não encontrado.' });
    res.json({ pet: sanitizePet(pet) });
  } catch (error) {
    next(error);
  }
});

app.post('/api/pets', requireAuth, async (req, res, next) => {
  try {
    const tutorId = cleanText(req.body.tutorId || req.body.tutor_id);
    const name = cleanText(req.body.name);
    if (!tutorId) return res.status(400).json({ error: 'Informe o tutor do pet.' });
    if (!name) return res.status(400).json({ error: 'Informe o nome do pet.' });

    const tutor = await getTutorById(tutorId);
    if (!tutor) return res.status(404).json({ error: 'Tutor não encontrado para vincular o pet.' });

    const result = await query(`
      INSERT INTO pets (tutor_id, name, species, breed, size, coat_type, birth_date, weight_kg, preferences, restrictions, notes, status, photo_url)
      VALUES ($1, $2, COALESCE($3, 'dog'), $4, COALESCE($5, 'pequeno'), $6, $7::date, $8::numeric, $9, $10, $11, COALESCE($12, 'active'), $13)
      RETURNING *
    `, [
      tutorId,
      name,
      cleanText(req.body.species),
      cleanText(req.body.breed),
      cleanText(req.body.size),
      cleanText(req.body.coatType || req.body.coat_type),
      cleanText(req.body.birthDate || req.body.birth_date),
      cleanText(req.body.weightKg || req.body.weight_kg),
      cleanText(req.body.preferences),
      cleanText(req.body.restrictions),
      cleanText(req.body.notes),
      cleanText(req.body.status),
      cleanPhotoDataUrl(req.body.photoDataUrl || req.body.photoUrl)
    ]);

    const pet = await getPetById(result.rows[0].id);
    res.status(201).json({ pet: sanitizePet(pet), message: 'Pet salvo com sucesso.' });
  } catch (error) {
    next(error);
  }
});

app.put('/api/pets/:id', requireAuth, async (req, res, next) => {
  try {
    const current = await getPetById(req.params.id);
    if (!current) return res.status(404).json({ error: 'Pet não encontrado.' });

    const tutorId = cleanText(req.body.tutorId || req.body.tutor_id);
    const name = cleanText(req.body.name);
    if (!tutorId) return res.status(400).json({ error: 'Informe o tutor do pet.' });
    if (!name) return res.status(400).json({ error: 'Informe o nome do pet.' });

    const tutor = await getTutorById(tutorId);
    if (!tutor) return res.status(404).json({ error: 'Tutor não encontrado para vincular o pet.' });

    await query(`
      UPDATE pets
      SET tutor_id = $2,
          name = $3,
          species = COALESCE($4, 'dog'),
          breed = $5,
          size = COALESCE($6, 'pequeno'),
          coat_type = $7,
          birth_date = $8::date,
          weight_kg = $9::numeric,
          preferences = $10,
          restrictions = $11,
          notes = $12,
          status = COALESCE($13, 'active'),
          photo_url = $14,
          updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
    `, [
      req.params.id,
      tutorId,
      name,
      cleanText(req.body.species),
      cleanText(req.body.breed),
      cleanText(req.body.size),
      cleanText(req.body.coatType || req.body.coat_type),
      cleanText(req.body.birthDate || req.body.birth_date),
      cleanText(req.body.weightKg || req.body.weight_kg),
      cleanText(req.body.preferences),
      cleanText(req.body.restrictions),
      cleanText(req.body.notes),
      cleanText(req.body.status),
      cleanPhotoDataUrl(req.body.photoDataUrl || req.body.photoUrl)
    ]);

    const pet = await getPetById(req.params.id);
    res.json({ pet: sanitizePet(pet), message: 'Pet atualizado com sucesso.' });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/pets/:id', requireAuth, async (req, res, next) => {
  try {
    const result = await query(`
      UPDATE pets
      SET status = 'inactive', updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id, status
    `, [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Pet não encontrado.' });
    res.json({ ok: true, status: 'inactive', message: 'Pet marcado como inativo.' });
  } catch (error) {
    next(error);
  }
});




app.post('/api/app/auth/moments-access', async (req, res, next) => {
  try {
    const token = String(req.body?.token || req.query?.token || '').trim();
    if (!token) return res.status(400).json({ error: 'Link de momentos inválido ou ausente.' });

    let payload;
    try {
      payload = jwt.verify(token, env.jwtSecret);
    } catch {
      return res.status(401).json({ error: 'Link de momentos expirado. Peça um novo link para a PetFunny.' });
    }

    if (payload.scope !== 'client_app_moments_access' || !payload.tutorId || !payload.whatsapp) {
      return res.status(401).json({ error: 'Link de momentos não autorizado.' });
    }

    const whatsapp = normalizeWhatsapp(payload.whatsapp);
    const tutorResult = await query(`
      SELECT id, name, whatsapp, email, city, state, tags, photo_url
      FROM tutors
      WHERE id=$1::uuid
        AND whatsapp=$2::text
        AND deleted_at IS NULL
      LIMIT 1
    `, [payload.tutorId, whatsapp]);

    const tutor = tutorResult.rows[0] || null;
    if (!tutor) return res.status(404).json({ error: 'Tutor não encontrado para este link de momentos.' });

    const account = await ensureClientAccountForTutor(tutor.id, tutor.whatsapp);
    if (!account?.id) return res.status(500).json({ error: 'Não foi possível liberar o acesso ao App do Tutor.' });

    const clientToken = jwt.sign(
      { sub: account.id, tutorId: tutor.id, scope: 'client_app', channel: 'whatsapp_moments_link', tenant: false },
      env.jwtSecret,
      { expiresIn: env.jwtExpiresIn }
    );

    await logClientAppAccess(req, {
      tutorId: tutor.id,
      phone: tutor.whatsapp,
      eventType: 'moments_magic_link',
      page: '/app/momentos',
      metadata: { appointmentId: payload.appointmentId || null, mediaId: payload.mediaId || null }
    }).catch(() => null);

    res.json({
      ok: true,
      token: clientToken,
      tokenType: 'Bearer',
      expiresIn: env.jwtExpiresIn,
      account: { id: account.id, status: account.status || 'active', whatsapp: account.whatsapp },
      tutor: sanitizeTutor(tutor),
      redirectPath: `/app/momentos${payload.mediaId ? `?focus=${encodeURIComponent(payload.mediaId)}` : ''}`,
      focusMediaId: payload.mediaId || ''
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/app/auth/request-code', async (req, res, next) => {
  try {
    const whatsapp = normalizeWhatsapp(req.body?.whatsapp);
    const forceCode = req.body?.forceCode === true || req.body?.force_code === true;
    if (!whatsapp) return res.status(400).json({ error: 'Informe o WhatsApp para continuar.' });

    const tutorResult = await query(`
      SELECT id, name, whatsapp, email, city, state, tags
      FROM tutors
      WHERE whatsapp = $1
        AND deleted_at IS NULL
      LIMIT 1
    `, [whatsapp]);

    const tutor = tutorResult.rows[0] || null;
    const attribution = getAppCrmAttribution(req);
    await syncAppCrmLead({
      whatsapp,
      tutorId: tutor?.id || null,
      name: tutor?.name || '',
      email: tutor?.email || '',
      stage: 'lead_entrou',
      source: attribution.source,
      origin: attribution.origin,
      notes: `Lead entrou no App do Tutor. ${attribution.details}`.trim(),
      interactionSubject: 'Lead entrou no app',
      interactionMessage: `WhatsApp informado na tela de acesso do App do Tutor. ${attribution.details}`.trim()
    });

    if (tutor) {
      const accountResult = await query(`
        SELECT id, status, is_active, password_hash, first_access_confirmed_at
        FROM client_accounts
        WHERE whatsapp = $1
          AND deleted_at IS NULL
        LIMIT 1
      `, [whatsapp]);
      const account = accountResult.rows[0] || null;

      if (!forceCode && account?.password_hash && account.is_active) {
        return res.json({
          ok: true,
          channel: 'password',
          whatsapp,
          tutorExists: true,
          tutor: sanitizeTutor(tutor),
          accessAlreadyValidated: true,
          nextStep: 'login_password',
          message: 'Encontramos seu acesso PetFunny. Informe sua senha para entrar no app.'
        });
      }
    }

    const code = await storeClientAuthCode(whatsapp, Boolean(tutor));

    res.json({
      ok: true,
      channel: 'whatsapp',
      whatsapp,
      tutorExists: Boolean(tutor),
      tutor: tutor ? sanitizeTutor(tutor) : null,
      accessAlreadyValidated: false,
      nextStep: 'verify_code',
      whatsappUrl: buildClientAuthWhatsAppUrl(whatsapp, code),
      message: tutor
        ? 'Primeiro acesso encontrado. Abra o WhatsApp, envie a mensagem pronta para você mesmo e volte para validar o código.'
        : 'Vamos criar seu acesso. Abra o WhatsApp, envie a mensagem pronta para você mesmo e depois cadastre tutor e pet.'
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/app/auth/verify-code', async (req, res, next) => {
  try {
    const whatsapp = normalizeWhatsapp(req.body?.whatsapp);
    const code = String(req.body?.code || '').replace(/\D/g, '');
    if (!whatsapp || !code) return res.status(400).json({ error: 'Informe WhatsApp e código.' });

    const codeRow = await verifyClientAuthCode(whatsapp, code);
    const tutorResult = await query(`
      SELECT id, name, whatsapp, email, city, state, tags
      FROM tutors
      WHERE whatsapp = $1
        AND deleted_at IS NULL
      LIMIT 1
    `, [whatsapp]);
    const tutor = tutorResult.rows[0] || null;
    const tutorExists = Boolean(tutor) || Boolean(codeRow.tutor_exists);
    await syncAppCrmLead({
      whatsapp,
      tutorId: tutor?.id || null,
      name: tutor?.name || '',
      email: tutor?.email || '',
      stage: 'codigo_validado',
      source: 'app_tutor',
      notes: 'Código do WhatsApp validado no App do Tutor.',
      interactionSubject: 'Código validado',
      interactionMessage: 'O tutor validou o código de acesso enviado pelo WhatsApp.'
    });

    res.json({
      ok: true,
      whatsapp,
      tutorExists,
      tutor: tutor ? sanitizeTutor(tutor) : null,
      verificationToken: signClientVerificationToken({ whatsapp, tutorExists, tutorId: tutor?.id || null }),
      nextStep: tutorExists ? 'set_password' : 'register_tutor',
      message: tutorExists
        ? 'WhatsApp validado. Agora crie sua senha de acesso.'
        : 'WhatsApp validado. Agora cadastre os dados do tutor.'
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/app/auth/set-password', async (req, res, next) => {
  try {
    const payload = requireClientVerification(req);
    const password = String(req.body?.password || '');
    const confirmPassword = String(req.body?.confirmPassword || req.body?.confirm_password || '');
    if (!payload.whatsapp) return res.status(400).json({ error: 'WhatsApp não validado.' });
    if (!password || !confirmPassword) return res.status(400).json({ error: 'Informe senha e confirmação de senha.' });
    if (password !== confirmPassword) return res.status(400).json({ error: 'A confirmação da senha não confere.' });

    const tutorResult = await query(`
      SELECT id, name, whatsapp, email, city, state, tags
      FROM tutors
      WHERE whatsapp = $1
        AND deleted_at IS NULL
      LIMIT 1
    `, [payload.whatsapp]);
    const tutor = tutorResult.rows[0];
    if (!tutor) return res.status(404).json({ error: 'Tutor não encontrado. Continue pelo cadastro do tutor.' });

    const accountResult = await query(`
      INSERT INTO client_accounts (tutor_id, whatsapp, status, is_active)
      VALUES ($1, $2, 'pending_first_access', FALSE)
      ON CONFLICT (whatsapp) DO UPDATE
      SET tutor_id = EXCLUDED.tutor_id,
          deleted_at = NULL,
          updated_at = NOW()
      RETURNING id, status
    `, [tutor.id, payload.whatsapp]);

    await activateClientAccount(accountResult.rows[0].id, password);
    await query('UPDATE client_accounts SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1', [accountResult.rows[0].id]);
    await syncAppCrmLead({
      whatsapp: payload.whatsapp,
      tutorId: tutor.id,
      name: tutor.name,
      email: tutor.email,
      stage: 'senha_cadastrada',
      source: 'app_tutor',
      notes: 'Tutor cadastrou senha e liberou o acesso ao App do Tutor.',
      interactionSubject: 'Senha cadastrada',
      interactionMessage: 'O tutor criou a senha de acesso ao app.'
    });

    const token = jwt.sign(
      { sub: accountResult.rows[0].id, tutorId: tutor.id, scope: 'client_app', channel: 'whatsapp', tenant: false },
      env.jwtSecret,
      { expiresIn: env.jwtExpiresIn }
    );

    res.json({
      token,
      tokenType: 'Bearer',
      expiresIn: env.jwtExpiresIn,
      account: { id: accountResult.rows[0].id, status: 'active', whatsapp: payload.whatsapp },
      tutor: sanitizeTutor(tutor),
      message: 'Senha criada. Bem-vindo ao app PetFunny.'
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/app/auth/register-tutor', async (req, res, next) => {
  try {
    const payload = requireClientVerification(req);
    const whatsapp = normalizeWhatsapp(payload.whatsapp);
    const name = cleanText(req.body?.name);
    const email = cleanText(req.body?.email);
    const city = cleanText(req.body?.city) || 'Ribeirão Preto';
    const state = cleanText(req.body?.state) || 'SP';
    const address = cleanText(req.body?.address);
    const addressNumber = cleanText(req.body?.addressNumber || req.body?.address_number);
    const addressNeighborhood = cleanText(req.body?.addressNeighborhood || req.body?.address_neighborhood);
    const addressZipcode = cleanText(req.body?.addressZipcode || req.body?.address_zipcode);
    const notes = cleanText(req.body?.notes);

    if (!whatsapp) return res.status(400).json({ error: 'WhatsApp não validado.' });
    if (!name) return res.status(400).json({ error: 'Informe o nome do tutor.' });

    const tutorResult = await query(`
      INSERT INTO tutors (name, whatsapp, email, city, state, address, address_number, address_neighborhood, address_zipcode, notes, tags, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, ARRAY['app_cliente'], 'active')
      ON CONFLICT (whatsapp) DO UPDATE
      SET name = EXCLUDED.name,
          email = EXCLUDED.email,
          city = EXCLUDED.city,
          state = EXCLUDED.state,
          address = EXCLUDED.address,
          address_number = EXCLUDED.address_number,
          address_neighborhood = EXCLUDED.address_neighborhood,
          address_zipcode = EXCLUDED.address_zipcode,
          notes = EXCLUDED.notes,
          tags = ARRAY(SELECT DISTINCT unnest(COALESCE(tutors.tags, ARRAY[]::TEXT[]) || ARRAY['app_cliente'])),
          status = 'active',
          deleted_at = NULL,
          updated_at = NOW()
      RETURNING id, name, whatsapp, email, address, address_number, address_neighborhood, address_zipcode, city, state, tags
    `, [name, whatsapp, email || null, city, state, address || null, addressNumber || null, addressNeighborhood || null, addressZipcode || null, notes || null]);

    const tutor = tutorResult.rows[0];
    const accountResult = await query(`
      INSERT INTO client_accounts (tutor_id, whatsapp, status, is_active)
      VALUES ($1, $2, 'pending_pet_registration', FALSE)
      ON CONFLICT (whatsapp) DO UPDATE
      SET tutor_id = EXCLUDED.tutor_id,
          status = 'pending_pet_registration',
          is_active = FALSE,
          deleted_at = NULL,
          updated_at = NOW()
      RETURNING id, status
    `, [tutor.id, whatsapp]);

    await syncAppCrmLead({
      whatsapp,
      tutorId: tutor.id,
      name: tutor.name,
      email: tutor.email,
      stage: 'cadastro_tutor',
      source: 'app_tutor',
      notes: 'Tutor preencheu o cadastro inicial pelo App do Tutor.',
      interactionSubject: 'Cadastro do tutor',
      interactionMessage: 'O tutor completou nome, e-mail, cidade/UF e dados básicos pelo app.'
    });

    res.status(201).json({
      ok: true,
      tutor: sanitizeTutor(tutor),
      account: { id: accountResult.rows[0].id, status: accountResult.rows[0].status, whatsapp },
      onboardingToken: signClientOnboardingToken({ whatsapp, tutorId: tutor.id, accountId: accountResult.rows[0].id }),
      nextStep: 'register_pet',
      message: 'Tutor cadastrado. Agora cadastre o pet para liberar o app.'
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/app/auth/register-pet', async (req, res, next) => {
  try {
    const payload = requireClientOnboarding(req);
    const name = cleanText(req.body?.petName || req.body?.name);
    const species = cleanText(req.body?.species) || 'dog';
    const breed = cleanText(req.body?.breed);
    const size = cleanText(req.body?.size) || 'pequeno';
    const coatType = cleanText(req.body?.coatType || req.body?.coat_type);
    const notes = cleanText(req.body?.notes);
    const password = String(req.body?.password || '');
    const confirmPassword = String(req.body?.confirmPassword || req.body?.confirm_password || '');

    if (!payload.tutorId || !payload.accountId) return res.status(400).json({ error: 'Cadastro do tutor não localizado. Valide o WhatsApp novamente.' });
    if (!name) return res.status(400).json({ error: 'Informe o nome do pet.' });
    if (!password || !confirmPassword) return res.status(400).json({ error: 'Informe senha e confirmação de senha.' });
    if (password !== confirmPassword) return res.status(400).json({ error: 'A confirmação da senha não confere.' });

    const petResult = await query(`
      INSERT INTO pets (tutor_id, name, species, breed, size, coat_type, notes, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
      RETURNING id, name, species, breed, size, coat_type, notes, status
    `, [payload.tutorId, name, species, breed || null, size, coatType || null, notes || null]);

    await activateClientAccount(payload.accountId, password);
    await query('UPDATE client_accounts SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1', [payload.accountId]);
    await syncAppCrmLead({
      whatsapp: payload.whatsapp,
      tutorId: payload.tutorId,
      name: '',
      email: '',
      stage: 'pet_cadastrado',
      source: 'app_tutor',
      notes: `Pet cadastrado no App do Tutor: ${name}.`,
      interactionSubject: 'Pet cadastrado',
      interactionMessage: `O tutor cadastrou o pet ${name} e finalizou o acesso ao app.`
    });

    const tutorResult = await query(`
      SELECT id, name, whatsapp, email, city, state, tags
      FROM tutors
      WHERE id = $1
      LIMIT 1
    `, [payload.tutorId]);
    const tutor = tutorResult.rows[0];

    const token = jwt.sign(
      { sub: payload.accountId, tutorId: payload.tutorId, scope: 'client_app', channel: 'whatsapp', tenant: false },
      env.jwtSecret,
      { expiresIn: env.jwtExpiresIn }
    );

    res.status(201).json({
      token,
      tokenType: 'Bearer',
      expiresIn: env.jwtExpiresIn,
      account: { id: payload.accountId, status: 'active', whatsapp: payload.whatsapp },
      tutor: sanitizeTutor(tutor),
      pet: sanitizeClientPet(petResult.rows[0]),
      message: 'Pet cadastrado. Acesso liberado ao app PetFunny.'
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/app/first-access/request', async (req, res, next) => {
  try {
    const whatsapp = normalizeWhatsapp(req.body?.whatsapp);
    if (!whatsapp) return res.status(400).json({ error: 'Informe o WhatsApp do tutor.' });

    const tutorResult = await query(`
      SELECT id, name, whatsapp, email, city, state, tags
      FROM tutors
      WHERE whatsapp = $1
        AND deleted_at IS NULL
      LIMIT 1
    `, [whatsapp]);

    const tutor = tutorResult.rows[0];
    if (!tutor) {
      return res.status(404).json({ error: 'WhatsApp não encontrado. Fale com o PetFunny para liberar seu acesso.' });
    }

    const code = makeSixDigitCode();
    const codeHash = await bcrypt.hash(code, 10);

    await query(`
      INSERT INTO client_accounts (tutor_id, whatsapp, first_access_code_hash, first_access_expires_at, status, is_active)
      VALUES ($1, $2, $3, NOW() + INTERVAL '20 minutes', 'pending_first_access', FALSE)
      ON CONFLICT (whatsapp) DO UPDATE
      SET tutor_id = EXCLUDED.tutor_id,
          first_access_code_hash = EXCLUDED.first_access_code_hash,
          first_access_expires_at = EXCLUDED.first_access_expires_at,
          status = CASE WHEN client_accounts.password_hash IS NULL THEN 'pending_first_access' ELSE client_accounts.status END,
          updated_at = NOW()
    `, [tutor.id, whatsapp, codeHash]);

    res.json({
      ok: true,
      message: 'Código de primeiro acesso gerado. Abra o WhatsApp, envie a mensagem pronta para você mesmo e volte para validar.',
      channel: 'whatsapp',
      tutor: sanitizeTutor(tutor),
      whatsappUrl: buildClientAuthWhatsAppUrl(whatsapp, code)
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/app/first-access/confirm', async (req, res, next) => {
  try {
    const whatsapp = normalizeWhatsapp(req.body?.whatsapp);
    const code = String(req.body?.code || '').replace(/\D/g, '');
    const password = String(req.body?.password || '');

    if (!whatsapp || !code || !password) {
      return res.status(400).json({ error: 'Informe WhatsApp, código e senha.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'A senha precisa ter pelo menos 8 caracteres.' });
    }

    const result = await query(`
      SELECT ca.id, ca.tutor_id, ca.first_access_code_hash, ca.first_access_expires_at,
             t.name, t.email, t.city, t.state, t.tags, t.whatsapp
      FROM client_accounts ca
      INNER JOIN tutors t ON t.id = ca.tutor_id
      WHERE ca.whatsapp = $1
        AND ca.deleted_at IS NULL
      LIMIT 1
    `, [whatsapp]);

    const account = result.rows[0];
    if (!account?.first_access_code_hash) {
      return res.status(401).json({ error: 'Solicite um novo código de primeiro acesso.' });
    }

    if (new Date(account.first_access_expires_at).getTime() < Date.now()) {
      return res.status(401).json({ error: 'Código expirado. Solicite um novo código.' });
    }

    const codeOk = await bcrypt.compare(code, account.first_access_code_hash);
    if (!codeOk) return res.status(401).json({ error: 'Código inválido.' });

    const passwordHash = await bcrypt.hash(password, 12);
    await query(`
      UPDATE client_accounts
      SET password_hash = $2,
          first_access_code_hash = NULL,
          first_access_expires_at = NULL,
          first_access_confirmed_at = NOW(),
          is_active = TRUE,
          status = 'active',
          updated_at = NOW()
      WHERE id = $1
    `, [account.id, passwordHash]);

    const token = jwt.sign(
      { sub: account.id, tutorId: account.tutor_id, scope: 'client_app', channel: 'whatsapp', tenant: false },
      env.jwtSecret,
      { expiresIn: env.jwtExpiresIn }
    );

    res.json({
      token,
      tokenType: 'Bearer',
      expiresIn: env.jwtExpiresIn,
      account: { id: account.id, status: 'active', whatsapp },
      tutor: sanitizeTutor({ ...account, id: account.tutor_id, whatsapp })
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/app/login', async (req, res, next) => {
  try {
    const whatsapp = normalizeWhatsapp(req.body?.whatsapp);
    const password = String(req.body?.password || '');
    if (!whatsapp || !password) return res.status(400).json({ error: 'Informe WhatsApp e senha.' });

    const result = await query(`
      SELECT ca.id, ca.tutor_id, ca.password_hash, ca.status, ca.is_active,
             t.name, t.email, t.city, t.state, t.tags, t.whatsapp
      FROM client_accounts ca
      INNER JOIN tutors t ON t.id = ca.tutor_id
      WHERE ca.whatsapp = $1
        AND ca.deleted_at IS NULL
        AND t.deleted_at IS NULL
      LIMIT 1
    `, [whatsapp]);

    const account = result.rows[0];
    if (!account?.password_hash || !account.is_active) {
      return res.status(401).json({ error: 'Acesso não liberado. Faça o primeiro acesso ou fale com o PetFunny.' });
    }

    const passwordOk = await bcrypt.compare(password, account.password_hash);
    if (!passwordOk) return res.status(401).json({ error: 'WhatsApp ou senha inválidos.' });

    await query('UPDATE client_accounts SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1', [account.id]);
    await logClientAppAccess(req, { tutorId: account.tutor_id, phone: whatsapp, eventType: 'login', page: '/app/login', metadata: { source: 'password_login' } });

    const token = jwt.sign(
      { sub: account.id, tutorId: account.tutor_id, scope: 'client_app', channel: 'whatsapp', tenant: false },
      env.jwtSecret,
      { expiresIn: env.jwtExpiresIn }
    );

    res.json({
      token,
      tokenType: 'Bearer',
      expiresIn: env.jwtExpiresIn,
      account: { id: account.id, status: account.status, whatsapp },
      tutor: sanitizeTutor({ ...account, id: account.tutor_id, whatsapp })
    });
  } catch (error) {
    next(error);
  }
});


app.post('/api/app/demo-login', async (req, res, next) => {
  try {
    if (env.nodeEnv === 'production') {
      return res.status(403).json({ error: 'Login demonstração disponível apenas em ambiente local.' });
    }

    const whatsapp = normalizeWhatsapp(req.body?.whatsapp || '5516981535338');
    const tutorResult = await query(`
      INSERT INTO tutors (name, whatsapp, email, tags, notes, status)
      VALUES ('Cliente Demonstração', $1, 'cliente.demo@petfunny.local', ARRAY['demo','app_tutor'], 'Cliente criado automaticamente para teste do App do Tutor.', 'active')
      ON CONFLICT (whatsapp) DO UPDATE
      SET name = EXCLUDED.name,
          email = EXCLUDED.email,
          tags = EXCLUDED.tags,
          notes = EXCLUDED.notes,
          status = 'active',
          deleted_at = NULL,
          updated_at = NOW()
      RETURNING id, name, email, city, state, tags, whatsapp
    `, [whatsapp]);

    const tutor = tutorResult.rows[0];
    const passwordHash = await bcrypt.hash('petfunny123', 12);
    const accountResult = await query(`
      INSERT INTO client_accounts (tutor_id, whatsapp, password_hash, first_access_confirmed_at, status, is_active)
      VALUES ($1, $2, $3, NOW(), 'active', TRUE)
      ON CONFLICT (whatsapp) DO UPDATE
      SET tutor_id = EXCLUDED.tutor_id,
          password_hash = EXCLUDED.password_hash,
          first_access_code_hash = NULL,
          first_access_expires_at = NULL,
          first_access_confirmed_at = NOW(),
          status = 'active',
          is_active = TRUE,
          updated_at = NOW()
      RETURNING id, status
    `, [tutor.id, whatsapp, passwordHash]);

    await query(`
      INSERT INTO pets (tutor_id, name, species, breed, size, coat_type, preferences, restrictions, status)
      SELECT $1, 'Mel', 'dog', 'Spitz Alemão', 'pequeno', 'longa', 'Prefere laço rosa e perfume suave.', 'Sensível ao secador.', 'active'
      WHERE NOT EXISTS (SELECT 1 FROM pets WHERE tutor_id = $1 AND lower(name) = 'mel' AND deleted_at IS NULL)
    `, [tutor.id]);

    try {
      await query(`
        WITH pet AS (SELECT id FROM pets WHERE tutor_id = $1 AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 1),
             svc AS (SELECT id, name, price_cents FROM services WHERE is_active IS TRUE AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 1),
             col AS (SELECT id FROM collaborators WHERE deleted_at IS NULL ORDER BY created_at ASC LIMIT 1),
             appt AS (
               INSERT INTO appointments (tutor_id, pet_id, collaborator_id, starts_at, ends_at, status, subtotal_cents, discount_percent, discount_cents, total_cents, payment_status, notes)
               SELECT $1, pet.id, col.id, date_trunc('day', NOW()) + interval '1 day' + interval '10 hours', date_trunc('day', NOW()) + interval '1 day' + interval '11 hours', 'agendado', svc.price_cents, 0, 0, svc.price_cents, 'pending', 'Agendamento demo do App do Tutor.'
               FROM pet, svc, col
               WHERE NOT EXISTS (SELECT 1 FROM appointments WHERE tutor_id = $1 AND starts_at > NOW() AND deleted_at IS NULL)
               RETURNING id, pet_id
             )
        INSERT INTO appointment_items (appointment_id, pet_id, service_id, description, quantity, unit_price_cents, total_cents)
        SELECT appt.id, appt.pet_id, svc.id, svc.name, 1, svc.price_cents, svc.price_cents
        FROM appt, svc
      `, [tutor.id]);
    } catch (seedError) {
      console.warn('[app:demo-login] não foi possível criar agendamento demo:', seedError.message);
    }

    await query('UPDATE client_accounts SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1', [accountResult.rows[0].id]);
    await logClientAppAccess(req, { tutorId: tutor.id, phone: whatsapp, eventType: 'login', page: '/app/demo-login', metadata: { source: 'demo_login' } });

    const token = jwt.sign(
      { sub: accountResult.rows[0].id, tutorId: tutor.id, scope: 'client_app', channel: 'whatsapp', tenant: false },
      env.jwtSecret,
      { expiresIn: env.jwtExpiresIn }
    );

    res.json({
      token,
      tokenType: 'Bearer',
      expiresIn: env.jwtExpiresIn,
      account: { id: accountResult.rows[0].id, status: 'active', whatsapp },
      tutor: sanitizeTutor(tutor),
      demoPassword: 'petfunny123'
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/app/me', requireClientAuth, async (req, res) => {
  res.json(req.clientApp);
});


app.post('/api/app/access-log', requireClientAuth, async (req, res, next) => {
  try {
    const tutor = req.clientApp?.tutor || {};
    const eventType = cleanText(req.body?.eventType || req.body?.event_type || 'page_view');
    const page = cleanText(req.body?.page || req.body?.path || req.get('referer') || '');
    const allowed = new Set(['page_view','timeline_open','agenda_open','roleta_open','packages_open','payment_attempt','payment_completed','profile_update','pet_update','media_view','referral_open','moments_open','health360_open','logout','login']);
    await logClientAppAccess(req, {
      tutorId: tutor.id,
      phone: tutor.whatsapp || req.clientApp?.account?.whatsapp,
      eventType: allowed.has(eventType) ? eventType : 'page_view',
      page,
      metadata: req.body?.metadata && typeof req.body.metadata === 'object' ? req.body.metadata : {}
    });
    res.json({ ok: true });
  } catch (error) { next(error); }
});

app.get('/api/app-access/tutors', requireAuth, async (req, res, next) => {
  try {
    const status = cleanText(req.query.status || 'all');
    const search = cleanText(req.query.search || '');
    const allowedSorts = new Set(['name', 'whatsapp', 'firstAccessAt', 'lastAccessAt', 'totalAccesses', 'petsCount', 'lastEventType', 'status']);
    const sortByRaw = cleanText(req.query.sortBy || 'lastAccessAt');
    const sortBy = allowedSorts.has(sortByRaw) ? sortByRaw : 'lastAccessAt';
    const sortDir = String(req.query.sortDir || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
    const limit = parseLimit(req.query.limit, 100);
    const offset = parseOffset(req.query.page, limit);
    const params = [];
    let where = 'WHERE t.deleted_at IS NULL';
    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      where += ` AND (LOWER(t.name) LIKE $${params.length} OR regexp_replace(COALESCE(t.whatsapp,''), '[^0-9]', '', 'g') LIKE regexp_replace($${params.length}, '[^0-9]', '', 'g'))`;
    }
    const base = `
      WITH access AS (
        SELECT tutor_id,
               MIN(created_at) AS first_access_at,
               MAX(created_at) AS last_access_at,
               COUNT(*)::int AS total_accesses,
               (ARRAY_AGG(event_type ORDER BY created_at DESC))[1] AS last_event_type,
               (ARRAY_AGG(page ORDER BY created_at DESC))[1] AS last_page
        FROM app_access_logs
        WHERE tutor_id IS NOT NULL
        GROUP BY tutor_id
      ), pet_counts AS (
        SELECT tutor_id, COUNT(*)::int AS pets_count
        FROM pets
        WHERE deleted_at IS NULL
        GROUP BY tutor_id
      )
      SELECT t.id, t.name, t.whatsapp, COALESCE(pc.pets_count,0)::int AS pets_count,
             a.first_access_at, a.last_access_at, COALESCE(a.total_accesses,0)::int AS total_accesses,
             a.last_event_type, a.last_page
      FROM tutors t
      LEFT JOIN access a ON a.tutor_id = t.id
      LEFT JOIN pet_counts pc ON pc.tutor_id = t.id
      ${where}
    `;
    const allRows = await query(base, params);
    const filtered = allRows.rows.filter((row) => {
      const st = appAccessStatus(row.last_access_at).code;
      return status === 'all' || st === status;
    });
    const normalizeSortValue = (row) => {
      if (sortBy === 'name') return String(row.name || '').toLowerCase();
      if (sortBy === 'whatsapp') return String(row.whatsapp || '').replace(/\D/g, '');
      if (sortBy === 'firstAccessAt') return row.first_access_at ? new Date(row.first_access_at).getTime() : null;
      if (sortBy === 'lastAccessAt') return row.last_access_at ? new Date(row.last_access_at).getTime() : null;
      if (sortBy === 'totalAccesses') return Number(row.total_accesses || 0);
      if (sortBy === 'petsCount') return Number(row.pets_count || 0);
      if (sortBy === 'lastEventType') return String(row.last_event_type || '').toLowerCase();
      if (sortBy === 'status') return String(appAccessStatus(row.last_access_at).label || '').toLowerCase();
      return row.last_access_at ? new Date(row.last_access_at).getTime() : null;
    };
    const sorted = [...filtered].sort((a, b) => {
      const av = normalizeSortValue(a);
      const bv = normalizeSortValue(b);
      if (av === bv) return String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR');
      if (av === null || av === undefined || av === '') return sortDir === 'asc' ? -1 : 1;
      if (bv === null || bv === undefined || bv === '') return sortDir === 'asc' ? 1 : -1;
      if (typeof av === 'number' || typeof bv === 'number') return sortDir === 'asc' ? Number(av) - Number(bv) : Number(bv) - Number(av);
      return sortDir === 'asc' ? String(av).localeCompare(String(bv), 'pt-BR') : String(bv).localeCompare(String(av), 'pt-BR');
    });
    const pageItems = sorted.slice(offset, offset + limit).map((row) => ({
      id: row.id,
      tutorId: row.id,
      name: row.name,
      whatsapp: row.whatsapp,
      petsCount: Number(row.pets_count || 0),
      firstAccessAt: row.first_access_at,
      lastAccessAt: row.last_access_at,
      totalAccesses: Number(row.total_accesses || 0),
      lastEventType: row.last_event_type || null,
      lastPage: row.last_page || null,
      status: appAccessStatus(row.last_access_at)
    }));
    const summary = filtered.reduce((acc, row) => {
      const code = appAccessStatus(row.last_access_at).code;
      acc.total += 1;
      acc[code] = (acc[code] || 0) + 1;
      if (row.last_access_at) acc.withAccess += 1;
      return acc;
    }, { total: 0, withAccess: 0, never: 0, today: 0, active: 0, inactive_7: 0, inactive_30: 0 });
    res.json({ items: pageItems, total: filtered.length, page: Number(req.query.page || 1), limit, summary });
  } catch (error) { next(error); }
});

app.get('/api/app-access/tutors/:id', requireAuth, async (req, res, next) => {
  try {
    const tutorResult = await query('SELECT id, name, whatsapp FROM tutors WHERE id = $1 AND deleted_at IS NULL LIMIT 1', [req.params.id]);
    if (!tutorResult.rows[0]) return res.status(404).json({ error: 'Tutor não encontrado.' });
    const logs = await query(`
      SELECT id, event_type, page, user_agent, ip_address, metadata, created_at
      FROM app_access_logs
      WHERE tutor_id = $1
      ORDER BY created_at DESC
      LIMIT 120
    `, [req.params.id]);
    const firstLast = await query(`
      SELECT MIN(created_at) AS first_access_at, MAX(created_at) AS last_access_at, COUNT(*)::int AS total_accesses
      FROM app_access_logs
      WHERE tutor_id = $1
    `, [req.params.id]);
    const summary = firstLast.rows[0] || {};
    res.json({
      tutor: tutorResult.rows[0],
      firstAccessAt: summary.first_access_at || null,
      lastAccessAt: summary.last_access_at || null,
      totalAccesses: Number(summary.total_accesses || 0),
      status: appAccessStatus(summary.last_access_at),
      items: logs.rows.map(row => ({ id: row.id, eventType: row.event_type, page: row.page, userAgent: row.user_agent, ipAddress: row.ip_address, metadata: row.metadata || {}, createdAt: row.created_at }))
    });
  } catch (error) { next(error); }
});

function daysBetweenNow(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
}

function clientRadarStatusTone(priority = 'média') {
  const value = String(priority || '').toLowerCase();
  if (value === 'crítica' || value === 'critica' || value === 'alta') return 'danger';
  if (value === 'média' || value === 'media') return 'warning';
  return 'ok';
}

function buildClientRadarMessage({ name, petName, segment, daysWithoutAppointment, sessionsRemaining, pendingCents }) {
  const tutorName = name || 'tudo bem';
  const pet = petName || 'seu pet';
  if (segment === 'pendencia_financeira') {
    return `Oi, ${tutorName}! Tudo bem? Aqui é do PetFunny 🐾\n\nPassando para te avisar com carinho que ficou uma pendência em aberto no atendimento do ${pet}. Quer que eu te envie o link/forma de pagamento para regularizar?`;
  }
  if (segment === 'renovacao_pacote') {
    return `Oi, ${tutorName}! O ${pet} está quase terminando o pacote no PetFunny 🐶✨\n\nPosso já deixar a renovação organizada para você manter os banhos em dia e não perder os melhores horários?`;
  }
  if (segment === 'primeiro_acesso_app') {
    return `Oi, ${tutorName}! Tudo bem? Aqui é do PetFunny 🐶✨\n\nLiberamos seu acesso ao Clube PetFunny, o app do tutor para acompanhar tudo do seu pet em um só lugar.\n\nNo Clube você pode agendar banho e tosa, ver pacotes, receber fotos e vídeos dos Momentos do Atendimento, acompanhar notificações, pedir Táxi Pet e consultar Saúde 360.\n\nAcesse: https://agendapetfunny.com.br/app\n\nQualquer dúvida, eu te ajudo por aqui.`;
  }
  if (segment === 'cliente_perdido') {
    return `Oi, ${tutorName}! Que saudade do ${pet} aqui no PetFunny 🐾\n\nEstamos organizando a agenda da semana e posso ver um horário especial para ele voltar cheiroso, cuidado e feliz. Quer que eu veja as opções?`;
  }
  if (segment === 'cliente_em_risco') {
    return `Oi, ${tutorName}! Tudo bem? Notei que o ${pet} já está há um tempinho sem passar pelo PetFunny 🐶\n\nQuer que eu veja um horário confortável para banho, cuidado e manutenção? Posso te mandar as opções disponíveis.`;
  }
  if (segment === 'novo_tutor') {
    return `Oi, ${tutorName}! Seja muito bem-vindo ao PetFunny 🐶✨\n\nPosso te ajudar a escolher o melhor serviço para o ${pet} e já encontrar um horário na agenda?`;
  }
  if (segment === 'recorrente_vip') {
    return `Oi, ${tutorName}! Passando para cuidar da rotina do ${pet} 🐾\n\nQuer que eu já veja o próximo melhor horário para manter o banho/tosa dele em dia no PetFunny?`;
  }
  return `Oi, ${tutorName}! Tudo bem? Aqui é do PetFunny 🐶✨\n\nEstou passando para saber se você quer que eu veja um horário para o ${pet} ou algum cuidado especial na próxima visita.`;
}

function buildClientRadarItem(row = {}) {
  const daysWithoutAppointment = row.last_appointment_at ? daysBetweenNow(row.last_appointment_at) : null;
  const daysSinceLastMessage = row.last_outbound_at ? daysBetweenNow(row.last_outbound_at) : null;
  const appointmentsCount = asNumber(row.appointments_count);
  const totalAccesses = asNumber(row.total_accesses);
  const sessionsRemaining = row.min_sessions_remaining === null || row.min_sessions_remaining === undefined ? null : asNumber(row.min_sessions_remaining);
  const pendingCount = asNumber(row.pending_count);
  const pendingCents = asNumber(row.pending_cents);
  const petName = row.last_pet_name || 'seu pet';

  let segment = 'relacionamento_ativo';
  let situation = 'Relacionamento ativo';
  let status = 'Acompanhar sem pressionar';
  let priority = 'baixa';
  let cadenceDays = 21;
  let reason = 'Tutor com relacionamento ativo e sem sinal crítico de abandono.';
  let benefit = 'Mantém presença da marca sem excesso de mensagens e ajuda a puxar o próximo atendimento no momento certo.';

  if (pendingCount > 0) {
    segment = 'pendencia_financeira';
    situation = 'Pendência financeira';
    status = 'Prioridade de cobrança gentil';
    priority = 'alta';
    cadenceDays = 2;
    reason = `Existe ${pendingCount} pendência(s) financeira(s) em aberto, somando ${brlFromCentsText(pendingCents)}.`;
    benefit = 'Reduz inadimplência, melhora o caixa e evita que o próximo atendimento aconteça sem regularização.';
  } else if (sessionsRemaining !== null && sessionsRemaining <= 1 && asNumber(row.active_packages) > 0) {
    segment = 'renovacao_pacote';
    situation = 'Pacote perto do fim';
    status = 'Alta chance de renovação';
    priority = 'alta';
    cadenceDays = 3;
    reason = `${petName} tem ${sessionsRemaining} sessão(ões) restante(s) em pacote ativo.`;
    benefit = 'Aumenta recorrência, protege agenda futura e evita o cliente voltar para banho avulso ou sumir.';
  } else if (totalAccesses <= 0) {
    segment = 'primeiro_acesso_app';
    situation = 'Nunca acessou o app';
    status = 'Ativação do Clube PetFunny';
    priority = 'alta';
    cadenceDays = 3;
    reason = 'Tutor ainda não registrou nenhum acesso ao App do Tutor.';
    benefit = 'Ativa o Clube PetFunny, reduz atendimento manual e aumenta uso de agenda, pacotes, momentos e notificações.';
  } else if (appointmentsCount <= 0) {
    segment = 'novo_tutor';
    situation = 'Novo tutor sem serviço';
    status = 'Converter primeiro agendamento';
    priority = 'média';
    cadenceDays = 3;
    reason = 'Tutor cadastrado, mas ainda não possui histórico de atendimento.';
    benefit = 'Transforma cadastro parado em primeiro serviço e cria vínculo com o PetFunny.';
  } else if (daysWithoutAppointment !== null && daysWithoutAppointment > 90) {
    segment = 'cliente_perdido';
    situation = 'Cliente dormindo';
    status = 'Reativar com cuidado';
    priority = 'alta';
    cadenceDays = 15;
    reason = `Último atendimento há ${daysWithoutAppointment} dias.`;
    benefit = 'Pode recuperar receita sem mídia paga, mas precisa de abordagem espaçada para não parecer spam.';
  } else if (daysWithoutAppointment !== null && daysWithoutAppointment >= 60) {
    segment = 'cliente_em_risco';
    situation = 'Em risco de abandono';
    status = 'Reativação recomendada';
    priority = 'alta';
    cadenceDays = 7;
    reason = `Tutor está há ${daysWithoutAppointment} dias sem novo atendimento.`;
    benefit = 'Ajuda a recuperar o tutor antes que ele vire cliente perdido ou migre para outro banho e tosa.';
  } else if (daysWithoutAppointment !== null && daysWithoutAppointment >= 35) {
    segment = 'cliente_em_atencao';
    situation = 'Em atenção';
    status = 'Lembrete comercial leve';
    priority = 'média';
    cadenceDays = 7;
    reason = `Já passaram ${daysWithoutAppointment} dias desde o último atendimento.`;
    benefit = 'Antecipa a reativação antes do cliente esfriar e ajuda a preencher horários da semana.';
  } else if (appointmentsCount >= 3 && (daysWithoutAppointment === null || daysWithoutAppointment <= 30)) {
    segment = 'recorrente_vip';
    situation = 'Recorrente / VIP';
    status = 'Relacionamento saudável';
    priority = 'baixa';
    cadenceDays = 15;
    reason = `Tutor possui ${appointmentsCount} atendimento(s) e relacionamento recente.`;
    benefit = 'Mantém vínculo, abre espaço para pacote, recorrência, Táxi Pet e experiências do Clube.';
  }

  const waitDays = daysSinceLastMessage === null ? 0 : Math.max(0, cadenceDays - daysSinceLastMessage);
  const canSendToday = waitDays <= 0;
  const cadenceLabel = `Enviar no máximo a cada ${cadenceDays} dia(s)`;
  const safeStatus = canSendToday ? 'Pode enviar hoje' : `Aguardar ${waitDays} dia(s) para respeitar cadência`;
  const scoreBase = { alta: 86, média: 64, media: 64, baixa: 38 }[priority] || 50;
  const score = Math.max(1, Math.min(100, scoreBase + (canSendToday ? 6 : -12) + (pendingCount > 0 ? 8 : 0)));
  const message = buildClientRadarMessage({ name: row.name, petName, segment, daysWithoutAppointment, sessionsRemaining, pendingCents });

  return {
    tutorId: row.id,
    name: row.name || 'Tutor não informado',
    whatsapp: row.whatsapp || '',
    petName,
    petsCount: asNumber(row.pets_count),
    appointmentsCount,
    lastAppointmentAt: row.last_appointment_at || null,
    nextAppointmentAt: row.next_appointment_at || null,
    lastAccessAt: row.last_access_at || null,
    totalAccesses,
    lastOutboundAt: row.last_outbound_at || null,
    daysWithoutAppointment,
    daysSinceLastMessage,
    segment,
    situation,
    status,
    safeStatus,
    priority,
    tone: clientRadarStatusTone(priority),
    cadenceDays,
    cadenceLabel,
    canSendToday,
    waitDays,
    reason,
    benefit,
    message,
    actionLabel: canSendToday ? 'Enviar mensagem' : 'Aguardar cadência',
    score
  };
}

async function askOpenAiForClientRadar(items = []) {
  if (!env.openaiApiKey || typeof fetch !== 'function' || !items.length) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8500);
  try {
    const system = `${getPetFunnyAiSystemPrompt()}\n\nVocê é a IA de relacionamento do PetFunny OS. Reescreva apenas motivo, benefício e mensagem de WhatsApp para uma lista diária de tutores. Mantenha tom humano, curto, respeitoso e comercial. Não prometa descontos, brindes, horários ou diagnósticos que não estejam nos dados. Preserve cadência segura para evitar excesso de mensagens. Retorne APENAS JSON válido no formato {"items":[{"tutorId":"...","reason":"...","benefit":"...","message":"..."}]}.`;
    const payload = items.slice(0, 25).map((item) => ({
      tutorId: item.tutorId,
      name: item.name,
      petName: item.petName,
      situation: item.situation,
      status: item.status,
      priority: item.priority,
      cadenceLabel: item.cadenceLabel,
      canSendToday: item.canSendToday,
      reason: item.reason,
      benefit: item.benefit,
      message: item.message
    }));
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${env.openaiApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: env.openaiModel,
        temperature: 0.32,
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify({ date: todayPtBrLabel(), items: payload }).slice(0, 18000) }]
      })
    });
    if (!response.ok) return null;
    const data = await response.json();
    const parsed = JSON.parse(data?.choices?.[0]?.message?.content || '{}');
    return Array.isArray(parsed.items) ? parsed.items : null;
  } catch (error) {
    console.warn(`[client-radar-ai] OpenAI indisponível: ${error.message}`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function getClientRadarDaily({ useAi = true, segment = 'all', priority = 'all', onlyReady = false } = {}) {
  await ensureWhatsAppAgentTables().catch((error) => console.warn(`[client-radar] whatsapp tables fallback: ${error.message}`));
  const result = await query(`
    WITH ap AS (
      SELECT tutor_id,
             COUNT(*)::int AS appointments_count,
             MAX(starts_at) FILTER (WHERE starts_at <= NOW()) AS last_appointment_at,
             MIN(starts_at) FILTER (WHERE starts_at >= NOW() AND status NOT IN ('cancelado','nao_compareceu')) AS next_appointment_at
      FROM appointments
      WHERE deleted_at IS NULL
      GROUP BY tutor_id
    ), pet_info AS (
      SELECT tutor_id,
             COUNT(*)::int AS pets_count,
             (ARRAY_AGG(name ORDER BY created_at DESC, updated_at DESC))[1] AS last_pet_name
      FROM pets
      WHERE deleted_at IS NULL
      GROUP BY tutor_id
    ), app_access AS (
      SELECT tutor_id,
             MAX(created_at) AS last_access_at,
             COUNT(*)::int AS total_accesses
      FROM app_access_logs
      WHERE tutor_id IS NOT NULL
      GROUP BY tutor_id
    ), pkg AS (
      SELECT tutor_id,
             COUNT(*) FILTER (WHERE status = 'active')::int AS active_packages,
             MIN(GREATEST(0, total_sessions - used_sessions)) FILTER (WHERE status = 'active')::int AS min_sessions_remaining
      FROM customer_packages
      WHERE deleted_at IS NULL
      GROUP BY tutor_id
    ), fin AS (
      SELECT tutor_id,
             COUNT(*) FILTER (WHERE type='income' AND status <> 'paid')::int AS pending_count,
             COALESCE(SUM(amount_cents) FILTER (WHERE type='income' AND status <> 'paid'),0)::int AS pending_cents
      FROM financial_transactions
      WHERE deleted_at IS NULL
      GROUP BY tutor_id
    ), wa AS (
      SELECT regexp_replace(COALESCE(phone,''), '[^0-9]', '', 'g') AS phone_digits,
             MAX(created_at) FILTER (WHERE direction='outbound') AS last_outbound_at
      FROM whatsapp_messages
      GROUP BY regexp_replace(COALESCE(phone,''), '[^0-9]', '', 'g')
    )
    SELECT t.id, t.name, t.whatsapp,
           COALESCE(pi.pets_count,0)::int AS pets_count,
           pi.last_pet_name,
           COALESCE(ap.appointments_count,0)::int AS appointments_count,
           ap.last_appointment_at, ap.next_appointment_at,
           COALESCE(aa.total_accesses,0)::int AS total_accesses,
           aa.last_access_at,
           COALESCE(pkg.active_packages,0)::int AS active_packages,
           pkg.min_sessions_remaining,
           COALESCE(fin.pending_count,0)::int AS pending_count,
           COALESCE(fin.pending_cents,0)::int AS pending_cents,
           wa.last_outbound_at
    FROM tutors t
    LEFT JOIN ap ON ap.tutor_id = t.id
    LEFT JOIN pet_info pi ON pi.tutor_id = t.id
    LEFT JOIN app_access aa ON aa.tutor_id = t.id
    LEFT JOIN pkg ON pkg.tutor_id = t.id
    LEFT JOIN fin ON fin.tutor_id = t.id
    LEFT JOIN wa ON wa.phone_digits = regexp_replace(COALESCE(t.whatsapp,''), '[^0-9]', '', 'g')
    WHERE t.deleted_at IS NULL AND COALESCE(t.status,'active') <> 'deleted'
  `);

  let items = result.rows.map(buildClientRadarItem);
  if (segment && segment !== 'all') items = items.filter((item) => item.segment === segment);
  if (priority && priority !== 'all') items = items.filter((item) => item.priority === priority || (priority === 'media' && item.priority === 'média'));
  if (onlyReady) items = items.filter((item) => item.canSendToday);
  items.sort((a, b) => {
    if (b.canSendToday !== a.canSendToday) return Number(b.canSendToday) - Number(a.canSendToday);
    if (b.score !== a.score) return b.score - a.score;
    return String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR');
  });

  let openaiUsed = false;
  if (useAi) {
    const aiItems = await askOpenAiForClientRadar(items);
    if (aiItems?.length) {
      const byId = new Map(aiItems.map((item) => [String(item.tutorId), item]));
      items = items.map((item) => {
        const ai = byId.get(String(item.tutorId));
        if (!ai) return item;
        openaiUsed = true;
        return {
          ...item,
          reason: cleanText(ai.reason) || item.reason,
          benefit: cleanText(ai.benefit) || item.benefit,
          message: cleanText(ai.message) || item.message
        };
      });
    }
  }

  const metrics = items.reduce((acc, item) => {
    acc.total += 1;
    if (item.canSendToday) acc.ready += 1;
    if (!item.canSendToday) acc.waiting += 1;
    if (item.priority === 'alta') acc.high += 1;
    if (item.segment === 'primeiro_acesso_app') acc.neverAccess += 1;
    if (['cliente_em_risco','cliente_perdido','cliente_em_atencao'].includes(item.segment)) acc.risk += 1;
    return acc;
  }, { total: 0, ready: 0, waiting: 0, high: 0, neverAccess: 0, risk: 0 });

  return {
    status: 'ok',
    title: 'Radar IA de Clientes',
    dateLabel: todayPtBrLabel(),
    openaiConfigured: Boolean(env.openaiApiKey),
    openaiUsed,
    generatedAt: new Date().toISOString(),
    metrics,
    items
  };
}

app.get('/api/client-radar/daily', requireAuth, async (req, res, next) => {
  try {
    const data = await getClientRadarDaily({
      useAi: String(req.query.ai || 'true') !== 'false',
      segment: cleanText(req.query.segment || 'all') || 'all',
      priority: cleanText(req.query.priority || 'all') || 'all',
      onlyReady: String(req.query.ready || 'false') === 'true'
    });
    res.json(data);
  } catch (error) { next(error); }
});




function appDocumentLinks(row = {}) {
  if (row.customer_package_id) {
    return {
      commandUrl: `/documentos/pacote-comanda/${row.customer_package_id}`,
      receiptUrl: `/documentos/pacote-recibo/${row.customer_package_id}`
    };
  }
  return {
    commandUrl: row.id ? `/documentos/comanda/${row.id}` : null,
    receiptUrl: row.receipt_token ? `/documentos/recibo/${row.receipt_token}` : null
  };
}

function sanitizeClientPet(row = {}) {
  return {
    id: row.id,
    name: row.name,
    photoUrl: row.photo_url || null,
    species: row.species || 'dog',
    breed: row.breed || '',
    size: row.size || '',
    coatType: row.coat_type || '',
    birthDate: row.birth_date || null,
    weightKg: row.weight_kg !== null && row.weight_kg !== undefined ? Number(row.weight_kg) : null,
    preferences: row.preferences || '',
    restrictions: row.restrictions || '',
    notes: row.notes || '',
    status: row.status || 'active'
  };
}

function sanitizeClientPackage(row = {}) {
  const total = Number(row.total_sessions || 0);
  const used = Number(row.used_sessions || 0);
  return {
    id: row.id,
    packageId: row.package_id,
    name: row.package_name || 'Pacote PetFunny',
    petId: row.pet_id,
    petName: row.pet_name || 'Pet',
    status: row.status,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    totalSessions: total,
    usedSessions: used,
    remainingSessions: Math.max(0, total - used),
    amountCents: Number(row.amount_cents || 0),
    paymentStatus: row.payment_status || 'pending',
    recurring: Boolean(row.recurring),
    cycleNumber: Number(row.cycle_number || 1),
    commandUrl: `/documentos/pacote-comanda/${row.id}`,
    receiptUrl: `/documentos/pacote-recibo/${row.id}`
  };
}

function sanitizeClientAppointment(row = {}) {
  const links = appDocumentLinks(row);
  const packageSessionNumber = row.package_session_number ? Number(row.package_session_number) : null;
  const packageTotalSessions = row.package_total_sessions ? Number(row.package_total_sessions) : null;
  const packageSessionLabel = row.package_session_label || (packageSessionNumber && packageTotalSessions ? `${packageSessionNumber} de ${packageTotalSessions}` : null);
  return {
    id: row.id,
    petId: row.pet_id,
    petName: row.pet_name || 'Pet',
    petPhotoUrl: row.pet_photo_url || null,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    statusName: row.status_name || row.status,
    statusColor: row.status_color || '#00a9b7',
    services: row.services || '',
    totalCents: Number(row.total_cents || 0),
    paymentStatus: row.payment_status || 'pending',
    customerPackageId: row.customer_package_id || null,
    packageSessionNumber,
    packageTotalSessions,
    packageSessionLabel,
    commandUrl: links.commandUrl,
    receiptUrl: links.receiptUrl
  };
}

function makeClientAppointmentTimelineEvent(row = {}) {
  const statusCode = String(row.status || '').toLowerCase();
  const petName = row.pet_name || 'seu pet';
  const statusName = row.status_name || row.status || 'atualizado';
  const when = row.starts_at ? formatDateTimePt(row.starts_at) : '';
  const services = row.services || 'Serviços PetFunny';
  const variants = {
    agendado: { icon: '📅', label: 'Solicitação enviada', title: `Horário solicitado para ${petName}`, text: `${when ? `${when} · ` : ''}${services}` },
    confirmado: { icon: '✅', label: 'Agendamento confirmado', title: `PetFunny confirmou o horário de ${petName}`, text: `${when ? `${when} · ` : ''}${services}. Estamos esperando vocês com carinho.` },
    em_atendimento: { icon: '🛁', label: 'Atendimento iniciado', title: `${petName} já está em atendimento`, text: 'A equipe PetFunny iniciou o cuidado. Você acompanha as novidades por aqui.' },
    finalizado: { icon: '✨', label: 'Atendimento finalizado', title: `${petName} finalizou o atendimento`, text: 'A comanda e o recibo ficam disponíveis no histórico do app.' },
    cancelado: { icon: '⚠️', label: 'Agendamento cancelado', title: `Horário de ${petName} foi cancelado`, text: `${when ? `${when} · ` : ''}Quando quiser, você pode solicitar um novo horário pelo app.` },
    nao_compareceu: { icon: '↩️', label: 'Reagendamento sugerido', title: `${petName} não compareceu ao horário`, text: 'Você pode solicitar uma nova data direto pela agenda do app.' }
  };
  const event = variants[statusCode] || {
    icon: '🔔',
    label: 'Atualização do agendamento',
    title: `Status de ${petName}: ${statusName}`,
    text: `${when ? `${when} · ` : ''}${services}`
  };
  return {
    id: `appointment-${row.id}-${statusCode}`,
    type: 'appointment_status',
    icon: event.icon,
    label: event.label,
    title: event.title,
    text: event.text,
    ctaLabel: 'Ver agenda',
    url: '/app/agenda',
    createdAt: row.updated_at || row.created_at || row.starts_at || null,
    appointmentId: row.id,
    status: statusCode
  };
}

async function safeClientSummaryQuery(label, sql, params = []) {
  try {
    return await query(sql, params);
  } catch (error) {
    console.warn(`[app:summary] ${label} indisponível:`, error.message);
    return { rows: [], rowCount: 0 };
  }
}


function normalizeCareText(value = '') {
  return String(value || '').trim().toLowerCase();
}

function buildLocalCareInsight({ pet = {}, lastAppointment = null, healthScore = null, lastTriage = null, activePackage = null } = {}) {
  const petName = pet.name || 'Seu pet';
  const breed = normalizeCareText(pet.breed);
  const size = normalizeCareText(pet.size);
  const coat = normalizeCareText(pet.coat_type || pet.coatType);
  const species = normalizeCareText(pet.species || 'dog');
  const daysWithoutAppointment = lastAppointment?.starts_at ? daysSince(lastAppointment.starts_at) : null;
  const health = Number(healthScore?.score || 0);
  const risk = normalizeCareText(lastTriage?.risk_level);
  const signs = normalizeCareText(`${lastTriage?.summary || ''} ${lastTriage?.guidance || ''} ${lastTriage?.raw_result ? JSON.stringify(lastTriage.raw_result) : ''}`);

  const insight = {
    petId: pet.id,
    title: 'Cuidado recomendado',
    message: `${petName} está pronto para ter uma rotina de cuidados acompanhada pelo PetFunny. Mantenha banho, pelagem e Saúde 360 em dia para gerar histórico inteligente.`,
    priority: 'normal',
    ctaLabel: 'Agendar cuidado',
    ctaAction: 'schedule',
    url: '/app/agenda',
    source: 'local_rules',
    facts: []
  };

  if (breed) insight.facts.push(`Raça: ${pet.breed}`);
  if (size) insight.facts.push(`Porte: ${pet.size}`);
  if (coat) insight.facts.push(`Pelagem: ${pet.coat_type || pet.coatType}`);
  if (activePackage) insight.facts.push(`Pacote ativo: ${activePackage.package_name || activePackage.name || 'PetFunny'}`);

  if (risk === 'high' || signs.includes('emerg') || signs.includes('respirar') || signs.includes('convuls') || signs.includes('sangue')) {
    return {
      ...insight,
      title: 'Atenção veterinária recomendada',
      message: `${petName} possui sinais recentes no Saúde 360 que merecem avaliação profissional. A IA não diagnostica, mas recomenda orientação veterinária para decidir o próximo passo com segurança.`,
      priority: 'high',
      ctaLabel: 'Agendar teleconsulta',
      ctaAction: 'teleconsultation',
      url: '/app/teleconsultas'
    };
  }
  if (risk === 'medium' || (health > 0 && health < 75)) {
    return {
      ...insight,
      title: 'Saúde 360 pede acompanhamento',
      message: `${petName} teve uma leitura preventiva que merece observação. Registre evolução nos próximos dias e considere uma teleconsulta se os sinais persistirem.`,
      priority: 'attention',
      ctaLabel: 'Ver Saúde 360',
      ctaAction: 'health360',
      url: '/app/saude-360'
    };
  }

  if (coat.includes('long') || coat.includes('longo') || coat.includes('médio') || coat.includes('medio') || breed.includes('shih') || breed.includes('lhasa') || breed.includes('poodle') || breed.includes('spitz') || breed.includes('york')) {
    return {
      ...insight,
      title: 'Pelagem pede rotina preventiva',
      message: `${petName} tem perfil de pelagem que costuma precisar de escovação frequente, banho regular e atenção a nós, pele e orelhas. Uma rotina quinzenal ou semanal ajuda a evitar desconfortos.`,
      priority: 'normal',
      ctaLabel: 'Agendar banho/tosa',
      ctaAction: 'grooming',
      url: '/app/agenda'
    };
  }

  if (daysWithoutAppointment !== null && daysWithoutAppointment >= 30) {
    return {
      ...insight,
      title: 'Hora de retomar os cuidados',
      message: `${petName} está há ${daysWithoutAppointment} dias sem atendimento registrado. Agendar banho, tosa ou hidratação ajuda a manter higiene, conforto e histórico do cuidado em dia.`,
      priority: daysWithoutAppointment >= 45 ? 'attention' : 'normal',
      ctaLabel: 'Agendar banho',
      ctaAction: 'bath',
      url: '/app/agenda'
    };
  }

  if (activePackage) {
    return {
      ...insight,
      title: 'Rotina protegida pelo pacote',
      message: `${petName} possui pacote ativo. Continue usando as sessões para manter recorrência, previsibilidade e acompanhamento pelo App do Tutor.`,
      priority: 'normal',
      ctaLabel: 'Ver pacote',
      ctaAction: 'package',
      url: '/app/pacotes'
    };
  }

  if (species.includes('cat') || species.includes('gato')) {
    return {
      ...insight,
      title: 'Cuidado gentil para gatos',
      message: `${petName} pode se beneficiar de uma rotina tranquila, com avaliação de pele, pelagem, unhas e comportamento. Registre observações no Saúde 360 para acompanhar mudanças.`,
      priority: 'normal',
      ctaLabel: 'Ver Saúde 360',
      ctaAction: 'health360',
      url: '/app/saude-360'
    };
  }

  return insight;
}

async function getPetCareInsightForClient(petId, tutorId) {
  const pet = await getPetAccessForClient(petId, tutorId);
  if (!pet) return null;
  const [lastAppointment, activePackage, lastScore, lastTriage] = await Promise.all([
    query(`SELECT * FROM appointments WHERE tutor_id=$1::uuid AND pet_id=$2::uuid AND deleted_at IS NULL ORDER BY starts_at DESC NULLS LAST, created_at DESC LIMIT 1`, [tutorId, pet.id]).catch(() => ({ rows: [] })),
    query(`SELECT cp.*, pk.name AS package_name FROM customer_packages cp LEFT JOIN packages pk ON pk.id=cp.package_id WHERE cp.tutor_id=$1::uuid AND cp.pet_id=$2::uuid AND cp.deleted_at IS NULL AND cp.status='active' ORDER BY cp.created_at DESC LIMIT 1`, [tutorId, pet.id]).catch(() => ({ rows: [] })),
    query(`SELECT * FROM pet_health_scores WHERE tutor_id=$1::uuid AND pet_id=$2::uuid AND deleted_at IS NULL ORDER BY calculated_at DESC, created_at DESC LIMIT 1`, [tutorId, pet.id]).catch(() => ({ rows: [] })),
    query(`SELECT * FROM pet_health_triages WHERE tutor_id=$1::uuid AND pet_id=$2::uuid AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`, [tutorId, pet.id]).catch(() => ({ rows: [] }))
  ]);
  return buildLocalCareInsight({
    pet,
    lastAppointment: lastAppointment.rows[0] || null,
    activePackage: activePackage.rows[0] || null,
    healthScore: lastScore.rows[0] || null,
    lastTriage: lastTriage.rows[0] || null
  });
}


const REWARD_RULES = {
  appointment_created_app: 2,
  appointment_completed: 3,
  package_purchased: 8,
  review_submitted: 2,
  referral_created: 5,
  referral_converted: 15,
  share_media: 1
};

function engagementLevelFromPoints(points = 0) {
  const p = Number(points || 0);
  if (p >= 80) return 'ouro';
  if (p >= 40) return 'vip';
  if (p >= 15) return 'recorrente';
  return 'inicial';
}

function engagementLevelLabel(level = 'inicial') {
  return ({ inicial: 'Cliente PetFunny', recorrente: 'Cliente Recorrente', vip: 'Cliente VIP', ouro: 'Cliente Ouro' }[level] || 'Cliente PetFunny');
}

function daysSince(dateValue) {
  if (!dateValue) return null;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
}

function computeTutorEngagementStatus({ totalAppointments = 0, lastAppointmentAt = null, activePackages = 0, points = 0, createdAt = null } = {}) {
  const total = Number(totalAppointments || 0);
  const days = daysSince(lastAppointmentAt);
  if (!total) return { code: 'novo_lead', label: 'Novo lead', tone: 'info', message: 'Ainda não agendou pelo PetFunny.' };
  if (days !== null && days > 90) return { code: 'em_risco_cancelamento', label: 'Em risco de cancelamento', tone: 'danger', message: `${days} dias sem agendar.` };
  if (days !== null && days > 45) return { code: 'em_atencao', label: 'Em atenção', tone: 'warning', message: `${days} dias sem agendar.` };
  if (Number(points || 0) >= 80 || (activePackages > 0 && total >= 8 && days <= 45)) return { code: 'cliente_ouro', label: 'Cliente Ouro', tone: 'success', message: 'Alta recorrência e vínculo com a PetFunny.' };
  if (Number(points || 0) >= 40 || (activePackages > 0 && total >= 4)) return { code: 'cliente_vip', label: 'Cliente VIP', tone: 'success', message: 'Pacote ativo e rotina de cuidados.' };
  if (activePackages > 0 || total >= 2) return { code: 'cliente_recorrente', label: 'Cliente Recorrente', tone: 'success', message: 'Mantém rotina de cuidados.' };
  return { code: 'ativo', label: 'Cliente Ativo', tone: 'info', message: 'Já teve atendimento PetFunny.' };
}

function rewardNextGoal(points = 0) {
  const p = Number(points || 0);
  const goals = [
    { points: 10, label: 'brinde surpresa' },
    { points: 20, label: 'hidratação especial' },
    { points: 40, label: 'benefício VIP PetFunny' },
    { points: 80, label: 'status Cliente Ouro' }
  ];
  const next = goals.find((g) => p < g.points) || { points: p + 20, label: 'novo mimo PetFunny' };
  return { target: next.points, label: next.label, remaining: Math.max(0, next.points - p), progressPercent: Math.min(100, Math.round((p / next.points) * 100)) };
}

async function ensureTutorRewards(tutorId) {
  const result = await query(`
    INSERT INTO tutor_rewards (tutor_id, points_balance, level)
    VALUES ($1::uuid, 0, 'inicial')
    ON CONFLICT (tutor_id) DO UPDATE SET updated_at = tutor_rewards.updated_at
    RETURNING *
  `, [tutorId]);
  return result.rows[0] || null;
}

async function getTutorRewardsSummary(tutorId) {
  try {
    const reward = await ensureTutorRewards(tutorId);
    const points = Number(reward?.points_balance || 0);
    const level = engagementLevelFromPoints(points);
    if (reward && reward.level !== level) {
      await query(`UPDATE tutor_rewards SET level=$2::text, updated_at=NOW() WHERE tutor_id=$1::uuid`, [tutorId, level]).catch(() => null);
    }
    const events = await query(`
      SELECT id, event_type, points, description, pet_id, appointment_id, customer_package_id, metadata, created_at
      FROM tutor_reward_events
      WHERE tutor_id=$1::uuid
      ORDER BY created_at DESC
      LIMIT 12
    `, [tutorId]).catch(() => ({ rows: [] }));
    return { pointsBalance: points, level, levelLabel: engagementLevelLabel(level), nextGoal: rewardNextGoal(points), events: events.rows.map((row) => ({ id: row.id, type: row.event_type, points: Number(row.points || 0), description: row.description || '', createdAt: row.created_at })) };
  } catch (error) {
    console.warn('[rewards] resumo indisponível:', error.message);
    return { pointsBalance: 0, level: 'inicial', levelLabel: 'Cliente PetFunny', nextGoal: rewardNextGoal(0), events: [] };
  }
}

async function awardTutorPoints({ tutorId, petId = null, appointmentId = null, customerPackageId = null, eventType, points = null, description = '', metadata = {} }) {
  const value = Number(points ?? REWARD_RULES[eventType] ?? 0);
  if (!tutorId || !eventType || !value) return null;
  await ensureTutorRewards(tutorId);
  const result = await query(`
    INSERT INTO tutor_reward_events (tutor_id, pet_id, appointment_id, customer_package_id, event_type, points, description, metadata)
    VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::text, $6::int, $7::text, $8::jsonb)
    ON CONFLICT DO NOTHING
    RETURNING *
  `, [tutorId, petId || null, appointmentId || null, customerPackageId || null, eventType, value, description || '', JSON.stringify(metadata || {})]);
  if (result.rowCount) {
    await query(`UPDATE tutor_rewards SET points_balance = points_balance + $2::int, level = $3::text, updated_at = NOW() WHERE tutor_id=$1::uuid`, [tutorId, value, engagementLevelFromPoints(value)]).catch(() => null);
  }
  return result.rows[0] || null;
}

async function buildClientEngagementSummary(tutorId, base = {}) {
  const rewards = await getTutorRewardsSummary(tutorId);
  const appointmentStats = await query(`
    SELECT COUNT(*)::int AS total_appointments,
           MAX(starts_at) FILTER (WHERE starts_at <= NOW()) AS last_appointment_at,
           COUNT(*) FILTER (WHERE starts_at >= NOW() AND deleted_at IS NULL)::int AS upcoming_count,
           COALESCE(AVG(NULLIF(total_cents,0)),0)::int AS avg_ticket_cents
    FROM appointments
    WHERE tutor_id=$1::uuid AND deleted_at IS NULL
  `, [tutorId]).catch(() => ({ rows: [{}] }));
  const pkgStats = await query(`
    SELECT COUNT(*) FILTER (WHERE status='active' AND deleted_at IS NULL)::int AS active_packages
    FROM customer_packages WHERE tutor_id=$1::uuid
  `, [tutorId]).catch(() => ({ rows: [{}] }));
  const stats = { ...(appointmentStats.rows[0] || {}), ...(pkgStats.rows[0] || {}) };
  const customerStatus = computeTutorEngagementStatus({
    totalAppointments: stats.total_appointments,
    lastAppointmentAt: stats.last_appointment_at,
    activePackages: stats.active_packages,
    points: rewards.pointsBalance,
    createdAt: base?.tutor?.created_at
  });
  const activePet = base?.pets?.[0] || null;
  return {
    tutor: base?.tutor || null,
    activePet,
    customerStatus,
    rewards,
    metrics: {
      totalAppointments: Number(stats.total_appointments || 0),
      lastAppointmentAt: stats.last_appointment_at || null,
      daysWithoutAppointment: daysSince(stats.last_appointment_at),
      activePackages: Number(stats.active_packages || 0),
      upcomingAppointments: Number(stats.upcoming_count || 0),
      avgTicketCents: Number(stats.avg_ticket_cents || 0)
    },
    whatsapp: {
      label: 'Falar com a PetFunny',
      url: 'https://wa.me/5516981535338?text=' + encodeURIComponent('Oi, PetFunny! Vim pelo app e quero cuidar do meu pet 🐶')
    }
  };
}

app.get('/api/app/summary', requireClientAuth, async (req, res, next) => {
  try {
    const tutorId = req.clientApp.tutor.id;
    let business;
    try {
      business = await getBusinessPayload();
    } catch (businessError) {
      console.warn('[app:summary] business payload indisponível:', businessError.message);
      business = {
        businessName: 'PetFunny - Banho e Tosa',
        whatsapp: '5516981535338',
        addressCity: 'Ribeirão Preto',
        addressState: 'SP'
      };
    }

    const petsResult = await safeClientSummaryQuery('pets', `
      SELECT id, name, photo_url, species, breed, size, coat_type, birth_date, weight_kg, preferences, restrictions, notes, status
      FROM pets
      WHERE tutor_id = $1::uuid
        AND deleted_at IS NULL
      ORDER BY name ASC
    `, [tutorId]);

    const appointmentsResult = await safeClientSummaryQuery('upcoming appointments', `
      SELECT a.id, a.pet_id, p.name AS pet_name, p.photo_url AS pet_photo_url,
             a.starts_at, a.ends_at, a.status, s.name AS status_name, s.color AS status_color,
             a.total_cents, a.payment_status, a.customer_package_id, a.package_session_number, a.package_total_sessions, a.package_session_label,
             COALESCE(string_agg(DISTINCT ai.description, ', '), '') AS services
      FROM appointments a
      LEFT JOIN pets p ON p.id = a.pet_id
      LEFT JOIN appointment_statuses s ON s.code = a.status
      LEFT JOIN appointment_items ai ON ai.appointment_id = a.id
      WHERE a.tutor_id = $1::uuid
        AND a.deleted_at IS NULL
        AND a.starts_at >= NOW() - INTERVAL '2 hours'
        AND a.status NOT IN ('cancelado', 'nao_compareceu')
      GROUP BY a.id, p.name, p.photo_url, s.name, s.color
      ORDER BY a.starts_at ASC
      LIMIT 12
    `, [tutorId]);

    const historyResult = await safeClientSummaryQuery('history', `
      SELECT a.id, a.pet_id, p.name AS pet_name, p.photo_url AS pet_photo_url,
             a.starts_at, a.ends_at, a.status, s.name AS status_name, s.color AS status_color,
             a.total_cents, a.payment_status, a.customer_package_id, a.package_session_number, a.package_total_sessions, a.package_session_label,
             MAX(r.public_token) AS receipt_token,
             COALESCE(string_agg(DISTINCT ai.description, ', '), '') AS services
      FROM appointments a
      LEFT JOIN pets p ON p.id = a.pet_id
      LEFT JOIN appointment_statuses s ON s.code = a.status
      LEFT JOIN appointment_items ai ON ai.appointment_id = a.id
      LEFT JOIN receipts r ON r.appointment_id = a.id
      WHERE a.tutor_id = $1::uuid
        AND a.deleted_at IS NULL
        AND (a.starts_at < NOW() OR a.status IN ('finalizado', 'cancelado', 'nao_compareceu'))
      GROUP BY a.id, p.name, p.photo_url, s.name, s.color
      ORDER BY a.starts_at DESC
      LIMIT 20
    `, [tutorId]);

    const packagesResult = await safeClientSummaryQuery('packages', `
      SELECT cp.id, cp.package_id, cp.pet_id, cp.status, cp.starts_on, cp.ends_on, cp.total_sessions, cp.used_sessions,
             cp.amount_cents, cp.payment_status, cp.recurring, cp.cycle_number,
             pk.name AS package_name, p.name AS pet_name
      FROM customer_packages cp
      INNER JOIN packages pk ON pk.id = cp.package_id
      LEFT JOIN pets p ON p.id = cp.pet_id
      WHERE cp.tutor_id = $1::uuid
        AND cp.deleted_at IS NULL
      ORDER BY cp.created_at DESC
      LIMIT 20
    `, [tutorId]);

    const timelineResult = await safeClientSummaryQuery('timeline appointment updates', `
      SELECT a.id, a.pet_id, p.name AS pet_name,
             a.starts_at, a.ends_at, a.status, s.name AS status_name, s.color AS status_color,
             a.updated_at, a.created_at,
             COALESCE(string_agg(DISTINCT ai.description, ', '), '') AS services
      FROM appointments a
      LEFT JOIN pets p ON p.id = a.pet_id
      LEFT JOIN appointment_statuses s ON s.code = a.status
      LEFT JOIN appointment_items ai ON ai.appointment_id = a.id
      WHERE a.tutor_id = $1::uuid
        AND a.deleted_at IS NULL
        AND a.status IN ('confirmado','em_atendimento','finalizado','cancelado','nao_compareceu')
        AND a.updated_at >= NOW() - INTERVAL '45 days'
      GROUP BY a.id, p.name, s.name, s.color
      ORDER BY a.updated_at DESC
      LIMIT 12
    `, [tutorId]);

    const wellbeingTimelineResult = await safeClientSummaryQuery('petfunny360 timeline', `
      SELECT wi.id, wi.title, wi.message, wi.severity, wi.created_at, p.name AS pet_name, wi.pet_id
      FROM pet_wellbeing_insights wi
      INNER JOIN pets p ON p.id = wi.pet_id
      WHERE p.tutor_id = $1::uuid
        AND wi.deleted_at IS NULL
        AND wi.visible_to_tutor = TRUE
        AND wi.created_at >= NOW() - INTERVAL '90 days'
      ORDER BY wi.created_at DESC
      LIMIT 20
    `, [tutorId]);
    const wellbeingEvents = wellbeingTimelineResult.rows.map((row) => ({
      id: `wellbeing-${row.id}`,
      type: 'petfunny360',
      icon: row.severity === 'warning' ? '🧠⚠️' : '🧠',
      label: 'PetFunny 360 IA',
      title: row.title || `Bem-estar de ${row.pet_name || 'pet'}`,
      text: row.message || 'Novo diagnóstico de bem-estar disponível.',
      createdAt: row.created_at,
      url: `/app/bem-estar?petId=${row.pet_id}`,
      ctaLabel: 'Ver diagnóstico 360'
    }));

    const healthTimelineResult = await safeClientSummaryQuery('health360 timeline', `
      SELECT ht.id, ht.pet_id, ht.risk_level, ht.summary, ht.guidance, ht.recommended_action, ht.created_at, p.name AS pet_name
      FROM pet_health_triages ht
      INNER JOIN pets p ON p.id = ht.pet_id
      WHERE ht.tutor_id = $1::uuid
        AND ht.deleted_at IS NULL
        AND ht.created_at >= NOW() - INTERVAL '90 days'
      ORDER BY ht.created_at DESC
      LIMIT 12
    `, [tutorId]);
    const teleTimelineResult = await safeClientSummaryQuery('teleconsultation timeline', `
      SELECT tc.id, tc.pet_id, tc.status, tc.payment_status, tc.starts_at, tc.reason, tc.meeting_url, tc.created_at, p.name AS pet_name, v.name AS veterinarian_name
      FROM teleconsultations tc
      INNER JOIN pets p ON p.id = tc.pet_id
      LEFT JOIN veterinarians v ON v.id = tc.veterinarian_id
      WHERE tc.tutor_id = $1::uuid
        AND tc.deleted_at IS NULL
        AND tc.created_at >= NOW() - INTERVAL '90 days'
      ORDER BY COALESCE(tc.starts_at, tc.created_at) DESC
      LIMIT 12
    `, [tutorId]);
    const healthEvents = healthTimelineResult.rows.map((row) => ({
      id: `health360-triage-${row.id}`,
      type: 'health360_triage',
      icon: row.risk_level === 'high' ? '🚨' : row.risk_level === 'medium' ? '🟡' : '🩺',
      label: 'Saúde 360 IA',
      title: row.risk_level === 'high' ? `Atenção urgente para ${row.pet_name || 'pet'}` : `Triagem de ${row.pet_name || 'pet'} registrada`,
      text: row.summary || row.guidance || 'Nova análise preventiva registrada.',
      createdAt: row.created_at,
      url: `/app/teleconsultas?petId=${row.pet_id}`,
      ctaLabel: row.risk_level === 'high' ? 'Ver orientação' : 'Ver Saúde 360'
    }));
    const teleEvents = teleTimelineResult.rows.map((row) => ({
      id: `health360-tele-${row.id}`,
      type: 'health360_teleconsultation',
      icon: '🩺',
      label: 'Teleconsulta veterinária',
      title: `${row.veterinarian_name || 'Veterinário parceiro'} · ${row.pet_name || 'Pet'}`,
      text: row.starts_at ? `Teleconsulta ${row.status || 'solicitada'} para ${new Date(row.starts_at).toLocaleString('pt-BR')}.` : 'Teleconsulta solicitada pelo Saúde 360.',
      createdAt: row.created_at || row.starts_at,
      url: row.meeting_url || `/app/teleconsultas?petId=${row.pet_id}`,
      ctaLabel: row.meeting_url ? 'Entrar na consulta' : 'Ver teleconsulta'
    }));

    const nextAppointment = appointmentsResult.rows[0] ? sanitizeClientAppointment(appointmentsResult.rows[0]) : null;
    const activePackages = packagesResult.rows.filter((row) => row.status === 'active');
    const sanitizedPets = petsResult.rows.map(sanitizeClientPet);
    const rewards = await getTutorRewardsSummary(tutorId);
    const engagement = await buildClientEngagementSummary(tutorId, { tutor: req.clientApp.tutor, pets: sanitizedPets });
    const activePetForInsight = engagement.activePet || sanitizedPets[0] || null;
    const careInsight = activePetForInsight?.id ? await getPetCareInsightForClient(activePetForInsight.id, tutorId).catch(() => null) : null;
    const mediaPreviewResult = await safeClientSummaryQuery('appointment media preview', `
      SELECT am.id, am.appointment_id, am.pet_id, am.media_type, am.url, am.caption, am.created_at,
             p.name AS pet_name, a.starts_at, COALESCE(string_agg(DISTINCT ai.description, ', '), '') AS services
      FROM appointment_media am
      LEFT JOIN pets p ON p.id = am.pet_id
      LEFT JOIN appointments a ON a.id = am.appointment_id
      LEFT JOIN appointment_items ai ON ai.appointment_id = a.id
      WHERE am.tutor_id = $1::uuid
        AND am.deleted_at IS NULL
      GROUP BY am.id, p.name, a.starts_at
      ORDER BY am.created_at DESC
      LIMIT 8
    `, [tutorId]);
    const mediaPreview = mediaPreviewResult.rows.map((row) => ({
      id: row.id, appointmentId: row.appointment_id, petId: row.pet_id, petName: row.pet_name || 'Pet',
      mediaType: row.media_type || 'photo', url: row.url, caption: row.caption || '', createdAt: row.created_at,
      startsAt: row.starts_at, services: row.services || ''
    }));
    res.json({
      ok: true,
      tutor: req.clientApp.tutor,
      account: req.clientApp.account,
      business,
      stats: {
        pets: petsResult.rows.length,
        upcomingAppointments: appointmentsResult.rows.length,
        activePackages: activePackages.length,
        history: historyResult.rows.length
      },
      nextAppointment,
      pets: sanitizedPets,
      upcomingAppointments: appointmentsResult.rows.map(sanitizeClientAppointment),
      history: historyResult.rows.map(sanitizeClientAppointment),
      packages: packagesResult.rows.map(sanitizeClientPackage),
      rewards,
      engagement,
      careInsight,
      mediaPreview,
      referral: await getTutorReferralSummary(tutorId, req.clientApp.tutor?.name || 'Tutor PetFunny'),
      timelineEvents: [...timelineResult.rows.map(makeClientAppointmentTimelineEvent), ...wellbeingEvents, ...healthEvents, ...teleEvents],
      health360Timeline: [...healthEvents, ...teleEvents]
    });
  } catch (error) {
    next(error);
  }
});



app.get('/api/app/engagement/summary', requireClientAuth, async (req, res, next) => {
  try {
    const tutorId = req.clientApp.tutor.id;
    const petsResult = await safeClientSummaryQuery('engagement pets', `
      SELECT id, name, photo_url, species, breed, size, coat_type, birth_date, weight_kg, preferences, restrictions, notes, status
      FROM pets
      WHERE tutor_id = $1::uuid AND deleted_at IS NULL
      ORDER BY created_at ASC
    `, [tutorId]);
    const pets = petsResult.rows.map(sanitizeClientPet);
    const nextAppointmentResult = await safeClientSummaryQuery('engagement next appointment', `
      SELECT a.id, a.pet_id, p.name AS pet_name, p.photo_url AS pet_photo_url,
             a.starts_at, a.ends_at, a.status, s.name AS status_name, s.color AS status_color,
             a.total_cents, a.payment_status, a.customer_package_id, a.package_session_number, a.package_total_sessions, a.package_session_label,
             COALESCE(string_agg(DISTINCT ai.description, ', '), '') AS services
      FROM appointments a
      LEFT JOIN pets p ON p.id = a.pet_id
      LEFT JOIN appointment_statuses s ON s.code = a.status
      LEFT JOIN appointment_items ai ON ai.appointment_id = a.id
      WHERE a.tutor_id = $1::uuid AND a.deleted_at IS NULL AND a.starts_at >= NOW() - INTERVAL '2 hours'
      GROUP BY a.id, p.name, p.photo_url, s.name, s.color
      ORDER BY a.starts_at ASC
      LIMIT 1
    `, [tutorId]);
    const engagement = await buildClientEngagementSummary(tutorId, { tutor: req.clientApp.tutor, pets });
    const activePetForInsight = engagement.activePet || pets[0] || null;
    const careInsight = activePetForInsight?.id ? await getPetCareInsightForClient(activePetForInsight.id, tutorId).catch(() => null) : null;
    const mediaPreviewResult = await safeClientSummaryQuery('appointment media preview', `
      SELECT am.id, am.appointment_id, am.pet_id, am.media_type, am.url, am.caption, am.created_at,
             p.name AS pet_name, a.starts_at, COALESCE(string_agg(DISTINCT ai.description, ', '), '') AS services
      FROM appointment_media am
      LEFT JOIN pets p ON p.id = am.pet_id
      LEFT JOIN appointments a ON a.id = am.appointment_id
      LEFT JOIN appointment_items ai ON ai.appointment_id = a.id
      WHERE am.tutor_id = $1::uuid
        AND am.deleted_at IS NULL
      GROUP BY am.id, p.name, a.starts_at
      ORDER BY am.created_at DESC
      LIMIT 8
    `, [tutorId]);
    const mediaPreview = mediaPreviewResult.rows.map((row) => ({
      id: row.id, appointmentId: row.appointment_id, petId: row.pet_id, petName: row.pet_name || 'Pet',
      mediaType: row.media_type || 'photo', url: row.url, caption: row.caption || '', createdAt: row.created_at,
      startsAt: row.starts_at, services: row.services || ''
    }));
    res.json({ ok: true, ...engagement, pets, careInsight, referral: await getTutorReferralSummary(tutorId, req.clientApp.tutor?.name || 'Tutor PetFunny'), nextAppointment: nextAppointmentResult.rows[0] ? sanitizeClientAppointment(nextAppointmentResult.rows[0]) : null });
  } catch (error) { next(error); }
});

app.get('/api/app/rewards/summary', requireClientAuth, async (req, res, next) => {
  try {
    res.json({ ok: true, rewards: await getTutorRewardsSummary(req.clientApp.tutor.id) });
  } catch (error) { next(error); }
});

app.get('/api/app/rewards/events', requireClientAuth, async (req, res, next) => {
  try {
    const result = await query(`
      SELECT re.id, re.event_type, re.points, re.description, re.created_at, p.name AS pet_name
      FROM tutor_reward_events re
      LEFT JOIN pets p ON p.id = re.pet_id
      WHERE re.tutor_id=$1::uuid
      ORDER BY re.created_at DESC
      LIMIT 50
    `, [req.clientApp.tutor.id]);
    res.json({ ok: true, items: result.rows.map((row) => ({ id: row.id, type: row.event_type, points: Number(row.points || 0), description: row.description || '', petName: row.pet_name || '', createdAt: row.created_at })) });
  } catch (error) { next(error); }
});

app.post('/api/app/rewards/share-event', requireClientAuth, async (req, res, next) => {
  try {
    const tutorId = req.clientApp.tutor.id;
    const petId = cleanText(req.body?.petId) || null;
    await awardTutorPoints({ tutorId, petId, eventType: 'share_media', points: REWARD_RULES.share_media, description: 'Compartilhou um momento do pet pelo App PetFunny.' });
    res.json({ ok: true, rewards: await getTutorRewardsSummary(tutorId) });
  } catch (error) { next(error); }
});




function referralCodeForTutor(tutorId = '') {
  const base = String(tutorId || '').replace(/[^a-z0-9]/gi, '').slice(0, 8).toUpperCase() || Math.random().toString(36).slice(2, 8).toUpperCase();
  return `PF${base}`;
}

async function ensureTutorReferralCode(tutorId) {
  const existing = await query(`
    SELECT referral_code
    FROM tutor_referrals
    WHERE referrer_tutor_id=$1::uuid AND deleted_at IS NULL
    ORDER BY created_at ASC
    LIMIT 1
  `, [tutorId]).catch(() => ({ rows: [] }));
  if (existing.rows[0]?.referral_code) return existing.rows[0].referral_code;
  return referralCodeForTutor(tutorId);
}

function buildReferralShareUrl(code) {
  const base = String(process.env.APP_URL || process.env.PUBLIC_APP_URL || 'https://agendapetfunny.com.br').replace(/\/$/, '');
  return `${base}/app/login?ref=${encodeURIComponent(code || '')}`;
}

function buildReferralWhatsappUrl(tutorName, code) {
  const link = buildReferralShareUrl(code);
  const message = [
    `Oi! Eu cuido do meu pet na PetFunny e queria te indicar 🐶✨`,
    `Use meu convite para conhecer o app, agendar banho/tosa e participar dos mimos PetFunny:`,
    link
  ].join('\n');
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

async function getTutorReferralSummary(tutorId, tutorName = 'Tutor PetFunny') {
  const code = await ensureTutorReferralCode(tutorId);
  const result = await query(`
    SELECT id, referred_name, referred_phone, status, reward_points, referral_code, created_at, converted_at
    FROM tutor_referrals
    WHERE referrer_tutor_id=$1::uuid AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT 20
  `, [tutorId]).catch(() => ({ rows: [] }));
  return {
    referralCode: code,
    shareLink: buildReferralShareUrl(code),
    whatsappUrl: buildReferralWhatsappUrl(tutorName, code),
    items: result.rows.map((row) => ({
      id: row.id,
      name: row.referred_name || 'Indicação',
      phone: row.referred_phone || '',
      status: row.status || 'created',
      rewardPoints: Number(row.reward_points || 0),
      referralCode: row.referral_code || code,
      createdAt: row.created_at,
      convertedAt: row.converted_at
    }))
  };
}

app.get('/api/app/referrals', requireClientAuth, async (req, res, next) => {
  try {
    const tutorId = req.clientApp.tutor.id;
    const code = await ensureTutorReferralCode(tutorId);
    const result = await query(`
      SELECT id, referred_name, referred_phone, status, reward_points, created_at, converted_at, referral_code
      FROM tutor_referrals
      WHERE referrer_tutor_id=$1::uuid AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT 80
    `, [tutorId]).catch(() => ({ rows: [] }));
    res.json({
      ok: true,
      referralCode: code,
      shareLink: buildReferralShareUrl(code),
      whatsappUrl: buildReferralWhatsappUrl(req.clientApp.tutor?.name || 'Tutor PetFunny', code),
      items: result.rows.map((row) => ({
        id: row.id,
        name: row.referred_name || 'Indicação',
        phone: row.referred_phone || '',
        status: row.status || 'created',
        rewardPoints: Number(row.reward_points || 0),
        referralCode: row.referral_code || code,
        createdAt: row.created_at,
        convertedAt: row.converted_at
      }))
    });
  } catch (error) { next(error); }
});

app.post('/api/app/referrals', requireClientAuth, async (req, res, next) => {
  try {
    const tutorId = req.clientApp.tutor.id;
    const name = cleanText(req.body?.name || req.body?.referredName) || 'Indicação PetFunny';
    const phone = normalizeWhatsapp(req.body?.phone || req.body?.whatsapp || req.body?.referredPhone || '');
    const code = await ensureTutorReferralCode(tutorId);
    if (!phone) return res.status(400).json({ error: 'Informe o WhatsApp da pessoa indicada.' });
    const inserted = await query(`
      INSERT INTO tutor_referrals (referrer_tutor_id, referred_name, referred_phone, referral_code, status, reward_points)
      VALUES ($1::uuid, $2::text, $3::text, $4::text, 'created', 5)
      RETURNING *
    `, [tutorId, name, phone, code]);
    await awardTutorPoints({
      tutorId,
      eventType: 'referral_created',
      points: REWARD_RULES.referral_created,
      description: `Indicou ${name} para conhecer a PetFunny.`,
      metadata: { referralId: inserted.rows[0].id, phone }
    }).catch(() => null);
    res.status(201).json({
      ok: true,
      referral: inserted.rows[0],
      shareLink: buildReferralShareUrl(code),
      whatsappUrl: buildReferralWhatsappUrl(req.clientApp.tutor?.name || 'Tutor PetFunny', code),
      rewards: await getTutorRewardsSummary(tutorId)
    });
  } catch (error) { next(error); }
});

app.get('/api/app/referrals/share-link', requireClientAuth, async (req, res, next) => {
  try {
    const code = await ensureTutorReferralCode(req.clientApp.tutor.id);
    res.json({ ok: true, referralCode: code, shareLink: buildReferralShareUrl(code), whatsappUrl: buildReferralWhatsappUrl(req.clientApp.tutor?.name || 'Tutor PetFunny', code) });
  } catch (error) { next(error); }
});

app.get('/api/promocoes', requireAuth, async (req, res, next) => {
  try {
    const result = await query(`
      SELECT pr.*, s.name AS service_name
      FROM promotions pr
      LEFT JOIN services s ON s.id = pr.service_id
      WHERE pr.deleted_at IS NULL
      ORDER BY pr.is_active DESC, pr.created_at DESC
    `);
    res.json({ promotions: result.rows.map(sanitizePromotion) });
  } catch (error) { next(error); }
});

app.get('/api/promocoes/options', requireAuth, async (req, res, next) => {
  try {
    const [services, sizes] = await Promise.all([
      query(`
        SELECT s.id, s.name, s.pet_size, sc.name AS category_name
        FROM services s
        LEFT JOIN service_categories sc ON sc.id = s.category_id
        WHERE s.deleted_at IS NULL AND s.is_active = TRUE
        ORDER BY sc.sort_order ASC NULLS LAST, sc.name ASC NULLS LAST, s.name ASC
      `),
      query(`SELECT code, name FROM pet_sizes WHERE is_active = TRUE ORDER BY sort_order ASC, name ASC`).catch(() => ({ rows: [] }))
    ]);
    res.json({
      services: services.rows.map((row) => ({ id: row.id, name: row.name, petSize: row.pet_size, categoryName: row.category_name || 'Serviços PetFunny' })),
      petSizes: sizes.rows.map((row) => ({ code: row.code, name: row.name }))
    });
  } catch (error) { next(error); }
});

app.post('/api/promocoes', requireAuth, async (req, res, next) => {
  try {
    const title = cleanText(req.body?.title);
    if (!title) return res.status(400).json({ error: 'Informe o nome da promoção.' });
    const discountPercent = Math.max(0, Math.min(100, Number(String(req.body?.discountPercent || '0').replace(',', '.')) || 0));
    if (discountPercent <= 0) return res.status(400).json({ error: 'Informe um desconto maior que zero.' });
    const weekdays = normalizeWeekdays(req.body?.weekdays);
    const result = await query(`
      INSERT INTO promotions (title, description, service_id, pet_size, discount_percent, weekdays, starts_on, ends_on, status, is_active)
      VALUES ($1::text, NULLIF($2::text,''), NULLIF($3::text,'')::uuid, COALESCE(NULLIF($4::text,''),'todos'), $5::numeric, $6::smallint[], NULLIF($7::text,'')::date, NULLIF($8::text,'')::date, COALESCE(NULLIF($9::text,''),'active'), $10::boolean)
      RETURNING *
    `, [title, cleanText(req.body?.description), cleanText(req.body?.serviceId), cleanText(req.body?.petSize), discountPercent, weekdays, cleanText(req.body?.startsOn), cleanText(req.body?.endsOn), cleanText(req.body?.status), req.body?.isActive !== false]);
    res.status(201).json({ promotion: sanitizePromotion(result.rows[0]), message: 'Promoção criada com sucesso.' });
  } catch (error) { next(error); }
});

app.put('/api/promocoes/:id', requireAuth, async (req, res, next) => {
  try {
    const title = cleanText(req.body?.title);
    if (!title) return res.status(400).json({ error: 'Informe o nome da promoção.' });
    const discountPercent = Math.max(0, Math.min(100, Number(String(req.body?.discountPercent || '0').replace(',', '.')) || 0));
    if (discountPercent <= 0) return res.status(400).json({ error: 'Informe um desconto maior que zero.' });
    const weekdays = normalizeWeekdays(req.body?.weekdays);
    const result = await query(`
      UPDATE promotions
      SET title=$2::text, description=NULLIF($3::text,''), service_id=NULLIF($4::text,'')::uuid, pet_size=COALESCE(NULLIF($5::text,''),'todos'), discount_percent=$6::numeric, weekdays=$7::smallint[], starts_on=NULLIF($8::text,'')::date, ends_on=NULLIF($9::text,'')::date, status=COALESCE(NULLIF($10::text,''),'active'), is_active=$11::boolean, updated_at=NOW()
      WHERE id=$1::uuid AND deleted_at IS NULL
      RETURNING *
    `, [req.params.id, title, cleanText(req.body?.description), cleanText(req.body?.serviceId), cleanText(req.body?.petSize), discountPercent, weekdays, cleanText(req.body?.startsOn), cleanText(req.body?.endsOn), cleanText(req.body?.status), req.body?.isActive !== false]);
    if (!result.rowCount) return res.status(404).json({ error: 'Promoção não encontrada.' });
    res.json({ promotion: sanitizePromotion(result.rows[0]), message: 'Promoção atualizada.' });
  } catch (error) { next(error); }
});

app.delete('/api/promocoes/:id', requireAuth, async (req, res, next) => {
  try {
    const result = await query(`UPDATE promotions SET deleted_at=NOW(), is_active=FALSE, updated_at=NOW() WHERE id=$1::uuid AND deleted_at IS NULL RETURNING id`, [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Promoção não encontrada.' });
    res.json({ ok: true, message: 'Promoção removida.' });
  } catch (error) { next(error); }
});



const PETFUNNY_360_DISCLAIMER = 'Este diagnóstico é uma análise de bem-estar e comportamento baseada nas respostas dos tutores. Ele não substitui avaliação veterinária.';

function sanitizeCaregiver(row = {}) {
  return {
    id: row.id,
    petId: row.pet_id,
    tutorId: row.tutor_id,
    caregiverTutorId: row.caregiver_tutor_id,
    name: row.name,
    whatsapp: row.whatsapp || '',
    email: row.email || '',
    role: row.role || 'familiar_autorizado',
    status: row.status || 'invited',
    acceptedAt: row.accepted_at || null,
    createdAt: row.created_at || null
  };
}

function sanitizeWellbeingQuestion(row = {}) {
  return {
    id: row.id,
    code: row.code,
    dimension: row.dimension,
    question: row.question,
    answerType: row.answer_type || 'scale',
    options: Array.isArray(row.options) ? row.options : [],
    weight: Number(row.weight || 1),
    sortOrder: Number(row.sort_order || 0),
    isCritical: Boolean(row.is_critical)
  };
}

function sanitizeWellbeingDiagnostic(row = {}) {
  return {
    id: row.id,
    petId: row.pet_id,
    petName: row.pet_name || row.petName || '',
    tutorId: row.tutor_id,
    tutorName: row.tutor_name || '',
    caregiverId: row.caregiver_id || null,
    caregiverName: row.caregiver_name || '',
    answers: row.answers || {},
    scores: row.scores || {},
    riskLevel: row.risk_level || 'baixo',
    summary: row.summary || '',
    insights: Array.isArray(row.insights) ? row.insights : [],
    recommendations: Array.isArray(row.recommendations) ? row.recommendations : [],
    aiUsed: Boolean(row.ai_used),
    disclaimer: row.disclaimer || PETFUNNY_360_DISCLAIMER,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
}

async function getActiveWellbeingFormWithQuestions() {
  const form = await query(`SELECT * FROM pet_wellbeing_forms WHERE deleted_at IS NULL AND is_active = TRUE ORDER BY created_at ASC LIMIT 1`);
  const formRow = form.rows[0] || null;
  const questions = await query(`
    SELECT * FROM pet_wellbeing_questions
    WHERE deleted_at IS NULL AND is_active = TRUE
      AND ($1::uuid IS NULL OR form_id = $1::uuid)
    ORDER BY sort_order ASC, question ASC
  `, [formRow?.id || null]);
  return { form: formRow, questions: questions.rows.map(sanitizeWellbeingQuestion) };
}

async function getPetAccessForClient(petId, tutorId) {
  const result = await query(`
    SELECT p.*, t.name AS tutor_name, t.whatsapp AS tutor_whatsapp,
           pc.id AS caregiver_id, pc.role AS caregiver_role
    FROM pets p
    INNER JOIN tutors t ON t.id = p.tutor_id AND t.deleted_at IS NULL
    LEFT JOIN pet_caregivers pc ON pc.pet_id = p.id AND pc.deleted_at IS NULL AND pc.status IN ('invited','accepted','active') AND pc.caregiver_tutor_id=$2::uuid
    WHERE p.id=$1::uuid
      AND p.deleted_at IS NULL
      AND p.status='active'
      AND (p.tutor_id=$2::uuid OR pc.id IS NOT NULL)
    LIMIT 1
  `, [petId, tutorId]);
  return result.rows[0] || null;
}

function normalizeWellbeingAnswers(rawAnswers = {}) {
  if (!rawAnswers || typeof rawAnswers !== 'object') return {};
  return Object.fromEntries(Object.entries(rawAnswers).map(([key, value]) => [String(key), typeof value === 'string' ? cleanText(value) || '' : value]));
}

function computeWellbeingDiagnostic({ questions = [], answers = {}, pet = {}, caregiverName = '' }) {
  const dimensionMap = new Map();
  let totalWeighted = 0;
  let totalWeight = 0;
  let criticalAlert = false;
  const answerRows = [];

  for (const question of questions) {
    const raw = answers[question.code];
    let score = 0;
    let label = '';
    if (question.answerType === 'scale') {
      const option = (question.options || []).find((item) => String(item.value) === String(raw));
      score = Number(option?.score || 0);
      label = option?.label || String(raw || 'Não respondido');
      if (question.isCritical && score >= 6) criticalAlert = true;
      const current = dimensionMap.get(question.dimension) || { total: 0, weight: 0 };
      current.total += score * Number(question.weight || 1);
      current.weight += Number(question.weight || 1);
      dimensionMap.set(question.dimension, current);
      totalWeighted += score * Number(question.weight || 1);
      totalWeight += Number(question.weight || 1);
    } else {
      label = String(raw || '').slice(0, 700);
    }
    answerRows.push({ code: question.code, question: question.question, answer: raw || '', label, score, dimension: question.dimension, isCritical: question.isCritical });
  }

  const dimensionScores = {};
  for (const [dimension, values] of dimensionMap.entries()) {
    const avg = values.weight ? values.total / values.weight : 0;
    dimensionScores[dimension] = Number(avg.toFixed(2));
  }
  const avgScore = totalWeight ? totalWeighted / totalWeight : 0;
  let riskLevel = 'baixo';
  if (criticalAlert || avgScore >= 3.2) riskLevel = 'alto';
  else if (avgScore >= 1.6) riskLevel = 'medio';

  const petName = pet.name || 'O pet';
  const emotional = dimensionScores.emocional || 0;
  const health = dimensionScores.saude_percebida || 0;
  const social = dimensionScores.socializacao || 0;
  const routine = dimensionScores.rotina || 0;

  const metrics = {
    overall: avgScore < 1.2 ? 'Bom' : avgScore < 2.4 ? 'Atenção leve' : 'Atenção alta',
    emotionalAttention: emotional < 1.2 ? 'Baixa' : emotional < 2.4 ? 'Moderada' : 'Alta',
    stressSigns: emotional + social < 2.4 ? 'Baixos' : emotional + social < 4.8 ? 'Moderados' : 'Altos',
    careRoutine: routine < 1.2 ? 'Boa' : routine < 2.4 ? 'Regular' : 'Atenção',
    socialization: social < 1.2 ? 'Boa' : social < 2.4 ? 'Sensível' : 'Atenção',
    perceivedHealth: health < 1.2 ? 'Boa' : health < 2.4 ? 'Atenção leve' : 'Atenção alta',
    dimensions: dimensionScores,
    averageScore: Number(avgScore.toFixed(2)),
    criticalAlert
  };

  const recommendations = [];
  if (criticalAlert) recommendations.push('Procure atendimento veterinário se houver sinal grave, piora rápida ou persistência dos sintomas.');
  if (health >= 2) recommendations.push('Observe alimentação, necessidades, coceiras e sinais físicos nas próximas 24–48 horas.');
  if (emotional >= 2 || social >= 2) recommendations.push('Para o próximo banho e tosa, prefira horários mais tranquilos e avise a equipe sobre sensibilidade, medo ou reatividade.');
  if (routine >= 1.5) recommendations.push('Mantenha uma rotina previsível de alimentação, descanso e cuidados para reduzir estresse.');
  recommendations.push('Atualize preferências e restrições do pet no app antes do próximo atendimento.');

  const insights = [
    `${petName} apresenta bem-estar geral ${String(metrics.overall).toLowerCase()} e atenção emocional ${String(metrics.emotionalAttention).toLowerCase()}.`,
    criticalAlert
      ? 'Há sinal de alerta informado. A recomendação responsável é procurar orientação veterinária e usar o PetFunny 360 apenas como apoio de observação.'
      : 'Não há sinal crítico informado nesta avaliação, mas o acompanhamento periódico ajuda a perceber mudanças de comportamento e rotina.',
    caregiverName ? `Esta leitura considera a percepção enviada por ${caregiverName}.` : 'Esta leitura considera a percepção do tutor pelo app.'
  ];

  return {
    scores: metrics,
    riskLevel,
    summary: `${petName} está com bem-estar geral ${String(metrics.overall).toLowerCase()}. Saúde percebida: ${metrics.perceivedHealth}. Socialização: ${metrics.socialization}. Rotina de cuidados: ${metrics.careRoutine}.`,
    insights,
    recommendations,
    answerRows
  };
}

async function buildAiWellbeingDiagnostic({ pet, tutor, caregiverName, localDiagnostic, answers }) {
  if (!env.openaiApiKey || typeof fetch !== 'function') return null;
  const system = `Você é a IA do PetFunny 360, uma avaliação de bem-estar, comportamento, rotina, socialização e saúde percebida de pets. Responda em português do Brasil. Nunca diagnostique doenças. Sempre deixe claro que não substitui veterinário. Se houver sinais graves, recomende procurar atendimento veterinário. Retorne APENAS JSON válido com: summary, insights (array), recommendations (array), riskLevel (baixo|medio|alto).`;
  const payload = { pet, tutor, caregiverName, localDiagnostic, answers, disclaimer: PETFUNNY_360_DISCLAIMER };
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.openaiApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: env.openaiModel, temperature: 0.25, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify(payload).slice(0, 16000) }] })
  });
  if (!response.ok) throw new Error(`OpenAI PetFunny 360 retornou ${response.status}`);
  const data = await response.json();
  return JSON.parse(data?.choices?.[0]?.message?.content || '{}');
}

async function insertWellbeingTimelineInsight({ petId, diagnosticId, title, message, severity = 'info' }) {
  return query(`
    INSERT INTO pet_wellbeing_insights (pet_id, diagnostic_id, type, title, message, severity, visible_to_tutor, visible_to_admin)
    VALUES ($1::uuid, $2::uuid, 'diagnostic', $3::text, $4::text, $5::text, TRUE, TRUE)
    RETURNING *
  `, [petId, diagnosticId, title, message, severity]).catch((error) => {
    console.warn('[petfunny360] insight não salvo:', error.message);
    return { rows: [], rowCount: 0 };
  });
}

app.get('/api/app/pets/:petId/caregivers', requireClientAuth, async (req, res, next) => {
  try {
    const tutorId = req.clientApp.tutor.id;
    const pet = await getPetAccessForClient(req.params.petId, tutorId);
    if (!pet) return res.status(404).json({ error: 'Pet não encontrado para este app.' });
    const caregivers = await query(`
      SELECT * FROM pet_caregivers
      WHERE pet_id=$1::uuid AND deleted_at IS NULL
      ORDER BY created_at DESC
    `, [req.params.petId]);
    res.json({ pet: sanitizeClientPet(pet), owner: { name: pet.tutor_name, whatsapp: pet.tutor_whatsapp, role: 'tutor_principal' }, caregivers: caregivers.rows.map(sanitizeCaregiver) });
  } catch (error) { next(error); }
});

app.post('/api/app/pets/:petId/caregivers/invite', requireClientAuth, async (req, res, next) => {
  try {
    const tutorId = req.clientApp.tutor.id;
    const pet = await getPetAccessForClient(req.params.petId, tutorId);
    if (!pet || String(pet.tutor_id) !== String(tutorId)) return res.status(403).json({ error: 'Somente o tutor principal pode autorizar responsáveis deste pet.' });
    const name = cleanText(req.body?.name);
    const whatsapp = normalizeWhatsapp(req.body?.whatsapp);
    const email = cleanText(req.body?.email);
    const role = cleanText(req.body?.role) || 'familiar_autorizado';
    if (!name) return res.status(400).json({ error: 'Informe o nome do responsável.' });
    const matchedTutor = whatsapp ? await query(`SELECT id FROM tutors WHERE whatsapp=$1::text AND deleted_at IS NULL LIMIT 1`, [whatsapp]).catch(() => ({ rows: [] })) : { rows: [] };
    const result = await query(`
      INSERT INTO pet_caregivers (pet_id, tutor_id, caregiver_tutor_id, name, whatsapp, email, role, status, invited_by_tutor_id)
      VALUES ($1::uuid, $2::uuid, NULLIF($3::text,'')::uuid, $4::text, NULLIF($5::text,''), NULLIF($6::text,''), $7::text, 'invited', $2::uuid)
      ON CONFLICT (pet_id, whatsapp) WHERE deleted_at IS NULL AND whatsapp IS NOT NULL
      DO UPDATE SET name=EXCLUDED.name, email=EXCLUDED.email, role=EXCLUDED.role, caregiver_tutor_id=EXCLUDED.caregiver_tutor_id, status='invited', updated_at=NOW()
      RETURNING *
    `, [req.params.petId, tutorId, matchedTutor.rows[0]?.id || '', name, whatsapp, email, role]);
    res.status(201).json({ caregiver: sanitizeCaregiver(result.rows[0]), message: 'Responsável autorizado para contribuir com o PetFunny 360.' });
  } catch (error) { next(error); }
});

app.get('/api/app/pets/:petId/wellbeing/latest', requireClientAuth, async (req, res, next) => {
  try {
    const pet = await getPetAccessForClient(req.params.petId, req.clientApp.tutor.id);
    if (!pet) return res.status(404).json({ error: 'Pet não encontrado para este app.' });
    const latest = await query(`
      SELECT d.*, p.name AS pet_name, t.name AS tutor_name, pc.name AS caregiver_name
      FROM pet_wellbeing_diagnostics d
      LEFT JOIN pets p ON p.id=d.pet_id
      LEFT JOIN tutors t ON t.id=d.tutor_id
      LEFT JOIN pet_caregivers pc ON pc.id=d.caregiver_id
      WHERE d.pet_id=$1::uuid AND d.deleted_at IS NULL
      ORDER BY d.created_at DESC
      LIMIT 1
    `, [req.params.petId]);
    res.json({ diagnostic: latest.rows[0] ? sanitizeWellbeingDiagnostic(latest.rows[0]) : null });
  } catch (error) { next(error); }
});

app.get('/api/app/pets/:petId/wellbeing/history', requireClientAuth, async (req, res, next) => {
  try {
    const pet = await getPetAccessForClient(req.params.petId, req.clientApp.tutor.id);
    if (!pet) return res.status(404).json({ error: 'Pet não encontrado para este app.' });
    const result = await query(`
      SELECT d.*, p.name AS pet_name, t.name AS tutor_name, pc.name AS caregiver_name
      FROM pet_wellbeing_diagnostics d
      LEFT JOIN pets p ON p.id=d.pet_id
      LEFT JOIN tutors t ON t.id=d.tutor_id
      LEFT JOIN pet_caregivers pc ON pc.id=d.caregiver_id
      WHERE d.pet_id=$1::uuid AND d.deleted_at IS NULL
      ORDER BY d.created_at DESC
      LIMIT 30
    `, [req.params.petId]);
    res.json({ diagnostics: result.rows.map(sanitizeWellbeingDiagnostic) });
  } catch (error) { next(error); }
});

app.post('/api/app/pets/:petId/wellbeing/assessment', requireClientAuth, async (req, res, next) => {
  try {
    const tutorId = req.clientApp.tutor.id;
    const pet = await getPetAccessForClient(req.params.petId, tutorId);
    if (!pet) return res.status(404).json({ error: 'Pet não encontrado para este app.' });
    const { form, questions } = await getActiveWellbeingFormWithQuestions();
    if (!questions.length) return res.status(500).json({ error: 'Perguntas do PetFunny 360 não configuradas. Rode npm run db:migrate.' });
    const answers = normalizeWellbeingAnswers(req.body?.answers || {});
    const missing = questions.filter((q) => q.answerType === 'scale' && !answers[q.code]);
    if (missing.length) return res.status(400).json({ error: `Responda: ${missing[0].question}` });
    const caregiver = await query(`SELECT * FROM pet_caregivers WHERE pet_id=$1::uuid AND caregiver_tutor_id=$2::uuid AND deleted_at IS NULL LIMIT 1`, [req.params.petId, tutorId]).catch(() => ({ rows: [] }));
    const local = computeWellbeingDiagnostic({ questions, answers, pet, caregiverName: caregiver.rows[0]?.name || req.clientApp.tutor.name });
    let finalDiagnostic = local;
    let aiUsed = false;
    try {
      const ai = await buildAiWellbeingDiagnostic({ pet: sanitizeClientPet(pet), tutor: req.clientApp.tutor, caregiverName: caregiver.rows[0]?.name || req.clientApp.tutor.name, localDiagnostic: local, answers });
      if (ai?.summary) {
        finalDiagnostic = {
          ...local,
          summary: cleanText(ai.summary) || local.summary,
          insights: Array.isArray(ai.insights) && ai.insights.length ? ai.insights.map(String).slice(0, 6) : local.insights,
          recommendations: Array.isArray(ai.recommendations) && ai.recommendations.length ? ai.recommendations.map(String).slice(0, 6) : local.recommendations,
          riskLevel: ['baixo','medio','alto'].includes(String(ai.riskLevel)) ? String(ai.riskLevel) : local.riskLevel
        };
        aiUsed = true;
      }
    } catch (aiError) {
      console.warn('[petfunny360] IA indisponível, usando fallback local:', aiError.message);
    }

    const result = await query(`
      INSERT INTO pet_wellbeing_diagnostics (pet_id, tutor_id, caregiver_id, form_id, answers, scores, risk_level, summary, insights, recommendations, ai_used, disclaimer)
      VALUES ($1::uuid, $2::uuid, NULLIF($3::text,'')::uuid, $4::uuid, $5::jsonb, $6::jsonb, $7::text, $8::text, $9::jsonb, $10::jsonb, $11::boolean, $12::text)
      RETURNING *
    `, [req.params.petId, tutorId, caregiver.rows[0]?.id || '', form?.id || null, JSON.stringify(answers), JSON.stringify(finalDiagnostic.scores), finalDiagnostic.riskLevel, finalDiagnostic.summary, JSON.stringify(finalDiagnostic.insights), JSON.stringify(finalDiagnostic.recommendations), aiUsed, PETFUNNY_360_DISCLAIMER]);
    const diagnosticId = result.rows[0].id;
    for (const answer of finalDiagnostic.answerRows) {
      const question = questions.find((q) => q.code === answer.code);
      await query(`INSERT INTO pet_wellbeing_answers (diagnostic_id, question_id, answer_value, answer_score, notes) VALUES ($1::uuid, $2::uuid, $3::text, $4::numeric, NULLIF($5::text,''))`, [diagnosticId, question?.id || null, String(answer.answer || ''), Number(answer.score || 0), answer.label || '']).catch(() => null);
    }
    await insertWellbeingTimelineInsight({ petId: req.params.petId, diagnosticId, title: `PetFunny 360 de ${pet.name || 'pet'}`, message: finalDiagnostic.summary, severity: finalDiagnostic.riskLevel === 'alto' ? 'warning' : 'info' });
    const full = { ...result.rows[0], pet_name: pet.name, tutor_name: req.clientApp.tutor.name, caregiver_name: caregiver.rows[0]?.name || '' };
    res.status(201).json({ diagnostic: sanitizeWellbeingDiagnostic(full), questions, message: 'Diagnóstico PetFunny 360 gerado com segurança.' });
  } catch (error) { next(error); }
});

app.get('/api/app/wellbeing/questions', requireClientAuth, async (req, res, next) => {
  try {
    const payload = await getActiveWellbeingFormWithQuestions();
    res.json({ form: payload.form ? { id: payload.form.id, title: payload.form.title, description: payload.form.description, version: payload.form.version } : null, questions: payload.questions });
  } catch (error) { next(error); }
});

app.get('/api/admin/wellbeing/summary', requireAuth, async (req, res, next) => {
  try {
    const [summary, latest] = await Promise.all([
      query(`
        SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE risk_level='alto')::int AS high,
               COUNT(*) FILTER (WHERE risk_level='medio')::int AS medium,
               COUNT(DISTINCT pet_id)::int AS pets
        FROM pet_wellbeing_diagnostics
        WHERE deleted_at IS NULL AND created_at >= NOW() - INTERVAL '90 days'
      `),
      query(`
        SELECT d.*, p.name AS pet_name, t.name AS tutor_name
        FROM pet_wellbeing_diagnostics d
        LEFT JOIN pets p ON p.id=d.pet_id
        LEFT JOIN tutors t ON t.id=d.tutor_id
        WHERE d.deleted_at IS NULL
        ORDER BY d.created_at DESC
        LIMIT 8
      `)
    ]);
    res.json({ cards: summary.rows[0] || { total: 0, high: 0, medium: 0, pets: 0 }, latest: latest.rows.map(sanitizeWellbeingDiagnostic) });
  } catch (error) { next(error); }
});

app.get('/api/admin/wellbeing/pets', requireAuth, async (req, res, next) => {
  try {
    const search = cleanText(req.query.search) || '';
    const risk = cleanText(req.query.risk) || '';
    const limit = parseLimit(req.query.limit, 30, 100);
    const page = Number.parseInt(req.query.page || '1', 10) || 1;
    const offset = parseOffset(page, limit);
    const params = [];
    let where = 'WHERE p.deleted_at IS NULL';
    if (search) {
      params.push(`%${search}%`);
      where += ` AND (unaccent(lower(p.name)) LIKE unaccent(lower($${params.length})) OR unaccent(lower(t.name)) LIKE unaccent(lower($${params.length})) OR t.whatsapp LIKE regexp_replace($${params.length}, '\\D', '', 'g'))`;
    }
    if (risk) {
      params.push(risk);
      where += ` AND latest.risk_level = $${params.length}`;
    }
    params.push(limit, offset);
    const result = await query(`
      SELECT p.id, p.name AS pet_name, p.size, p.breed, t.name AS tutor_name, t.whatsapp AS tutor_whatsapp,
             latest.id AS diagnostic_id, latest.risk_level, latest.summary, latest.created_at AS diagnostic_created_at,
             COALESCE(caregivers.count,0)::int AS caregivers_count
      FROM pets p
      LEFT JOIN tutors t ON t.id=p.tutor_id
      LEFT JOIN LATERAL (
        SELECT * FROM pet_wellbeing_diagnostics d WHERE d.pet_id=p.id AND d.deleted_at IS NULL ORDER BY d.created_at DESC LIMIT 1
      ) latest ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS count FROM pet_caregivers pc WHERE pc.pet_id=p.id AND pc.deleted_at IS NULL
      ) caregivers ON TRUE
      ${where}
      ORDER BY latest.created_at DESC NULLS LAST, p.name ASC
      LIMIT $${params.length-1} OFFSET $${params.length}
    `, params);
    res.json({ items: result.rows.map((row) => ({ petId: row.id, petName: row.pet_name, size: row.size, breed: row.breed, tutorName: row.tutor_name, tutorWhatsapp: row.tutor_whatsapp, diagnosticId: row.diagnostic_id, riskLevel: row.risk_level || 'sem_avaliacao', summary: row.summary || '', diagnosticCreatedAt: row.diagnostic_created_at || null, caregiversCount: Number(row.caregivers_count || 0) })), page, limit, hasMore: result.rows.length === limit });
  } catch (error) { next(error); }
});

app.get('/api/admin/wellbeing/pets/:petId', requireAuth, async (req, res, next) => {
  try {
    const pet = await query(`SELECT p.*, t.name AS tutor_name, t.whatsapp AS tutor_whatsapp FROM pets p LEFT JOIN tutors t ON t.id=p.tutor_id WHERE p.id=$1::uuid AND p.deleted_at IS NULL LIMIT 1`, [req.params.petId]);
    if (!pet.rowCount) return res.status(404).json({ error: 'Pet não encontrado.' });
    const [diagnostics, caregivers] = await Promise.all([
      query(`
        SELECT d.*, p.name AS pet_name, t.name AS tutor_name, pc.name AS caregiver_name
        FROM pet_wellbeing_diagnostics d
        LEFT JOIN pets p ON p.id=d.pet_id
        LEFT JOIN tutors t ON t.id=d.tutor_id
        LEFT JOIN pet_caregivers pc ON pc.id=d.caregiver_id
        WHERE d.pet_id=$1::uuid AND d.deleted_at IS NULL
        ORDER BY d.created_at DESC
        LIMIT 20
      `, [req.params.petId]),
      query(`SELECT * FROM pet_caregivers WHERE pet_id=$1::uuid AND deleted_at IS NULL ORDER BY created_at DESC`, [req.params.petId])
    ]);
    res.json({ pet: { ...sanitizePet(pet.rows[0]), tutorName: pet.rows[0].tutor_name, tutorWhatsapp: pet.rows[0].tutor_whatsapp }, diagnostics: diagnostics.rows.map(sanitizeWellbeingDiagnostic), caregivers: caregivers.rows.map(sanitizeCaregiver) });
  } catch (error) { next(error); }
});

app.get('/api/app/public-options', async (req, res, next) => {
  try {
    const petOptions = await getPetOptionsPayload({ activeOnly: true });
    const business = await getBusinessSettings().catch(() => ({}));
    res.json({
      business: {
        city: business.city || 'Ribeirão Preto',
        state: business.state || 'SP'
      },
      petTypes: petOptions.types,
      petSizes: petOptions.sizes,
      petBreeds: petOptions.breeds
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/app/options', requireClientAuth, async (req, res, next) => {
  try {
    const tutorId = req.clientApp.tutor.id;
    const [pets, services, collaborators, petSizes, petBreeds, packages, paymentMethods, gifts, promotions, operational] = await Promise.all([
      query(`SELECT id, name, size, breed, coat_type FROM pets WHERE tutor_id=$1::uuid AND deleted_at IS NULL AND status='active' ORDER BY name ASC`, [tutorId]),
      query(`
        SELECT s.id, s.name, s.description, s.price_cents, s.duration_minutes, s.pet_size, ps.name AS pet_size_name,
               sc.name AS category_name, sc.sort_order AS category_sort_order
        FROM services s
        LEFT JOIN pet_sizes ps ON ps.code = s.pet_size
        LEFT JOIN service_categories sc ON sc.id = s.category_id
        WHERE s.deleted_at IS NULL AND s.is_active = TRUE
        ORDER BY sc.sort_order ASC NULLS LAST, sc.name ASC NULLS LAST, s.name ASC
      `),
      query(`SELECT id, name, role, color FROM collaborators WHERE deleted_at IS NULL AND is_active = TRUE ORDER BY name ASC`),
      query(`SELECT code, name, sort_order FROM pet_sizes WHERE is_active = TRUE ORDER BY sort_order ASC, name ASC`),
      query(`
        SELECT b.*, pt.name AS pet_type_name, pt.code AS pet_type_code
        FROM pet_breeds b
        LEFT JOIN pet_types pt ON pt.id = b.pet_type_id
        WHERE b.is_active = TRUE
        ORDER BY COALESCE(pt.sort_order, 999), b.sort_order ASC, b.name ASC
      `),
      query(`
        SELECT p.id, p.name, p.description, p.pet_size, p.sessions_count, p.appointments_per_month, p.price_cents, p.discount_percent,
               COALESCE(string_agg(CONCAT(pi.quantity, 'x ', s.name), ', ' ORDER BY s.name), '') AS services_text
        FROM packages p
        LEFT JOIN package_items pi ON pi.package_id = p.id
        LEFT JOIN services s ON s.id = pi.service_id
        WHERE p.deleted_at IS NULL AND p.is_active = TRUE
        GROUP BY p.id
        ORDER BY p.name ASC
      `),
      query(`SELECT id, name, NULL::text AS type FROM payment_methods WHERE deleted_at IS NULL AND is_active = TRUE ORDER BY sort_order ASC, name ASC`),
      query(`SELECT id, title, description, estimated_cost_cents FROM gifts WHERE deleted_at IS NULL AND status='active' AND (starts_on IS NULL OR starts_on <= CURRENT_DATE) AND (ends_on IS NULL OR ends_on >= CURRENT_DATE) ORDER BY title ASC LIMIT 20`),
      query(`
        SELECT pr.*, s.name AS service_name
        FROM promotions pr
        LEFT JOIN services s ON s.id = pr.service_id
        WHERE pr.deleted_at IS NULL AND pr.is_active = TRUE AND pr.status='active'
          AND (pr.starts_on IS NULL OR pr.starts_on <= CURRENT_DATE)
          AND (pr.ends_on IS NULL OR pr.ends_on >= CURRENT_DATE)
        ORDER BY pr.created_at DESC
      `).catch(() => ({ rows: [] })),
      getOperationalSettingsPayload()
    ]);

    res.json({
      pets: pets.rows.map((row) => ({ id: row.id, name: row.name, size: row.size, breed: row.breed, coatType: row.coat_type })),
      services: services.rows.map((row) => ({ id: row.id, name: row.name, description: row.description || '', priceCents: Number(row.price_cents || 0), durationMinutes: Number(row.duration_minutes || 0), petSize: row.pet_size, petSizeName: row.pet_size_name, categoryName: row.category_name || 'Serviços PetFunny' })),
      collaborators: collaborators.rows.map((row) => ({ id: row.id, name: row.name, role: row.role, color: row.color })),
      petSizes: petSizes.rows.map((row) => ({ code: row.code, name: row.name, sortOrder: Number(row.sort_order || 0) })),
      petBreeds: petBreeds.rows.map(sanitizePetBreed),
      packages: packages.rows.map((row) => ({ id: row.id, name: row.name, description: row.description, petSize: row.pet_size || 'todos', sessionsCount: Number(row.sessions_count || 0), appointmentsPerMonth: Number(row.appointments_per_month || 0), priceCents: Number(row.price_cents || 0), discountPercent: Number(row.discount_percent || 0), servicesText: row.services_text || '' })),
      paymentMethods: paymentMethods.rows.map((row) => ({ id: row.id, name: row.name, type: row.type })),
      gifts: gifts.rows.map((row) => ({ id: row.id, title: row.title, description: row.description, estimatedCostCents: Number(row.estimated_cost_cents || 0) })),
      promotions: promotions.rows.map(sanitizePromotion),
      businessHours: operational.businessHours,
      timeSlotCapacities: operational.timeSlotCapacities,
      slotPolicy: operational.slotPolicy
    });
  } catch (error) {
    next(error);
  }
});

app.put('/api/app/profile', requireClientAuth, async (req, res, next) => {
  try {
    const tutorId = req.clientApp.tutor.id;
    const name = cleanText(req.body?.name);
    if (!name) return res.status(400).json({ error: 'Informe seu nome para atualizar o perfil.' });
    const photoUrl = cleanPhotoDataUrl(req.body?.photoDataUrl || req.body?.photoUrl);
    const result = await query(`
      UPDATE tutors
      SET name=$2::text,
          email=NULLIF($3::text,''),
          address=NULLIF($4::text,''),
          address_number=NULLIF($5::text,''),
          address_neighborhood=NULLIF($6::text,''),
          address_zipcode=NULLIF($7::text,''),
          city=NULLIF($8::text,''),
          state=NULLIF($9::text,''),
          photo_url=COALESCE($10::text, photo_url),
          updated_at=NOW()
      WHERE id=$1::uuid AND deleted_at IS NULL
      RETURNING id, name, whatsapp, email, address, address_number, address_neighborhood, address_zipcode, city, state, photo_url, tags
    `, [
      tutorId,
      name,
      cleanText(req.body?.email),
      cleanText(req.body?.address),
      cleanText(req.body?.addressNumber),
      cleanText(req.body?.addressNeighborhood),
      cleanText(req.body?.addressZipcode),
      cleanText(req.body?.city),
      cleanText(req.body?.state),
      photoUrl
    ]);
    res.json({ tutor: sanitizeTutor(result.rows[0]), message: 'Perfil atualizado com sucesso.' });
  } catch (error) {
    next(error);
  }
});

app.put('/api/app/password', requireClientAuth, async (req, res, next) => {
  try {
    const password = String(req.body?.password || '');
    const confirmPassword = String(req.body?.confirmPassword || '');
    if (password.length < 8) return res.status(400).json({ error: 'A senha precisa ter pelo menos 8 caracteres.' });
    if (password !== confirmPassword) return res.status(400).json({ error: 'A confirmação de senha não confere.' });
    await activateClientAccount(req.clientApp.account.id, password);
    res.json({ ok: true, message: 'Senha atualizada com segurança.' });
  } catch (error) {
    next(error);
  }
});

app.post('/api/app/pets', requireClientAuth, async (req, res, next) => {
  try {
    const tutorId = req.clientApp.tutor.id;
    const name = cleanText(req.body?.name);
    if (!name) return res.status(400).json({ error: 'Informe o nome do pet.' });
    const result = await query(`
      INSERT INTO pets (tutor_id, name, species, breed, size, coat_type, birth_date, weight_kg, preferences, restrictions, notes, status, photo_url)
      VALUES ($1::uuid, $2::text, COALESCE(NULLIF($3::text,''), 'dog'), NULLIF($4::text,''), COALESCE(NULLIF($5::text,''), 'pequeno'), NULLIF($6::text,''), NULLIF($7::text,'')::date, NULLIF($8::text,'')::numeric, NULLIF($9::text,''), NULLIF($10::text,''), NULLIF($11::text,''), 'active', $12::text)
      RETURNING *
    `, [tutorId, name, cleanText(req.body?.species), cleanText(req.body?.breed), cleanText(req.body?.size), cleanText(req.body?.coatType), cleanText(req.body?.birthDate), cleanText(req.body?.weightKg), cleanText(req.body?.preferences), cleanText(req.body?.restrictions), cleanText(req.body?.notes), cleanPhotoDataUrl(req.body?.photoDataUrl || req.body?.photoUrl)]);
    res.status(201).json({ pet: sanitizeClientPet(result.rows[0]), message: 'Pet cadastrado no app.' });
  } catch (error) {
    next(error);
  }
});

app.put('/api/app/pets/:id', requireClientAuth, async (req, res, next) => {
  try {
    const tutorId = req.clientApp.tutor.id;
    const name = cleanText(req.body?.name);
    if (!name) return res.status(400).json({ error: 'Informe o nome do pet.' });
    const result = await query(`
      UPDATE pets
      SET name=$3::text,
          species=COALESCE(NULLIF($4::text,''), 'dog'),
          breed=NULLIF($5::text,''),
          size=COALESCE(NULLIF($6::text,''), 'pequeno'),
          coat_type=NULLIF($7::text,''),
          birth_date=NULLIF($8::text,'')::date,
          weight_kg=NULLIF($9::text,'')::numeric,
          preferences=NULLIF($10::text,''),
          restrictions=NULLIF($11::text,''),
          notes=NULLIF($12::text,''),
          photo_url=COALESCE($13::text, photo_url),
          updated_at=NOW()
      WHERE id=$1::uuid AND tutor_id=$2::uuid AND deleted_at IS NULL
      RETURNING *
    `, [req.params.id, tutorId, name, cleanText(req.body?.species), cleanText(req.body?.breed), cleanText(req.body?.size), cleanText(req.body?.coatType), cleanText(req.body?.birthDate), cleanText(req.body?.weightKg), cleanText(req.body?.preferences), cleanText(req.body?.restrictions), cleanText(req.body?.notes), cleanPhotoDataUrl(req.body?.photoDataUrl || req.body?.photoUrl)]);
    if (!result.rowCount) return res.status(404).json({ error: 'Pet não encontrado para este tutor.' });
    res.json({ pet: sanitizeClientPet(result.rows[0]), message: 'Pet atualizado.' });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/app/pets/:id', requireClientAuth, async (req, res, next) => {
  try {
    const result = await query(`UPDATE pets SET deleted_at=NOW(), status='inactive', updated_at=NOW() WHERE id=$1::uuid AND tutor_id=$2::uuid AND deleted_at IS NULL RETURNING id`, [req.params.id, req.clientApp.tutor.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Pet não encontrado para este tutor.' });
    res.json({ ok: true, message: 'Pet removido do app.' });
  } catch (error) {
    next(error);
  }
});

function sanitizeClientPetRecord(row = {}) {
  return {
    id: row.id,
    petId: row.pet_id,
    type: row.type || 'NOTE',
    title: row.title || '',
    description: row.description || '',
    sourceType: row.source_type || '',
    sourceId: row.source_id || null,
    occurredAt: row.occurred_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizePetRecordType(value = '') {
  const type = String(value || '').trim().toUpperCase();
  const allowed = new Set(['SERVICE', 'VACCINE', 'ALLERGY', 'DOCUMENT', 'NOTE']);
  return allowed.has(type) ? type : 'NOTE';
}

app.get('/api/app/pets/:petId/records', requireClientAuth, async (req, res, next) => {
  try {
    const tutorId = req.clientApp.tutor.id;
    const pet = await getPetAccessForClient(req.params.petId, tutorId);
    if (!pet) return res.status(404).json({ error: 'Pet não encontrado.' });
    const type = normalizePetRecordType(req.query?.type || 'NOTE');
    const result = await query(`
      SELECT * FROM pet_medical_records
      WHERE tutor_id=$1::uuid AND pet_id=$2::uuid AND type=$3::text AND deleted_at IS NULL
      ORDER BY occurred_at DESC, created_at DESC
      LIMIT 100
    `, [tutorId, pet.id, type]);
    res.json({ records: result.rows.map(sanitizeClientPetRecord) });
  } catch (error) { next(error); }
});

app.post('/api/app/pets/:petId/records', requireClientAuth, async (req, res, next) => {
  try {
    const tutorId = req.clientApp.tutor.id;
    const pet = await getPetAccessForClient(req.params.petId, tutorId);
    if (!pet) return res.status(404).json({ error: 'Pet não encontrado.' });
    const type = normalizePetRecordType(req.body?.type || 'NOTE');
    const title = cleanText(req.body?.title);
    if (!title) return res.status(400).json({ error: 'Informe o título do registro.' });
    const description = cleanText(req.body?.description);
    const occurredAt = cleanText(req.body?.occurredAt) || new Date().toISOString();
    const sourceType = type === 'DOCUMENT' ? 'APP_DOCUMENT' : 'APP_MANUAL';
    const result = await query(`
      INSERT INTO pet_medical_records (tutor_id, pet_id, type, title, description, source_type, occurred_at)
      VALUES ($1::uuid,$2::uuid,$3::text,$4::text,NULLIF($5::text,''),$6::text,COALESCE(NULLIF($7::text,'')::timestamptz,NOW()))
      RETURNING *
    `, [tutorId, pet.id, type, title, description, sourceType, occurredAt]);
    res.status(201).json({ record: sanitizeClientPetRecord(result.rows[0]), message: 'Registro salvo no pet.' });
  } catch (error) { next(error); }
});

app.put('/api/app/pets/:petId/records/:recordId', requireClientAuth, async (req, res, next) => {
  try {
    const tutorId = req.clientApp.tutor.id;
    const pet = await getPetAccessForClient(req.params.petId, tutorId);
    if (!pet) return res.status(404).json({ error: 'Pet não encontrado.' });
    const type = normalizePetRecordType(req.body?.type || 'NOTE');
    const title = cleanText(req.body?.title);
    if (!title) return res.status(400).json({ error: 'Informe o título do registro.' });
    const description = cleanText(req.body?.description);
    const occurredAt = cleanText(req.body?.occurredAt) || new Date().toISOString();
    const result = await query(`
      UPDATE pet_medical_records
      SET type=$4::text, title=$5::text, description=NULLIF($6::text,''), occurred_at=COALESCE(NULLIF($7::text,'')::timestamptz, occurred_at), updated_at=NOW()
      WHERE id=$1::uuid AND tutor_id=$2::uuid AND pet_id=$3::uuid AND deleted_at IS NULL
      RETURNING *
    `, [req.params.recordId, tutorId, pet.id, type, title, description, occurredAt]);
    if (!result.rowCount) return res.status(404).json({ error: 'Registro não encontrado.' });
    res.json({ record: sanitizeClientPetRecord(result.rows[0]), message: 'Registro atualizado.' });
  } catch (error) { next(error); }
});

app.delete('/api/app/pets/:petId/records/:recordId', requireClientAuth, async (req, res, next) => {
  try {
    const tutorId = req.clientApp.tutor.id;
    const pet = await getPetAccessForClient(req.params.petId, tutorId);
    if (!pet) return res.status(404).json({ error: 'Pet não encontrado.' });
    const result = await query(`UPDATE pet_medical_records SET deleted_at=NOW(), updated_at=NOW() WHERE id=$1::uuid AND tutor_id=$2::uuid AND pet_id=$3::uuid AND deleted_at IS NULL RETURNING id`, [req.params.recordId, tutorId, pet.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Registro não encontrado.' });
    res.json({ ok: true, message: 'Registro removido.' });
  } catch (error) { next(error); }
});


function normalizeWeekdays(value) {
  const raw = Array.isArray(value) ? value : String(value || '').split(',');
  return [...new Set(raw.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item >= 0 && item <= 6))];
}

function sanitizePromotion(row = {}) {
  return {
    id: row.id,
    title: row.title || 'Promoção PetFunny',
    description: row.description || '',
    serviceId: row.service_id || null,
    serviceName: row.service_name || '',
    petSize: row.pet_size || 'todos',
    discountPercent: Number(row.discount_percent || 0),
    weekdays: Array.isArray(row.weekdays) ? row.weekdays.map(Number) : [],
    startsOn: row.starts_on || null,
    endsOn: row.ends_on || null,
    status: row.status || 'active',
    isActive: row.is_active !== false,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function getActivePromotionsForSchedule({ startsAtLocal, petSize = 'todos', serviceIds = [] } = {}) {
  const parts = getLocalSlotParts(startsAtLocal || '');
  const dateValue = parts?.date || String(startsAtLocal || '').slice(0, 10);
  const weekday = dateValue ? new Date(`${dateValue}T12:00:00`).getDay() : null;
  if (!dateValue || weekday === null || Number.isNaN(weekday)) return [];
  const result = await query(`
    SELECT pr.*, s.name AS service_name
    FROM promotions pr
    LEFT JOIN services s ON s.id = pr.service_id
    WHERE pr.deleted_at IS NULL
      AND pr.is_active = TRUE
      AND pr.status = 'active'
      AND (pr.starts_on IS NULL OR pr.starts_on <= $1::date)
      AND (pr.ends_on IS NULL OR pr.ends_on >= $1::date)
      AND (COALESCE(array_length(pr.weekdays, 1), 0) = 0 OR $2::smallint = ANY(pr.weekdays))
      AND (pr.pet_size = 'todos' OR pr.pet_size = $3::text)
      AND (pr.service_id IS NULL OR pr.service_id = ANY($4::uuid[]))
    ORDER BY pr.discount_percent DESC, pr.created_at DESC
  `, [dateValue, weekday, petSize || 'todos', serviceIds]);
  return result.rows.map(sanitizePromotion);
}

function applyPromotionsToItems(items = [], promotions = []) {
  const applied = [];
  const adjustedItems = items.map((item) => {
    const candidates = promotions.filter((promo) => !promo.serviceId || String(promo.serviceId) === String(item.serviceId));
    const best = candidates.sort((a, b) => Number(b.discountPercent || 0) - Number(a.discountPercent || 0))[0];
    const discountPercent = best ? Math.max(0, Math.min(100, Number(best.discountPercent || 0))) : 0;
    const gross = Number(item.unitPriceCents || 0) * Number(item.quantity || 1);
    const discountCents = Math.round(gross * discountPercent / 100);
    const totalCents = Math.max(0, gross - discountCents);
    if (best && discountPercent > 0) {
      applied.push({ promotionId: best.id, title: best.title, serviceId: item.serviceId, serviceName: item.description, discountPercent, discountCents });
    }
    return { ...item, discountPercent, discountCents, totalCents };
  });
  const subtotalCents = adjustedItems.reduce((sum, item) => sum + Number(item.unitPriceCents || 0) * Number(item.quantity || 1), 0);
  const discountCents = adjustedItems.reduce((sum, item) => sum + Number(item.discountCents || 0), 0);
  const totalCents = Math.max(0, subtotalCents - discountCents);
  return { items: adjustedItems, subtotalCents, discountCents, totalCents, appliedPromotions: applied };
}

function normalizeTransportText(value = '') {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function isTransportServiceName(value = '') {
  const text = normalizeTransportText(value);
  return text.includes('transporte') || text.includes('leva e traz') || text.includes('buscar e entregar') || text.includes('taxi dog') || text.includes('taxidog');
}

function hasCompleteTransportAddress(tutor = {}) {
  return Boolean(cleanText(tutor.address) && cleanText(tutor.address_number || tutor.addressNumber) && cleanText(tutor.address_neighborhood || tutor.addressNeighborhood));
}

function estimateOneWayTransportKm(tutor = {}) {
  const neighborhood = normalizeTransportText(tutor.address_neighborhood || tutor.addressNeighborhood || '');
  const zip = String(tutor.address_zipcode || tutor.addressZipcode || '').replace(/\D/g, '');
  const zones = [
    { keys: ['jardim palmares', 'palmares'], km: 1.8 },
    { keys: ['vila virginia', 'ipiranga', 'sumarezinho'], km: 3.5 },
    { keys: ['jardim paulista', 'campos eliseos', 'centro'], km: 4.5 },
    { keys: ['jardim america', 'alto da boa vista', 'ribeirania'], km: 6.5 },
    { keys: ['bonfim paulista', 'recreio internacional'], km: 12.5 }
  ];
  const found = zones.find((zone) => zone.keys.some((key) => neighborhood.includes(key)));
  if (found) return found.km;
  if (zip.startsWith('1403') || zip.startsWith('1402')) return 4.2;
  if (zip.startsWith('1409') || zip.startsWith('1407')) return 7.5;
  if (zip.startsWith('1411')) return 11.5;
  return 5.5;
}

function getTransportAddressParts(tutor = {}) {
  return [
    cleanText(tutor.address),
    cleanText(tutor.address_number || tutor.addressNumber),
    cleanText(tutor.address_neighborhood || tutor.addressNeighborhood),
    cleanText(tutor.city || 'Ribeirão Preto'),
    cleanText(tutor.state || 'SP')
  ].filter(Boolean);
}

function getTransportPricingConfig() {
  return {
    baseCents: Number(env.transportBaseFeeCents || 600),
    perKmCents: Number(env.transportPricePerKmCents || 220),
    minimumCents: Number(env.transportMinimumFeeCents || 1200),
    maxOneWayKm: Number(env.transportMaxOneWayKm || 20),
    originAddress: cleanText(env.petfunnyOriginAddress || 'PetFunny Banho e Tosa, Ribeirão Preto, SP')
  };
}


function normalizeCep(value = '') {
  return String(value || '').replace(/\D/g, '').slice(0, 8);
}

async function lookupBrazilCep(rawCep = '') {
  const cep = normalizeCep(rawCep);
  if (cep.length !== 8) {
    const err = new Error('Informe um CEP válido com 8 dígitos.');
    err.statusCode = 400;
    throw err;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.erro) {
      const err = new Error('CEP não encontrado na base dos Correios.');
      err.statusCode = 404;
      throw err;
    }
    return {
      zipcode: cep.replace(/(\d{5})(\d{3})/, '$1-$2'),
      address: cleanText(data.logradouro || ''),
      addressNeighborhood: cleanText(data.bairro || ''),
      city: cleanText(data.localidade || 'Ribeirão Preto'),
      state: cleanText(data.uf || 'SP'),
      source: 'viacep'
    };
  } catch (error) {
    if (error.statusCode) throw error;
    const err = new Error(error?.name === 'AbortError' ? 'Consulta de CEP demorou demais. Preencha manualmente.' : 'Não foi possível consultar o CEP agora. Preencha manualmente.');
    err.statusCode = 502;
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

function calculateTransportFareFromKm(oneWayKm, method = 'estimated_local_zone', extra = {}) {
  const pricing = getTransportPricingConfig();
  const safeOneWayKm = Math.max(0, Number(oneWayKm || 0));
  const operationalKm = safeOneWayKm * 4; // loja -> tutor -> loja, depois loja -> tutor -> loja
  const raw = Math.max(pricing.minimumCents, pricing.baseCents + Math.round(operationalKm * pricing.perKmCents));
  const feeCents = Math.ceil(raw / 100) * 100;
  const warning = safeOneWayKm > pricing.maxOneWayKm
    ? `Atenção: o endereço está acima do raio sugerido de ${pricing.maxOneWayKm.toFixed(1)} km por trecho.`
    : '';
  const methodLabel = method === 'google_routes'
    ? 'rota real calculada'
    : 'estimativa local';
  return {
    requiresAddress: false,
    feeCents,
    oneWayKm: Number(safeOneWayKm.toFixed(1)),
    operationalKm: Number(operationalKm.toFixed(1)),
    method,
    provider: method === 'google_routes' ? 'google_routes_api' : 'local_fallback',
    summary: `Busca e entrega: ${safeOneWayKm.toFixed(1)} km por trecho · ciclo operacional ${operationalKm.toFixed(1)} km (${methodLabel}).`,
    warning,
    pricing: {
      baseCents: pricing.baseCents,
      perKmCents: pricing.perKmCents,
      minimumCents: pricing.minimumCents,
      maxOneWayKm: pricing.maxOneWayKm
    },
    ...extra
  };
}

async function getGoogleRoutesOneWayDistanceKm(destinationAddress) {
  const pricing = getTransportPricingConfig();
  if (!env.googleMapsApiKey) {
    return { ok: false, reason: 'missing_api_key' };
  }
  if (!pricing.originAddress || !destinationAddress) {
    return { ok: false, reason: 'missing_origin_or_destination' };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5500);
  try {
    const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': env.googleMapsApiKey,
        'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration'
      },
      body: JSON.stringify({
        origin: { address: pricing.originAddress },
        destination: { address: destinationAddress },
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_AWARE',
        languageCode: 'pt-BR',
        units: 'METRIC'
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { ok: false, reason: `google_http_${response.status}`, details: data?.error?.message || data?.error || '' };
    }
    const route = Array.isArray(data?.routes) ? data.routes[0] : null;
    const distanceMeters = Number(route?.distanceMeters || 0);
    if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) {
      return { ok: false, reason: 'google_no_distance' };
    }
    return {
      ok: true,
      oneWayKm: distanceMeters / 1000,
      duration: route?.duration || '',
      distanceMeters,
      originAddress: pricing.originAddress,
      destinationAddress
    };
  } catch (error) {
    return { ok: false, reason: error?.name === 'AbortError' ? 'google_timeout' : 'google_request_failed', details: error?.message || '' };
  } finally {
    clearTimeout(timeout);
  }
}

async function calculateTransportQuote(tutor = {}) {
  const addressParts = getTransportAddressParts(tutor);
  const address = addressParts.join(', ');
  if (!hasCompleteTransportAddress(tutor)) {
    return {
      requiresAddress: true,
      feeCents: 0,
      oneWayKm: 0,
      operationalKm: 0,
      address,
      method: 'address_required',
      provider: 'none',
      summary: 'Cadastre rua, número e bairro para calcular o transporte.'
    };
  }

  const googleQuote = await getGoogleRoutesOneWayDistanceKm(address);
  if (googleQuote.ok) {
    return {
      ...calculateTransportFareFromKm(googleQuote.oneWayKm, 'google_routes', {
        routeDuration: googleQuote.duration,
        distanceMeters: googleQuote.distanceMeters,
        originAddress: googleQuote.originAddress,
        fallbackUsed: false
      }),
      address
    };
  }

  const oneWayKm = estimateOneWayTransportKm(tutor);
  return {
    ...calculateTransportFareFromKm(oneWayKm, 'estimated_local_zone', {
      fallbackUsed: Boolean(env.googleMapsApiKey),
      fallbackReason: googleQuote.reason || '',
      fallbackDetails: googleQuote.details || ''
    }),
    address
  };
}

async function getCurrentTutorTransportPayload(tutorId) {
  const result = await query(`
    SELECT id, name, whatsapp, email, address, address_number, address_neighborhood, address_zipcode, city, state
    FROM tutors
    WHERE id=$1::uuid AND deleted_at IS NULL
    LIMIT 1
  `, [tutorId]);
  return result.rows[0] || {};
}

app.get('/api/app/transport/estimate', requireClientAuth, async (req, res, next) => {
  try {
    const tutor = await getCurrentTutorTransportPayload(req.clientApp.tutor.id);
    const quote = await calculateTransportQuote(tutor);
    res.json({
      ok: true,
      ...quote,
      tutor: sanitizeTutor(tutor),
      googleRoutesEnabled: Boolean(env.googleMapsApiKey),
      note: quote.method === 'google_routes'
        ? 'Distância calculada por rota real. O valor inclui busca e entrega do pet.'
        : 'Estimativa local ativa para busca e entrega do pet.'
    });
  } catch (error) { next(error); }
});


app.get('/api/cep/:cep', async (req, res, next) => {
  try {
    const address = await lookupBrazilCep(req.params.cep);
    res.json({ ok: true, ...address });
  } catch (error) {
    next(error);
  }
});

app.get('/api/transport/estimate', requireAuth, async (req, res, next) => {
  try {
    const tutorId = cleanText(req.query?.tutorId || req.query?.tutor_id || '');
    if (!tutorId) return res.status(400).json({ error: 'Informe o tutor para calcular o transporte.' });
    const tutor = await getCurrentTutorTransportPayload(tutorId);
    if (!tutor?.id) return res.status(404).json({ error: 'Tutor não encontrado.' });
    const quote = await calculateTransportQuote(tutor);
    res.json({
      ok: true,
      ...quote,
      tutor: sanitizeTutor(tutor),
      googleRoutesEnabled: Boolean(env.googleMapsApiKey),
      note: quote.method === 'google_routes'
        ? 'Distância calculada por rota real. O valor inclui busca e entrega do pet.'
        : 'Estimativa local ativa para busca e entrega do pet.'
    });
  } catch (error) { next(error); }
});

app.patch('/api/tutores/:id/address', requireAuth, async (req, res, next) => {
  try {
    const current = await getTutorById(req.params.id);
    if (!current) return res.status(404).json({ error: 'Tutor não encontrado.' });
    const address = cleanText(req.body?.address);
    const addressNumber = cleanText(req.body?.addressNumber || req.body?.address_number);
    const addressNeighborhood = cleanText(req.body?.addressNeighborhood || req.body?.address_neighborhood);
    if (!address || !addressNumber || !addressNeighborhood) {
      return res.status(400).json({ error: 'Informe rua, número e bairro para calcular o transporte.' });
    }
    const result = await query(`
      UPDATE tutors
      SET address=$2::text,
          address_number=$3::text,
          address_neighborhood=$4::text,
          address_zipcode=NULLIF($5::text,''),
          city=COALESCE(NULLIF($6::text,''), 'Ribeirão Preto'),
          state=COALESCE(NULLIF($7::text,''), 'SP'),
          updated_at=NOW()
      WHERE id=$1::uuid AND deleted_at IS NULL
      RETURNING id, name, whatsapp, email, address, address_number, address_neighborhood, address_zipcode, city, state, photo_url, tags
    `, [
      req.params.id,
      address,
      addressNumber,
      addressNeighborhood,
      cleanText(req.body?.addressZipcode || req.body?.address_zipcode),
      cleanText(req.body?.city),
      cleanText(req.body?.state)
    ]);
    res.json({ tutor: sanitizeTutor(result.rows[0]), message: 'Endereço salvo. Transporte pronto para cálculo.' });
  } catch (error) { next(error); }
});

app.post('/api/app/appointments', requireClientAuth, async (req, res, next) => {
  try {
    const tutorId = req.clientApp.tutor.id;
    const accountId = req.clientApp.account?.id || null;
    const tutorName = req.clientApp.tutor?.name || 'Tutor PetFunny';
    const tutorEmail = req.clientApp.tutor?.email || req.clientApp.account?.email || '';
    const petId = cleanText(req.body?.petId);
    const rawStartsAt = cleanText(req.body?.startsAt);
    const rawSlotParts = getLocalSlotParts(rawStartsAt);
    const startsAtLocal = rawSlotParts?.date && rawSlotParts?.time ? `${rawSlotParts.date}T${rawSlotParts.time}` : '';
    const startsAt = rawSlotParts?.date && rawSlotParts?.time ? saoPauloLocalToIso(rawSlotParts.date, rawSlotParts.time) : toIsoOrNull(rawStartsAt);
    const serviceIds = Array.isArray(req.body?.serviceIds) ? req.body.serviceIds.filter(Boolean) : [];
    const collaboratorId = cleanText(req.body?.collaboratorId);
    const giftSpinId = cleanText(req.body?.giftSpinId);
    const rouletteGiftTitle = cleanText(req.body?.rouletteGiftTitle);
    const rouletteGiftDescription = cleanText(req.body?.rouletteGiftDescription);
    if (!petId) return res.status(400).json({ error: 'Escolha o pet para agendar.' });
    if (!startsAt) return res.status(400).json({ error: 'Informe data e horário válidos.' });
    if (!serviceIds.length) return res.status(400).json({ error: 'Selecione ao menos um serviço.' });
    const paymentType = normalizeAppPaymentType(req.body?.paymentType || req.body?.paymentMethod || 'pix');
    if (!isMercadoPagoConfigured()) return res.status(503).json({ error: 'Pagamento online indisponível. Configure as credenciais de pagamento no servidor para o app salvar agendamentos pagos.' });

    const pet = await query(`SELECT id, name, size FROM pets WHERE id=$1::uuid AND tutor_id=$2::uuid AND deleted_at IS NULL AND status='active' LIMIT 1`, [petId, tutorId]);
    if (!pet.rowCount) return res.status(404).json({ error: 'Pet não encontrado para este tutor.' });
    await assertSlotAvailable(startsAtLocal || rawStartsAt || startsAt, 'agendado', null);
    const services = await query(`SELECT id, name, price_cents, duration_minutes FROM services WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL AND is_active = TRUE`, [serviceIds]);
    if (!services.rowCount) return res.status(400).json({ error: 'Nenhum serviço ativo encontrado.' });
    const baseItems = services.rows.map((row) => ({ serviceId: row.id, description: row.name, quantity: 1, unitPriceCents: isTransportServiceName(row.name) ? 0 : Number(row.price_cents || 0) }));
    const activePromotions = await getActivePromotionsForSchedule({ startsAtLocal: startsAtLocal || rawStartsAt, petSize: pet.rows[0]?.size || 'todos', serviceIds: services.rows.map((row) => row.id) });
    const totals = applyPromotionsToItems(baseItems, activePromotions);
    const transportRequested = parseBool(req.body?.transportRequested, false) || services.rows.some((row) => isTransportServiceName(row.name));
    let transportQuote = null;
    if (transportRequested) {
      const tutorTransport = await getCurrentTutorTransportPayload(tutorId);
      transportQuote = await calculateTransportQuote(tutorTransport);
      if (transportQuote.requiresAddress) return res.status(400).json({ error: 'Cadastre o endereço do tutor para calcular o transporte.' });
      totals.items.push({ serviceId: null, description: 'Transporte PetFunny · busca e entrega', quantity: 1, unitPriceCents: transportQuote.feeCents, discountPercent: 0, discountCents: 0, totalCents: transportQuote.feeCents, isTransport: true });
      totals.subtotalCents += transportQuote.feeCents;
      totals.totalCents += transportQuote.feeCents;
    }
    if (totals.totalCents <= 0) return res.status(400).json({ error: `O valor total do agendamento precisa ser maior que zero para gerar ${paymentTypeLabel(paymentType)}.` });

    let appointmentNotes = cleanText(req.body?.notes);
    if (transportQuote && !transportQuote.requiresAddress) {
      const transportLine = `🚗 Transporte PetFunny: ${brlFromCentsText(transportQuote.feeCents)} · ${transportQuote.summary} · ${transportQuote.address}`;
      appointmentNotes = appointmentNotes ? `${transportLine}

${appointmentNotes}` : transportLine;
    }
    let giftSpin = null;
    if (giftSpinId) {
      const spinResult = await query(`
        SELECT gs.id, gs.result_title, g.description
        FROM gift_spins gs
        LEFT JOIN gifts g ON g.id = gs.gift_id
        WHERE gs.id=$1::uuid AND gs.tutor_id=$2::uuid
        LIMIT 1
      `, [giftSpinId, tutorId]);
      if (spinResult.rowCount) giftSpin = spinResult.rows[0];
    }
    const giftTitle = rouletteGiftTitle || giftSpin?.result_title || '';
    const giftDescription = rouletteGiftDescription || giftSpin?.description || '';
    if (giftTitle) {
      const giftLine = `🎁 Mimo ganho na Roleta PetFunny: ${giftTitle}${giftDescription ? ` — ${giftDescription}` : ''}`;
      appointmentNotes = appointmentNotes && !appointmentNotes.includes(giftLine) ? `${giftLine}\n\n${appointmentNotes}` : (appointmentNotes || giftLine);
    }

    const payload = {
      petId,
      startsAt,
      startsAtLocal: startsAtLocal || '',
      serviceIds: services.rows.map((row) => row.id),
      collaboratorId,
      notes: appointmentNotes,
      giftSpinId: giftSpin?.id || giftSpinId || '',
      rouletteGiftTitle: giftTitle,
      rouletteGiftDescription: giftDescription,
      appliedPromotions: totals.appliedPromotions || [],
      transport: transportQuote && !transportQuote.requiresAddress ? transportQuote : null
    };
    const description = `Agendamento PetFunny · ${pet.rows[0].name} · ${services.rows.map((row) => row.name).join(', ')}`.slice(0, 250);
    const pixExpirationMinutes = getMercadoPagoPixExpirationMinutes();
    const expiresAt = new Date(Date.now() + pixExpirationMinutes * 60 * 1000).toISOString();
    await ensurePaymentIntentCompatibility('appointment_payment_intents');
    const intent = await query(`
      INSERT INTO appointment_payment_intents (tutor_id, client_account_id, pet_id, status, payment_type, amount_cents, description, pending_payload, expires_at)
      VALUES ($1::uuid, $2::uuid, $3::uuid, 'pending', $4::text, $5::integer, $6::text, $7::jsonb, $8::timestamptz)
      RETURNING *
    `, [tutorId, accountId, petId, paymentType, totals.totalCents, description, JSON.stringify(payload), expiresAt]);

    try {
      let updated;
      if (isCardLikeAppPaymentType(paymentType)) {
        if (!env.mercadoPagoPublicKey) return res.status(503).json({ error: 'Pagamento por cartão indisponível no momento. Use Pix ou tente novamente mais tarde.' });
        updated = await query(`
          UPDATE appointment_payment_intents
          SET provider_response=jsonb_build_object('flow','payment_brick','status','waiting_card_data'), updated_at=NOW()
          WHERE id=$1::uuid
          RETURNING *
        `, [intent.rows[0].id]);
        return res.status(201).json({ requiresPayment: true, paymentIntent: sanitizePaymentIntent({ ...updated.rows[0], tutor_email: tutorEmail }), message: 'Pagamento por cartão iniciado. Preencha os dados no ambiente seguro dentro do app.' });
      }
      const mp = await createMercadoPagoPixPayment({
        intentId: intent.rows[0].id,
        amountCents: totals.totalCents,
        description,
        payerEmail: tutorEmail,
        payerName: tutorName
      });
      updated = await query(`
        UPDATE appointment_payment_intents
        SET mp_payment_id=$2::text, mp_status=$3::text, qr_code=$4::text, qr_code_base64=$5::text, provider_response=$6::jsonb, updated_at=NOW()
        WHERE id=$1::uuid
        RETURNING *
      `, [intent.rows[0].id, mp.paymentId, mp.status, mp.qrCode, mp.qrCodeBase64, JSON.stringify(mp.payment || {})]);
      return res.status(201).json({ requiresPayment: true, paymentIntent: sanitizePaymentIntent(updated.rows[0]), message: 'Pix gerado. O agendamento só será salvo após a confirmação do pagamento.' });
    } catch (error) {
      await query(`UPDATE appointment_payment_intents SET status='failed', last_error=$2::text, provider_response=$3::jsonb, updated_at=NOW() WHERE id=$1::uuid`, [intent.rows[0].id, error.message, JSON.stringify(error.details || {})]).catch(() => null);
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

app.get('/api/app/appointments', requireClientAuth, async (req, res, next) => {
  try {
    const tutorId = req.clientApp.tutor.id;
    const result = await query(`
      SELECT a.*, p.name AS pet_name
      FROM appointments a
      LEFT JOIN pets p ON p.id = a.pet_id
      WHERE a.tutor_id=$1::uuid AND a.deleted_at IS NULL
      ORDER BY a.starts_at DESC NULLS LAST, a.created_at DESC
      LIMIT 80
    `, [tutorId]);
    res.json({ items: result.rows.map(sanitizeAppointment), total: result.rowCount });
  } catch (error) { next(error); }
});

app.all('/api/app/appointments', (req, res) => {
  res.status(405).json({
    error: 'Método não permitido para /api/app/appointments.',
    path: '/api/app/appointments',
    allowedMethods: ['GET', 'POST'],
    hint: 'Use POST para criar agendamento e GET autenticado para listar.'
  });
});

app.get('/api/app/appointments/payment/:intentId', requireClientAuth, async (req, res, next) => {
  try {
    const intentResult = await query(`
      SELECT * FROM appointment_payment_intents
      WHERE id=$1::uuid AND tutor_id=$2::uuid AND deleted_at IS NULL
      LIMIT 1
    `, [req.params.intentId, req.clientApp.tutor.id]);
    if (!intentResult.rowCount) return res.status(404).json({ error: 'Pagamento não encontrado.' });
    let intent = intentResult.rows[0];
    if (intent.status === 'paid') {
      return res.json({ paymentIntent: sanitizePaymentIntent(intent), appointment: intent.appointment_id ? sanitizeAppointment(await getAppointmentById(intent.appointment_id)) : null, message: 'Agendamento pago e realizado com sucesso.' });
    }
    const isCardPayment = isCardLikeAppPaymentType(intent.payment_type || 'pix');
    if (!isCardPayment && new Date(intent.expires_at).getTime() < Date.now()) {
      const expired = await query(`UPDATE appointment_payment_intents SET status='expired', updated_at=NOW() WHERE id=$1::uuid RETURNING *`, [intent.id]);
      return res.status(410).json({ paymentIntent: sanitizePaymentIntent(expired.rows[0]), error: 'Pix expirado. Gere um novo QR Code para concluir o agendamento.' });
    }
    if (intent.mp_payment_id && isMercadoPagoConfigured()) {
      const payment = await mercadoPagoRequest(`/v1/payments/${intent.mp_payment_id}`);
      await query(`UPDATE appointment_payment_intents SET mp_status=$2::text, provider_response=$3::jsonb, updated_at=NOW() WHERE id=$1::uuid`, [intent.id, payment.status || '', JSON.stringify(payment || {})]);
      if (payment.status === 'approved') {
        const finalized = await finalizePaidAppointmentIntent(intent.id, payment.status, payment);
        return res.json({ paymentIntent: sanitizePaymentIntent({ ...intent, status: 'paid', appointment_id: finalized.appointment?.id, paid_at: new Date().toISOString(), mp_status: payment.status }), appointment: sanitizeAppointment(finalized.appointment), message: 'Agendamento pago e realizado com sucesso.' });
      }
      intent = { ...intent, mp_status: payment.status || intent.mp_status };
    } else if (isCardPayment && intent.mp_preference_id && isMercadoPagoConfigured()) {
      const payment = await findApprovedMercadoPagoPaymentByReference(intent.id);
      if (payment) {
        await query(`UPDATE appointment_payment_intents SET mp_payment_id=$2::text, mp_status=$3::text, provider_response=$4::jsonb, updated_at=NOW() WHERE id=$1::uuid`, [intent.id, String(payment.id || ''), payment.status || '', JSON.stringify(payment || {})]);
        if (payment.status === 'approved') {
          const finalized = await finalizePaidAppointmentIntent(intent.id, payment.status, payment);
          return res.json({ paymentIntent: sanitizePaymentIntent({ ...intent, status: 'paid', appointment_id: finalized.appointment?.id, paid_at: new Date().toISOString(), mp_payment_id: String(payment.id || ''), mp_status: payment.status }), appointment: sanitizeAppointment(finalized.appointment), message: 'Cartão aprovado. Agendamento realizado com sucesso.' });
        }
        intent = { ...intent, mp_payment_id: String(payment.id || ''), mp_status: payment.status || intent.mp_status };
      }
    }
    res.json({ paymentIntent: sanitizePaymentIntent(intent), message: isCardPayment ? 'Pagamento por cartão ainda não aprovado.' : 'Pagamento ainda não confirmado.' });
  } catch (error) {
    next(error);
  }
});


function extractCardPaymentPayload(body = {}) {
  const token = cleanText(body.token);
  const paymentMethodId = cleanText(body.payment_method_id || body.paymentMethodId);
  const issuerId = cleanText(body.issuer_id || body.issuerId);
  const installments = Math.max(1, Number(body.installments || 1) || 1);
  const payer = body.payer || {};
  const identification = payer.identification || body.identification || {};
  return {
    token,
    paymentMethodId,
    issuerId,
    installments,
    payerEmail: cleanText(payer.email || body.payerEmail || body.email),
    identificationType: cleanText(identification.type || body.identificationType),
    identificationNumber: cleanText(identification.number || body.identificationNumber)
  };
}

async function createMercadoPagoCardPayment({ intentId, amountCents, description, payerEmail, payerName, cardData, kind = 'appointment' }) {
  if (!cardData?.token) {
    const error = new Error('Token do cartão não recebido pelo formulário seguro. Confira os dados do cartão e tente novamente.');
    error.status = 400;
    throw error;
  }
  if (!cardData?.paymentMethodId) {
    const error = new Error('Bandeira/meio de pagamento do cartão não identificado. Revise os dados e tente novamente.');
    error.status = 400;
    throw error;
  }
  const appUrl = String(env.appUrl || '').replace(/\/$/, '');
  const payer = {
    email: cardData.payerEmail || payerEmail || `cliente+${String(intentId).slice(0, 8)}@petfunny.com.br`
  };
  if (cardData.identificationType && cardData.identificationNumber) {
    payer.identification = { type: cardData.identificationType, number: cardData.identificationNumber };
  }
  const body = {
    transaction_amount: Number((Number(amountCents || 0) / 100).toFixed(2)),
    token: cardData.token,
    description: description || 'Pagamento PetFunny',
    installments: cardData.installments || 1,
    payment_method_id: cardData.paymentMethodId,
    external_reference: String(intentId),
    metadata: { source: 'petfunny_app', intent_id: String(intentId), kind, payment_type: 'card' },
    payer
  };
  if (cardData.issuerId) body.issuer_id = cardData.issuerId;
  if (appUrl && appUrl.startsWith('https://')) body.notification_url = `${appUrl}/api/mercado-pago/webhook`;
  const payment = await mercadoPagoRequest('/v1/payments', {
    method: 'POST',
    body,
    idempotencyKey: `petfunny-card-${kind}-${intentId}-${Date.now()}`
  });
  return payment;
}

app.post('/api/app/appointments/payment/:intentId/card', requireClientAuth, async (req, res, next) => {
  try {
    if (!isMercadoPagoConfigured()) return res.status(503).json({ error: 'Pagamento online indisponível. Configure as credenciais de pagamento.' });
    const intentResult = await query(`
      SELECT api.*, t.name AS tutor_name, t.email AS tutor_email
      FROM appointment_payment_intents api
      LEFT JOIN tutors t ON t.id = api.tutor_id
      WHERE api.id=$1::uuid AND api.tutor_id=$2::uuid AND api.deleted_at IS NULL
      LIMIT 1
    `, [req.params.intentId, req.clientApp.tutor.id]);
    if (!intentResult.rowCount) return res.status(404).json({ error: 'Pagamento do agendamento não encontrado.' });
    const intent = intentResult.rows[0];
    if (normalizeAppPaymentType(intent.payment_type || 'pix') !== 'card') return res.status(400).json({ error: 'Este pagamento não foi iniciado como cartão.' });
    if (intent.status === 'paid' && intent.appointment_id) return res.json({ paymentIntent: sanitizePaymentIntent(intent), appointment: sanitizeAppointment(await getAppointmentById(intent.appointment_id)), message: 'Agendamento já estava pago.' });
    const cardData = extractCardPaymentPayload(req.body || {});
    const payment = await createMercadoPagoCardPayment({
      intentId: intent.id,
      amountCents: intent.amount_cents,
      description: intent.description,
      payerEmail: intent.tutor_email,
      payerName: intent.tutor_name,
      cardData,
      kind: 'appointment'
    });
    await query(`UPDATE appointment_payment_intents SET mp_payment_id=$2::text, mp_status=$3::text, provider_response=$4::jsonb, last_error=NULL, updated_at=NOW() WHERE id=$1::uuid`, [intent.id, String(payment.id || ''), payment.status || '', JSON.stringify(payment || {})]);
    if (payment.status === 'approved') {
      const finalized = await finalizePaidAppointmentIntent(intent.id, payment.status, payment);
      return res.status(201).json({ paymentIntent: sanitizePaymentIntent({ ...intent, status: 'paid', appointment_id: finalized.appointment?.id, paid_at: new Date().toISOString(), mp_payment_id: String(payment.id || ''), mp_status: payment.status }), appointment: sanitizeAppointment(finalized.appointment), message: 'Cartão aprovado. Agendamento realizado com sucesso.' });
    }
    const message = payment.status === 'rejected'
      ? `Pagamento recusado${payment.status_detail ? `: ${payment.status_detail}` : '.'}`
      : 'Pagamento enviado e ainda não aprovado.';
    return res.status(payment.status === 'rejected' ? 402 : 202).json({ paymentIntent: sanitizePaymentIntent({ ...intent, mp_payment_id: String(payment.id || ''), mp_status: payment.status, provider_response: payment }), message, mercadoPago: { status: payment.status, statusDetail: payment.status_detail || '' } });
  } catch (error) {
    next(error);
  }
});

app.post('/api/app/packages/payment/:intentId/card', requireClientAuth, async (req, res, next) => {
  try {
    if (!isMercadoPagoConfigured()) return res.status(503).json({ error: 'Pagamento online indisponível. Configure as credenciais de pagamento.' });
    const intentResult = await query(`
      SELECT ppi.*, t.name AS tutor_name, t.email AS tutor_email
      FROM package_payment_intents ppi
      LEFT JOIN tutors t ON t.id = ppi.tutor_id
      WHERE ppi.id=$1::uuid AND ppi.tutor_id=$2::uuid AND ppi.deleted_at IS NULL
      LIMIT 1
    `, [req.params.intentId, req.clientApp.tutor.id]);
    if (!intentResult.rowCount) return res.status(404).json({ error: 'Pagamento do pacote não encontrado.' });
    const intent = intentResult.rows[0];
    if (normalizeAppPaymentType(intent.payment_type || 'pix') !== 'card') return res.status(400).json({ error: 'Este pagamento não foi iniciado como cartão.' });
    if (intent.status === 'paid' && intent.customer_package_id) return res.json({ paymentIntent: sanitizePackagePaymentIntent(intent), customerPackageId: intent.customer_package_id, message: 'Pacote já estava pago.' });
    const cardData = extractCardPaymentPayload(req.body || {});
    const payment = await createMercadoPagoCardPayment({
      intentId: intent.id,
      amountCents: intent.amount_cents,
      description: intent.description,
      payerEmail: intent.tutor_email,
      payerName: intent.tutor_name,
      cardData,
      kind: 'package'
    });
    await query(`UPDATE package_payment_intents SET mp_payment_id=$2::text, mp_status=$3::text, provider_response=$4::jsonb, last_error=NULL, updated_at=NOW() WHERE id=$1::uuid`, [intent.id, String(payment.id || ''), payment.status || '', JSON.stringify(payment || {})]);
    if (payment.status === 'approved') {
      const finalized = await finalizePaidPackageIntent(intent.id, payment.status, payment);
      return res.status(201).json({ paymentIntent: sanitizePackagePaymentIntent({ ...intent, status: 'paid', customer_package_id: finalized.customerPackage?.id || finalized.customerPackageId, paid_at: new Date().toISOString(), mp_payment_id: String(payment.id || ''), mp_status: payment.status }), customerPackageId: finalized.customerPackage?.id || finalized.customerPackageId, message: 'Cartão aprovado. Pacote contratado com sucesso.' });
    }
    const message = payment.status === 'rejected'
      ? `Pagamento recusado${payment.status_detail ? `: ${payment.status_detail}` : '.'}`
      : 'Pagamento enviado e ainda não aprovado.';
    return res.status(payment.status === 'rejected' ? 402 : 202).json({ paymentIntent: sanitizePackagePaymentIntent({ ...intent, mp_payment_id: String(payment.id || ''), mp_status: payment.status, provider_response: payment }), message, mercadoPago: { status: payment.status, statusDetail: payment.status_detail || '' } });
  } catch (error) {
    next(error);
  }
});

app.post('/api/mercado-pago/webhook', async (req, res) => {
  try {
    const paymentId = req.query?.id || req.query?.['data.id'] || req.body?.data?.id || req.body?.id;
    const type = req.query?.type || req.body?.type || req.body?.action || '';
    if (!paymentId || !String(type).includes('payment')) return res.json({ ok: true, ignored: true });
    const payment = await mercadoPagoRequest(`/v1/payments/${paymentId}`);
    const paymentReference = String(payment?.external_reference || payment?.metadata?.intent_id || '');
    let intent = await query(`SELECT * FROM appointment_payment_intents WHERE mp_payment_id=$1::text AND deleted_at IS NULL LIMIT 1`, [String(paymentId)]);
    if (!intent.rowCount && paymentReference) {
      intent = await query(`SELECT * FROM appointment_payment_intents WHERE id=$1::uuid AND deleted_at IS NULL LIMIT 1`, [paymentReference]).catch(() => ({ rows: [], rowCount: 0 }));
    }
    if (intent.rowCount) {
      await query(`UPDATE appointment_payment_intents SET mp_payment_id=$2::text, mp_status=$3::text, provider_response=$4::jsonb, updated_at=NOW() WHERE id=$1::uuid`, [intent.rows[0].id, String(paymentId), payment.status || '', JSON.stringify(payment || {})]).catch(() => null);
    }
    if (intent.rowCount && payment.status === 'approved') {
      await finalizePaidAppointmentIntent(intent.rows[0].id, payment.status, payment);
      return res.json({ ok: true, kind: 'appointment' });
    } else if (intent.rowCount) {
      await query(`UPDATE appointment_payment_intents SET mp_status=$2::text, provider_response=$3::jsonb, updated_at=NOW() WHERE id=$1::uuid`, [intent.rows[0].id, payment.status || '', JSON.stringify(payment || {})]);
      return res.json({ ok: true, kind: 'appointment' });
    }
    let packageIntent = await query(`SELECT * FROM package_payment_intents WHERE mp_payment_id=$1::text AND deleted_at IS NULL LIMIT 1`, [String(paymentId)]).catch(() => ({ rows: [], rowCount: 0 }));
    if (!packageIntent.rowCount && paymentReference) {
      packageIntent = await query(`SELECT * FROM package_payment_intents WHERE id=$1::uuid AND deleted_at IS NULL LIMIT 1`, [paymentReference]).catch(() => ({ rows: [], rowCount: 0 }));
    }
    if (packageIntent.rowCount) {
      await query(`UPDATE package_payment_intents SET mp_payment_id=$2::text, mp_status=$3::text, provider_response=$4::jsonb, updated_at=NOW() WHERE id=$1::uuid`, [packageIntent.rows[0].id, String(paymentId), payment.status || '', JSON.stringify(payment || {})]).catch(() => null);
    }
    if (packageIntent.rowCount && payment.status === 'approved') {
      await finalizePaidPackageIntent(packageIntent.rows[0].id, payment.status, payment);
      return res.json({ ok: true, kind: 'package' });
    } else if (packageIntent.rowCount) {
      await query(`UPDATE package_payment_intents SET mp_status=$2::text, provider_response=$3::jsonb, updated_at=NOW() WHERE id=$1::uuid`, [packageIntent.rows[0].id, payment.status || '', JSON.stringify(payment || {})]);
      return res.json({ ok: true, kind: 'package' });
    }
    res.json({ ok: true, ignored: true });
  } catch (error) {
    console.error('[mercado-pago:webhook]', error.message);
    res.status(200).json({ ok: false, error: error.message });
  }
});


async function finalizePaidPackageIntent(intentId, providerStatus = 'approved', providerResponse = {}) {
  await query('BEGIN');
  try {
    const intentResult = await query(`
      SELECT ppi.*, t.name AS tutor_name, t.email AS tutor_email
      FROM package_payment_intents ppi
      LEFT JOIN tutors t ON t.id = ppi.tutor_id
      WHERE ppi.id=$1::uuid AND ppi.deleted_at IS NULL
      FOR UPDATE OF ppi
    `, [intentId]);
    if (!intentResult.rowCount) {
      const error = new Error('Pagamento do pacote não encontrado.');
      error.status = 404;
      throw error;
    }
    const intent = intentResult.rows[0];
    if (intent.status === 'paid' && intent.customer_package_id) {
      await query('COMMIT');
      return { intent, customerPackageId: intent.customer_package_id, alreadyPaid: true };
    }
    if (new Date(intent.expires_at).getTime() < Date.now()) {
      await query(`UPDATE package_payment_intents SET status='expired', mp_status=$2::text, provider_response=$3::jsonb, updated_at=NOW() WHERE id=$1::uuid`, [intent.id, providerStatus, JSON.stringify(providerResponse || {})]);
      const error = new Error('Este Pix expirou. Gere uma nova contratação de pacote para criar outro QR Code.');
      error.status = 410;
      throw error;
    }
    const payload = intent.pending_payload || {};
    const petId = payload.petId;
    const packageId = payload.packageId;
    const startsOn = payload.startsOn;
    const firstTime = payload.firstTime || '09:00';
    const recurring = Boolean(payload.recurring);
    if (!petId || !packageId || !startsOn) throw new Error('Dados pendentes do pacote estão incompletos.');
    const pack = await query('SELECT * FROM packages WHERE id=$1::uuid AND deleted_at IS NULL AND is_active=TRUE LIMIT 1', [packageId]);
    if (!pack.rowCount) throw new Error('Pacote ativo não encontrado.');
    const packageRow = pack.rows[0];
    const perMonth = Number(packageRow.appointments_per_month || 4);
    const intervalDays = resolvePackageIntervalDays({ totalSessions: Number(packageRow.sessions_count || 1), appointmentsPerMonth: perMonth });
    const isCardPayment = isCardLikeAppPaymentType(intent.payment_type || 'pix');
    const paymentMethod = await query(`SELECT id FROM payment_methods WHERE deleted_at IS NULL AND (lower(name) LIKE $1 OR lower(name) LIKE $2) ORDER BY sort_order ASC LIMIT 1`, isCardPayment ? ['%cart%', '%card%'] : ['%pix%', '%pix%']).catch(() => ({ rows: [] }));
    const paidViaCode = isCardPayment ? 'mercado_pago_card' : 'mercado_pago_pix';
    const sold = await query(`
      INSERT INTO customer_packages (tutor_id, pet_id, package_id, status, starts_on, ends_on, total_sessions, used_sessions, amount_cents, payment_status, payment_method_id, recurring, current_cycle_started_on, recurrence_rule)
      VALUES ($1::uuid, $2::uuid, $3::uuid, 'active', $4::date, ($4::date + (($5::integer - 1) * $6::integer || ' days')::interval)::date, $5::integer, 0, $7::integer, 'paid', NULLIF($8::text,'')::uuid, $9::boolean, $4::date, jsonb_build_object('enabled', $9::boolean, 'appointmentsPerMonth', $10::integer, 'intervalDays', $6::integer, 'firstTime', $11::text, 'paidVia', $12::text))
      RETURNING *
    `, [intent.tutor_id, petId, packageId, startsOn, Number(packageRow.sessions_count || 1), intervalDays, Number(packageRow.price_cents || 0), paymentMethod.rows[0]?.id || '', recurring, perMonth, firstTime, paidViaCode]);
    await query(`
      INSERT INTO financial_transactions (tutor_id, customer_package_id, type, category, description, amount_cents, due_date, status)
      VALUES ($1::uuid, $2::uuid, 'income', $6::text, $3::text, $4::integer, $5::date, 'paid')
      ON CONFLICT DO NOTHING
    `, [intent.tutor_id, sold.rows[0].id, `Pacote ${packageRow.name} pago via ${isCardPayment ? 'cartão' : 'Pix'} · ${Number(packageRow.sessions_count || 1)} sessões`, Number(packageRow.price_cents || 0), startsOn, isCardPayment ? 'pacote_app_cartao' : 'pacote_app_pix']);
    await generateAppointmentsForCustomerPackage(sold.rows[0].id, { startsOn, firstTime });
    await query(`
      UPDATE package_payment_intents
      SET status='paid', mp_status=$2::text, provider_response=$3::jsonb, paid_at=NOW(), customer_package_id=$4::uuid, updated_at=NOW()
      WHERE id=$1::uuid
    `, [intent.id, providerStatus, JSON.stringify(providerResponse || {}), sold.rows[0].id]);
    await query('COMMIT');
    const pushTargets = await query(`SELECT * FROM push_subscriptions WHERE tutor_id=$1::uuid AND status='active' AND deleted_at IS NULL`, [intent.tutor_id]).catch(() => ({ rows: [] }));
    if (pushTargets.rowCount) {
      await sendPushToSubscriptions(pushTargets.rows, {
        title: 'Pacote pago e contratado 📦',
        body: `${packageRow.name} foi ativado e seus agendamentos foram criados.`,
        url: '/app/pacotes',
        tag: `package-${sold.rows[0].id}`,
        type: 'package-paid'
      });
    }
    return { intent: { ...intent, status: 'paid', customer_package_id: sold.rows[0].id }, customerPackage: sold.rows[0], packageRow, alreadyPaid: false };
  } catch (error) {
    try { await query('ROLLBACK'); } catch {}
    throw error;
  }
}

app.post('/api/app/packages', requireClientAuth, async (req, res, next) => {
  try {
    const tutorId = req.clientApp.tutor.id;
    const accountId = req.clientApp.account?.id || null;
    const petId = cleanText(req.body?.petId);
    const packageId = cleanText(req.body?.packageId);
    const startsOn = cleanText(req.body?.startsOn) || new Date().toISOString().slice(0, 10);
    const firstTime = cleanText(req.body?.firstTime) || '09:00';
    const recurring = parseBool(req.body?.recurring, false);
    const paymentType = normalizeAppPaymentType(req.body?.paymentType || req.body?.paymentMethod || 'pix');
    if (!petId) return res.status(400).json({ error: 'Escolha o pet para contratar o pacote.' });
    if (!packageId) return res.status(400).json({ error: 'Escolha um pacote.' });
    if (String(startsOn).slice(0, 10) < new Date().toISOString().slice(0, 10)) return res.status(400).json({ error: 'Escolha uma data inicial válida para o pacote.' });
    const pet = await query(`SELECT id, name, size FROM pets WHERE id=$1::uuid AND tutor_id=$2::uuid AND deleted_at IS NULL AND status='active' LIMIT 1`, [petId, tutorId]);
    if (!pet.rowCount) return res.status(404).json({ error: 'Pet não encontrado para este tutor.' });
    const pack = await query('SELECT * FROM packages WHERE id=$1::uuid AND deleted_at IS NULL AND is_active=TRUE LIMIT 1', [packageId]);
    if (!pack.rowCount) return res.status(404).json({ error: 'Pacote ativo não encontrado.' });
    const packageRow = pack.rows[0];
    const amountCents = Number(packageRow.price_cents || 0);
    if (amountCents <= 0) return res.status(400).json({ error: `O valor do pacote precisa ser maior que zero para gerar ${paymentTypeLabel(paymentType)}.` });
    const tutorName = req.clientApp.tutor?.name || 'Tutor PetFunny';
    const tutorEmail = req.clientApp.tutor?.email || `cliente+pacote-${String(packageId).slice(0, 8)}@petfunny.com.br`;
    const payload = { petId, packageId, startsOn, firstTime, recurring };
    const description = `Pacote PetFunny · ${packageRow.name} · ${pet.rows[0].name}`.slice(0, 250);
    const pixExpirationMinutes = getMercadoPagoPixExpirationMinutes();
    const expiresAt = new Date(Date.now() + pixExpirationMinutes * 60 * 1000).toISOString();
    await ensurePaymentIntentCompatibility('package_payment_intents');
    const intent = await query(`
      INSERT INTO package_payment_intents (tutor_id, client_account_id, pet_id, package_id, status, payment_type, amount_cents, description, pending_payload, expires_at)
      VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'pending', $5::text, $6::integer, $7::text, $8::jsonb, $9::timestamptz)
      RETURNING *
    `, [tutorId, accountId, petId, packageId, paymentType, amountCents, description, JSON.stringify(payload), expiresAt]);
    try {
      let updated;
      if (isCardLikeAppPaymentType(paymentType)) {
        if (!env.mercadoPagoPublicKey) return res.status(503).json({ error: 'Pagamento por cartão indisponível no momento. Use Pix ou tente novamente mais tarde.' });
        updated = await query(`
          UPDATE package_payment_intents
          SET provider_response=jsonb_build_object('flow','payment_brick','status','waiting_card_data'), updated_at=NOW()
          WHERE id=$1::uuid
          RETURNING *
        `, [intent.rows[0].id]);
        return res.status(201).json({ requiresPayment: true, paymentIntent: sanitizePackagePaymentIntent({ ...updated.rows[0], tutor_email: tutorEmail }), message: 'Pagamento por cartão iniciado. Preencha os dados no ambiente seguro dentro do app.' });
      }
      const mp = await createMercadoPagoPixPayment({
        intentId: intent.rows[0].id,
        amountCents,
        description,
        payerEmail: tutorEmail,
        payerName: tutorName
      });
      updated = await query(`
        UPDATE package_payment_intents
        SET mp_payment_id=$2::text, mp_status=$3::text, qr_code=$4::text, qr_code_base64=$5::text, provider_response=$6::jsonb, updated_at=NOW()
        WHERE id=$1::uuid
        RETURNING *
      `, [intent.rows[0].id, mp.paymentId, mp.status, mp.qrCode, mp.qrCodeBase64, JSON.stringify(mp.payment || {})]);
      return res.status(201).json({ requiresPayment: true, paymentIntent: sanitizePackagePaymentIntent(updated.rows[0]), message: 'Pix do pacote gerado. O pacote e os agendamentos só serão criados após confirmação do pagamento.' });
    } catch (error) {
      await query(`UPDATE package_payment_intents SET status='failed', last_error=$2::text, provider_response=$3::jsonb, updated_at=NOW() WHERE id=$1::uuid`, [intent.rows[0].id, error.message, JSON.stringify(error.details || {})]).catch(() => null);
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

app.get('/api/app/packages/payment/:intentId', requireClientAuth, async (req, res, next) => {
  try {
    const intentResult = await query(`
      SELECT * FROM package_payment_intents
      WHERE id=$1::uuid AND tutor_id=$2::uuid AND deleted_at IS NULL
      LIMIT 1
    `, [req.params.intentId, req.clientApp.tutor.id]);
    if (!intentResult.rowCount) return res.status(404).json({ error: 'Pagamento do pacote não encontrado.' });
    let intent = intentResult.rows[0];
    if (intent.status === 'paid') {
      return res.json({ paymentIntent: sanitizePackagePaymentIntent(intent), customerPackageId: intent.customer_package_id, message: 'Pacote pago e contratado com sucesso.' });
    }
    const isCardPayment = isCardLikeAppPaymentType(intent.payment_type || 'pix');
    if (!isCardPayment && new Date(intent.expires_at).getTime() < Date.now()) {
      const expired = await query(`UPDATE package_payment_intents SET status='expired', updated_at=NOW() WHERE id=$1::uuid RETURNING *`, [intent.id]);
      return res.status(410).json({ paymentIntent: sanitizePackagePaymentIntent(expired.rows[0]), error: 'Pix expirado. Gere uma nova contratação para concluir o pacote.' });
    }
    if (intent.mp_payment_id && isMercadoPagoConfigured()) {
      const payment = await mercadoPagoRequest(`/v1/payments/${intent.mp_payment_id}`);
      await query(`UPDATE package_payment_intents SET mp_status=$2::text, provider_response=$3::jsonb, updated_at=NOW() WHERE id=$1::uuid`, [intent.id, payment.status || '', JSON.stringify(payment || {})]);
      if (payment.status === 'approved') {
        const finalized = await finalizePaidPackageIntent(intent.id, payment.status, payment);
        return res.json({ paymentIntent: sanitizePackagePaymentIntent({ ...intent, status: 'paid', customer_package_id: finalized.customerPackage?.id || finalized.customerPackageId, paid_at: new Date().toISOString(), mp_status: payment.status }), customerPackageId: finalized.customerPackage?.id || finalized.customerPackageId, message: 'Pacote pago e contratado com sucesso.' });
      }
      intent = { ...intent, mp_status: payment.status || intent.mp_status };
    } else if (isCardPayment && intent.mp_preference_id && isMercadoPagoConfigured()) {
      const payment = await findApprovedMercadoPagoPaymentByReference(intent.id);
      if (payment) {
        await query(`UPDATE package_payment_intents SET mp_payment_id=$2::text, mp_status=$3::text, provider_response=$4::jsonb, updated_at=NOW() WHERE id=$1::uuid`, [intent.id, String(payment.id || ''), payment.status || '', JSON.stringify(payment || {})]);
        if (payment.status === 'approved') {
          const finalized = await finalizePaidPackageIntent(intent.id, payment.status, payment);
          return res.json({ paymentIntent: sanitizePackagePaymentIntent({ ...intent, status: 'paid', customer_package_id: finalized.customerPackage?.id || finalized.customerPackageId, paid_at: new Date().toISOString(), mp_payment_id: String(payment.id || ''), mp_status: payment.status }), customerPackageId: finalized.customerPackage?.id || finalized.customerPackageId, message: 'Cartão aprovado. Pacote contratado com sucesso.' });
        }
        intent = { ...intent, mp_payment_id: String(payment.id || ''), mp_status: payment.status || intent.mp_status };
      }
    }
    res.json({ paymentIntent: sanitizePackagePaymentIntent(intent), message: isCardPayment ? 'Pagamento do pacote por cartão ainda não aprovado.' : 'Pagamento do pacote ainda não confirmado.' });
  } catch (error) {
    next(error);
  }
});

app.post('/api/app/roleta/spin', requireClientAuth, async (req, res, next) => {
  try {
    const tutorId = req.clientApp.tutor.id;
    const petId = cleanText(req.body?.petId);
    if (petId) {
      const pet = await query(`SELECT id FROM pets WHERE id=$1::uuid AND tutor_id=$2::uuid AND deleted_at IS NULL LIMIT 1`, [petId, tutorId]);
      if (!pet.rowCount) return res.status(404).json({ error: 'Pet não encontrado para este tutor.' });
    }
    const gifts = await query(`
      SELECT * FROM gifts
      WHERE deleted_at IS NULL AND status='active'
        AND (starts_on IS NULL OR starts_on <= CURRENT_DATE)
        AND (ends_on IS NULL OR ends_on >= CURRENT_DATE)
      ORDER BY title ASC
    `);
    if (!gifts.rowCount) return res.status(400).json({ error: 'Nenhum mimo ativo para sortear agora.' });
    const gift = pickWeightedGift(gifts.rows);
    const spin = await query(`
      INSERT INTO gift_spins (gift_id, tutor_id, pet_id, result_title, spin_context)
      VALUES ($1::uuid, $2::uuid, NULLIF($3::text,'')::uuid, $4::text, jsonb_build_object('source','app_tutor'))
      RETURNING id
    `, [gift.id, tutorId, petId || '', gift.title]);
    const pushTargets = await query(`SELECT * FROM push_subscriptions WHERE tutor_id=$1::uuid AND status='active' AND deleted_at IS NULL`, [tutorId]);
    if (pushTargets.rowCount) {
      await sendPushToSubscriptions(pushTargets.rows, {
        title: 'Mimo registrado 🎁',
        body: `${gift.title} ficou salvo no Meu PetFunny.`,
        url: '/app/roleta',
        tag: `gift-spin-${spin.rows[0].id}`,
        type: 'gift'
      });
    }
    res.json({ spinId: spin.rows[0].id, petId: petId || '', gift: { id: gift.id, title: gift.title, description: gift.description, estimatedCostCents: Number(gift.estimated_cost_cents || 0) }, message: 'Mimo sorteado com sucesso. Vamos abrir o agendamento com seu benefício destacado.' });
  } catch (error) {
    next(error);
  }
});





function buildPublicBaseUrl(req) {
  const configured = String(env.appUrl || process.env.APP_URL || process.env.PUBLIC_APP_URL || '').trim().replace(/\/$/, '');
  if (configured) return configured;
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const proto = forwardedProto || req.protocol || 'http';
  const host = req.get('host') || `localhost:${env.port || process.env.PORT || 3000}`;
  return `${proto}://${host}`.replace(/\/$/, '');
}

function signClientMomentsAccessToken({ tutorId, whatsapp, appointmentId = null, mediaId = null }) {
  return jwt.sign(
    {
      scope: 'client_app_moments_access',
      tutorId,
      whatsapp: normalizeWhatsapp(whatsapp),
      appointmentId,
      mediaId,
      tenant: false
    },
    env.jwtSecret,
    { expiresIn: '14d' }
  );
}

async function ensureClientAccountForTutor(tutorId, whatsapp) {
  const cleanWhatsapp = normalizeWhatsapp(whatsapp);
  if (!tutorId || !cleanWhatsapp) return null;
  const result = await query(`
    INSERT INTO client_accounts (tutor_id, whatsapp, status, is_active, created_at, updated_at)
    VALUES ($1::uuid, $2::text, 'active', TRUE, NOW(), NOW())
    ON CONFLICT (whatsapp) DO UPDATE
    SET tutor_id = EXCLUDED.tutor_id,
        is_active = TRUE,
        status = CASE
          WHEN client_accounts.status IS NULL OR client_accounts.status IN ('', 'pending_first_access') THEN 'active'
          ELSE client_accounts.status
        END,
        updated_at = NOW()
    RETURNING id, tutor_id, whatsapp, status, is_active
  `, [tutorId, cleanWhatsapp]);
  return result.rows[0] || null;
}

async function buildAppointmentMomentsSharePayload(req, appointmentRow = {}, mediaRow = {}) {
  const tutorId = appointmentRow.tutor_id;
  const whatsapp = normalizeWhatsapp(appointmentRow.tutor_whatsapp || appointmentRow.whatsapp || '');
  if (!tutorId || !whatsapp) return null;

  await ensureClientAccountForTutor(tutorId, whatsapp);

  const token = signClientMomentsAccessToken({
    tutorId,
    whatsapp,
    appointmentId: appointmentRow.id || mediaRow.appointment_id || null,
    mediaId: mediaRow.id || null
  });
  const baseUrl = buildPublicBaseUrl(req);
  const appPath = `/app/momentos?momentsAccess=${encodeURIComponent(token)}${mediaRow.id ? `&focus=${encodeURIComponent(mediaRow.id)}` : ''}`;
  const momentsLink = `${baseUrl}${appPath}`;
  const petName = appointmentRow.pet_name || 'seu pet';
  const tutorFirstName = String(appointmentRow.tutor_name || '').trim().split(/\s+/)[0] || '';
  const message = [
    `Oi${tutorFirstName ? `, ${tutorFirstName}` : ''}! 🐾✨`,
    `Acabamos de publicar um momento especial do ${petName} no App PetFunny.`,
    '',
    'Veja as fotos e vídeos aqui:',
    momentsLink,
    '',
    'Com carinho, PetFunny Banho e Tosa 💚'
  ].join('\n');

  return {
    momentsLink,
    appPath,
    whatsapp,
    whatsappUrl: `https://wa.me/${whatsapp}?text=${encodeURIComponent(message)}`,
    message,
    tokenExpiresIn: '14d'
  };
}


function parseDataUrlMedia(dataUrl = '') {
  const match = String(dataUrl || '').match(/^data:([\w/+.-]+);base64,(.+)$/);
  if (!match) return null;
  const mimeType = match[1];
  const base64 = match[2];
  const extMap = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' };
  const ext = extMap[mimeType] || (mimeType.startsWith('image/') ? 'jpg' : mimeType.startsWith('video/') ? 'mp4' : null);
  if (!ext) return null;
  return { mimeType, base64, ext, mediaType: mimeType.startsWith('video/') ? 'video' : 'photo' };
}


function buildLocalCuteMediaCaption(context = {}) {
  const petName = cleanText(context.petName || context.pet_name || 'esse amor') || 'esse amor';
  const tutorName = cleanText(context.tutorName || context.tutor_name || '');
  const tutorFirst = tutorName ? tutorName.split(/\s+/)[0] : '';
  const serviceText = cleanText(context.services || context.serviceText || 'cuidado PetFunny');
  const options = [
    `${petName} passou pelo PetFunny e saiu prontinho para ganhar muitos carinhos. 🐾✨`,
    `Momento especial do ${petName}: ${serviceText} com carinho, cuidado e muito charme. 💚`,
    `Olha que fofura! ${petName} ficou ainda mais lindo depois do cuidado de hoje. 🛁🐶`,
    `${tutorFirst ? `${tutorFirst}, olha só: ` : ''}${petName} brilhou por aqui e já deixou saudade na equipe PetFunny. ✨`,
    `Registro cheio de carinho do ${petName}, porque cada cuidado merece virar lembrança. 📸💚`,
    `${petName} recebeu aquele cuidado caprichado e saiu com cheirinho de felicidade. 🌸🐾`,
    `Mais um momento lindo do ${petName} no Clube PetFunny: cuidado, mimo e muito amor em cada detalhe. 🐶💚`,
    `Hoje o ${petName} foi tratado como estrela por aqui. Que fofura! ⭐🐾`
  ];
  return options[Math.floor(Math.random() * options.length)];
}

async function askOpenAiForMediaCaption(context = {}) {
  if (!env.openaiApiKey || typeof fetch !== 'function') return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${env.openaiApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: env.openaiModel,
        temperature: 0.86,
        messages: [
          { role: 'system', content: 'Você escreve legendas curtas, fofas, variadas e naturais para fotos de pets em banho e tosa. Retorne apenas uma legenda em português do Brasil, com até 150 caracteres, sem aspas.' },
          { role: 'user', content: JSON.stringify({ pet: context.petName, tutor: context.tutorName, services: context.services, status: context.statusName || context.status }) }
        ]
      })
    });
    if (!response.ok) return null;
    const data = await response.json();
    return (cleanText(data?.choices?.[0]?.message?.content || '') || '').replace(/^['"]|['"]$/g, '').slice(0, 180) || null;
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

app.post('/api/agenda/:id/media-caption', requireAuth, async (req, res, next) => {
  try {
    const appointmentId = req.params.id;
    const appointment = await query(`
      SELECT a.id, a.status, a.starts_at,
             t.name AS tutor_name, t.whatsapp AS tutor_whatsapp,
             p.name AS pet_name,
             COALESCE(string_agg(DISTINCT ai.description, ', '), '') AS services
      FROM appointments a
      LEFT JOIN tutors t ON t.id = a.tutor_id
      LEFT JOIN pets p ON p.id = a.pet_id
      LEFT JOIN appointment_items ai ON ai.appointment_id = a.id
      WHERE a.id = $1 AND a.deleted_at IS NULL
      GROUP BY a.id, t.name, t.whatsapp, p.name
      LIMIT 1
    `, [appointmentId]);
    if (!appointment.rowCount) return res.status(404).json({ error: 'Agendamento não encontrado.' });
    const row = appointment.rows[0];
    const context = {
      petName: row.pet_name || 'Pet',
      tutorName: row.tutor_name || '',
      services: row.services || 'cuidado PetFunny',
      status: row.status || '',
      startsAt: row.starts_at
    };
    const localCaption = buildLocalCuteMediaCaption(context);
    const aiCaption = await askOpenAiForMediaCaption(context);
    res.json({ ok: true, caption: aiCaption || localCaption, openaiUsed: Boolean(aiCaption) });
  } catch (error) { next(error); }
});

app.post('/api/agenda/:id/media', requireAuth, async (req, res, next) => {
  try {
    const appointmentId = req.params.id;
    const { caption = '', mediaType = 'photo', url = '', dataUrl = '', featured = false } = req.body || {};
    const appointment = await query(`
      SELECT a.id, a.tutor_id, a.pet_id,
             t.name AS tutor_name, t.whatsapp AS tutor_whatsapp,
             p.name AS pet_name
      FROM appointments a
      LEFT JOIN tutors t ON t.id = a.tutor_id
      LEFT JOIN pets p ON p.id = a.pet_id
      WHERE a.id = $1 AND a.deleted_at IS NULL
      LIMIT 1
    `, [appointmentId]);
    if (!appointment.rowCount) return res.status(404).json({ error: 'Agendamento não encontrado.' });

    let finalUrl = String(url || '').trim();
    let finalMediaType = String(mediaType || 'photo').toLowerCase() === 'video' ? 'video' : 'photo';

    if (!finalUrl && dataUrl) {
      const parsed = parseDataUrlMedia(dataUrl);
      if (!parsed) return res.status(400).json({ error: 'Arquivo inválido. Envie imagem JPG/PNG/WebP/GIF ou vídeo MP4/WebM.' });
      const raw = Buffer.from(parsed.base64, 'base64');
      if (!raw.length) return res.status(400).json({ error: 'Arquivo vazio.' });
      if (raw.length > 7 * 1024 * 1024) return res.status(400).json({ error: 'Arquivo maior que 7MB. Use uma imagem/vídeo menor.' });
      const uploadsDir = path.resolve(frontendRoot, 'uploads', 'appointment-media');
      fs.mkdirSync(uploadsDir, { recursive: true });
      const safeName = `${appointmentId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${parsed.ext}`;
      fs.writeFileSync(path.join(uploadsDir, safeName), raw);
      finalUrl = `/uploads/appointment-media/${safeName}`;
      finalMediaType = parsed.mediaType;
    }

    if (!finalUrl) return res.status(400).json({ error: 'Envie uma foto/vídeo ou informe uma URL.' });

    const row = appointment.rows[0];
    const result = await query(`
      INSERT INTO appointment_media (appointment_id, tutor_id, pet_id, media_type, url, caption, is_featured, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING id, appointment_id, pet_id, media_type, url, caption, is_featured, created_at
    `, [appointmentId, row.tutor_id, row.pet_id, finalMediaType, finalUrl, String(caption || '').trim(), Boolean(featured)]);
    const share = await buildAppointmentMomentsSharePayload(req, row, result.rows[0]).catch((error) => {
      console.warn('[agenda:media] não foi possível gerar link de momentos:', error.message);
      return null;
    });
    res.status(201).json({ ok: true, media: result.rows[0], share });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/agenda/media/:mediaId', requireAuth, async (req, res, next) => {
  try {
    const result = await query(`
      UPDATE appointment_media
      SET deleted_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id
    `, [req.params.mediaId]);
    if (!result.rowCount) return res.status(404).json({ error: 'Mídia não encontrada.' });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/app/appointments/:id/media', requireClientAuth, async (req, res, next) => {
  try {
    const tutorId = req.clientApp.tutor.id;
    const appointmentId = req.params.id;
    const appointment = await query(`
      SELECT id, pet_id FROM appointments
      WHERE id=$1::uuid AND tutor_id=$2::uuid AND deleted_at IS NULL
      LIMIT 1
    `, [appointmentId, tutorId]);
    if (!appointment.rowCount) return res.status(404).json({ error: 'Atendimento não encontrado.' });
    const media = await query(`
      SELECT am.id, am.appointment_id, am.pet_id, am.media_type, am.url, am.caption, am.is_featured, am.created_at,
             p.name AS pet_name
      FROM appointment_media am
      LEFT JOIN pets p ON p.id = am.pet_id
      WHERE am.appointment_id=$1::uuid AND am.tutor_id=$2::uuid AND am.deleted_at IS NULL
      ORDER BY am.is_featured DESC, am.created_at DESC
    `, [appointmentId, tutorId]);
    res.json({ ok: true, media: media.rows.map((row) => ({
      id: row.id, appointmentId: row.appointment_id, petId: row.pet_id, petName: row.pet_name || 'Pet',
      mediaType: row.media_type || 'photo', url: row.url, caption: row.caption || '', featured: !!row.is_featured, createdAt: row.created_at
    })) });
  } catch (error) { next(error); }
});

app.get('/api/app/pets/:petId/media', requireClientAuth, async (req, res, next) => {
  try {
    const tutorId = req.clientApp.tutor.id;
    const petId = req.params.petId;
    const pet = await query(`SELECT id, name FROM pets WHERE id=$1::uuid AND tutor_id=$2::uuid AND deleted_at IS NULL LIMIT 1`, [petId, tutorId]);
    if (!pet.rowCount) return res.status(404).json({ error: 'Pet não encontrado.' });
    const media = await query(`
      SELECT am.id, am.appointment_id, am.pet_id, am.media_type, am.url, am.caption, am.is_featured, am.created_at,
             a.starts_at, COALESCE(string_agg(DISTINCT ai.description, ', '), '') AS services
      FROM appointment_media am
      LEFT JOIN appointments a ON a.id = am.appointment_id
      LEFT JOIN appointment_items ai ON ai.appointment_id = a.id
      WHERE am.pet_id=$1::uuid AND am.tutor_id=$2::uuid AND am.deleted_at IS NULL
      GROUP BY am.id, a.starts_at
      ORDER BY am.created_at DESC
      LIMIT 60
    `, [petId, tutorId]);
    res.json({ ok: true, pet: { id: pet.rows[0].id, name: pet.rows[0].name }, media: media.rows.map((row) => ({
      id: row.id, appointmentId: row.appointment_id, petId: row.pet_id, mediaType: row.media_type || 'photo', url: row.url,
      caption: row.caption || '', featured: !!row.is_featured, createdAt: row.created_at, startsAt: row.starts_at, services: row.services || ''
    })) });
  } catch (error) { next(error); }
});

app.post('/api/app/pets/:petId/media', requireClientAuth, async (req, res, next) => {
  try {
    const tutorId = req.clientApp.tutor.id;
    const pet = await getPetAccessForClient(req.params.petId, tutorId);
    if (!pet) return res.status(404).json({ error: 'Pet não encontrado.' });
    const { caption = '', mediaType = 'photo', url = '', dataUrl = '' } = req.body || {};
    let finalUrl = String(url || '').trim();
    let finalMediaType = String(mediaType || 'photo').toLowerCase() === 'video' ? 'video' : 'photo';

    if (!finalUrl && dataUrl) {
      const parsed = parseDataUrlMedia(dataUrl);
      if (!parsed) return res.status(400).json({ error: 'Arquivo inválido. Envie imagem JPG/PNG/WebP/GIF ou vídeo MP4/WebM.' });
      const raw = Buffer.from(parsed.base64, 'base64');
      if (!raw.length) return res.status(400).json({ error: 'Arquivo vazio.' });
      if (raw.length > 7 * 1024 * 1024) return res.status(400).json({ error: 'Arquivo maior que 7MB. Use uma imagem/vídeo menor.' });
      const uploadsDir = path.resolve(frontendRoot, 'uploads', 'appointment-media');
      fs.mkdirSync(uploadsDir, { recursive: true });
      const safeName = `client-${pet.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${parsed.ext}`;
      fs.writeFileSync(path.join(uploadsDir, safeName), raw);
      finalUrl = `/uploads/appointment-media/${safeName}`;
      finalMediaType = parsed.mediaType;
    }

    if (!finalUrl) return res.status(400).json({ error: 'Envie uma foto/vídeo ou informe uma URL.' });
    const result = await query(`
      INSERT INTO appointment_media (appointment_id, tutor_id, pet_id, media_type, url, caption, is_featured, created_at)
      VALUES (NULL, $1::uuid, $2::uuid, $3, $4, $5, FALSE, NOW())
      RETURNING id, appointment_id, pet_id, media_type, url, caption, is_featured, created_at
    `, [tutorId, pet.id, finalMediaType, finalUrl, String(caption || '').trim()]);
    res.status(201).json({ ok: true, media: {
      id: result.rows[0].id,
      appointmentId: result.rows[0].appointment_id,
      petId: result.rows[0].pet_id,
      mediaType: result.rows[0].media_type || 'photo',
      url: result.rows[0].url,
      caption: result.rows[0].caption || '',
      petName: pet.name || '',
      createdAt: result.rows[0].created_at
    }, message: 'Momento enviado com sucesso.' });
  } catch (error) { next(error); }
});


app.delete('/api/app/media/:mediaId', requireClientAuth, async (req, res, next) => {
  try {
    const tutorId = req.clientApp.tutor.id;
    const result = await query(`
      UPDATE appointment_media
      SET deleted_at = NOW()
      WHERE id = $1::uuid
        AND tutor_id = $2::uuid
        AND deleted_at IS NULL
      RETURNING id
    `, [req.params.mediaId, tutorId]);
    if (!result.rowCount) return res.status(404).json({ error: 'Foto ou vídeo não encontrado.' });
    res.json({ ok: true, message: 'Momento apagado com sucesso.' });
  } catch (error) { next(error); }
});

app.get('/api/app/push/public-key', requireClientAuth, async (req, res) => {
  const status = getPushConfigStatus();
  res.json({
    configured: status.configured,
    publicKey: env.vapidPublicKey || null,
    subject: env.vapidSubject,
    missing: status.missing,
    envFile: status.envFile,
    message: status.configured
      ? 'Push disponível para este app.'
      : `Push ainda não configurado no servidor. Faltando: ${status.missing.join(', ') || 'configuração inválida'}.`
  });
});

app.post('/api/app/push/subscribe', requireClientAuth, async (req, res, next) => {
  try {
    const normalized = normalizePushSubscription(req.body?.subscription || req.body || {});
    if (!normalized.endpoint || !normalized.p256dh || !normalized.auth) {
      return res.status(400).json({ error: 'Inscrição push inválida. Permita notificações novamente no celular.' });
    }
    const platform = cleanText(req.body?.platform || 'web-pwa');
    const userAgent = String(req.headers['user-agent'] || '').slice(0, 500);
    const result = await query(`
      INSERT INTO push_subscriptions (tutor_id, account_id, endpoint, p256dh, auth, subscription, platform, user_agent, status, deleted_at)
      VALUES ($1::uuid,$2::uuid,$3::text,$4::text,$5::text,$6::jsonb,$7::text,$8::text,'active',NULL)
      ON CONFLICT (endpoint) DO UPDATE SET
        tutor_id = EXCLUDED.tutor_id,
        account_id = EXCLUDED.account_id,
        p256dh = EXCLUDED.p256dh,
        auth = EXCLUDED.auth,
        subscription = EXCLUDED.subscription,
        platform = EXCLUDED.platform,
        user_agent = EXCLUDED.user_agent,
        status = 'active',
        deleted_at = NULL,
        updated_at = NOW()
      RETURNING id, status, created_at, updated_at
    `, [req.clientApp.tutor.id, req.clientApp.account.id, normalized.endpoint, normalized.p256dh, normalized.auth, JSON.stringify(normalized.subscription), platform, userAgent]);
    res.status(201).json({ ok: true, configured: isPushConfigured(), subscription: result.rows[0], message: 'Notificações ativadas para este aparelho.' });
  } catch (error) {
    next(error);
  }
});

app.post('/api/app/push/unsubscribe', requireClientAuth, async (req, res, next) => {
  try {
    const endpoint = cleanText(req.body?.endpoint);
    if (!endpoint) return res.status(400).json({ error: 'Endpoint push não informado.' });
    await query(`
      UPDATE push_subscriptions
      SET status='disabled', deleted_at=NOW(), updated_at=NOW()
      WHERE endpoint=$1::text AND tutor_id=$2::uuid
    `, [endpoint, req.clientApp.tutor.id]);
    res.json({ ok: true, message: 'Notificações desativadas neste aparelho.' });
  } catch (error) {
    next(error);
  }
});


app.get('/api/app/notifications/summary', requireClientAuth, async (req, res, next) => {
  try {
    const tutorId = req.clientApp.tutor.id;
    const accountId = req.clientApp.account.id;
    const result = await query(`
      SELECT COUNT(*)::int AS total
      FROM push_notification_logs
      WHERE (tutor_id=$1::uuid OR account_id=$2::uuid)
        AND status IN ('sent','queued','failed')
        AND created_at >= NOW() - INTERVAL '90 days'
    `, [tutorId, accountId]);
    const latest = await query(`
      SELECT id, title, body, url, status, sent_at, created_at
      FROM push_notification_logs
      WHERE (tutor_id=$1::uuid OR account_id=$2::uuid)
        AND status IN ('sent','queued','failed')
      ORDER BY created_at DESC
      LIMIT 3
    `, [tutorId, accountId]);
    res.json({
      ok: true,
      total: Number(result.rows[0]?.total || 0),
      unread: Number(result.rows[0]?.total || 0),
      latest: latest.rows.map((row) => ({
        id: row.id,
        title: row.title,
        body: row.body,
        url: row.url,
        status: row.status,
        sentAt: row.sent_at,
        createdAt: row.created_at
      }))
    });
  } catch (error) { next(error); }
});

app.get('/api/app/notifications', requireClientAuth, async (req, res, next) => {
  try {
    const tutorId = req.clientApp.tutor.id;
    const accountId = req.clientApp.account.id;
    const limit = Math.min(Math.max(Number(req.query.limit || 10), 1), 30);
    const offset = Math.max(Number(req.query.offset || 0), 0);
    const count = await query(`
      SELECT COUNT(*)::int AS total
      FROM push_notification_logs
      WHERE (tutor_id=$1::uuid OR account_id=$2::uuid)
        AND status IN ('sent','queued','failed')
    `, [tutorId, accountId]);
    const result = await query(`
      SELECT id, title, body, url, payload, status, error, sent_at, created_at
      FROM push_notification_logs
      WHERE (tutor_id=$1::uuid OR account_id=$2::uuid)
        AND status IN ('sent','queued','failed')
      ORDER BY created_at DESC
      LIMIT $3 OFFSET $4
    `, [tutorId, accountId, limit, offset]);
    const total = Number(count.rows[0]?.total || 0);
    const items = result.rows.map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      url: row.url,
      payload: row.payload || {},
      status: row.status,
      error: row.error || '',
      sentAt: row.sent_at,
      createdAt: row.created_at
    }));
    const nextOffset = offset + items.length;
    res.json({ ok: true, total, limit, offset, nextOffset, hasMore: nextOffset < total, items });
  } catch (error) { next(error); }
});



function safeJsonObject(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
  } catch (_) {
    return fallback;
  }
}

function sanitizeHealthTriage(row = {}) {
  const raw = safeJsonObject(row.raw_result, {});
  const thermometer = raw.thermometer || raw.themeThermometer || null;
  return {
    id: row.id,
    petId: row.pet_id,
    petName: row.pet_name || '',
    riskLevel: row.risk_level || 'low',
    summary: row.summary || '',
    guidance: row.guidance || '',
    recommendedAction: row.recommended_action || '',
    emergency: Boolean(row.emergency),
    redFlags: Array.isArray(row.red_flags) ? row.red_flags : [],
    aiUsed: Boolean(row.ai_used),
    dailyTheme: raw.dailyTheme || row.daily_theme || raw.theme || '',
    themeTitle: raw.themeTitle || raw?.thermometer?.title || '',
    thermometer,
    insight: raw.insight || null,
    cta: raw.cta || raw?.insight?.cta || null,
    createdAt: row.created_at
  };
}

function sanitizeTeleconsultation(row = {}) {
  return {
    id: row.id,
    tutorId: row.tutor_id,
    tutorName: row.tutor_name || row.tutor_display_name || '',
    petId: row.pet_id,
    petName: row.pet_name || '',
    veterinarianId: row.veterinarian_id,
    veterinarianName: row.veterinarian_name || 'Veterinário parceiro',
    veterinarianCrmv: row.veterinarian_crmv || row.crmv || '',
    specialty: row.specialty || row.veterinarian_specialty || '',
    reason: row.reason || '',
    symptoms: row.symptoms || '',
    startsAt: row.starts_at,
    priceCents: Number(row.price_cents || 0),
    paymentMethod: row.payment_method || 'pix',
    paymentStatus: row.payment_status || 'pending',
    status: row.status || 'pending_payment',
    meetingUrl: row.meeting_url || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function computeHealth360Score({ pet = {}, lastTriage = null, recordsCount = 0, appointmentsCount = 0 } = {}) {
  let score = 72;
  const factors = [];
  if (pet.weight_kg) { score += 5; factors.push('Peso informado'); }
  if (pet.restrictions || pet.preferences || pet.notes) { score += 5; factors.push('Perfil de cuidado completo'); }
  if (appointmentsCount > 0) { score += 8; factors.push('Rotina PetFunny registrada'); }
  if (recordsCount > 0) { score += 5; factors.push('Prontuário com registros'); }
  if (lastTriage?.risk_level === 'medium') { score -= 12; factors.push('Última triagem em atenção'); }
  if (lastTriage?.risk_level === 'high') { score -= 28; factors.push('Última triagem urgente'); }
  score = Math.max(35, Math.min(98, score));
  const label = score >= 90 ? 'Excelente' : score >= 75 ? 'Bom' : score >= 60 ? 'Atenção' : 'Risco';
  return { score, label, factors };
}


const HEALTH360_DAILY_THEME_BANK = [
  { day: 1, key: 'apetite', title: 'Apetite', icon: '🍽️', ctaType: 'teleconsultation' },
  { day: 2, key: 'agua', title: 'Consumo de água', icon: '💧', ctaType: 'weight' },
  { day: 3, key: 'energia', title: 'Energia/disposição', icon: '⚡', ctaType: 'teleconsultation' },
  { day: 4, key: 'fezes', title: 'Fezes', icon: '💩', ctaType: 'teleconsultation' },
  { day: 5, key: 'urina', title: 'Urina', icon: '🚽', ctaType: 'teleconsultation' },
  { day: 6, key: 'sono', title: 'Sono', icon: '🌙', ctaType: 'teleconsultation' },
  { day: 7, key: 'pele', title: 'Pele e coceiras', icon: '🧴', ctaType: 'bath' },
  { day: 8, key: 'mobilidade', title: 'Mobilidade', icon: '🐾', ctaType: 'teleconsultation' },
  { day: 9, key: 'comportamento', title: 'Comportamento', icon: '🧠', ctaType: 'teleconsultation' },
  { day: 10, key: 'ansiedade', title: 'Ansiedade', icon: '💚', ctaType: 'teleconsultation' },
  { day: 11, key: 'peso', title: 'Peso corporal', icon: '⚖️', ctaType: 'weight' },
  { day: 12, key: 'bucal', title: 'Saúde bucal', icon: '🦷', ctaType: 'bath' },
  { day: 13, key: 'ouvidos', title: 'Ouvidos', icon: '👂', ctaType: 'teleconsultation' },
  { day: 14, key: 'higiene', title: 'Rotina de higiene', icon: '🛁', ctaType: 'bath' }
];

function getHealth360DailyThemeForDate(date = new Date()) {
  const dayIndex = Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86400000) % HEALTH360_DAILY_THEME_BANK.length;
  return HEALTH360_DAILY_THEME_BANK[(dayIndex + HEALTH360_DAILY_THEME_BANK.length) % HEALTH360_DAILY_THEME_BANK.length];
}

function normalizeHealth360StatusValue(value = '') {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function buildHealth360SmartCta(analysis = {}, payload = {}) {
  const normalized = Object.fromEntries(Object.entries(payload || {}).map(([key, value]) => [key, normalizeHealth360StatusValue(value)]));
  if (analysis.emergency || analysis.riskLevel === 'high') return { type: 'teleconsultation', label: 'Abrir Tele Consultas', href: '/app/teleconsultas', reason: 'Sinais de alerta pedem orientação veterinária imediata.' };
  if (['menos','nao','muito_baixo','baixo','dificuldade','sangue','repetido','persistente','intensa','moderada'].some((value) => Object.values(normalized).includes(value))) return { type: 'teleconsultation', label: 'Abrir Tele Consultas', href: '/app/teleconsultas', reason: 'Mudança importante detectada na triagem.' };
  if (['pele','higiene','bucal','ouvidos'].includes(normalized.dailytheme) || ['coceira','vermelhidao','ferida','queda_pelo','odor','secrecao'].some((value) => Object.values(normalized).includes(value))) return { type: 'bath', label: 'Agendar Banho/Tosa', href: '/app/agenda', reason: 'A rotina de higiene pode ajudar quando o pet estiver apto.' };
  if (['peso'].includes(normalized.dailytheme)) return { type: 'weight', label: 'Registrar novo peso', href: '/app/pets', reason: 'Acompanhar peso ajuda a entender evolução do bem-estar.' };
  return { type: 'care', label: 'Agendar cuidado PetFunny', href: '/app/agenda', reason: 'Mantenha a rotina preventiva em dia.' };
}


function getHealth360ThemeMeta(key = '') {
  const normalized = normalizeHealth360StatusValue(key);
  return HEALTH360_DAILY_THEME_BANK.find((item) => item.key === normalized) || HEALTH360_DAILY_THEME_BANK[0];
}

function health360ScoreLabel(score = 0) {
  const value = Number(score || 0);
  if (value >= 85) return 'Excelente';
  if (value >= 70) return 'Bom';
  if (value >= 50) return 'Atenção';
  return 'Risco';
}

function health360ScoreLevel(score = 0) {
  const value = Number(score || 0);
  if (value >= 85) return 'excellent';
  if (value >= 70) return 'good';
  if (value >= 50) return 'attention';
  return 'risk';
}

function computeHealth360ThemeThermometer(payload = {}, analysis = {}) {
  const theme = getHealth360ThemeMeta(payload.dailyTheme || payload.dailytheme || 'apetite');
  const normalized = Object.fromEntries(Object.entries(payload || {}).map(([key, value]) => [key, normalizeHealth360StatusValue(value)]));
  let score = 88;
  const good = [];
  const warnings = [];
  const values = Object.values(normalized);
  const mediumSignals = ['menos','muito','baixo','muito_baixo','mole','liquida','inquieto','coceira','vermelhidao','odor','secrecao','moderada','ansioso','estressado','acima','abaixo','nos','precisa'];
  const highSignals = ['nao','sangue','dificuldade','intensa','persistente','ferida','queda_pelo','muita','pouca','agressivo','isolado'];
  if (analysis.riskLevel === 'medium') score -= 14;
  if (analysis.riskLevel === 'high') score -= 34;
  values.forEach((value) => {
    if (!value || ['triagem diaria saude 360'].includes(value)) return;
    if (['normal','ok','adequado','sim','igual','boa','estavel','brincando','em_dia'].includes(value)) { score += 2; good.push(value); }
    if (mediumSignals.includes(value)) { score -= 12; warnings.push(value); }
    if (highSignals.includes(value)) { score -= 22; warnings.push(value); }
  });
  score = Math.max(20, Math.min(98, Math.round(score)));
  const label = health360ScoreLabel(score);
  return {
    key: theme.key,
    title: theme.title,
    icon: theme.icon,
    score,
    label,
    level: health360ScoreLevel(score),
    status: label,
    goodSignals: good.slice(0, 5),
    warningSignals: warnings.slice(0, 5),
    cta: buildHealth360SmartCta(analysis, payload)
  };
}

function buildHealth360ThemeScores(triageRows = []) {
  const byTheme = new Map();
  (triageRows || []).forEach((row) => {
    const raw = safeJsonObject(row.raw_result, {});
    const thermometer = raw.thermometer || raw.themeThermometer;
    if (!thermometer?.key) return;
    if (!byTheme.has(thermometer.key)) byTheme.set(thermometer.key, []);
    byTheme.get(thermometer.key).push({
      key: thermometer.key,
      title: thermometer.title || getHealth360ThemeMeta(thermometer.key).title,
      icon: thermometer.icon || getHealth360ThemeMeta(thermometer.key).icon,
      score: Number(thermometer.score || 0),
      label: thermometer.label || health360ScoreLabel(thermometer.score || 0),
      level: thermometer.level || health360ScoreLevel(thermometer.score || 0),
      createdAt: row.created_at
    });
  });
  return Array.from(byTheme.entries()).map(([key, items]) => {
    const sorted = items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const latest = sorted[0];
    const previous = sorted[1];
    const trend = previous ? latest.score - previous.score : 0;
    return {
      key,
      title: latest.title,
      icon: latest.icon,
      score: latest.score,
      label: latest.label,
      level: latest.level,
      trend,
      history: sorted.slice(0, 7).map((item) => ({ score: item.score, createdAt: item.createdAt }))
    };
  }).sort((a, b) => b.score - a.score);
}

function buildHealth360PredictiveRisks(triageRows = [], themeScores = []) {
  const latest = (triageRows || []).slice(0, 14);
  const risk = (key, title, percent, reason, cta = { label: 'Abrir Tele Consultas', href: '/app/teleconsultas' }) => ({ key, title, percent: Math.max(0, Math.min(100, Math.round(percent))), reason, cta });
  const scoreMap = Object.fromEntries((themeScores || []).map((item) => [item.key, item.score]));
  const countThemeLow = (key, limit = 60) => latest.filter((row) => {
    const raw = safeJsonObject(row.raw_result, {});
    const t = raw.thermometer || {};
    return t.key === key && Number(t.score || 100) < limit;
  }).length;
  const risks = [];
  const appetiteLow = countThemeLow('apetite');
  const energyLow = countThemeLow('energia');
  const skinLow = countThemeLow('pele');
  const urineLow = countThemeLow('urina');
  const stoolLow = countThemeLow('fezes');
  const anxietyLow = countThemeLow('ansiedade');
  if (appetiteLow >= 2 || (scoreMap.apetite || 100) < 60) risks.push(risk('gastrointestinal', 'Risco gastrointestinal', 68 + appetiteLow * 8, 'Apetite/fezes com atenção recorrente nos últimos registros.'));
  if (skinLow >= 1 || (scoreMap.pele || 100) < 65) risks.push(risk('dermatologico', 'Risco dermatológico', 56 + skinLow * 12, 'Coceira, pele, odor ou pelagem pedem acompanhamento preventivo.', { label: 'Agendar Banho/Tosa', href: '/app/agenda' }));
  if (urineLow >= 1 || (scoreMap.urina || 100) < 65) risks.push(risk('urinario', 'Risco urinário', 62 + urineLow * 12, 'Alterações urinárias merecem orientação veterinária.'));
  if (energyLow >= 2 || (scoreMap.energia || 100) < 60) risks.push(risk('sedentarismo', 'Risco de sedentarismo', 55 + energyLow * 10, 'Energia/disposição baixa apareceu mais de uma vez.'));
  if (anxietyLow >= 1 || (scoreMap.ansiedade || 100) < 65) risks.push(risk('ansiedade', 'Risco de ansiedade', 60 + anxietyLow * 12, 'Comportamento ansioso ou alteração emocional foi registrado.'));
  if ((scoreMap.peso || 100) < 65) risks.push(risk('obesidade', 'Risco de peso corporal', 64, 'O acompanhamento de peso precisa ser reforçado.', { label: 'Registrar novo peso', href: '/app/pets' }));
  return risks.sort((a, b) => b.percent - a.percent).slice(0, 6);
}

function buildHealth360Insight({ analysis = {}, payload = {}, pet = {}, score = null } = {}) {
  const ok = [];
  const attention = [];
  const normalized = Object.fromEntries(Object.entries(payload || {}).map(([key, value]) => [key, normalizeHealth360StatusValue(value)]));
  if (['normal'].includes(normalized.appetite)) ok.push('apetite normal');
  if (['menos','nao'].includes(normalized.appetite)) attention.push('alteração no apetite');
  if (['normal'].includes(normalized.water)) ok.push('hidratação adequada');
  if (['menos','muito','nao'].includes(normalized.water)) attention.push('alteração no consumo de água');
  if (['normal'].includes(normalized.energy)) ok.push('energia preservada');
  if (['baixo','muito_baixo'].includes(normalized.energy)) attention.push('redução de atividade física');
  if (['normal'].includes(normalized.sleep)) ok.push('sono sem alteração relevante');
  if (['menos','muito','inquieto'].includes(normalized.sleep)) attention.push('alteração de sono');
  if (['normal'].includes(normalized.stool)) ok.push('fezes normais');
  if (['mole','liquida','sangue','nao_fez'].includes(normalized.stool) || ['sim','persistente','sangue'].includes(normalized.diarrhea)) attention.push('alteração nas fezes');
  if (['normal'].includes(normalized.urination)) ok.push('urina normal');
  if (['pouca','muita','dificuldade','sangue'].includes(normalized.urination)) attention.push('alteração urinária');
  if (!ok.length && !attention.length) ok.push('registro diário realizado');
  const cta = buildHealth360SmartCta(analysis, payload);
  const scoreValue = Number(score?.score || 0) || (analysis.riskLevel === 'high' ? 58 : analysis.riskLevel === 'medium' ? 74 : 87);
  return {
    title: 'PetFunny Health Insight™',
    positives: ok.slice(0, 4),
    attention: attention.slice(0, 4),
    recommendation: analysis.emergency ? 'Buscar atendimento veterinário presencial imediatamente.' : analysis.riskLevel === 'medium' ? 'Acompanhar por 3 dias e considerar teleconsulta veterinária.' : 'Acompanhar por 3 dias e manter rotina preventiva.',
    score: scoreValue,
    scoreText: `${scoreValue}/100`,
    cta
  };
}

function buildHealth360AlertEngine(triageRows = []) {
  const alerts = [];
  const latest = triageRows.slice(0, 7);
  const countBadAppetite = latest.filter((row) => ['menos','nao'].includes(normalizeHealth360StatusValue(row.appetite))).length;
  const countMediumHigh = latest.filter((row) => ['medium','high'].includes(row.risk_level)).length;
  if (countBadAppetite >= 3) alerts.push({ level: 'high', title: '3 dias seguidos sem apetite', message: 'Recomendamos uma teleconsulta veterinária.' });
  if (countMediumHigh >= 2) alerts.push({ level: 'medium', title: 'Sinais de atenção recorrentes', message: 'Considere orientação veterinária para interpretar a evolução.' });
  return alerts;
}

function analyzePetHealthTriage(payload = {}, pet = {}) {
  const normalized = Object.fromEntries(Object.entries(payload || {}).map(([key, value]) => [key, String(value || '').toLowerCase()]));
  const text = Object.values(normalized).join(' ');
  const criticalWords = ['dificuldade para respirar', 'convuls', 'sangramento intenso', 'veneno', 'tóxico', 'toxica', 'trauma', 'desmaio', 'não urina', 'nao urina', 'dor intensa', 'mucosa pálida', 'mucosa palida', 'azulada'];
  const attentionWords = ['vômit', 'vomit', 'diarre', 'febre', 'apatia', 'dor', 'coceira', 'não come', 'nao come', 'prostr', 'ferida', 'vermelhid', 'secreção', 'secrecao', 'odor', 'tosse'];
  const critical = criticalWords.some((word) => text.includes(word))
    || ['sim'].includes(normalized.seizure)
    || ['sim'].includes(normalized.poison)
    || ['convulsao', 'desmaio', 'trauma'].includes(normalized.criticalEvent)
    || ['dificuldade'].includes(normalized.breathing)
    || ['intensa'].includes(normalized.pain)
    || ['sangue'].includes(normalized.diarrhea)
    || ['sangue'].includes(normalized.vomiting)
    || ['sangue', 'dificuldade'].includes(normalized.urination);
  const medium = attentionWords.some((word) => text.includes(word))
    || ['muito_baixo', 'baixo'].includes(normalized.energy)
    || ['nao', 'menos'].includes(normalized.appetite)
    || ['menos', 'muito', 'nao'].includes(normalized.water)
    || ['sim', 'repetido', 'persistente'].includes(normalized.vomiting)
    || ['sim', 'persistente', 'mole', 'liquida'].includes(normalized.diarrhea || normalized.stool)
    || ['ofegante', 'tosse'].includes(normalized.breathing)
    || ['leve', 'moderada'].includes(normalized.pain)
    || ['coceira', 'vermelhidao', 'ferida', 'queda_pelo'].includes(normalized.skinCoat)
    || ['secrecao', 'vermelho', 'odor', 'coçando'].includes(normalized.eyesEars)
    || ['atrasado', 'nao_sei'].includes(normalized.preventiveStatus);
  const riskLevel = critical ? 'high' : medium ? 'medium' : 'low';
  const petName = pet.name || 'Seu pet';
  const redFlags = ['dificuldade para respirar', 'convulsão ou desmaio', 'sangramento intenso', 'suspeita de envenenamento', 'dor intensa', 'apatia forte/prostração', 'vômitos repetidos', 'diarreia ou urina com sangue', 'incapacidade de urinar'];
  const possibleCauses = [];
  if (text.includes('vômit') || text.includes('vomit') || normalized.vomiting) possibleCauses.push('indisposição gastrointestinal, mudança alimentar ou ingestão de algo inadequado');
  if (text.includes('diarre') || normalized.diarrhea || normalized.stool) possibleCauses.push('alteração intestinal, parasitas, alimento inadequado ou infecção');
  if (text.includes('coceira') || normalized.skinCoat) possibleCauses.push('sensibilidade de pele, alergia, parasitas ou irritação dermatológica');
  if (text.includes('ouvido') || normalized.eyesEars) possibleCauses.push('irritação ocular/auricular, alergia ou inflamação');
  if (normalized.preventiveStatus === 'atrasado') possibleCauses.push('preventivos/vacinas em atraso podem aumentar riscos e merecem revisão');
  if (!possibleCauses.length) possibleCauses.push('mudança de rotina, desconforto leve ou sinal inicial que precisa ser observado');
  const guidance = critical
    ? 'Procure atendimento veterinário presencial imediatamente. Não espere evolução pelo app e não medique sem orientação profissional.'
    : medium
      ? 'Monitore alimentação, água, energia, respiração e eliminação. Evite medicamentos sem orientação e agende teleconsulta veterinária para orientar o próximo passo.'
      : 'Observe a evolução nas próximas horas, mantenha água disponível, registre novos sinais e agende teleconsulta se persistir ou piorar.';
  return {
    riskLevel,
    summary: critical ? `${petName} relatou sinais compatíveis com alerta alto e precisa de avaliação presencial.` : medium ? `${petName} apresenta sinais de atenção que merecem acompanhamento e orientação veterinária.` : `${petName} apresenta sinais leves ou iniciais segundo as informações enviadas.`,
    possibleCauses,
    guidance,
    observationPlan: ['Acompanhar apetite e ingestão de água', 'Observar energia, sono e comportamento', 'Registrar vômitos, fezes, urina, dor, coceira ou respiração alterada', 'Procurar veterinário se houver piora ou sinal de alerta'],
    careSuggestions: ['Atualizar prontuário do pet no Saúde 360', 'Manter rotina de banho/tosa quando não houver sinal clínico impeditivo', 'Agendar teleconsulta para dúvidas sobre sintomas', 'Agendar cuidado PetFunny quando o pet estiver apto'],
    redFlags,
    recommendedAction: critical ? 'Buscar emergência veterinária presencial imediatamente.' : medium ? 'Agendar teleconsulta veterinária ou consulta presencial nas próximas horas.' : 'Observar, registrar evolução e agendar teleconsulta se persistir.',
    emergency: critical
  };
}


app.get('/api/app/pets/:petId/care-insights', requireClientAuth, async (req, res, next) => {
  try {
    const tutorId = req.clientApp.tutor.id;
    const petId = cleanText(req.params?.petId);
    if (!petId) return res.status(400).json({ error: 'Informe o pet.' });
    const insight = await getPetCareInsightForClient(petId, tutorId);
    if (!insight) return res.status(404).json({ error: 'Pet não encontrado.' });
    res.json({ ok: true, insight });
  } catch (error) { next(error); }
});


app.post('/api/app/ai-push-reminder', requireClientAuth, async (req, res, next) => {
  try {
    const tutorId = req.clientApp.tutor.id;
    const title = cleanText(req.body?.title) || 'Dica de cuidado PetFunny 🧠';
    const body = cleanText(req.body?.message || req.body?.body) || 'A IA PetFunny gerou uma nova recomendação para o seu pet.';
    const url = cleanText(req.body?.url) || '/app/saude-360';
    const petId = cleanText(req.body?.petId) || 'pet';
    const todayKey = new Date().toISOString().slice(0, 10);
    const tag = `ai-care-${tutorId}-${petId}-${todayKey}`.slice(0, 120);
    const already = await query(`
      SELECT id FROM push_notification_logs
      WHERE tutor_id=$1::uuid AND payload->>'tag'=$2::text AND created_at::date=CURRENT_DATE
      LIMIT 1
    `, [tutorId, tag]).catch(() => ({ rowCount: 0 }));
    if (already.rowCount) return res.json({ ok: true, skipped: true, reason: 'already_sent_today' });
    const pushTargets = await query(`SELECT * FROM push_subscriptions WHERE tutor_id=$1::uuid AND status='active' AND deleted_at IS NULL`, [tutorId]).catch(() => ({ rows: [] }));
    const stats = await sendPushToSubscriptions(pushTargets.rows || [], { title, body, url, tag, type: 'ai-care' });
    res.json({ ok: true, stats });
  } catch (error) { next(error); }
});

app.get('/api/app/health360/summary', requireClientAuth, async (req, res, next) => {
  try {
    const tutorId = req.clientApp.tutor.id;
    const petId = cleanText(req.query?.petId) || '';
    const pets = await query(`SELECT * FROM pets WHERE tutor_id=$1::uuid AND deleted_at IS NULL ORDER BY created_at ASC`, [tutorId]);
    const selectedPet = petId ? pets.rows.find((p) => String(p.id) === petId) : pets.rows[0];
    if (!selectedPet) return res.json({ pets: [], score: { score: 0, label: 'Sem pet', factors: [] }, triages: [], teleconsultations: [], records: [], veterinarians: [] });
    const triages = await query(`SELECT ht.*, p.name AS pet_name FROM pet_health_triages ht INNER JOIN pets p ON p.id=ht.pet_id WHERE ht.tutor_id=$1::uuid AND ht.pet_id=$2::uuid AND ht.deleted_at IS NULL ORDER BY ht.created_at DESC LIMIT 20`, [tutorId, selectedPet.id]);
    const records = await query(`SELECT mr.*, p.name AS pet_name FROM pet_medical_records mr INNER JOIN pets p ON p.id=mr.pet_id WHERE mr.tutor_id=$1::uuid AND mr.pet_id=$2::uuid AND mr.deleted_at IS NULL ORDER BY mr.occurred_at DESC LIMIT 30`, [tutorId, selectedPet.id]);
    const appointments = await query(`SELECT COUNT(*)::int AS total FROM appointments WHERE tutor_id=$1::uuid AND pet_id=$2::uuid AND deleted_at IS NULL`, [tutorId, selectedPet.id]).catch(() => ({ rows: [{ total: 0 }] }));
    const teles = await query(`SELECT tc.*, p.name AS pet_name, v.name AS veterinarian_name, v.crmv AS veterinarian_crmv, v.specialty, v.photo_url AS veterinarian_photo_url FROM teleconsultations tc INNER JOIN pets p ON p.id=tc.pet_id LEFT JOIN veterinarians v ON v.id=tc.veterinarian_id WHERE tc.tutor_id=$1::uuid AND tc.deleted_at IS NULL ORDER BY tc.created_at DESC LIMIT 20`, [tutorId]);
    const vets = await query(`SELECT id, name, crmv, crmv_uf, specialty, bio, photo_url, consultation_price_cents, return_price_cents, default_duration_minutes FROM veterinarians WHERE is_active=TRUE AND deleted_at IS NULL ORDER BY name ASC LIMIT 50`);
    const slots = await query(`
      SELECT s.*, v.name AS veterinarian_name, v.crmv AS veterinarian_crmv, v.crmv_uf AS veterinarian_crmv_uf, v.specialty AS veterinarian_specialty, v.bio AS veterinarian_bio, v.photo_url AS veterinarian_photo_url, v.consultation_price_cents AS veterinarian_price_cents
      FROM teleconsultation_slots s
      INNER JOIN veterinarians v ON v.id=s.veterinarian_id
      WHERE s.deleted_at IS NULL AND v.deleted_at IS NULL AND v.is_active=TRUE AND s.status='available' AND s.starts_at >= NOW()
      ORDER BY s.starts_at ASC
      LIMIT 120
    `).catch(() => ({ rows: [] }));
    const themeScores = buildHealth360ThemeScores(triages.rows || []);
    const predictiveRisks = buildHealth360PredictiveRisks(triages.rows || [], themeScores);
    const score = computeHealth360Score({ pet: selectedPet, lastTriage: triages.rows[0], recordsCount: records.rowCount, appointmentsCount: appointments.rows[0]?.total || 0 });
    if (themeScores.length) {
      const avgThemeScore = Math.round(themeScores.reduce((sum, item) => sum + Number(item.score || 0), 0) / themeScores.length);
      score.score = Math.round((Number(score.score || 0) + avgThemeScore) / 2);
      score.label = score.score >= 90 ? 'Excelente' : score.score >= 75 ? 'Bom' : score.score >= 60 ? 'Atenção' : 'Risco';
      score.factors = [...(score.factors || []), `${themeScores.length} dimensões monitoradas`];
    }
    const todayIso = new Date().toISOString().slice(0, 10);
    const todayTheme = getHealth360DailyThemeForDate(new Date());
    const todayDone = triages.rows.some((row) => String(row.created_at || '').slice(0, 10) === todayIso);
    const alerts = [...buildHealth360AlertEngine(triages.rows || []), ...predictiveRisks.filter((r) => r.percent >= 70).map((r) => ({ level: r.percent >= 80 ? 'high' : 'medium', title: r.title, message: r.reason }))];
    const monitoredDaysResult = await query(`SELECT COUNT(DISTINCT DATE(created_at))::int AS total FROM pet_health_triages WHERE tutor_id=$1::uuid AND pet_id=$2::uuid AND deleted_at IS NULL`, [tutorId, selectedPet.id]).catch(() => ({ rows: [{ total: 0 }] }));
    const dashboard = {
      healthScore: score.score,
      healthLabel: score.label,
      lastTriageLabel: triages.rows[0] ? (String(triages.rows[0].created_at || '').slice(0, 10) === todayIso ? 'Hoje' : new Date(triages.rows[0].created_at).toLocaleDateString('pt-BR')) : 'Nenhuma',
      monitoredDays: Number(monitoredDaysResult.rows[0]?.total || 0),
      activeAlerts: alerts.length
    };
    const dailyTriage = {
      available: !todayDone,
      status: todayDone ? 'completed' : 'available',
      title: todayDone ? '✅ Triagem concluída' : '🩺 Triagem diária disponível',
      theme: todayTheme,
      message: todayDone ? 'A devolutiva de hoje já foi registrada no prontuário.' : `Hoje o Saúde 360 quer avaliar: ${todayTheme.title}.`
    };
    res.json({ pets: pets.rows.map(sanitizeClientPet), selectedPetId: selectedPet.id, score, dashboard, dailyTriage, alerts, themeScores, predictiveRisks, triages: triages.rows.map(sanitizeHealthTriage), records: records.rows.map((row) => ({ id: row.id, petId: row.pet_id, petName: row.pet_name, type: row.type, title: row.title, description: row.description || '', occurredAt: row.occurred_at, createdAt: row.created_at })), teleconsultations: teles.rows.map(sanitizeTeleconsultation), veterinarians: vets.rows.map((v) => ({ id: v.id, name: v.name, crmv: v.crmv || '', crmvUf: v.crmv_uf || '', specialty: v.specialty || '', bio: v.bio || '', photoUrl: v.photo_url || '', consultationPriceCents: Number(v.consultation_price_cents || 0), returnPriceCents: Number(v.return_price_cents || 0), defaultDurationMinutes: Number(v.default_duration_minutes || 30) })), slots: slots.rows.map((s) => ({ id: s.id, veterinarianId: s.veterinarian_id, veterinarianName: s.veterinarian_name || '', veterinarianCrmv: s.veterinarian_crmv || '', veterinarianCrmvUf: s.veterinarian_crmv_uf || '', veterinarianSpecialty: s.veterinarian_specialty || '', veterinarianBio: s.veterinarian_bio || '', veterinarianPhotoUrl: s.veterinarian_photo_url || '', startsAt: s.starts_at, endsAt: s.ends_at, status: s.status || 'available', priceCents: Number(s.price_cents || s.veterinarian_price_cents || 0) })) });
  } catch (error) { next(error); }
});

app.post('/api/app/health360/triage', requireClientAuth, async (req, res, next) => {
  try {
    const tutorId = req.clientApp.tutor.id;
    const petId = cleanText(req.body?.petId);
    const symptoms = cleanText(req.body?.symptoms);
    if (!petId) return res.status(400).json({ error: 'Selecione o pet.' });
    if (!symptoms) return res.status(400).json({ error: 'Descreva o que está acontecendo com o pet.' });
    const pet = await getPetAccessForClient(petId, tutorId);
    if (!pet) return res.status(404).json({ error: 'Pet não encontrado.' });
    const analysis = analyzePetHealthTriage(req.body || {}, pet);
    const thermometer = computeHealth360ThemeThermometer(req.body || {}, analysis);
    const currentScore = computeHealth360Score({ pet, lastTriage: { risk_level: analysis.riskLevel }, recordsCount: 1, appointmentsCount: 1 });
    currentScore.score = Math.round((Number(currentScore.score || 0) + Number(thermometer.score || 0)) / 2);
    currentScore.label = currentScore.score >= 90 ? 'Excelente' : currentScore.score >= 75 ? 'Bom' : currentScore.score >= 60 ? 'Atenção' : 'Risco';
    currentScore.factors = [...(currentScore.factors || []), `${thermometer.title}: ${thermometer.score}/100`];
    const insight = buildHealth360Insight({ analysis, payload: req.body || {}, pet, score: currentScore });
    insight.thermometer = thermometer;
    const enrichedAnalysis = { ...analysis, insight, dailyTheme: cleanText(req.body?.dailyTheme), themeTitle: thermometer.title, thermometer, themeThermometer: thermometer, cta: insight.cta };
    const result = await query(`
      INSERT INTO pet_health_triages (tutor_id, pet_id, symptoms, duration, appetite, water, behavior, vomiting, diarrhea, breathing, pain, bleeding, seizure, trauma, poison, fever, other_signs, risk_level, summary, guidance, red_flags, recommended_action, emergency, ai_used, raw_result)
      VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21::jsonb,$22,$23,false,$24::jsonb)
      RETURNING *
    `, [tutorId, pet.id, symptoms, cleanText(req.body?.duration), cleanText(req.body?.appetite), cleanText(req.body?.water), cleanText(req.body?.behavior), cleanText(req.body?.vomiting), cleanText(req.body?.diarrhea), cleanText(req.body?.breathing), cleanText(req.body?.pain), cleanText(req.body?.bleeding), cleanText(req.body?.seizure), cleanText(req.body?.trauma), cleanText(req.body?.poison), cleanText(req.body?.fever), cleanText(req.body?.otherSigns), analysis.riskLevel, analysis.summary, analysis.guidance, JSON.stringify(analysis.redFlags), insight.cta?.label || analysis.recommendedAction, analysis.emergency, JSON.stringify(enrichedAnalysis)]);
    const positiveLines = insight.positives.map((item) => `✔ ${item}`).join('\n');
    const attentionLines = insight.attention.length ? `\n${insight.attention.map((item) => `⚠ ${item}`).join('\n')}` : '';
    const prontuarioDescription = `${insight.title}\n\n${pet.name || 'Pet'} apresentou:\n${positiveLines}${attentionLines}\n\nRecomendação:\n${insight.recommendation}\n\nHealth Score:\n${insight.scoreText}`;
    await query(`INSERT INTO pet_medical_records (tutor_id, pet_id, type, title, description, source_type, source_id) VALUES ($1::uuid,$2::uuid,'TRIAGE',$3,$4,'pet_health_triages',$5::uuid)`, [tutorId, pet.id, `${insight.title} · ${analysis.riskLevel}`, prontuarioDescription, result.rows[0].id]);
    res.status(201).json({ triage: { ...sanitizeHealthTriage({ ...result.rows[0], pet_name: pet.name }), insight, recommendedAction: insight.cta?.label || analysis.recommendedAction }, insight, message: analysis.emergency ? 'Triagem registrada. Procure emergência presencial.' : 'Triagem Health 360 registrada.' });
  } catch (error) { next(error); }
});


app.get('/api/app/teleconsultations/options', requireClientAuth, async (req, res, next) => {
  try {
    const tutorId = req.clientApp.tutor.id;
    const petId = cleanText(req.query?.petId) || '';
    const petsResult = await query(`SELECT * FROM pets WHERE tutor_id=$1::uuid AND deleted_at IS NULL ORDER BY created_at ASC`, [tutorId]);
    const selectedPet = petId ? petsResult.rows.find((pet) => String(pet.id) === String(petId)) : petsResult.rows[0];
    if (!selectedPet) return res.json({ pets: [], selectedPet: null, veterinarians: [], slots: [], teleconsultations: [] });
    const vetsResult = await query(`
      SELECT id, name, crmv, crmv_uf, specialty, bio, photo_url, consultation_price_cents, return_price_cents, default_duration_minutes
      FROM veterinarians
      WHERE is_active=TRUE AND deleted_at IS NULL
      ORDER BY name ASC
      LIMIT 50
    `);
    const slotsResult = await query(`
      SELECT s.*, v.name AS veterinarian_name, v.crmv AS veterinarian_crmv, v.crmv_uf AS veterinarian_crmv_uf, v.specialty AS veterinarian_specialty, v.bio AS veterinarian_bio, v.photo_url AS veterinarian_photo_url, v.consultation_price_cents AS veterinarian_price_cents
      FROM teleconsultation_slots s
      INNER JOIN veterinarians v ON v.id=s.veterinarian_id
      WHERE s.deleted_at IS NULL AND v.deleted_at IS NULL AND v.is_active=TRUE AND s.status='available' AND s.starts_at >= NOW()
      ORDER BY s.starts_at ASC
      LIMIT 120
    `).catch(() => ({ rows: [] }));
    const telesResult = await query(`
      SELECT tc.*, p.name AS pet_name, v.name AS veterinarian_name
      FROM teleconsultations tc
      INNER JOIN pets p ON p.id=tc.pet_id
      LEFT JOIN veterinarians v ON v.id=tc.veterinarian_id
      WHERE tc.tutor_id=$1::uuid AND tc.deleted_at IS NULL
      ORDER BY tc.created_at DESC
      LIMIT 20
    `, [tutorId]).catch(() => ({ rows: [] }));
    res.json({
      pets: petsResult.rows.map(sanitizeClientPet),
      selectedPet: sanitizeClientPet(selectedPet),
      veterinarians: vetsResult.rows.map((v) => ({ id: v.id, name: v.name, crmv: v.crmv || '', crmvUf: v.crmv_uf || '', specialty: v.specialty || '', bio: v.bio || '', photoUrl: v.photo_url || '', consultationPriceCents: Number(v.consultation_price_cents || 0), returnPriceCents: Number(v.return_price_cents || 0), defaultDurationMinutes: Number(v.default_duration_minutes || 30) })),
      slots: slotsResult.rows.map((slot) => ({ id: slot.id, veterinarianId: slot.veterinarian_id, veterinarianName: slot.veterinarian_name || '', veterinarianCrmv: slot.veterinarian_crmv || '', veterinarianCrmvUf: slot.veterinarian_crmv_uf || '', veterinarianSpecialty: slot.veterinarian_specialty || '', veterinarianBio: slot.veterinarian_bio || '', veterinarianPhotoUrl: slot.veterinarian_photo_url || '', startsAt: slot.starts_at, endsAt: slot.ends_at, status: slot.status || 'available', priceCents: Number(slot.price_cents || slot.veterinarian_price_cents || 0) })),
      teleconsultations: telesResult.rows.map(sanitizeTeleconsultation)
    });
  } catch (error) { next(error); }
});

app.get('/api/app/teleconsultations', requireClientAuth, async (req, res, next) => {
  try {
    const result = await query(`SELECT tc.*, p.name AS pet_name, v.name AS veterinarian_name FROM teleconsultations tc INNER JOIN pets p ON p.id=tc.pet_id LEFT JOIN veterinarians v ON v.id=tc.veterinarian_id WHERE tc.tutor_id=$1::uuid AND tc.deleted_at IS NULL ORDER BY tc.created_at DESC LIMIT 50`, [req.clientApp.tutor.id]);
    res.json({ items: result.rows.map(sanitizeTeleconsultation) });
  } catch (error) { next(error); }
});


app.post('/api/app/teleconsultations', requireClientAuth, async (req, res, next) => {
  try {
    const tutorId = req.clientApp.tutor.id;
    const accountId = req.clientApp.account?.id || null;
    const tutorEmail = req.clientApp.tutor.email || req.clientApp.account?.email || '';
    const petId = cleanText(req.body?.petId);
    const reason = cleanText(req.body?.reason);
    if (!petId) return res.status(400).json({ error: 'Selecione o pet.' });
    if (!reason) return res.status(400).json({ error: 'Informe o motivo da teleconsulta.' });
    const pet = await getPetAccessForClient(petId, tutorId);
    if (!pet) return res.status(404).json({ error: 'Pet não encontrado.' });
    const vetId = cleanText(req.body?.veterinarianId) || null;
    const slotId = cleanText(req.body?.slotId) || null;
    const startsAt = cleanText(req.body?.startsAt) || null;
    const paymentType = normalizeAppPaymentType(req.body?.paymentType || req.body?.paymentMethod || 'pix');
    const vet = vetId ? await query(`SELECT * FROM veterinarians WHERE id=$1::uuid AND deleted_at IS NULL LIMIT 1`, [vetId]) : { rows: [] };
    const slot = slotId ? await query(`SELECT * FROM teleconsultation_slots WHERE id=$1::uuid AND deleted_at IS NULL AND status='available' LIMIT 1`, [slotId]) : { rows: [] };
    if (slotId && !slot.rowCount) return res.status(409).json({ error: 'Este horário não está mais disponível.' });
    const price = Number(slot.rows[0]?.price_cents || vet.rows[0]?.consultation_price_cents || 9900);
    const finalStartsAt = slot.rows[0]?.starts_at || startsAt || null;
    const finalStartsAtIso = toIsoOrNull(finalStartsAt);
    if (!finalStartsAtIso) return res.status(400).json({ error: 'Selecione um dia e horário válido para a teleconsulta.' });
    const meetingUrl = `https://meet.jit.si/petfunny-health360-${String(pet.id).slice(0,8)}-${Date.now()}`;
    await ensureTeleconsultationPaymentIntentCompatibility();
    await query('BEGIN');
    const result = await query(`
      INSERT INTO teleconsultations (tutor_id, pet_id, veterinarian_id, slot_id, reason, symptoms, starts_at, price_cents, payment_method, payment_status, status, meeting_url, safety_notice_accepted)
      VALUES ($1::uuid,$2::uuid,NULLIF($3::text,'')::uuid,NULLIF($4::text,'')::uuid,$5,$6,NULLIF($7::text,'')::timestamptz,$8,$9,'pending','pending_payment',$10,TRUE)
      RETURNING *
    `, [tutorId, pet.id, vetId || '', slotId || '', reason, cleanText(req.body?.symptoms), finalStartsAtIso, price, paymentType, meetingUrl]);
    if (slot.rowCount) await query(`UPDATE teleconsultation_slots SET status='reserved', updated_at=NOW() WHERE id=$1::uuid`, [slot.rows[0].id]);
    const expiresAt = new Date(Date.now() + getMercadoPagoPixExpirationMinutes() * 60 * 1000);
    const description = `Teleconsulta PetFunny Health 360 · ${pet.name}`;
    const intent = await query(`
      INSERT INTO teleconsultation_payment_intents (tutor_id, client_account_id, pet_id, teleconsultation_id, status, payment_type, amount_cents, description, pending_payload, expires_at)
      VALUES ($1::uuid, NULLIF($2::text,'')::uuid, $3::uuid, $4::uuid, 'pending', $5, $6, $7, $8::jsonb, $9::timestamptz)
      RETURNING *
    `, [tutorId, accountId || '', pet.id, result.rows[0].id, paymentType, price, description, JSON.stringify(req.body || {}), expiresAt.toISOString()]);
    await query(`INSERT INTO pet_medical_records (tutor_id, pet_id, type, title, description, source_type, source_id, occurred_at) VALUES ($1::uuid,$2::uuid,'APPOINTMENT','Teleconsulta solicitada',$3,'teleconsultations',$4::uuid,COALESCE(NULLIF($5::text,'')::timestamptz,NOW()))`, [tutorId, pet.id, reason, result.rows[0].id, finalStartsAtIso]);
    await query('COMMIT');
    if (isCardLikeAppPaymentType(paymentType)) {
      if (!env.mercadoPagoPublicKey) return res.status(201).json({ requiresPayment: true, paymentIntent: sanitizeTeleconsultationPaymentIntent({ ...intent.rows[0], tutor_email: tutorEmail }), teleconsultation: sanitizeTeleconsultation({ ...result.rows[0], pet_name: pet.name, veterinarian_name: vet.rows[0]?.name }), message: 'Teleconsulta criada. Pagamento por cartão está indisponível no momento; use Pix ou tente novamente mais tarde.' });
      await query(`UPDATE teleconsultation_payment_intents SET provider_response=jsonb_build_object('flow','card_payment_brick','status','waiting_card_data'), updated_at=NOW() WHERE id=$1::uuid`, [intent.rows[0].id]);
      return res.status(201).json({ requiresPayment: true, paymentIntent: sanitizeTeleconsultationPaymentIntent({ ...intent.rows[0], tutor_email: tutorEmail, provider_response: { flow: 'card_payment_brick' } }), teleconsultation: sanitizeTeleconsultation({ ...result.rows[0], pet_name: pet.name, veterinarian_name: vet.rows[0]?.name }), message: 'Teleconsulta criada. Finalize o pagamento por cartão dentro do app.' });
    }
    try {
      if (!isMercadoPagoConfigured()) throw new Error('Pagamento online indisponível. Configure as credenciais de pagamento.');
      const mp = await createMercadoPagoPixPayment({ intentId: intent.rows[0].id, amountCents: price, description, payerEmail: tutorEmail, payerName: req.clientApp.tutor.name });
      const updated = await query(`UPDATE teleconsultation_payment_intents SET mp_payment_id=$2::text, mp_status=$3::text, qr_code=$4::text, qr_code_base64=$5::text, provider_response=$6::jsonb, updated_at=NOW() WHERE id=$1::uuid RETURNING *`, [intent.rows[0].id, mp.paymentId, mp.status, mp.qrCode, mp.qrCodeBase64, JSON.stringify(mp.payment || {})]);
      return res.status(201).json({ requiresPayment: true, paymentIntent: sanitizeTeleconsultationPaymentIntent({ ...updated.rows[0], tutor_email: tutorEmail }), teleconsultation: sanitizeTeleconsultation({ ...result.rows[0], pet_name: pet.name, veterinarian_name: vet.rows[0]?.name }), message: 'Pix da teleconsulta gerado. A consulta será confirmada após o pagamento.' });
    } catch (error) {
      await query(`UPDATE teleconsultation_payment_intents SET last_error=$2::text, provider_response=$3::jsonb, updated_at=NOW() WHERE id=$1::uuid`, [intent.rows[0].id, error.message, JSON.stringify(error.details || {})]).catch(() => null);
      return res.status(error.status || 503).json({ error: error.message || 'Não foi possível gerar o pagamento da teleconsulta.' });
    }
  } catch (error) { try { await query('ROLLBACK'); } catch {} next(error); }
});

function sanitizeTeleconsultationPaymentIntent(row = {}) {
  const base = sanitizePaymentIntent(row);
  return { ...base, kind: 'teleconsultation', teleconsultationId: row.teleconsultation_id || null };
}

async function ensureTeleconsultationPaymentIntentCompatibility() {
  const exists = await hasTable('teleconsultation_payment_intents').catch(() => false);
  if (!exists) return;
  await query(`ALTER TABLE teleconsultation_payment_intents ADD COLUMN IF NOT EXISTS payment_type TEXT NOT NULL DEFAULT 'pix'`).catch(() => null);
  await query(`ALTER TABLE teleconsultation_payment_intents ADD COLUMN IF NOT EXISTS mp_preference_id TEXT`).catch(() => null);
  await query(`ALTER TABLE teleconsultation_payment_intents ADD COLUMN IF NOT EXISTS checkout_url TEXT`).catch(() => null);
}

async function finalizePaidTeleconsultationIntent(intentId, providerStatus = 'approved', providerResponse = {}) {
  await ensureTeleconsultationPaymentIntentCompatibility();
  const intentResult = await query(`SELECT * FROM teleconsultation_payment_intents WHERE id=$1::uuid AND deleted_at IS NULL LIMIT 1`, [intentId]);
  if (!intentResult.rowCount) throw new Error('Pagamento da teleconsulta não encontrado.');
  const intent = intentResult.rows[0];
  const paidAt = new Date().toISOString();
  const tele = await query(`
    UPDATE teleconsultations
    SET payment_status='paid', status='scheduled', updated_at=NOW()
    WHERE id=$1::uuid AND deleted_at IS NULL
    RETURNING *
  `, [intent.teleconsultation_id]);
  await query(`UPDATE teleconsultation_payment_intents SET status='paid', paid_at=$2::timestamptz, mp_status=$3::text, provider_response=$4::jsonb, updated_at=NOW() WHERE id=$1::uuid`, [intent.id, paidAt, providerStatus, JSON.stringify(providerResponse || {})]);
  if (tele.rowCount) {
    await query(`INSERT INTO pet_medical_records (tutor_id, pet_id, type, title, description, source_type, source_id, occurred_at)
      VALUES ($1::uuid,$2::uuid,'PAYMENT','Teleconsulta paga','Pagamento confirmado para teleconsulta PetFunny Health 360.','teleconsultations',$3::uuid,NOW())`, [tele.rows[0].tutor_id, tele.rows[0].pet_id, tele.rows[0].id]).catch(() => null);
  }
  return { teleconsultation: tele.rows[0] || null };
}

app.get('/api/app/teleconsultations/payment/:intentId', requireClientAuth, async (req, res, next) => {
  try {
    const result = await query(`SELECT tpi.*, t.email AS tutor_email FROM teleconsultation_payment_intents tpi LEFT JOIN tutors t ON t.id=tpi.tutor_id WHERE tpi.id=$1::uuid AND tpi.tutor_id=$2::uuid AND tpi.deleted_at IS NULL LIMIT 1`, [req.params.intentId, req.clientApp.tutor.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Pagamento da teleconsulta não encontrado.' });
    let intent = result.rows[0];
    if (intent.status === 'paid') return res.json({ paymentIntent: sanitizeTeleconsultationPaymentIntent(intent), teleconsultationId: intent.teleconsultation_id, message: 'Teleconsulta paga e confirmada.' });
    if (intent.mp_payment_id && isMercadoPagoConfigured()) {
      const payment = await mercadoPagoRequest(`/v1/payments/${intent.mp_payment_id}`);
      await query(`UPDATE teleconsultation_payment_intents SET mp_status=$2::text, provider_response=$3::jsonb, updated_at=NOW() WHERE id=$1::uuid`, [intent.id, payment.status || '', JSON.stringify(payment || {})]);
      if (payment.status === 'approved') {
        await finalizePaidTeleconsultationIntent(intent.id, payment.status, payment);
        intent = { ...intent, status: 'paid', paid_at: new Date().toISOString(), mp_status: payment.status };
        return res.json({ paymentIntent: sanitizeTeleconsultationPaymentIntent(intent), teleconsultationId: intent.teleconsultation_id, message: 'Pagamento confirmado. Teleconsulta agendada.' });
      }
      intent = { ...intent, mp_status: payment.status || intent.mp_status };
    }
    res.json({ paymentIntent: sanitizeTeleconsultationPaymentIntent(intent), message: normalizeAppPaymentType(intent.payment_type) === 'card' ? 'Pagamento por cartão ainda não aprovado.' : 'Pagamento Pix ainda não confirmado.' });
  } catch (error) { next(error); }
});

app.post('/api/app/teleconsultations/payment/:intentId/card', requireClientAuth, async (req, res, next) => {
  try {
    if (!isMercadoPagoConfigured()) return res.status(503).json({ error: 'Pagamento online indisponível. Configure as credenciais de pagamento.' });
    const intentResult = await query(`SELECT tpi.*, t.name AS tutor_name, t.email AS tutor_email FROM teleconsultation_payment_intents tpi LEFT JOIN tutors t ON t.id=tpi.tutor_id WHERE tpi.id=$1::uuid AND tpi.tutor_id=$2::uuid AND tpi.deleted_at IS NULL LIMIT 1`, [req.params.intentId, req.clientApp.tutor.id]);
    if (!intentResult.rowCount) return res.status(404).json({ error: 'Pagamento da teleconsulta não encontrado.' });
    const intent = intentResult.rows[0];
    if (normalizeAppPaymentType(intent.payment_type || 'pix') !== 'card') return res.status(400).json({ error: 'Este pagamento não foi iniciado como cartão.' });
    if (intent.status === 'paid') return res.json({ paymentIntent: sanitizeTeleconsultationPaymentIntent(intent), teleconsultationId: intent.teleconsultation_id, message: 'Teleconsulta já estava paga.' });
    const payment = await createMercadoPagoCardPayment({ intentId: intent.id, amountCents: intent.amount_cents, description: intent.description, payerEmail: intent.tutor_email, payerName: intent.tutor_name, cardData: normalizeMercadoPagoCardData(req.body || {}), kind: 'teleconsultation' });
    await query(`UPDATE teleconsultation_payment_intents SET mp_payment_id=$2::text, mp_status=$3::text, provider_response=$4::jsonb, last_error=NULL, updated_at=NOW() WHERE id=$1::uuid`, [intent.id, String(payment.id || ''), payment.status || '', JSON.stringify(payment || {})]);
    if (payment.status === 'approved') {
      await finalizePaidTeleconsultationIntent(intent.id, payment.status, payment);
      return res.status(201).json({ paymentIntent: sanitizeTeleconsultationPaymentIntent({ ...intent, status: 'paid', paid_at: new Date().toISOString(), mp_payment_id: String(payment.id || ''), mp_status: payment.status }), teleconsultationId: intent.teleconsultation_id, message: 'Cartão aprovado. Teleconsulta agendada com sucesso.' });
    }
    const message = payment.status === 'rejected' ? `Pagamento recusado${payment.status_detail ? `: ${payment.status_detail}` : '.'}` : 'Pagamento enviado e aguardando confirmação.';
    return res.status(payment.status === 'rejected' ? 402 : 202).json({ paymentIntent: sanitizeTeleconsultationPaymentIntent({ ...intent, mp_payment_id: String(payment.id || ''), mp_status: payment.status, provider_response: payment }), message, mercadoPago: { status: payment.status, statusDetail: payment.status_detail || '' } });
  } catch (error) { next(error); }
});

function sanitizeAdminVeterinarian(row = {}) {
  return { id: row.id, name: row.name || '', crmv: row.crmv || '', crmvUf: row.crmv_uf || '', specialty: row.specialty || '', phone: row.phone || '', whatsapp: row.whatsapp || '', email: row.email || '', bio: row.bio || '', photoUrl: row.photo_url || '', consultationPriceCents: Number(row.consultation_price_cents || 0), returnPriceCents: Number(row.return_price_cents || 0), defaultDurationMinutes: Number(row.default_duration_minutes || 30), isActive: row.is_active !== false, createdAt: row.created_at, updatedAt: row.updated_at };
}
function sanitizeAdminTeleSlot(row = {}) {
  return {
    id: row.id,
    veterinarianId: row.veterinarian_id,
    veterinarianName: row.veterinarian_name || '',
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status || 'available',
    priceCents: Number(row.price_cents || 0),
    teleconsultationId: row.teleconsultation_id || null,
    tutorName: row.tutor_name || '',
    petName: row.pet_name || '',
    meetingUrl: row.meeting_url || '',
    createdAt: row.created_at
  };
}


function normalizeBulkUuidIds(value) {
  const ids = Array.isArray(value) ? value : [];
  return [...new Set(ids.map(id => cleanText(id)).filter(id => /^[0-9a-fA-F-]{36}$/.test(id)))];
}

app.get('/api/admin/health360/summary', requireAuth, async (req, res, next) => {
  try {
    const [vets, slots, triages, teles, finance] = await Promise.all([
      query(`SELECT COUNT(*)::int total, COUNT(*) FILTER (WHERE is_active AND deleted_at IS NULL)::int active FROM veterinarians WHERE deleted_at IS NULL`),
      query(`SELECT COUNT(*)::int available FROM teleconsultation_slots WHERE deleted_at IS NULL AND status='available' AND starts_at >= NOW()`),
      query(`SELECT COUNT(*)::int total, COUNT(*) FILTER (WHERE risk_level='high')::int high FROM pet_health_triages WHERE deleted_at IS NULL`),
      query(`SELECT COUNT(*)::int total, COUNT(*) FILTER (WHERE status IN ('scheduled','completed'))::int scheduled FROM teleconsultations WHERE deleted_at IS NULL`),
      query(`SELECT COALESCE(SUM(price_cents) FILTER (WHERE payment_status='paid'),0)::bigint revenue, COUNT(*) FILTER (WHERE payment_status='paid')::int paid_count FROM teleconsultations WHERE deleted_at IS NULL`)
    ]);
    res.json({
      veterinarians: vets.rows[0] || {},
      slots: slots.rows[0] || {},
      triages: triages.rows[0] || {},
      teleconsultations: teles.rows[0] || {},
      finance: finance.rows[0] || {}
    });
  } catch (error) { next(error); }
});

app.get('/api/admin/health360/veterinarians', requireAuth, async (req, res, next) => {
  try { const result = await query(`SELECT * FROM veterinarians WHERE deleted_at IS NULL ORDER BY is_active DESC, name ASC`); res.json({ items: result.rows.map(sanitizeAdminVeterinarian) }); } catch (error) { next(error); }
});
app.post('/api/admin/health360/veterinarians', requireAuth, async (req, res, next) => {
  try {
    const name = cleanText(req.body?.name); if (!name) return res.status(400).json({ error: 'Informe o nome do veterinário.' });
    const isActive = req.body?.isActive === false || req.body?.is_active === false ? false : true;
    const result = await query(`INSERT INTO veterinarians (name, crmv, crmv_uf, specialty, phone, whatsapp, email, bio, photo_url, consultation_price_cents, return_price_cents, default_duration_minutes, is_active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`, [name, cleanText(req.body?.crmv), cleanText(req.body?.crmvUf || req.body?.crmv_uf), cleanText(req.body?.specialty) || 'Clínica geral', cleanText(req.body?.phone), cleanText(req.body?.whatsapp), cleanText(req.body?.email), cleanText(req.body?.bio), cleanText(req.body?.photoUrl || req.body?.photo_url), moneyToCents(req.body?.consultationPriceCents || req.body?.consultationPrice || req.body?.price), moneyToCents(req.body?.returnPriceCents || req.body?.returnPrice), Number(req.body?.defaultDurationMinutes || 30), isActive]);
    res.status(201).json({ veterinarian: sanitizeAdminVeterinarian(result.rows[0]) });
  } catch (error) { next(error); }
});
app.post('/api/admin/health360/veterinarians/bulk-delete', requireAuth, async (req, res, next) => {
  try {
    const ids = normalizeBulkUuidIds(req.body?.ids);
    if (!ids.length) return res.status(400).json({ error: 'Selecione ao menos um veterinário.' });
    const result = await query(`UPDATE veterinarians SET deleted_at=NOW(), is_active=FALSE, updated_at=NOW() WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL`, [ids]);
    res.json({ ok: true, deleted: result.rowCount || 0 });
  } catch (error) { next(error); }
});

app.put('/api/admin/health360/veterinarians/:id', requireAuth, async (req, res, next) => {
  try {
    const isActive = req.body?.isActive === false || req.body?.is_active === false ? false : true;
    const result = await query(`UPDATE veterinarians SET name=$2, crmv=$3, crmv_uf=$4, specialty=$5, phone=$6, whatsapp=$7, email=$8, bio=$9, photo_url=$10, consultation_price_cents=$11, return_price_cents=$12, default_duration_minutes=$13, is_active=$14, updated_at=NOW() WHERE id=$1::uuid AND deleted_at IS NULL RETURNING *`, [req.params.id, cleanText(req.body?.name), cleanText(req.body?.crmv), cleanText(req.body?.crmvUf || req.body?.crmv_uf), cleanText(req.body?.specialty) || 'Clínica geral', cleanText(req.body?.phone), cleanText(req.body?.whatsapp), cleanText(req.body?.email), cleanText(req.body?.bio), cleanText(req.body?.photoUrl || req.body?.photo_url), moneyToCents(req.body?.consultationPriceCents || req.body?.consultationPrice || req.body?.price), moneyToCents(req.body?.returnPriceCents || req.body?.returnPrice), Number(req.body?.defaultDurationMinutes || 30), isActive]);
    if (!result.rowCount) return res.status(404).json({ error: 'Veterinário não encontrado.' });
    res.json({ veterinarian: sanitizeAdminVeterinarian(result.rows[0]) });
  } catch (error) { next(error); }
});
app.patch('/api/admin/health360/veterinarians/:id/toggle', requireAuth, async (req, res, next) => {
  try { const result = await query(`UPDATE veterinarians SET is_active=NOT is_active, updated_at=NOW() WHERE id=$1::uuid AND deleted_at IS NULL RETURNING *`, [req.params.id]); res.json({ veterinarian: sanitizeAdminVeterinarian(result.rows[0]) }); } catch (error) { next(error); }
});
app.delete('/api/admin/health360/veterinarians/:id', requireAuth, async (req, res, next) => {
  try { await query(`UPDATE veterinarians SET deleted_at=NOW(), is_active=FALSE, updated_at=NOW() WHERE id=$1::uuid`, [req.params.id]); res.json({ ok: true }); } catch (error) { next(error); }
});

app.get('/api/admin/health360/slots', requireAuth, async (req, res, next) => {
  try {
    const result = await query(`SELECT s.*, v.name AS veterinarian_name, tc.id AS teleconsultation_id, tc.meeting_url, t.name AS tutor_name, p.name AS pet_name FROM teleconsultation_slots s LEFT JOIN veterinarians v ON v.id=s.veterinarian_id LEFT JOIN teleconsultations tc ON tc.slot_id=s.id AND tc.deleted_at IS NULL LEFT JOIN tutors t ON t.id=tc.tutor_id LEFT JOIN pets p ON p.id=tc.pet_id WHERE s.deleted_at IS NULL ORDER BY s.starts_at DESC LIMIT 500`);
    res.json({ items: result.rows.map(sanitizeAdminTeleSlot) });
  } catch (error) { next(error); }
});
app.post('/api/admin/health360/slots', requireAuth, async (req, res, next) => {
  try {
    const vetId = cleanText(req.body?.veterinarianId); const startsAt = cleanText(req.body?.startsAt); if (!vetId || !startsAt) return res.status(400).json({ error: 'Informe veterinário e início do horário.' });
    const duration = Number(req.body?.durationMinutes || req.body?.defaultDurationMinutes || 30);
    const price = moneyToCents(req.body?.priceCents || req.body?.price || req.body?.consultationPrice);
    const result = await query(`INSERT INTO teleconsultation_slots (veterinarian_id, starts_at, ends_at, status, price_cents) VALUES ($1::uuid,$2::timestamptz,($2::timestamptz + ($3::int || ' minutes')::interval),'available',$4) RETURNING *`, [vetId, startsAt, duration, price || 9900]);
    res.status(201).json({ slot: sanitizeAdminTeleSlot(result.rows[0]) });
  } catch (error) { next(error); }
});
app.post('/api/admin/health360/slots/bulk-delete', requireAuth, async (req, res, next) => {
  try {
    const ids = normalizeBulkUuidIds(req.body?.ids);
    if (!ids.length) return res.status(400).json({ error: 'Selecione ao menos um horário.' });
    const result = await query(`UPDATE teleconsultation_slots SET deleted_at=NOW(), updated_at=NOW() WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL`, [ids]);
    res.json({ ok: true, deleted: result.rowCount || 0 });
  } catch (error) { next(error); }
});

app.put('/api/admin/health360/slots/:id', requireAuth, async (req, res, next) => {
  try {
    const vetId = cleanText(req.body?.veterinarianId);
    const startsAt = cleanText(req.body?.startsAt);
    if (!vetId || !startsAt) return res.status(400).json({ error: 'Informe veterinário e início do horário.' });
    const duration = Math.max(10, Number(req.body?.durationMinutes || 30));
    const price = moneyToCents(req.body?.priceCents || req.body?.price || req.body?.consultationPrice) || 9900;
    const status = ['available','reserved','completed','cancelled','blocked'].includes(cleanText(req.body?.status)) ? cleanText(req.body?.status) : 'available';
    const result = await query(`UPDATE teleconsultation_slots SET veterinarian_id=$2::uuid, starts_at=$3::timestamptz, ends_at=($3::timestamptz + ($4::int || ' minutes')::interval), price_cents=$5, status=$6, updated_at=NOW() WHERE id=$1::uuid AND deleted_at IS NULL RETURNING *`, [req.params.id, vetId, startsAt, duration, price, status]);
    if (!result.rowCount) return res.status(404).json({ error: 'Horário não encontrado.' });
    res.json({ slot: sanitizeAdminTeleSlot(result.rows[0]) });
  } catch (error) { next(error); }
});

app.patch('/api/admin/health360/slots/:id/status', requireAuth, async (req, res, next) => {
  try { const status = ['available','reserved','completed','cancelled','blocked'].includes(cleanText(req.body?.status)) ? cleanText(req.body?.status) : 'available'; const result = await query(`UPDATE teleconsultation_slots SET status=$2, updated_at=NOW() WHERE id=$1::uuid AND deleted_at IS NULL RETURNING *`, [req.params.id, status]); res.json({ slot: sanitizeAdminTeleSlot(result.rows[0]) }); } catch (error) { next(error); }
});
app.delete('/api/admin/health360/slots/:id', requireAuth, async (req, res, next) => {
  try { await query(`UPDATE teleconsultation_slots SET deleted_at=NOW(), updated_at=NOW() WHERE id=$1::uuid`, [req.params.id]); res.json({ ok: true }); } catch (error) { next(error); }
});

app.post('/api/admin/health360/triages/bulk-delete', requireAuth, async (req, res, next) => {
  try {
    const ids = normalizeBulkUuidIds(req.body?.ids);
    if (!ids.length) return res.status(400).json({ error: 'Selecione ao menos uma triagem.' });
    const result = await query(`UPDATE pet_health_triages SET deleted_at=NOW(), updated_at=NOW() WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL`, [ids]);
    res.json({ ok: true, deleted: result.rowCount || 0 });
  } catch (error) { next(error); }
});

app.get('/api/admin/health360/triages', requireAuth, async (req, res, next) => {
  try {
    const result = await query(`SELECT ht.*, t.name AS tutor_name, p.name AS pet_name FROM pet_health_triages ht LEFT JOIN tutors t ON t.id=ht.tutor_id LEFT JOIN pets p ON p.id=ht.pet_id WHERE ht.deleted_at IS NULL ORDER BY ht.created_at DESC LIMIT 200`);
    res.json({ items: result.rows.map((row) => ({ ...sanitizeHealthTriage(row), tutorName: row.tutor_name || '' })) });
  } catch (error) { next(error); }
});
app.post('/api/admin/health360/teleconsultations/bulk-delete', requireAuth, async (req, res, next) => {
  try {
    const ids = normalizeBulkUuidIds(req.body?.ids);
    if (!ids.length) return res.status(400).json({ error: 'Selecione ao menos uma teleconsulta.' });
    const result = await query(`UPDATE teleconsultations SET deleted_at=NOW(), updated_at=NOW() WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL`, [ids]);
    res.json({ ok: true, deleted: result.rowCount || 0 });
  } catch (error) { next(error); }
});

app.get('/api/admin/health360/teleconsultations', requireAuth, async (req, res, next) => {
  try {
    const result = await query(`SELECT tc.*, t.name AS tutor_name, p.name AS pet_name, v.name AS veterinarian_name, v.crmv AS veterinarian_crmv, v.specialty FROM teleconsultations tc LEFT JOIN tutors t ON t.id=tc.tutor_id LEFT JOIN pets p ON p.id=tc.pet_id LEFT JOIN veterinarians v ON v.id=tc.veterinarian_id WHERE tc.deleted_at IS NULL ORDER BY tc.created_at DESC LIMIT 200`);
    res.json({ items: result.rows.map(sanitizeTeleconsultation) });
  } catch (error) { next(error); }
});
app.patch('/api/admin/health360/teleconsultations/:id/status', requireAuth, async (req, res, next) => {
  try { const status = ['pending_payment','scheduled','completed','cancelled','no_show'].includes(cleanText(req.body?.status)) ? cleanText(req.body?.status) : 'scheduled'; const result = await query(`UPDATE teleconsultations SET status=$2, updated_at=NOW() WHERE id=$1::uuid AND deleted_at IS NULL RETURNING *`, [req.params.id, status]); res.json({ teleconsultation: sanitizeTeleconsultation(result.rows[0]) }); } catch (error) { next(error); }
});
app.patch('/api/admin/health360/teleconsultations/:id/paid', requireAuth, async (req, res, next) => {
  try { const result = await query(`UPDATE teleconsultations SET payment_status='paid', status=CASE WHEN status='pending_payment' THEN 'scheduled' ELSE status END, updated_at=NOW() WHERE id=$1::uuid AND deleted_at IS NULL RETURNING *`, [req.params.id]); res.json({ teleconsultation: sanitizeTeleconsultation(result.rows[0]) }); } catch (error) { next(error); }
});

app.post('/api/app/logout', requireClientAuth, async (req, res) => {
  res.json({ ok: true, message: 'Sessão encerrada no aplicativo do cliente.' });
});



function moneyToCents(value) {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'number') return Math.max(0, Math.round(value));
  const text = String(value).trim();
  if (!text) return 0;
  // Aceita tanto centavos diretos quanto formato brasileiro: R$ 55,90 / 55,90
  if (/^\d+$/.test(text)) return Math.max(0, Number(text));
  const normalized = text.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
  const amount = Number.parseFloat(normalized);
  if (!Number.isFinite(amount)) return 0;
  return Math.max(0, Math.round(amount * 100));
}

function sanitizeService(row = {}) {
  return {
    id: row.id,
    categoryId: row.category_id,
    categoryName: row.category_name,
    categoryPetTypeCode: row.category_pet_type_code || row.pet_type_code || null,
    categoryPetTypeName: row.category_pet_type_name || row.pet_type_name || null,
    categoryPetSizeCode: row.category_pet_size_code || row.pet_size_code || null,
    categoryPetSizeName: row.category_pet_size_name || row.pet_size_name || null,
    name: row.name,
    description: row.description,
    petSize: row.pet_size,
    petSizeName: row.pet_size_name || row.pet_size,
    priceCents: Number(row.price_cents || 0),
    durationMinutes: Number(row.duration_minutes || 0),
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function getServiceById(id) {
  const result = await query(`
    SELECT s.*, sc.name AS category_name, sc.pet_type_code AS category_pet_type_code, pt.name AS category_pet_type_name, sc.pet_size_code AS category_pet_size_code, cps.name AS category_pet_size_name, ps.name AS pet_size_name
    FROM services s
    LEFT JOIN service_categories sc ON sc.id = s.category_id
    LEFT JOIN pet_types pt ON pt.code = sc.pet_type_code
    LEFT JOIN pet_sizes cps ON cps.code = sc.pet_size_code
    LEFT JOIN pet_sizes ps ON ps.code = s.pet_size
    WHERE s.id = $1::uuid
      AND s.deleted_at IS NULL
    LIMIT 1
  `, [id]);
  return result.rows[0] || null;
}

app.get('/api/servicos/options', requireAuth, async (req, res, next) => {
  try {
    const serviceTypes = await query(`
      SELECT sc.*, pt.name AS pet_type_name, ps.name AS pet_size_name
      FROM service_categories sc
      LEFT JOIN pet_types pt ON pt.code = sc.pet_type_code
      LEFT JOIN pet_sizes ps ON ps.code = sc.pet_size_code
      WHERE sc.deleted_at IS NULL AND sc.is_active = TRUE
      ORDER BY sc.sort_order ASC, sc.name ASC
    `);
    const petSizes = await query(`
      SELECT * FROM pet_sizes
      WHERE is_active = TRUE
      ORDER BY sort_order ASC, name ASC
    `);
    res.json({
      serviceTypes: serviceTypes.rows.map(sanitizeServiceType),
      petSizes: petSizes.rows.map(sanitizePetSize)
    });
  } catch (error) { next(error); }
});

app.get('/api/servicos', requireAuth, async (req, res, next) => {
  try {
    const search = cleanText(req.query.search);
    const status = cleanText(req.query.status) || 'active';
    const categoryId = cleanText(req.query.categoryId);
    const petSize = cleanText(req.query.petSize);
    const limit = parseLimit(req.query.limit, 20, 100);
    const offset = parseOffset(req.query.page, limit);
    const params = [];
    const where = ['s.deleted_at IS NULL'];

    if (status !== 'all') {
      params.push(status === 'active');
      where.push(`s.is_active = $${params.length}::boolean`);
    }
    if (categoryId && categoryId !== 'all') {
      params.push(categoryId);
      where.push(`s.category_id = $${params.length}::uuid`);
    }
    if (petSize && petSize !== 'all') {
      params.push(petSize);
      where.push(`s.pet_size = $${params.length}::text`);
    }
    if (search) {
      params.push(`%${search.replace(/\s+/g, '%')}%`);
      where.push(`(unaccent(lower(s.name)) ILIKE unaccent(lower($${params.length})) OR unaccent(lower(COALESCE(s.description,''))) ILIKE unaccent(lower($${params.length})) OR unaccent(lower(COALESCE(sc.name,''))) ILIKE unaccent(lower($${params.length})))`);
    }

    params.push(limit);
    params.push(offset);
    const result = await query(`
      SELECT s.*, sc.name AS category_name, sc.pet_type_code AS category_pet_type_code, pt.name AS category_pet_type_name, sc.pet_size_code AS category_pet_size_code, cps.name AS category_pet_size_name, ps.name AS pet_size_name
      FROM services s
      LEFT JOIN service_categories sc ON sc.id = s.category_id
      LEFT JOIN pet_types pt ON pt.code = sc.pet_type_code
      LEFT JOIN pet_sizes cps ON cps.code = sc.pet_size_code
      LEFT JOIN pet_sizes ps ON ps.code = s.pet_size
      WHERE ${where.join(' AND ')}
      ORDER BY sc.sort_order ASC NULLS LAST, sc.name ASC NULLS LAST, ps.sort_order ASC NULLS LAST, s.name ASC, ps.sort_order ASC NULLS LAST, s.updated_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);
    const totalResult = await query(`
      SELECT COUNT(*)::int AS total
      FROM services s
      LEFT JOIN service_categories sc ON sc.id = s.category_id
      WHERE ${where.join(' AND ')}
    `, params.slice(0, -2));

    const summary = await query(`
      SELECT
        COUNT(*) FILTER (WHERE s.deleted_at IS NULL)::int AS total,
        COUNT(*) FILTER (WHERE s.deleted_at IS NULL AND s.is_active = TRUE)::int AS active,
        COUNT(DISTINCT s.category_id) FILTER (WHERE s.deleted_at IS NULL AND s.category_id IS NOT NULL)::int AS categories,
        COALESCE(ROUND(AVG(s.price_cents))::int, 0) AS average_price_cents
      FROM services s
    `);

    res.json({
      items: result.rows.map(sanitizeService),
      page: Number(req.query.page || 1),
      limit,
      total: Number(totalResult.rows[0]?.total || 0),
      summary: summary.rows[0] || {}
    });
  } catch (error) { next(error); }
});

app.get('/api/servicos/:id', requireAuth, async (req, res, next) => {
  try {
    const service = await getServiceById(req.params.id);
    if (!service) return res.status(404).json({ error: 'Serviço não encontrado.' });
    res.json({ service: sanitizeService(service) });
  } catch (error) { next(error); }
});

app.post('/api/servicos', requireAuth, async (req, res, next) => {
  try {
    const name = cleanText(req.body?.name);
    const categoryId = cleanText(req.body?.categoryId);
    const petSize = cleanText(req.body?.petSize) || 'todos';
    const priceCents = moneyToCents(req.body?.priceCents ?? req.body?.price);
    const durationMinutes = Math.max(1, Number.parseInt(req.body?.durationMinutes || '60', 10));
    if (!name) return res.status(400).json({ error: 'Informe o nome do serviço.' });
    if (!categoryId) return res.status(400).json({ error: 'Selecione o tipo de serviço cadastrado em Configurações.' });
    if (!petSize) return res.status(400).json({ error: 'Selecione o porte cadastrado em Configurações.' });

    const sizeExists = await query('SELECT 1 FROM pet_sizes WHERE code = $1::text AND is_active = TRUE LIMIT 1', [petSize]);
    if (!sizeExists.rowCount) return res.status(400).json({ error: 'Porte inválido. Cadastre ou ative o porte em Configurações.' });
    const categoryExists = await query('SELECT 1 FROM service_categories WHERE id = $1::uuid AND deleted_at IS NULL AND is_active = TRUE LIMIT 1', [categoryId]);
    if (!categoryExists.rowCount) return res.status(400).json({ error: 'Tipo de serviço inválido. Cadastre ou ative em Configurações.' });

    const result = await query(`
      INSERT INTO services (category_id, name, description, pet_size, price_cents, duration_minutes, is_active)
      VALUES ($1::uuid, $2::text, $3::text, $4::text, $5::integer, $6::integer, $7::boolean)
      ON CONFLICT (name, pet_size) DO UPDATE
      SET category_id = EXCLUDED.category_id,
          description = EXCLUDED.description,
          price_cents = EXCLUDED.price_cents,
          duration_minutes = EXCLUDED.duration_minutes,
          is_active = EXCLUDED.is_active,
          deleted_at = NULL,
          updated_at = NOW()
      RETURNING *
    `, [categoryId, name, cleanText(req.body?.description), petSize, priceCents, durationMinutes, parseBool(req.body?.isActive, true)]);
    const enriched = await getServiceById(result.rows[0].id);
    res.status(201).json({ service: sanitizeService(enriched), message: 'Serviço salvo com sucesso.' });
  } catch (error) { next(error); }
});

app.put('/api/servicos/:id', requireAuth, async (req, res, next) => {
  try {
    const current = await getServiceById(req.params.id);
    if (!current) return res.status(404).json({ error: 'Serviço não encontrado.' });

    const name = cleanText(req.body?.name);
    const categoryId = cleanText(req.body?.categoryId);
    const petSize = cleanText(req.body?.petSize) || 'todos';
    const priceCents = moneyToCents(req.body?.priceCents ?? req.body?.price);
    const durationMinutes = Math.max(1, Number.parseInt(req.body?.durationMinutes || '60', 10));
    if (!name) return res.status(400).json({ error: 'Informe o nome do serviço.' });
    if (!categoryId) return res.status(400).json({ error: 'Selecione o tipo de serviço cadastrado em Configurações.' });

    const sizeExists = await query('SELECT 1 FROM pet_sizes WHERE code = $1::text AND is_active = TRUE LIMIT 1', [petSize]);
    if (!sizeExists.rowCount) return res.status(400).json({ error: 'Porte inválido. Cadastre ou ative o porte em Configurações.' });
    const categoryExists = await query('SELECT 1 FROM service_categories WHERE id = $1::uuid AND deleted_at IS NULL AND is_active = TRUE LIMIT 1', [categoryId]);
    if (!categoryExists.rowCount) return res.status(400).json({ error: 'Tipo de serviço inválido. Cadastre ou ative em Configurações.' });

    const result = await query(`
      UPDATE services
      SET category_id = $2::uuid,
          name = $3::text,
          description = $4::text,
          pet_size = $5::text,
          price_cents = $6::integer,
          duration_minutes = $7::integer,
          is_active = $8::boolean,
          updated_at = NOW()
      WHERE id = $1::uuid
        AND deleted_at IS NULL
      RETURNING *
    `, [req.params.id, categoryId, name, cleanText(req.body?.description), petSize, priceCents, durationMinutes, parseBool(req.body?.isActive, true)]);
    const enriched = await getServiceById(result.rows[0].id);
    res.json({ service: sanitizeService(enriched), message: 'Serviço atualizado com sucesso.' });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Já existe serviço com este nome e porte.' });
    next(error);
  }
});

app.delete('/api/servicos/:id', requireAuth, async (req, res, next) => {
  try {
    const result = await query(`
      UPDATE services
      SET is_active = FALSE,
          deleted_at = NOW(),
          updated_at = NOW()
      WHERE id = $1::uuid
        AND deleted_at IS NULL
      RETURNING id
    `, [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Serviço não encontrado.' });
    res.json({ ok: true, message: 'Serviço inativado.' });
  } catch (error) { next(error); }
});


function saoPauloLocalToIso(dateValue, timeValue) {
  const date = String(dateValue || '').slice(0, 10);
  const time = String(timeValue || '').slice(0, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const parsed = new Date(`${date}T${time}:00-03:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function addDaysToDateString(dateValue, days = 0) {
  const date = String(dateValue || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return new Date().toISOString().slice(0, 10);
  const parsed = new Date(`${date}T12:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + Number(days || 0));
  return parsed.toISOString().slice(0, 10);
}


function normalizeDateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
  const text = String(value || '').trim();
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function getRecurrenceRule(rowOrRule) {
  const raw = rowOrRule?.recurrence_rule ?? rowOrRule ?? {};
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function resolvePackageIntervalDays({ totalSessions = 0, appointmentsPerMonth = 0, recurrenceRule = {} } = {}) {
  const rule = getRecurrenceRule(recurrenceRule);
  const explicitDays = Number(rule.intervalDays || 0);
  if (Number.isFinite(explicitDays) && explicitDays > 0) return explicitDays;
  const sessions = Number(totalSessions || 0);
  if (sessions >= 4) return 7;
  if (sessions === 2) return 15;
  const perMonth = Number(appointmentsPerMonth || 0);
  if (perMonth >= 4) return 7;
  if (perMonth === 2) return 15;
  return 30;
}

function toIsoOrNull(value) {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString();
  }
  if (typeof value === 'number') {
    const numericDate = new Date(value);
    if (Number.isNaN(numericDate.getTime())) return null;
    return numericDate.toISOString();
  }
  const text = String(value || '').trim();
  if (!text) return null;
  const hasExplicitTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text);
  const localMatch = text.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::\d{2}(?:\.\d{1,3})?)?$/);
  if (localMatch && !hasExplicitTimezone) return saoPauloLocalToIso(localMatch[1], localMatch[2]);
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function centsFromServices(items = [], discountPercent = 0) {
  const safeDiscountPercent = Math.max(0, Math.min(100, Number(discountPercent || 0)));
  const adjustedItems = (Array.isArray(items) ? items : []).map((item) => {
    const quantity = Number(item.quantity || 1);
    const unitPriceCents = Number(item.unitPriceCents || item.priceCents || 0);
    const grossCents = unitPriceCents * quantity;
    const discountCents = Math.round(grossCents * safeDiscountPercent / 100);
    const totalCents = Math.max(0, grossCents - discountCents);
    return {
      ...item,
      quantity,
      unitPriceCents,
      discountPercent: safeDiscountPercent,
      discountCents,
      totalCents
    };
  });
  const subtotal = adjustedItems.reduce((sum, item) => sum + Number(item.unitPriceCents || 0) * Number(item.quantity || 1), 0);
  const discount = adjustedItems.reduce((sum, item) => sum + Number(item.discountCents || 0), 0);
  return { items: adjustedItems, subtotalCents: subtotal, discountCents: discount, totalCents: Math.max(0, subtotal - discount) };
}

function isMercadoPagoConfigured() {
  return Boolean(env.mercadoPagoAccessToken);
}

function isMercadoPagoTestMode() {
  const token = String(env.mercadoPagoAccessToken || '').trim();
  return /^TEST-/i.test(token) || /TEST/i.test(token.slice(0, 32));
}

function getMercadoPagoPixExpirationMinutes() {
  return Math.max(5, Math.min(60, Number(env.mercadoPagoPixExpirationMinutes || 15) || 15));
}

function mercadoPagoPixExpirationDate(minutes = 15) {
  const expires = new Date(Date.now() + Math.max(5, Math.min(60, Number(minutes || 15))) * 60 * 1000);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(expires).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}.000-03:00`;
}

function normalizePixQrCode(value = '') {
  return String(value || '').trim().replace(/\s+/g, '');
}

function normalizePixQrBase64(value = '') {
  const text = String(value || '').trim();
  if (!text) return '';
  const commaIndex = text.indexOf(',');
  return text.startsWith('data:image/') && commaIndex >= 0 ? text.slice(commaIndex + 1).trim() : text;
}

function assertMercadoPagoPixPayload(payment = {}) {
  const tx = payment?.point_of_interaction?.transaction_data || {};
  const qrCode = normalizePixQrCode(tx.qr_code || '');
  const qrCodeBase64 = normalizePixQrBase64(tx.qr_code_base64 || '');
  if (!qrCode || !qrCodeBase64) {
    const error = new Error('O provedor de pagamento não retornou QR Code Pix válido. Verifique se a conta está habilitada para Pix e se as credenciais são de produção.');
    error.status = 502;
    error.details = {
      paymentId: payment?.id || null,
      status: payment?.status || null,
      statusDetail: payment?.status_detail || null,
      hasQrCode: Boolean(qrCode),
      hasQrCodeBase64: Boolean(qrCodeBase64)
    };
    throw error;
  }
  if (!qrCode.startsWith('000201')) {
    const error = new Error('O provedor de pagamento retornou um código que não parece ser Pix EMV válido. Não exibimos o QR Code para evitar leitura inválida pelo banco.');
    error.status = 502;
    error.details = {
      paymentId: payment?.id || null,
      status: payment?.status || null,
      statusDetail: payment?.status_detail || null,
      qrPrefix: qrCode.slice(0, 12)
    };
    throw error;
  }
  return { qrCode, qrCodeBase64, ticketUrl: String(tx.ticket_url || '').trim() };
}

function mercadoPagoHeaders(extra = {}) {
  return {
    Authorization: `Bearer ${env.mercadoPagoAccessToken}`,
    'Content-Type': 'application/json',
    ...extra
  };
}

async function mercadoPagoRequest(pathname, { method = 'GET', body = null, idempotencyKey = '' } = {}) {
  if (!isMercadoPagoConfigured()) {
    const error = new Error('Pagamento online não configurado. Configure as credenciais no servidor.');
    error.status = 503;
    throw error;
  }
  const headers = mercadoPagoHeaders(idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : {});
  const response = await fetch(`https://api.mercadopago.com${pathname}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.message || data?.error || `Provedor de pagamento retornou HTTP ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.details = data;
    throw error;
  }
  return data;
}

function sanitizePaymentIntent(row = {}) {
  const providerResponse = row.provider_response && typeof row.provider_response === 'object' ? row.provider_response : {};
  const tx = providerResponse?.point_of_interaction?.transaction_data || {};
  return {
    id: row.id,
    status: row.status,
    amountCents: Number(row.amount_cents || 0),
    description: row.description || '',
    provider: row.provider || 'mercado_pago',
    mpPaymentId: row.mp_payment_id || null,
    mpPreferenceId: row.mp_preference_id || null,
    paymentType: row.payment_type || 'pix',
    checkoutUrl: row.checkout_url || null,
    mpStatus: row.mp_status || null,
    qrCode: normalizePixQrCode(row.qr_code || tx.qr_code || ''),
    qrCodeBase64: normalizePixQrBase64(row.qr_code_base64 || tx.qr_code_base64 || ''),
    ticketUrl: String(row.ticket_url || tx.ticket_url || ''),
    expiresAt: row.expires_at,
    paidAt: row.paid_at,
    appointmentId: row.appointment_id || null,
    lastError: row.last_error || null,
    mercadoPagoTestMode: isMercadoPagoTestMode(),
    mercadoPagoPublicKey: env.mercadoPagoPublicKey || '',
    payerEmail: row.tutor_email || row.payer_email || ''
  };
}


function sanitizePackagePaymentIntent(row = {}) {
  const providerResponse = row.provider_response && typeof row.provider_response === 'object' ? row.provider_response : {};
  const tx = providerResponse?.point_of_interaction?.transaction_data || {};
  return {
    id: row.id,
    status: row.status,
    amountCents: Number(row.amount_cents || 0),
    description: row.description || '',
    provider: row.provider || 'mercado_pago',
    mpPaymentId: row.mp_payment_id || null,
    mpPreferenceId: row.mp_preference_id || null,
    paymentType: row.payment_type || 'pix',
    checkoutUrl: row.checkout_url || null,
    mpStatus: row.mp_status || null,
    qrCode: normalizePixQrCode(row.qr_code || tx.qr_code || ''),
    qrCodeBase64: normalizePixQrBase64(row.qr_code_base64 || tx.qr_code_base64 || ''),
    ticketUrl: String(row.ticket_url || tx.ticket_url || ''),
    expiresAt: row.expires_at,
    paidAt: row.paid_at,
    customerPackageId: row.customer_package_id || null,
    lastError: row.last_error || null,
    mercadoPagoTestMode: isMercadoPagoTestMode(),
    mercadoPagoPublicKey: env.mercadoPagoPublicKey || '',
    payerEmail: row.tutor_email || row.payer_email || '',
    kind: 'package'
  };
}

async function createMercadoPagoPixPayment({ intentId, amountCents, description, payerEmail, payerName }) {
  if (isMercadoPagoTestMode() && !env.mercadoPagoAllowTestPix) {
    const error = new Error('Credencial de teste do pagamento detectada. Para pagar com app de banco real, use credenciais de produção. Se quiser apenas testar sandbox, habilite o modo de teste.');
    error.status = 400;
    error.details = { tokenMode: 'test', productionRequiredForBankApp: true };
    throw error;
  }
  const appUrl = String(env.appUrl || '').replace(/\/$/, '');
  const body = {
    transaction_amount: Number((Number(amountCents || 0) / 100).toFixed(2)),
    description: description || 'Agendamento PetFunny',
    payment_method_id: 'pix',
    external_reference: String(intentId),
    metadata: { source: 'petfunny_app', intent_id: String(intentId) },
    date_of_expiration: mercadoPagoPixExpirationDate(getMercadoPagoPixExpirationMinutes()),
    payer: {
      email: payerEmail || `cliente+${String(intentId).slice(0, 8)}@petfunny.com.br`,
      first_name: payerName || 'Tutor PetFunny'
    }
  };
  if (appUrl && appUrl.startsWith('https://')) {
    body.notification_url = `${appUrl}/api/mercado-pago/webhook`;
  }
  const payment = await mercadoPagoRequest('/v1/payments', {
    method: 'POST',
    body,
    idempotencyKey: `petfunny-appointment-${intentId}`
  });
  const pixPayload = assertMercadoPagoPixPayload(payment);
  return {
    payment,
    paymentId: String(payment.id || ''),
    status: payment.status || 'pending',
    qrCode: pixPayload.qrCode,
    qrCodeBase64: pixPayload.qrCodeBase64,
    ticketUrl: pixPayload.ticketUrl
  };
}


function normalizeAppPaymentType(value = '') {
  const raw = String(value || '').toLowerCase().trim();
  if (['wallet', 'digital_wallet', 'gpay', 'google_pay', 'googlepay', 'carteira', 'carteira_digital'].includes(raw)) return 'wallet';
  if (['credit_card', 'debit_card', 'card', 'cartao', 'cartão', 'credito', 'crédito', 'debito', 'débito'].includes(raw)) return 'card';
  return 'pix';
}

function isCardLikeAppPaymentType(value = '') {
  return ['card', 'wallet'].includes(normalizeAppPaymentType(value));
}



const paymentIntentCompatibilityCache = new Map();
async function ensurePaymentIntentCompatibility(tableName) {
  const safeTables = new Set(['appointment_payment_intents', 'package_payment_intents']);
  if (!safeTables.has(tableName) || paymentIntentCompatibilityCache.get(tableName)) return;
  try {
    const exists = await hasTable(tableName).catch(() => false);
    if (!exists) return;
    await query(`ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS payment_type TEXT NOT NULL DEFAULT 'pix'`);
    await query(`ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS mp_preference_id TEXT`);
    await query(`ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS checkout_url TEXT`);
    paymentIntentCompatibilityCache.set(tableName, true);
  } catch (error) {
    console.warn(`[payments] compatibilidade ${tableName}: ${error.message}`);
  }
}
function paymentTypeLabel(paymentType = 'pix') {
  const normalized = normalizeAppPaymentType(paymentType);
  if (normalized === 'wallet') return 'Google Pay / carteira digital';
  return normalized === 'card' ? 'Cartão de crédito/débito' : 'Pix';
}

function getPublicAppUrl() {
  const raw = String(env.appUrl || '').trim().replace(/\/$/, '');
  if (raw && /^https?:\/\//i.test(raw)) return raw;
  return `http://localhost:${env.port || 3000}`;
}

function buildMercadoPagoReturnUrls({ intentId, kind = 'appointment', method = 'card' } = {}) {
  const appUrl = getPublicAppUrl();
  const backPath = `/app/pagamento-pix?intent=${encodeURIComponent(String(intentId || ''))}&kind=${encodeURIComponent(kind)}&method=${encodeURIComponent(method)}`;
  const url = `${appUrl}${backPath}`;
  return { success: url, pending: url, failure: url };
}

async function createMercadoPagoCheckoutPreference({ intentId, amountCents, description, payerEmail, payerName, kind = 'appointment' }) {
  const appUrl = getPublicAppUrl();
  const body = {
    items: [{
      title: description || 'Pagamento PetFunny',
      quantity: 1,
      currency_id: 'BRL',
      unit_price: Number((Number(amountCents || 0) / 100).toFixed(2))
    }],
    external_reference: String(intentId),
    metadata: { source: 'petfunny_app', intent_id: String(intentId), kind, payment_type: 'card' },
    payer: {
      email: payerEmail || `cliente+${String(intentId).slice(0, 8)}@petfunny.com.br`,
      name: payerName || 'Tutor PetFunny'
    },
    payment_methods: {
      excluded_payment_types: [{ id: 'ticket' }, { id: 'atm' }, { id: 'bank_transfer' }],
      installments: 6
    }
  };

  // Em produção o provedor de pagamento aceita retorno automático com URL pública HTTPS.
  // Em localhost/HTTP, algumas contas rejeitam a preferência com 400 Bad Request
  // mesmo com back_urls preenchidas. Para não quebrar o App do Tutor localmente,
  // usamos retorno automático somente quando APP_URL é pública/HTTPS e fazemos
  // retry seguro sem auto_return/back_urls se o provedor recusar a primeira criação.
  const returnUrls = buildMercadoPagoReturnUrls({ intentId, kind, method: 'card' });
  const canUseAutoReturn = returnUrls.success && /^https:\/\//i.test(returnUrls.success);
  if (canUseAutoReturn) {
    body.back_urls = returnUrls;
    body.auto_return = 'approved';
    body.notification_url = `${appUrl}/api/mercado-pago/webhook`;
  } else if (returnUrls.success && /^https?:\/\//i.test(returnUrls.success) && !/localhost|127\.0\.0\.1|\[::1\]/i.test(returnUrls.success)) {
    body.back_urls = returnUrls;
  }

  let preference;
  try {
    preference = await mercadoPagoRequest('/checkout/preferences', {
      method: 'POST',
      body,
      idempotencyKey: `petfunny-checkout-${kind}-${intentId}`
    });
  } catch (error) {
    const message = String(error?.message || '');
    const providerMessage = JSON.stringify(error?.details || {});
    const isReturnUrlError = Number(error?.status || 0) === 400 && /auto_return|back_url|back_urls|invalid/i.test(`${message} ${providerMessage}`);
    if (!isReturnUrlError) throw error;
    const fallbackBody = { ...body };
    delete fallbackBody.auto_return;
    delete fallbackBody.back_urls;
    delete fallbackBody.notification_url;
    preference = await mercadoPagoRequest('/checkout/preferences', {
      method: 'POST',
      body: fallbackBody,
      idempotencyKey: `petfunny-checkout-${kind}-${intentId}-no-return`
    });
  }
  return {
    preference,
    preferenceId: String(preference.id || ''),
    checkoutUrl: String(preference.init_point || preference.sandbox_init_point || '')
  };
}

async function findApprovedMercadoPagoPaymentByReference(reference) {
  if (!reference || !isMercadoPagoConfigured()) return null;
  const data = await mercadoPagoRequest(`/v1/payments/search?external_reference=${encodeURIComponent(String(reference))}&sort=date_created&criteria=desc`);
  const results = Array.isArray(data?.results) ? data.results : [];
  return results.find((payment) => payment.status === 'approved') || results[0] || null;
}

function sanitizeAppointment(row = {}) {
  const packageSessionNumber = row.package_session_number ? Number(row.package_session_number) : null;
  const packageTotalSessions = row.package_total_sessions ? Number(row.package_total_sessions) : null;
  const packageSessionLabel = row.package_session_label || (packageSessionNumber && packageTotalSessions ? `${packageSessionNumber} de ${packageTotalSessions}` : null);
  return {
    id: row.id,
    tutorId: row.tutor_id,
    tutorName: row.tutor_name,
    tutorWhatsapp: row.tutor_whatsapp,
    petId: row.pet_id,
    petName: row.pet_name,
    petPhotoUrl: row.pet_photo_url || null,
    petSize: row.pet_size,
    collaboratorId: row.collaborator_id,
    collaboratorName: row.collaborator_name,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    statusName: row.status_name,
    statusColor: row.status_color,
    source: row.source,
    subtotalCents: Number(row.subtotal_cents || 0),
    discountPercent: Number(row.discount_percent || 0),
    discountCents: Number(row.discount_cents || 0),
    totalCents: Number(row.total_cents || 0),
    customerPackageId: row.customer_package_id || null,
    packageSessionNumber,
    packageTotalSessions,
    packageSessionLabel,
    notes: row.notes,
    paymentStatus: row.payment_status || 'pending',
    paymentMethodId: row.payment_method_id || null,
    paymentMethodName: row.payment_method_name || null,
    checkedInAt: row.checked_in_at,
    checkedOutAt: row.checked_out_at,
    services: row.services || '',
    items: Array.isArray(row.items) ? row.items : []
  };
}


async function ensureServiceReviewTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS service_reviews (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      appointment_id UUID NOT NULL UNIQUE REFERENCES appointments(id) ON DELETE CASCADE,
      tutor_id UUID REFERENCES tutors(id) ON DELETE SET NULL,
      pet_id UUID REFERENCES pets(id) ON DELETE SET NULL,
      token TEXT NOT NULL UNIQUE,
      rating SMALLINT CHECK (rating BETWEEN 1 AND 5),
      status TEXT NOT NULL DEFAULT 'pending',
      comment TEXT,
      user_agent TEXT,
      ip_address TEXT,
      submitted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_service_reviews_status ON service_reviews(status, created_at DESC) WHERE deleted_at IS NULL`).catch(() => null);
  await query(`CREATE INDEX IF NOT EXISTS idx_service_reviews_rating ON service_reviews(rating, submitted_at DESC) WHERE deleted_at IS NULL`).catch(() => null);
  await query(`CREATE INDEX IF NOT EXISTS idx_service_reviews_appointment ON service_reviews(appointment_id) WHERE deleted_at IS NULL`).catch(() => null);
}

function serviceReviewRatingLabel(rating) {
  const n = Number(rating || 0);
  return ({ 1: 'Muito insatisfeito', 2: 'Insatisfeito', 3: 'Regular', 4: 'Satisfeito', 5: 'Muito satisfeito' })[n] || 'Aguardando nota';
}

function buildServiceReviewPublicUrl(token = '') {
  const base = String(env.appUrl || process.env.APP_URL || `http://localhost:${env.port || 3000}`).trim().replace(/\/$/, '');
  return `${base}/avaliacao/${encodeURIComponent(String(token || ''))}`;
}

function generateServiceReviewToken() {
  return crypto.randomBytes(18).toString('base64url');
}

async function ensureServiceReviewForAppointment(appointmentId) {
  await ensureServiceReviewTables();
  const current = await query(`SELECT * FROM service_reviews WHERE appointment_id=$1::uuid AND deleted_at IS NULL LIMIT 1`, [appointmentId]);
  if (current.rowCount) return current.rows[0];
  const appointment = await query(`SELECT id, tutor_id, pet_id FROM appointments WHERE id=$1::uuid AND deleted_at IS NULL LIMIT 1`, [appointmentId]);
  if (!appointment.rowCount) return null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const created = await query(`
        INSERT INTO service_reviews (appointment_id, tutor_id, pet_id, token)
        VALUES ($1::uuid, $2::uuid, $3::uuid, $4::text)
        ON CONFLICT (appointment_id) DO UPDATE SET updated_at=NOW()
        RETURNING *
      `, [appointment.rows[0].id, appointment.rows[0].tutor_id, appointment.rows[0].pet_id, generateServiceReviewToken()]);
      return created.rows[0] || null;
    } catch (error) {
      if (String(error.code || '') !== '23505' || attempt >= 2) throw error;
    }
  }
  return null;
}

async function ensureReviewsForFinalizedAppointments(limit = 500) {
  await ensureServiceReviewTables();
  await query(`
    INSERT INTO service_reviews (appointment_id, tutor_id, pet_id, token)
    SELECT a.id, a.tutor_id, a.pet_id, encode(gen_random_bytes(18), 'hex')
    FROM appointments a
    WHERE a.deleted_at IS NULL
      AND a.status = 'finalizado'
      AND NOT EXISTS (SELECT 1 FROM service_reviews sr WHERE sr.appointment_id = a.id AND sr.deleted_at IS NULL)
    ORDER BY COALESCE(a.checked_out_at, a.ends_at, a.starts_at, a.created_at) DESC
    LIMIT $1::integer
    ON CONFLICT DO NOTHING
  `, [Math.max(1, Math.min(Number(limit || 500), 2000))]);
}

function sanitizeServiceReview(row = {}) {
  const rating = row.rating === null || row.rating === undefined ? null : Number(row.rating || 0);
  const token = row.token || '';
  return {
    id: row.id,
    appointmentId: row.appointment_id,
    tutorId: row.tutor_id,
    tutorName: row.tutor_name || '',
    tutorWhatsapp: row.tutor_whatsapp || '',
    petId: row.pet_id,
    petName: row.pet_name || '',
    services: row.services || 'Atendimento PetFunny',
    startsAt: row.starts_at || null,
    appointmentStatus: row.appointment_status || 'finalizado',
    appointmentStatusName: row.appointment_status_name || (row.appointment_status === 'finalizado' ? 'Finalizado' : ''),
    rating,
    ratingLabel: serviceReviewRatingLabel(rating),
    status: row.status || (rating ? 'submitted' : 'pending'),
    comment: row.comment || '',
    reviewUrl: token ? buildServiceReviewPublicUrl(token) : '',
    submittedAt: row.submitted_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
}

async function getAppointmentById(id) {
  const result = await query(`
    SELECT a.*, t.name AS tutor_name, t.whatsapp AS tutor_whatsapp, p.name AS pet_name, p.photo_url AS pet_photo_url, p.size AS pet_size,
           c.name AS collaborator_name, s.name AS status_name, s.color AS status_color, pm.name AS payment_method_name,
           COALESCE(NULLIF(a.package_session_label, ''), CASE WHEN a.customer_package_id IS NOT NULL THEN CONCAT(COALESCE(a.package_session_number, pkg_seq.session_number), ' de ', COALESCE(a.package_total_sessions, pkg_seq.total_sessions, cp.total_sessions)) ELSE NULL END) AS package_session_label,
           COALESCE(a.package_session_number, pkg_seq.session_number) AS package_session_number,
           COALESCE(a.package_total_sessions, pkg_seq.total_sessions, cp.total_sessions) AS package_total_sessions,
           COALESCE(string_agg(ai.description, ', ' ORDER BY ai.created_at), '') AS services,
           COALESCE(json_agg(json_build_object('id', ai.id, 'serviceId', ai.service_id, 'petId', ai.pet_id, 'description', ai.description, 'quantity', ai.quantity, 'unitPriceCents', ai.unit_price_cents, 'discountPercent', ai.discount_percent, 'totalCents', ai.total_cents) ORDER BY ai.created_at) FILTER (WHERE ai.id IS NOT NULL), '[]'::json) AS items
    FROM appointments a
    LEFT JOIN tutors t ON t.id = a.tutor_id
    LEFT JOIN pets p ON p.id = a.pet_id
    LEFT JOIN collaborators c ON c.id = a.collaborator_id
    LEFT JOIN appointment_statuses s ON s.code = a.status
    LEFT JOIN payment_methods pm ON pm.id = a.payment_method_id
    LEFT JOIN customer_packages cp ON cp.id = a.customer_package_id
    LEFT JOIN LATERAL (
      SELECT ranked.session_number, ranked.total_sessions
      FROM (
        SELECT ax.id,
               ROW_NUMBER() OVER (ORDER BY ax.starts_at ASC, ax.created_at ASC, ax.id ASC)::int AS session_number,
               COUNT(*) OVER ()::int AS total_sessions
        FROM appointments ax
        WHERE ax.customer_package_id = a.customer_package_id
          AND ax.deleted_at IS NULL
      ) ranked
      WHERE ranked.id = a.id
      LIMIT 1
    ) pkg_seq ON TRUE
    LEFT JOIN appointment_items ai ON ai.appointment_id = a.id
    WHERE a.id = $1::uuid AND a.deleted_at IS NULL
    GROUP BY a.id, t.name, t.whatsapp, p.name, p.photo_url, p.size, c.name, s.name, s.color, pm.name, cp.total_sessions, pkg_seq.session_number, pkg_seq.total_sessions
    LIMIT 1
  `, [id]);
  return result.rows[0] || null;
}

async function finalizePaidAppointmentIntent(intentId, providerStatus = 'approved', providerResponse = {}) {
  await query('BEGIN');
  try {
    const intentResult = await query(`
      SELECT api.*, t.name AS tutor_name, t.email AS tutor_email
      FROM appointment_payment_intents api
      LEFT JOIN tutors t ON t.id = api.tutor_id
      WHERE api.id=$1::uuid AND api.deleted_at IS NULL
      FOR UPDATE OF api
    `, [intentId]);
    if (!intentResult.rowCount) {
      const error = new Error('Pagamento do agendamento não encontrado.');
      error.status = 404;
      throw error;
    }
    const intent = intentResult.rows[0];
    if (intent.status === 'paid' && intent.appointment_id) {
      await query('COMMIT');
      return { intent, appointment: await getAppointmentById(intent.appointment_id), alreadyPaid: true };
    }
    if (new Date(intent.expires_at).getTime() < Date.now()) {
      await query(`UPDATE appointment_payment_intents SET status='expired', mp_status=$2::text, provider_response=$3::jsonb, updated_at=NOW() WHERE id=$1::uuid`, [intent.id, providerStatus, JSON.stringify(providerResponse || {})]);
      const error = new Error('Este Pix expirou. Gere um novo agendamento para criar outro QR Code.');
      error.status = 410;
      throw error;
    }
    const payload = intent.pending_payload || {};
    const petId = payload.petId;
    const startsAt = payload.startsAt;
    const startsAtLocal = payload.startsAtLocal || '';
    const collaboratorParam = payload.collaboratorId || '';
    const notes = payload.notes || '';
    const serviceIds = Array.isArray(payload.serviceIds) ? payload.serviceIds : [];
    if (!petId || !startsAt || !serviceIds.length) throw new Error('Dados pendentes do agendamento estão incompletos.');
    await assertSlotAvailable(startsAtLocal || startsAt, 'agendado', null);
    const services = await query(`SELECT id, name, price_cents, duration_minutes FROM services WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL AND is_active = TRUE`, [serviceIds]);
    if (!services.rowCount) throw new Error('Serviços do agendamento não estão mais disponíveis.');
    const duration = services.rows.reduce((sum, row) => sum + Number(row.duration_minutes || 60), 0);
    const endsAt = new Date(new Date(startsAt).getTime() + duration * 60000).toISOString();
    const baseItems = services.rows.map((row) => ({ serviceId: row.id, description: row.name, quantity: 1, unitPriceCents: isTransportServiceName(row.name) ? 0 : Number(row.price_cents || 0) }));
    const petForPromotion = await query(`SELECT size FROM pets WHERE id=$1::uuid LIMIT 1`, [petId]).catch(() => ({ rows: [] }));
    const activePromotions = await getActivePromotionsForSchedule({ startsAtLocal: startsAtLocal || startsAt, petSize: petForPromotion.rows[0]?.size || 'todos', serviceIds });
    const totals = applyPromotionsToItems(baseItems, activePromotions);
    const transportQuote = payload.transport && Number(payload.transport.feeCents || 0) > 0 ? payload.transport : null;
    if (transportQuote) {
      totals.items.push({ serviceId: null, description: 'Transporte PetFunny · busca e entrega', quantity: 1, unitPriceCents: Number(transportQuote.feeCents || 0), discountPercent: 0, discountCents: 0, totalCents: Number(transportQuote.feeCents || 0), isTransport: true });
      totals.subtotalCents += Number(transportQuote.feeCents || 0);
      totals.totalCents += Number(transportQuote.feeCents || 0);
    }
    const isCardPayment = isCardLikeAppPaymentType(intent.payment_type || 'pix');
    const paymentMethod = await query(`SELECT id FROM payment_methods WHERE deleted_at IS NULL AND (lower(name) LIKE $1 OR lower(name) LIKE $2) ORDER BY sort_order ASC LIMIT 1`, isCardPayment ? ['%cart%', '%card%'] : ['%pix%', '%pix%']).catch(() => ({ rows: [] }));
    const created = await query(`
      INSERT INTO appointments (tutor_id, pet_id, collaborator_id, starts_at, ends_at, status, source, subtotal_cents, discount_percent, discount_cents, total_cents, notes, payment_status, payment_method_id)
      VALUES ($1::uuid, $2::uuid, NULLIF($3::text,'')::uuid, $4::timestamptz, $5::timestamptz, 'agendado', 'app_tutor', $6::integer, $7::numeric, $8::integer, $9::integer, $10::text, 'paid', NULLIF($11::text,'')::uuid)
      RETURNING id
    `, [intent.tutor_id, petId, collaboratorParam, startsAt, endsAt, totals.subtotalCents, totals.appliedPromotions?.[0]?.discountPercent || 0, totals.discountCents, totals.totalCents, notes, paymentMethod.rows[0]?.id || '']);
    for (const item of totals.items) {
      await query(`INSERT INTO appointment_items (appointment_id, pet_id, service_id, description, quantity, unit_price_cents, discount_percent, total_cents) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::text, 1, $5::integer, $6::numeric, $7::integer)`, [created.rows[0].id, petId, item.serviceId, item.description, item.unitPriceCents, item.discountPercent || 0, item.totalCents]);
    }
    if (payload.giftSpinId) {
      await query(`
        UPDATE gift_spins
        SET spin_context = spin_context || jsonb_build_object('appointmentId', $2::uuid, 'usedInAppointment', true, 'scheduledAt', NOW())
        WHERE id=$1::uuid AND tutor_id=$3::uuid
      `, [payload.giftSpinId, created.rows[0].id, intent.tutor_id]).catch(() => null);
    }
    await query(`
      INSERT INTO financial_transactions (tutor_id, appointment_id, type, category, description, amount_cents, due_date, status)
      VALUES ($1::uuid, $2::uuid, 'income', $6::text, $3::text, $4::integer, $5::date, 'paid')
      ON CONFLICT DO NOTHING
    `, [intent.tutor_id, created.rows[0].id, `Agendamento pago via ${isCardPayment ? 'cartão' : 'Pix'}`, totals.totalCents, String(startsAt).slice(0, 10), isCardPayment ? 'agendamento_app_cartao' : 'agendamento_app_pix']).catch(() => null);
    await createOrUpdateReceiptForAppointment(created.rows[0].id, null).catch((error) => console.warn('[app:pix] recibo não gerado:', error.message));
    await query(`
      UPDATE appointment_payment_intents
      SET status='paid', mp_status=$2::text, provider_response=$3::jsonb, paid_at=NOW(), appointment_id=$4::uuid, updated_at=NOW()
      WHERE id=$1::uuid
    `, [intent.id, providerStatus, JSON.stringify(providerResponse || {}), created.rows[0].id]);
    await query('COMMIT');
    const appointment = await getAppointmentById(created.rows[0].id);
    await syncAppCrmLead({
      whatsapp: appointment?.tutor_whatsapp || '',
      tutorId: intent.tutor_id,
      name: appointment?.tutor_name || intent.tutor_name || '',
      email: intent.tutor_email || '',
      stage: 'primeiro_agendamento',
      source: 'app_tutor',
      notes: `Primeiro agendamento pago pelo app: ${appointment?.pet_name || 'pet'} em ${appointment?.starts_at || startsAt}.`,
      interactionSubject: 'Primeiro agendamento',
      interactionMessage: 'O tutor concluiu o pagamento Pix e o primeiro agendamento foi criado pelo app.'
    });
    const pushTargets = await query(`SELECT * FROM push_subscriptions WHERE tutor_id=$1::uuid AND status='active' AND deleted_at IS NULL`, [intent.tutor_id]).catch(() => ({ rows: [] }));
    if (pushTargets.rowCount) {
      await sendPushToSubscriptions(pushTargets.rows, {
        title: 'Agendamento pago e criado ✅',
        body: `Seu Pix foi confirmado e o horário de ${appointment.pet_name || 'seu pet'} foi registrado.`,
        url: '/app/agenda',
        tag: `appointment-${created.rows[0].id}`,
        type: 'appointment-paid'
      });
    }
    return { intent: { ...intent, status: 'paid', appointment_id: created.rows[0].id }, appointment, alreadyPaid: false };
  } catch (error) {
    try { await query('ROLLBACK'); } catch {}
    throw error;
  }
}

function getLocalSlotParts(startsAtValue) {
  const text = String(startsAtValue || '').trim();
  if (!text) return null;
  const hasExplicitTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text);
  const match = text.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
  if (match && !hasExplicitTimezone) {
    const weekday = new Date(`${match[1]}T12:00:00`).getDay();
    return { date: match[1], time: match[2], weekday };
  }
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  const localTime = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
  const weekday = new Date(`${localDate}T12:00:00`).getDay();
  return { date: localDate, time: localTime, weekday };
}

function slotValidationError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function getSaoPauloNowParts() {
  const now = new Date();
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const time = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
  return { date, time };
}

function isPastLocalSlot(dateValue, timeValue = '00:00') {
  const date = String(dateValue || '').slice(0, 10);
  const time = String(timeValue || '').slice(0, 5);
  const now = getSaoPauloNowParts();
  return date < now.date || (date === now.date && time <= now.time);
}

async function assertSlotAvailable(startsAtValue, statusCode, excludeAppointmentId = null) {
  const statusResult = await query('SELECT blocks_slot FROM appointment_statuses WHERE code = $1::text AND deleted_at IS NULL LIMIT 1', [statusCode]);
  const blocksSlot = statusResult.rows[0]?.blocks_slot !== false;
  if (!blocksSlot) return;

  const parts = getLocalSlotParts(startsAtValue);
  if (!parts?.date || !parts?.time) throw slotValidationError('Data/hora inválida para o agendamento.');
  if (isPastLocalSlot(parts.date, parts.time)) throw slotValidationError('Este horário já passou. Escolha uma data e horário disponíveis.');

  const slotResult = await query(`
    SELECT bh.is_open,
           bh.opens_at,
           bh.closes_at,
           COALESCE(tsc.capacity, 0)::int AS capacity,
           $2::time AS slot_time
    FROM business_hours bh
    LEFT JOIN time_slot_capacities tsc ON tsc.weekday = bh.weekday AND tsc.slot_time = $2::time
    WHERE bh.weekday = $1::integer
    LIMIT 1
  `, [parts.weekday, parts.time]);
  const slot = slotResult.rows[0];
  if (!slot || !slot.is_open) throw slotValidationError('O dia selecionado está fechado nas Configurações.');
  const hhmm = String(slot.slot_time || parts.time).slice(0, 5);
  if (hhmm < String(slot.opens_at).slice(0, 5) || hhmm >= String(slot.closes_at).slice(0, 5)) {
    throw slotValidationError('Horário fora do funcionamento configurado. Escolha um horário disponível no app ou ajuste o horário de funcionamento em Configurações.');
  }
  if (Number(slot.capacity || 0) <= 0) throw slotValidationError('Este horário está sem vagas configuradas. Escolha outro horário ou ajuste as vagas em Configurações.');

  const countResult = await query(`
    SELECT COUNT(a.id)::int AS total
    FROM appointments a
    INNER JOIN appointment_statuses s ON s.code = a.status AND s.blocks_slot = TRUE
    WHERE a.deleted_at IS NULL
      AND TO_CHAR(a.starts_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') = $1::text
      AND TO_CHAR(date_trunc('hour', a.starts_at AT TIME ZONE 'America/Sao_Paulo'), 'HH24:MI') = $2::text
      AND ($3::uuid IS NULL OR a.id <> $3::uuid)
  `, [parts.date, parts.time, excludeAppointmentId]);
  if (Number(countResult.rows[0]?.total || 0) >= Number(slot.capacity || 0)) {
    throw slotValidationError('Limite de agendamentos atingido para este dia e horário. Escolha outro horário disponível.');
  }
}

async function getAvailableAppSlotsForDate(dateValue, excludeAppointmentId = null) {
  const date = cleanText(dateValue);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
  const now = getSaoPauloNowParts();
  if (date < now.date) return [];
  const weekday = new Date(`${date}T12:00:00`).getDay();
  const slotsResult = await query(`
    WITH configured_slots AS (
      SELECT
        bh.weekday,
        bh.is_open,
        bh.opens_at,
        bh.closes_at,
        tsc.slot_time,
        COALESCE(tsc.capacity, 0)::int AS capacity
      FROM business_hours bh
      INNER JOIN time_slot_capacities tsc ON tsc.weekday = bh.weekday
      WHERE bh.weekday = $1::integer
        AND bh.is_open = TRUE
        AND tsc.slot_time >= bh.opens_at
        AND tsc.slot_time < bh.closes_at
        AND COALESCE(tsc.capacity, 0) > 0
    ), occupied AS (
      SELECT
        TO_CHAR(date_trunc('hour', a.starts_at AT TIME ZONE 'America/Sao_Paulo'), 'HH24:MI') AS slot_time,
        COUNT(a.id)::int AS total
      FROM appointments a
      INNER JOIN appointment_statuses s ON s.code = a.status AND s.blocks_slot = TRUE
      WHERE a.deleted_at IS NULL
        AND TO_CHAR(a.starts_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') = $2::text
        AND ($3::uuid IS NULL OR a.id <> $3::uuid)
      GROUP BY 1
    )
    SELECT
      TO_CHAR(cs.slot_time, 'HH24:MI') AS time,
      cs.capacity,
      COALESCE(o.total, 0)::int AS occupied,
      GREATEST(cs.capacity - COALESCE(o.total, 0), 0)::int AS available
    FROM configured_slots cs
    LEFT JOIN occupied o ON o.slot_time = TO_CHAR(cs.slot_time, 'HH24:MI')
    WHERE cs.capacity > COALESCE(o.total, 0)
    ORDER BY cs.slot_time ASC
  `, [weekday, date, excludeAppointmentId]);
  return slotsResult.rows
    .filter((row) => date !== now.date || String(row.time || '').slice(0, 5) > now.time)
    .map((row) => ({
      time: row.time,
      label: `${row.time} · ${Number(row.available || 0)} vaga${Number(row.available || 0) === 1 ? '' : 's'}`,
      capacity: Number(row.capacity || 0),
      occupied: Number(row.occupied || 0),
      available: Number(row.available || 0)
    }));
}

app.get('/api/app/availability', requireClientAuth, async (req, res, next) => {
  try {
    const date = cleanText(req.query?.date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Informe uma data válida para consultar horários.' });
    const slots = await getAvailableAppSlotsForDate(date);
    res.json({ date, slots, message: slots.length ? 'Horários disponíveis carregados.' : 'Nenhum horário disponível para esta data.' });
  } catch (error) {
    next(error);
  }
});


app.get('/api/agenda/availability', requireAuth, async (req, res, next) => {
  try {
    const date = cleanText(req.query?.date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Informe uma data válida para consultar horários.' });
    const slots = await getAvailableAppSlotsForDate(date, cleanText(req.query?.excludeAppointmentId) || null);
    res.json({ date, slots, message: slots.length ? 'Horários disponíveis carregados.' : 'Nenhum horário disponível para esta data.' });
  } catch (error) {
    next(error);
  }
});

app.get('/api/agenda/options', requireAuth, async (req, res, next) => {
  try {
    const [statuses, collaborators, operational, paymentStatuses, paymentMethods, petOptions] = await Promise.all([
      query('SELECT * FROM appointment_statuses WHERE deleted_at IS NULL AND is_active = TRUE ORDER BY sort_order ASC, name ASC'),
      query('SELECT id, name, role, color FROM collaborators WHERE deleted_at IS NULL AND is_active = TRUE ORDER BY name ASC'),
      getOperationalSettingsPayload(),
      query('SELECT * FROM payment_statuses WHERE deleted_at IS NULL AND is_active = TRUE ORDER BY sort_order ASC, name ASC'),
      query('SELECT * FROM payment_methods WHERE deleted_at IS NULL AND is_active = TRUE ORDER BY sort_order ASC, name ASC'),
      getPetOptionsPayload({ activeOnly: true })
    ]);
    res.json({
      statuses: statuses.rows.map(sanitizeAppointmentStatus),
      collaborators: collaborators.rows.map((row) => ({ id: row.id, name: row.name, role: row.role, color: row.color })),
      businessHours: operational.businessHours,
      timeSlotCapacities: operational.timeSlotCapacities,
      slotPolicy: operational.slotPolicy,
      paymentStatuses: paymentStatuses.rows.map(sanitizePaymentStatus),
      paymentMethods: paymentMethods.rows.map(sanitizePaymentMethod),
      petTypes: petOptions.types,
      petSizes: petOptions.sizes,
      serviceTypes: operational.serviceTypes.filter(st => st.isActive)
    });
  } catch (error) { next(error); }
});

app.get('/api/agenda', requireAuth, async (req, res, next) => {
  try {
    const view = cleanText(req.query.view) || 'day';
    const baseDate = cleanText(req.query.date) || new Date().toISOString().slice(0, 10);
    const status = cleanText(req.query.status) || 'all';
    const collaboratorId = cleanText(req.query.collaboratorId) || 'all';
    let startExpr = '$1::date';
    let endExpr = '$1::date + INTERVAL \'1 day\'';
    if (view === 'week') endExpr = '$1::date + INTERVAL \'7 days\'';
    if (view === 'month') {
      startExpr = 'date_trunc(\'month\', $1::date)';
      endExpr = 'date_trunc(\'month\', $1::date) + INTERVAL \'1 month\'';
    }
    const params = [baseDate];
    const where = [`a.starts_at >= ${startExpr}`, `a.starts_at < ${endExpr}`, 'a.deleted_at IS NULL'];
    if (status !== 'all') { params.push(status); where.push(`a.status = $${params.length}::text`); }
    if (collaboratorId !== 'all') { params.push(collaboratorId); where.push(`a.collaborator_id = $${params.length}::uuid`); }
    const result = await query(`
      SELECT a.*, t.name AS tutor_name, t.whatsapp AS tutor_whatsapp, p.name AS pet_name, p.photo_url AS pet_photo_url, p.size AS pet_size,
             c.name AS collaborator_name, s.name AS status_name, s.color AS status_color, pm.name AS payment_method_name,
             COALESCE(NULLIF(a.package_session_label, ''), CASE WHEN a.customer_package_id IS NOT NULL THEN CONCAT(COALESCE(a.package_session_number, pkg_seq.session_number), ' de ', COALESCE(a.package_total_sessions, pkg_seq.total_sessions, cp.total_sessions)) ELSE NULL END) AS package_session_label,
             COALESCE(a.package_session_number, pkg_seq.session_number) AS package_session_number,
             COALESCE(a.package_total_sessions, pkg_seq.total_sessions, cp.total_sessions) AS package_total_sessions,
             COALESCE(string_agg(ai.description, ', ' ORDER BY ai.created_at), '') AS services
      FROM appointments a
      LEFT JOIN tutors t ON t.id = a.tutor_id
      LEFT JOIN pets p ON p.id = a.pet_id
      LEFT JOIN collaborators c ON c.id = a.collaborator_id
      LEFT JOIN appointment_statuses s ON s.code = a.status
      LEFT JOIN payment_methods pm ON pm.id = a.payment_method_id
      LEFT JOIN customer_packages cp ON cp.id = a.customer_package_id
      LEFT JOIN LATERAL (
        SELECT ranked.session_number, ranked.total_sessions
        FROM (
          SELECT ax.id,
                 ROW_NUMBER() OVER (ORDER BY ax.starts_at ASC, ax.created_at ASC, ax.id ASC)::int AS session_number,
                 COUNT(*) OVER ()::int AS total_sessions
          FROM appointments ax
          WHERE ax.customer_package_id = a.customer_package_id
            AND ax.deleted_at IS NULL
        ) ranked
        WHERE ranked.id = a.id
        LIMIT 1
      ) pkg_seq ON TRUE
      LEFT JOIN appointment_items ai ON ai.appointment_id = a.id
      WHERE ${where.join(' AND ')}
      GROUP BY a.id, t.name, t.whatsapp, p.name, p.photo_url, p.size, c.name, s.name, s.color, pm.name, cp.total_sessions, pkg_seq.session_number, pkg_seq.total_sessions
      ORDER BY a.starts_at ASC
    `, params);
    res.json({ items: result.rows.map(sanitizeAppointment), view, date: baseDate, total: result.rowCount });
  } catch (error) { next(error); }
});


app.get('/api/agenda/client-lookup', requireAuth, async (req, res, next) => {
  try {
    const whatsapp = normalizeWhatsapp(req.query.whatsapp);
    if (!whatsapp) return res.status(400).json({ error: 'Informe o WhatsApp para buscar o cliente.' });
    const tutorResult = await query(`
      SELECT t.*,
             COUNT(DISTINCT p.id) FILTER (WHERE p.deleted_at IS NULL)::int AS pets_count,
             COALESCE(MAX(a.starts_at), NULL) AS last_appointment_at
      FROM tutors t
      LEFT JOIN pets p ON p.tutor_id = t.id AND p.deleted_at IS NULL
      LEFT JOIN appointments a ON a.tutor_id = t.id AND a.deleted_at IS NULL
      WHERE t.whatsapp = $1::text
        AND t.deleted_at IS NULL
      GROUP BY t.id
      LIMIT 1
    `, [whatsapp]);
    const tutor = tutorResult.rows[0] || null;
    if (!tutor) return res.json({ found: false, whatsapp, tutor: null, pets: [] });
    const pets = await query(`
      SELECT p.*, t.name AS tutor_name, t.whatsapp AS tutor_whatsapp
      FROM pets p
      INNER JOIN tutors t ON t.id = p.tutor_id
      WHERE p.tutor_id = $1::uuid
        AND p.deleted_at IS NULL
        AND p.status = 'active'
      ORDER BY p.name ASC
    `, [tutor.id]);
    res.json({ found: true, whatsapp, tutor: sanitizeTutor(tutor), pets: pets.rows.map(sanitizePet) });
  } catch (error) { next(error); }
});

app.get('/api/agenda/:id', requireAuth, async (req, res, next) => {
  try {
    const appointment = await getAppointmentById(req.params.id);
    if (!appointment) return res.status(404).json({ error: 'Agendamento não encontrado.' });
    res.json({ appointment: sanitizeAppointment(appointment) });
  } catch (error) { next(error); }
});


app.post('/api/agenda/historical', requireAuth, async (req, res, next) => {
  try {
    const tutorId = cleanText(req.body?.tutorId);
    const petId = cleanText(req.body?.petId);
    const date = cleanText(req.body?.date);
    const time = cleanText(req.body?.time) || '09:00';
    const description = cleanText(req.body?.description) || 'Atendimento antigo importado';
    const serviceIds = Array.isArray(req.body?.serviceIds) ? req.body.serviceIds.map(cleanText).filter(Boolean) : [];
    const amountCents = Math.max(0, Number.parseInt(req.body?.amountCents || '0', 10));
    const paymentStatus = cleanText(req.body?.paymentStatus) || 'paid';
    const paymentMethodId = cleanText(req.body?.paymentMethodId);
    const notes = cleanText(req.body?.notes);
    if (!tutorId) return res.status(400).json({ error: 'Selecione o tutor.' });
    if (!petId) return res.status(400).json({ error: 'Selecione o pet.' });
    if (!date) return res.status(400).json({ error: 'Informe a data original do atendimento.' });
    if (amountCents <= 0) return res.status(400).json({ error: 'Informe o valor final do atendimento antigo.' });
    if (paymentMethodId) {
      const methodExists = await query('SELECT id FROM payment_methods WHERE id=$1::uuid AND deleted_at IS NULL LIMIT 1', [paymentMethodId]);
      if (!methodExists.rowCount) return res.status(400).json({ error: 'Forma de pagamento inválida.' });
    }
    let selectedServices = [];
    if (serviceIds.length) {
      const serviceResult = await query(`
        SELECT id, name
        FROM services
        WHERE deleted_at IS NULL AND id = ANY($1::uuid[])
        ORDER BY name
      `, [serviceIds]);
      selectedServices = serviceResult.rows;
    }
    const startsAt = toIsoOrNull(`${date}T${time}:00`);
    if (!startsAt) return res.status(400).json({ error: 'Data e horário inválidos.' });
    const endsAt = new Date(new Date(startsAt).getTime() + 60 * 60000).toISOString();
    await query('BEGIN');
    const created = await query(`
      INSERT INTO appointments (tutor_id, pet_id, collaborator_id, starts_at, ends_at, status, source, subtotal_cents, discount_percent, discount_cents, total_cents, notes, payment_status, payment_method_id, checked_in_at, checked_out_at, created_at, updated_at)
      VALUES ($1::uuid, $2::uuid, NULL, $3::timestamptz, $4::timestamptz, 'finalizado', 'historical_import', $5::integer, 0, 0, $5::integer, $6::text, $7::text, NULLIF($8::text,'')::uuid, $3::timestamptz, $4::timestamptz, $3::timestamptz, NOW())
      RETURNING id
    `, [tutorId, petId, startsAt, endsAt, amountCents, [description, notes].filter(Boolean).join(' · '), paymentStatus, paymentMethodId || '']);
    if (selectedServices.length) {
      for (const service of selectedServices) {
        await query(`
          INSERT INTO appointment_items (appointment_id, pet_id, service_id, description, quantity, unit_price_cents, discount_percent, total_cents, created_at, updated_at)
          VALUES ($1::uuid, $2::uuid, $3::uuid, $4::text, 1, 0, 0, 0, $5::timestamptz, NOW())
        `, [created.rows[0].id, petId, service.id, service.name, startsAt]);
      }
    } else {
      await query(`
        INSERT INTO appointment_items (appointment_id, pet_id, service_id, description, quantity, unit_price_cents, discount_percent, total_cents, created_at, updated_at)
        VALUES ($1::uuid, $2::uuid, NULL, $3::text, 1, 0, 0, 0, $4::timestamptz, NOW())
      `, [created.rows[0].id, petId, description, startsAt]);
    }
    await query(`
      INSERT INTO financial_transactions (tutor_id, appointment_id, type, category, description, amount_cents, due_date, status, paid_at, created_at, updated_at)
      VALUES ($1::uuid, $2::uuid, 'income', 'agendamento_antigo', $3::text, $4::integer, $5::date, $6::text, CASE WHEN $6::text='paid' THEN $7::timestamptz ELSE NULL END, $7::timestamptz, NOW())
      ON CONFLICT DO NOTHING
    `, [tutorId, created.rows[0].id, `Agendamento antigo · ${description}`, amountCents, date, paymentStatus === 'paid' ? 'paid' : 'pending', startsAt]);
    if (paymentStatus === 'paid') {
      const tx = await query(`SELECT id, amount_cents FROM financial_transactions WHERE appointment_id=$1::uuid AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`, [created.rows[0].id]);
      if (tx.rows[0]) {
        await query(`INSERT INTO payments (financial_transaction_id, payment_method_id, amount_cents, paid_at, notes) VALUES ($1::uuid, NULLIF($2::text,'')::uuid, $3::integer, $4::timestamptz, 'Pagamento histórico importado') ON CONFLICT DO NOTHING`, [tx.rows[0].id, paymentMethodId || '', Number(tx.rows[0].amount_cents || amountCents), startsAt]);
      }
    }
    await createOrUpdateReceiptForAppointment(created.rows[0].id, null).catch(() => null);
    await query('COMMIT');
    const appointment = await getAppointmentById(created.rows[0].id);
    res.status(201).json({ appointment: sanitizeAppointment(appointment), message: 'Agendamento antigo importado com sucesso.' });
  } catch (error) { try { await query('ROLLBACK'); } catch {} next(error); }
});

app.post('/api/agenda', requireAuth, async (req, res, next) => {
  try {
    const tutorId = cleanText(req.body?.tutorId);
    const petId = cleanText(req.body?.petId);
    const collaboratorId = cleanText(req.body?.collaboratorId);
    const startsAt = toIsoOrNull(req.body?.startsAt);
    const status = cleanText(req.body?.status) || 'agendado';
    const discountPercent = Number(req.body?.discountPercent || 0);
    const paymentStatus = cleanText(req.body?.paymentStatus) || 'pending';
    const paymentMethodId = cleanText(req.body?.paymentMethodId);
    const serviceIds = Array.isArray(req.body?.serviceIds) ? req.body.serviceIds.filter(Boolean) : [];
    if (!tutorId) return res.status(400).json({ error: 'Selecione o tutor.' });
    if (!petId) return res.status(400).json({ error: 'Selecione o pet.' });
    if (!startsAt) return res.status(400).json({ error: 'Informe data e horário válidos.' });
    if (!serviceIds.length) return res.status(400).json({ error: 'Selecione ao menos um serviço.' });
    await assertSlotAvailable(req.body?.startsAt || startsAt, status, null);

    const services = await query(`SELECT id, name, price_cents, duration_minutes FROM services WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL AND is_active = TRUE`, [serviceIds]);
    if (!services.rowCount) return res.status(400).json({ error: 'Nenhum serviço ativo encontrado para o agendamento.' });
    const duration = services.rows.reduce((sum, row) => sum + Number(row.duration_minutes || 60), 0);
    const endsAt = new Date(new Date(startsAt).getTime() + duration * 60000).toISOString();
    const items = services.rows.map((row) => ({ serviceId: row.id, description: row.name, quantity: 1, unitPriceCents: isTransportServiceName(row.name) ? 0 : Number(row.price_cents || 0) }));
    const totals = centsFromServices(items, discountPercent);
    const transportPayload = req.body?.transport && typeof req.body.transport === 'object' ? req.body.transport : null;
    const transportFeeCents = transportPayload ? Number(transportPayload.feeCents || 0) : 0;
    let appointmentNotes = cleanText(req.body?.notes);
    if (transportFeeCents > 0) {
      totals.items.push({ serviceId: null, description: 'Transporte PetFunny · Táxi Pet busca e entrega', quantity: 1, unitPriceCents: transportFeeCents, discountPercent: 0, discountCents: 0, totalCents: transportFeeCents, isTransport: true });
      totals.subtotalCents += transportFeeCents;
      totals.totalCents += transportFeeCents;
      const transportLine = `🚗 Táxi PetFunny: ${brlFromCentsText(transportFeeCents)} · ${cleanText(transportPayload.summary || 'Busca e entrega calculadas automaticamente')} · ${cleanText(transportPayload.address || '')}`;
      appointmentNotes = appointmentNotes ? `${transportLine}

${appointmentNotes}` : transportLine;
    }

    const created = await query(`
      INSERT INTO appointments (tutor_id, pet_id, collaborator_id, starts_at, ends_at, status, source, subtotal_cents, discount_percent, discount_cents, total_cents, notes, payment_status, payment_method_id)
      VALUES ($1::uuid, $2::uuid, NULLIF($3::text,'')::uuid, $4::timestamptz, $5::timestamptz, $6::text, 'manual', $7::integer, $8::numeric, $9::integer, $10::integer, $11::text, $12::text, NULLIF($13::text,'')::uuid)
      RETURNING id
    `, [tutorId, petId, collaboratorId || '', startsAt, endsAt, status, totals.subtotalCents, discountPercent, totals.discountCents, totals.totalCents, appointmentNotes, paymentStatus, paymentMethodId || '']);

    for (const item of totals.items) {
      await query(`
        INSERT INTO appointment_items (appointment_id, pet_id, service_id, description, quantity, unit_price_cents, discount_percent, total_cents)
        VALUES ($1::uuid, $2::uuid, NULLIF($3::text,'')::uuid, $4::text, $5::integer, $6::integer, $7::numeric, $8::integer)
      `, [created.rows[0].id, petId, item.serviceId || '', item.description, item.quantity, item.unitPriceCents, item.discountPercent || 0, item.totalCents]);
    }
    if (paymentStatus === 'paid') await syncFinancialTransactionWithAppointmentPayment(created.rows[0].id, paymentStatus, paymentMethodId || '');
    const appointment = await getAppointmentById(created.rows[0].id);
    res.status(201).json({ appointment: sanitizeAppointment(appointment), message: 'Agendamento criado com sucesso.' });
  } catch (error) { next(error); }
});

app.put('/api/agenda/:id', requireAuth, async (req, res, next) => {
  try {
    const current = await getAppointmentById(req.params.id);
    if (!current) return res.status(404).json({ error: 'Agendamento não encontrado.' });
    if (current.customer_package_id) {
      const startsAt = toIsoOrNull(req.body?.startsAt);
      if (!startsAt) return res.status(400).json({ error: 'Informe data e horário válidos.' });
      await assertSlotAvailable(req.body?.startsAt || startsAt, current.status, req.params.id);
      const previousStart = new Date(current.starts_at);
      const previousEnd = current.ends_at ? new Date(current.ends_at) : new Date(previousStart.getTime() + 60 * 60000);
      const durationMs = Math.max(15 * 60000, previousEnd.getTime() - previousStart.getTime());
      const endsAt = new Date(new Date(startsAt).getTime() + durationMs).toISOString();
      await query(`
        UPDATE appointments
        SET starts_at=$2::timestamptz,
            ends_at=$3::timestamptz,
            notes=$4::text,
            updated_at=NOW()
        WHERE id=$1::uuid AND deleted_at IS NULL
      `, [req.params.id, startsAt, endsAt, cleanText(req.body?.notes)]);
      const appointment = await getAppointmentById(req.params.id);
      return res.json({ appointment: sanitizeAppointment(appointment), message: 'Sessão de pacote reagendada com sucesso.' });
    }
    const tutorId = cleanText(req.body?.tutorId);
    const petId = cleanText(req.body?.petId);
    const collaboratorId = cleanText(req.body?.collaboratorId);
    const startsAt = toIsoOrNull(req.body?.startsAt);
    const status = cleanText(req.body?.status) || current.status;
    const discountPercent = Number(req.body?.discountPercent || 0);
    const paymentStatus = cleanText(req.body?.paymentStatus) || current.payment_status || 'pending';
    const paymentMethodId = cleanText(req.body?.paymentMethodId);
    const serviceIds = Array.isArray(req.body?.serviceIds) ? req.body.serviceIds.filter(Boolean) : [];
    if (!tutorId || !petId || !startsAt || !serviceIds.length) return res.status(400).json({ error: 'Preencha tutor, pet, data/hora e serviços.' });
    await assertSlotAvailable(req.body?.startsAt || startsAt, status, req.params.id);

    const services = await query(`SELECT id, name, price_cents, duration_minutes FROM services WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL AND is_active = TRUE`, [serviceIds]);
    const duration = services.rows.reduce((sum, row) => sum + Number(row.duration_minutes || 60), 0);
    const endsAt = new Date(new Date(startsAt).getTime() + duration * 60000).toISOString();
    const items = services.rows.map((row) => ({ serviceId: row.id, description: row.name, quantity: 1, unitPriceCents: isTransportServiceName(row.name) ? 0 : Number(row.price_cents || 0) }));
    const totals = centsFromServices(items, discountPercent);
    const transportPayload = req.body?.transport && typeof req.body.transport === 'object' ? req.body.transport : null;
    const transportFeeCents = transportPayload ? Number(transportPayload.feeCents || 0) : 0;
    let appointmentNotes = cleanText(req.body?.notes);
    if (transportFeeCents > 0) {
      totals.items.push({ serviceId: null, description: 'Transporte PetFunny · Táxi Pet busca e entrega', quantity: 1, unitPriceCents: transportFeeCents, discountPercent: 0, discountCents: 0, totalCents: transportFeeCents, isTransport: true });
      totals.subtotalCents += transportFeeCents;
      totals.totalCents += transportFeeCents;
      const transportLine = `🚗 Táxi PetFunny: ${brlFromCentsText(transportFeeCents)} · ${cleanText(transportPayload.summary || 'Busca e entrega calculadas automaticamente')} · ${cleanText(transportPayload.address || '')}`;
      appointmentNotes = appointmentNotes ? `${transportLine}

${appointmentNotes}` : transportLine;
    }

    await query(`
      UPDATE appointments
      SET tutor_id=$2::uuid, pet_id=$3::uuid, collaborator_id=NULLIF($4::text,'')::uuid, starts_at=$5::timestamptz, ends_at=$6::timestamptz, status=$7::text,
          subtotal_cents=$8::integer, discount_percent=$9::numeric, discount_cents=$10::integer, total_cents=$11::integer, notes=$12::text,
          payment_status=$13::text, payment_method_id=NULLIF($14::text,'')::uuid, updated_at=NOW()
      WHERE id=$1::uuid AND deleted_at IS NULL
    `, [req.params.id, tutorId, petId, collaboratorId || '', startsAt, endsAt, status, totals.subtotalCents, discountPercent, totals.discountCents, totals.totalCents, appointmentNotes, paymentStatus, paymentMethodId || '']);
    await query('DELETE FROM appointment_items WHERE appointment_id = $1::uuid', [req.params.id]);
    for (const item of totals.items) {
      await query(`INSERT INTO appointment_items (appointment_id, pet_id, service_id, description, quantity, unit_price_cents, discount_percent, total_cents) VALUES ($1::uuid,$2::uuid,NULLIF($3::text,'')::uuid,$4::text,$5::integer,$6::integer,$7::numeric,$8::integer)`, [req.params.id, petId, item.serviceId || '', item.description, item.quantity, item.unitPriceCents, item.discountPercent || 0, item.totalCents]);
    }
    await syncFinancialTransactionWithAppointmentPayment(req.params.id, paymentStatus, paymentMethodId || '');
    const appointment = await getAppointmentById(req.params.id);
    res.json({ appointment: sanitizeAppointment(appointment), message: 'Agendamento atualizado com sucesso.' });
  } catch (error) { next(error); }
});


function firstNameFrom(name = '') {
  return String(name || '').trim().split(/\s+/)[0] || 'tudo bem';
}

function makeAppointmentStatusAiMessage(appointment = {}, status = {}, options = {}) {
  const tutor = firstNameFrom(appointment.tutorName || appointment.tutor_name || '');
  const pet = appointment.petName || appointment.pet_name || 'seu pet';
  const when = appointment.startsAt || appointment.starts_at ? formatDateTimePt(appointment.startsAt || appointment.starts_at) : '';
  const service = appointment.services || 'banho e tosa';
  const statusCode = String(status.code || appointment.status || '').toLowerCase();
  const statusName = status.name || appointment.statusName || appointment.status || 'atualizado';
  const businessName = 'PetFunny - Banho e Tosa';
  const payment = appointment.paymentStatusName || (appointment.paymentStatus === 'paid' ? 'Pago' : appointment.paymentStatus === 'pending' ? 'Pendente' : '');
  const reviewUrl = String(options.reviewUrl || appointment.reviewUrl || '').trim();
  const reviewInvite = reviewUrl ? `\n\nSua opinião ajuda muito o PetFunny a melhorar cada atendimento. Avalie o serviço em 10 segundos por aqui: ${reviewUrl}` : '';

  const variants = {
    agendado: `Oi, ${tutor}! Tudo bem? O horário do ${pet} ficou agendado aqui no ${businessName}${when ? ` para ${when}` : ''}. O serviço previsto é ${service}. Se precisar ajustar alguma coisa, é só me chamar por aqui.`,
    confirmado: `Oi, ${tutor}! Tudo bem? Passando para confirmar que o horário do ${pet} está tudo certo aqui no ${businessName}${when ? ` para ${when}` : ''}. Estamos esperando vocês com carinho.`,
    em_atendimento: `Oi, ${tutor}! Tudo bem? O ${pet} já está em atendimento aqui no ${businessName}. Assim que finalizar, avisamos por aqui.`,
    finalizado: `Oi, ${tutor}! Tudo bem? O atendimento do ${pet} foi finalizado aqui no ${businessName}. Obrigado pela confiança. Se quiser, posso te enviar a comanda ou o recibo por aqui.${reviewInvite}`,
    cancelado: `Oi, ${tutor}! Tudo bem? O horário do ${pet} no ${businessName}${when ? ` de ${when}` : ''} foi cancelado. Quando quiser reagendar, me chama por aqui que vejo as melhores opções disponíveis.`,
    nao_compareceu: `Oi, ${tutor}! Tudo bem? Notamos que o ${pet} não conseguiu comparecer ao horário combinado no ${businessName}${when ? ` em ${when}` : ''}. Quer que eu veja uma nova opção de agenda para vocês?`
  };

  if (variants[statusCode]) return variants[statusCode];
  return `Oi, ${tutor}! Tudo bem? O atendimento do ${pet} aqui no ${businessName} foi atualizado para "${statusName}"${when ? ` (${when})` : ''}. ${payment ? `Status de pagamento: ${payment}. ` : ''}Qualquer dúvida, é só me chamar por aqui.`;
}


app.get('/api/public/service-reviews/:token', async (req, res, next) => {
  try {
    await ensureServiceReviewTables();
    const token = cleanText(req.params.token);
    if (!token) return res.status(404).json({ error: 'Avaliação não encontrada.' });
    const result = await query(`
      SELECT sr.*, a.starts_at, t.name AS tutor_name, p.name AS pet_name,
             COALESCE(string_agg(ai.description, ', ' ORDER BY ai.created_at), '') AS services
      FROM service_reviews sr
      LEFT JOIN appointments a ON a.id = sr.appointment_id
      LEFT JOIN tutors t ON t.id = sr.tutor_id
      LEFT JOIN pets p ON p.id = sr.pet_id
      LEFT JOIN appointment_items ai ON ai.appointment_id = sr.appointment_id
      WHERE sr.token=$1::text AND sr.deleted_at IS NULL
      GROUP BY sr.id, a.starts_at, t.name, p.name
      LIMIT 1
    `, [token]);
    if (!result.rowCount) return res.status(404).json({ error: 'Link de avaliação inválido ou expirado.' });
    const row = result.rows[0];
    res.json({
      review: {
        token: row.token,
        status: row.status || 'pending',
        rating: row.rating ? Number(row.rating) : null,
        ratingLabel: serviceReviewRatingLabel(row.rating),
        submittedAt: row.submitted_at || null,
        tutorName: row.tutor_name || '',
        petName: row.pet_name || 'seu pet',
        services: row.services || '',
        startsAt: row.starts_at || null
      }
    });
  } catch (error) { next(error); }
});

app.post('/api/public/service-reviews/:token', async (req, res, next) => {
  try {
    await ensureServiceReviewTables();
    const token = cleanText(req.params.token);
    const rating = Number(req.body?.rating || 0);
    const comment = (cleanText(req.body?.comment || '') || '').slice(0, 700);
    if (!token) return res.status(404).json({ error: 'Avaliação não encontrada.' });
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ error: 'Selecione uma nota de 1 a 5.' });
    const exists = await query(`SELECT id, status FROM service_reviews WHERE token=$1::text AND deleted_at IS NULL LIMIT 1`, [token]);
    if (!exists.rowCount) return res.status(404).json({ error: 'Link de avaliação inválido ou expirado.' });
    await query(`
      UPDATE service_reviews
      SET rating=$2::smallint, comment=$3::text, status='submitted', submitted_at=COALESCE(submitted_at, NOW()), user_agent=$4::text, ip_address=$5::text, updated_at=NOW()
      WHERE token=$1::text AND deleted_at IS NULL
      RETURNING *
    `, [token, rating, comment, String(req.headers['user-agent'] || '').slice(0, 500), String(req.ip || req.socket?.remoteAddress || '').slice(0, 80)]);
    const updated = await query(`
      SELECT sr.*, a.starts_at, t.name AS tutor_name, t.whatsapp AS tutor_whatsapp, p.name AS pet_name,
             COALESCE(string_agg(ai.description, ', ' ORDER BY ai.created_at), '') AS services
      FROM service_reviews sr
      LEFT JOIN appointments a ON a.id = sr.appointment_id
      LEFT JOIN tutors t ON t.id = sr.tutor_id
      LEFT JOIN pets p ON p.id = sr.pet_id
      LEFT JOIN appointment_items ai ON ai.appointment_id = sr.appointment_id
      WHERE sr.token=$1::text AND sr.deleted_at IS NULL
      GROUP BY sr.id, a.starts_at, t.name, t.whatsapp, p.name
      LIMIT 1
    `, [token]);
    res.json({ ok: true, review: sanitizeServiceReview(updated.rows[0]), message: 'Avaliação enviada com sucesso. Obrigado pela confiança!' });
  } catch (error) { next(error); }
});

app.get('/api/service-reviews', requireAuth, async (req, res, next) => {
  try {
    await ensureReviewsForFinalizedAppointments(800).catch((error) => console.warn('[service-review] backfill indisponível:', error.message));
    const status = cleanText(req.query.status || 'all');
    const search = cleanText(req.query.search || '');
    const params = [];
    const where = [`sr.deleted_at IS NULL`, `a.deleted_at IS NULL`, `a.status = 'finalizado'`];
    if (status === 'pending') where.push(`(sr.status='pending' OR sr.rating IS NULL)`);
    if (status === 'submitted') where.push(`(sr.status='submitted' OR sr.rating IS NOT NULL)`);
    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      where.push(`(lower(t.name) LIKE $${params.length} OR lower(p.name) LIKE $${params.length} OR regexp_replace(COALESCE(t.whatsapp,''), '\\D', '', 'g') LIKE regexp_replace($${params.length}, '\\D', '', 'g'))`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const result = await query(`
      SELECT sr.*, a.starts_at, a.status AS appointment_status,
             COALESCE(ast.name, CASE WHEN a.status = 'finalizado' THEN 'Finalizado' ELSE INITCAP(REPLACE(COALESCE(a.status, 'finalizado'), '_', ' ')) END) AS appointment_status_name,
             t.name AS tutor_name, t.whatsapp AS tutor_whatsapp, p.name AS pet_name,
             COALESCE(
               NULLIF(string_agg(DISTINCT COALESCE(NULLIF(ai.description, ''), sv.name), ', '), ''),
               'Atendimento PetFunny'
             ) AS services
      FROM service_reviews sr
      LEFT JOIN appointments a ON a.id = sr.appointment_id
      LEFT JOIN appointment_statuses ast ON ast.code = a.status AND ast.deleted_at IS NULL
      LEFT JOIN tutors t ON t.id = sr.tutor_id
      LEFT JOIN pets p ON p.id = sr.pet_id
      LEFT JOIN appointment_items ai ON ai.appointment_id = sr.appointment_id
      LEFT JOIN services sv ON sv.id = ai.service_id
      ${whereSql}
      GROUP BY sr.id, a.starts_at, a.status, ast.name, t.name, t.whatsapp, p.name
      ORDER BY COALESCE(sr.submitted_at, sr.created_at) DESC
      LIMIT 300
    `, params);
    const metrics = await query(`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE sr.rating IS NOT NULL)::int AS submitted,
             COUNT(*) FILTER (WHERE sr.rating IS NULL)::int AS pending,
             COUNT(*) FILTER (WHERE sr.submitted_at::date = CURRENT_DATE)::int AS today,
             ROUND(AVG(sr.rating)::numeric, 2) AS average_rating
      FROM service_reviews sr
      LEFT JOIN appointments a ON a.id = sr.appointment_id
      WHERE sr.deleted_at IS NULL
        AND a.deleted_at IS NULL
        AND a.status = 'finalizado'
    `);
    res.json({ metrics: metrics.rows[0] || {}, items: result.rows.map(sanitizeServiceReview) });
  } catch (error) { next(error); }
});

app.get('/api/agenda/:id/status-message', requireAuth, async (req, res, next) => {
  try {
    const appointment = await getAppointmentById(req.params.id);
    if (!appointment) return res.status(404).json({ error: 'Agendamento não encontrado.' });
    const requestedStatus = cleanText(req.query?.status) || appointment.status;
    const statusRow = await query('SELECT code, name, color, description FROM appointment_statuses WHERE code=$1::text AND deleted_at IS NULL LIMIT 1', [requestedStatus]);
    const status = statusRow.rows[0] || { code: requestedStatus, name: requestedStatus };
    const clean = sanitizeAppointment(appointment);
    let reviewUrl = '';
    if (String(status.code || requestedStatus || '').toLowerCase() === 'finalizado') {
      const review = await ensureServiceReviewForAppointment(appointment.id).catch((error) => {
        console.warn('[service-review] não foi possível preparar link:', error.message);
        return null;
      });
      if (review?.token) reviewUrl = buildServiceReviewPublicUrl(review.token);
    }
    const message = makeAppointmentStatusAiMessage(clean, status, { reviewUrl });
    const phone = clean.tutorWhatsapp || appointment.tutor_whatsapp || '';
    res.json({
      mode: 'hybrid_manual_send',
      generatedBy: 'Assistente Inteligente PetFunny',
      appointment: clean,
      status,
      reviewUrl,
      phone,
      message,
      url: buildWhatsAppUrl(phone, message)
    });
  } catch (error) { next(error); }
});

app.patch('/api/agenda/:id/status', requireAuth, async (req, res, next) => {
  try {
    const status = cleanText(req.body?.status);
    if (!status) return res.status(400).json({ error: 'Informe o status.' });
    const exists = await query('SELECT code FROM appointment_statuses WHERE code=$1::text AND deleted_at IS NULL AND is_active=TRUE LIMIT 1', [status]);
    if (!exists.rowCount) return res.status(400).json({ error: 'Status inválido. Configure os status da agenda em Configurações.' });
    const result = await query(`
      UPDATE appointments
      SET status=$2::text,
          checked_in_at = CASE WHEN $2::text = 'em_atendimento' THEN COALESCE(checked_in_at, NOW()) ELSE checked_in_at END,
          checked_out_at = CASE WHEN $2::text = 'finalizado' THEN COALESCE(checked_out_at, NOW()) ELSE checked_out_at END,
          updated_at=NOW()
      WHERE id=$1::uuid AND deleted_at IS NULL
      RETURNING id
    `, [req.params.id, status]);
    if (!result.rowCount) return res.status(404).json({ error: 'Agendamento não encontrado.' });
    const appointment = await getAppointmentById(req.params.id);
    if (status === 'finalizado') {
      await ensureFinancialTransactionForAppointment(req.params.id);
      await ensureServiceReviewForAppointment(req.params.id).catch((error) => console.warn('[service-review] token não gerado:', error.message));
    }
    if (appointment?.customer_package_id) await refreshCustomerPackageProgress(appointment.customer_package_id, { allowRenew: true });
    try {
      const statusRow = await query('SELECT code, name, color, description FROM appointment_statuses WHERE code=$1::text AND deleted_at IS NULL LIMIT 1', [status]);
      const statusPayload = statusRow.rows[0] || { code: status, name: status };
      const cleanAppointment = sanitizeAppointment(appointment);
      const pushTargets = await query(`SELECT * FROM push_subscriptions WHERE tutor_id=$1::uuid AND status='active' AND deleted_at IS NULL`, [appointment.tutor_id]);
      if (pushTargets.rowCount) {
        await sendPushToSubscriptions(pushTargets.rows, {
          title: status === 'confirmado' ? 'Agendamento confirmado ✅' : `Agendamento ${statusPayload.name || status}`,
          body: makeAppointmentStatusAiMessage(cleanAppointment, statusPayload).replace(/^Oi,\s*[^!]+!\s*/i, '').slice(0, 220),
          url: '/app/home',
          tag: `appointment-status-${req.params.id}-${status}`,
          type: 'appointment_status'
        });
      }
    } catch (notifyError) {
      console.warn('[agenda:status] timeline/push indisponível:', notifyError.message);
    }
    res.json({ appointment: sanitizeAppointment(appointment), message: 'Status atualizado. A timeline do app será atualizada para o tutor.' });
  } catch (error) { next(error); }
});


app.patch('/api/agenda/:id/reschedule', requireAuth, async (req, res, next) => {
  try {
    const current = await getAppointmentById(req.params.id);
    if (!current) return res.status(404).json({ error: 'Agendamento não encontrado.' });
    const startsAt = toIsoOrNull(req.body?.startsAt);
    if (!startsAt) return res.status(400).json({ error: 'Informe a nova data e horário.' });
    await assertSlotAvailable(req.body?.startsAt || startsAt, current.status, req.params.id);
    const previousStart = current.starts_at ? new Date(current.starts_at) : null;
    const previousEnd = current.ends_at ? new Date(current.ends_at) : null;
    const durationMs = previousStart && previousEnd && previousEnd > previousStart ? previousEnd - previousStart : 60 * 60000;
    const endsAt = new Date(new Date(startsAt).getTime() + durationMs).toISOString();
    await query(`
      UPDATE appointments
      SET starts_at=$2::timestamptz, ends_at=$3::timestamptz, updated_at=NOW()
      WHERE id=$1::uuid AND deleted_at IS NULL
    `, [req.params.id, startsAt, endsAt]);
    const appointment = await getAppointmentById(req.params.id);
    res.json({ appointment: sanitizeAppointment(appointment), message: 'Agendamento reagendado com sucesso.' });
  } catch (error) { next(error); }
});


app.patch('/api/agenda/:id/payment', requireAuth, async (req, res, next) => {
  try {
    const paymentStatus = cleanText(req.body?.paymentStatus) || 'pending';
    const paymentMethodId = cleanText(req.body?.paymentMethodId);
    const statusExists = await query('SELECT code FROM payment_statuses WHERE code=$1::text AND deleted_at IS NULL AND is_active=TRUE LIMIT 1', [paymentStatus]);
    if (!statusExists.rowCount) return res.status(400).json({ error: 'Status de pagamento inválido. Configure os status em Configurações.' });
    if (paymentMethodId) {
      const methodExists = await query('SELECT id FROM payment_methods WHERE id=$1::uuid AND deleted_at IS NULL AND is_active=TRUE LIMIT 1', [paymentMethodId]);
      if (!methodExists.rowCount) return res.status(400).json({ error: 'Forma de pagamento inválida. Configure as formas em Configurações.' });
    }
    const result = await query(`
      UPDATE appointments
      SET payment_status=$2::text, payment_method_id=NULLIF($3::text,'')::uuid, updated_at=NOW()
      WHERE id=$1::uuid AND deleted_at IS NULL
      RETURNING id
    `, [req.params.id, paymentStatus, paymentMethodId || '']);
    if (!result.rowCount) return res.status(404).json({ error: 'Agendamento não encontrado.' });
    await syncFinancialTransactionWithAppointmentPayment(req.params.id, paymentStatus, paymentMethodId || '');
    const appointment = await getAppointmentById(req.params.id);
    res.json({ appointment: sanitizeAppointment(appointment), message: 'Pagamento do agendamento atualizado.' });
  } catch (error) { next(error); }
});

app.delete('/api/agenda/:id', requireAuth, async (req, res, next) => {
  try {
    const result = await query(`UPDATE appointments SET deleted_at=NOW(), updated_at=NOW() WHERE id=$1::uuid AND deleted_at IS NULL RETURNING id`, [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Agendamento não encontrado.' });
    res.json({ ok: true, message: 'Agendamento removido.' });
  } catch (error) { next(error); }
});



function sanitizePackage(row = {}) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    petSize: row.pet_size || 'todos',
    petSizeName: row.pet_size_name || null,
    sessionsCount: Number(row.sessions_count || 0),
    appointmentsPerMonth: Number(row.appointments_per_month || 0),
    discountPercent: Number(row.discount_percent || 0),
    priceCents: Number(row.price_cents || 0),
    isActive: Boolean(row.is_active),
    services: row.services || [],
    servicesText: row.services_text || '',
    customersCount: Number(row.customers_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function sanitizeCustomerPackage(row = {}) {
  return {
    id: row.id,
    tutorId: row.tutor_id,
    tutorName: row.tutor_name,
    tutorWhatsapp: row.tutor_whatsapp,
    petId: row.pet_id,
    petName: row.pet_name,
    packageId: row.package_id,
    packageName: row.package_name,
    status: row.status,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    totalSessions: Number(row.total_sessions || 0),
    usedSessions: Number(row.used_sessions || 0),
    remainingSessions: Math.max(0, Number(row.total_sessions || 0) - Number(row.used_sessions || 0)),
    amountCents: Number(row.amount_cents || 0),
    paymentStatus: row.payment_status || 'pending',
    paymentMethodId: row.payment_method_id || null,
    paymentMethodName: row.payment_method_name || null,
    recurring: Boolean(row.recurring || row.recurrence_rule?.enabled),
    currentCycleStartedOn: row.current_cycle_started_on || null,
    cycleNumber: Number(row.cycle_number || 1),
    progressLabel: `${Number(row.used_sessions || 0)} de ${Number(row.total_sessions || 0)}`,
    recurrenceRule: row.recurrence_rule || {},
    appointmentCount: Number(row.appointment_count || 0),
    firstAppointmentId: row.first_appointment_id || null,
    firstCommandUrl: row.first_appointment_id ? `/documentos/comanda/${row.first_appointment_id}` : null,
    packageCommandUrl: row.id ? `/documentos/pacote-comanda/${row.id}` : null,
    packageReceiptUrl: row.id ? `/documentos/pacote-recibo/${row.id}` : null,
    createdAt: row.created_at
  };
}

async function calculatePackageTotals(serviceItems = [], discountPercent = 0) {
  const normalized = [];
  const ids = [];
  for (const item of serviceItems) {
    const serviceId = cleanText(item.serviceId || item.id);
    const quantity = Math.max(1, Number.parseInt(item.quantity || '1', 10));
    if (!serviceId) continue;
    normalized.push({ serviceId, quantity });
    ids.push(serviceId);
  }
  if (!normalized.length) return { subtotalCents: 0, discountCents: 0, totalCents: 0, items: [] };
  const services = await query(`
    SELECT id, name, price_cents
    FROM services
    WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL AND is_active = TRUE
  `, [ids]);
  const serviceMap = new Map(services.rows.map((row) => [String(row.id), row]));
  const items = normalized.map((item) => {
    const service = serviceMap.get(String(item.serviceId));
    const unitPriceCents = Number(service?.price_cents || 0);
    return {
      ...item,
      serviceName: service?.name || 'Serviço',
      unitPriceCents,
      totalCents: unitPriceCents * item.quantity
    };
  }).filter((item) => serviceMap.has(String(item.serviceId)));
  const subtotalCents = items.reduce((sum, item) => sum + Number(item.totalCents || 0), 0);
  const safeDiscount = Math.max(0, Math.min(100, Number(discountPercent || 0)));
  const discountCents = Math.round(subtotalCents * (safeDiscount / 100));
  const totalCents = Math.max(0, subtotalCents - discountCents);
  return { subtotalCents, discountCents, totalCents, items };
}

function sanitizeSubscription(row = {}) {
  return {
    id: row.id,
    tutorId: row.tutor_id,
    tutorName: row.tutor_name,
    tutorWhatsapp: row.tutor_whatsapp,
    petId: row.pet_id,
    petName: row.pet_name,
    packageId: row.package_id,
    packageName: row.package_name,
    name: row.name,
    status: row.status,
    recurrence: row.recurrence,
    amountCents: Number(row.amount_cents || 0),
    startsOn: row.starts_on,
    nextBillingOn: row.next_billing_on,
    paymentMethod: row.payment_method,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}


function sanitizeFinancialTransaction(row = {}) {
  return {
    id: row.id,
    appointmentId: row.appointment_id,
    customerPackageId: row.customer_package_id,
    tutorId: row.tutor_id,
    tutorName: row.tutor_name,
    tutorWhatsapp: row.tutor_whatsapp,
    petName: row.pet_name,
    packageName: row.package_name,
    type: row.type,
    category: row.category,
    description: row.description,
    amountCents: Number(row.amount_cents || 0),
    dueDate: row.due_date,
    paidAt: row.paid_at,
    status: row.status,
    paymentMethodName: row.payment_method_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function getFinancialTransactionById(id) {
  const result = await query(`
    SELECT ft.*, t.name AS tutor_name, t.whatsapp AS tutor_whatsapp, p.name AS pet_name,
           pk.name AS package_name, pm.name AS payment_method_name
    FROM financial_transactions ft
    LEFT JOIN tutors t ON t.id = ft.tutor_id
    LEFT JOIN appointments a ON a.id = ft.appointment_id
    LEFT JOIN pets p ON p.id = a.pet_id
    LEFT JOIN customer_packages cp ON cp.id = ft.customer_package_id
    LEFT JOIN packages pk ON pk.id = cp.package_id
    LEFT JOIN payments pay ON pay.financial_transaction_id = ft.id
    LEFT JOIN payment_methods pm ON pm.id = pay.payment_method_id
    WHERE ft.id = $1::uuid AND ft.deleted_at IS NULL
    ORDER BY pay.paid_at DESC NULLS LAST
    LIMIT 1
  `, [id]);
  return result.rows[0] || null;
}

async function getPackageById(id) {
  const result = await query(`
    SELECT p.*,
           COALESCE(json_agg(json_build_object('serviceId', pi.service_id, 'serviceName', s.name, 'quantity', pi.quantity, 'priceCents', s.price_cents, 'petSize', s.pet_size, 'petSizeName', ps.name, 'categoryName', sc.name) ORDER BY sc.sort_order ASC NULLS LAST, s.name) FILTER (WHERE pi.id IS NOT NULL), '[]'::json) AS services,
           COALESCE(string_agg(s.name, ', ' ORDER BY s.name), '') AS services_text,
           COUNT(DISTINCT cp.id) FILTER (WHERE cp.deleted_at IS NULL) AS customers_count
    FROM packages p
    LEFT JOIN package_items pi ON pi.package_id = p.id
    LEFT JOIN services s ON s.id = pi.service_id
    LEFT JOIN pet_sizes ps ON ps.code = s.pet_size
    LEFT JOIN service_categories sc ON sc.id = s.category_id
    LEFT JOIN customer_packages cp ON cp.package_id = p.id
    WHERE p.id = $1::uuid AND p.deleted_at IS NULL
    GROUP BY p.id
    LIMIT 1
  `, [id]);
  return result.rows[0] || null;
}

async function generateAppointmentsForCustomerPackage(customerPackageId, { startsOn, firstTime = '09:00', historicalImport = false } = {}) {
  const contractResult = await query(`
    SELECT cp.*, pk.name AS package_name, pk.sessions_count, pk.appointments_per_month, pk.price_cents
    FROM customer_packages cp
    INNER JOIN packages pk ON pk.id = cp.package_id
    WHERE cp.id = $1::uuid AND cp.deleted_at IS NULL
    LIMIT 1
  `, [customerPackageId]);
  const contract = contractResult.rows[0];
  if (!contract?.pet_id) return { created: 0 };
  const perMonth = Number(contract.appointments_per_month || 4);
  const totalSessions = Number(contract.total_sessions || contract.sessions_count || 1);
  const intervalDays = resolvePackageIntervalDays({ totalSessions, appointmentsPerMonth: perMonth, recurrenceRule: contract.recurrence_rule });
  const cycleStart = cleanText(startsOn) || new Date().toISOString().slice(0, 10);
  const services = await query(`
    SELECT s.id, s.name, s.price_cents, s.duration_minutes, pi.quantity
    FROM package_items pi
    INNER JOIN services s ON s.id = pi.service_id
    WHERE pi.package_id = $1::uuid AND s.deleted_at IS NULL
    ORDER BY s.name ASC
  `, [contract.package_id]);
  const duration = Math.max(60, services.rows.reduce((sum, row) => sum + Number(row.duration_minutes || 60), 0));
  const subtotal = services.rows.reduce((sum, row) => sum + Number(row.price_cents || 0), 0);
  const packageTotal = Number(contract.amount_cents || contract.price_cents || 0);
  let created = 0;
  for (let i = 0; i < totalSessions; i += 1) {
    const sessionDate = addDaysToDateString(cycleStart, i * intervalDays);
    const startsAt = saoPauloLocalToIso(sessionDate, firstTime || '09:00') || new Date(`${sessionDate}T${firstTime || '09:00'}:00`).toISOString();
    const appointmentDate = new Date(startsAt);
    const endsAt = new Date(appointmentDate.getTime() + duration * 60000).toISOString();
    const sessionStatus = historicalImport && appointmentDate.getTime() < Date.now() ? 'finalizado' : 'agendado';
    const appointmentSource = historicalImport ? 'historical_package' : 'package';
    const allocatedTotal = i === totalSessions - 1
      ? Math.max(0, packageTotal - Math.floor(packageTotal / totalSessions) * (totalSessions - 1))
      : Math.floor(packageTotal / totalSessions);
    const discount = Math.max(0, subtotal - allocatedTotal);
    const appt = await query(`
      INSERT INTO appointments (tutor_id, pet_id, customer_package_id, package_session_number, package_total_sessions, starts_at, ends_at, status, source, subtotal_cents, discount_percent, discount_cents, total_cents, package_session_label, notes, payment_status, payment_method_id)
      SELECT $1::uuid, $2::uuid, $3::uuid, $4::integer, $5::integer, $6::timestamptz, $7::timestamptz, $16::text, $17::text, $8::integer, $9::numeric, $10::integer, $11::integer, $12::text, $13::text, $14::text, NULLIF($15::text,'')::uuid
      WHERE NOT EXISTS (
        SELECT 1
        FROM appointments existing
        WHERE existing.customer_package_id = $3::uuid
          AND existing.deleted_at IS NULL
          AND existing.starts_at = $6::timestamptz
          AND COALESCE(existing.package_session_number, 0) = $4::integer
      )
      RETURNING id
    `, [contract.tutor_id, contract.pet_id, contract.id, i + 1, totalSessions, startsAt, endsAt, subtotal, subtotal > 0 ? Number(((discount / subtotal) * 100).toFixed(2)) : 0, discount, allocatedTotal, `${i + 1} de ${totalSessions}`, `${historicalImport ? 'Sessão histórica' : 'Sessão'} ${i + 1} de ${totalSessions} gerada automaticamente pelo pacote ${contract.package_name}. Valor total do pacote: ${(packageTotal / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.`, contract.payment_status || 'pending', contract.payment_method_id || '', sessionStatus, appointmentSource]);
    if (!appt.rowCount) continue;
    for (const service of services.rows) {
      await query(`
        INSERT INTO appointment_items (appointment_id, pet_id, service_id, description, quantity, unit_price_cents, discount_percent, total_cents)
        VALUES ($1::uuid,$2::uuid,$3::uuid,$4::text,1,$5::integer,0,$5::integer)
      `, [appt.rows[0].id, contract.pet_id, service.id, service.name, Number(service.price_cents || 0)]);
    }
    created += 1;
  }
  return { created, intervalDays, totalSessions, startsOn: cycleStart };
}

async function ensureHistoricalRecurringCyclesForCustomerPackage(customerPackageId, { startsOn, firstTime = '09:00', maxCycles = 60 } = {}) {
  const result = await query(`
    SELECT cp.*, pk.appointments_per_month, pk.sessions_count
    FROM customer_packages cp
    INNER JOIN packages pk ON pk.id = cp.package_id
    WHERE cp.id = $1::uuid AND cp.deleted_at IS NULL
    LIMIT 1
  `, [customerPackageId]);
  const cp = result.rows[0];
  if (!cp || !cp.pet_id) return { renewedCycles: 0, created: 0 };
  const recurringEnabled = Boolean(cp.recurring || cp.recurrence_rule?.enabled);
  if (!recurringEnabled || ['cancelled', 'canceled'].includes(String(cp.status || '').toLowerCase())) {
    return { renewedCycles: 0, created: 0 };
  }
  const perMonth = Number(cp.appointments_per_month || cp.recurrence_rule?.appointmentsPerMonth || 4);
  const totalSessions = Math.max(1, Number(cp.total_sessions || cp.sessions_count || 1));
  const intervalDays = resolvePackageIntervalDays({ totalSessions, appointmentsPerMonth: perMonth, recurrenceRule: cp.recurrence_rule });
  let cycleStart = cleanText(cp.current_cycle_started_on) || cleanText(startsOn) || cleanText(cp.starts_on) || new Date().toISOString().slice(0, 10);
  let cycleNumber = Math.max(1, Number(cp.cycle_number || 1));
  let renewedCycles = 0;
  let created = 0;

  for (let guard = 0; guard < maxCycles; guard += 1) {
    const lastSessionDate = addDaysToDateString(cycleStart, (totalSessions - 1) * intervalDays);
    const lastSessionIso = saoPauloLocalToIso(lastSessionDate, firstTime || '09:00') || new Date(`${lastSessionDate}T${firstTime || '09:00'}:00`).toISOString();
    if (new Date(lastSessionIso).getTime() >= Date.now()) break;

    const nextStart = addDaysToDateString(lastSessionDate, intervalDays);
    cycleNumber += 1;
    await query(`
      UPDATE customer_packages
      SET status = 'active',
          used_sessions = 0,
          current_cycle_started_on = $2::date,
          cycle_number = $3::integer,
          ends_on = ($2::date + (($4::integer - 1) * $5::integer || ' days')::interval)::date,
          recurrence_rule = COALESCE(recurrence_rule, '{}'::jsonb) || jsonb_build_object('enabled', true, 'firstTime', $6::text, 'intervalDays', $5::integer, 'historicalAutoRenew', true, 'lastRenewedOn', $2::text),
          updated_at = NOW()
      WHERE id = $1::uuid AND deleted_at IS NULL
    `, [customerPackageId, nextStart, cycleNumber, totalSessions, intervalDays, firstTime || '09:00']);
    const generated = await generateAppointmentsForCustomerPackage(customerPackageId, { startsOn: nextStart, firstTime, historicalImport: true });
    created += Number(generated.created || 0);
    renewedCycles += 1;
    cycleStart = nextStart;
  }

  const done = await query(`
    SELECT COUNT(*)::int AS finished_count
    FROM appointments
    WHERE customer_package_id = $1::uuid
      AND deleted_at IS NULL
      AND starts_at::date >= $2::date
      AND status = 'finalizado'
  `, [customerPackageId, cycleStart]);
  const usedSessions = Math.min(Number(done.rows[0]?.finished_count || 0), totalSessions);
  await query(`
    UPDATE customer_packages
    SET status = 'active',
        used_sessions = $2::integer,
        recurring = TRUE,
        current_cycle_started_on = $3::date,
        updated_at = NOW()
    WHERE id = $1::uuid AND deleted_at IS NULL
  `, [customerPackageId, usedSessions, cycleStart]);
  return { renewedCycles, created, currentCycleStartedOn: cycleStart, usedSessions };
}

async function createNextRecurringCustomerPackageCycle(customerPackageId, { reason = 'auto_renewal' } = {}) {
  const result = await query(`
    SELECT cp.*, pk.appointments_per_month, pk.sessions_count, pk.price_cents, pk.name AS package_name
    FROM customer_packages cp
    INNER JOIN packages pk ON pk.id = cp.package_id
    WHERE cp.id = $1::uuid AND cp.deleted_at IS NULL
    LIMIT 1
  `, [customerPackageId]);
  const cp = result.rows[0];
  if (!cp || !cp.pet_id) return { renewed: false, reason: 'missing_package_or_pet' };
  const rule = getRecurrenceRule(cp);
  const recurringEnabled = Boolean(cp.recurring || rule.enabled || rule.autoRenewUntilCancelled);
  const cancelled = ['cancelled', 'canceled'].includes(String(cp.status || '').toLowerCase());
  if (!recurringEnabled || cancelled) return { renewed: false, reason: 'not_recurring' };

  const totalSessions = Math.max(1, Number(cp.total_sessions || cp.sessions_count || 1));
  const perMonth = Number(cp.appointments_per_month || rule.appointmentsPerMonth || 4);
  const intervalDays = resolvePackageIntervalDays({ totalSessions, appointmentsPerMonth: perMonth, recurrenceRule: rule });
  const cycleStart = normalizeDateOnly(cp.current_cycle_started_on) || normalizeDateOnly(cp.starts_on) || new Date().toISOString().slice(0, 10);

  const progress = await query(`
    SELECT COUNT(DISTINCT COALESCE(a.package_session_number::text, a.id::text))::int AS finished_count,
           MAX(a.starts_at)::date AS last_session_date,
           to_char(MIN(a.starts_at AT TIME ZONE 'America/Sao_Paulo'), 'HH24:MI') AS first_session_time
    FROM appointments a
    WHERE a.customer_package_id = $1::uuid
      AND a.deleted_at IS NULL
      AND a.starts_at::date >= $2::date
      AND a.status = 'finalizado'
  `, [customerPackageId, cycleStart]);
  const finished = Math.min(Number(progress.rows[0]?.finished_count || 0), totalSessions);
  if (finished < totalSessions) {
    await query(`
      UPDATE customer_packages
      SET used_sessions = $2::integer,
          updated_at = NOW()
      WHERE id = $1::uuid AND deleted_at IS NULL
    `, [customerPackageId, finished]);
    return { renewed: false, usedSessions: finished, reason: 'cycle_not_finished' };
  }

  const firstTime = cleanText(rule.firstTime) || cleanText(progress.rows[0]?.first_session_time) || '09:00';
  const lastSessionDate = normalizeDateOnly(progress.rows[0]?.last_session_date)
    || normalizeDateOnly(cp.ends_on)
    || addDaysToDateString(cycleStart, (totalSessions - 1) * intervalDays);
  const nextStart = addDaysToDateString(lastSessionDate, intervalDays);
  const nextEndsOn = addDaysToDateString(nextStart, (totalSessions - 1) * intervalDays);
  const nextCycleNumber = Math.max(1, Number(cp.cycle_number || 1)) + 1;

  const duplicate = await query(`
    SELECT id
    FROM customer_packages
    WHERE deleted_at IS NULL
      AND tutor_id = $1::uuid
      AND pet_id = $2::uuid
      AND package_id = $3::uuid
      AND starts_on = $4::date
      AND total_sessions = $5::integer
      AND (
        recurrence_rule->>'renewedFromCustomerPackageId' = $6::text
        OR recurrence_rule->>'previousCustomerPackageId' = $6::text
      )
    ORDER BY created_at DESC
    LIMIT 1
  `, [cp.tutor_id, cp.pet_id, cp.package_id, nextStart, totalSessions, String(customerPackageId)]);

  let nextCustomerPackageId = duplicate.rows[0]?.id || null;
  let generatedAppointments = { created: 0, totalSessions, intervalDays, startsOn: nextStart };
  let duplicatePrevented = Boolean(nextCustomerPackageId);

  if (!nextCustomerPackageId) {
    const nextPackage = await query(`
      INSERT INTO customer_packages (
        tutor_id, pet_id, package_id, status, starts_on, ends_on, total_sessions, used_sessions,
        amount_cents, payment_status, payment_method_id, recurring, current_cycle_started_on,
        cycle_number, recurrence_rule, created_at, updated_at
      )
      VALUES (
        $1::uuid, $2::uuid, $3::uuid, 'active', $4::date, $5::date, $6::integer, 0,
        $7::integer, $8::text, NULLIF($9::text,'')::uuid, TRUE, $4::date,
        $10::integer,
        jsonb_build_object(
          'enabled', true,
          'autoRenewUntilCancelled', true,
          'renewedFromCustomerPackageId', $11::text,
          'previousCustomerPackageId', $11::text,
          'previousCycleNumber', $12::integer,
          'source', $13::text,
          'firstTime', $14::text,
          'appointmentsPerMonth', $15::integer,
          'intervalDays', $16::integer,
          'generatedFromLastSessionOn', $17::text
        ),
        NOW(), NOW()
      )
      RETURNING id
    `, [
      cp.tutor_id,
      cp.pet_id,
      cp.package_id,
      nextStart,
      nextEndsOn,
      totalSessions,
      Number(cp.amount_cents || cp.price_cents || 0),
      cleanText(cp.payment_status) || 'pending',
      cleanText(cp.payment_method_id) || '',
      nextCycleNumber,
      String(customerPackageId),
      Number(cp.cycle_number || 1),
      reason,
      firstTime,
      perMonth,
      intervalDays,
      lastSessionDate
    ]);
    nextCustomerPackageId = nextPackage.rows[0]?.id;
    generatedAppointments = await generateAppointmentsForCustomerPackage(nextCustomerPackageId, { startsOn: nextStart, firstTime, historicalImport: false });
  }

  await query(`
    UPDATE customer_packages
    SET status = 'finished',
        used_sessions = $2::integer,
        recurring = FALSE,
        recurrence_rule = COALESCE(recurrence_rule, '{}'::jsonb) || jsonb_build_object(
          'enabled', false,
          'autoRenewed', true,
          'renewedAt', NOW()::text,
          'renewedToCustomerPackageId', $3::text,
          'nextCycleStartsOn', $4::text,
          'intervalDays', $5::integer,
          'lastFinishedSessionOn', $6::text
        ),
        updated_at = NOW()
    WHERE id = $1::uuid AND deleted_at IS NULL
  `, [customerPackageId, totalSessions, String(nextCustomerPackageId || ''), nextStart, intervalDays, lastSessionDate]);

  return {
    renewed: true,
    usedSessions: totalSessions,
    newCustomerPackageId: nextCustomerPackageId,
    nextStart,
    intervalDays,
    cycleNumber: nextCycleNumber,
    duplicatePrevented,
    generatedAppointments
  };
}

async function refreshCustomerPackageProgress(customerPackageId, { allowRenew = true } = {}) {
  const result = await query(`
    SELECT cp.*, pk.appointments_per_month, pk.sessions_count
    FROM customer_packages cp
    INNER JOIN packages pk ON pk.id = cp.package_id
    WHERE cp.id = $1::uuid AND cp.deleted_at IS NULL
    LIMIT 1
  `, [customerPackageId]);
  const cp = result.rows[0];
  if (!cp) return null;
  const cycleStart = normalizeDateOnly(cp.current_cycle_started_on) || normalizeDateOnly(cp.starts_on) || new Date().toISOString().slice(0, 10);
  const done = await query(`
    SELECT COUNT(DISTINCT COALESCE(package_session_number::text, id::text))::int AS finished_count,
           MAX(starts_at)::date AS last_session_date
    FROM appointments
    WHERE customer_package_id = $1::uuid
      AND deleted_at IS NULL
      AND starts_at::date >= $2::date
      AND status = 'finalizado'
  `, [customerPackageId, cycleStart]);
  const totalSessions = Math.max(1, Number(cp.total_sessions || cp.sessions_count || 0));
  const finished = Math.min(Number(done.rows[0]?.finished_count || 0), totalSessions);
  const recurringEnabled = Boolean(cp.recurring || getRecurrenceRule(cp).enabled || getRecurrenceRule(cp).autoRenewUntilCancelled);
  const shouldRenew = recurringEnabled && cp.status === 'active' && allowRenew && finished >= totalSessions;
  if (shouldRenew) {
    return createNextRecurringCustomerPackageCycle(customerPackageId, { reason: 'auto_renewal_after_last_session' });
  }
  await query(`
    UPDATE customer_packages
    SET used_sessions = $2::integer,
        status = CASE WHEN $2::integer >= total_sessions AND NOT recurring THEN 'finished' ELSE status END,
        updated_at = NOW()
    WHERE id = $1::uuid
  `, [customerPackageId, finished]);
  return { renewed: false, usedSessions: finished };
}

async function releaseAdvisoryLock(client, key) {
  if (!client) return;
  try {
    if (key) await client.query('SELECT pg_advisory_unlock(hashtext($1::text))', [key]);
  } catch (error) {
    console.warn('[pacotes] não foi possível liberar lock advisory:', error.message);
  } finally {
    client.release();
  }
}

async function renewDueRecurringCustomerPackages() {
  const due = await query(`
    SELECT cp.id
    FROM customer_packages cp
    WHERE cp.deleted_at IS NULL
      AND cp.status = 'active'
      AND (cp.recurring = TRUE OR COALESCE((cp.recurrence_rule->>'enabled')::boolean, FALSE) = TRUE)
    LIMIT 50
  `);
  for (const row of due.rows) {
    await refreshCustomerPackageProgress(row.id, { allowRenew: true });
  }
}

app.get('/api/pacotes/options', requireAuth, async (req, res, next) => {
  try {
    const services = await query(`
      SELECT s.id, s.name, s.price_cents, s.duration_minutes, s.pet_size, ps.name AS pet_size_name,
             sc.id AS category_id, sc.name AS category_name, sc.pet_size_code AS category_pet_size_code, sc.pet_type_code AS category_pet_type_code, sc.sort_order AS category_sort_order
      FROM services s
      LEFT JOIN pet_sizes ps ON ps.code = s.pet_size
      LEFT JOIN service_categories sc ON sc.id = s.category_id
      WHERE s.deleted_at IS NULL AND s.is_active = TRUE
      ORDER BY sc.sort_order ASC NULLS LAST, s.name ASC
    `);
    const tutors = await query(`
      SELECT id, name, whatsapp FROM tutors
      WHERE deleted_at IS NULL AND status = 'active'
      ORDER BY name ASC
      LIMIT 300
    `);
    const pets = await query(`
      SELECT p.id, p.name, p.tutor_id, p.size, ps.name AS size_name
      FROM pets p
      LEFT JOIN pet_sizes ps ON ps.code = p.size
      WHERE p.deleted_at IS NULL AND p.status = 'active'
      ORDER BY p.name ASC
      LIMIT 500
    `);
    const petSizes = await query(`
      SELECT code, name, sort_order
      FROM pet_sizes
      WHERE is_active = TRUE
      ORDER BY sort_order ASC, name ASC
    `);
    const packages = await query(`
      SELECT id, name, pet_size, sessions_count, appointments_per_month, price_cents, discount_percent
      FROM packages
      WHERE deleted_at IS NULL AND is_active = TRUE
      ORDER BY name ASC
    `);
    const paymentMethods = await query(`
      SELECT * FROM payment_methods
      WHERE deleted_at IS NULL AND is_active = TRUE
      ORDER BY sort_order ASC, name ASC
    `);
    const paymentStatuses = await query(`
      SELECT * FROM payment_statuses
      WHERE deleted_at IS NULL AND is_active = TRUE
      ORDER BY sort_order ASC, name ASC
    `);
    res.json({
      services: services.rows.map((row) => ({ id: row.id, name: row.name, priceCents: Number(row.price_cents || 0), durationMinutes: Number(row.duration_minutes || 0), petSize: row.pet_size, petSizeName: row.pet_size_name, categoryId: row.category_id, categoryName: row.category_name, categoryPetSizeCode: row.category_pet_size_code, categoryPetTypeCode: row.category_pet_type_code })),
      petSizes: petSizes.rows.map((row) => ({ code: row.code, name: row.name, sortOrder: Number(row.sort_order || 0) })),
      tutors: tutors.rows.map((row) => ({ id: row.id, name: row.name, whatsapp: row.whatsapp })),
      pets: pets.rows.map((row) => ({ id: row.id, name: row.name, tutorId: row.tutor_id, size: row.size, sizeName: row.size_name })),
      packages: packages.rows.map((row) => ({ id: row.id, name: row.name, petSize: row.pet_size || 'todos', sessionsCount: Number(row.sessions_count || 0), appointmentsPerMonth: Number(row.appointments_per_month || 0), priceCents: Number(row.price_cents || 0), discountPercent: Number(row.discount_percent || 0) })),
      paymentMethods: paymentMethods.rows.map(sanitizePaymentMethod),
      paymentStatuses: paymentStatuses.rows.map(sanitizePaymentStatus)
    });
  } catch (error) { next(error); }
});

app.get('/api/pacotes', requireAuth, async (req, res, next) => {
  try {
    const search = cleanText(req.query.search);
    await renewDueRecurringCustomerPackages();
    const status = cleanText(req.query.status) || 'active';
    const params = [];
    const where = ['p.deleted_at IS NULL'];
    if (status !== 'all') {
      params.push(status === 'active');
      where.push(`p.is_active = $${params.length}::boolean`);
    }
    if (search) {
      params.push(`%${search.replace(/\s+/g, '%')}%`);
      where.push(`(unaccent(lower(p.name)) ILIKE unaccent(lower($${params.length})) OR unaccent(lower(COALESCE(p.description,''))) ILIKE unaccent(lower($${params.length})))`);
    }
    const result = await query(`
      SELECT p.*,
             COALESCE(json_agg(json_build_object('serviceId', pi.service_id, 'serviceName', s.name, 'quantity', pi.quantity, 'priceCents', s.price_cents, 'petSize', s.pet_size, 'petSizeName', ps.name, 'categoryName', sc.name) ORDER BY sc.sort_order ASC NULLS LAST, s.name) FILTER (WHERE pi.id IS NOT NULL), '[]'::json) AS services,
             COALESCE(string_agg(s.name, ', ' ORDER BY s.name), '') AS services_text,
             COUNT(DISTINCT cp.id) FILTER (WHERE cp.deleted_at IS NULL) AS customers_count
      FROM packages p
      LEFT JOIN package_items pi ON pi.package_id = p.id
      LEFT JOIN services s ON s.id = pi.service_id
      LEFT JOIN pet_sizes ps ON ps.code = s.pet_size
      LEFT JOIN service_categories sc ON sc.id = s.category_id
      LEFT JOIN customer_packages cp ON cp.package_id = p.id
      WHERE ${where.join(' AND ')}
      GROUP BY p.id
      ORDER BY p.is_active DESC, p.updated_at DESC, p.name ASC
      LIMIT 150
    `, params);
    const summary = await query(`
      SELECT COUNT(*) FILTER (WHERE deleted_at IS NULL)::int AS total,
             COUNT(*) FILTER (WHERE deleted_at IS NULL AND is_active = TRUE)::int AS active,
             COALESCE(SUM(price_cents) FILTER (WHERE deleted_at IS NULL AND is_active = TRUE),0)::int AS portfolio_cents
      FROM packages
    `);
    res.json({ items: result.rows.map(sanitizePackage), summary: summary.rows[0] || {} });
  } catch (error) { next(error); }
});

app.get('/api/pacotes/clientes', requireAuth, async (req, res, next) => {
  try {
    await renewDueRecurringCustomerPackages();
    const status = cleanText(req.query.status) || 'active';
    const params = [];
    const where = ['cp.deleted_at IS NULL'];
    if (status !== 'all') {
      params.push(status);
      where.push(`cp.status = $${params.length}::text`);
    }
    const result = await query(`
      SELECT cp.*, t.name AS tutor_name, t.whatsapp AS tutor_whatsapp, pt.name AS pet_name, p.name AS package_name, pm.name AS payment_method_name,
             COUNT(a.id)::int AS appointment_count,
             (array_agg(a.id ORDER BY a.starts_at ASC) FILTER (WHERE a.id IS NOT NULL))[1] AS first_appointment_id
      FROM customer_packages cp
      INNER JOIN tutors t ON t.id = cp.tutor_id
      LEFT JOIN pets pt ON pt.id = cp.pet_id
      INNER JOIN packages p ON p.id = cp.package_id
      LEFT JOIN payment_methods pm ON pm.id = cp.payment_method_id
      LEFT JOIN appointments a ON a.customer_package_id = cp.id AND a.deleted_at IS NULL
      WHERE ${where.join(' AND ')}
      GROUP BY cp.id, t.name, t.whatsapp, pt.name, p.name, pm.name
      ORDER BY cp.created_at DESC
      LIMIT 200
    `, params);
    res.json({ items: result.rows.map(sanitizeCustomerPackage) });
  } catch (error) { next(error); }
});


app.get('/api/pacotes/clientes/:id', requireAuth, async (req, res, next) => {
  try {
    await refreshCustomerPackageProgress(req.params.id, { allowRenew: true });
    const result = await query(`
      SELECT cp.*, t.name AS tutor_name, t.whatsapp AS tutor_whatsapp, pt.name AS pet_name, p.name AS package_name, pm.name AS payment_method_name,
             COUNT(a.id)::int AS appointment_count,
             (array_agg(a.id ORDER BY a.starts_at ASC) FILTER (WHERE a.id IS NOT NULL))[1] AS first_appointment_id
      FROM customer_packages cp
      INNER JOIN tutors t ON t.id = cp.tutor_id
      LEFT JOIN pets pt ON pt.id = cp.pet_id
      INNER JOIN packages p ON p.id = cp.package_id
      LEFT JOIN payment_methods pm ON pm.id = cp.payment_method_id
      LEFT JOIN appointments a ON a.customer_package_id = cp.id AND a.deleted_at IS NULL
      WHERE cp.id = $1::uuid AND cp.deleted_at IS NULL
      GROUP BY cp.id, t.name, t.whatsapp, pt.name, p.name, pm.name
      LIMIT 1
    `, [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Pacote vendido não encontrado.' });
    const services = await query(`
      SELECT pi.service_id, s.name AS service_name, pi.quantity, s.price_cents, s.duration_minutes, ps.name AS pet_size_name, sc.name AS category_name
      FROM customer_packages cp
      INNER JOIN package_items pi ON pi.package_id = cp.package_id
      INNER JOIN services s ON s.id = pi.service_id
      LEFT JOIN pet_sizes ps ON ps.code = s.pet_size
      LEFT JOIN service_categories sc ON sc.id = s.category_id
      WHERE cp.id = $1::uuid
      ORDER BY sc.sort_order ASC NULLS LAST, s.name ASC
    `, [req.params.id]);
    const appointments = await query(`
      SELECT id, starts_at, ends_at, status, total_cents, package_session_number, package_total_sessions, package_session_label
      FROM appointments
      WHERE customer_package_id = $1::uuid AND deleted_at IS NULL
      ORDER BY starts_at ASC
      LIMIT 120
    `, [req.params.id]);
    res.json({
      item: sanitizeCustomerPackage(result.rows[0]),
      services: services.rows.map((row) => ({ serviceId: row.service_id, serviceName: row.service_name, quantity: Number(row.quantity || 1), priceCents: Number(row.price_cents || 0), durationMinutes: Number(row.duration_minutes || 0), petSizeName: row.pet_size_name, categoryName: row.category_name })),
      appointments: appointments.rows.map((row) => ({ id: row.id, startsAt: row.starts_at, endsAt: row.ends_at, status: row.status, totalCents: Number(row.total_cents || 0), packageSessionNumber: row.package_session_number, packageTotalSessions: row.package_total_sessions, packageSessionLabel: row.package_session_label, commandUrl: `/documentos/pacote-comanda/${req.params.id}` }))
    });
  } catch (error) { next(error); }
});

app.post('/api/pacotes', requireAuth, async (req, res, next) => {
  try {
    const name = cleanText(req.body?.name);
    const description = cleanText(req.body?.description);
    const petSize = cleanText(req.body?.petSize) || 'todos';
    const sessionsCount = Math.max(1, Number.parseInt(req.body?.sessionsCount || '4', 10));
    const appointmentsPerMonth = Math.max(1, Number.parseInt(req.body?.appointmentsPerMonth || '4', 10));
    const discountPercent = parsePercent(req.body?.discountPercent, 0);
    const serviceItems = Array.isArray(req.body?.services) ? req.body.services : [];
    if (!name) return res.status(400).json({ error: 'Informe o nome do pacote.' });
    if (!serviceItems.length) return res.status(400).json({ error: 'Selecione ao menos um serviço para o pacote.' });
    const packageTotals = await calculatePackageTotals(serviceItems, discountPercent);
    if (!packageTotals.items.length) return res.status(400).json({ error: 'Selecione serviços ativos e válidos para calcular o pacote.' });
    const priceCents = packageTotals.totalCents;
    await query('BEGIN');
    const created = await query(`
      INSERT INTO packages (name, description, pet_size, sessions_count, appointments_per_month, discount_percent, price_cents, is_active)
      VALUES ($1::text, $2::text, $3::text, $4::integer, $5::integer, $6::numeric, $7::integer, $8::boolean)
      ON CONFLICT (name) DO UPDATE
      SET description=EXCLUDED.description, pet_size=EXCLUDED.pet_size, sessions_count=EXCLUDED.sessions_count, appointments_per_month=EXCLUDED.appointments_per_month,
          discount_percent=EXCLUDED.discount_percent, price_cents=EXCLUDED.price_cents, is_active=EXCLUDED.is_active, deleted_at=NULL, updated_at=NOW()
      RETURNING id
    `, [name, description, petSize, sessionsCount, appointmentsPerMonth, discountPercent, priceCents, parseBool(req.body?.isActive, true)]);
    const packageId = created.rows[0].id;
    await query('DELETE FROM package_items WHERE package_id = $1::uuid', [packageId]);
    for (const item of packageTotals.items) {
      await query(`INSERT INTO package_items (package_id, service_id, quantity) VALUES ($1::uuid, $2::uuid, $3::integer) ON CONFLICT (package_id, service_id) DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = NOW()`, [packageId, item.serviceId, item.quantity]);
    }
    await query('COMMIT');
    const pack = await getPackageById(packageId);
    res.status(201).json({ package: sanitizePackage(pack), message: 'Pacote salvo com sucesso.' });
  } catch (error) { try { await query('ROLLBACK'); } catch {} next(error); }
});

app.put('/api/pacotes/:id', requireAuth, async (req, res, next) => {
  try {
    const current = await getPackageById(req.params.id);
    if (!current) return res.status(404).json({ error: 'Pacote não encontrado.' });
    const name = cleanText(req.body?.name);
    const petSize = cleanText(req.body?.petSize) || 'todos';
    const serviceItems = Array.isArray(req.body?.services) ? req.body.services : [];
    if (!name) return res.status(400).json({ error: 'Informe o nome do pacote.' });
    if (!serviceItems.length) return res.status(400).json({ error: 'Selecione ao menos um serviço para o pacote.' });
    const discountPercent = parsePercent(req.body?.discountPercent, 0);
    const packageTotals = await calculatePackageTotals(serviceItems, discountPercent);
    if (!packageTotals.items.length) return res.status(400).json({ error: 'Selecione serviços ativos e válidos para calcular o pacote.' });
    const priceCents = packageTotals.totalCents;
    await query('BEGIN');
    await query(`
      UPDATE packages
      SET name=$2::text, description=$3::text, pet_size=$4::text, sessions_count=$5::integer, appointments_per_month=$6::integer, discount_percent=$7::numeric, price_cents=$8::integer, is_active=$9::boolean, updated_at=NOW()
      WHERE id=$1::uuid AND deleted_at IS NULL
    `, [req.params.id, name, cleanText(req.body?.description), petSize, Math.max(1, Number.parseInt(req.body?.sessionsCount || '4', 10)), Math.max(1, Number.parseInt(req.body?.appointmentsPerMonth || '4', 10)), discountPercent, priceCents, parseBool(req.body?.isActive, true)]);
    await query('DELETE FROM package_items WHERE package_id = $1::uuid', [req.params.id]);
    for (const item of packageTotals.items) {
      await query(`INSERT INTO package_items (package_id, service_id, quantity) VALUES ($1::uuid, $2::uuid, $3::integer) ON CONFLICT (package_id, service_id) DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = NOW()`, [req.params.id, item.serviceId, item.quantity]);
    }
    await query('COMMIT');
    const pack = await getPackageById(req.params.id);
    res.json({ package: sanitizePackage(pack), message: 'Pacote atualizado.' });
  } catch (error) { try { await query('ROLLBACK'); } catch {} next(error); }
});

app.delete('/api/pacotes/:id', requireAuth, async (req, res, next) => {
  try {
    const result = await query(`UPDATE packages SET is_active=FALSE, deleted_at=NOW(), updated_at=NOW() WHERE id=$1::uuid AND deleted_at IS NULL RETURNING id`, [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Pacote não encontrado.' });
    res.json({ ok: true, message: 'Pacote inativado.' });
  } catch (error) { next(error); }
});


app.post('/api/pacotes/clientes/historical', requireAuth, async (req, res, next) => {
  let historicalPackageLockClient = null;
  let historicalPackageLockKey = '';
  try {
    const tutorId = cleanText(req.body?.tutorId);
    const petId = cleanText(req.body?.petId);
    const packageId = cleanText(req.body?.packageId);
    // No fluxo "Pacote Antigo", a data escolhida pelo admin é a data do 1º agendamento do pacote,
    // mesmo quando ela for futura. Não usar "hoje" nem reconstruir ciclos antes dessa data.
    const startsOn = normalizeDateOnly(req.body?.firstAppointmentDate)
      || normalizeDateOnly(req.body?.scheduleStartsOn)
      || normalizeDateOnly(req.body?.startsOn)
      || new Date().toISOString().slice(0, 10);
    const firstTime = cleanText(req.body?.firstTime) || cleanText(req.body?.startsAtTime) || cleanText(req.body?.time) || '09:00';
    const totalSessionsRaw = Number.parseInt(req.body?.totalSessions || '0', 10);
    const totalSessions = Number.isFinite(totalSessionsRaw) && totalSessionsRaw > 0 ? totalSessionsRaw : 0;
    const amountCents = Math.max(0, Number.parseInt(req.body?.amountCents || '0', 10));
    const paymentStatus = cleanText(req.body?.paymentStatus) || 'paid';
    const paymentMethodId = cleanText(req.body?.paymentMethodId);
    const notes = cleanText(req.body?.notes);
    const recurring = parseBool(req.body?.recurring, false);
    const clientRequestId = cleanText(req.body?.clientRequestId);
    if (!tutorId || !petId || !packageId) return res.status(400).json({ error: 'Selecione tutor, pet e pacote.' });
    if (amountCents <= 0) return res.status(400).json({ error: 'Informe manualmente o valor final pago do pacote antigo.' });
    const pack = await query('SELECT * FROM packages WHERE id=$1::uuid AND deleted_at IS NULL LIMIT 1', [packageId]);
    if (!pack.rowCount) return res.status(404).json({ error: 'Pacote não encontrado.' });
    if (paymentMethodId) {
      const methodExists = await query('SELECT id FROM payment_methods WHERE id=$1::uuid AND deleted_at IS NULL LIMIT 1', [paymentMethodId]);
      if (!methodExists.rowCount) return res.status(400).json({ error: 'Forma de pagamento inválida.' });
    }
    const packageRow = pack.rows[0];
    const sessions = Math.max(1, totalSessions || Number(packageRow.sessions_count || 1));
    const finalAmount = amountCents;
    const perMonth = Number(packageRow.appointments_per_month || 4);
    const intervalDays = resolvePackageIntervalDays({ totalSessions: sessions, appointmentsPerMonth: perMonth });
    const computedUsedSessions = Array.from({ length: sessions }).filter((_, idx) => {
      const sessionDate = addDaysToDateString(startsOn, idx * intervalDays);
      const sessionStartsAt = saoPauloLocalToIso(sessionDate, firstTime || '09:00');
      const d = sessionStartsAt ? new Date(sessionStartsAt) : new Date(`${sessionDate}T${firstTime || '09:00'}:00`);
      return d.getTime() < Date.now();
    }).length;
    const usedSessions = Math.min(computedUsedSessions, sessions);
    const firstSessionIso = saoPauloLocalToIso(startsOn, firstTime || '09:00');
    const firstSessionIsFuture = firstSessionIso ? new Date(firstSessionIso).getTime() > Date.now() : false;
    const status = recurring ? 'active' : (usedSessions >= sessions ? 'finished' : 'active');
    const duplicateLockKey = `historical-package:${tutorId}:${petId}:${packageId}:${startsOn}:${firstTime}:${sessions}:${finalAmount}`;
    await query('BEGIN');
    historicalPackageLockKey = duplicateLockKey;
    if (pool) {
      historicalPackageLockClient = await pool.connect();
      await historicalPackageLockClient.query('SELECT pg_advisory_lock(hashtext($1::text))', [historicalPackageLockKey]);
    }
    const duplicate = await query(`
      SELECT cp.*, t.name AS tutor_name, t.whatsapp AS tutor_whatsapp, pt.name AS pet_name, p.name AS package_name, pm.name AS payment_method_name,
             COUNT(a.id)::int AS appointment_count,
             (array_agg(a.id ORDER BY a.starts_at ASC) FILTER (WHERE a.id IS NOT NULL))[1] AS first_appointment_id
      FROM customer_packages cp
      INNER JOIN tutors t ON t.id = cp.tutor_id
      LEFT JOIN pets pt ON pt.id = cp.pet_id
      INNER JOIN packages p ON p.id = cp.package_id
      LEFT JOIN payment_methods pm ON pm.id = cp.payment_method_id
      LEFT JOIN appointments a ON a.customer_package_id = cp.id AND a.deleted_at IS NULL
      WHERE cp.deleted_at IS NULL
        AND cp.tutor_id = $1::uuid
        AND cp.pet_id = $2::uuid
        AND cp.package_id = $3::uuid
        AND cp.starts_on = $4::date
        AND cp.total_sessions = $5::integer
        AND cp.amount_cents = $6::integer
        AND COALESCE((cp.recurrence_rule->>'historicalImport')::boolean, FALSE) = TRUE
        AND (
          ($7::text <> '' AND cp.recurrence_rule->>'clientRequestId' = $7::text)
          OR cp.created_at >= NOW() - INTERVAL '5 minutes'
        )
      GROUP BY cp.id, t.name, t.whatsapp, pt.name, p.name, pm.name
      ORDER BY cp.created_at DESC
      LIMIT 1
    `, [tutorId, petId, packageId, startsOn, sessions, finalAmount, clientRequestId || '']);
    if (duplicate.rowCount) {
      await query('COMMIT');
      await releaseAdvisoryLock(historicalPackageLockClient, historicalPackageLockKey);
      historicalPackageLockClient = null;
      return res.status(200).json({
        duplicatePrevented: true,
        customerPackage: sanitizeCustomerPackage(duplicate.rows[0]),
        generatedAppointments: { created: 0, totalSessions: sessions, finishedSessions: Number(duplicate.rows[0].used_sessions || usedSessions), firstTime, intervalDays, recurring: Boolean(duplicate.rows[0].recurring || duplicate.rows[0].recurrence_rule?.enabled) },
        message: 'Pacote antigo já havia sido importado. Duplicidade evitada.'
      });
    }
    const sold = await query(`
      INSERT INTO customer_packages (tutor_id, pet_id, package_id, status, starts_on, ends_on, total_sessions, used_sessions, amount_cents, payment_status, payment_method_id, recurring, current_cycle_started_on, recurrence_rule, created_at, updated_at)
      VALUES ($1::uuid, NULLIF($2::text,'')::uuid, $3::uuid, $4::text, $5::date, ($5::date + (($12::integer - 1) * $13::integer || ' days')::interval)::date, $6::integer, $7::integer, $8::integer, $9::text, NULLIF($10::text,'')::uuid, $15::boolean, $5::date, jsonb_build_object('enabled', $15::boolean, 'historicalImport', true, 'notes', $11::text, 'firstTime', $14::text, 'appointmentsPerMonth', $16::integer, 'intervalDays', $13::integer, 'reconstructedHistory', true, 'startsFromSelectedDate', true, 'firstAppointmentDate', $5::text, 'autoRenewUntilCancelled', $15::boolean, 'clientRequestId', NULLIF($17::text, '')), NOW(), NOW())
      RETURNING *
    `, [tutorId, petId || '', packageId, status, startsOn, sessions, usedSessions, finalAmount, paymentStatus, paymentMethodId || '', notes, sessions, intervalDays, firstTime, recurring, perMonth, clientRequestId || '']);
    let generated = { created: 0, totalSessions: sessions, finishedSessions: usedSessions, firstTime, intervalDays, recurring };
    if (petId) {
      generated = await generateAppointmentsForCustomerPackage(sold.rows[0].id, { startsOn, firstTime, historicalImport: true });
      generated.recurring = recurring;
      generated.finishedSessions = usedSessions;
      if (recurring) {
        // Se o 1º agendamento escolhido ainda está no futuro, o pacote antigo deve apenas gerar
        // 1 de N, 2 de N... a partir dessa data. A renovação automática só pode acontecer depois
        // que a última sessão do ciclo for finalizada.
        const renewalProgress = firstSessionIsFuture
          ? { renewed: false, usedSessions }
          : await refreshCustomerPackageProgress(sold.rows[0].id, { allowRenew: true });
        generated.finishedSessions = Number(renewalProgress?.usedSessions ?? usedSessions);
        generated.renewed = Boolean(renewalProgress?.renewed);
        generated.firstAppointmentDate = startsOn;
        generated.startsOn = startsOn;
        generated.newCustomerPackageId = renewalProgress?.newCustomerPackageId || null;
        generated.nextStart = renewalProgress?.nextStart || null;
        generated.renewedCycles = renewalProgress?.renewed ? 1 : 0;
        generated.created = Number(generated.created || 0) + Number(renewalProgress?.generatedAppointments?.created || 0);
        if (renewalProgress?.renewed) {
          sold.rows[0].status = 'finished';
          sold.rows[0].recurring = false;
          sold.rows[0].used_sessions = sessions;
        } else {
          sold.rows[0].status = 'active';
          sold.rows[0].recurring = true;
          sold.rows[0].used_sessions = generated.finishedSessions;
        }
      } else {
        const progress = await refreshCustomerPackageProgress(sold.rows[0].id, { allowRenew: false });
        if (progress) {
          sold.rows[0].used_sessions = progress.usedSessions ?? progress.used_sessions ?? sold.rows[0].used_sessions;
          generated.finishedSessions = Number(sold.rows[0].used_sessions || usedSessions);
        }
      }
    }
    await query(`
      INSERT INTO financial_transactions (tutor_id, customer_package_id, type, category, description, amount_cents, due_date, status, paid_at, created_at, updated_at)
      VALUES ($1::uuid, $2::uuid, 'income', 'pacote_antigo', $3::text, $4::integer, $5::date, $6::text, CASE WHEN $6::text='paid' THEN $5::date ELSE NULL END, $5::date, NOW())
      ON CONFLICT DO NOTHING
    `, [tutorId, sold.rows[0].id, `Pacote antigo · ${packageRow.name} · ${Number(sold.rows[0].used_sessions || usedSessions)}/${sessions} sessões usadas automaticamente`, finalAmount, startsOn, paymentStatus === 'paid' ? 'paid' : 'pending']);
    if (paymentStatus === 'paid') {
      const tx = await query(`SELECT id, amount_cents FROM financial_transactions WHERE customer_package_id=$1::uuid AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`, [sold.rows[0].id]);
      if (tx.rows[0]) await query(`INSERT INTO payments (financial_transaction_id, payment_method_id, amount_cents, paid_at, notes) VALUES ($1::uuid, NULLIF($2::text,'')::uuid, $3::integer, $4::date, 'Pagamento histórico de pacote') ON CONFLICT DO NOTHING`, [tx.rows[0].id, paymentMethodId || '', Number(tx.rows[0].amount_cents || finalAmount), startsOn]);
    }
    await query('COMMIT');
    await releaseAdvisoryLock(historicalPackageLockClient, historicalPackageLockKey);
    historicalPackageLockClient = null;
    res.status(201).json({ customerPackage: sanitizeCustomerPackage({ ...sold.rows[0], package_name: packageRow.name }), generatedAppointments: generated, message: recurring ? 'Pacote antigo importado com recorrência automática e histórico reconstruído.' : 'Pacote antigo importado com histórico reconstruído.' });
  } catch (error) {
    try { await query('ROLLBACK'); } catch {}
    await releaseAdvisoryLock(historicalPackageLockClient, historicalPackageLockKey);
    next(error);
  }
});

app.post('/api/pacotes/clientes', requireAuth, async (req, res, next) => {
  try {
    const tutorId = cleanText(req.body?.tutorId);
    const petId = cleanText(req.body?.petId);
    const packageId = cleanText(req.body?.packageId);
    const startsOn = cleanText(req.body?.startsOn) || new Date().toISOString().slice(0, 10);
    const firstTime = cleanText(req.body?.firstTime) || '09:00';
    const generateAppointments = parseBool(req.body?.generateAppointments, true);
    const recurring = parseBool(req.body?.recurring, false);
    const paymentMethodId = cleanText(req.body?.paymentMethodId);
    if (!tutorId || !packageId) return res.status(400).json({ error: 'Selecione tutor e pacote.' });
    const pack = await query('SELECT * FROM packages WHERE id=$1::uuid AND deleted_at IS NULL AND is_active=TRUE LIMIT 1', [packageId]);
    if (!pack.rowCount) return res.status(404).json({ error: 'Pacote ativo não encontrado.' });
    if (paymentMethodId) {
      const methodExists = await query('SELECT id FROM payment_methods WHERE id=$1::uuid AND deleted_at IS NULL AND is_active=TRUE LIMIT 1', [paymentMethodId]);
      if (!methodExists.rowCount) return res.status(400).json({ error: 'Forma de pagamento inválida.' });
    }
    const packageRow = pack.rows[0];
    const perMonth = Number(packageRow.appointments_per_month || 4);
    const packageSessions = Number(packageRow.sessions_count || 1);
    const intervalDays = resolvePackageIntervalDays({ totalSessions: packageSessions, appointmentsPerMonth: perMonth });
    await query('BEGIN');
    const sold = await query(`
      INSERT INTO customer_packages (tutor_id, pet_id, package_id, status, starts_on, ends_on, total_sessions, used_sessions, amount_cents, payment_status, payment_method_id, recurring, current_cycle_started_on, recurrence_rule)
      VALUES ($1::uuid, NULLIF($2::text,'')::uuid, $3::uuid, 'active', $4::date, ($4::date + (($5::integer - 1) * $6::integer || ' days')::interval)::date, $5::integer, 0, $7::integer, $8::text, NULLIF($9::text,'')::uuid, $10::boolean, $4::date, jsonb_build_object('enabled', $10::boolean, 'appointmentsPerMonth', $11::integer, 'intervalDays', $6::integer, 'firstTime', $12::text))
      RETURNING *
    `, [tutorId, petId || '', packageId, startsOn, packageSessions, intervalDays, Number(packageRow.price_cents || 0), cleanText(req.body?.paymentStatus) || 'pending', paymentMethodId || '', recurring, perMonth, firstTime]);
    await query(`
      INSERT INTO financial_transactions (tutor_id, customer_package_id, type, category, description, amount_cents, due_date, status)
      VALUES ($1::uuid, $2::uuid, 'income', 'pacote', $3::text, $4::integer, $5::date, $6::text)
      ON CONFLICT DO NOTHING
    `, [tutorId, sold.rows[0].id, `Pacote ${packageRow.name} · ${Number(packageRow.sessions_count || 1)} sessões`, Number(packageRow.price_cents || 0), startsOn, cleanText(req.body?.paymentStatus) === 'paid' ? 'paid' : 'pending']);
    if (cleanText(req.body?.paymentStatus) === 'paid') {
      const tx = await query(`UPDATE financial_transactions SET paid_at=COALESCE(paid_at, NOW()), updated_at=NOW() WHERE customer_package_id=$1::uuid AND deleted_at IS NULL RETURNING id, amount_cents`, [sold.rows[0].id]);
      if (tx.rows[0]) {
        await query(`INSERT INTO payments (financial_transaction_id, payment_method_id, amount_cents, paid_at, notes) VALUES ($1::uuid, NULLIF($2::text,'')::uuid, $3::integer, NOW(), 'Pagamento do pacote') ON CONFLICT DO NOTHING`, [tx.rows[0].id, paymentMethodId || '', Number(tx.rows[0].amount_cents || packageRow.price_cents || 0)]);
      }
    }

    if (generateAppointments && petId) {
      await generateAppointmentsForCustomerPackage(sold.rows[0].id, { startsOn, firstTime });
    }
    await query('COMMIT');
    res.status(201).json({ customerPackage: sanitizeCustomerPackage({ ...sold.rows[0], package_name: packageRow.name }), message: generateAppointments ? 'Pacote vendido e agenda gerada.' : 'Pacote vendido com sucesso.' });
  } catch (error) { try { await query('ROLLBACK'); } catch {} next(error); }
});


app.patch('/api/pacotes/clientes/:id/payment', requireAuth, async (req, res, next) => {
  try {
    const paymentStatus = cleanText(req.body?.paymentStatus) || 'pending';
    const paymentMethodId = cleanText(req.body?.paymentMethodId);
    const statusExists = await query('SELECT code FROM payment_statuses WHERE code=$1::text AND deleted_at IS NULL AND is_active=TRUE LIMIT 1', [paymentStatus]);
    if (!statusExists.rowCount && !['pending','paid','overdue','canceled'].includes(paymentStatus)) return res.status(400).json({ error: 'Status de pagamento inválido.' });
    if (paymentMethodId) {
      const methodExists = await query('SELECT id FROM payment_methods WHERE id=$1::uuid AND deleted_at IS NULL AND is_active=TRUE LIMIT 1', [paymentMethodId]);
      if (!methodExists.rowCount) return res.status(400).json({ error: 'Forma de pagamento inválida.' });
    }
    await query('BEGIN');
    const updated = await query(`
      UPDATE customer_packages
      SET payment_status=$2::text, payment_method_id=NULLIF($3::text,'')::uuid, updated_at=NOW()
      WHERE id=$1::uuid AND deleted_at IS NULL
      RETURNING *
    `, [req.params.id, paymentStatus, paymentMethodId || '']);
    if (!updated.rowCount) {
      await query('ROLLBACK');
      return res.status(404).json({ error: 'Pacote do cliente não encontrado.' });
    }
    await query(`UPDATE appointments SET payment_status=$2::text, payment_method_id=NULLIF($3::text,'')::uuid, updated_at=NOW() WHERE customer_package_id=$1::uuid AND deleted_at IS NULL`, [req.params.id, paymentStatus, paymentMethodId || '']);
    const tx = await query(`
      UPDATE financial_transactions
      SET status=$2::text,
          paid_at = CASE WHEN $2::text = 'paid' THEN COALESCE(paid_at, NOW()) ELSE NULL END,
          updated_at=NOW()
      WHERE customer_package_id=$1::uuid AND deleted_at IS NULL
      RETURNING id, amount_cents
    `, [req.params.id, paymentStatus]);
    if (paymentStatus === 'paid' && tx.rows[0]) {
      const existing = await query('SELECT id FROM payments WHERE financial_transaction_id=$1::uuid LIMIT 1', [tx.rows[0].id]);
      if (existing.rows[0]) {
        await query(`UPDATE payments SET payment_method_id=NULLIF($2::text,'')::uuid, amount_cents=$3::integer, updated_at=NOW() WHERE id=$1::uuid`, [existing.rows[0].id, paymentMethodId || '', Number(tx.rows[0].amount_cents || 0)]);
      } else {
        await query(`INSERT INTO payments (financial_transaction_id, payment_method_id, amount_cents, paid_at, notes) VALUES ($1::uuid, NULLIF($2::text,'')::uuid, $3::integer, NOW(), 'Pagamento do pacote')`, [tx.rows[0].id, paymentMethodId || '', Number(tx.rows[0].amount_cents || 0)]);
      }
    }
    await query('COMMIT');
    res.json({ item: sanitizeCustomerPackage(updated.rows[0]), message: 'Pagamento do pacote atualizado.' });
  } catch (error) { try { await query('ROLLBACK'); } catch {} next(error); }
});

app.patch('/api/pacotes/clientes/:id/status', requireAuth, async (req, res, next) => {
  try {
    const status = cleanText(req.body?.status) || 'active';
    const result = await query(`
      UPDATE customer_packages
      SET status=$2::text,
          recurring = CASE WHEN $2::text IN ('cancelled','canceled') THEN FALSE ELSE recurring END,
          recurrence_rule = CASE WHEN $2::text IN ('cancelled','canceled') THEN COALESCE(recurrence_rule, '{}'::jsonb) || jsonb_build_object('enabled', false, 'cancelledAt', NOW()::text) ELSE recurrence_rule END,
          updated_at=NOW()
      WHERE id=$1::uuid AND deleted_at IS NULL
      RETURNING *
    `, [req.params.id, status]);
    if (!result.rowCount) return res.status(404).json({ error: 'Pacote do cliente não encontrado.' });
    res.json({ item: sanitizeCustomerPackage(result.rows[0]), message: 'Status do pacote atualizado.' });
  } catch (error) { next(error); }
});


app.delete('/api/pacotes/clientes/:id', requireAuth, async (req, res, next) => {
  try {
    await query('BEGIN');
    const current = await query(`
      SELECT cp.*, p.name AS package_name
      FROM customer_packages cp
      LEFT JOIN packages p ON p.id = cp.package_id
      WHERE cp.id=$1::uuid AND cp.deleted_at IS NULL
      LIMIT 1
    `, [req.params.id]);
    if (!current.rowCount) {
      await query('ROLLBACK');
      return res.status(404).json({ error: 'Pacote vendido não encontrado.' });
    }
    const updated = await query(`
      UPDATE customer_packages
      SET status='cancelled',
          recurring=FALSE,
          recurrence_rule = COALESCE(recurrence_rule, '{}'::jsonb) || jsonb_build_object('enabled', false, 'deletedAt', NOW()::text, 'deletedBy', 'admin'),
          deleted_at=NOW(),
          updated_at=NOW()
      WHERE id=$1::uuid AND deleted_at IS NULL
      RETURNING *
    `, [req.params.id]);
    await query(`
      UPDATE appointments
      SET status = CASE WHEN status IN ('finalizado','completed','paid') THEN status ELSE 'cancelled' END,
          deleted_at = CASE WHEN status IN ('finalizado','completed','paid') THEN deleted_at ELSE COALESCE(deleted_at, NOW()) END,
          updated_at=NOW()
      WHERE customer_package_id=$1::uuid
        AND deleted_at IS NULL
        AND COALESCE(starts_at, NOW()) >= (NOW() - INTERVAL '1 day')
    `, [req.params.id]);
    await query(`
      UPDATE financial_transactions
      SET description = COALESCE(description, 'Pacote vendido') || ' · pacote vendido excluído do operacional',
          updated_at=NOW()
      WHERE customer_package_id=$1::uuid AND deleted_at IS NULL AND status='paid'
    `, [req.params.id]);
    await query(`
      UPDATE financial_transactions
      SET status='cancelled', deleted_at=COALESCE(deleted_at, NOW()), updated_at=NOW()
      WHERE customer_package_id=$1::uuid AND deleted_at IS NULL AND COALESCE(status,'pending') <> 'paid'
    `, [req.params.id]);
    await query('COMMIT');
    res.json({ item: sanitizeCustomerPackage(updated.rows[0]), message: 'Pacote vendido excluído com sucesso.' });
  } catch (error) { try { await query('ROLLBACK'); } catch {} next(error); }
});

app.get('/api/assinaturas', requireAuth, async (req, res, next) => {
  try {
    const status = cleanText(req.query.status) || 'all';
    const params = [];
    const where = ['s.deleted_at IS NULL'];
    if (status !== 'all') { params.push(status); where.push(`s.status = $${params.length}::text`); }
    const result = await query(`
      SELECT s.*, t.name AS tutor_name, t.whatsapp AS tutor_whatsapp, p.name AS pet_name, pk.name AS package_name
      FROM subscriptions s
      INNER JOIN tutors t ON t.id = s.tutor_id
      LEFT JOIN pets p ON p.id = s.pet_id
      LEFT JOIN packages pk ON pk.id = s.package_id
      WHERE ${where.join(' AND ')}
      ORDER BY s.status = 'active' DESC, s.next_billing_on ASC NULLS LAST, s.created_at DESC
      LIMIT 200
    `, params);
    const summary = await query(`
      SELECT COUNT(*) FILTER (WHERE deleted_at IS NULL)::int AS total,
             COUNT(*) FILTER (WHERE deleted_at IS NULL AND status='active')::int AS active,
             COALESCE(SUM(amount_cents) FILTER (WHERE deleted_at IS NULL AND status='active'),0)::int AS monthly_recurring_cents
      FROM subscriptions
    `);
    res.json({ items: result.rows.map(sanitizeSubscription), summary: summary.rows[0] || {} });
  } catch (error) { next(error); }
});

app.post('/api/assinaturas', requireAuth, async (req, res, next) => {
  try {
    const tutorId = cleanText(req.body?.tutorId);
    const petId = cleanText(req.body?.petId);
    const packageId = cleanText(req.body?.packageId);
    const name = cleanText(req.body?.name);
    if (!tutorId || !name) return res.status(400).json({ error: 'Informe tutor e nome da assinatura.' });
    const amountCents = moneyToCents(req.body?.amountCents ?? req.body?.amount);
    const result = await query(`
      INSERT INTO subscriptions (tutor_id, pet_id, package_id, name, status, recurrence, amount_cents, starts_on, next_billing_on, payment_method, notes)
      VALUES ($1::uuid, NULLIF($2::text,'')::uuid, NULLIF($3::text,'')::uuid, $4::text, $5::text, $6::text, $7::integer, $8::date, NULLIF($9::text,'')::date, $10::text, $11::text)
      RETURNING *
    `, [tutorId, petId || '', packageId || '', name, cleanText(req.body?.status) || 'active', cleanText(req.body?.recurrence) || 'monthly', amountCents, cleanText(req.body?.startsOn) || new Date().toISOString().slice(0,10), cleanText(req.body?.nextBillingOn) || '', cleanText(req.body?.paymentMethod), cleanText(req.body?.notes)]);
    res.status(201).json({ subscription: sanitizeSubscription(result.rows[0]), message: 'Assinatura criada.' });
  } catch (error) { next(error); }
});

app.put('/api/assinaturas/:id', requireAuth, async (req, res, next) => {
  try {
    const result = await query(`
      UPDATE subscriptions
      SET name=$2::text, status=$3::text, recurrence=$4::text, amount_cents=$5::integer, starts_on=$6::date, next_billing_on=NULLIF($7::text,'')::date, payment_method=$8::text, notes=$9::text, updated_at=NOW()
      WHERE id=$1::uuid AND deleted_at IS NULL
      RETURNING *
    `, [req.params.id, cleanText(req.body?.name), cleanText(req.body?.status) || 'active', cleanText(req.body?.recurrence) || 'monthly', moneyToCents(req.body?.amountCents ?? req.body?.amount), cleanText(req.body?.startsOn) || new Date().toISOString().slice(0,10), cleanText(req.body?.nextBillingOn) || '', cleanText(req.body?.paymentMethod), cleanText(req.body?.notes)]);
    if (!result.rowCount) return res.status(404).json({ error: 'Assinatura não encontrada.' });
    res.json({ subscription: sanitizeSubscription(result.rows[0]), message: 'Assinatura atualizada.' });
  } catch (error) { next(error); }
});

app.delete('/api/assinaturas/:id', requireAuth, async (req, res, next) => {
  try {
    const result = await query(`UPDATE subscriptions SET status='canceled', deleted_at=NOW(), updated_at=NOW() WHERE id=$1::uuid AND deleted_at IS NULL RETURNING id`, [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Assinatura não encontrada.' });
    res.json({ ok: true, message: 'Assinatura cancelada.' });
  } catch (error) { next(error); }
});



function buildDocumentNumber(prefix = 'REC') {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  return `${prefix}-${stamp}-${Math.random().toString(16).slice(2, 6).toUpperCase()}`;
}

function normalizeReceiptPayload(row = {}) {
  return {
    id: row.id,
    appointmentId: row.appointment_id,
    paymentId: row.payment_id,
    publicToken: row.public_token,
    documentNumber: row.document_number,
    subtotalCents: Number(row.subtotal_cents || 0),
    discountCents: Number(row.discount_cents || 0),
    totalCents: Number(row.total_cents || 0),
    payload: row.payload || {},
    issuedAt: row.issued_at,
    publicUrl: row.public_token ? `/public/recibos/${row.public_token}` : null,
    printUrl: row.public_token ? `/documentos/recibo/${row.public_token}` : null
  };
}

async function getBusinessDocumentPayload() {
  const fallback = {
    name: 'PetFunny - Banho e Tosa',
    legalName: 'PetFunny - Banho e Tosa',
    document: '',
    whatsapp: '5516981535338',
    city: 'Ribeirão Preto',
    state: 'SP',
    address: '',
    email: '',
    instagram: ''
  };

  try {
    const result = await query(`
      SELECT *
      FROM business_settings
      ORDER BY created_at ASC
      LIMIT 1
    `);

    const row = result.rows[0];
    if (!row) return fallback;

    const addressParts = [
      row.address_street,
      row.address_number,
      row.address_neighborhood,
      row.address_city,
      row.address_state
    ].filter(Boolean);

    return {
      name: row.business_name || fallback.name,
      legalName: row.legal_name || row.business_name || fallback.legalName,
      document: row.document_number || fallback.document,
      whatsapp: row.whatsapp || fallback.whatsapp,
      city: row.address_city || fallback.city,
      state: row.address_state || fallback.state,
      address: addressParts.length ? addressParts.join(', ') : fallback.address,
      email: row.email || fallback.email,
      instagram: row.instagram_url || cleanJsonObject(row.social_links).instagram || fallback.instagram
    };
  } catch (error) {
    console.warn('[documentos] falha ao carregar business_settings; usando fallback PetFunny:', error.message);
    return fallback;
  }
}

async function getAppointmentDocumentData(appointmentId) {
  const appointment = await getAppointmentById(appointmentId);
  if (!appointment) return null;
  const business = await getBusinessDocumentPayload();
  const finance = await query(`
    SELECT ft.*, pay.id AS payment_id, pay.paid_at AS payment_paid_at, pay.amount_cents AS payment_amount_cents, pm.name AS payment_method_name
    FROM financial_transactions ft
    LEFT JOIN payments pay ON pay.financial_transaction_id = ft.id
    LEFT JOIN payment_methods pm ON pm.id = pay.payment_method_id
    WHERE ft.appointment_id = $1::uuid AND ft.deleted_at IS NULL
    ORDER BY pay.paid_at DESC NULLS LAST, ft.created_at DESC
    LIMIT 1
  `, [appointmentId]);
  const payment = finance.rows[0] || null;
  return {
    business,
    appointment: sanitizeAppointment(appointment),
    payment: payment ? sanitizeFinancialTransaction(payment) : null,
    paymentRaw: payment,
    totals: {
      subtotalCents: Number(appointment.subtotal_cents || 0),
      discountPercent: Number(appointment.discount_percent || 0),
      discountCents: Number(appointment.discount_cents || 0),
      totalCents: Number(appointment.total_cents || 0)
    }
  };
}

async function ensureFinancialTransactionForAppointment(appointmentId) {
  const appointment = await getAppointmentById(appointmentId);
  if (!appointment) return null;
  if (Number(appointment.total_cents || 0) <= 0) return null;
  const existing = await query(`
    SELECT id FROM financial_transactions
    WHERE appointment_id=$1::uuid AND deleted_at IS NULL AND type='income'
    ORDER BY created_at DESC
    LIMIT 1
  `, [appointmentId]);
  if (existing.rowCount) return getFinancialTransactionById(existing.rows[0].id);
  const inserted = await query(`
    INSERT INTO financial_transactions (appointment_id, tutor_id, type, category, description, amount_cents, due_date, status)
    VALUES ($1::uuid, $2::uuid, 'income', 'atendimento', $3::text, $4::integer, CURRENT_DATE, 'pending')
    RETURNING id
  `, [appointmentId, appointment.tutor_id, `Atendimento ${appointment.pet_name || ''}`.trim(), Number(appointment.total_cents || 0)]);
  return getFinancialTransactionById(inserted.rows[0].id);
}

async function syncFinancialTransactionWithAppointmentPayment(appointmentId, paymentStatus = 'pending', paymentMethodId = '') {
  const appointment = await getAppointmentById(appointmentId);
  if (!appointment || Number(appointment.total_cents || 0) <= 0) return null;
  const transaction = await ensureFinancialTransactionForAppointment(appointmentId);
  if (!transaction?.id) return null;
  if (paymentStatus === 'paid') {
    await query(`
      UPDATE financial_transactions
      SET status='paid', paid_at=COALESCE(paid_at, NOW()), amount_cents=$2::integer, updated_at=NOW()
      WHERE id=$1::uuid AND deleted_at IS NULL
    `, [transaction.id, Number(appointment.total_cents || 0)]);
    const existingPayment = await query(`
      SELECT id FROM payments
      WHERE financial_transaction_id=$1::uuid
      ORDER BY paid_at DESC, created_at DESC
      LIMIT 1
    `, [transaction.id]);
    let paymentId = existingPayment.rows[0]?.id || null;
    if (paymentId) {
      await query(`
        UPDATE payments
        SET payment_method_id=NULLIF($2::text,'')::uuid, amount_cents=$3::integer, updated_at=NOW()
        WHERE id=$1::uuid
      `, [paymentId, paymentMethodId || appointment.payment_method_id || '', Number(appointment.total_cents || 0)]);
    } else {
      const insertedPayment = await query(`
        INSERT INTO payments (financial_transaction_id, payment_method_id, amount_cents, paid_at, notes)
        VALUES ($1::uuid, NULLIF($2::text,'')::uuid, $3::integer, NOW(), 'Baixa sincronizada pela Agenda')
        RETURNING id
      `, [transaction.id, paymentMethodId || appointment.payment_method_id || '', Number(appointment.total_cents || 0)]);
      paymentId = insertedPayment.rows[0].id;
    }
    await createOrUpdateReceiptForAppointment(appointmentId, paymentId);
    return getFinancialTransactionById(transaction.id);
  }
  await query(`
    UPDATE financial_transactions
    SET status='pending', paid_at=NULL, amount_cents=$2::integer, updated_at=NOW()
    WHERE id=$1::uuid AND deleted_at IS NULL
  `, [transaction.id, Number(appointment.total_cents || 0)]);
  return getFinancialTransactionById(transaction.id);
}

async function createOrUpdateReceiptForAppointment(appointmentId, paymentId = null) {
  const data = await getAppointmentDocumentData(appointmentId);
  if (!data) return null;
  const payload = {
    type: 'receipt',
    business: data.business,
    appointment: data.appointment,
    payment: data.payment,
    totals: data.totals,
    generatedAt: new Date().toISOString()
  };
  const existing = await query('SELECT * FROM receipts WHERE appointment_id=$1::uuid ORDER BY issued_at DESC LIMIT 1', [appointmentId]);
  if (existing.rowCount) {
    const updated = await query(`
      UPDATE receipts
      SET payment_id = COALESCE(NULLIF($2::text,'')::uuid, payment_id), subtotal_cents=$3::integer, discount_cents=$4::integer, total_cents=$5::integer, payload=$6::jsonb, updated_at=NOW()
      WHERE id=$1::uuid
      RETURNING *
    `, [existing.rows[0].id, paymentId || '', data.totals.subtotalCents, data.totals.discountCents, data.totals.totalCents, JSON.stringify(payload)]);
    return normalizeReceiptPayload(updated.rows[0]);
  }
  const created = await query(`
    INSERT INTO receipts (appointment_id, payment_id, document_number, subtotal_cents, discount_cents, total_cents, payload)
    VALUES ($1::uuid, NULLIF($2::text,'')::uuid, $3::text, $4::integer, $5::integer, $6::integer, $7::jsonb)
    RETURNING *
  `, [appointmentId, paymentId || '', buildDocumentNumber('REC'), data.totals.subtotalCents, data.totals.discountCents, data.totals.totalCents, JSON.stringify(payload)]);
  return normalizeReceiptPayload(created.rows[0]);
}

app.get('/api/documentos/appointments', requireAuth, async (req, res, next) => {
  try {
    const search = cleanText(req.query.search);
    const params = [];
    const where = ['a.deleted_at IS NULL'];
    if (search) {
      params.push(`%${search}%`);
      where.push(`(t.name ILIKE $${params.length} OR p.name ILIKE $${params.length} OR t.whatsapp ILIKE $${params.length})`);
    }
    const result = await query(`
      SELECT a.*, t.name AS tutor_name, t.whatsapp AS tutor_whatsapp, p.name AS pet_name, p.size AS pet_size,
             s.name AS status_name, s.color AS status_color,
             COALESCE(string_agg(ai.description, ', ' ORDER BY ai.created_at), '') AS services,
             ft.status AS financial_status,
             r.public_token AS receipt_token,
             r.document_number AS receipt_number
      FROM appointments a
      LEFT JOIN tutors t ON t.id = a.tutor_id
      LEFT JOIN pets p ON p.id = a.pet_id
      LEFT JOIN appointment_statuses s ON s.code = a.status
    LEFT JOIN payment_methods pm ON pm.id = a.payment_method_id
      LEFT JOIN appointment_items ai ON ai.appointment_id = a.id
      LEFT JOIN financial_transactions ft ON ft.appointment_id = a.id AND ft.deleted_at IS NULL
      LEFT JOIN receipts r ON r.appointment_id = a.id
      WHERE ${where.join(' AND ')}
      GROUP BY a.id, t.name, t.whatsapp, p.name, p.size, s.name, s.color, ft.status, r.public_token, r.document_number
      ORDER BY a.starts_at DESC
      LIMIT 120
    `, params);
    res.json({ items: result.rows.map((row) => ({
      ...sanitizeAppointment(row),
      financialStatus: row.financial_status || null,
      receiptToken: row.receipt_token || null,
      receiptNumber: row.receipt_number || null
    })) });
  } catch (error) { next(error); }
});



async function getCustomerPackageDocumentData(customerPackageId) {
  const result = await query(`
    SELECT cp.*, t.name AS tutor_name, t.whatsapp AS tutor_whatsapp, pt.name AS pet_name, pt.size AS pet_size,
           p.name AS package_name, p.description AS package_description, p.discount_percent, p.price_cents AS package_price_cents,
           pm.name AS payment_method_name
    FROM customer_packages cp
    INNER JOIN tutors t ON t.id = cp.tutor_id
    LEFT JOIN pets pt ON pt.id = cp.pet_id
    INNER JOIN packages p ON p.id = cp.package_id
    LEFT JOIN payment_methods pm ON pm.id = cp.payment_method_id
    WHERE cp.id = $1::uuid AND cp.deleted_at IS NULL
    LIMIT 1
  `, [customerPackageId]);
  const row = result.rows[0];
  if (!row) return null;
  const services = await query(`
    SELECT pi.service_id, s.name AS service_name, pi.quantity, s.price_cents, ps.name AS pet_size_name, sc.name AS category_name
    FROM package_items pi
    INNER JOIN services s ON s.id = pi.service_id
    LEFT JOIN pet_sizes ps ON ps.code = s.pet_size
    LEFT JOIN service_categories sc ON sc.id = s.category_id
    WHERE pi.package_id = $1::uuid
    ORDER BY sc.sort_order ASC NULLS LAST, s.name ASC
  `, [row.package_id]);
  const items = services.rows.map((item) => ({
    serviceId: item.service_id,
    description: item.service_name,
    quantity: Number(item.quantity || 1),
    unitPriceCents: Number(item.price_cents || 0),
    totalCents: Number(item.price_cents || 0) * Number(item.quantity || 1),
    petSizeName: item.pet_size_name,
    categoryName: item.category_name
  }));
  const appointments = await query(`
    SELECT id, starts_at, ends_at, status, total_cents, package_session_number, package_total_sessions, package_session_label
    FROM appointments
    WHERE customer_package_id = $1::uuid AND deleted_at IS NULL
    ORDER BY starts_at ASC
    LIMIT 120
  `, [customerPackageId]);
  const appointmentItems = appointments.rows.map((item) => ({
    id: item.id,
    startsAt: item.starts_at,
    endsAt: item.ends_at,
    status: item.status,
    totalCents: Number(item.total_cents || 0),
    packageSessionNumber: item.package_session_number ? Number(item.package_session_number) : null,
    packageTotalSessions: item.package_total_sessions ? Number(item.package_total_sessions) : null,
    packageSessionLabel: item.package_session_label || `${item.package_session_number || ''} de ${item.package_total_sessions || ''}`.trim(),
    commandUrl: `/documentos/pacote-comanda/${customerPackageId}`
  }));
  const subtotalCents = items.reduce((sum, item) => sum + Number(item.totalCents || 0), 0);
  const discountPercent = Number(row.discount_percent || 0);
  const discountCents = Math.round(subtotalCents * (discountPercent / 100));
  const totalCents = Number(row.amount_cents || row.package_price_cents || Math.max(0, subtotalCents - discountCents));
  const business = await getBusinessDocumentPayload();
  return {
    business,
    customerPackage: sanitizeCustomerPackage(row),
    items,
    appointments: appointmentItems,
    totals: {
      subtotalCents,
      discountPercent,
      discountCents,
      totalCents
    },
    generatedAt: new Date().toISOString()
  };
}

function publicPackageDocumentHtml(data, type = 'command') {
  const business = data.business || {};
  const pack = data.customerPackage || {};
  const totals = data.totals || {};
  const items = data.items || [];
  const moneyPublic = (cents = 0) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(cents || 0) / 100);
  const isReceipt = type === 'receipt';
  const title = isReceipt ? 'Recibo do pacote' : 'Comanda do pacote';
  const eyebrow = isReceipt ? 'Recibo oficial do pacote' : 'Comanda consolidada do pacote';
  const description = isReceipt ? 'Pagamento do pacote documentado com todos os serviços inclusos, quantidades e desconto aplicado.' : 'Conferência consolidada de todos os serviços inclusos no pacote antes ou durante a venda.';
  const rows = items.length
    ? items.map(item => `<tr><td>${publicDocEsc(item.description || 'Serviço')}</td><td>${publicDocEsc(item.quantity || 1)}</td><td>${moneyPublic(item.unitPriceCents)}</td><td>${moneyPublic(item.totalCents)}</td></tr>`).join('')
    : '<tr><td colspan="4">Nenhum serviço vinculado ao pacote.</td></tr>';
  const appointmentRows = (data.appointments || []).length
    ? (data.appointments || []).map((item) => {
        const dateText = formatDocumentDateTimePt(item.startsAt, 'Data a confirmar');
        return `<tr><td>${publicDocEsc(item.packageSessionLabel || `${item.packageSessionNumber || ''} de ${item.packageTotalSessions || ''}`)}</td><td>${publicDocEsc(dateText)}</td><td>${publicDocEsc(item.status || 'agendado')}</td><td>${moneyPublic(item.totalCents)}</td></tr>`;
      }).join('')
    : '<tr><td colspan="4">Nenhum agendamento gerado para este pacote.</td></tr>';
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${publicDocEsc(title)} · PetFunny</title>
  <link rel="stylesheet" href="/assets/css/app.css">
</head>
<body class="public-doc-body">
  <main class="public-doc-wrap">
    <article class="print-document public-print agenda-inline-document">
      <div class="doc-brand"><img src="/assets/img/logo-petfunny-full.png" alt="PetFunny"><div><strong>${publicDocEsc(business.name || 'PetFunny - Banho e Tosa')}</strong><small>${publicDocEsc(business.address || 'Ribeirão Preto / SP')} · WhatsApp ${publicDocEsc(business.whatsapp || '')}</small></div></div>
      <div class="doc-head"><div><p class="eyebrow">${publicDocEsc(eyebrow)}</p><h2>${publicDocEsc(title)}</h2><p>${publicDocEsc(description)}</p><p class="doc-package-note"><strong>Pacote:</strong> ${publicDocEsc(pack.packageName || '—')} · ${publicDocEsc(pack.totalSessions || 0)} sessão(ões) · progresso ${publicDocEsc(pack.progressLabel || '')}</p></div><div class="doc-number"><span>Nº</span><strong>${publicDocEsc(String(pack.id || '').slice(0,8) || '—')}</strong></div></div>
      <div class="doc-grid"><div><span>Tutor</span><strong>${publicDocEsc(pack.tutorName || '—')}</strong><small>${publicDocEsc(pack.tutorWhatsapp || '')}</small></div><div><span>Pet</span><strong>${publicDocEsc(pack.petName || '—')}</strong></div><div><span>Status</span><strong>${publicDocEsc(pack.status || 'active')}</strong></div><div><span>Pagamento</span><strong>${publicDocEsc(pack.paymentStatus || 'pending')}</strong><small>${publicDocEsc(pack.paymentMethodName || 'forma não informada')}</small></div></div>
      <table class="doc-table"><thead><tr><th>Serviço incluso</th><th>Qtd.</th><th>Unitário</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table>
      <section class="doc-section-block"><h3>Datas dos agendamentos do pacote</h3><table class="doc-table"><thead><tr><th>Sessão</th><th>Data e horário</th><th>Status</th><th>Valor alocado</th></tr></thead><tbody>${appointmentRows}</tbody></table></section>
      <div class="doc-totals"><div><span>Total dos serviços</span><strong>${moneyPublic(totals.subtotalCents)}</strong></div><div><span>Desconto do pacote</span><strong>${moneyPublic(totals.discountCents)} · ${Number(totals.discountPercent || 0)}%</strong></div><div class="doc-total-final"><span>Preço do pacote</span><strong>${moneyPublic(totals.totalCents)}</strong></div></div>
      <footer class="doc-footer">${isReceipt ? 'Obrigado pela confiança no PetFunny. Recibo do pacote gerado eletronicamente.' : 'Esta comanda consolida os serviços inclusos no pacote. O recibo confirma o pagamento.'}</footer>
    </article>
    <div class="public-doc-actions"><button class="btn secondary" onclick="window.print()">Imprimir</button></div>
  </main>
</body>
</html>`;
}

function publicDocEsc(value = '') {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function publicCommandHtml(data) {
  const appointment = data.appointment || {};
  const business = data.business || {};
  const totals = data.totals || {};
  const items = appointment.items || [];
  const moneyPublic = (cents = 0) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(cents || 0) / 100);
  const dateText = formatDocumentDateTimePt(appointment.startsAt, '—');
  const rows = items.length
    ? items.map(item => `<tr><td>${publicDocEsc(item.description || item.name || 'Serviço')}</td><td>${publicDocEsc(item.quantity || 1)}</td><td>${moneyPublic(item.unitPriceCents)}</td><td>${moneyPublic(item.totalCents)}</td></tr>`).join('')
    : `<tr><td colspan="4">${publicDocEsc(appointment.services || 'Atendimento PetFunny')}</td></tr>`;
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Comanda PetFunny</title>
  <link rel="stylesheet" href="/assets/css/app.css">
</head>
<body class="public-doc-body">
  <main class="public-doc-wrap">
    <article class="print-document public-print agenda-inline-document">
      <div class="doc-brand"><img src="/assets/img/logo-petfunny-full.png" alt="PetFunny"><div><strong>${publicDocEsc(business.name || 'PetFunny - Banho e Tosa')}</strong><small>${publicDocEsc(business.address || 'Ribeirão Preto / SP')} · WhatsApp ${publicDocEsc(business.whatsapp || '')}</small></div></div>
      <div class="doc-head"><div><p class="eyebrow">Comanda de atendimento</p><h2>Comanda</h2><p>Conferência dos serviços, valores e descontos antes da finalização do pagamento.</p>${appointment.packageSessionLabel ? `<p class="doc-package-note"><strong>Pacote:</strong> sessão ${publicDocEsc(appointment.packageSessionLabel)} · quantidade total do pacote: ${publicDocEsc(appointment.packageTotalSessions || '')} sessão(ões)</p>` : ''}</div><div class="doc-number"><span>Nº</span><strong>${publicDocEsc(appointment.id?.slice(0,8) || '—')}</strong></div></div>
      <div class="doc-grid"><div><span>Tutor</span><strong>${publicDocEsc(appointment.tutorName || '—')}</strong><small>${publicDocEsc(appointment.tutorWhatsapp || '')}</small></div><div><span>Pet</span><strong>${publicDocEsc(appointment.petName || '—')}</strong><small>${publicDocEsc(appointment.petSize || '')}</small></div><div><span>Data</span><strong>${publicDocEsc(dateText)}</strong></div><div><span>Status</span><strong>${publicDocEsc(appointment.statusName || appointment.status || '—')}</strong></div></div>
      <table class="doc-table"><thead><tr><th>Serviço</th><th>Qtd.</th><th>Unitário</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="doc-totals"><div><span>Total original</span><strong>${moneyPublic(totals.subtotalCents ?? appointment.subtotalCents)}</strong></div><div><span>Desconto</span><strong>${moneyPublic(totals.discountCents ?? appointment.discountCents)} · ${Number(totals.discountPercent ?? appointment.discountPercent ?? 0)}%</strong></div><div class="doc-total-final"><span>Total final</span><strong>${moneyPublic(totals.totalCents ?? appointment.totalCents)}</strong></div></div>
      <footer class="doc-footer">Esta comanda é uma conferência do atendimento. O recibo é liberado após a baixa do pagamento.</footer>
    </article>
    <div class="public-doc-actions"><button class="btn secondary" onclick="window.print()">Imprimir</button></div>
  </main>
</body>
</html>`;
}


app.get('/documentos/comanda/:appointmentId', async (req, res, next) => {
  try {
    const appointment = await getAppointmentById(req.params.appointmentId);
    if (!appointment) return res.status(404).send('Comanda não encontrada.');
    if (appointment.customer_package_id) return res.redirect(302, `/documentos/pacote-comanda/${appointment.customer_package_id}`);
    const data = await getAppointmentDocumentData(req.params.appointmentId);
    if (!data) return res.status(404).send('Comanda não encontrada.');
    res.type('html').send(publicCommandHtml(data));
  } catch (error) { next(error); }
});


app.get('/documentos/pacote-comanda/:customerPackageId', async (req, res, next) => {
  try {
    const data = await getCustomerPackageDocumentData(req.params.customerPackageId);
    if (!data) return res.status(404).send('Comanda do pacote não encontrada.');
    res.type('html').send(publicPackageDocumentHtml(data, 'command'));
  } catch (error) { next(error); }
});

app.get('/documentos/pacote-recibo/:customerPackageId', async (req, res, next) => {
  try {
    const data = await getCustomerPackageDocumentData(req.params.customerPackageId);
    if (!data) return res.status(404).send('Recibo do pacote não encontrado.');
    res.type('html').send(publicPackageDocumentHtml(data, 'receipt'));
  } catch (error) { next(error); }
});

app.get('/api/documentos/pacote/:customerPackageId', requireAuth, async (req, res, next) => {
  try {
    const data = await getCustomerPackageDocumentData(req.params.customerPackageId);
    if (!data) return res.status(404).json({ error: 'Pacote vendido não encontrado.' });
    res.json({ document: { type: 'package', ...data, commandUrl: `/documentos/pacote-comanda/${req.params.customerPackageId}`, receiptUrl: `/documentos/pacote-recibo/${req.params.customerPackageId}` } });
  } catch (error) { next(error); }
});

app.get('/api/documentos/comanda/:appointmentId', requireAuth, async (req, res, next) => {
  try {
    const appointment = await getAppointmentById(req.params.appointmentId);
    if (!appointment) return res.status(404).json({ error: 'Agendamento não encontrado.' });
    if (appointment.customer_package_id) {
      const data = await getCustomerPackageDocumentData(appointment.customer_package_id);
      if (!data) return res.status(404).json({ error: 'Pacote vendido não encontrado.' });
      return res.json({ document: { type: 'package', ...data, publicUrl: `/documentos/pacote-comanda/${appointment.customer_package_id}`, commandUrl: `/documentos/pacote-comanda/${appointment.customer_package_id}`, receiptUrl: `/documentos/pacote-recibo/${appointment.customer_package_id}` } });
    }
    const data = await getAppointmentDocumentData(req.params.appointmentId);
    if (!data) return res.status(404).json({ error: 'Agendamento não encontrado.' });
    res.json({ document: { type: 'command', ...data, publicUrl: `/documentos/comanda/${req.params.appointmentId}` } });
  } catch (error) { next(error); }
});

app.post('/api/documentos/recibos/:appointmentId/generate', requireAuth, async (req, res, next) => {
  try {
    const appointment = await getAppointmentById(req.params.appointmentId);
    if (appointment?.customer_package_id) {
      const data = await getCustomerPackageDocumentData(appointment.customer_package_id);
      if (!data) return res.status(404).json({ error: 'Pacote vendido não encontrado.' });
      return res.status(201).json({
        receipt: {
          documentNumber: `PAC-${String(appointment.customer_package_id).slice(0, 8).toUpperCase()}`,
          printUrl: `/documentos/pacote-recibo/${appointment.customer_package_id}`,
          payload: data
        },
        document: { type: 'package', ...data, publicUrl: `/documentos/pacote-recibo/${appointment.customer_package_id}` },
        financialTransaction: null,
        message: 'Recibo consolidado do pacote preparado.'
      });
    }
    const finance = await ensureFinancialTransactionForAppointment(req.params.appointmentId);
    const receipt = await createOrUpdateReceiptForAppointment(req.params.appointmentId, null);
    if (!receipt) return res.status(404).json({ error: 'Agendamento não encontrado.' });
    res.status(201).json({ receipt, financialTransaction: finance ? sanitizeFinancialTransaction(finance) : null, message: 'Recibo preparado.' });
  } catch (error) { next(error); }
});

app.get('/api/public/recibos/:token', async (req, res, next) => {
  try {
    const result = await query('SELECT * FROM receipts WHERE public_token=$1::text LIMIT 1', [req.params.token]);
    if (!result.rowCount) return res.status(404).json({ error: 'Recibo não encontrado.' });
    res.json({ receipt: normalizeReceiptPayload(result.rows[0]) });
  } catch (error) { next(error); }
});



function sanitizeCrmLead(row = {}) {
  return {
    id: row.id,
    tutorId: row.tutor_id,
    tutorName: row.tutor_name || null,
    name: row.name,
    whatsapp: row.whatsapp,
    email: row.email,
    stage: row.stage,
    source: row.source,
    lastContactAt: row.last_contact_at,
    notes: row.notes,
    interactionsCount: Number(row.interactions_count || 0),
    petsCount: Number(row.pets_count || 0),
    lastAppointmentAt: row.last_appointment_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function sanitizeCrmInteraction(row = {}) {
  return {
    id: row.id,
    leadId: row.lead_id,
    tutorId: row.tutor_id,
    channel: row.channel,
    direction: row.direction,
    subject: row.subject,
    message: row.message,
    occurredAt: row.occurred_at,
    createdAt: row.created_at
  };
}

const CRM_APP_STAGE_ORDER = {
  lead_entrou: 10,
  codigo_validado: 20,
  cadastro_tutor: 30,
  senha_cadastrada: 40,
  pet_cadastrado: 50,
  primeiro_agendamento: 60,
  conversa_iniciada: 70,
  proposta_enviada: 80,
  fechado: 90,
  perdido: 0
};

const CRM_STAGES = [
  { code: 'lead_entrou', name: 'Lead entrou', color: '#00a9b7' },
  { code: 'codigo_validado', name: 'Código validado', color: '#24b8c5' },
  { code: 'cadastro_tutor', name: 'Cadastro do tutor', color: '#ff9d98' },
  { code: 'senha_cadastrada', name: 'Senha cadastrada', color: '#ff7f95' },
  { code: 'pet_cadastrado', name: 'Pet cadastrado', color: '#7c3aed' },
  { code: 'primeiro_agendamento', name: 'Primeiro agendamento', color: '#12a876' },
  { code: 'conversa_iniciada', name: 'Conversa iniciada', color: '#ff9d98' },
  { code: 'proposta_enviada', name: 'Proposta enviada', color: '#f59e0b' },
  { code: 'fechado', name: 'Fechado', color: '#10b981' },
  { code: 'perdido', name: 'Perdido', color: '#94a3b8' }
];

function getAppCrmAttribution(req) {
  const body = req?.body || {};
  const headers = req?.headers || {};
  const referer = cleanText(body.referrer || body.referer || req?.get?.('referer') || req?.get?.('referrer') || '');
  const userAgent = cleanText(body.userAgent || headers['user-agent'] || '');
  const utmSource = cleanText(body.utmSource || body.utm_source || body.source || '');
  const utmMedium = cleanText(body.utmMedium || body.utm_medium || '');
  const utmCampaign = cleanText(body.utmCampaign || body.utm_campaign || '');
  const landingPath = cleanText(body.landingPath || body.landing_path || req?.path || '');
  const origin = utmSource || (referer ? 'referral' : 'app_tutor');
  const details = [
    `Origem: ${origin}`,
    referer ? `Referer: ${referer}` : '',
    utmMedium ? `utm_medium: ${utmMedium}` : '',
    utmCampaign ? `utm_campaign: ${utmCampaign}` : '',
    landingPath ? `Tela: ${landingPath}` : '',
    userAgent ? `Dispositivo: ${userAgent.slice(0, 140)}` : ''
  ].filter(Boolean).join(' | ');
  return { source: 'app_tutor', origin, details };
}

function mergeCrmNotes(currentNotes, nextNote) {
  const current = cleanText(currentNotes);
  const next = cleanText(nextNote);
  if (!next) return current;
  if (current.includes(next)) return current;
  const stamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
  return [current, `[${stamp}] ${next}`].filter(Boolean).join('\n');
}

async function syncAppCrmLead({ whatsapp, tutorId = null, name = '', email = '', stage = 'lead_entrou', source = 'app_tutor', origin = '', notes = '', interactionSubject = '', interactionMessage = '' } = {}) {
  try {
    const normalizedWhatsapp = normalizeWhatsapp(whatsapp);
    if (!normalizedWhatsapp && !tutorId) return null;
    const safeStage = CRM_APP_STAGE_ORDER[stage] !== undefined ? stage : 'lead_entrou';
    const fallbackName = cleanText(name) || `Lead ${normalizedWhatsapp || 'App PetFunny'}`;
    const existing = await query(`
      SELECT id, stage, notes, source
      FROM crm_leads
      WHERE deleted_at IS NULL
        AND (whatsapp = $1::text OR ($2::uuid IS NOT NULL AND tutor_id = $2::uuid))
      ORDER BY updated_at DESC
      LIMIT 1
    `, [normalizedWhatsapp || '', tutorId || null]);

    let leadId = existing.rows[0]?.id || null;
    if (leadId) {
      const currentStage = existing.rows[0].stage || 'lead_entrou';
      const keepTerminal = ['fechado', 'perdido'].includes(currentStage);
      const nextStage = keepTerminal ? currentStage : ((CRM_APP_STAGE_ORDER[safeStage] || 0) >= (CRM_APP_STAGE_ORDER[currentStage] || 0) ? safeStage : currentStage);
      const mergedNotes = mergeCrmNotes(existing.rows[0].notes, notes || origin || 'Acesso pelo App do Tutor');
      await query(`
        UPDATE crm_leads
        SET tutor_id = COALESCE($2::uuid, tutor_id),
            name = COALESCE(NULLIF($3::text, ''), name),
            whatsapp = COALESCE(NULLIF($4::text, ''), whatsapp),
            email = COALESCE(NULLIF($5::text, ''), email),
            stage = $6::text,
            source = CASE WHEN source IS NULL OR source = '' OR source = 'manual' THEN $7::text ELSE source END,
            notes = $8::text,
            last_contact_at = NOW(),
            updated_at = NOW()
        WHERE id = $1::uuid
      `, [leadId, tutorId || null, fallbackName, normalizedWhatsapp, cleanText(email), nextStage, source || 'app_tutor', mergedNotes]);
    } else {
      const inserted = await query(`
        INSERT INTO crm_leads (tutor_id, name, whatsapp, email, stage, source, last_contact_at, notes)
        VALUES ($1::uuid, $2::text, $3::text, $4::text, $5::text, $6::text, NOW(), $7::text)
        RETURNING id
      `, [tutorId || null, fallbackName, normalizedWhatsapp || null, cleanText(email) || null, safeStage, source || 'app_tutor', mergeCrmNotes('', notes || origin || 'Lead entrou pelo App do Tutor')]);
      leadId = inserted.rows[0]?.id || null;
    }

    if (leadId && interactionMessage) {
      await query(`
        INSERT INTO crm_interactions (lead_id, tutor_id, channel, direction, subject, message, occurred_at)
        VALUES ($1::uuid, $2::uuid, 'app', 'inbound', $3::text, $4::text, NOW())
      `, [leadId, tutorId || null, interactionSubject || 'Evento do App do Tutor', interactionMessage]);
    }
    return leadId;
  } catch (error) {
    console.warn('[crm:app-flow] não foi possível sincronizar lead:', error.message);
    return null;
  }
}


app.post('/api/crm/tutors/:id/interactions', requireAuth, async (req, res, next) => {
  try {
    const tutorId = cleanText(req.params.id);
    const message = cleanText(req.body?.message);
    if (!message) return res.status(400).json({ error: 'Informe a mensagem enviada.' });
    const tutor = await query('SELECT id, name, whatsapp FROM tutors WHERE id=$1::uuid AND deleted_at IS NULL LIMIT 1', [tutorId]);
    if (!tutor.rowCount) return res.status(404).json({ error: 'Tutor não encontrado.' });
    const result = await query(`
      INSERT INTO crm_interactions (lead_id, tutor_id, channel, direction, subject, message, occurred_at)
      VALUES (NULL, $1::uuid, $2::text, 'outbound', $3::text, $4::text, NOW())
      RETURNING *
    `, [tutorId, cleanText(req.body?.channel) || 'whatsapp', cleanText(req.body?.subject) || 'Mensagem WhatsApp PetFunny', message]);
    const count = await query(`
      SELECT COUNT(*)::int AS sent_messages_count, MAX(occurred_at) AS last_message_at
      FROM crm_interactions
      WHERE tutor_id=$1::uuid AND COALESCE(lower(direction), 'outbound') IN ('outbound','sent','enviada','enviado')
    `, [tutorId]);
    res.status(201).json({
      interaction: sanitizeCrmInteraction(result.rows[0]),
      sentMessagesCount: Number(count.rows[0]?.sent_messages_count || 0),
      lastMessageAt: count.rows[0]?.last_message_at || null,
      message: 'Mensagem registrada no CRM.'
    });
  } catch (error) { next(error); }
});

app.get('/api/crm/options', requireAuth, async (req, res, next) => {
  try {
    const tutors = await query(`
      SELECT id, name, whatsapp, email
      FROM tutors
      WHERE deleted_at IS NULL
      ORDER BY name ASC
      LIMIT 500
    `);
    res.json({
      stages: CRM_STAGES,
      sources: ['manual','app_tutor','whatsapp','instagram','landing_page','indicacao','google','cliente_inativo'],
      channels: ['whatsapp','telefone','instagram','email','presencial'],
      tutors: tutors.rows.map(sanitizeTutor)
    });
  } catch (error) { next(error); }
});

app.get('/api/crm/summary', requireAuth, async (req, res, next) => {
  try {
    const summary = await query(`
      SELECT
        COUNT(*) FILTER (WHERE deleted_at IS NULL)::int AS total_leads,
        COUNT(*) FILTER (WHERE deleted_at IS NULL AND stage = 'fechado')::int AS closed_leads,
        COUNT(*) FILTER (WHERE deleted_at IS NULL AND stage NOT IN ('fechado','perdido'))::int AS open_leads,
        COUNT(*) FILTER (WHERE deleted_at IS NULL AND (last_contact_at IS NULL OR last_contact_at < NOW() - INTERVAL '7 days'))::int AS without_recent_contact
      FROM crm_leads
    `);
    const byStage = await query(`
      SELECT stage, COUNT(*)::int AS count
      FROM crm_leads
      WHERE deleted_at IS NULL
      GROUP BY stage
    `);
    const inactiveCustomers = await query(`
      SELECT t.id, t.name, t.whatsapp, MAX(a.starts_at) AS last_appointment_at, COUNT(DISTINCT p.id)::int AS pets_count
      FROM tutors t
      LEFT JOIN pets p ON p.tutor_id = t.id AND p.deleted_at IS NULL
      LEFT JOIN appointments a ON a.tutor_id = t.id AND a.deleted_at IS NULL
      WHERE t.deleted_at IS NULL
      GROUP BY t.id
      HAVING MAX(a.starts_at) IS NULL OR MAX(a.starts_at) < NOW() - INTERVAL '45 days'
      ORDER BY last_appointment_at ASC NULLS FIRST, t.name ASC
      LIMIT 20
    `);
    const stageMap = Object.fromEntries(byStage.rows.map((row) => [row.stage, Number(row.count || 0)]));
    res.json({
      summary: summary.rows[0] || {},
      stages: CRM_STAGES.map((stage) => ({ ...stage, count: stageMap[stage.code] || 0 })),
      inactiveCustomers: inactiveCustomers.rows.map((row) => ({
        id: row.id,
        name: row.name,
        whatsapp: row.whatsapp,
        lastAppointmentAt: row.last_appointment_at,
        petsCount: Number(row.pets_count || 0)
      }))
    });
  } catch (error) { next(error); }
});


app.get('/api/crm/operational', requireAuth, async (req, res, next) => {
  const safeRows = async (label, sql, params = []) => {
    try {
      const result = await query(sql, params);
      return result.rows || [];
    } catch (error) {
      console.warn(`[crm-operacional] ${label} indisponível: ${error.message}`);
      return [];
    }
  };
  const daysBetween = (dateValue) => {
    if (!dateValue) return null;
    const d = new Date(dateValue);
    if (Number.isNaN(d.getTime())) return null;
    return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
  };
  const crmStatusFor = ({ appointmentsCount, daysWithoutAppointment, activePackages, points, convertedReferrals }) => {
    if (!appointmentsCount) return { code: 'novo_lead', label: 'Novo lead', tone: 'info' };
    if (appointmentsCount >= 12 && activePackages > 0 && convertedReferrals > 0) return { code: 'cliente_ouro', label: 'Cliente Ouro', tone: 'gold' };
    if ((appointmentsCount >= 8 && activePackages > 0) || points >= 60) return { code: 'vip', label: 'Cliente VIP', tone: 'success' };
    if ((activePackages > 0 || appointmentsCount >= 3) && (daysWithoutAppointment === null || daysWithoutAppointment <= 45)) return { code: 'recorrente', label: 'Recorrente', tone: 'success' };
    if (daysWithoutAppointment !== null && daysWithoutAppointment <= 30) return { code: 'ativo', label: 'Ativo', tone: 'success' };
    if (daysWithoutAppointment !== null && daysWithoutAppointment <= 60) return { code: 'em_atencao', label: 'Em atenção', tone: 'warning' };
    if (daysWithoutAppointment !== null && daysWithoutAppointment <= 90) return { code: 'em_risco', label: 'Em risco', tone: 'danger' };
    return { code: 'perdido', label: 'Perdido', tone: 'muted' };
  };
  const appStatusFor = ({ totalAccesses, lastAccessAt }) => {
    const days = daysBetween(lastAccessAt);
    if (!totalAccesses) return { code: 'nunca_acessou', label: 'Nunca acessou', days: null, tone: 'muted' };
    if (days === 0) return { code: 'acessou_hoje', label: 'Acessou hoje', days, tone: 'success' };
    if (days <= 7) return { code: 'ativo_app', label: 'Ativo no app', days, tone: 'success' };
    if (days <= 30) return { code: 'inativo_7', label: 'Inativo 7+ dias', days, tone: 'warning' };
    return { code: 'inativo_30', label: 'Inativo 30+ dias', days, tone: 'danger' };
  };
  const actionFor = (row) => {
    const name = row.name || 'tudo bem';
    const petText = row.petNames ? ` do ${String(row.petNames).split(',')[0].trim()}` : ' do seu pet';
    const daysText = row.daysWithoutAppointment === null || row.daysWithoutAppointment === undefined
      ? 'Ainda não encontrei um atendimento recente registrado.'
      : `Já faz ${row.daysWithoutAppointment} dia${Number(row.daysWithoutAppointment) === 1 ? '' : 's'} desde o último cuidado.`;
    if (!row.totalAccesses) return {
      code: 'ativar_app',
      label: 'Ativar app do tutor',
      subject: 'Ativação do App PetFunny',
      reason: 'Tutor ainda não tem acesso registrado no App do Tutor.',
      message: `Oi, ${name}! Aqui é da PetFunny 🐾 Liberamos seu acesso ao App do Tutor para acompanhar agenda, pacotes, mimos, fotos do atendimento e cuidados${petText}. Acesse pelo link: https://agendapetfunny.com.br/app`
    };
    if (row.crmStatus.code === 'novo_lead') return {
      code: 'primeiro_agendamento',
      label: 'Convidar para primeiro agendamento',
      subject: 'Convite para primeiro agendamento',
      reason: 'Tutor cadastrado sem agendamento no histórico.',
      message: `Oi, ${name}! Tudo bem? Vi que seu cadastro já está no PetFunny, mas ainda não encontrei o primeiro agendamento${petText}. Quer escolher um horário para banho, tosa ou avaliação de bem-estar? Acesse: https://agendapetfunny.com.br/app`
    };
    if (['em_atencao','em_risco','perdido'].includes(row.crmStatus.code)) return {
      code: 'reativar',
      label: 'Reativar cliente',
      subject: 'Reativação de cliente',
      reason: daysText,
      message: `Oi, ${name}! Sentimos falta de vocês por aqui 🐾 ${daysText} Pode ser um bom momento para renovar o cuidado${petText} com banho, tosa, hidratação ou Saúde 360. Veja os horários disponíveis: https://agendapetfunny.com.br/app`
    };
    if (!row.activePackages) return {
      code: 'ofertar_pacote',
      label: 'Ofertar pacote',
      subject: 'Oferta de pacote PetFunny',
      reason: `Cliente com ${row.appointmentsCount || 0} atendimento(s) e sem pacote ativo.`,
      message: `Oi, ${name}! Pelo histórico${petText} aqui na PetFunny, um pacote mensal pode ajudar a manter a rotina com mais economia, agenda garantida e cuidado recorrente. Quer ver as opções? https://agendapetfunny.com.br/app`
    };
    return {
      code: 'manter_recorrencia',
      label: 'Manter recorrência',
      subject: 'Manutenção da recorrência PetFunny',
      reason: 'Cliente com pacote ou recorrência ativa.',
      message: `Oi, ${name}! Passando para lembrar que a rotina${petText} está em boas mãos 💚 Você pode acompanhar próximos cuidados, pacotes, mimos e notificações pelo App PetFunny: https://agendapetfunny.com.br/app`
    };
  };
  try {
    const tutors = await safeRows('tutores', `
      SELECT id, name, whatsapp, email, status, created_at
      FROM tutors
      WHERE deleted_at IS NULL
      ORDER BY name ASC
      LIMIT 2000
    `);
    const pets = await safeRows('pets', `
      SELECT tutor_id, COUNT(*)::int AS pets_count, STRING_AGG(name, ', ' ORDER BY name) AS pet_names
      FROM pets
      WHERE deleted_at IS NULL
      GROUP BY tutor_id
    `);
    const appointments = await safeRows('agendamentos', `
      SELECT tutor_id,
             COUNT(*)::int AS appointments_count,
             MAX(starts_at) AS last_appointment_at,
             MIN(starts_at) FILTER (WHERE starts_at >= NOW() AND COALESCE(status,'') NOT IN ('cancelled','cancelado')) AS next_appointment_at,
             COUNT(*) FILTER (WHERE starts_at >= NOW() AND COALESCE(status,'') NOT IN ('cancelled','cancelado'))::int AS future_appointments
      FROM appointments
      WHERE deleted_at IS NULL
      GROUP BY tutor_id
    `);
    const packages = await safeRows('pacotes', `
      SELECT tutor_id, COUNT(*)::int AS active_packages
      FROM customer_packages
      WHERE deleted_at IS NULL AND COALESCE(status,'active') IN ('active','ativo','paid','pago')
      GROUP BY tutor_id
    `);
    const rewards = await safeRows('ossinhos', `
      SELECT tutor_id, COALESCE(MAX(points_balance),0)::int AS points_balance
      FROM tutor_rewards
      GROUP BY tutor_id
    `);
    const rewardEvents = await safeRows('eventos_ossinhos', `
      SELECT tutor_id, COALESCE(SUM(points),0)::int AS points_earned
      FROM tutor_reward_events
      GROUP BY tutor_id
    `);
    const referrals = await safeRows('indicacoes', `
      SELECT referrer_tutor_id AS tutor_id,
             COUNT(*)::int AS referrals_count,
             COUNT(*) FILTER (WHERE status='converted')::int AS referrals_converted
      FROM tutor_referrals
      GROUP BY referrer_tutor_id
    `);
    const accesses = await safeRows('acessos_app', `
      SELECT tutor_id,
             COUNT(*)::int AS total_accesses,
             MIN(created_at) AS first_access_at,
             MAX(created_at) AS last_access_at,
             (ARRAY_AGG(event_type ORDER BY created_at DESC))[1] AS last_action,
             (ARRAY_AGG(page ORDER BY created_at DESC))[1] AS last_page
      FROM app_access_logs
      WHERE tutor_id IS NOT NULL
      GROUP BY tutor_id
    `);
    const finance = await safeRows('financeiro', `
      SELECT tutor_id, COALESCE(SUM(CASE WHEN type='income' OR kind='income' THEN amount_cents ELSE 0 END),0)::bigint AS paid_cents
      FROM financial_transactions
      WHERE deleted_at IS NULL
      GROUP BY tutor_id
    `);
    const messages = await safeRows('mensagens_crm', `
      SELECT target_tutor_id AS tutor_id, COUNT(*)::int AS sent_messages_count, MAX(occurred_at) AS last_message_at
      FROM (
        SELECT COALESCE(ci.tutor_id, cl.tutor_id) AS target_tutor_id, ci.occurred_at
        FROM crm_interactions ci
        LEFT JOIN crm_leads cl ON cl.id = ci.lead_id
        WHERE COALESCE(lower(ci.direction), 'outbound') IN ('outbound','sent','enviada','enviado')
      ) msg
      WHERE target_tutor_id IS NOT NULL
      GROUP BY target_tutor_id
    `);

    const byTutor = (rows, key='tutor_id') => new Map(rows.filter(Boolean).map((r) => [String(r[key]), r]));
    const petMap = byTutor(pets);
    const apptMap = byTutor(appointments);
    const packageMap = byTutor(packages);
    const rewardMap = byTutor(rewards);
    const rewardEventMap = byTutor(rewardEvents);
    const referralMap = byTutor(referrals);
    const accessMap = byTutor(accesses);
    const financeMap = byTutor(finance);
    const messageMap = byTutor(messages);

    const items = tutors.map((tutor) => {
      const id = String(tutor.id);
      const appt = apptMap.get(id) || {};
      const pet = petMap.get(id) || {};
      const reward = rewardMap.get(id) || {};
      const event = rewardEventMap.get(id) || {};
      const ref = referralMap.get(id) || {};
      const access = accessMap.get(id) || {};
      const fin = financeMap.get(id) || {};
      const msg = messageMap.get(id) || {};
      const appointmentsCount = Number(appt.appointments_count || 0);
      const daysWithoutAppointment = daysBetween(appt.last_appointment_at);
      const totalAccesses = Number(access.total_accesses || 0);
      const activePackages = Number(packageMap.get(id)?.active_packages || 0);
      const points = Number(reward.points_balance || event.points_earned || 0);
      const convertedReferrals = Number(ref.referrals_converted || 0);
      const row = {
        id,
        name: tutor.name || 'Tutor',
        whatsapp: tutor.whatsapp || '',
        email: tutor.email || '',
        petsCount: Number(pet.pets_count || 0),
        petNames: pet.pet_names || '',
        appointmentsCount,
        lastAppointmentAt: appt.last_appointment_at || null,
        nextAppointmentAt: appt.next_appointment_at || null,
        futureAppointments: Number(appt.future_appointments || 0),
        daysWithoutAppointment,
        activePackages,
        pointsBalance: points,
        referralsCount: Number(ref.referrals_count || 0),
        referralsConverted: convertedReferrals,
        paidCents: Number(fin.paid_cents || 0),
        sentMessagesCount: Number(msg.sent_messages_count || 0),
        lastMessageAt: msg.last_message_at || null,
        totalAccesses,
        firstAccessAt: access.first_access_at || null,
        lastAccessAt: access.last_access_at || null,
        lastAction: access.last_action || '',
        lastPage: access.last_page || ''
      };
      row.crmStatus = crmStatusFor(row);
      row.appStatus = appStatusFor(row);
      row.suggestedAction = actionFor(row);
      return row;
    });

    const countStatus = (code) => items.filter((item) => item.crmStatus.code === code).length;
    const metrics = {
      totalTutors: items.length,
      activeTutors: items.filter((item) => ['ativo','recorrente','vip','cliente_ouro'].includes(item.crmStatus.code)).length,
      recurringTutors: countStatus('recorrente') + countStatus('vip') + countStatus('cliente_ouro'),
      atRiskTutors: countStatus('em_atencao') + countStatus('em_risco'),
      lostTutors: countStatus('perdido'),
      newLeads: countStatus('novo_lead'),
      neverAccessed: items.filter((item) => item.appStatus.code === 'nunca_acessou').length,
      accessedToday: items.filter((item) => item.appStatus.code === 'acessou_hoje').length,
      inactiveApp30: items.filter((item) => item.appStatus.code === 'inativo_30').length,
      totalAccesses: items.reduce((sum, item) => sum + item.totalAccesses, 0),
      pointsBalance: items.reduce((sum, item) => sum + item.pointsBalance, 0),
      referrals: items.reduce((sum, item) => sum + item.referralsCount, 0),
      convertedReferrals: items.reduce((sum, item) => sum + item.referralsConverted, 0),
      activePackages: items.reduce((sum, item) => sum + item.activePackages, 0),
      sentMessages: items.reduce((sum, item) => sum + Number(item.sentMessagesCount || 0), 0)
    };
    const segments = [
      { code: 'novo_lead', label: 'Novos leads', count: metrics.newLeads, action: 'Convidar para primeiro agendamento' },
      { code: 'recorrente', label: 'Recorrentes/VIP/Ouro', count: metrics.recurringTutors, action: 'Manter rotina e pacote ativo' },
      { code: 'em_risco', label: 'Atenção/Risco', count: metrics.atRiskTutors, action: 'Mensagem de reativação' },
      { code: 'perdido', label: 'Perdidos', count: metrics.lostTutors, action: 'Campanha de retorno' },
      { code: 'nunca_acessou', label: 'Nunca acessaram o app', count: metrics.neverAccessed, action: 'Enviar ativação do app' }
    ];
    res.json({ generatedAt: new Date().toISOString(), metrics, segments, items });
  } catch (error) { next(error); }
});

app.get('/api/crm/leads', requireAuth, async (req, res, next) => {
  try {
    const search = cleanText(req.query.search);
    const stage = cleanText(req.query.stage) || 'all';
    const source = cleanText(req.query.source) || 'all';
    const params = [];
    const where = ['cl.deleted_at IS NULL'];
    if (stage !== 'all') { params.push(stage); where.push(`cl.stage = $${params.length}::text`); }
    if (source !== 'all') { params.push(source); where.push(`cl.source = $${params.length}::text`); }
    if (search) {
      params.push(`%${search}%`);
      where.push(`(cl.name ILIKE $${params.length} OR cl.whatsapp ILIKE $${params.length} OR cl.email ILIKE $${params.length} OR t.name ILIKE $${params.length})`);
    }
    const result = await query(`
      SELECT cl.*, t.name AS tutor_name,
             COUNT(ci.id)::int AS interactions_count,
             COUNT(DISTINCT p.id)::int AS pets_count,
             MAX(a.starts_at) AS last_appointment_at
      FROM crm_leads cl
      LEFT JOIN tutors t ON t.id = cl.tutor_id
      LEFT JOIN crm_interactions ci ON ci.lead_id = cl.id
      LEFT JOIN pets p ON p.tutor_id = cl.tutor_id AND p.deleted_at IS NULL
      LEFT JOIN appointments a ON a.tutor_id = cl.tutor_id AND a.deleted_at IS NULL
      WHERE ${where.join(' AND ')}
      GROUP BY cl.id, t.name
      ORDER BY cl.updated_at DESC, cl.created_at DESC
      LIMIT 200
    `, params);
    res.json({ items: result.rows.map(sanitizeCrmLead) });
  } catch (error) { next(error); }
});

app.post('/api/crm/leads', requireAuth, async (req, res, next) => {
  try {
    const name = cleanText(req.body?.name);
    if (!name) return res.status(400).json({ error: 'Informe o nome do lead.' });
    const result = await query(`
      INSERT INTO crm_leads (tutor_id, name, whatsapp, email, stage, source, last_contact_at, notes)
      VALUES (NULLIF($1::text,'')::uuid, $2::text, $3::text, $4::text, $5::text, $6::text, NULLIF($7::text,'')::timestamptz, $8::text)
      RETURNING *
    `, [cleanText(req.body?.tutorId) || '', name, normalizeWhatsapp(req.body?.whatsapp), cleanText(req.body?.email), cleanText(req.body?.stage) || 'lead_entrou', cleanText(req.body?.source) || 'manual', cleanText(req.body?.lastContactAt) || '', cleanText(req.body?.notes)]);
    res.status(201).json({ lead: sanitizeCrmLead(result.rows[0]), message: 'Lead criado.' });
  } catch (error) { next(error); }
});

app.put('/api/crm/leads/:id', requireAuth, async (req, res, next) => {
  try {
    const name = cleanText(req.body?.name);
    if (!name) return res.status(400).json({ error: 'Informe o nome do lead.' });
    const result = await query(`
      UPDATE crm_leads
      SET tutor_id=NULLIF($2::text,'')::uuid, name=$3::text, whatsapp=$4::text, email=$5::text, stage=$6::text, source=$7::text,
          last_contact_at=NULLIF($8::text,'')::timestamptz, notes=$9::text, updated_at=NOW()
      WHERE id=$1::uuid AND deleted_at IS NULL
      RETURNING *
    `, [req.params.id, cleanText(req.body?.tutorId) || '', name, normalizeWhatsapp(req.body?.whatsapp), cleanText(req.body?.email), cleanText(req.body?.stage) || 'lead_entrou', cleanText(req.body?.source) || 'manual', cleanText(req.body?.lastContactAt) || '', cleanText(req.body?.notes)]);
    if (!result.rowCount) return res.status(404).json({ error: 'Lead não encontrado.' });
    res.json({ lead: sanitizeCrmLead(result.rows[0]), message: 'Lead atualizado.' });
  } catch (error) { next(error); }
});

app.patch('/api/crm/leads/:id/stage', requireAuth, async (req, res, next) => {
  try {
    const stage = cleanText(req.body?.stage);
    if (!CRM_STAGES.some((item) => item.code === stage)) return res.status(400).json({ error: 'Etapa inválida.' });
    const result = await query(`
      UPDATE crm_leads SET stage=$2::text, updated_at=NOW() WHERE id=$1::uuid AND deleted_at IS NULL RETURNING *
    `, [req.params.id, stage]);
    if (!result.rowCount) return res.status(404).json({ error: 'Lead não encontrado.' });
    res.json({ lead: sanitizeCrmLead(result.rows[0]), message: 'Etapa atualizada.' });
  } catch (error) { next(error); }
});

app.delete('/api/crm/leads/:id', requireAuth, async (req, res, next) => {
  try {
    const result = await query(`UPDATE crm_leads SET deleted_at=NOW(), updated_at=NOW() WHERE id=$1::uuid AND deleted_at IS NULL RETURNING id`, [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Lead não encontrado.' });
    res.json({ ok: true, message: 'Lead removido.' });
  } catch (error) { next(error); }
});

app.get('/api/crm/leads/:id/interactions', requireAuth, async (req, res, next) => {
  try {
    const result = await query(`
      SELECT * FROM crm_interactions
      WHERE lead_id=$1::uuid
      ORDER BY occurred_at DESC, created_at DESC
      LIMIT 120
    `, [req.params.id]);
    res.json({ items: result.rows.map(sanitizeCrmInteraction) });
  } catch (error) { next(error); }
});

app.post('/api/crm/leads/:id/interactions', requireAuth, async (req, res, next) => {
  try {
    const message = cleanText(req.body?.message);
    if (!message) return res.status(400).json({ error: 'Informe a mensagem/interação.' });
    const lead = await query('SELECT * FROM crm_leads WHERE id=$1::uuid AND deleted_at IS NULL LIMIT 1', [req.params.id]);
    if (!lead.rowCount) return res.status(404).json({ error: 'Lead não encontrado.' });
    const result = await query(`
      INSERT INTO crm_interactions (lead_id, tutor_id, channel, direction, subject, message, occurred_at)
      VALUES ($1::uuid, NULLIF($2::text,'')::uuid, $3::text, $4::text, $5::text, $6::text, COALESCE(NULLIF($7::text,'')::timestamptz, NOW()))
      RETURNING *
    `, [req.params.id, lead.rows[0].tutor_id || '', cleanText(req.body?.channel) || 'whatsapp', cleanText(req.body?.direction) || 'outbound', cleanText(req.body?.subject), message, cleanText(req.body?.occurredAt) || '']);
    await query('UPDATE crm_leads SET last_contact_at=NOW(), updated_at=NOW() WHERE id=$1::uuid', [req.params.id]);
    res.status(201).json({ interaction: sanitizeCrmInteraction(result.rows[0]), message: 'Interação registrada.' });
  } catch (error) { next(error); }
});

app.get('/api/crm/messages/templates', requireAuth, async (req, res) => {
  res.json({ items: [
    { id: 'retorno', title: 'Cliente inativo', text: 'Oi, {{nome}}! Sentimos falta do seu pet aqui no PetFunny. Quer reservar um horário esta semana?' },
    { id: 'aniversario_pet', title: 'Aniversário do pet', text: 'Hoje é um dia especial para o {{pet}}! Que tal comemorar com um banho caprichado e mimo PetFunny?' },
    { id: 'pacote', title: 'Oferta de pacote', text: 'Oi, {{nome}}! Temos pacotes mensais para manter o {{pet}} sempre limpinho com economia. Quer que eu te envie as opções?' },
    { id: 'pos_atendimento', title: 'Pós-atendimento', text: 'Oi, {{nome}}! Como ficou o {{pet}} depois do atendimento? Sua opinião ajuda muito o PetFunny.' }
  ] });
});


function sanitizeGift(row = {}) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    probabilityWeight: Number(row.probability_weight || 1),
    estimatedCostCents: Number(row.estimated_cost_cents || 0),
    status: row.status || 'active',
    aiReport: row.ai_report || null,
    spinsCount: Number(row.spins_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function sanitizeGiftSpin(row = {}) {
  return {
    id: row.id,
    giftId: row.gift_id,
    tutorId: row.tutor_id,
    tutorName: row.tutor_name,
    petId: row.pet_id,
    petName: row.pet_name,
    resultTitle: row.result_title,
    spinContext: row.spin_context || {},
    spunAt: row.spun_at,
    createdAt: row.created_at
  };
}

function isRoletaSchemaCompatibilityError(error) {
  return ['42P01', '42703', '42883', '42P07', '22P02', '42846'].includes(String(error?.code || ''));
}

const roletaColumnCache = new Map();

async function getTableColumns(tableName) {
  if (roletaColumnCache.has(tableName)) return roletaColumnCache.get(tableName);
  const result = await query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = $1::text
  `, [tableName]);
  const columns = new Set(result.rows.map((row) => row.column_name));
  roletaColumnCache.set(tableName, columns);
  return columns;
}

async function hasTable(tableName) {
  const result = await query(`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name = $1::text
    ) AS exists
  `, [tableName]);
  return Boolean(result.rows[0]?.exists);
}

function roletaGiftSelectExpression(columns) {
  const col = (name, fallback) => columns.has(name) ? `g.${name}` : fallback;
  return [
    col('id', 'NULL::uuid') + ' AS id',
    col('title', col('name', "'Mimo PetFunny'::text")) + ' AS title',
    col('description', "''::text") + ' AS description',
    col('starts_on', 'NULL::date') + ' AS starts_on',
    col('ends_on', 'NULL::date') + ' AS ends_on',
    col('probability_weight', '1::int') + ' AS probability_weight',
    col('estimated_cost_cents', '0::int') + ' AS estimated_cost_cents',
    col('status', "'active'::text") + ' AS status',
    col('ai_report', 'NULL::jsonb') + ' AS ai_report',
    col('created_at', 'NULL::timestamptz') + ' AS created_at',
    col('updated_at', 'NULL::timestamptz') + ' AS updated_at'
  ].join(', ');
}

const ROLETTA_GIFT_TABLES = ['gifts', 'mimos', 'roleta_mimos', 'roulette_gifts', 'roulette_rewards'];

function safeGiftTableName(tableName) {
  const value = String(tableName || '');
  if (!ROLETTA_GIFT_TABLES.includes(value) || !/^[a-z_]+$/.test(value)) {
    throw Object.assign(new Error('Tabela de mimos inválida.'), { status: 500 });
  }
  return value;
}

function giftColumnExpression(columns, alias, names, fallback) {
  for (const name of names) {
    if (columns.has(name)) return `${alias}.${name}`;
  }
  return fallback;
}

function giftStatusExpression(columns, alias = 'g') {
  if (columns.has('status')) return `COALESCE(NULLIF(${alias}.status::text,''),'active')`;
  if (columns.has('is_active')) return `CASE WHEN COALESCE(${alias}.is_active, true) THEN 'active' ELSE 'inactive' END`;
  if (columns.has('active')) return `CASE WHEN COALESCE(${alias}.active, true) THEN 'active' ELSE 'inactive' END`;
  if (columns.has('ativo')) return `CASE WHEN COALESCE(${alias}.ativo, true) THEN 'active' ELSE 'inactive' END`;
  return `'active'::text`;
}

function giftTitleExpression(columns, alias = 'g') {
  return giftColumnExpression(columns, alias, ['title', 'name', 'titulo', 'nome'], `'Mimo PetFunny'::text`);
}

function giftDescriptionExpression(columns, alias = 'g') {
  return giftColumnExpression(columns, alias, ['description', 'descricao', 'details', 'observations', 'notes'], `''::text`);
}

function giftStartExpression(columns, alias = 'g') {
  return giftColumnExpression(columns, alias, ['starts_on', 'start_date', 'valid_from', 'data_inicio', 'inicio'], 'NULL::date');
}

function giftEndExpression(columns, alias = 'g') {
  return giftColumnExpression(columns, alias, ['ends_on', 'end_date', 'valid_until', 'valid_to', 'data_fim', 'fim'], 'NULL::date');
}

function giftWeightExpression(columns, alias = 'g') {
  return giftColumnExpression(columns, alias, ['probability_weight', 'weight', 'peso', 'probability'], '1::int');
}

function giftCostExpression(columns, alias = 'g') {
  return giftColumnExpression(columns, alias, ['estimated_cost_cents', 'cost_cents', 'custo_centavos'], '0::int');
}

async function listGiftsFromTable(tableName, { search = '%%', status = 'all' } = {}) {
  tableName = safeGiftTableName(tableName);
  if (!(await hasTable(tableName))) return [];
  const columns = await getTableColumns(tableName);
  if (!columns.has('id')) return [];
  const spinsExists = await hasTable('gift_spins');
  const spinColumns = spinsExists ? await getTableColumns('gift_spins').catch(() => new Set()) : new Set();
  const alias = 'g';
  const idExpr = `${alias}.id::text`;
  const titleExpr = giftTitleExpression(columns, alias);
  const descriptionExpr = giftDescriptionExpression(columns, alias);
  const statusExpr = giftStatusExpression(columns, alias);
  const probabilityExpr = `COALESCE((${giftWeightExpression(columns, alias)})::int, 1)`;
  const costExpr = `COALESCE((${giftCostExpression(columns, alias)})::int, 0)`;
  // Mantém as datas em texto para suportar bancos legados onde datas da roleta
  // foram gravadas como texto vazio/formatos antigos. O frontend só precisa listar,
  // e a validação real de vigência é feita com conversão segura em JS quando necessário.
  const startsExpr = `${giftStartExpression(columns, alias)}::text`;
  const endsExpr = `${giftEndExpression(columns, alias)}::text`;
  const createdExpr = columns.has('created_at') ? `${alias}.created_at` : 'NULL::timestamptz';
  const updatedExpr = columns.has('updated_at') ? `${alias}.updated_at` : 'NULL::timestamptz';
  const aiExpr = columns.has('ai_report') ? `${alias}.ai_report` : 'NULL::jsonb';
  const deletedWhere = columns.has('deleted_at') ? `AND ${alias}.deleted_at IS NULL` : '';
  const spinsCount = (spinsExists && spinColumns.has('gift_id')) ? `(SELECT COUNT(*)::int FROM gift_spins gs WHERE gs.gift_id::text = ${idExpr})` : '0::int';

  const result = await query(`
    SELECT
      ${idExpr} AS id,
      ${titleExpr}::text AS title,
      COALESCE(${descriptionExpr}::text,'') AS description,
      ${startsExpr} AS starts_on,
      ${endsExpr} AS ends_on,
      ${probabilityExpr} AS probability_weight,
      ${costExpr} AS estimated_cost_cents,
      ${statusExpr} AS status,
      ${aiExpr} AS ai_report,
      ${createdExpr} AS created_at,
      ${updatedExpr} AS updated_at,
      ${spinsCount} AS spins_count,
      '${tableName}'::text AS source_table
    FROM ${tableName} ${alias}
    WHERE ($1::text = '%%' OR ${titleExpr}::text ILIKE $1::text OR ${descriptionExpr}::text ILIKE $1::text)
      AND ($2::text = 'all' OR ${statusExpr} = $2::text)
      ${deletedWhere}
    ORDER BY
      CASE ${statusExpr} WHEN 'active' THEN 1 WHEN 'inactive' THEN 2 WHEN 'expired' THEN 3 ELSE 4 END,
      ${createdExpr} DESC NULLS LAST,
      ${titleExpr} ASC
    LIMIT 300
  `, [search, status]);
  return result.rows || [];
}


async function listGiftsPrimaryForAdmin({ search = '%%', status = 'all' } = {}) {
  // Fonte canônica usada também pelo App do Tutor. Esta consulta é intencionalmente
  // simples para bancos já migrados: se o app mostra mimos ativos em `gifts`,
  // o admin deve listar a mesma base em “Mimos configurados”.
  const result = await query(`
    SELECT
      g.id::text AS id,
      COALESCE(NULLIF(g.title::text,''), 'Mimo PetFunny') AS title,
      COALESCE(g.description::text, '') AS description,
      g.starts_on::text AS starts_on,
      g.ends_on::text AS ends_on,
      COALESCE(g.probability_weight, 1)::int AS probability_weight,
      COALESCE(g.estimated_cost_cents, 0)::int AS estimated_cost_cents,
      COALESCE(NULLIF(g.status::text,''), 'active') AS status,
      g.ai_report AS ai_report,
      g.created_at AS created_at,
      g.updated_at AS updated_at,
      0::int AS spins_count,
      'gifts'::text AS source_table
    FROM gifts g
    WHERE g.deleted_at IS NULL
      AND ($1::text = '%%' OR g.title::text ILIKE $1::text OR COALESCE(g.description::text,'') ILIKE $1::text)
      AND ($2::text = 'all' OR COALESCE(NULLIF(g.status::text,''), 'active') = $2::text)
    ORDER BY
      CASE COALESCE(NULLIF(g.status::text,''), 'active') WHEN 'active' THEN 1 WHEN 'inactive' THEN 2 WHEN 'expired' THEN 3 ELSE 4 END,
      g.created_at DESC NULLS LAST,
      g.title ASC
    LIMIT 300
  `, [search, status]);
  return { rows: result.rows || [], rowCount: result.rowCount || 0 };
}

async function listGiftsCompat({ search = '%%', status = 'all' } = {}) {
  const rows = [];
  for (const tableName of ROLETTA_GIFT_TABLES) {
    try {
      rows.push(...await listGiftsFromTable(tableName, { search, status }));
    } catch (error) {
      if (!isRoletaSchemaCompatibilityError(error)) throw error;
      console.warn(`[roleta] tabela ${tableName} ignorada por compatibilidade: ${error.message}`);
    }
  }
  const unique = [];
  const seen = new Set();
  for (const row of rows) {
    const key = `${row.source_table}:${row.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(row);
  }
  unique.sort((a, b) => {
    const order = { active: 1, inactive: 2, expired: 3 };
    const statusDiff = (order[a.status] || 4) - (order[b.status] || 4);
    if (statusDiff) return statusDiff;
    const dateDiff = new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    if (dateDiff) return dateDiff;
    return String(a.title || '').localeCompare(String(b.title || ''), 'pt-BR');
  });
  return { rows: unique, rowCount: unique.length };
}

async function resolveGiftTableById(id) {
  const safeId = cleanText(id);
  if (!safeId) return null;
  for (const tableName of ROLETTA_GIFT_TABLES) {
    if (!(await hasTable(tableName))) continue;
    const columns = await getTableColumns(tableName);
    if (!columns.has('id')) continue;
    const deletedWhere = columns.has('deleted_at') ? 'AND deleted_at IS NULL' : '';
    const exists = await query(`SELECT 1 FROM ${safeGiftTableName(tableName)} WHERE id::text=$1::text ${deletedWhere} LIMIT 1`, [safeId]);
    if (exists.rowCount) return { tableName, columns };
  }
  return null;
}

async function insertGiftCompat(payload = {}) {
  if (!(await hasTable('gifts'))) throw Object.assign(new Error('Tabela gifts não encontrada. Rode npm run db:migrate.'), { status: 500 });
  const columns = await getTableColumns('gifts');
  const data = {
    title: cleanText(payload.title),
    name: cleanText(payload.title),
    description: cleanText(payload.description),
    starts_on: cleanText(payload.startsOn),
    ends_on: cleanText(payload.endsOn),
    probability_weight: Math.max(1, Number(payload.probabilityWeight || 1)),
    estimated_cost_cents: moneyToCents(payload.estimatedCostCents ?? payload.estimatedCost),
    status: cleanText(payload.status || 'active'),
    ai_report: JSON.stringify(payload.aiReport || null)
  };
  const insertColumns = [];
  const values = [];
  const params = [];
  const add = (column, cast = 'text') => {
    if (!columns.has(column)) return;
    insertColumns.push(column);
    params.push(data[column]);
    if (column === 'starts_on' || column === 'ends_on') values.push(`NULLIF($${params.length}::text,'')::date`);
    else if (column === 'probability_weight') values.push(`GREATEST($${params.length}::int, 1)`);
    else if (column === 'estimated_cost_cents') values.push(`GREATEST($${params.length}::int, 0)`);
    else if (column === 'ai_report') values.push(`$${params.length}::jsonb`);
    else values.push(`$${params.length}::${cast}`);
  };
  add(columns.has('title') ? 'title' : 'name');
  add('description'); add('starts_on'); add('ends_on'); add('probability_weight'); add('estimated_cost_cents'); add('status'); add('ai_report');
  const result = await query(`INSERT INTO gifts (${insertColumns.join(', ')}) VALUES (${values.join(', ')}) RETURNING *`, params);
  return result;
}

async function updateGiftCompat(id, payload = {}) {
  const resolved = await resolveGiftTableById(id);
  if (!resolved) return { rows: [], rowCount: 0 };
  const { tableName, columns } = resolved;
  const sets = [];
  const params = [cleanText(id)];
  const add = (column, value, expression) => {
    if (!columns.has(column)) return;
    params.push(value);
    sets.push(`${column}=${expression || `$${params.length}::text`}`);
  };
  if (columns.has('title')) add('title', cleanText(payload.title));
  else if (columns.has('name')) add('name', cleanText(payload.title));
  else if (columns.has('titulo')) add('titulo', cleanText(payload.title));
  else add('nome', cleanText(payload.title));
  add('description', cleanText(payload.description));
  add('descricao', cleanText(payload.description));
  add('starts_on', cleanText(payload.startsOn), `NULLIF($${params.length + 1}::text,'')::date`);
  add('start_date', cleanText(payload.startsOn), `NULLIF($${params.length + 1}::text,'')::date`);
  add('valid_from', cleanText(payload.startsOn), `NULLIF($${params.length + 1}::text,'')::date`);
  add('ends_on', cleanText(payload.endsOn), `NULLIF($${params.length + 1}::text,'')::date`);
  add('end_date', cleanText(payload.endsOn), `NULLIF($${params.length + 1}::text,'')::date`);
  add('valid_until', cleanText(payload.endsOn), `NULLIF($${params.length + 1}::text,'')::date`);
  add('probability_weight', Math.max(1, Number(payload.probabilityWeight || 1)), `GREATEST($${params.length + 1}::int, 1)`);
  add('weight', Math.max(1, Number(payload.probabilityWeight || 1)), `GREATEST($${params.length + 1}::int, 1)`);
  add('estimated_cost_cents', moneyToCents(payload.estimatedCostCents ?? payload.estimatedCost), `GREATEST($${params.length + 1}::int, 0)`);
  add('cost_cents', moneyToCents(payload.estimatedCostCents ?? payload.estimatedCost), `GREATEST($${params.length + 1}::int, 0)`);
  add('status', cleanText(payload.status || 'active'));
  add('ai_report', JSON.stringify(payload.aiReport || null), `$${params.length + 1}::jsonb`);
  if (columns.has('is_active')) add('is_active', cleanText(payload.status || 'active') === 'active', `$${params.length + 1}::boolean`);
  if (columns.has('active')) add('active', cleanText(payload.status || 'active') === 'active', `$${params.length + 1}::boolean`);
  if (columns.has('ativo')) add('ativo', cleanText(payload.status || 'active') === 'active', `$${params.length + 1}::boolean`);
  if (columns.has('updated_at')) sets.push('updated_at=NOW()');
  const deletedWhere = columns.has('deleted_at') ? 'AND deleted_at IS NULL' : '';
  const result = await query(`UPDATE ${safeGiftTableName(tableName)} SET ${sets.join(', ')} WHERE id::text=$1::text ${deletedWhere} RETURNING *`, params);
  return result;
}

async function setGiftStatusCompat(id, status) {
  const resolved = await resolveGiftTableById(id);
  if (!resolved) return { rows: [], rowCount: 0 };
  const { tableName, columns } = resolved;
  const sets = [];
  const params = [cleanText(id), cleanText(status || 'active')];
  if (columns.has('status')) sets.push('status=$2::text');
  if (columns.has('is_active')) sets.push('is_active=($2::text = \'active\')');
  if (columns.has('active')) sets.push('active=($2::text = \'active\')');
  if (columns.has('ativo')) sets.push('ativo=($2::text = \'active\')');
  if (!sets.length) return { rows: [], rowCount: 0 };
  if (columns.has('updated_at')) sets.push('updated_at=NOW()');
  const deletedWhere = columns.has('deleted_at') ? 'AND deleted_at IS NULL' : '';
  return await query(`UPDATE ${safeGiftTableName(tableName)} SET ${sets.join(', ')} WHERE id::text=$1::text ${deletedWhere} RETURNING *`, params);
}

async function deleteGiftCompat(id) {
  const resolved = await resolveGiftTableById(id);
  if (!resolved) return { rows: [], rowCount: 0 };
  const { tableName, columns } = resolved;
  if (columns.has('deleted_at')) {
    const updatedSet = columns.has('updated_at') ? ', updated_at=NOW()' : '';
    return await query(`UPDATE ${safeGiftTableName(tableName)} SET deleted_at=NOW() ${updatedSet} WHERE id::text=$1::text AND deleted_at IS NULL RETURNING id`, [cleanText(id)]);
  }
  return await query(`DELETE FROM ${safeGiftTableName(tableName)} WHERE id::text=$1::text RETURNING id`, [cleanText(id)]);
}


function pickWeightedGift(gifts = []) {
  const active = gifts.filter((gift) => Number(gift.probability_weight || 0) > 0);
  const total = active.reduce((sum, gift) => sum + Number(gift.probability_weight || 0), 0);
  if (!active.length || total <= 0) return null;
  let cursor = Math.random() * total;
  for (const gift of active) {
    cursor -= Number(gift.probability_weight || 0);
    if (cursor <= 0) return gift;
  }
  return active[active.length - 1];
}

app.get('/api/roleta/options', requireAuth, async (req, res, next) => {
  try {
    const tutors = await query(`
      SELECT id, name, whatsapp
      FROM tutors
      WHERE deleted_at IS NULL
      ORDER BY name ASC
      LIMIT 500
    `);
    const pets = await query(`
      SELECT p.id, p.name, p.tutor_id, t.name AS tutor_name
      FROM pets p
      LEFT JOIN tutors t ON t.id = p.tutor_id
      WHERE p.deleted_at IS NULL
      ORDER BY p.name ASC
      LIMIT 500
    `);
    res.json({
      tutors: tutors.rows.map(sanitizeTutor),
      pets: pets.rows.map((pet) => ({ id: pet.id, name: pet.name, tutorId: pet.tutor_id, tutorName: pet.tutor_name })),
      statuses: [
        { code: 'active', name: 'Ativo' },
        { code: 'inactive', name: 'Inativo' },
        { code: 'expired', name: 'Encerrado' }
      ]
    });
  } catch (error) { next(error); }
});

app.get('/api/roleta/summary', requireAuth, async (req, res, next) => {
  try {
    let gifts;
    try {
      gifts = await listGiftsPrimaryForAdmin({ search: '%%', status: 'all' });
    } catch (primaryError) {
      console.warn(`[roleta] resumo principal de gifts falhou; usando compatibilidade: ${primaryError.message}`);
      gifts = await listGiftsCompat({ search: '%%', status: 'all' });
    }
    const rows = gifts.rows || [];
    const now = new Date();
    const todayIso = now.toISOString().slice(0, 10);
    const activeRows = rows.filter((gift) => {
      const status = String(gift.status || 'active');
      const startsOk = !gift.starts_on || String(gift.starts_on).slice(0, 10) <= todayIso;
      const endsOk = !gift.ends_on || String(gift.ends_on).slice(0, 10) >= todayIso;
      return status === 'active' && startsOk && endsOk;
    });
    let spinSummary = { spins_today: 0, spins_month: 0, estimated_cost_month_cents: 0 };
    let recentSpins = [];
    if (await hasTable('gift_spins')) {
      const spinColumns = await getTableColumns('gift_spins').catch(() => new Set());
      const hasSpunAt = spinColumns.has('spun_at');
      const dateExpr = hasSpunAt ? 'gs.spun_at' : (spinColumns.has('created_at') ? 'gs.created_at' : 'NOW()');
      const giftJoin = spinColumns.has('gift_id') ? 'LEFT JOIN gifts g ON g.id = gs.gift_id' : 'LEFT JOIN gifts g ON false';
      const tutorJoin = spinColumns.has('tutor_id') ? 'LEFT JOIN tutors t ON t.id = gs.tutor_id' : 'LEFT JOIN tutors t ON false';
      const petJoin = spinColumns.has('pet_id') ? 'LEFT JOIN pets p ON p.id = gs.pet_id' : 'LEFT JOIN pets p ON false';
      const summaryResult = await query(`
        SELECT
          COUNT(*) FILTER (WHERE (${dateExpr})::date = CURRENT_DATE)::int AS spins_today,
          COUNT(*) FILTER (WHERE date_trunc('month', ${dateExpr}) = date_trunc('month', NOW()))::int AS spins_month,
          COALESCE(SUM(COALESCE(g.estimated_cost_cents,0)) FILTER (WHERE date_trunc('month', ${dateExpr}) = date_trunc('month', NOW())),0)::int AS estimated_cost_month_cents
        FROM gift_spins gs
        ${giftJoin}
      `);
      spinSummary = summaryResult.rows[0] || spinSummary;
      const recent = await query(`
        SELECT gs.*, t.name AS tutor_name, p.name AS pet_name, ${dateExpr} AS spun_at
        FROM gift_spins gs
        ${tutorJoin}
        ${petJoin}
        ORDER BY ${dateExpr} DESC
        LIMIT 12
      `);
      recentSpins = recent.rows.map(sanitizeGiftSpin);
    }
    res.json({
      summary: {
        total_gifts: rows.length,
        active_gifts: activeRows.length,
        spins_today: Number(spinSummary.spins_today || 0),
        spins_month: Number(spinSummary.spins_month || 0),
        estimated_cost_month_cents: Number(spinSummary.estimated_cost_month_cents || 0)
      },
      recentSpins
    });
  } catch (error) { next(error); }
});

app.get('/api/roleta/gifts', requireAuth, async (req, res, next) => {
  try {
    const searchTerm = cleanText(req.query.search || '') || '';
    const search = `%${searchTerm}%`;
    const status = cleanText(req.query.status || 'all') || 'all';
    let result;
    let source = 'primary:gifts';
    try {
      result = await listGiftsPrimaryForAdmin({ search, status });
      // Correção definitiva: em alguns bancos antigos a consulta principal não
      // quebra, mas volta vazia porque os mimos foram gravados por uma versão
      // legada. Nesse caso o admin precisa cair para a leitura compatível, em
      // vez de mostrar “Nenhum mimo cadastrado.” enquanto o app do tutor vê ativos.
      if (!result?.rowCount) {
        const compat = await listGiftsCompat({ search, status });
        if (compat?.rowCount) {
          result = compat;
          source = 'compat:legacy-gift-tables';
        }
      }
    } catch (primaryError) {
      console.warn(`[roleta] leitura principal de gifts falhou; usando compatibilidade: ${primaryError.message}`);
      result = await listGiftsCompat({ search, status });
      source = 'compat:primary-error';
    }
    const rows = result?.rows || [];
    res.json({ items: rows.map(sanitizeGift), total: rows.length, source });
  } catch (error) { next(error); }
});

app.post('/api/roleta/gifts', requireAuth, async (req, res, next) => {
  try {
    const title = cleanText(req.body?.title);
    if (!title) return res.status(400).json({ error: 'Informe o título do mimo.' });
    const result = await insertGiftCompat(req.body || {});
    roletaColumnCache.delete('gifts');
    res.status(201).json({ gift: sanitizeGift(result.rows[0]), message: 'Mimo cadastrado.' });
  } catch (error) { next(error); }
});

app.put('/api/roleta/gifts/:id', requireAuth, async (req, res, next) => {
  try {
    const title = cleanText(req.body?.title);
    if (!title) return res.status(400).json({ error: 'Informe o título do mimo.' });
    const result = await updateGiftCompat(req.params.id, req.body || {});
    if (!result.rowCount) return res.status(404).json({ error: 'Mimo não encontrado.' });
    res.json({ gift: sanitizeGift(result.rows[0]), message: 'Mimo atualizado.' });
  } catch (error) { next(error); }
});

app.patch('/api/roleta/gifts/:id/status', requireAuth, async (req, res, next) => {
  try {
    const status = cleanText(req.body?.status || 'active');
    const result = await setGiftStatusCompat(req.params.id, status);
    if (!result.rowCount) return res.status(404).json({ error: 'Mimo não encontrado.' });
    res.json({ gift: sanitizeGift(result.rows[0]), message: 'Status do mimo atualizado.' });
  } catch (error) { next(error); }
});

app.delete('/api/roleta/gifts/:id', requireAuth, async (req, res, next) => {
  try {
    const result = await deleteGiftCompat(req.params.id);
    if (!result.rowCount) return res.status(404).json({ error: 'Mimo não encontrado.' });
    res.json({ ok: true, message: 'Mimo removido.' });
  } catch (error) { next(error); }
});

app.post('/api/roleta/spin', requireAuth, async (req, res, next) => {
  try {
    const result = await listGiftsCompat({ search: '%%', status: 'active' });
    const todayIso = new Date().toISOString().slice(0, 10);
    const availableRows = result.rows.filter((gift) => {
      const startsOk = !gift.starts_on || String(gift.starts_on).slice(0, 10) <= todayIso;
      const endsOk = !gift.ends_on || String(gift.ends_on).slice(0, 10) >= todayIso;
      return startsOk && endsOk && Number(gift.probability_weight || 0) > 0;
    });
    const gift = pickWeightedGift(availableRows);
    if (!gift) return res.status(400).json({ error: 'Nenhum mimo ativo disponível para sortear.' });
    if (!(await hasTable('gift_spins'))) {
      return res.status(201).json({ spin: { resultTitle: gift.title, spunAt: new Date().toISOString() }, gift: sanitizeGift(gift), message: `Resultado: ${gift.title}` });
    }
    const insert = await query(`
      INSERT INTO gift_spins (gift_id, tutor_id, pet_id, result_title, spin_context)
      VALUES ($1::uuid, NULLIF($2::text,'')::uuid, NULLIF($3::text,'')::uuid, $4::text, $5::jsonb)
      RETURNING *
    `, [
      gift.id,
      cleanText(req.body?.tutorId),
      cleanText(req.body?.petId),
      gift.title,
      JSON.stringify({ source: 'admin_simulation', weightsTotal: availableRows.reduce((sum, item) => sum + Number(item.probability_weight || 0), 0) })
    ]);
    res.status(201).json({ spin: sanitizeGiftSpin(insert.rows[0]), gift: sanitizeGift(gift), message: `Resultado: ${gift.title}` });
  } catch (error) { next(error); }
});

app.get('/api/roleta/spins', requireAuth, async (req, res, next) => {
  try {
    if (!(await hasTable('gift_spins'))) return res.json({ items: [] });
    const result = await query(`
      SELECT gs.*, t.name AS tutor_name, p.name AS pet_name
      FROM gift_spins gs
      LEFT JOIN tutors t ON t.id = gs.tutor_id
      LEFT JOIN pets p ON p.id = gs.pet_id
      ORDER BY gs.spun_at DESC
      LIMIT 100
    `);
    res.json({ items: result.rows.map(sanitizeGiftSpin) });
  } catch (error) { next(error); }
});

app.post('/api/roleta/ai-suggestions', requireAuth, async (req, res) => {
  const durationDays = Math.max(7, Number(req.body?.durationDays || 30));
  const monthlySpins = Math.max(20, Number(req.body?.monthlySpins || 80));
  const suggestions = [
    { title: 'Laço especial', description: 'Mimo barato, visual e recorrente para aumentar percepção de cuidado.', probabilityWeight: 10, estimatedCostCents: 350, suggestedQuantity: Math.ceil(monthlySpins * 0.35) },
    { title: 'Bandana temática', description: 'Brinde com alto potencial de foto e divulgação espontânea.', probabilityWeight: 5, estimatedCostCents: 950, suggestedQuantity: Math.ceil(monthlySpins * 0.16) },
    { title: '10% OFF no próximo banho', description: 'Incentivo de retorno sem impacto imediato no caixa.', probabilityWeight: 8, estimatedCostCents: 0, suggestedQuantity: Math.ceil(monthlySpins * 0.25) },
    { title: 'Hidratação com desconto', description: 'Upsell controlado para serviços premium.', probabilityWeight: 4, estimatedCostCents: 0, suggestedQuantity: Math.ceil(monthlySpins * 0.12) },
    { title: 'Banho grátis hoje', description: 'Prêmio raro para gerar encantamento, com probabilidade baixa pelo custo.', probabilityWeight: 1, estimatedCostCents: 6500, suggestedQuantity: Math.max(1, Math.ceil(monthlySpins * 0.02)) }
  ];
  const estimatedCostCents = suggestions.reduce((sum, item) => sum + (item.estimatedCostCents * item.suggestedQuantity), 0);
  res.json({
    report: {
      title: 'Sugestões de mimos para Roleta PetFunny',
      durationDays,
      monthlySpins,
      estimatedCostCents,
      strategy: 'Misturar mimos baratos de alta frequência com prêmios raros de alto impacto para controlar custo e aumentar encantamento.',
      suggestions
    }
  });
});


function resolvePeriodWindow(input = {}) {
  const now = new Date();
  const cleanPeriod = cleanText(input.period) || 'month';
  const rawMonth = cleanText(input.month);
  const rawStartDate = cleanText(input.startDate);
  const rawEndDate = cleanText(input.endDate);
  const isIsoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || '');
  const toUTCDate = (value) => {
    const [year, month, day] = String(value).split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  };
  const monthMatch = /^(\d{4})-(\d{2})$/.exec(rawMonth || '');
  const baseYear = monthMatch ? Number(monthMatch[1]) : now.getFullYear();
  const baseMonth = monthMatch ? Number(monthMatch[2]) - 1 : now.getMonth();
  let start = new Date(Date.UTC(baseYear, baseMonth, 1));
  let end = new Date(Date.UTC(baseYear, baseMonth + 1, 1));
  let label = start.toLocaleDateString('pt-BR', { timeZone: 'UTC', month: 'long', year: 'numeric' });
  if (cleanPeriod === 'custom' && isIsoDate(rawStartDate) && isIsoDate(rawEndDate)) {
    start = toUTCDate(rawStartDate);
    end = toUTCDate(rawEndDate);
    end.setUTCDate(end.getUTCDate() + 1);
    label = `${start.toLocaleDateString('pt-BR', { timeZone: 'UTC' })} a ${toUTCDate(rawEndDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}`;
  } else if (cleanPeriod === 'last7') {
    end = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() + 1));
    start = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() - 6));
    label = 'últimos 7 dias';
  } else if (cleanPeriod === 'last30') {
    end = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() + 1));
    start = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() - 29));
    label = 'últimos 30 dias';
  } else if (cleanPeriod === 'year') {
    start = new Date(Date.UTC(baseYear, 0, 1));
    end = new Date(Date.UTC(baseYear + 1, 0, 1));
    label = String(baseYear);
  }
  if (end <= start) {
    end = new Date(start.getTime());
    end.setUTCDate(end.getUTCDate() + 1);
  }
  const previousStart = new Date(start.getTime() - (end.getTime() - start.getTime()));
  const previousEnd = new Date(start.getTime());
  const toISODate = (date) => date.toISOString().slice(0, 10);
  return { period: cleanPeriod, month: `${baseYear}-${String(baseMonth + 1).padStart(2, '0')}`, start: toISODate(start), end: toISODate(end), previousStart: toISODate(previousStart), previousEnd: toISODate(previousEnd), label };
}

app.get('/api/financeiro/options', requireAuth, async (req, res, next) => {
  try {
    const paymentMethods = await query(`
      SELECT * FROM payment_methods
      WHERE is_active = TRUE
        AND deleted_at IS NULL
      ORDER BY sort_order ASC, name ASC
    `);
    const paymentStatuses = await query(`
      SELECT * FROM payment_statuses
      WHERE is_active = TRUE
        AND deleted_at IS NULL
      ORDER BY sort_order ASC, name ASC
    `);
    const tutors = await query(`
      SELECT id, name, whatsapp
      FROM tutors
      WHERE deleted_at IS NULL
      ORDER BY name ASC
      LIMIT 500
    `);
    res.json({
      paymentMethods: paymentMethods.rows.map(sanitizePaymentMethod),
      paymentStatuses: paymentStatuses.rows.map(sanitizePaymentStatus),
      tutors: tutors.rows.map(sanitizeTutor),
      categories: [
        'atendimento', 'pacote', 'assinatura', 'produto', 'taxa', 'aluguel', 'fornecedor', 'salario', 'marketing', 'outros'
      ],
      statuses: paymentStatuses.rows.map(row => row.code),
      types: ['income', 'expense']
    });
  } catch (error) { next(error); }
});

app.get('/api/financeiro/summary', requireAuth, async (req, res, next) => {
  try {
    const periodWindow = resolvePeriodWindow({ period: req.query.period || 'month', month: req.query.month, startDate: req.query.startDate, endDate: req.query.endDate });
    const periodParams = [periodWindow.start, periodWindow.end];
    const summary = await query(`
      WITH due_base AS (
        SELECT * FROM financial_transactions
        WHERE deleted_at IS NULL
          AND status <> 'canceled'
          AND COALESCE(due_date, paid_at::date, created_at::date) >= $1::date
          AND COALESCE(due_date, paid_at::date, created_at::date) < $2::date
      ), paid_base AS (
        SELECT * FROM financial_transactions
        WHERE deleted_at IS NULL
          AND status = 'paid'
          AND paid_at::date >= $1::date
          AND paid_at::date < $2::date
      ), payments_today AS (
        SELECT COALESCE(SUM(amount_cents),0)::int AS total FROM payments WHERE paid_at::date = CURRENT_DATE
      )
      SELECT
        (SELECT total FROM payments_today) AS revenue_today_cents,
        COALESCE((SELECT SUM(amount_cents) FROM due_base WHERE type='income'),0)::int AS income_due_period_cents,
        COALESCE((SELECT SUM(amount_cents) FROM due_base WHERE type='expense'),0)::int AS expense_due_period_cents,
        COALESCE((SELECT SUM(amount_cents) FROM paid_base WHERE type='income'),0)::int AS paid_income_period_cents,
        COALESCE((SELECT SUM(amount_cents) FROM paid_base WHERE type='expense'),0)::int AS paid_expense_period_cents,
        COALESCE((SELECT SUM(amount_cents) FROM due_base WHERE type='income' AND status <> 'paid'),0)::int AS pending_income_cents,
        COUNT(*) FILTER (WHERE type='income' AND status <> 'paid')::int AS pending_income_count,
        COALESCE((SELECT SUM(amount_cents) FROM due_base WHERE type='expense' AND status <> 'paid'),0)::int AS pending_expense_cents,
        COUNT(*) FILTER (WHERE type='expense' AND status <> 'paid')::int AS pending_expense_count,
        COALESCE((SELECT SUM(amount_cents) FROM paid_base WHERE type='income' AND paid_at::date = CURRENT_DATE),0)::int AS paid_income_today_cents,
        COALESCE((SELECT SUM(amount_cents) FROM paid_base WHERE type='expense' AND paid_at::date = CURRENT_DATE),0)::int AS paid_expense_today_cents,
        COALESCE((SELECT SUM(amount_cents) FROM due_base WHERE type='income' AND status <> 'paid' AND COALESCE(due_date, created_at::date) < CURRENT_DATE),0)::int AS overdue_income_cents,
        COALESCE((SELECT COUNT(*) FROM due_base WHERE type='income' AND status <> 'paid' AND COALESCE(due_date, created_at::date) < CURRENT_DATE),0)::int AS overdue_income_count,
        COALESCE((SELECT COUNT(*) FROM due_base WHERE type='income'),0)::int AS income_count,
        COALESCE((SELECT COUNT(*) FROM due_base WHERE type='income' AND status='paid'),0)::int AS paid_income_count
      FROM due_base
    `, periodParams);
    const flow = await query(`
      SELECT to_char(day, 'DD/MM') AS label,
             COALESCE(SUM(ft.amount_cents) FILTER (WHERE ft.type='income'),0)::int AS income_cents,
             COALESCE(SUM(ft.amount_cents) FILTER (WHERE ft.type='expense'),0)::int AS expense_cents,
             COALESCE(SUM(ft.amount_cents) FILTER (WHERE ft.type='income' AND ft.status='paid'),0)::int AS received_cents,
             COALESCE(SUM(ft.amount_cents) FILTER (WHERE ft.type='income' AND ft.status <> 'paid'),0)::int AS projected_cents
      FROM generate_series($1::date, ($2::date - INTERVAL '1 day'), INTERVAL '1 day') day
      LEFT JOIN financial_transactions ft ON ft.deleted_at IS NULL AND COALESCE(ft.due_date, ft.paid_at::date, ft.created_at::date) = day::date AND ft.status <> 'canceled'
      GROUP BY day
      ORDER BY day ASC
    `, periodParams);
    const byCategory = await query(`
      SELECT category, type, COALESCE(SUM(amount_cents),0)::int AS total_cents, COUNT(*)::int AS count
      FROM financial_transactions
      WHERE deleted_at IS NULL AND status <> 'canceled'
        AND COALESCE(due_date, paid_at::date, created_at::date) >= $1::date
        AND COALESCE(due_date, paid_at::date, created_at::date) < $2::date
      GROUP BY category, type
      ORDER BY total_cents DESC
      LIMIT 12
    `, periodParams);
    const receiptsToday = await query(`
      SELECT COALESCE(pm.name, 'Sem forma definida') AS method,
             COALESCE(SUM(pay.amount_cents),0)::int AS total_cents,
             COUNT(*)::int AS count
      FROM payments pay
      LEFT JOIN payment_methods pm ON pm.id = pay.payment_method_id
      WHERE pay.paid_at::date = CURRENT_DATE
      GROUP BY COALESCE(pm.name, 'Sem forma definida')
      ORDER BY total_cents DESC
    `);
    const upcoming = await query(`
      SELECT ft.*, t.name AS tutor_name, t.whatsapp AS tutor_whatsapp,
             p.name AS pet_name, pk.name AS package_name, pm.name AS payment_method_name
      FROM financial_transactions ft
      LEFT JOIN tutors t ON t.id = ft.tutor_id
      LEFT JOIN appointments a ON a.id = ft.appointment_id
      LEFT JOIN pets p ON p.id = a.pet_id
      LEFT JOIN customer_packages cp ON cp.id = ft.customer_package_id
      LEFT JOIN packages pk ON pk.id = cp.package_id
      LEFT JOIN payments pay ON pay.financial_transaction_id = ft.id
      LEFT JOIN payment_methods pm ON pm.id = pay.payment_method_id
      WHERE ft.deleted_at IS NULL
        AND ft.status <> 'paid'
        AND ft.status <> 'canceled'
        AND COALESCE(ft.due_date, ft.created_at::date) >= CURRENT_DATE
        AND COALESCE(ft.due_date, ft.created_at::date) < (CURRENT_DATE + INTERVAL '8 days')
      ORDER BY COALESCE(ft.due_date, ft.created_at::date) ASC, ft.created_at ASC
      LIMIT 8
    `);
    const s = summary.rows[0] || {};
    const incomeDue = Number(s.income_due_period_cents || 0);
    const expenseDue = Number(s.expense_due_period_cents || 0);
    const paidIncome = Number(s.paid_income_period_cents || 0);
    const paidCount = Number(s.paid_income_count || 0);
    const incomeCount = Number(s.income_count || 0);
    const enrichedSummary = {
      ...s,
      estimated_profit_cents: incomeDue - expenseDue,
      realized_profit_cents: paidIncome - Number(s.paid_expense_period_cents || 0),
      payment_rate_percent: incomeCount ? Math.round((paidCount / incomeCount) * 100) : 0
    };
    const alerts = [];
    if (Number(enrichedSummary.overdue_income_count || 0) > 0) alerts.push({ tone: 'danger', title: 'Inadimplência', message: `${enrichedSummary.overdue_income_count} cobrança(s) vencida(s), somando ${enrichedSummary.overdue_income_cents || 0} centavos.` });
    if (Number(enrichedSummary.pending_income_cents || 0) > 0) alerts.push({ tone: 'warning', title: 'A receber', message: `Existem valores em aberto no período por data de vencimento.` });
    if (Number(enrichedSummary.pending_expense_cents || 0) > 0) alerts.push({ tone: 'neutral', title: 'Contas a pagar', message: `Revise despesas pendentes antes do fechamento do caixa.` });
    res.json({
      period: periodWindow,
      dateRules: { forecast: 'due_date', realized: 'paid_at', audit: 'created_at' },
      summary: enrichedSummary,
      flow: flow.rows,
      byCategory: byCategory.rows,
      receiptsToday: receiptsToday.rows,
      upcoming: upcoming.rows.map(sanitizeFinancialTransaction),
      alerts
    });
  } catch (error) { next(error); }
});


// Financeiro 360° v2 — comissões, conciliação, alertas, receita/margem e exportações.
function resolveFinanceDateExpression(alias = 'ft', dateType = 'due') {
  const prefix = alias ? `${alias}.` : '';
  if (dateType === 'paid') return `${prefix}paid_at::date`;
  if (dateType === 'created') return `${prefix}created_at::date`;
  return `COALESCE(${prefix}due_date, ${prefix}paid_at::date, ${prefix}created_at::date)`;
}

function csvEscape(value) {
  const text = String(value ?? '').replace(/"/g, '""');
  return /[";\n\r]/.test(text) ? `"${text}"` : text;
}

function toBRLCents(value = 0) {
  return (Number(value || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function buildFinanceV2ExportRows(rows = []) {
  return rows.map((row) => [
    row.due_date ? new Date(row.due_date).toISOString().slice(0, 10) : '',
    row.paid_at ? new Date(row.paid_at).toISOString().slice(0, 10) : '',
    row.created_at ? new Date(row.created_at).toISOString().slice(0, 10) : '',
    row.tutor_name || '',
    row.pet_name || '',
    row.type || '',
    row.category || '',
    row.description || '',
    toBRLCents(row.amount_cents),
    row.payment_method_name || '',
    row.status || '',
    row.origin || row.source || ''
  ]);
}

app.get('/api/financeiro/360-v2', requireAuth, async (req, res, next) => {
  try {
    const periodWindow = resolvePeriodWindow({ period: req.query.period || 'month', month: req.query.month, startDate: req.query.startDate, endDate: req.query.endDate });
    const dateType = ['due','paid','created'].includes(cleanText(req.query.dateType)) ? cleanText(req.query.dateType) : 'due';
    const dateExpression = resolveFinanceDateExpression('ft', dateType);
    const periodParams = [periodWindow.start, periodWindow.end];

    const commissions = await query(`
      WITH appointment_base AS (
        SELECT a.id, a.collaborator_id, a.starts_at::date AS service_day, a.total_cents,
               c.name AS collaborator_name,
               COUNT(*) OVER (PARTITION BY a.collaborator_id, a.starts_at::date) AS day_services_count
        FROM appointments a
        LEFT JOIN collaborators c ON c.id = a.collaborator_id
        WHERE a.deleted_at IS NULL
          AND a.collaborator_id IS NOT NULL
          AND a.status NOT IN ('cancelado','nao_compareceu')
          AND a.starts_at::date >= $1::date
          AND a.starts_at::date < $2::date
      ), calc AS (
        SELECT *,
          CASE
            WHEN day_services_count >= 15 THEN 10
            WHEN day_services_count >= 13 THEN 8
            WHEN day_services_count >= 11 THEN 5
            ELSE 0
          END AS commission_percent
        FROM appointment_base
      )
      SELECT collaborator_id,
             COALESCE(collaborator_name, 'Colaborador') AS collaborator_name,
             COUNT(*)::int AS services_count,
             COALESCE(SUM(total_cents),0)::int AS gross_cents,
             ROUND(AVG(commission_percent))::int AS avg_commission_percent,
             COALESCE(SUM(ROUND(total_cents * (commission_percent::numeric / 100))),0)::int AS commission_cents
      FROM calc
      GROUP BY collaborator_id, collaborator_name
      ORDER BY commission_cents DESC, gross_cents DESC
      LIMIT 12
    `, periodParams);

    const reconciliation = await query(`
      SELECT ft.id,
             COALESCE(ft.due_date, ft.created_at::date) AS due_date,
             ft.description,
             ft.amount_cents AS expected_cents,
             COALESCE(SUM(pay.amount_cents),0)::int AS received_cents,
             (ft.amount_cents - COALESCE(SUM(pay.amount_cents),0))::int AS difference_cents,
             COALESCE(pm.name, ft.category, 'Sem forma') AS method,
             CASE
               WHEN ft.status='canceled' THEN 'Cancelado'
               WHEN COALESCE(SUM(pay.amount_cents),0) = ft.amount_cents AND ft.status='paid' THEN 'Conciliado'
               WHEN COALESCE(SUM(pay.amount_cents),0) > 0 AND COALESCE(SUM(pay.amount_cents),0) <> ft.amount_cents THEN 'Divergente'
               WHEN ft.status <> 'paid' THEN 'Pendente'
               ELSE 'Divergente'
             END AS reconciliation_status,
             t.name AS tutor_name,
             p.name AS pet_name
      FROM financial_transactions ft
      LEFT JOIN payments pay ON pay.financial_transaction_id = ft.id
      LEFT JOIN payment_methods pm ON pm.id = pay.payment_method_id
      LEFT JOIN tutors t ON t.id = ft.tutor_id
      LEFT JOIN appointments a ON a.id = ft.appointment_id
      LEFT JOIN pets p ON p.id = a.pet_id
      WHERE ft.deleted_at IS NULL
        AND ft.type='income'
        AND ft.status <> 'canceled'
        AND ${dateExpression} >= $1::date
        AND ${dateExpression} < $2::date
      GROUP BY ft.id, pm.name, t.name, p.name
      ORDER BY reconciliation_status DESC, COALESCE(ft.due_date, ft.created_at::date) ASC
      LIMIT 20
    `, periodParams);

    const serviceRevenue = await query(`
      SELECT COALESCE(s.name, ai.description, 'Serviço') AS service_name,
             COALESCE(sc.name, 'Sem categoria') AS category_name,
             COUNT(ai.id)::int AS quantity,
             COALESCE(SUM(ai.total_cents),0)::int AS revenue_cents,
             CASE WHEN COUNT(ai.id) > 0 THEN ROUND(COALESCE(SUM(ai.total_cents),0)::numeric / COUNT(ai.id))::int ELSE 0 END AS ticket_cents
      FROM appointment_items ai
      JOIN appointments a ON a.id = ai.appointment_id
      LEFT JOIN services s ON s.id = ai.service_id
      LEFT JOIN service_categories sc ON sc.id = s.category_id
      WHERE a.deleted_at IS NULL
        AND a.status NOT IN ('cancelado','nao_compareceu')
        AND a.starts_at::date >= $1::date
        AND a.starts_at::date < $2::date
      GROUP BY COALESCE(s.name, ai.description, 'Serviço'), COALESCE(sc.name, 'Sem categoria')
      ORDER BY revenue_cents DESC
      LIMIT 12
    `, periodParams);

    const marginByService = serviceRevenue.rows.map((row) => {
      const revenue = Number(row.revenue_cents || 0);
      const category = String(row.category_name || '').toLowerCase();
      const service = String(row.service_name || '').toLowerCase();
      const estimatedCostPercent = category.includes('tosa') || service.includes('tosa') ? 34 : (category.includes('pacote') || service.includes('pacote') ? 45 : 32);
      const costCents = Math.round(revenue * (estimatedCostPercent / 100));
      const marginCents = revenue - costCents;
      const marginPercent = revenue ? Math.round((marginCents / revenue) * 100) : 0;
      return { ...row, estimated_cost_percent: estimatedCostPercent, cost_cents: costCents, margin_cents: marginCents, margin_percent: marginPercent };
    });

    const extraAlerts = [];
    const overdue = await query(`
      SELECT COALESCE(SUM(amount_cents),0)::int AS total_cents, COUNT(*)::int AS count
      FROM financial_transactions
      WHERE deleted_at IS NULL AND type='income' AND status <> 'paid' AND status <> 'canceled'
        AND COALESCE(due_date, created_at::date) < CURRENT_DATE
    `);
    const dueToday = await query(`
      SELECT COALESCE(SUM(amount_cents),0)::int AS total_cents, COUNT(*)::int AS count
      FROM financial_transactions
      WHERE deleted_at IS NULL AND status <> 'paid' AND status <> 'canceled'
        AND COALESCE(due_date, created_at::date) = CURRENT_DATE
    `);
    const divergentCount = reconciliation.rows.filter((r) => r.reconciliation_status === 'Divergente').length;
    if (Number(overdue.rows[0]?.count || 0) > 0) extraAlerts.push({ tone: 'danger', title: 'Cobranças vencidas', message: `${overdue.rows[0].count} cobrança(s) em atraso somando ${toBRLCents(overdue.rows[0].total_cents)}.` });
    if (Number(dueToday.rows[0]?.count || 0) > 0) extraAlerts.push({ tone: 'warning', title: 'Vencem hoje', message: `${dueToday.rows[0].count} lançamento(s) vencem hoje.` });
    if (divergentCount > 0) extraAlerts.push({ tone: 'danger', title: 'Conciliação divergente', message: `${divergentCount} pagamento(s) com diferença entre previsto e recebido.` });
    if (marginByService.some((r) => Number(r.margin_percent || 0) < 40)) extraAlerts.push({ tone: 'warning', title: 'Margem baixa', message: 'Há serviços com margem estimada abaixo de 40%. Revise preço, pacote ou custo.' });
    if (!commissions.rows.length) extraAlerts.push({ tone: 'neutral', title: 'Comissões', message: 'Sem comissão calculada no período. Verifique colaboradores nos agendamentos finalizados.' });

    res.json({
      period: periodWindow,
      dateType,
      commissions: commissions.rows,
      reconciliation: reconciliation.rows,
      alerts: extraAlerts,
      serviceRevenue: serviceRevenue.rows,
      serviceMargins: marginByService
    });
  } catch (error) { next(error); }
});


// Financeiro 360° v3 — projeção futura, previsão de caixa, indicadores de franquia e dashboard executivo.
app.get('/api/financeiro/360-v3', requireAuth, async (req, res, next) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const currentMonthStart = new Date();
    currentMonthStart.setUTCDate(1);
    const monthStart = currentMonthStart.toISOString().slice(0, 10);
    const projection = await query(`
      WITH future AS (
        SELECT type, status, amount_cents, COALESCE(due_date, paid_at::date, created_at::date) AS ref_date
        FROM financial_transactions
        WHERE deleted_at IS NULL AND status <> 'canceled'
          AND COALESCE(due_date, paid_at::date, created_at::date) >= CURRENT_DATE
      )
      SELECT
        COALESCE(SUM(amount_cents) FILTER (WHERE type='income' AND ref_date < CURRENT_DATE + INTERVAL '31 days'),0)::int AS revenue_30_cents,
        COALESCE(SUM(amount_cents) FILTER (WHERE type='income' AND ref_date < CURRENT_DATE + INTERVAL '91 days'),0)::int AS revenue_90_cents,
        COALESCE(SUM(amount_cents) FILTER (WHERE type='income' AND ref_date < CURRENT_DATE + INTERVAL '366 days'),0)::int AS revenue_12m_cents,
        COALESCE(SUM(amount_cents) FILTER (WHERE type='expense' AND ref_date < CURRENT_DATE + INTERVAL '31 days'),0)::int AS expense_30_cents,
        COALESCE(SUM(amount_cents) FILTER (WHERE type='expense' AND ref_date < CURRENT_DATE + INTERVAL '91 days'),0)::int AS expense_90_cents,
        COALESCE(SUM(amount_cents) FILTER (WHERE type='expense' AND ref_date < CURRENT_DATE + INTERVAL '366 days'),0)::int AS expense_12m_cents,
        COALESCE(COUNT(*) FILTER (WHERE type='income' AND ref_date < CURRENT_DATE + INTERVAL '31 days'),0)::int AS income_30_count,
        COALESCE(COUNT(*) FILTER (WHERE type='income' AND ref_date < CURRENT_DATE + INTERVAL '91 days'),0)::int AS income_90_count,
        COALESCE(COUNT(*) FILTER (WHERE type='income' AND ref_date < CURRENT_DATE + INTERVAL '366 days'),0)::int AS income_12m_count
      FROM future
    `);

    const cashCurve = await query(`
      SELECT to_char(day, 'DD/MM') AS label, day::date AS date,
             COALESCE(SUM(ft.amount_cents) FILTER (WHERE ft.type='income'),0)::int AS income_cents,
             COALESCE(SUM(ft.amount_cents) FILTER (WHERE ft.type='expense'),0)::int AS expense_cents
      FROM generate_series(CURRENT_DATE, CURRENT_DATE + INTERVAL '90 days', INTERVAL '7 days') day
      LEFT JOIN financial_transactions ft ON ft.deleted_at IS NULL
        AND ft.status <> 'canceled'
        AND COALESCE(ft.due_date, ft.paid_at::date, ft.created_at::date) >= day::date
        AND COALESCE(ft.due_date, ft.paid_at::date, ft.created_at::date) < (day::date + INTERVAL '7 days')
      GROUP BY day
      ORDER BY day
    `);

    const monthlyProjection = await query(`
      SELECT to_char(month_bucket, 'Mon/YY') AS label,
             COALESCE(SUM(ft.amount_cents) FILTER (WHERE ft.type='income'),0)::int AS income_cents,
             COALESCE(SUM(ft.amount_cents) FILTER (WHERE ft.type='expense'),0)::int AS expense_cents
      FROM generate_series(date_trunc('month', CURRENT_DATE), date_trunc('month', CURRENT_DATE) + INTERVAL '11 months', INTERVAL '1 month') month_bucket
      LEFT JOIN financial_transactions ft ON ft.deleted_at IS NULL
        AND ft.status <> 'canceled'
        AND COALESCE(ft.due_date, ft.paid_at::date, ft.created_at::date) >= month_bucket::date
        AND COALESCE(ft.due_date, ft.paid_at::date, ft.created_at::date) < (month_bucket::date + INTERVAL '1 month')
      GROUP BY month_bucket
      ORDER BY month_bucket
    `);

    const realized = await query(`
      SELECT
        COALESCE(SUM(amount_cents) FILTER (WHERE type='income' AND status='paid'),0)::int AS realized_income_cents,
        COALESCE(SUM(amount_cents) FILTER (WHERE type='expense' AND status='paid'),0)::int AS realized_expense_cents,
        COALESCE(SUM(amount_cents) FILTER (WHERE type='income' AND status <> 'paid'),0)::int AS open_income_cents,
        COALESCE(SUM(amount_cents) FILTER (WHERE type='expense' AND status <> 'paid'),0)::int AS open_expense_cents
      FROM financial_transactions
      WHERE deleted_at IS NULL AND status <> 'canceled'
        AND COALESCE(due_date, paid_at::date, created_at::date) >= $1::date
        AND COALESCE(due_date, paid_at::date, created_at::date) < (CURRENT_DATE + INTERVAL '31 days')
    `, [monthStart]);

    const franchise = await query(`
      WITH period_tx AS (
        SELECT * FROM financial_transactions
        WHERE deleted_at IS NULL AND status <> 'canceled'
          AND COALESCE(due_date, paid_at::date, created_at::date) >= $1::date
          AND COALESCE(due_date, paid_at::date, created_at::date) < (CURRENT_DATE + INTERVAL '1 day')
      ), ap AS (
        SELECT * FROM appointments
        WHERE deleted_at IS NULL AND starts_at::date >= $1::date AND starts_at::date < (CURRENT_DATE + INTERVAL '1 day')
      )
      SELECT
        COALESCE(SUM(period_tx.amount_cents) FILTER (WHERE period_tx.type='income'),0)::int AS revenue_cents,
        COALESCE(COUNT(DISTINCT ap.id),0)::int AS appointments_count,
        COALESCE(COUNT(DISTINCT ap.pet_id),0)::int AS pets_count,
        COALESCE(COUNT(DISTINCT ap.tutor_id),0)::int AS tutors_count,
        COALESCE(COUNT(DISTINCT ap.collaborator_id) FILTER (WHERE ap.collaborator_id IS NOT NULL),0)::int AS collaborators_count,
        COALESCE(COUNT(DISTINCT ap.id) FILTER (WHERE ap.status IN ('finalizado','entregue','concluido','concluído')),0)::int AS completed_count,
        COALESCE(COUNT(DISTINCT ap.id) FILTER (WHERE ap.status IN ('cancelado','nao_compareceu','não_compareceu')),0)::int AS canceled_count
      FROM period_tx
      FULL OUTER JOIN ap ON false
    `, [monthStart]);

    const packages = await query(`
      SELECT
        COALESCE(COUNT(*) FILTER (WHERE cp.status = 'active'),0)::int AS active_packages,
        COALESCE(COUNT(*) FILTER (WHERE cp.created_at::date >= $1::date),0)::int AS sold_month,
        COALESCE(SUM(p.price_cents) FILTER (WHERE cp.status = 'active'),0)::int AS active_packages_value_cents
      FROM customer_packages cp
      LEFT JOIN packages p ON p.id = cp.package_id
      WHERE cp.deleted_at IS NULL
    `, [monthStart]);

    const overdue = await query(`
      SELECT COALESCE(SUM(amount_cents),0)::int AS total_cents, COUNT(*)::int AS count
      FROM financial_transactions
      WHERE deleted_at IS NULL AND status <> 'paid' AND status <> 'canceled' AND type='income'
        AND COALESCE(due_date, created_at::date) < CURRENT_DATE
    `);

    const p = projection.rows[0] || {};
    const r = realized.rows[0] || {};
    const f = franchise.rows[0] || {};
    const pkg = packages.rows[0] || {};
    const over = overdue.rows[0] || {};
    const revenue = Number(f.revenue_cents || 0);
    const appointmentsCount = Number(f.appointments_count || 0);
    const petsCount = Number(f.pets_count || 0);
    const collaboratorsCount = Number(f.collaborators_count || 0) || 1;
    const completedCount = Number(f.completed_count || 0);
    const canceledCount = Number(f.canceled_count || 0);
    const totalScheduled = completedCount + canceledCount;
    const cashCurrentCents = Number(r.realized_income_cents || 0) - Number(r.realized_expense_cents || 0);
    const cashProjected30Cents = cashCurrentCents + Number(p.revenue_30_cents || 0) - Number(p.expense_30_cents || 0);

    const indicators = {
      ticketAverageCents: appointmentsCount ? Math.round(revenue / appointmentsCount) : 0,
      revenuePerPetCents: petsCount ? Math.round(revenue / petsCount) : 0,
      revenuePerCollaboratorCents: Math.round(revenue / collaboratorsCount),
      revenuePerDayCents: Math.round(revenue / Math.max(1, new Date().getUTCDate())),
      agendaOccupancyPercent: Math.min(100, Math.round((appointmentsCount / Math.max(1, new Date().getUTCDate() * 12)) * 100)),
      recurrencePercent: Number(f.tutors_count || 0) ? Math.min(100, Math.round((Number(pkg.active_packages || 0) / Number(f.tutors_count || 1)) * 100)) : 0,
      churnPercent: totalScheduled ? Math.round((canceledCount / totalScheduled) * 100) : 0,
      ltvEstimatedCents: appointmentsCount ? Math.round((revenue / appointmentsCount) * 6) : 0,
      activePackages: Number(pkg.active_packages || 0),
      packagesSoldMonth: Number(pkg.sold_month || 0),
      activePackagesValueCents: Number(pkg.active_packages_value_cents || 0)
    };

    const executive = {
      revenueMonthCents: revenue,
      profitMonthCents: Number(r.realized_income_cents || 0) - Number(r.realized_expense_cents || 0),
      targetMonthCents: Number(process.env.PETFUNNY_MONTHLY_TARGET_CENTS || 2000000),
      targetProgressPercent: Number(process.env.PETFUNNY_MONTHLY_TARGET_CENTS || 2000000) ? Math.min(999, Math.round((revenue / Number(process.env.PETFUNNY_MONTHLY_TARGET_CENTS || 2000000)) * 100)) : 0,
      projected12mCents: Number(p.revenue_12m_cents || 0),
      overdueCents: Number(over.total_cents || 0),
      overdueCount: Number(over.count || 0),
      cashCurrentCents,
      cashProjected30Cents
    };

    const alerts = [];
    if (executive.targetProgressPercent < 70) alerts.push({ tone: 'warning', title: 'Receita abaixo da meta', message: `Meta mensal em ${executive.targetProgressPercent}%. Reforce agenda e recorrência.` });
    if (indicators.agendaOccupancyPercent < 55) alerts.push({ tone: 'warning', title: 'Agenda ociosa', message: `Ocupação estimada em ${indicators.agendaOccupancyPercent}%. Considere campanha para dias fracos.` });
    if (executive.overdueCount > 0) alerts.push({ tone: 'danger', title: 'Inadimplência elevada', message: `${executive.overdueCount} cobrança(s) em atraso.` });
    if (cashProjected30Cents < 0) alerts.push({ tone: 'danger', title: 'Caixa futuro negativo', message: 'Entradas previstas não cobrem saídas nos próximos 30 dias.' });
    if (indicators.recurrencePercent >= 60) alerts.push({ tone: 'success', title: 'Recorrência saudável', message: `Pacotes ativos representam ${indicators.recurrencePercent}% da base movimentada.` });

    res.json({
      projection: { ...p, monthly: monthlyProjection.rows },
      cashForecast: { current_cents: cashCurrentCents, projected_30_cents: cashProjected30Cents, realized: r, curve: cashCurve.rows },
      franchiseIndicators: indicators,
      executive,
      alerts,
      rules: { forecast: 'due_date', realized: 'paid_at', audit: 'created_at' }
    });
  } catch (error) { next(error); }
});

app.get('/api/financeiro/export.csv', requireAuth, async (req, res, next) => {
  try {
    const periodWindow = resolvePeriodWindow({ period: req.query.period || 'month', month: req.query.month, startDate: req.query.startDate, endDate: req.query.endDate });
    const dateType = ['due','paid','created'].includes(cleanText(req.query.dateType)) ? cleanText(req.query.dateType) : 'due';
    const dateExpression = resolveFinanceDateExpression('ft', dateType);
    const result = await query(`
      SELECT ft.*, t.name AS tutor_name, p.name AS pet_name, COALESCE(pm.name, '') AS payment_method_name,
             CASE WHEN ft.appointment_id IS NOT NULL THEN 'Agendamento' WHEN ft.customer_package_id IS NOT NULL THEN 'Pacote' ELSE 'Manual' END AS origin
      FROM financial_transactions ft
      LEFT JOIN tutors t ON t.id = ft.tutor_id
      LEFT JOIN appointments a ON a.id = ft.appointment_id
      LEFT JOIN pets p ON p.id = a.pet_id
      LEFT JOIN payments pay ON pay.financial_transaction_id = ft.id
      LEFT JOIN payment_methods pm ON pm.id = pay.payment_method_id
      WHERE ft.deleted_at IS NULL AND ${dateExpression} >= $1::date AND ${dateExpression} < $2::date
      ORDER BY ${dateExpression} ASC, ft.created_at ASC
      LIMIT 5000
    `, [periodWindow.start, periodWindow.end]);
    const header = ['Data vencimento','Data pagamento','Data lançamento','Tutor','Pet','Tipo','Categoria','Descrição','Valor','Forma','Status','Origem'];
    const rows = [header, ...buildFinanceV2ExportRows(result.rows)];
    const csv = rows.map((row) => row.map(csvEscape).join(';')).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="financeiro-360-${periodWindow.start}-${periodWindow.end}.csv"`);
    res.send('\ufeff' + csv);
  } catch (error) { next(error); }
});

app.get('/api/financeiro/export.pdf', requireAuth, async (req, res, next) => {
  try {
    const periodWindow = resolvePeriodWindow({ period: req.query.period || 'month', month: req.query.month, startDate: req.query.startDate, endDate: req.query.endDate });
    const dateType = ['due','paid','created'].includes(cleanText(req.query.dateType)) ? cleanText(req.query.dateType) : 'due';
    const dateExpression = resolveFinanceDateExpression('ft', dateType);
    const result = await query(`
      SELECT ft.*, t.name AS tutor_name, p.name AS pet_name, COALESCE(pm.name, '') AS payment_method_name,
             CASE WHEN ft.appointment_id IS NOT NULL THEN 'Agendamento' WHEN ft.customer_package_id IS NOT NULL THEN 'Pacote' ELSE 'Manual' END AS origin
      FROM financial_transactions ft
      LEFT JOIN tutors t ON t.id = ft.tutor_id
      LEFT JOIN appointments a ON a.id = ft.appointment_id
      LEFT JOIN pets p ON p.id = a.pet_id
      LEFT JOIN payments pay ON pay.financial_transaction_id = ft.id
      LEFT JOIN payment_methods pm ON pm.id = pay.payment_method_id
      WHERE ft.deleted_at IS NULL AND ${dateExpression} >= $1::date AND ${dateExpression} < $2::date
      ORDER BY ${dateExpression} ASC, ft.created_at ASC
      LIMIT 1000
    `, [periodWindow.start, periodWindow.end]);
    const rows = buildFinanceV2ExportRows(result.rows).map((row) => `<tr>${row.map((cell) => `<td>${String(cell).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</td>`).join('')}</tr>`).join('');
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Financeiro 360°</title><style>body{font-family:Arial,sans-serif;padding:24px;color:#14242b}h1{margin:0 0 4px}p{color:#60717a}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #d8e1e5;padding:6px;text-align:left}th{background:#f4fafb}.print{margin-bottom:16px}@media print{button{display:none}}</style></head><body><button onclick="window.print()">Imprimir / salvar PDF</button><div class="print"><h1>Financeiro 360°</h1><p>Período: ${periodWindow.label} · Regra: ${dateType}</p></div><table><thead><tr>${['Vencimento','Pagamento','Lançamento','Tutor','Pet','Tipo','Categoria','Descrição','Valor','Forma','Status','Origem'].map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows || '<tr><td colspan="12">Sem registros.</td></tr>'}</tbody></table><script>setTimeout(()=>window.print(),500)</script></body></html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) { next(error); }
});

app.get('/api/financeiro/transactions', requireAuth, async (req, res, next) => {
  try {
    const search = cleanText(req.query.search);
    const status = cleanText(req.query.status) || 'all';
    const type = cleanText(req.query.type) || 'all';
    const category = cleanText(req.query.category) || 'all';
    const periodWindow = resolvePeriodWindow({ period: req.query.period || 'month', month: req.query.month, startDate: req.query.startDate, endDate: req.query.endDate });
    const dateType = ['due','paid','created'].includes(cleanText(req.query.dateType)) ? cleanText(req.query.dateType) : 'due';
    const dateExpression = dateType === 'paid' ? 'ft.paid_at::date' : (dateType === 'created' ? 'ft.created_at::date' : 'COALESCE(ft.due_date, ft.paid_at::date, ft.created_at::date)');
    const limit = parseLimit(req.query.limit, 30, 100);
    const offset = parseOffset(req.query.page, limit);
    const params = [];
    const where = ['ft.deleted_at IS NULL'];
    if (status !== 'all') { params.push(status); where.push(`ft.status = $${params.length}::text`); }
    if (type !== 'all') { params.push(type); where.push(`ft.type = $${params.length}::text`); }
    if (category !== 'all') { params.push(category); where.push(`ft.category = $${params.length}::text`); }
    if (search) {
      params.push(`%${search}%`);
      where.push(`(ft.description ILIKE $${params.length} OR t.name ILIKE $${params.length} OR t.whatsapp ILIKE $${params.length})`);
    }
    if (periodWindow) {
      params.push(periodWindow.start);
      where.push(`${dateExpression} >= $${params.length}::date`);
      params.push(periodWindow.end);
      where.push(`${dateExpression} < $${params.length}::date`);
    }
    const result = await query(`
      SELECT ft.*, t.name AS tutor_name, t.whatsapp AS tutor_whatsapp,
             p.name AS pet_name, pk.name AS package_name, pm.name AS payment_method_name
      FROM financial_transactions ft
      LEFT JOIN tutors t ON t.id = ft.tutor_id
      LEFT JOIN appointments a ON a.id = ft.appointment_id
      LEFT JOIN pets p ON p.id = a.pet_id
      LEFT JOIN customer_packages cp ON cp.id = ft.customer_package_id
      LEFT JOIN packages pk ON pk.id = cp.package_id
      LEFT JOIN payments pay ON pay.financial_transaction_id = ft.id
      LEFT JOIN payment_methods pm ON pm.id = pay.payment_method_id
      WHERE ${where.join(' AND ')}
      ORDER BY ft.status = 'pending' DESC, ft.due_date ASC NULLS LAST, ft.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `, params);
    const count = await query(`
      SELECT COUNT(*)::int AS total
      FROM financial_transactions ft
      LEFT JOIN tutors t ON t.id = ft.tutor_id
      WHERE ${where.join(' AND ')}
    `, params);
    res.json({ items: result.rows.map(sanitizeFinancialTransaction), total: count.rows[0]?.total || 0, page: Number(req.query.page || 1), limit });
  } catch (error) { next(error); }
});

app.post('/api/financeiro/transactions', requireAuth, async (req, res, next) => {
  try {
    const type = cleanText(req.body?.type) || 'income';
    const category = cleanText(req.body?.category) || 'outros';
    const description = cleanText(req.body?.description);
    const amountCents = moneyToCents(req.body?.amountCents ?? req.body?.amount);
    if (!['income', 'expense'].includes(type)) return res.status(400).json({ error: 'Tipo financeiro inválido.' });
    if (!description || amountCents <= 0) return res.status(400).json({ error: 'Informe descrição e valor maior que zero.' });
    const result = await query(`
      INSERT INTO financial_transactions (tutor_id, type, category, description, amount_cents, due_date, status)
      VALUES (NULLIF($1::text,'')::uuid, $2::text, $3::text, $4::text, $5::integer, NULLIF($6::text,'')::date, $7::text)
      RETURNING *
    `, [cleanText(req.body?.tutorId) || '', type, category, description, amountCents, cleanText(req.body?.dueDate) || new Date().toISOString().slice(0,10), cleanText(req.body?.status) || 'pending']);
    const transaction = await getFinancialTransactionById(result.rows[0].id);
    res.status(201).json({ transaction: sanitizeFinancialTransaction(transaction), message: 'Lançamento financeiro criado.' });
  } catch (error) { next(error); }
});

app.put('/api/financeiro/transactions/:id', requireAuth, async (req, res, next) => {
  try {
    const current = await getFinancialTransactionById(req.params.id);
    if (!current) return res.status(404).json({ error: 'Lançamento não encontrado.' });
    const type = cleanText(req.body?.type) || current.type || 'income';
    const category = cleanText(req.body?.category) || current.category || 'outros';
    const description = cleanText(req.body?.description) || current.description;
    const amountCents = moneyToCents(req.body?.amountCents ?? req.body?.amount) || Number(current.amount_cents || current.amountCents || 0);
    const status = cleanText(req.body?.status) || current.status || 'pending';
    if (!['income', 'expense'].includes(type)) return res.status(400).json({ error: 'Tipo financeiro inválido.' });
    if (!['pending','paid','overdue','canceled'].includes(status)) return res.status(400).json({ error: 'Status financeiro inválido.' });
    if (!description || amountCents <= 0) return res.status(400).json({ error: 'Informe descrição e valor maior que zero.' });
    const result = await query(`
      UPDATE financial_transactions
      SET tutor_id=NULLIF($2::text,'')::uuid,
          type=$3::text,
          category=$4::text,
          description=$5::text,
          amount_cents=$6::integer,
          due_date=NULLIF($7::text,'')::date,
          status=$8::text,
          updated_at=NOW()
      WHERE id=$1::uuid AND deleted_at IS NULL
      RETURNING id
    `, [req.params.id, cleanText(req.body?.tutorId) || '', type, category, description, amountCents, cleanText(req.body?.dueDate) || '', status]);
    if (!result.rowCount) return res.status(404).json({ error: 'Lançamento não encontrado.' });
    const transaction = await getFinancialTransactionById(req.params.id);
    res.json({ transaction: sanitizeFinancialTransaction(transaction), message: 'Lançamento financeiro atualizado.' });
  } catch (error) { next(error); }
});

app.patch('/api/financeiro/transactions/:id/pay', requireAuth, async (req, res, next) => {
  try {
    const current = await getFinancialTransactionById(req.params.id);
    if (!current) return res.status(404).json({ error: 'Lançamento não encontrado.' });
    if (current.status === 'paid') return res.json({ transaction: sanitizeFinancialTransaction(current), message: 'Lançamento já estava baixado.' });
    const amountCents = moneyToCents(req.body?.amountCents ?? req.body?.amount) || Number(current.amount_cents || 0);
    const paymentMethodId = cleanText(req.body?.paymentMethodId);
    await query('BEGIN');
    try {
      await query(`
        UPDATE financial_transactions
        SET status='paid', paid_at=COALESCE(NULLIF($2::text,'')::timestamptz, NOW()), updated_at=NOW()
        WHERE id=$1::uuid AND deleted_at IS NULL
      `, [req.params.id, cleanText(req.body?.paidAt) || '']);
      const paymentInserted = await query(`
        INSERT INTO payments (financial_transaction_id, payment_method_id, amount_cents, paid_at, notes)
        VALUES ($1::uuid, NULLIF($2::text,'')::uuid, $3::integer, COALESCE(NULLIF($4::text,'')::timestamptz, NOW()), $5::text)
        RETURNING id
      `, [req.params.id, paymentMethodId || '', amountCents, cleanText(req.body?.paidAt) || '', cleanText(req.body?.notes)]);
      if (current.appointment_id) await createOrUpdateReceiptForAppointment(current.appointment_id, paymentInserted.rows[0].id);
      await query('COMMIT');
    } catch (error) {
      await query('ROLLBACK');
      throw error;
    }
    const transaction = await getFinancialTransactionById(req.params.id);
    res.json({ transaction: sanitizeFinancialTransaction(transaction), message: 'Pagamento baixado com sucesso.' });
  } catch (error) { next(error); }
});

app.patch('/api/financeiro/transactions/:id/status', requireAuth, async (req, res, next) => {
  try {
    const status = cleanText(req.body?.status);
    if (!['pending','paid','overdue','canceled'].includes(status)) return res.status(400).json({ error: 'Status inválido.' });
    const result = await query(`
      UPDATE financial_transactions
      SET status=$2::text, updated_at=NOW()
      WHERE id=$1::uuid AND deleted_at IS NULL
      RETURNING id
    `, [req.params.id, status]);
    if (!result.rowCount) return res.status(404).json({ error: 'Lançamento não encontrado.' });
    const transaction = await getFinancialTransactionById(req.params.id);
    res.json({ transaction: sanitizeFinancialTransaction(transaction), message: 'Status financeiro atualizado.' });
  } catch (error) { next(error); }
});

app.delete('/api/financeiro/transactions/:id', requireAuth, async (req, res, next) => {
  try {
    const result = await query(`UPDATE financial_transactions SET status='canceled', deleted_at=NOW(), updated_at=NOW() WHERE id=$1::uuid AND deleted_at IS NULL RETURNING id`, [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Lançamento não encontrado.' });
    res.json({ ok: true, message: 'Lançamento cancelado.' });
  } catch (error) { next(error); }
});


async function getAdminEngagementDashboard() {
  const fallback = {
    metrics: {
      activeTutors: 0, recurringTutors: 0, atRiskTutors: 0, lostTutors: 0,
      rewardPoints: 0, rewardsEvents: 0, referralsCreated: 0, referralsConverted: 0,
      appEngagementScore: 0, activePackages: 0, mediaItems: 0
    },
    retention: [], rewards: [], crm: [], topTutors: [], insights: [], homePreview: {}
  };
  try {
    const metrics = await query(`
      WITH tutor_base AS (
        SELECT t.id, t.name, t.whatsapp, t.created_at,
               COUNT(a.id)::int AS total_appointments,
               MAX(a.starts_at) FILTER (WHERE a.starts_at <= NOW()) AS last_appointment_at,
               COUNT(a.id) FILTER (WHERE a.starts_at >= NOW() AND a.deleted_at IS NULL)::int AS future_appointments,
               COUNT(cp.id) FILTER (WHERE cp.status = 'active' AND cp.deleted_at IS NULL)::int AS active_packages,
               COALESCE(MAX(r.points_balance), 0)::int AS points_balance
        FROM tutors t
        LEFT JOIN appointments a ON a.tutor_id = t.id AND a.deleted_at IS NULL
        LEFT JOIN customer_packages cp ON cp.tutor_id = t.id AND cp.deleted_at IS NULL
        LEFT JOIN tutor_rewards r ON r.tutor_id = t.id
        WHERE t.deleted_at IS NULL
        GROUP BY t.id
      ), classified AS (
        SELECT *,
          CASE
            WHEN total_appointments = 0 THEN 'novo_lead'
            WHEN last_appointment_at IS NULL THEN 'novo_lead'
            WHEN last_appointment_at < NOW() - INTERVAL '90 days' THEN 'perdido'
            WHEN last_appointment_at < NOW() - INTERVAL '45 days' THEN 'em_risco'
            WHEN active_packages > 0 OR total_appointments >= 2 THEN 'recorrente'
            ELSE 'ativo'
          END AS crm_status
        FROM tutor_base
      )
      SELECT
        COUNT(*)::int AS active_tutors,
        COUNT(*) FILTER (WHERE crm_status = 'recorrente')::int AS recurring_tutors,
        COUNT(*) FILTER (WHERE crm_status = 'em_risco')::int AS at_risk_tutors,
        COUNT(*) FILTER (WHERE crm_status = 'perdido')::int AS lost_tutors,
        COUNT(*) FILTER (WHERE active_packages > 0)::int AS active_package_tutors,
        COALESCE(SUM(points_balance),0)::int AS reward_points
      FROM classified
    `).catch(() => ({ rows: [fallback.metrics] }));

    const rewards = await query(`
      SELECT event_type, COUNT(*)::int AS total_events, COALESCE(SUM(points),0)::int AS total_points
      FROM tutor_reward_events
      GROUP BY event_type
      ORDER BY total_points DESC, total_events DESC
      LIMIT 8
    `).catch(() => ({ rows: [] }));

    const referrals = await query(`
      SELECT
        COUNT(*)::int AS total_referrals,
        COUNT(*) FILTER (WHERE status = 'converted')::int AS converted_referrals,
        COUNT(*) FILTER (WHERE status = 'created')::int AS open_referrals
      FROM tutor_referrals
      WHERE deleted_at IS NULL
    `).catch(() => ({ rows: [{}] }));

    const media = await query(`SELECT COUNT(*)::int AS total FROM appointment_media WHERE deleted_at IS NULL`).catch(() => ({ rows: [{ total: 0 }] }));

    const topTutors = await query(`
      SELECT t.id, t.name, t.whatsapp, COALESCE(r.points_balance,0)::int AS points_balance,
             COUNT(a.id)::int AS total_appointments,
             MAX(a.starts_at) AS last_appointment_at
      FROM tutors t
      LEFT JOIN tutor_rewards r ON r.tutor_id = t.id
      LEFT JOIN appointments a ON a.tutor_id = t.id AND a.deleted_at IS NULL
      WHERE t.deleted_at IS NULL
      GROUP BY t.id, r.points_balance
      ORDER BY COALESCE(r.points_balance,0) DESC, COUNT(a.id) DESC
      LIMIT 8
    `).catch(() => ({ rows: [] }));

    const retention = await query(`
      WITH last_seen AS (
        SELECT t.id,
               MAX(a.starts_at) FILTER (WHERE a.starts_at <= NOW()) AS last_appointment_at,
               COUNT(a.id)::int AS total_appointments
        FROM tutors t
        LEFT JOIN appointments a ON a.tutor_id=t.id AND a.deleted_at IS NULL
        WHERE t.deleted_at IS NULL
        GROUP BY t.id
      )
      SELECT bucket, COUNT(*)::int AS total FROM (
        SELECT CASE
          WHEN total_appointments = 0 THEN 'Sem atendimento'
          WHEN last_appointment_at >= NOW() - INTERVAL '30 days' THEN '0–30 dias'
          WHEN last_appointment_at >= NOW() - INTERVAL '45 days' THEN '31–45 dias'
          WHEN last_appointment_at >= NOW() - INTERVAL '90 days' THEN '46–90 dias'
          ELSE '+90 dias'
        END AS bucket
        FROM last_seen
      ) x
      GROUP BY bucket
      ORDER BY CASE bucket WHEN '0–30 dias' THEN 1 WHEN '31–45 dias' THEN 2 WHEN '46–90 dias' THEN 3 WHEN '+90 dias' THEN 4 ELSE 5 END
    `).catch(() => ({ rows: [] }));

    const m = metrics.rows[0] || {};
    const ref = referrals.rows[0] || {};
    const activeTutors = Number(m.active_tutors || 0);
    const recurring = Number(m.recurring_tutors || 0);
    const atRisk = Number(m.at_risk_tutors || 0) + Number(m.lost_tutors || 0);
    const score = activeTutors ? Math.max(0, Math.min(100, Math.round(((recurring / activeTutors) * 70) + ((Number(ref.converted_referrals || 0) / Math.max(1, Number(ref.total_referrals || 1))) * 15) + (atRisk ? -10 : 15)))) : 0;

    const insights = [];
    if (atRisk > 0) insights.push(`${atRisk} tutor(es) estão em risco ou perdidos. Use mensagens CRM para reativar antes do próximo fim de semana.`);
    if (Number(ref.open_referrals || 0) > 0) insights.push(`${Number(ref.open_referrals || 0)} indicação(ões) aguardam conversão. Reforce o benefício de ossinhos no WhatsApp.`);
    if (Number(m.reward_points || 0) > 0) insights.push(`A base já acumulou ${Number(m.reward_points || 0)} ossinhos. Use mimos e roleta para transformar pontos em recompra.`);
    if (!insights.length) insights.push('Comece ativando ossinhos, indicações e CTAs de próximo banho na Home do Tutor.');

    return {
      metrics: {
        activeTutors,
        recurringTutors: recurring,
        atRiskTutors: Number(m.at_risk_tutors || 0),
        lostTutors: Number(m.lost_tutors || 0),
        rewardPoints: Number(m.reward_points || 0),
        rewardsEvents: rewards.rows.reduce((sum, row) => sum + Number(row.total_events || 0), 0),
        referralsCreated: Number(ref.total_referrals || 0),
        referralsConverted: Number(ref.converted_referrals || 0),
        activePackages: Number(m.active_package_tutors || 0),
        mediaItems: Number(media.rows[0]?.total || 0),
        appEngagementScore: score
      },
      retention: retention.rows.map((row) => ({ label: row.bucket, total: Number(row.total || 0) })),
      rewards: rewards.rows.map((row) => ({ type: row.event_type, events: Number(row.total_events || 0), points: Number(row.total_points || 0) })),
      topTutors: topTutors.rows.map((row) => ({ id: row.id, name: row.name, whatsapp: row.whatsapp, points: Number(row.points_balance || 0), appointments: Number(row.total_appointments || 0), lastAppointmentAt: row.last_appointment_at })),
      insights,
      homePreview: {
        title: 'Home Meu Pet',
        cards: ['Próximo banho', 'Health Score', 'Ossinhos', 'Mimos', 'Próximo cuidado', 'Dica IA', 'Últimos momentos']
      }
    };
  } catch (error) {
    console.warn('[engagement-dashboard] indisponível:', error.message);
    return fallback;
  }
}

app.get('/api/dashboard/engagement', requireAuth, async (req, res, next) => {
  try {
    res.json({ ok: true, engagementDashboard: await getAdminEngagementDashboard() });
  } catch (error) { next(error); }
});

app.get('/api/dashboard/summary', requireAuth, async (req, res, next) => {
  try {
    const summary = await getDashboardSummary();
    res.json(summary);
  } catch (error) {
    next(error);
  }
});

app.get('/api/dashboard/ai-growth-plan', requireAuth, async (req, res, next) => {
  try {
    res.json(await getDashboardAiGrowthPlan());
  } catch (error) {
    next(error);
  }
});


app.get('/api/notificacoes/summary', requireAuth, async (req, res, next) => {
  try {
    await generateRealtimeNotifications();
    const unread = await query(`SELECT COUNT(*)::int AS total FROM system_notifications WHERE deleted_at IS NULL AND is_read = FALSE`);
    const latest = await query(`
      SELECT * FROM system_notifications
      WHERE deleted_at IS NULL
      ORDER BY is_read ASC, created_at DESC
      LIMIT 6
    `);
    res.json({ unread: unread.rows[0]?.total || 0, latest: latest.rows.map(sanitizeSystemNotification) });
  } catch (error) { next(error); }
});

app.get('/api/notificacoes', requireAuth, async (req, res, next) => {
  try {
    await generateRealtimeNotifications();
    const status = cleanText(req.query.status) || 'all';
    const where = ['deleted_at IS NULL'];
    if (status === 'unread') where.push('is_read = FALSE');
    if (status === 'read') where.push('is_read = TRUE');
    const result = await query(`
      SELECT * FROM system_notifications
      WHERE ${where.join(' AND ')}
      ORDER BY is_read ASC, created_at DESC
      LIMIT 120
    `);
    res.json({ items: result.rows.map(sanitizeSystemNotification), total: result.rowCount });
  } catch (error) { next(error); }
});

app.patch('/api/notificacoes/:id/read', requireAuth, async (req, res, next) => {
  try {
    const result = await query(`UPDATE system_notifications SET is_read=TRUE, read_at=NOW(), updated_at=NOW() WHERE id=$1::uuid AND deleted_at IS NULL RETURNING *`, [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Notificação não encontrada.' });
    res.json({ notification: sanitizeSystemNotification(result.rows[0]) });
  } catch (error) { next(error); }
});

app.patch('/api/notificacoes/read-all', requireAuth, async (req, res, next) => {
  try {
    await query(`UPDATE system_notifications SET is_read=TRUE, read_at=COALESCE(read_at, NOW()), updated_at=NOW() WHERE deleted_at IS NULL AND is_read=FALSE`);
    res.json({ ok: true, message: 'Notificações marcadas como lidas.' });
  } catch (error) { next(error); }
});


app.get('/api/push/status', requireAuth, async (req, res, next) => {
  try {
    const status = getPushConfigStatus();
    const webpush = await getWebPushClient();
    const subscriptions = await query(`SELECT COUNT(*)::int AS total FROM push_subscriptions WHERE deleted_at IS NULL AND status='active'`);
    const sentToday = await query(`SELECT COUNT(*)::int AS total FROM push_notification_logs WHERE status='sent' AND created_at::date = CURRENT_DATE`);
    const failedToday = await query(`SELECT COUNT(*)::int AS total FROM push_notification_logs WHERE status='failed' AND created_at::date = CURRENT_DATE`);
    res.json({
      configured: status.configured && Boolean(webpush),
      vapidConfigured: status.configured,
      webPushAvailable: Boolean(webpush),
      missing: status.missing,
      envFile: status.envFile,
      subject: env.vapidSubject,
      activeSubscriptions: subscriptions.rows[0]?.total || 0,
      sentToday: sentToday.rows[0]?.total || 0,
      failedToday: failedToday.rows[0]?.total || 0
    });
  } catch (error) { next(error); }
});

app.get('/api/push/logs', requireAuth, async (req, res, next) => {
  try {
    const result = await query(`
      SELECT l.*, t.name AS tutor_name, t.whatsapp AS tutor_whatsapp
      FROM push_notification_logs l
      LEFT JOIN tutors t ON t.id = l.tutor_id
      ORDER BY l.created_at DESC
      LIMIT 80
    `);
    res.json({ items: result.rows.map((row) => ({
      id: row.id,
      tutorName: row.tutor_name,
      tutorWhatsapp: row.tutor_whatsapp,
      title: row.title,
      body: row.body,
      url: row.url,
      status: row.status,
      error: row.error,
      sentAt: row.sent_at,
      createdAt: row.created_at
    })) });
  } catch (error) { next(error); }
});

app.post('/api/push/send', requireAuth, async (req, res, next) => {
  try {
    const title = cleanText(req.body?.title) || 'PetFunny avisou 🐾';
    const body = cleanText(req.body?.body) || 'Você tem uma novidade no Meu PetFunny.';
    const url = cleanText(req.body?.url) || '/app/home';
    const audience = cleanText(req.body?.audience) || 'all';
    const tutorId = cleanText(req.body?.tutorId);
    const where = ["ps.deleted_at IS NULL", "ps.status = 'active'"];
    const params = [];
    if (audience === 'tutor' && tutorId) {
      params.push(tutorId);
      where.push(`ps.tutor_id = $${params.length}::uuid`);
    }
    const subscriptions = await query(`
      SELECT ps.*
      FROM push_subscriptions ps
      WHERE ${where.join(' AND ')}
      ORDER BY ps.updated_at DESC
      LIMIT 500
    `, params);
    const stats = await sendPushToSubscriptions(subscriptions.rows, { title, body, url, tag: cleanText(req.body?.tag) || 'petfunny-admin', type: 'admin' });
    res.json({ ok: true, message: stats.sent ? 'Push enviado para os aparelhos inscritos.' : 'Nenhum push foi enviado. Verifique inscrições e VAPID.', stats });
  } catch (error) { next(error); }
});

app.post('/api/push/send-tutor/:tutorId', requireAuth, async (req, res, next) => {
  try {
    const subscriptions = await query(`
      SELECT * FROM push_subscriptions
      WHERE deleted_at IS NULL AND status='active' AND tutor_id=$1::uuid
    `, [req.params.tutorId]);
    const stats = await sendPushToSubscriptions(subscriptions.rows, {
      title: cleanText(req.body?.title) || 'PetFunny avisou 🐾',
      body: cleanText(req.body?.body) || 'Você tem uma novidade no Meu PetFunny.',
      url: cleanText(req.body?.url) || '/app/home',
      tag: cleanText(req.body?.tag) || 'petfunny-tutor',
      type: 'tutor'
    });
    res.json({ ok: true, stats });
  } catch (error) { next(error); }
});

app.get('/api/financeiro/inadimplentes', requireAuth, async (req, res, next) => {
  try {
    const result = await query(`
      SELECT ft.*, t.name AS tutor_name, t.whatsapp AS tutor_whatsapp,
             p.name AS pet_name, pm.name AS payment_method_name
      FROM financial_transactions ft
      LEFT JOIN tutors t ON t.id = ft.tutor_id
      LEFT JOIN appointments a ON a.id = ft.appointment_id
      LEFT JOIN pets p ON p.id = a.pet_id
      LEFT JOIN payments pay ON pay.financial_transaction_id = ft.id
      LEFT JOIN payment_methods pm ON pm.id = pay.payment_method_id
      WHERE ft.deleted_at IS NULL
        AND ft.type='income'
        AND ft.status <> 'paid'
        AND ft.due_date < CURRENT_DATE
      ORDER BY ft.due_date ASC, ft.amount_cents DESC
      LIMIT 200
    `);
    const total = result.rows.reduce((sum, row) => sum + Number(row.amount_cents || 0), 0);
    res.json({ items: result.rows.map(sanitizeFinancialTransaction), totalCents: total, total: result.rowCount });
  } catch (error) { next(error); }
});


async function safeInsightTask(label, task, fallback) {
  try {
    return await task();
  } catch (error) {
    console.warn(`[relatorios] bloco ${label} ignorado: ${error.message}`);
    return fallback;
  }
}

async function reportInsightQuery(label, sql, params = [], fallback = { rows: [] }, timeoutMs = 3500) {
  if (!pool) return fallback;
  const safeTimeout = Math.min(8000, Math.max(800, Number(timeoutMs || 3500)));
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query(`SET LOCAL statement_timeout = ${Math.trunc(safeTimeout)}`);
    const result = await client.query(sql, params);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch {}
    }
    console.warn(`[relatorios] bloco ${label} ignorado/timeout: ${error.message}`);
    return fallback;
  } finally {
    if (client) client.release();
  }
}

function emptyReportFallback(periodWindow) {
  return {
    generatedAt: new Date().toISOString(),
    optimized: true,
    period: periodWindow,
    insights: [],
    dashboard: {
      cards: {
        appointmentsToday: { value: 0 },
        activePackages: { value: 0 }
      }
    },
    topServices: [],
    comparisons: {
      finance: { income_cents: 0, expense_cents: 0, income_count: 0, expense_count: 0 },
      previousFinance: { income_cents: 0, expense_cents: 0 },
      appointmentsByStatus: [],
      packagesProgress: [],
      periodServices: [],
      periodFlow: [],
      monthlyEvolution: [],
      growth: {
        current: { appointments_count: 0, packages_count: 0, services_count: 0 },
        previous: { appointments_count: 0, packages_count: 0, services_count: 0 }
      }
    }
  };
}

app.get('/api/relatorios/insights', requireAuth, async (req, res, next) => {
  try {
    const periodWindow = resolvePeriodWindow({ period: req.query.period, month: req.query.month, startDate: req.query.startDate, endDate: req.query.endDate });
    const periodParams = [periodWindow.start, periodWindow.end];
    const previousParams = [periodWindow.previousStart, periodWindow.previousEnd];
    const baseFallback = emptyReportFallback(periodWindow);

    const [quick, finance, previousFinance, appointmentsByStatus, packagesProgress, periodServices, periodFlow, growthCurrent, growthPrevious, monthlyEvolution] = await Promise.all([
      reportInsightQuery('resumo_rapido', `
        SELECT
          (SELECT COUNT(*)::int FROM appointments WHERE deleted_at IS NULL AND starts_at >= CURRENT_DATE AND starts_at < CURRENT_DATE + INTERVAL '1 day') AS appointments_today,
          (SELECT COUNT(*)::int FROM customer_packages WHERE deleted_at IS NULL AND status = 'active') AS active_packages,
          (SELECT COUNT(*)::int FROM financial_transactions WHERE deleted_at IS NULL AND type='income' AND status <> 'paid' AND due_date < CURRENT_DATE) AS overdue_count,
          (SELECT COALESCE(SUM(amount_cents),0)::int FROM financial_transactions WHERE deleted_at IS NULL AND type='income' AND status <> 'paid' AND due_date < CURRENT_DATE) AS overdue_total_cents,
          (SELECT COUNT(*)::int FROM customer_packages WHERE deleted_at IS NULL AND status='active' AND (COALESCE(total_sessions,0) - COALESCE(used_sessions,0)) <= 1) AS packages_ending_count,
          (SELECT COUNT(*)::int FROM crm_leads WHERE deleted_at IS NULL AND stage NOT IN ('fechado', 'perdido', 'closed')) AS open_leads
      `, [], { rows: [{ appointments_today: 0, active_packages: 0, overdue_count: 0, overdue_total_cents: 0, packages_ending_count: 0, open_leads: 0 }] }, 2500),

      reportInsightQuery('financeiro_periodo', `
        SELECT
          COALESCE(SUM(amount_cents) FILTER (WHERE type='income' AND status <> 'canceled'),0)::int AS income_cents,
          COALESCE(SUM(amount_cents) FILTER (WHERE type='expense' AND status <> 'canceled'),0)::int AS expense_cents,
          COUNT(*) FILTER (WHERE type='income' AND status <> 'canceled')::int AS income_count,
          COUNT(*) FILTER (WHERE type='expense' AND status <> 'canceled')::int AS expense_count
        FROM financial_transactions
        WHERE deleted_at IS NULL
          AND (
            (due_date >= $1::date AND due_date < $2::date)
            OR (due_date IS NULL AND paid_at >= $1::date AND paid_at < $2::date)
            OR (due_date IS NULL AND paid_at IS NULL AND created_at >= $1::date AND created_at < $2::date)
          )
      `, periodParams, { rows: [baseFallback.comparisons.finance] }, 3000),

      reportInsightQuery('financeiro_periodo_anterior', `
        SELECT
          COALESCE(SUM(amount_cents) FILTER (WHERE type='income' AND status <> 'canceled'),0)::int AS income_cents,
          COALESCE(SUM(amount_cents) FILTER (WHERE type='expense' AND status <> 'canceled'),0)::int AS expense_cents
        FROM financial_transactions
        WHERE deleted_at IS NULL
          AND (
            (due_date >= $1::date AND due_date < $2::date)
            OR (due_date IS NULL AND paid_at >= $1::date AND paid_at < $2::date)
            OR (due_date IS NULL AND paid_at IS NULL AND created_at >= $1::date AND created_at < $2::date)
          )
      `, previousParams, { rows: [baseFallback.comparisons.previousFinance] }, 3000),

      reportInsightQuery('agenda_status_periodo', `
        SELECT COALESCE(status, 'sem_status') AS status, COUNT(*)::int AS count
        FROM appointments
        WHERE deleted_at IS NULL
          AND starts_at >= $1::date
          AND starts_at < $2::date
        GROUP BY COALESCE(status, 'sem_status')
        ORDER BY count DESC
      `, periodParams, { rows: [] }, 2500),

      reportInsightQuery('pacotes_periodo', `
        SELECT COALESCE(status, 'sem_status') AS status,
               COUNT(*)::int AS count,
               COALESCE(SUM(total_sessions),0)::int AS total_sessions,
               COALESCE(SUM(used_sessions),0)::int AS used_sessions
        FROM customer_packages
        WHERE deleted_at IS NULL
          AND created_at >= $1::date
          AND created_at < $2::date
        GROUP BY COALESCE(status, 'sem_status')
        ORDER BY count DESC
      `, periodParams, { rows: [] }, 2500),

      reportInsightQuery('servicos_periodo', `
        SELECT COALESCE(s.name, 'Serviço não identificado') AS name,
               COUNT(ai.id)::int AS sold_count,
               COALESCE(SUM(ai.total_cents),0)::int AS total_cents
        FROM appointment_items ai
        INNER JOIN appointments a ON a.id = ai.appointment_id AND a.deleted_at IS NULL
        LEFT JOIN services s ON s.id = ai.service_id
        WHERE a.starts_at >= $1::date
          AND a.starts_at < $2::date
        GROUP BY COALESCE(s.name, 'Serviço não identificado')
        ORDER BY total_cents DESC NULLS LAST, sold_count DESC
        LIMIT 8
      `, periodParams, { rows: [] }, 3000),

      reportInsightQuery('fluxo_periodo', `
        WITH days AS (
          SELECT generate_series($1::date, ($2::date - INTERVAL '1 day'), INTERVAL '1 day')::date AS day
        ), tx AS (
          SELECT
            COALESCE(due_date, paid_at::date, created_at::date) AS tx_day,
            type,
            status,
            amount_cents
          FROM financial_transactions
          WHERE deleted_at IS NULL
            AND (
              (due_date >= $1::date AND due_date < $2::date)
              OR (due_date IS NULL AND paid_at >= $1::date AND paid_at < $2::date)
              OR (due_date IS NULL AND paid_at IS NULL AND created_at >= $1::date AND created_at < $2::date)
            )
        )
        SELECT to_char(d.day, 'DD/MM') AS label,
               COALESCE(SUM(tx.amount_cents) FILTER (WHERE tx.type='income' AND tx.status <> 'canceled'),0)::int AS income_cents,
               COALESCE(SUM(tx.amount_cents) FILTER (WHERE tx.type='expense' AND tx.status <> 'canceled'),0)::int AS expense_cents
        FROM days d
        LEFT JOIN tx ON tx.tx_day = d.day
        GROUP BY d.day
        ORDER BY d.day ASC
      `, periodParams, { rows: [] }, 3500),

      reportInsightQuery('crescimento_periodo_atual', `
        SELECT
          (SELECT COUNT(*)::int FROM appointments WHERE deleted_at IS NULL AND starts_at >= $1::date AND starts_at < $2::date) AS appointments_count,
          (SELECT COUNT(*)::int FROM customer_packages WHERE deleted_at IS NULL AND created_at >= $1::date AND created_at < $2::date) AS packages_count,
          (SELECT COUNT(*)::int FROM appointment_items ai INNER JOIN appointments a ON a.id=ai.appointment_id AND a.deleted_at IS NULL WHERE a.starts_at >= $1::date AND a.starts_at < $2::date) AS services_count
      `, periodParams, { rows: [baseFallback.comparisons.growth.current] }, 3000),

      reportInsightQuery('crescimento_periodo_anterior', `
        SELECT
          (SELECT COUNT(*)::int FROM appointments WHERE deleted_at IS NULL AND starts_at >= $1::date AND starts_at < $2::date) AS appointments_count,
          (SELECT COUNT(*)::int FROM customer_packages WHERE deleted_at IS NULL AND created_at >= $1::date AND created_at < $2::date) AS packages_count,
          (SELECT COUNT(*)::int FROM appointment_items ai INNER JOIN appointments a ON a.id=ai.appointment_id AND a.deleted_at IS NULL WHERE a.starts_at >= $1::date AND a.starts_at < $2::date) AS services_count
      `, previousParams, { rows: [baseFallback.comparisons.growth.previous] }, 3000),

      reportInsightQuery('evolucao_mensal_operacao', `
        WITH months AS (
          SELECT generate_series(
            date_trunc('month', $1::date) - INTERVAL '5 months',
            date_trunc('month', $1::date),
            INTERVAL '1 month'
          )::date AS month_start
        ), appointments_m AS (
          SELECT date_trunc('month', starts_at)::date AS month_start, COUNT(*)::int AS appointments_count
          FROM appointments
          WHERE deleted_at IS NULL
            AND starts_at >= (date_trunc('month', $1::date) - INTERVAL '5 months')
            AND starts_at < (date_trunc('month', $1::date) + INTERVAL '1 month')
          GROUP BY 1
        ), tutors_m AS (
          SELECT date_trunc('month', created_at)::date AS month_start, COUNT(*)::int AS new_tutors_count
          FROM tutors
          WHERE deleted_at IS NULL
            AND created_at >= (date_trunc('month', $1::date) - INTERVAL '5 months')
            AND created_at < (date_trunc('month', $1::date) + INTERVAL '1 month')
          GROUP BY 1
        ), pets_m AS (
          SELECT date_trunc('month', created_at)::date AS month_start, COUNT(*)::int AS new_pets_count
          FROM pets
          WHERE deleted_at IS NULL
            AND created_at >= (date_trunc('month', $1::date) - INTERVAL '5 months')
            AND created_at < (date_trunc('month', $1::date) + INTERVAL '1 month')
          GROUP BY 1
        ), gifts_m AS (
          SELECT date_trunc('month', spun_at)::date AS month_start, COUNT(*)::int AS gifts_count
          FROM gift_spins
          WHERE spun_at >= (date_trunc('month', $1::date) - INTERVAL '5 months')
            AND spun_at < (date_trunc('month', $1::date) + INTERVAL '1 month')
          GROUP BY 1
        )
        SELECT to_char(m.month_start, 'MM/YYYY') AS label,
               COALESCE(a.appointments_count,0)::int AS appointments_count,
               COALESCE(t.new_tutors_count,0)::int AS new_tutors_count,
               COALESCE(p.new_pets_count,0)::int AS new_pets_count,
               COALESCE(g.gifts_count,0)::int AS gifts_count
        FROM months m
        LEFT JOIN appointments_m a ON a.month_start = m.month_start
        LEFT JOIN tutors_m t ON t.month_start = m.month_start
        LEFT JOIN pets_m p ON p.month_start = m.month_start
        LEFT JOIN gifts_m g ON g.month_start = m.month_start
        ORDER BY m.month_start ASC
      `, [periodWindow.end], { rows: [] }, 3500)
    ]);

    const quickRow = quick.rows?.[0] || {};
    const dashboard = {
      cards: {
        appointmentsToday: { value: Number(quickRow.appointments_today || 0) },
        activePackages: { value: Number(quickRow.active_packages || 0) }
      }
    };

    const topServices = periodServices.rows || [];
    const insights = [];
    insights.push({
      title: 'Agenda de hoje',
      diagnosis: `Hoje existem ${dashboard.cards.appointmentsToday.value || 0} agendamento(s).`,
      impact: 'A agenda define ocupação, equipe e previsão de faturamento do dia.',
      action: 'Confirme presença dos tutores pelo WhatsApp e acompanhe check-in/check-out.'
    });
    if (Number(quickRow.overdue_count || 0) > 0) {
      insights.push({
        title: 'Inadimplência ativa',
        diagnosis: `Há ${quickRow.overdue_count} cobrança(s) vencida(s), somando ${(Number(quickRow.overdue_total_cents || 0)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}.`,
        impact: 'Valores vencidos reduzem previsibilidade de caixa.',
        action: 'Acesse Financeiro > Inadimplentes e envie cobrança amigável.'
      });
    }
    if (Number(quickRow.packages_ending_count || 0) > 0) {
      insights.push({
        title: 'Pacotes perto do fim',
        diagnosis: `${quickRow.packages_ending_count} pacote(s) ativo(s) têm uma sessão ou menos.`,
        impact: 'É uma oportunidade direta de renovação antes do cliente encerrar a recorrência.',
        action: 'Aborde o tutor antes do último atendimento com oferta de renovação.'
      });
    }
    insights.push({
      title: 'Serviços mais fortes',
      diagnosis: topServices.length ? `Serviço com maior receita: ${topServices[0].name || 'não identificado'}.` : 'Ainda não há volume suficiente de serviços vendidos no período.',
      impact: 'Entender serviços fortes ajuda a criar combos e campanhas.',
      action: 'Use os serviços com melhor desempenho como base para pacotes e promoções.'
    });
    insights.push({
      title: 'CRM e oportunidades',
      diagnosis: `Existem ${quickRow.open_leads || 0} lead(s) em aberto no CRM.`,
      impact: 'Leads parados representam faturamento que ainda não virou agenda.',
      action: 'Priorize leads com WhatsApp e histórico recente.'
    });

    res.json({
      generatedAt: new Date().toISOString(),
      optimized: true,
      period: periodWindow,
      insights,
      dashboard,
      topServices,
      comparisons: {
        finance: finance.rows?.[0] || baseFallback.comparisons.finance,
        previousFinance: previousFinance.rows?.[0] || baseFallback.comparisons.previousFinance,
        appointmentsByStatus: appointmentsByStatus.rows || [],
        packagesProgress: packagesProgress.rows || [],
        periodServices: topServices,
        periodFlow: periodFlow.rows || [],
        monthlyEvolution: monthlyEvolution.rows || [],
        growth: {
          current: growthCurrent.rows?.[0] || baseFallback.comparisons.growth.current,
          previous: growthPrevious.rows?.[0] || baseFallback.comparisons.growth.previous
        }
      }
    });
  } catch (error) { next(error); }
});

app.get('/api/db/status', async (req, res, next) => {
  try {
    const health = await healthcheckDb();
    if (!health.connected) {
      return res.status(503).json({
        status: 'unavailable',
        service: 'PetFunny OS Database',
        database: health,
        tenant: false
      });
    }

    const tables = await query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name NOT LIKE 'tenant_%'
      ORDER BY table_name
    `);

    res.json({
      status: 'ok',
      service: 'PetFunny OS Database',
      tenant: false,
      tables: tables.rows.map((row) => row.table_name),
      totalTables: tables.rowCount,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});




// WhatsApp híbrido: IA/sistema gera mensagem, atendente revisa e envia manualmente.
function onlyDigits(value = '') {
  return String(value || '').replace(/\D/g, '');
}

function formatDateTimePt(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function formatDocumentDateTimePt(value, fallback = '—') {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short'
  });
}

function buildWhatsAppUrl(phone, message) {
  const digits = onlyDigits(phone);
  if (!digits) return '';
  const normalized = digits.startsWith('55') ? digits : `55${digits}`;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message || '')}`;
}

function isWhatsAppCloudConfigured() {
  return Boolean(env.whatsappAccessToken && env.whatsappPhoneNumberId);
}

function normalizeWhatsAppForCloud(phone = '') {
  const digits = onlyDigits(phone);
  if (!digits) return '';
  if (digits.startsWith('55')) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

function sanitizeWhatsAppMessage(row = {}) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    direction: row.direction,
    phone: row.phone,
    messageType: row.message_type || 'text',
    body: row.body || '',
    status: row.status || 'received',
    aiUsed: Boolean(row.ai_used),
    providerMessageId: row.provider_message_id || '',
    createdAt: row.created_at
  };
}

function sanitizeWhatsAppConversation(row = {}) {
  return {
    id: row.id,
    phone: row.phone,
    profileName: row.profile_name || '',
    tutorId: row.tutor_id || null,
    tutorName: row.tutor_name || '',
    status: row.status || 'open',
    intent: row.intent || 'geral',
    handoffRequired: Boolean(row.handoff_required),
    summary: row.summary || '',
    lastMessageAt: row.last_message_at,
    lastInboundAt: row.last_inbound_at,
    lastOutboundAt: row.last_outbound_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

let whatsappAgentTablesReady = false;
async function ensureWhatsAppAgentTables() {
  if (whatsappAgentTablesReady) return;
  await query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
  await query(`
    CREATE TABLE IF NOT EXISTS whatsapp_conversations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      phone TEXT NOT NULL UNIQUE,
      profile_name TEXT,
      tutor_id UUID REFERENCES tutors(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'open',
      intent TEXT NOT NULL DEFAULT 'geral',
      handoff_required BOOLEAN NOT NULL DEFAULT FALSE,
      summary TEXT,
      last_message_at TIMESTAMPTZ,
      last_inbound_at TIMESTAMPTZ,
      last_outbound_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS whatsapp_messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      conversation_id UUID REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
      direction TEXT NOT NULL DEFAULT 'inbound',
      provider_message_id TEXT,
      phone TEXT NOT NULL,
      message_type TEXT NOT NULL DEFAULT 'text',
      body TEXT,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      status TEXT NOT NULL DEFAULT 'received',
      ai_used BOOLEAN NOT NULL DEFAULT FALSE,
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_conversation ON whatsapp_messages (conversation_id, created_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_phone ON whatsapp_messages (phone, created_at DESC)`);
  whatsappAgentTablesReady = true;
}

async function findTutorByWhatsapp(phone = '') {
  const normalized = normalizeWhatsAppForCloud(phone);
  if (!normalized) return null;
  const local = normalized.startsWith('55') ? normalized.slice(2) : normalized;
  const result = await query(`
    SELECT *
    FROM tutors
    WHERE deleted_at IS NULL
      AND regexp_replace(COALESCE(whatsapp,''), '\\D', '', 'g') IN ($1, $2)
    ORDER BY updated_at DESC
    LIMIT 1
  `, [normalized, local]);
  return result.rows[0] || null;
}

async function getPetsForTutor(tutorId) {
  if (!tutorId) return [];
  const pets = await query(`
    SELECT id, name, species, breed, size, coat_type
    FROM pets
    WHERE tutor_id=$1::uuid AND deleted_at IS NULL AND status='active'
    ORDER BY name ASC
    LIMIT 8
  `, [tutorId]);
  return pets.rows.map((pet) => ({
    id: pet.id,
    name: pet.name,
    species: pet.species || 'dog',
    breed: pet.breed || '',
    size: pet.size || '',
    coatType: pet.coat_type || ''
  }));
}

async function upsertWhatsAppConversation({ phone, profileName = '', tutorId = null, intent = 'geral', handoffRequired = false, summary = '' }) {
  await ensureWhatsAppAgentTables();
  const normalized = normalizeWhatsAppForCloud(phone);
  const result = await query(`
    INSERT INTO whatsapp_conversations (phone, profile_name, tutor_id, intent, handoff_required, summary, last_message_at, last_inbound_at)
    VALUES ($1, NULLIF($2,''), $3::uuid, $4, $5, NULLIF($6,''), NOW(), NOW())
    ON CONFLICT (phone) DO UPDATE SET
      profile_name = COALESCE(NULLIF(EXCLUDED.profile_name,''), whatsapp_conversations.profile_name),
      tutor_id = COALESCE(EXCLUDED.tutor_id, whatsapp_conversations.tutor_id),
      intent = COALESCE(NULLIF(EXCLUDED.intent,''), whatsapp_conversations.intent),
      handoff_required = whatsapp_conversations.handoff_required OR EXCLUDED.handoff_required,
      summary = COALESCE(NULLIF(EXCLUDED.summary,''), whatsapp_conversations.summary),
      last_message_at = NOW(),
      last_inbound_at = NOW(),
      updated_at = NOW(),
      deleted_at = NULL
    RETURNING *
  `, [normalized, profileName || '', tutorId || null, intent || 'geral', Boolean(handoffRequired), summary || '']);
  return result.rows[0];
}

async function saveWhatsAppMessage({ conversationId, direction = 'inbound', phone, providerMessageId = '', messageType = 'text', body = '', payload = {}, status = 'received', aiUsed = false, errorMessage = '' }) {
  await ensureWhatsAppAgentTables();
  const result = await query(`
    INSERT INTO whatsapp_messages (conversation_id, direction, provider_message_id, phone, message_type, body, payload, status, ai_used, error_message)
    VALUES ($1::uuid, $2, NULLIF($3,''), $4, $5, $6, $7::jsonb, $8, $9, NULLIF($10,''))
    RETURNING *
  `, [conversationId || null, direction, providerMessageId || '', normalizeWhatsAppForCloud(phone), messageType || 'text', String(body || '').slice(0, 4000), JSON.stringify(payload || {}), status || 'received', Boolean(aiUsed), errorMessage || '']);
  return result.rows[0];
}

async function markWhatsAppConversationOutbound(conversationId, intent = null, handoffRequired = null) {
  if (!conversationId) return;
  await query(`
    UPDATE whatsapp_conversations
    SET last_message_at=NOW(), last_outbound_at=NOW(),
        intent=COALESCE(NULLIF($2,''), intent),
        handoff_required=CASE WHEN $3::text IS NULL THEN handoff_required ELSE $3::boolean END,
        updated_at=NOW()
    WHERE id=$1::uuid
  `, [conversationId, intent || '', handoffRequired === null || handoffRequired === undefined ? null : String(Boolean(handoffRequired))]);
}

function extractWhatsAppText(message = {}) {
  if (message.text?.body) return String(message.text.body || '').trim();
  if (message.button?.text) return String(message.button.text || '').trim();
  if (message.interactive?.button_reply?.title) return String(message.interactive.button_reply.title || '').trim();
  if (message.interactive?.list_reply?.title) return String(message.interactive.list_reply.title || '').trim();
  if (message.image?.caption) return String(message.image.caption || '').trim();
  if (message.audio) return '[áudio recebido]';
  if (message.image) return '[imagem recebida]';
  if (message.document) return '[documento recebido]';
  return '';
}

function parseWhatsAppWebhookMessages(payload = {}) {
  const events = [];
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      const contacts = Array.isArray(value.contacts) ? value.contacts : [];
      for (const message of value.messages || []) {
        const contact = contacts.find((item) => item.wa_id === message.from) || contacts[0] || {};
        events.push({
          phone: message.from,
          profileName: contact.profile?.name || '',
          providerMessageId: message.id || '',
          messageType: message.type || 'text',
          text: extractWhatsAppText(message),
          message,
          value
        });
      }
    }
  }
  return events;
}

function inferWhatsAppIntent(text = '') {
  const normalized = String(text || '').toLowerCase();
  if (/atendente|humano|pessoa|falar com algu[eé]m/.test(normalized)) return { intent: 'atendente', handoffRequired: true };
  if (/agend|hor[aá]rio|banho|tosa|encaixe|marcar/.test(normalized)) return { intent: 'agendamento', handoffRequired: false };
  if (/taxi|t[aá]xi|transporte|buscar|busca|entregar|leva|levar/.test(normalized)) return { intent: 'taxi_pet', handoffRequired: false };
  if (/pre[cç]o|valor|quanto|pacote|mensal/.test(normalized)) return { intent: 'precos_pacotes', handoffRequired: false };
  if (/pix|pagar|pagamento|cart[aã]o|cobran/.test(normalized)) return { intent: 'pagamento', handoffRequired: true };
  if (/endereco|endere[cç]o|cep|rua|bairro/.test(normalized)) return { intent: 'endereco', handoffRequired: false };
  return { intent: 'geral', handoffRequired: false };
}

async function getWhatsAppAgentSnapshot(phone = '') {
  const tutor = await findTutorByWhatsapp(phone).catch(() => null);
  const pets = tutor?.id ? await getPetsForTutor(tutor.id).catch(() => []) : [];
  const upcoming = tutor?.id ? await query(`
    SELECT a.id, a.starts_at, a.status, p.name AS pet_name, COALESCE(string_agg(ai.description, ', ' ORDER BY ai.created_at), '') AS services
    FROM appointments a
    LEFT JOIN pets p ON p.id=a.pet_id
    LEFT JOIN appointment_items ai ON ai.appointment_id=a.id
    WHERE a.tutor_id=$1::uuid AND a.deleted_at IS NULL AND a.starts_at >= NOW()
    GROUP BY a.id, p.name
    ORDER BY a.starts_at ASC
    LIMIT 3
  `, [tutor.id]).then((r) => r.rows).catch(() => []) : [];
  const today = getSaoPauloNowParts();
  const nextSlots = [];
  for (let i = 0; i < 7 && nextSlots.length < 6; i += 1) {
    const d = new Date(`${today.date}T12:00:00`);
    d.setDate(d.getDate() + i);
    const date = d.toISOString().slice(0, 10);
    const slots = await getAvailableAppSlotsForDate(date).catch(() => []);
    for (const slot of slots.slice(0, 3)) {
      if (nextSlots.length >= 6) break;
      nextSlots.push({ date, time: slot.time, label: `${date.split('-').reverse().join('/')} às ${slot.time}` });
    }
  }
  return {
    tutor: tutor ? sanitizeTutor(tutor) : null,
    pets,
    upcoming: upcoming.map((item) => ({ id: item.id, startsAt: item.starts_at, status: item.status, petName: item.pet_name || '', services: item.services || '' })),
    nextSlots
  };
}

function buildLocalWhatsAppAgentReply({ inboundText = '', snapshot = {}, business = {} }) {
  const { intent, handoffRequired } = inferWhatsAppIntent(inboundText);
  const tutor = snapshot.tutor || null;
  const pets = Array.isArray(snapshot.pets) ? snapshot.pets : [];
  const nextSlots = Array.isArray(snapshot.nextSlots) ? snapshot.nextSlots : [];
  const firstName = tutor?.name ? String(tutor.name).split(' ')[0] : 'tudo bem';
  const petList = pets.length ? pets.map((pet) => pet.name).filter(Boolean).join(', ') : '';
  const slotsText = nextSlots.length ? nextSlots.slice(0, 4).map((slot, index) => `${index + 1}) ${slot.label}`).join('\n') : '';

  if (intent === 'atendente') {
    return {
      intent,
      handoffRequired: true,
      reply: `Oi, ${firstName}! Já vou chamar alguém da equipe PetFunny para te atender por aqui. 🐾`
    };
  }

  if (intent === 'agendamento') {
    const petLine = petList ? `Tenho aqui no cadastro: ${petList}.` : 'Me diga o nome do pet, porte e serviço desejado.';
    const slotLine = slotsText ? `Tenho estes primeiros horários disponíveis:\n${slotsText}` : 'Vou verificar os próximos horários disponíveis para você.';
    return {
      intent,
      handoffRequired: false,
      reply: `Oi, ${firstName}! Claro, te ajudo com o agendamento. ${petLine}\n\n${slotLine}\n\nResponda com o número do horário ou me diga o melhor dia. Se precisar de Táxi Pet, escreva “Táxi Pet”.`
    };
  }

  if (intent === 'taxi_pet') {
    const hasAddress = Boolean(tutor?.address && tutor?.addressNumber && tutor?.addressZipcode);
    return {
      intent,
      handoffRequired: !hasAddress,
      reply: hasAddress
        ? `Perfeito, ${firstName}! Tenho o endereço cadastrado: ${tutor.address}, ${tutor.addressNumber} - ${tutor.addressNeighborhood || ''}. Vou calcular o Táxi Pet junto com o agendamento. 🐶🚕`
        : `Perfeito, ${firstName}! Para calcular o Táxi Pet, me envie o endereço completo com CEP, rua, número, bairro e cidade. Exemplo: CEP 14092-440, Rua Virgílio de Carvalho Neves Neto, 794.`
    };
  }

  if (intent === 'precos_pacotes') {
    return {
      intent,
      handoffRequired: false,
      reply: `Oi, ${firstName}! Eu posso te ajudar com valores de banho, tosa, pacotes e Táxi Pet. Me diga o porte do pet e o serviço desejado. ${petList ? `Tenho no cadastro: ${petList}.` : ''}`
    };
  }

  if (intent === 'pagamento') {
    return {
      intent,
      handoffRequired: true,
      reply: `Oi, ${firstName}! Para pagamento, Pix ou confirmação de cobrança, vou direcionar para a equipe conferir certinho no sistema e te responder por aqui. 🐾`
    };
  }

  return {
    intent,
    handoffRequired,
    reply: `Oi, ${firstName}! Eu sou o assistente do ${business.name || 'PetFunny'} 🐾 Posso ajudar com agendamento, banho, tosa, pacotes, Táxi Pet e horários disponíveis. ${petList ? `Tenho no cadastro: ${petList}.` : 'Me diga o nome do pet e o que você precisa.'}`
  };
}

async function askOpenAiForWhatsAppAgent({ inboundText, snapshot, business, fallback }) {
  if (!env.openaiApiKey || !env.whatsappAgentUseOpenAi || typeof fetch !== 'function') return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const systemPrompt = `${getPetFunnyAiSystemPrompt()}\n\nVocê é o agente de atendimento WhatsApp do PetFunny. Responda em português do Brasil, com tom humano, curto e objetivo. Não confirme agendamento, preço final ou pagamento sem dados suficientes. Se o assunto exigir intervenção humana, marque handoffRequired=true. Retorne APENAS JSON válido com: reply, intent, handoffRequired.`;
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${env.openaiApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: env.openaiModel,
        temperature: 0.35,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: JSON.stringify({ inboundText, snapshot, business, fallback }).slice(0, 12000) }
        ]
      })
    });
    if (!response.ok) return null;
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(content);
    if (!parsed?.reply) return null;
    return {
      reply: String(parsed.reply || '').slice(0, 1400),
      intent: String(parsed.intent || fallback.intent || 'geral').slice(0, 80),
      handoffRequired: Boolean(parsed.handoffRequired)
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function sendWhatsAppCloudText(to, body) {
  const normalized = normalizeWhatsAppForCloud(to);
  if (!normalized) return { ok: false, skipped: true, error: 'Telefone inválido.' };
  if (!isWhatsAppCloudConfigured()) return { ok: false, skipped: true, error: 'WhatsApp Cloud API não configurada.' };
  const version = String(env.whatsappApiVersion || 'v21.0').replace(/^\/+/, '');
  const url = `https://graph.facebook.com/${version}/${env.whatsappPhoneNumberId}/messages`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.whatsappAccessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalized,
      type: 'text',
      text: { preview_url: false, body: String(body || '').slice(0, 4000) }
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || `WhatsApp Cloud API retornou ${response.status}`;
    return { ok: false, status: response.status, error: message, providerResponse: data };
  }
  return { ok: true, status: response.status, providerResponse: data, messageId: data?.messages?.[0]?.id || '' };
}

async function handleWhatsAppInboundEvent(event) {
  const phone = normalizeWhatsAppForCloud(event.phone);
  const text = event.text || '';
  const tutor = await findTutorByWhatsapp(phone).catch(() => null);
  const fallbackIntent = inferWhatsAppIntent(text);
  const conversation = await upsertWhatsAppConversation({
    phone,
    profileName: event.profileName || '',
    tutorId: tutor?.id || null,
    intent: fallbackIntent.intent,
    handoffRequired: fallbackIntent.handoffRequired,
    summary: text ? text.slice(0, 500) : ''
  });
  await saveWhatsAppMessage({
    conversationId: conversation.id,
    direction: 'inbound',
    phone,
    providerMessageId: event.providerMessageId || '',
    messageType: event.messageType || 'text',
    body: text,
    payload: event.message || {},
    status: 'received'
  });

  if (!env.whatsappAgentEnabled || !env.whatsappAgentAutoReply) {
    return { phone, conversationId: conversation.id, inboundSaved: true, autoReply: false };
  }

  const business = await getBusinessPayload().catch(() => ({ name: env.petfunnyName, whatsapp: env.petfunnyWhatsapp, city: env.petfunnyCity, state: env.petfunnyState }));
  const snapshot = await getWhatsAppAgentSnapshot(phone).catch(() => ({ tutor: tutor ? sanitizeTutor(tutor) : null, pets: [], upcoming: [], nextSlots: [] }));
  const local = buildLocalWhatsAppAgentReply({ inboundText: text, snapshot, business });
  const ai = await askOpenAiForWhatsAppAgent({ inboundText: text, snapshot, business, fallback: local });
  const answer = ai || local;
  const sendResult = await sendWhatsAppCloudText(phone, answer.reply);
  await saveWhatsAppMessage({
    conversationId: conversation.id,
    direction: 'outbound',
    phone,
    providerMessageId: sendResult.messageId || '',
    messageType: 'text',
    body: answer.reply,
    payload: sendResult.providerResponse || {},
    status: sendResult.ok ? 'sent' : 'failed',
    aiUsed: Boolean(ai),
    errorMessage: sendResult.error || ''
  });
  await markWhatsAppConversationOutbound(conversation.id, answer.intent, answer.handoffRequired || !sendResult.ok);
  return { phone, conversationId: conversation.id, inboundSaved: true, autoReply: true, sent: sendResult.ok, aiUsed: Boolean(ai), error: sendResult.error || null };
}

async function getWhatsAppConversationsPayload(limit = 30) {
  await ensureWhatsAppAgentTables();
  const result = await query(`
    SELECT wc.*, t.name AS tutor_name
    FROM whatsapp_conversations wc
    LEFT JOIN tutors t ON t.id=wc.tutor_id
    WHERE wc.deleted_at IS NULL
    ORDER BY COALESCE(wc.last_message_at, wc.updated_at, wc.created_at) DESC
    LIMIT $1::int
  `, [Math.max(1, Math.min(100, Number(limit || 30)))]);
  return result.rows.map(sanitizeWhatsAppConversation);
}

async function getWhatsAppConversationMessages(conversationId, limit = 50) {
  await ensureWhatsAppAgentTables();
  const result = await query(`
    SELECT * FROM whatsapp_messages
    WHERE conversation_id=$1::uuid
    ORDER BY created_at DESC
    LIMIT $2::int
  `, [conversationId, Math.max(1, Math.min(200, Number(limit || 50)))]);
  return result.rows.reverse().map(sanitizeWhatsAppMessage);
}

async function getWhatsAppContext({ type, appointmentId, tutorId, transactionId, leadId, customerPackageId, receiptToken }) {
  const business = await getBusinessPayload().catch(() => ({ name: env.petfunnyName, whatsapp: env.petfunnyWhatsapp, city: env.petfunnyCity, state: env.petfunnyState }));
  const context = { business, type };

  if (appointmentId) {
    const appointment = await getAppointmentById(appointmentId);
    if (appointment) context.appointment = sanitizeAppointment(appointment);
  }

  if (tutorId) {
    const tutor = await query('SELECT id, name, whatsapp, email FROM tutors WHERE id = $1::uuid AND deleted_at IS NULL LIMIT 1', [tutorId]);
    if (tutor.rows[0]) context.tutor = sanitizeTutor(tutor.rows[0]);
  }

  if (transactionId) {
    const transaction = await query(`
      SELECT ft.*, t.name AS tutor_name, t.whatsapp AS tutor_whatsapp, p.name AS pet_name, pm.name AS payment_method_name
      FROM financial_transactions ft
      LEFT JOIN tutors t ON t.id = ft.tutor_id
      LEFT JOIN appointments a ON a.id = ft.appointment_id
      LEFT JOIN pets p ON p.id = a.pet_id
      LEFT JOIN payments pay ON pay.financial_transaction_id = ft.id
      LEFT JOIN payment_methods pm ON pm.id = pay.payment_method_id
      WHERE ft.id = $1::uuid AND ft.deleted_at IS NULL
      ORDER BY pay.paid_at DESC NULLS LAST
      LIMIT 1
    `, [transactionId]);
    if (transaction.rows[0]) context.transaction = sanitizeFinancialTransaction(transaction.rows[0]);
  }

  if (leadId) {
    const lead = await query('SELECT id, name, whatsapp, source, stage, notes FROM crm_leads WHERE id = $1::uuid AND deleted_at IS NULL LIMIT 1', [leadId]);
    if (lead.rows[0]) context.lead = sanitizeCrmLead(lead.rows[0]);
  }

  if (customerPackageId) {
    const pkg = await query(`
      SELECT cp.*, t.name AS tutor_name, t.whatsapp AS tutor_whatsapp, p.name AS pet_name, pk.name AS package_name
      FROM customer_packages cp
      LEFT JOIN tutors t ON t.id = cp.tutor_id
      LEFT JOIN pets p ON p.id = cp.pet_id
      LEFT JOIN packages pk ON pk.id = cp.package_id
      WHERE cp.id = $1::uuid AND cp.deleted_at IS NULL
      LIMIT 1
    `, [customerPackageId]);
    if (pkg.rows[0]) context.customerPackage = sanitizeCustomerPackage(pkg.rows[0]);
  }

  if (receiptToken) {
    context.receiptUrl = `${env.appUrl || 'http://localhost:3000'}/documentos/recibo/${receiptToken}`;
  }

  return context;
}

function inferWhatsAppTarget(context = {}) {
  const appointment = context.appointment || {};
  const transaction = context.transaction || {};
  const lead = context.lead || {};
  const pkg = context.customerPackage || {};
  const tutor = context.tutor || {};
  const phone = appointment.tutorWhatsapp || transaction.tutorWhatsapp || lead.whatsapp || pkg.tutorWhatsapp || tutor.whatsapp || '';
  const name = appointment.tutorName || transaction.tutorName || lead.name || pkg.tutorName || tutor.name || 'tudo bem';
  return { phone, name };
}

function makeWhatsAppMessage(type, context = {}, custom = {}) {
  const target = inferWhatsAppTarget(context);
  const appointment = context.appointment || {};
  const transaction = context.transaction || {};
  const pkg = context.customerPackage || {};
  const petName = appointment.petName || transaction.petName || pkg.petName || custom.petName || 'seu pet';
  const service = appointment.services || custom.service || 'banho e tosa';
  const when = appointment.startsAt ? formatDateTimePt(appointment.startsAt) : (custom.when || '');
  const total = ((Number(appointment.totalCents || transaction.amountCents || 0) || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const sessions = pkg.remainingSessions != null ? pkg.remainingSessions : custom.sessionsRemaining;
  const receipt = context.receiptUrl || custom.receiptUrl || '';
  const firstName = String(target.name || '').split(' ')[0] || 'tudo bem';

  const templates = {
    confirmacao_agendamento: `Oi, ${firstName}! Tudo bem? Passando para confirmar o horário do ${petName} aqui no PetFunny${when ? `: ${when}` : ''}. O serviço previsto é ${service}. Podemos confirmar?`,
    lembrete_agendamento: `Oi, ${firstName}! Tudo bem? Só passando para lembrar do horário do ${petName} no PetFunny${when ? `: ${when}` : ''}. Se precisar ajustar, me avisa por aqui.`,
    aviso_atraso: `Oi, ${firstName}! Tudo bem? Estamos com um pequeno ajuste na rotina de atendimentos hoje e o horário do ${petName} pode sofrer um atraso. Vou te mantendo informado por aqui, combinado?`,
    encaixe_disponivel: `Oi, ${firstName}! Tudo bem? Surgiu um horário disponível no PetFunny para cuidar do ${petName}. Quer que eu veja esse encaixe para vocês?`,
    cobranca_amigavel: `Oi, ${firstName}! Tudo bem? Passando para lembrar que ficou uma pendência em aberto no PetFunny${transaction.description ? ` referente a ${transaction.description}` : ''}${transaction.amountCents ? ` no valor de ${total}` : ''}. Pode me chamar por aqui para combinarmos a melhor forma de pagamento.`,
    recibo: `Oi, ${firstName}! Obrigado pela confiança no PetFunny. Segue o recibo do atendimento do ${petName}${receipt ? `: ${receipt}` : '.'}`,
    renovacao_pacote: `Oi, ${firstName}! Tudo bem? O pacote do ${petName} está perto do fim${sessions != null ? `, com ${sessions} sessão(ões) restante(s)` : ''}. Quer que eu veja uma opção de renovação para manter os cuidados em dia?`,
    reativacao_cliente: `Oi, ${firstName}! Tudo bem? Faz um tempinho que não vemos o ${petName || 'seu pet'} por aqui. Quer que eu veja um horário disponível esta semana para deixar ele limpinho e bem cuidado?`,
    pos_atendimento: `Oi, ${firstName}! Tudo bem? O ${petName} passou pelo atendimento no PetFunny e agradecemos pela confiança. Qualquer coisa que precisar, é só me chamar por aqui.`,
    promocao: `Oi, ${firstName}! Tudo bem? Temos uma condição especial no PetFunny para banho e tosa. Quer que eu veja os horários disponíveis para o ${petName}?`,
    mimo_roleta: `Oi, ${firstName}! Tudo bem? Temos uma novidade no PetFunny: uma ação especial com mimos para os pets. Quer participar no próximo atendimento do ${petName}?`,
    personalizada: custom.message || `Oi, ${firstName}! Tudo bem? Aqui é do PetFunny - Banho e Tosa. Posso te ajudar com o agendamento do ${petName}?`
  };

  return templates[type] || templates.personalizada;
}

app.get('/api/whatsapp/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === env.whatsappVerifyToken && challenge) {
    return res.status(200).send(String(challenge));
  }
  return res.sendStatus(403);
});

app.post('/api/whatsapp/webhook', async (req, res) => {
  // A Meta espera 200 rapidamente; processamos sem expor erro para o provedor.
  try {
    const events = parseWhatsAppWebhookMessages(req.body || {});
    if (!events.length) return res.sendStatus(200);
    for (const event of events) {
      await handleWhatsAppInboundEvent(event).catch((error) => {
        console.warn(`[whatsapp-agent] falha ao processar mensagem: ${error.message}`);
      });
    }
    return res.sendStatus(200);
  } catch (error) {
    console.warn(`[whatsapp-agent] webhook ignorado: ${error.message}`);
    return res.sendStatus(200);
  }
});

app.get('/api/whatsapp/agent/status', requireAuth, async (req, res, next) => {
  try {
    await ensureWhatsAppAgentTables();
    const [conversations, messages] = await Promise.all([
      query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE handoff_required=TRUE)::int AS handoff FROM whatsapp_conversations WHERE deleted_at IS NULL`),
      query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE direction='inbound')::int AS inbound, COUNT(*) FILTER (WHERE direction='outbound')::int AS outbound FROM whatsapp_messages`)
    ]);
    res.json({
      status: 'ok',
      cloudConfigured: isWhatsAppCloudConfigured(),
      phoneNumberIdConfigured: Boolean(env.whatsappPhoneNumberId),
      businessAccountIdConfigured: Boolean(env.whatsappBusinessAccountId),
      verifyTokenConfigured: Boolean(env.whatsappVerifyToken),
      agentEnabled: Boolean(env.whatsappAgentEnabled),
      autoReply: Boolean(env.whatsappAgentAutoReply),
      openaiConfigured: Boolean(env.openaiApiKey),
      openaiAllowedForAgent: Boolean(env.whatsappAgentUseOpenAi),
      apiVersion: env.whatsappApiVersion,
      callbackUrl: `${String(env.appUrl || '').replace(/\/$/, '')}/api/whatsapp/webhook`,
      metrics: {
        conversations: Number(conversations.rows[0]?.total || 0),
        handoff: Number(conversations.rows[0]?.handoff || 0),
        messages: Number(messages.rows[0]?.total || 0),
        inbound: Number(messages.rows[0]?.inbound || 0),
        outbound: Number(messages.rows[0]?.outbound || 0)
      }
    });
  } catch (error) { next(error); }
});

app.get('/api/whatsapp/agent/conversations', requireAuth, async (req, res, next) => {
  try {
    const items = await getWhatsAppConversationsPayload(req.query?.limit || 30);
    res.json({ items, total: items.length });
  } catch (error) { next(error); }
});

app.get('/api/whatsapp/agent/conversations/:id/messages', requireAuth, async (req, res, next) => {
  try {
    const items = await getWhatsAppConversationMessages(req.params.id, req.query?.limit || 80);
    res.json({ items, total: items.length });
  } catch (error) { next(error); }
});

app.post('/api/whatsapp/agent/send', requireAuth, async (req, res, next) => {
  try {
    await ensureWhatsAppAgentTables();
    const phone = normalizeWhatsAppForCloud(req.body?.phone);
    const message = cleanText(req.body?.message);
    if (!phone || !message) return res.status(400).json({ error: 'Informe telefone e mensagem.' });
    const tutor = await findTutorByWhatsapp(phone).catch(() => null);
    const conversation = await upsertWhatsAppConversation({ phone, tutorId: tutor?.id || null, intent: 'manual_admin', handoffRequired: false, summary: message.slice(0, 500) });
    const sendResult = await sendWhatsAppCloudText(phone, message);
    const saved = await saveWhatsAppMessage({
      conversationId: conversation.id,
      direction: 'outbound',
      phone,
      providerMessageId: sendResult.messageId || '',
      messageType: 'text',
      body: message,
      payload: sendResult.providerResponse || {},
      status: sendResult.ok ? 'sent' : 'failed',
      aiUsed: false,
      errorMessage: sendResult.error || ''
    });
    await markWhatsAppConversationOutbound(conversation.id, 'manual_admin', !sendResult.ok);
    res.json({ ok: sendResult.ok, message: sanitizeWhatsAppMessage(saved), provider: sendResult });
  } catch (error) { next(error); }
});

app.get('/api/whatsapp/templates', requireAuth, async (req, res) => {
  res.json({
    templates: [
      { code: 'confirmacao_agendamento', name: 'Confirmação de agendamento', module: 'Agenda' },
      { code: 'lembrete_agendamento', name: 'Lembrete de horário', module: 'Agenda' },
      { code: 'aviso_atraso', name: 'Aviso de atraso', module: 'Agenda' },
      { code: 'encaixe_disponivel', name: 'Encaixe disponível', module: 'Agenda' },
      { code: 'cobranca_amigavel', name: 'Cobrança amigável', module: 'Financeiro' },
      { code: 'recibo', name: 'Envio de recibo', module: 'Comandas e Recibos' },
      { code: 'renovacao_pacote', name: 'Renovação de pacote', module: 'Pacotes' },
      { code: 'reativacao_cliente', name: 'Reativação de cliente', module: 'CRM' },
      { code: 'pos_atendimento', name: 'Pós-atendimento', module: 'CRM' },
      { code: 'promocao', name: 'Promoção', module: 'Marketing' },
      { code: 'mimo_roleta', name: 'Roleta de Mimos', module: 'Roleta' },
      { code: 'personalizada', name: 'Mensagem personalizada', module: 'Geral' }
    ]
  });
});

app.post('/api/whatsapp/message', requireAuth, async (req, res, next) => {
  try {
    const type = cleanText(req.body?.type) || 'personalizada';
    const context = await getWhatsAppContext({
      type,
      appointmentId: cleanText(req.body?.appointmentId),
      tutorId: cleanText(req.body?.tutorId),
      transactionId: cleanText(req.body?.transactionId),
      leadId: cleanText(req.body?.leadId),
      customerPackageId: cleanText(req.body?.customerPackageId),
      receiptToken: cleanText(req.body?.receiptToken)
    });
    const custom = req.body?.custom && typeof req.body.custom === 'object' ? req.body.custom : {};
    const target = inferWhatsAppTarget(context);
    const phone = onlyDigits(cleanText(req.body?.phone) || target.phone || custom.phone || '');
    const message = makeWhatsAppMessage(type, context, custom);
    res.json({ phone, message, url: buildWhatsAppUrl(phone, message), mode: 'hybrid_manual_send' });
  } catch (error) { next(error); }
});

app.get('/api/assistente-ia/prompt', requireAuth, async (req, res) => {
  const prompt = getPetFunnyAiSystemPrompt();
  res.json({
    status: 'ok',
    metadata: getPetFunnyAiPromptMetadata(),
    systemPrompt: prompt
  });
});

app.get('/api/assistente-ia/status', requireAuth, async (req, res) => {
  res.json({
    status: 'ok',
    service: 'Assistente Inteligente PetFunny',
    mode: 'petfunny_single',
    tenant: false,
    openaiConfigured: Boolean(env.openaiApiKey),
    prompt: getPetFunnyAiPromptMetadata(),
    message: env.openaiApiKey
      ? 'Prompt global configurado. Integração OpenAI pronta para uso controlado.'
      : 'Prompt global configurado. API OpenAI não configurada; o sistema continua funcionando normalmente.'
  });
});


async function safeAiQuery(label, sql, params = []) {
  try {
    const result = await query(sql, params);
    return result.rows || [];
  } catch (error) {
    console.warn(`[assistente-ia] snapshot ${label} indisponível: ${error.message}`);
    return [];
  }
}

async function getAiOperationalSnapshot(moduleName = 'geral') {
  const normalized = String(moduleName || 'geral').toLowerCase();
  const base = {
    module: moduleName,
    generatedAt: new Date().toISOString(),
    business: {
      name: env.petfunnyName,
      city: env.petfunnyCity,
      state: env.petfunnyState,
      whatsapp: env.petfunnyWhatsapp
    }
  };

  const shouldLoad = (...keys) => keys.some((key) => normalized.includes(key));

  if (shouldLoad('dashboard', 'geral', 'relatório', 'relatorio')) {
    const today = await safeAiQuery('dashboard_today', `
      SELECT
        COUNT(*)::int AS appointments_today,
        COALESCE(SUM(total_cents), 0)::int AS scheduled_total_cents,
        COUNT(*) FILTER (WHERE status IN ('finalizado','completed'))::int AS finished_today,
        COUNT(*) FILTER (WHERE status IN ('cancelado','cancelled','nao_compareceu'))::int AS attention_today
      FROM appointments
      WHERE deleted_at IS NULL AND starts_at::date = CURRENT_DATE
    `);
    base.dashboard = today[0] || {};
  }

  if (shouldLoad('agenda', 'dashboard', 'relatório', 'relatorio')) {
    base.appointments = await safeAiQuery('appointments', `
      SELECT a.id, a.starts_at, a.status, a.total_cents, t.name AS tutor_name, p.name AS pet_name,
             a.package_session_number, a.package_total_sessions
      FROM appointments a
      LEFT JOIN tutors t ON t.id = a.tutor_id
      LEFT JOIN pets p ON p.id = a.pet_id
      WHERE a.deleted_at IS NULL
        AND a.starts_at >= CURRENT_DATE - INTERVAL '7 days'
        AND a.starts_at < CURRENT_DATE + INTERVAL '14 days'
      ORDER BY a.starts_at ASC
      LIMIT 30
    `);
  }

  if (shouldLoad('tutor', 'cliente', 'crm', 'marketing')) {
    base.tutors = await safeAiQuery('tutors', `
      SELECT id, name, whatsapp, city, state, status, created_at
      FROM tutors
      WHERE deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT 20
    `);
  }

  if (shouldLoad('pet', 'pets')) {
    base.pets = await safeAiQuery('pets', `
      SELECT p.id, p.name, p.size, p.breed, p.status, t.name AS tutor_name
      FROM pets p
      LEFT JOIN tutors t ON t.id = p.tutor_id
      WHERE p.deleted_at IS NULL
      ORDER BY p.created_at DESC
      LIMIT 20
    `);
  }

  if (shouldLoad('serviço', 'servico', 'serviços', 'servicos')) {
    base.services = await safeAiQuery('services', `
      SELECT s.id, s.name, s.status, s.price_cents, s.pet_size, c.name AS category_name
      FROM services s
      LEFT JOIN service_categories c ON c.id = s.category_id
      WHERE s.deleted_at IS NULL
      ORDER BY c.name NULLS LAST, s.name ASC
      LIMIT 40
    `);
  }

  if (shouldLoad('pacote', 'pacotes')) {
    base.packages = await safeAiQuery('packages', `
      SELECT id, name, sessions_count, frequency, pet_size, price_cents, discount_percent, status
      FROM packages
      WHERE deleted_at IS NULL
      ORDER BY updated_at DESC
      LIMIT 20
    `);
    base.customerPackages = await safeAiQuery('customer_packages', `
      SELECT cp.id, cp.status, cp.total_sessions, cp.used_sessions, cp.recurring, cp.cycle_number,
             t.name AS tutor_name, p.name AS pet_name, pk.name AS package_name
      FROM customer_packages cp
      LEFT JOIN tutors t ON t.id = cp.tutor_id
      LEFT JOIN pets p ON p.id = cp.pet_id
      LEFT JOIN packages pk ON pk.id = cp.package_id
      WHERE cp.deleted_at IS NULL
      ORDER BY cp.updated_at DESC
      LIMIT 20
    `);
  }

  if (shouldLoad('financeiro', 'financeira', 'relatório', 'relatorio')) {
    base.financial = await safeAiQuery('financial', `
      SELECT id, type, status, category, description, amount_cents, due_date, paid_at, created_at
      FROM financial_transactions
      WHERE deleted_at IS NULL
      ORDER BY COALESCE(due_date, created_at::date) DESC, created_at DESC
      LIMIT 30
    `);
  }

  if (shouldLoad('roleta', 'mimos', 'mimo')) {
    base.gifts = await safeAiQuery('gifts', `
      SELECT id, title, status, probability, starts_on, ends_on, estimated_cost_cents
      FROM gifts
      WHERE deleted_at IS NULL
      ORDER BY updated_at DESC
      LIMIT 20
    `);
  }

  return base;
}

function buildLocalAiFallback({ moduleName, normalizedQuestion, contextKeys, snapshot }) {
  return {
    title: `Análise operacional para ${moduleName}`,
    diagnosis: contextKeys.length
      ? `Recebi contexto com os campos: ${contextKeys.join(', ')}. Também consultei um retrato seguro do módulo com ${Object.keys(snapshot || {}).length} grupo(s) de dados.`
      : 'Consegui preparar uma leitura operacional básica. Para uma análise mais profunda, configure a OPENAI_API_KEY e envie uma pergunta específica sobre o módulo.',
    impact: 'A IA contextual ajuda a transformar dados do sistema em ações práticas para agenda, relacionamento, pacotes, financeiro e marketing sem travar o PetFunny OS.',
    recommendedAction: normalizedQuestion.toLowerCase().includes('whatsapp')
      ? 'Revise a mensagem sugerida, personalize com o nome do tutor/pet e envie pelo WhatsApp quando fizer sentido.'
      : 'Use a recomendação como checklist operacional: priorize o que afeta atendimento do dia, receita, recorrência e experiência do tutor.',
    readyMessage: normalizedQuestion.toLowerCase().includes('whatsapp')
      ? 'Oi, {{nome_cliente}}! Tudo bem? Aqui é do PetFunny. Passando para cuidar da agenda do {{nome_pet}} e deixar tudo organizado para vocês. 🐾'
      : null
  };
}

async function askOpenAiForPetFunny({ moduleName, question, context, snapshot }) {
  if (!env.openaiApiKey) return null;
  if (typeof fetch !== 'function') return null;

  const systemPrompt = `${getPetFunnyAiSystemPrompt()}\n\nVocê está dentro do módulo "${moduleName}" do PetFunny OS. Responda sempre em português do Brasil, com foco operacional, direto e prático. Não invente dados. Quando houver dados insuficientes, diga isso claramente e recomende a próxima ação. Retorne APENAS JSON válido com as chaves: title, diagnosis, impact, recommendedAction, readyMessage.`;
  const userPayload = {
    module: moduleName,
    question,
    userContext: context,
    operationalSnapshot: snapshot
  };

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.openaiApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: env.openaiModel,
      temperature: 0.35,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify(userPayload).slice(0, 18000) }
      ],
      response_format: { type: 'json_object' }
    })
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`OpenAI retornou ${response.status}. ${errorText.slice(0, 240)}`.trim());
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content || '';
  try {
    return JSON.parse(content);
  } catch (error) {
    return {
      title: `Análise para ${moduleName}`,
      diagnosis: content || 'A IA respondeu sem conteúdo estruturado.',
      impact: 'A resposta foi preservada como texto para não interromper o fluxo.',
      recommendedAction: 'Revise a resposta antes de transformar em ação operacional.',
      readyMessage: null
    };
  }
}

app.post('/api/assistente-ia/analyze', requireAuth, async (req, res) => {
  const { module = 'geral', question = '', context = {} } = req.body || {};
  const normalizedQuestion = String(question || '').trim();
  const moduleName = String(module || 'geral').trim();
  const contextKeys = context && typeof context === 'object' ? Object.keys(context) : [];

  if (!normalizedQuestion) {
    return res.status(400).json({
      error: 'Informe uma pergunta ou solicitação para o Assistente Inteligente PetFunny.'
    });
  }

  const snapshot = await getAiOperationalSnapshot(moduleName);
  let aiAnswer = null;
  let aiError = null;

  try {
    aiAnswer = await askOpenAiForPetFunny({
      moduleName,
      question: normalizedQuestion,
      context,
      snapshot
    });
  } catch (error) {
    console.warn(`[assistente-ia] OpenAI indisponível: ${error.message}`);
    aiError = error.message;
  }

  const answer = aiAnswer || buildLocalAiFallback({ moduleName, normalizedQuestion, contextKeys, snapshot });

  return res.json({
    status: 'ok',
    assistant: 'Assistente Inteligente PetFunny',
    openaiConfigured: Boolean(env.openaiApiKey),
    openaiUsed: Boolean(aiAnswer),
    openaiError: aiAnswer ? null : aiError,
    module: moduleName,
    answer,
    snapshotSummary: Object.fromEntries(Object.entries(snapshot).map(([key, value]) => [key, Array.isArray(value) ? value.length : typeof value])),
    systemPromptVersion: 'petfunny-global-v1.5.65'
  });
});

app.use(express.static(frontendRoot, {
  etag: false,
  lastModified: false,
  maxAge: 0,
  setHeaders: (res, filePath) => {
    if (/\.(html|js|css)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'no-store, must-revalidate');
    }
  }
}));

// Rotas explícitas do módulo Promoções antes da landing/fallback.
// Isso evita que /admin/promocoes caia na landing caso exista cache antigo do PWA ou fallback agressivo.
app.get(['/admin/promocoes', '/promocoes'], (req, res) => sendFrontendFile(res, 'pages/promocoes/index.html'));

app.get(['/', '/site', '/landing'], (req, res) => sendFrontendFile(res, 'index.html'));
app.get(['/franquias', '/franquias-petfunny', '/franchise'], (req, res) => sendFrontendFile(res, 'pages/franquias/index.html'));
app.get(['/login', '/admin/login'], (req, res) => sendFrontendFile(res, 'pages/login/index.html'));
app.get(['/dashboard', '/admin', '/admin/dashboard'], (req, res) => sendFrontendFile(res, 'pages/dashboard/index.html'));
app.get(['/app/login', '/cliente/login'], (req, res) => sendFrontendFile(res, 'pages/app/login/index.html'));
app.get(['/app/primeiro-acesso', '/cliente/primeiro-acesso'], (req, res) => sendFrontendFile(res, 'pages/app/primeiro-acesso/index.html'));
app.get(['/app', '/app/home', '/app/agenda', '/app/agendamentos', '/app/saude-360', '/app/teleconsultas', '/app/notificacoes', '/app/pets', '/app/pets/:petId', '/app/pets/:petId/:area', '/app/historico', '/app/pacotes', '/app/mimos', '/app/roleta', '/app/promocoes', '/app/bem-estar', '/app/perfil', '/app/pagamento-pix', '/app/momentos', '/app/indique', '/cliente'], (req, res) => sendFrontendFile(res, 'pages/app/home/index.html'));
app.get(['/documentos/recibo/:token', '/public/recibos/:token'], (req, res) => sendFrontendFile(res, 'pages/public/recibo/index.html'));
app.get(['/avaliacao/:token', '/avaliacoes/:token', '/public/avaliacao/:token'], (req, res) => sendFrontendFile(res, 'pages/public/avaliacao/index.html'));

const modulePages = {
  agenda: 'agenda',
  tutores: 'tutores',
  'app-acessos': 'app-acessos',
  'radar-clientes': 'radar-clientes',
  avaliacoes: 'avaliacoes',
  pets: 'pets',
  servicos: 'servicos',
  pacotes: 'pacotes',
  assinaturas: 'assinaturas',
  financeiro: 'financeiro',
  'comandas-recibos': 'comandas-recibos',
  crm: 'crm',
  promocoes: 'promocoes',
  'bem-estar': 'bem-estar',
  'saude-360': 'saude-360',
  'roleta-de-mimos': 'roleta-de-mimos',
  relatorios: 'relatorios',
  notificacoes: 'notificacoes',
  'assistente-ia': 'assistente-ia',
  whatsapp: 'whatsapp',
  configuracoes: 'configuracoes'
};

Object.entries(modulePages).forEach(([route, page]) => {
  app.get([`/${route}`, `/admin/${route}`], (req, res) => sendFrontendFile(res, `pages/${page}/index.html`));
});

app.use('/api', notFoundMiddleware);

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  return sendFrontendFile(res, 'index.html');
});

app.use(errorMiddleware);

export default app;

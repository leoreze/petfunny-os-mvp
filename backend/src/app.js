import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from './config/env.js';
import { healthcheckDb, query } from './config/db.js';
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
           t.id AS tutor_id, t.name, t.email, t.city, t.state, t.tags
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
  const metricsResult = await query(`
    WITH today_appointments AS (
      SELECT * FROM appointments
      WHERE starts_at::date = CURRENT_DATE
        AND deleted_at IS NULL
    ), week_appointments AS (
      SELECT * FROM appointments
      WHERE starts_at >= date_trunc('week', NOW())
        AND starts_at < date_trunc('week', NOW()) + INTERVAL '7 days'
        AND deleted_at IS NULL
    ), pending_financial AS (
      SELECT COALESCE(SUM(amount_cents), 0) AS total, COUNT(*) AS count
      FROM financial_transactions
      WHERE type = 'income'
        AND status <> 'paid'
        AND deleted_at IS NULL
    ), revenue_today AS (
      SELECT COALESCE(SUM(amount_cents), 0) AS total
      FROM payments
      WHERE paid_at::date = CURRENT_DATE
    ), revenue_week AS (
      SELECT COALESCE(SUM(amount_cents), 0) AS total
      FROM payments
      WHERE paid_at >= date_trunc('week', NOW())
        AND paid_at < date_trunc('week', NOW()) + INTERVAL '7 days'
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
      (SELECT COUNT(*) FROM tutors WHERE deleted_at IS NULL) AS tutors_total,
      (SELECT COUNT(*) FROM pets WHERE deleted_at IS NULL) AS pets_total,
      (SELECT COUNT(*) FROM customer_packages WHERE status = 'active' AND deleted_at IS NULL) AS active_packages,
      (SELECT COUNT(*) FROM tutors WHERE deleted_at IS NULL AND ('recorrente' = ANY(tags) OR id IN (SELECT tutor_id FROM customer_packages WHERE status = 'active' AND deleted_at IS NULL))) AS recurring_clients,
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
    GROUP BY a.id, t.name, t.whatsapp, p.name, p.size, p.photo_url, c.name, ps.name, ps.color, pm.name
    ORDER BY a.starts_at ASC
    LIMIT 16
  `);

  const statusResult = await query(`
    SELECT s.code AS status,
           s.name AS label,
           s.color,
           s.sort_order,
           COALESCE(COUNT(a.id), 0)::int AS total
    FROM appointment_statuses s
    LEFT JOIN appointments a ON a.status = s.code
      AND a.starts_at::date = CURRENT_DATE
      AND a.deleted_at IS NULL
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
    GROUP BY a.id, t.name, p.name, p.photo_url, p.size, ps.name, ps.color, pm.name
    ORDER BY a.starts_at ASC
  `);

  const slotUsageResult = await query(`
    SELECT TO_CHAR(a.starts_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS slot_date,
           TO_CHAR(date_trunc('hour', a.starts_at AT TIME ZONE 'America/Sao_Paulo'), 'HH24:MI') AS slot_time,
           COUNT(a.id)::int AS used
    FROM appointments a
    INNER JOIN appointment_statuses s ON s.code = a.status AND s.blocks_slot = TRUE
    WHERE a.starts_at >= date_trunc('month', CURRENT_DATE)
      AND a.starts_at < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
      AND a.deleted_at IS NULL
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
      params.push(`%${search.replace(/\s+/g, '%')}%`);
      params.push(`%${normalizeWhatsapp(search)}%`);
      where.push(`(unaccent(lower(t.name)) ILIKE unaccent(lower($${params.length - 1})) OR t.whatsapp ILIKE $${params.length} OR lower(COALESCE(t.email,'')) ILIKE lower($${params.length - 1}))`);
    }

    params.push(limit);
    params.push(offset);

    const result = await query(`
      SELECT t.id, t.name, t.whatsapp, t.phone, t.email, t.document_number, t.address, t.city, t.state, t.photo_url,
             t.tags, t.notes, t.status, t.created_at, t.updated_at,
             COUNT(DISTINCT p.id) FILTER (WHERE p.deleted_at IS NULL)::int AS pets_count,
             COALESCE(MAX(a.starts_at), NULL) AS last_appointment_at
      FROM tutors t
      LEFT JOIN pets p ON p.tutor_id = t.id AND p.deleted_at IS NULL
      LEFT JOIN appointments a ON a.tutor_id = t.id AND a.deleted_at IS NULL
      WHERE ${where.join(' AND ')}
      GROUP BY t.id
      ORDER BY t.updated_at DESC, t.name ASC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    const totalResult = await query(`SELECT COUNT(*)::int AS total FROM tutors t WHERE ${where.join(' AND ')}`, params.slice(0, -2));

    res.json({
      items: result.rows.map((row) => ({
        ...sanitizeTutor(row),
        phone: row.phone,
        documentNumber: row.document_number,
        address: row.address,
        status: row.status,
        notes: row.notes,
        petsCount: Number(row.pets_count || 0),
        lastAppointmentAt: row.last_appointment_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      })),
      page: Number(req.query.page || 1),
      limit,
      total: Number(totalResult.rows[0]?.total || 0)
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

    const result = await query(`
      INSERT INTO tutors (name, whatsapp, phone, email, document_number, address, city, state, tags, notes, status, photo_url)
      VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 'Ribeirão Preto'), COALESCE($8, 'SP'), $9::text[], $10, COALESCE($11, 'active'), $12)
      ON CONFLICT (whatsapp) DO UPDATE
      SET name = EXCLUDED.name,
          phone = EXCLUDED.phone,
          email = EXCLUDED.email,
          document_number = EXCLUDED.document_number,
          address = EXCLUDED.address,
          city = EXCLUDED.city,
          state = EXCLUDED.state,
          tags = EXCLUDED.tags,
          notes = EXCLUDED.notes,
          status = EXCLUDED.status,
          photo_url = EXCLUDED.photo_url,
          deleted_at = NULL,
          updated_at = NOW()
      RETURNING *
    `, [
      name,
      whatsapp,
      cleanText(req.body.phone),
      cleanText(req.body.email),
      cleanText(req.body.documentNumber || req.body.document_number),
      cleanText(req.body.address),
      cleanText(req.body.city),
      cleanText(req.body.state),
      parseTags(req.body.tags),
      cleanText(req.body.notes),
      cleanText(req.body.status),
      cleanPhotoDataUrl(req.body.photoDataUrl || req.body.photoUrl)
    ]);

    res.status(201).json({ tutor: sanitizeTutor(result.rows[0]), message: 'Tutor salvo com sucesso.' });
  } catch (error) {
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

    const result = await query(`
      UPDATE tutors
      SET name = $2,
          whatsapp = $3,
          phone = $4,
          email = $5,
          document_number = $6,
          address = $7,
          city = COALESCE($8, 'Ribeirão Preto'),
          state = COALESCE($9, 'SP'),
          tags = $10::text[],
          notes = $11,
          status = COALESCE($12, 'active'),
          photo_url = $13,
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
      SET deleted_at = NOW(), status = 'inactive', updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id
    `, [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Tutor não encontrado.' });
    await query(`UPDATE pets SET deleted_at = NOW(), status = 'inactive', updated_at = NOW() WHERE tutor_id = $1 AND deleted_at IS NULL`, [req.params.id]);
    res.json({ ok: true, message: 'Tutor e pets vinculados foram inativados.' });
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
      params.push(`%${search.replace(/\s+/g, '%')}%`);
      params.push(`%${normalizeWhatsapp(search)}%`);
      where.push(`(unaccent(lower(p.name)) ILIKE unaccent(lower($${params.length - 1})) OR unaccent(lower(COALESCE(p.breed,''))) ILIKE unaccent(lower($${params.length - 1})) OR unaccent(lower(t.name)) ILIKE unaccent(lower($${params.length - 1})) OR t.whatsapp ILIKE $${params.length})`);
    }

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
    `, params.slice(0, -2));

    res.json({
      items: result.rows.map(sanitizePet),
      page: Number(req.query.page || 1),
      limit,
      total: Number(totalResult.rows[0]?.total || 0)
    });
  } catch (error) {
    next(error);
  }
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
      SET deleted_at = NOW(), status = 'inactive', updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id
    `, [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Pet não encontrado.' });
    res.json({ ok: true, message: 'Pet inativado com sucesso.' });
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
    const notes = cleanText(req.body?.notes);

    if (!whatsapp) return res.status(400).json({ error: 'WhatsApp não validado.' });
    if (!name) return res.status(400).json({ error: 'Informe o nome do tutor.' });

    const tutorResult = await query(`
      INSERT INTO tutors (name, whatsapp, email, city, state, address, notes, tags, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, ARRAY['app_cliente'], 'active')
      ON CONFLICT (whatsapp) DO UPDATE
      SET name = EXCLUDED.name,
          email = EXCLUDED.email,
          city = EXCLUDED.city,
          state = EXCLUDED.state,
          address = EXCLUDED.address,
          notes = EXCLUDED.notes,
          tags = ARRAY(SELECT DISTINCT unnest(COALESCE(tutors.tags, ARRAY[]::TEXT[]) || ARRAY['app_cliente'])),
          status = 'active',
          deleted_at = NULL,
          updated_at = NOW()
      RETURNING id, name, whatsapp, email, city, state, tags
    `, [name, whatsapp, email || null, city, state, address || null, notes || null]);

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
    packageSessionNumber: row.package_session_number ? Number(row.package_session_number) : null,
    packageTotalSessions: row.package_total_sessions ? Number(row.package_total_sessions) : null,
    packageSessionLabel: row.package_session_label || null,
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

    const nextAppointment = appointmentsResult.rows[0] ? sanitizeClientAppointment(appointmentsResult.rows[0]) : null;
    const activePackages = packagesResult.rows.filter((row) => row.status === 'active');
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
      pets: petsResult.rows.map(sanitizeClientPet),
      upcomingAppointments: appointmentsResult.rows.map(sanitizeClientAppointment),
      history: historyResult.rows.map(sanitizeClientAppointment),
      packages: packagesResult.rows.map(sanitizeClientPackage),
      timelineEvents: timelineResult.rows.map(makeClientAppointmentTimelineEvent)
    });
  } catch (error) {
    next(error);
  }
});


app.get('/api/app/options', requireClientAuth, async (req, res, next) => {
  try {
    const tutorId = req.clientApp.tutor.id;
    const [pets, services, collaborators, petSizes, packages, paymentMethods, gifts] = await Promise.all([
      query(`SELECT id, name, size, breed, coat_type FROM pets WHERE tutor_id=$1::uuid AND deleted_at IS NULL AND status='active' ORDER BY name ASC`, [tutorId]),
      query(`
        SELECT s.id, s.name, s.price_cents, s.duration_minutes, s.pet_size, ps.name AS pet_size_name,
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
      query(`SELECT id, title, description, estimated_cost_cents FROM gifts WHERE deleted_at IS NULL AND status='active' AND (starts_on IS NULL OR starts_on <= CURRENT_DATE) AND (ends_on IS NULL OR ends_on >= CURRENT_DATE) ORDER BY title ASC LIMIT 20`)
    ]);

    res.json({
      pets: pets.rows.map((row) => ({ id: row.id, name: row.name, size: row.size, breed: row.breed, coatType: row.coat_type })),
      services: services.rows.map((row) => ({ id: row.id, name: row.name, priceCents: Number(row.price_cents || 0), durationMinutes: Number(row.duration_minutes || 0), petSize: row.pet_size, petSizeName: row.pet_size_name, categoryName: row.category_name || 'Serviços PetFunny' })),
      collaborators: collaborators.rows.map((row) => ({ id: row.id, name: row.name, role: row.role, color: row.color })),
      petSizes: petSizes.rows.map((row) => ({ code: row.code, name: row.name, sortOrder: Number(row.sort_order || 0) })),
      packages: packages.rows.map((row) => ({ id: row.id, name: row.name, description: row.description, petSize: row.pet_size || 'todos', sessionsCount: Number(row.sessions_count || 0), appointmentsPerMonth: Number(row.appointments_per_month || 0), priceCents: Number(row.price_cents || 0), discountPercent: Number(row.discount_percent || 0), servicesText: row.services_text || '' })),
      paymentMethods: paymentMethods.rows.map((row) => ({ id: row.id, name: row.name, type: row.type })),
      gifts: gifts.rows.map((row) => ({ id: row.id, title: row.title, description: row.description, estimatedCostCents: Number(row.estimated_cost_cents || 0) }))
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
    const result = await query(`
      UPDATE tutors
      SET name=$2::text,
          email=NULLIF($3::text,''),
          city=NULLIF($4::text,''),
          state=NULLIF($5::text,''),
          updated_at=NOW()
      WHERE id=$1::uuid AND deleted_at IS NULL
      RETURNING id, name, whatsapp, email, city, state, tags
    `, [tutorId, name, cleanText(req.body?.email), cleanText(req.body?.city), cleanText(req.body?.state)]);
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
      INSERT INTO pets (tutor_id, name, species, breed, size, coat_type, birth_date, weight_kg, preferences, restrictions, notes, status)
      VALUES ($1::uuid, $2::text, COALESCE(NULLIF($3::text,''), 'dog'), NULLIF($4::text,''), COALESCE(NULLIF($5::text,''), 'pequeno'), NULLIF($6::text,''), NULLIF($7::text,'')::date, NULLIF($8::text,'')::numeric, NULLIF($9::text,''), NULLIF($10::text,''), NULLIF($11::text,''), 'active')
      RETURNING *
    `, [tutorId, name, cleanText(req.body?.species), cleanText(req.body?.breed), cleanText(req.body?.size), cleanText(req.body?.coatType), cleanText(req.body?.birthDate), cleanText(req.body?.weightKg), cleanText(req.body?.preferences), cleanText(req.body?.restrictions), cleanText(req.body?.notes)]);
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
          updated_at=NOW()
      WHERE id=$1::uuid AND tutor_id=$2::uuid AND deleted_at IS NULL
      RETURNING *
    `, [req.params.id, tutorId, name, cleanText(req.body?.species), cleanText(req.body?.breed), cleanText(req.body?.size), cleanText(req.body?.coatType), cleanText(req.body?.birthDate), cleanText(req.body?.weightKg), cleanText(req.body?.preferences), cleanText(req.body?.restrictions), cleanText(req.body?.notes)]);
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

app.post('/api/app/appointments', requireClientAuth, async (req, res, next) => {
  try {
    const tutorId = req.clientApp.tutor.id;
    const accountId = req.clientApp.account?.id || null;
    const tutorName = req.clientApp.tutor?.name || 'Tutor PetFunny';
    const tutorEmail = req.clientApp.tutor?.email || req.clientApp.account?.email || '';
    const petId = cleanText(req.body?.petId);
    const startsAt = toIsoOrNull(req.body?.startsAt);
    const serviceIds = Array.isArray(req.body?.serviceIds) ? req.body.serviceIds.filter(Boolean) : [];
    const collaboratorId = cleanText(req.body?.collaboratorId);
    const giftSpinId = cleanText(req.body?.giftSpinId);
    const rouletteGiftTitle = cleanText(req.body?.rouletteGiftTitle);
    const rouletteGiftDescription = cleanText(req.body?.rouletteGiftDescription);
    if (!petId) return res.status(400).json({ error: 'Escolha o pet para agendar.' });
    if (!startsAt) return res.status(400).json({ error: 'Informe data e horário válidos.' });
    if (!serviceIds.length) return res.status(400).json({ error: 'Selecione ao menos um serviço.' });
    if (!isMercadoPagoConfigured()) return res.status(503).json({ error: 'Pagamento Pix indisponível. Configure MERCADO_PAGO_ACCESS_TOKEN no servidor para o app salvar agendamentos pagos.' });

    const pet = await query(`SELECT id, name FROM pets WHERE id=$1::uuid AND tutor_id=$2::uuid AND deleted_at IS NULL AND status='active' LIMIT 1`, [petId, tutorId]);
    if (!pet.rowCount) return res.status(404).json({ error: 'Pet não encontrado para este tutor.' });
    await assertSlotAvailable(startsAt, 'agendado', null);
    const services = await query(`SELECT id, name, price_cents, duration_minutes FROM services WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL AND is_active = TRUE`, [serviceIds]);
    if (!services.rowCount) return res.status(400).json({ error: 'Nenhum serviço ativo encontrado.' });
    const items = services.rows.map((row) => ({ serviceId: row.id, description: row.name, quantity: 1, unitPriceCents: Number(row.price_cents || 0) }));
    const totals = centsFromServices(items, 0);
    if (totals.totalCents <= 0) return res.status(400).json({ error: 'O valor total do agendamento precisa ser maior que zero para gerar Pix.' });

    let appointmentNotes = cleanText(req.body?.notes);
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
      serviceIds: services.rows.map((row) => row.id),
      collaboratorId,
      notes: appointmentNotes,
      giftSpinId: giftSpin?.id || giftSpinId || '',
      rouletteGiftTitle: giftTitle,
      rouletteGiftDescription: giftDescription
    };
    const description = `Agendamento PetFunny · ${pet.rows[0].name} · ${services.rows.map((row) => row.name).join(', ')}`.slice(0, 250);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const intent = await query(`
      INSERT INTO appointment_payment_intents (tutor_id, client_account_id, pet_id, status, amount_cents, description, pending_payload, expires_at)
      VALUES ($1::uuid, $2::uuid, $3::uuid, 'pending', $4::integer, $5::text, $6::jsonb, $7::timestamptz)
      RETURNING *
    `, [tutorId, accountId, petId, totals.totalCents, description, JSON.stringify(payload), expiresAt]);

    try {
      const mp = await createMercadoPagoPixPayment({
        intentId: intent.rows[0].id,
        amountCents: totals.totalCents,
        description,
        payerEmail: tutorEmail,
        payerName: tutorName
      });
      const updated = await query(`
        UPDATE appointment_payment_intents
        SET mp_payment_id=$2::text, mp_status=$3::text, qr_code=$4::text, qr_code_base64=$5::text, provider_response=$6::jsonb, updated_at=NOW()
        WHERE id=$1::uuid
        RETURNING *
      `, [intent.rows[0].id, mp.paymentId, mp.status, mp.qrCode, mp.qrCodeBase64, JSON.stringify(mp.payment || {})]);
      return res.status(201).json({
        requiresPayment: true,
        paymentIntent: sanitizePaymentIntent(updated.rows[0]),
        message: 'Pix gerado. O agendamento só será salvo após a confirmação do pagamento pelo Mercado Pago.'
      });
    } catch (error) {
      await query(`UPDATE appointment_payment_intents SET status='failed', last_error=$2::text, provider_response=$3::jsonb, updated_at=NOW() WHERE id=$1::uuid`, [intent.rows[0].id, error.message, JSON.stringify(error.details || {})]).catch(() => null);
      throw error;
    }
  } catch (error) {
    next(error);
  }
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
    if (new Date(intent.expires_at).getTime() < Date.now()) {
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
    }
    res.json({ paymentIntent: sanitizePaymentIntent(intent), message: 'Pagamento ainda não confirmado.' });
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
    const intent = await query(`SELECT * FROM appointment_payment_intents WHERE mp_payment_id=$1::text AND deleted_at IS NULL LIMIT 1`, [String(paymentId)]);
    if (intent.rowCount && payment.status === 'approved') {
      await finalizePaidAppointmentIntent(intent.rows[0].id, payment.status, payment);
    } else if (intent.rowCount) {
      await query(`UPDATE appointment_payment_intents SET mp_status=$2::text, provider_response=$3::jsonb, updated_at=NOW() WHERE id=$1::uuid`, [intent.rows[0].id, payment.status || '', JSON.stringify(payment || {})]);
    }
    res.json({ ok: true });
  } catch (error) {
    console.error('[mercado-pago:webhook]', error.message);
    res.status(200).json({ ok: false, error: error.message });
  }
});

app.post('/api/app/packages', requireClientAuth, async (req, res, next) => {
  try {
    const tutorId = req.clientApp.tutor.id;
    const petId = cleanText(req.body?.petId);
    const packageId = cleanText(req.body?.packageId);
    const startsOn = cleanText(req.body?.startsOn) || new Date().toISOString().slice(0, 10);
    const firstTime = cleanText(req.body?.firstTime) || '09:00';
    const recurring = parseBool(req.body?.recurring, false);
    if (!petId) return res.status(400).json({ error: 'Escolha o pet para contratar o pacote.' });
    if (!packageId) return res.status(400).json({ error: 'Escolha um pacote.' });
    const pet = await query(`SELECT id FROM pets WHERE id=$1::uuid AND tutor_id=$2::uuid AND deleted_at IS NULL AND status='active' LIMIT 1`, [petId, tutorId]);
    if (!pet.rowCount) return res.status(404).json({ error: 'Pet não encontrado para este tutor.' });
    const pack = await query('SELECT * FROM packages WHERE id=$1::uuid AND deleted_at IS NULL AND is_active=TRUE LIMIT 1', [packageId]);
    if (!pack.rowCount) return res.status(404).json({ error: 'Pacote ativo não encontrado.' });
    const packageRow = pack.rows[0];
    const perMonth = Number(packageRow.appointments_per_month || 4);
    const intervalDays = perMonth >= 4 ? 7 : perMonth === 2 ? 15 : 30;
    await query('BEGIN');
    const sold = await query(`
      INSERT INTO customer_packages (tutor_id, pet_id, package_id, status, starts_on, ends_on, total_sessions, used_sessions, amount_cents, payment_status, recurring, current_cycle_started_on, recurrence_rule)
      VALUES ($1::uuid, $2::uuid, $3::uuid, 'active', $4::date, ($4::date + (($5::integer - 1) * $6::integer || ' days')::interval)::date, $5::integer, 0, $7::integer, 'pending', $8::boolean, $4::date, jsonb_build_object('enabled', $8::boolean, 'appointmentsPerMonth', $9::integer, 'intervalDays', $6::integer, 'firstTime', $10::text))
      RETURNING *
    `, [tutorId, petId, packageId, startsOn, Number(packageRow.sessions_count || 1), intervalDays, Number(packageRow.price_cents || 0), recurring, perMonth, firstTime]);
    await query(`
      INSERT INTO financial_transactions (tutor_id, customer_package_id, type, category, description, amount_cents, due_date, status)
      VALUES ($1::uuid, $2::uuid, 'income', 'pacote', $3::text, $4::integer, $5::date, 'pending')
      ON CONFLICT DO NOTHING
    `, [tutorId, sold.rows[0].id, `Pacote ${packageRow.name} · ${Number(packageRow.sessions_count || 1)} sessões`, Number(packageRow.price_cents || 0), startsOn]);
    await generateAppointmentsForCustomerPackage(sold.rows[0].id, { startsOn, firstTime });
    await query('COMMIT');
    const pushTargets = await query(`SELECT * FROM push_subscriptions WHERE tutor_id=$1::uuid AND status='active' AND deleted_at IS NULL`, [tutorId]);
    if (pushTargets.rowCount) {
      await sendPushToSubscriptions(pushTargets.rows, {
        title: 'Pacote contratado 📦',
        body: `${packageRow.name} foi ativado e os agendamentos foram gerados.`,
        url: '/app/pacotes',
        tag: `package-${sold.rows[0].id}`,
        type: 'package'
      });
    }
    res.status(201).json({ customerPackage: sanitizeCustomerPackage({ ...sold.rows[0], package_name: packageRow.name }), message: 'Pacote contratado. Os agendamentos foram criados e a equipe poderá acompanhar.' });
  } catch (error) {
    try { await query('ROLLBACK'); } catch {}
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


function toIsoOrNull(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function centsFromServices(items = [], discountPercent = 0) {
  const subtotal = items.reduce((sum, item) => sum + Number(item.unitPriceCents || item.priceCents || 0) * Number(item.quantity || 1), 0);
  const discount = Math.round(subtotal * Math.max(0, Math.min(100, Number(discountPercent || 0))) / 100);
  return { subtotalCents: subtotal, discountCents: discount, totalCents: Math.max(0, subtotal - discount) };
}

function isMercadoPagoConfigured() {
  return Boolean(env.mercadoPagoAccessToken);
}

function isMercadoPagoTestMode() {
  const token = String(env.mercadoPagoAccessToken || '').trim();
  return /^TEST-/i.test(token) || /TEST/i.test(token.slice(0, 32));
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
    const error = new Error('Mercado Pago não retornou QR Code Pix válido. Verifique se a conta Mercado Pago está habilitada para Pix e se o Access Token é de produção.');
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
    const error = new Error('O Mercado Pago retornou um código que não parece ser Pix EMV válido. Não exibimos o QR Code para evitar leitura inválida pelo banco.');
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
    const error = new Error('Mercado Pago não configurado. Configure MERCADO_PAGO_ACCESS_TOKEN no servidor.');
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
    const message = data?.message || data?.error || `Mercado Pago retornou HTTP ${response.status}`;
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
    mpStatus: row.mp_status || null,
    qrCode: normalizePixQrCode(row.qr_code || tx.qr_code || ''),
    qrCodeBase64: normalizePixQrBase64(row.qr_code_base64 || tx.qr_code_base64 || ''),
    ticketUrl: String(row.ticket_url || tx.ticket_url || ''),
    expiresAt: row.expires_at,
    paidAt: row.paid_at,
    appointmentId: row.appointment_id || null,
    lastError: row.last_error || null,
    mercadoPagoTestMode: isMercadoPagoTestMode()
  };
}

async function createMercadoPagoPixPayment({ intentId, amountCents, description, payerEmail, payerName }) {
  const appUrl = String(env.appUrl || '').replace(/\/$/, '');
  const body = {
    transaction_amount: Number((Number(amountCents || 0) / 100).toFixed(2)),
    description: description || 'Agendamento PetFunny',
    payment_method_id: 'pix',
    external_reference: String(intentId),
    date_of_expiration: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
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

function sanitizeAppointment(row = {}) {
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
    packageSessionNumber: row.package_session_number ? Number(row.package_session_number) : null,
    packageTotalSessions: row.package_total_sessions ? Number(row.package_total_sessions) : null,
    packageSessionLabel: row.package_session_label,
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

async function getAppointmentById(id) {
  const result = await query(`
    SELECT a.*, t.name AS tutor_name, t.whatsapp AS tutor_whatsapp, p.name AS pet_name, p.photo_url AS pet_photo_url, p.size AS pet_size,
           c.name AS collaborator_name, s.name AS status_name, s.color AS status_color, pm.name AS payment_method_name,
           COALESCE(string_agg(ai.description, ', ' ORDER BY ai.created_at), '') AS services,
           COALESCE(json_agg(json_build_object('id', ai.id, 'serviceId', ai.service_id, 'petId', ai.pet_id, 'description', ai.description, 'quantity', ai.quantity, 'unitPriceCents', ai.unit_price_cents, 'discountPercent', ai.discount_percent, 'totalCents', ai.total_cents) ORDER BY ai.created_at) FILTER (WHERE ai.id IS NOT NULL), '[]'::json) AS items
    FROM appointments a
    LEFT JOIN tutors t ON t.id = a.tutor_id
    LEFT JOIN pets p ON p.id = a.pet_id
    LEFT JOIN collaborators c ON c.id = a.collaborator_id
    LEFT JOIN appointment_statuses s ON s.code = a.status
    LEFT JOIN payment_methods pm ON pm.id = a.payment_method_id
    LEFT JOIN appointment_items ai ON ai.appointment_id = a.id
    WHERE a.id = $1::uuid AND a.deleted_at IS NULL
    GROUP BY a.id, t.name, t.whatsapp, p.name, p.photo_url, p.size, c.name, s.name, s.color, pm.name
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
      FOR UPDATE
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
    const collaboratorParam = payload.collaboratorId || '';
    const notes = payload.notes || '';
    const serviceIds = Array.isArray(payload.serviceIds) ? payload.serviceIds : [];
    if (!petId || !startsAt || !serviceIds.length) throw new Error('Dados pendentes do agendamento estão incompletos.');
    await assertSlotAvailable(startsAt, 'agendado', null);
    const services = await query(`SELECT id, name, price_cents, duration_minutes FROM services WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL AND is_active = TRUE`, [serviceIds]);
    if (!services.rowCount) throw new Error('Serviços do agendamento não estão mais disponíveis.');
    const duration = services.rows.reduce((sum, row) => sum + Number(row.duration_minutes || 60), 0);
    const endsAt = new Date(new Date(startsAt).getTime() + duration * 60000).toISOString();
    const items = services.rows.map((row) => ({ serviceId: row.id, description: row.name, quantity: 1, unitPriceCents: Number(row.price_cents || 0) }));
    const totals = centsFromServices(items, 0);
    const pixMethod = await query(`SELECT id FROM payment_methods WHERE deleted_at IS NULL AND lower(name) LIKE '%pix%' ORDER BY sort_order ASC LIMIT 1`).catch(() => ({ rows: [] }));
    const created = await query(`
      INSERT INTO appointments (tutor_id, pet_id, collaborator_id, starts_at, ends_at, status, source, subtotal_cents, discount_percent, discount_cents, total_cents, notes, payment_status, payment_method_id)
      VALUES ($1::uuid, $2::uuid, NULLIF($3::text,'')::uuid, $4::timestamptz, $5::timestamptz, 'agendado', 'app_tutor', $6::integer, 0, 0, $7::integer, $8::text, 'paid', NULLIF($9::text,'')::uuid)
      RETURNING id
    `, [intent.tutor_id, petId, collaboratorParam, startsAt, endsAt, totals.subtotalCents, totals.totalCents, notes, pixMethod.rows[0]?.id || '']);
    for (const item of items) {
      await query(`INSERT INTO appointment_items (appointment_id, pet_id, service_id, description, quantity, unit_price_cents, discount_percent, total_cents) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::text, 1, $5::integer, 0, $5::integer)`, [created.rows[0].id, petId, item.serviceId, item.description, item.unitPriceCents]);
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
      VALUES ($1::uuid, $2::uuid, 'income', 'agendamento_app_pix', $3::text, $4::integer, $5::date, 'paid')
      ON CONFLICT DO NOTHING
    `, [intent.tutor_id, created.rows[0].id, `Agendamento pago via Pix Mercado Pago`, totals.totalCents, String(startsAt).slice(0, 10)]).catch(() => null);
    await query(`
      UPDATE appointment_payment_intents
      SET status='paid', mp_status=$2::text, provider_response=$3::jsonb, paid_at=NOW(), appointment_id=$4::uuid, updated_at=NOW()
      WHERE id=$1::uuid
    `, [intent.id, providerStatus, JSON.stringify(providerResponse || {}), created.rows[0].id]);
    await query('COMMIT');
    const appointment = await getAppointmentById(created.rows[0].id);
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
  const match = text.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
  if (match) {
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

async function assertSlotAvailable(startsAtValue, statusCode, excludeAppointmentId = null) {
  const statusResult = await query('SELECT blocks_slot FROM appointment_statuses WHERE code = $1::text AND deleted_at IS NULL LIMIT 1', [statusCode]);
  const blocksSlot = statusResult.rows[0]?.blocks_slot !== false;
  if (!blocksSlot) return;

  const parts = getLocalSlotParts(startsAtValue);
  if (!parts?.date || !parts?.time) throw new Error('Data/hora inválida para o agendamento.');

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
  if (!slot || !slot.is_open) throw new Error('O dia selecionado está fechado nas Configurações.');
  const hhmm = String(slot.slot_time || parts.time).slice(0, 5);
  if (hhmm < String(slot.opens_at).slice(0, 5) || hhmm >= String(slot.closes_at).slice(0, 5)) {
    throw new Error('Horário fora do funcionamento configurado.');
  }
  if (Number(slot.capacity || 0) <= 0) throw new Error('Este horário está sem vagas configuradas.');

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
    throw new Error('Limite de agendamentos atingido para este dia e horário. Ajuste os slots em Configurações ou escolha outro horário.');
  }
}

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
             COALESCE(string_agg(ai.description, ', ' ORDER BY ai.created_at), '') AS services
      FROM appointments a
      LEFT JOIN tutors t ON t.id = a.tutor_id
      LEFT JOIN pets p ON p.id = a.pet_id
      LEFT JOIN collaborators c ON c.id = a.collaborator_id
      LEFT JOIN appointment_statuses s ON s.code = a.status
    LEFT JOIN payment_methods pm ON pm.id = a.payment_method_id
      LEFT JOIN appointment_items ai ON ai.appointment_id = a.id
      WHERE ${where.join(' AND ')}
      GROUP BY a.id, t.name, t.whatsapp, p.name, p.photo_url, p.size, c.name, s.name, s.color, pm.name
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
    const items = services.rows.map((row) => ({ serviceId: row.id, description: row.name, quantity: 1, unitPriceCents: Number(row.price_cents || 0) }));
    const totals = centsFromServices(items, discountPercent);

    const created = await query(`
      INSERT INTO appointments (tutor_id, pet_id, collaborator_id, starts_at, ends_at, status, source, subtotal_cents, discount_percent, discount_cents, total_cents, notes, payment_status, payment_method_id)
      VALUES ($1::uuid, $2::uuid, NULLIF($3::text,'')::uuid, $4::timestamptz, $5::timestamptz, $6::text, 'manual', $7::integer, $8::numeric, $9::integer, $10::integer, $11::text, $12::text, NULLIF($13::text,'')::uuid)
      RETURNING id
    `, [tutorId, petId, collaboratorId || '', startsAt, endsAt, status, totals.subtotalCents, discountPercent, totals.discountCents, totals.totalCents, cleanText(req.body?.notes), paymentStatus, paymentMethodId || '']);

    for (const item of items) {
      await query(`
        INSERT INTO appointment_items (appointment_id, pet_id, service_id, description, quantity, unit_price_cents, discount_percent, total_cents)
        VALUES ($1::uuid, $2::uuid, $3::uuid, $4::text, $5::integer, $6::integer, 0, $7::integer)
      `, [created.rows[0].id, petId, item.serviceId, item.description, item.quantity, item.unitPriceCents, item.unitPriceCents]);
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
    const items = services.rows.map((row) => ({ serviceId: row.id, description: row.name, quantity: 1, unitPriceCents: Number(row.price_cents || 0) }));
    const totals = centsFromServices(items, discountPercent);

    await query(`
      UPDATE appointments
      SET tutor_id=$2::uuid, pet_id=$3::uuid, collaborator_id=NULLIF($4::text,'')::uuid, starts_at=$5::timestamptz, ends_at=$6::timestamptz, status=$7::text,
          subtotal_cents=$8::integer, discount_percent=$9::numeric, discount_cents=$10::integer, total_cents=$11::integer, notes=$12::text,
          payment_status=$13::text, payment_method_id=NULLIF($14::text,'')::uuid, updated_at=NOW()
      WHERE id=$1::uuid AND deleted_at IS NULL
    `, [req.params.id, tutorId, petId, collaboratorId || '', startsAt, endsAt, status, totals.subtotalCents, discountPercent, totals.discountCents, totals.totalCents, cleanText(req.body?.notes), paymentStatus, paymentMethodId || '']);
    await query('DELETE FROM appointment_items WHERE appointment_id = $1::uuid', [req.params.id]);
    for (const item of items) {
      await query(`INSERT INTO appointment_items (appointment_id, pet_id, service_id, description, quantity, unit_price_cents, discount_percent, total_cents) VALUES ($1::uuid,$2::uuid,$3::uuid,$4::text,$5::integer,$6::integer,0,$7::integer)`, [req.params.id, petId, item.serviceId, item.description, item.quantity, item.unitPriceCents, item.unitPriceCents]);
    }
    await syncFinancialTransactionWithAppointmentPayment(req.params.id, paymentStatus, paymentMethodId || '');
    const appointment = await getAppointmentById(req.params.id);
    res.json({ appointment: sanitizeAppointment(appointment), message: 'Agendamento atualizado com sucesso.' });
  } catch (error) { next(error); }
});


function firstNameFrom(name = '') {
  return String(name || '').trim().split(/\s+/)[0] || 'tudo bem';
}

function makeAppointmentStatusAiMessage(appointment = {}, status = {}) {
  const tutor = firstNameFrom(appointment.tutorName || appointment.tutor_name || '');
  const pet = appointment.petName || appointment.pet_name || 'seu pet';
  const when = appointment.startsAt || appointment.starts_at ? formatDateTimePt(appointment.startsAt || appointment.starts_at) : '';
  const service = appointment.services || 'banho e tosa';
  const statusCode = String(status.code || appointment.status || '').toLowerCase();
  const statusName = status.name || appointment.statusName || appointment.status || 'atualizado';
  const businessName = 'PetFunny - Banho e Tosa';
  const payment = appointment.paymentStatusName || (appointment.paymentStatus === 'paid' ? 'Pago' : appointment.paymentStatus === 'pending' ? 'Pendente' : '');

  const variants = {
    agendado: `Oi, ${tutor}! Tudo bem? O horário do ${pet} ficou agendado aqui no ${businessName}${when ? ` para ${when}` : ''}. O serviço previsto é ${service}. Se precisar ajustar alguma coisa, é só me chamar por aqui.`,
    confirmado: `Oi, ${tutor}! Tudo bem? Passando para confirmar que o horário do ${pet} está tudo certo aqui no ${businessName}${when ? ` para ${when}` : ''}. Estamos esperando vocês com carinho.`,
    em_atendimento: `Oi, ${tutor}! Tudo bem? O ${pet} já está em atendimento aqui no ${businessName}. Assim que finalizar, avisamos por aqui.`,
    finalizado: `Oi, ${tutor}! Tudo bem? O atendimento do ${pet} foi finalizado aqui no ${businessName}. Obrigado pela confiança. Se quiser, posso te enviar a comanda ou o recibo por aqui.`,
    cancelado: `Oi, ${tutor}! Tudo bem? O horário do ${pet} no ${businessName}${when ? ` de ${when}` : ''} foi cancelado. Quando quiser reagendar, me chama por aqui que vejo as melhores opções disponíveis.`,
    nao_compareceu: `Oi, ${tutor}! Tudo bem? Notamos que o ${pet} não conseguiu comparecer ao horário combinado no ${businessName}${when ? ` em ${when}` : ''}. Quer que eu veja uma nova opção de agenda para vocês?`
  };

  if (variants[statusCode]) return variants[statusCode];
  return `Oi, ${tutor}! Tudo bem? O atendimento do ${pet} aqui no ${businessName} foi atualizado para "${statusName}"${when ? ` (${when})` : ''}. ${payment ? `Status de pagamento: ${payment}. ` : ''}Qualquer dúvida, é só me chamar por aqui.`;
}

app.get('/api/agenda/:id/status-message', requireAuth, async (req, res, next) => {
  try {
    const appointment = await getAppointmentById(req.params.id);
    if (!appointment) return res.status(404).json({ error: 'Agendamento não encontrado.' });
    const requestedStatus = cleanText(req.query?.status) || appointment.status;
    const statusRow = await query('SELECT code, name, color, description FROM appointment_statuses WHERE code=$1::text AND deleted_at IS NULL LIMIT 1', [requestedStatus]);
    const status = statusRow.rows[0] || { code: requestedStatus, name: requestedStatus };
    const clean = sanitizeAppointment(appointment);
    const message = makeAppointmentStatusAiMessage(clean, status);
    const phone = clean.tutorWhatsapp || appointment.tutor_whatsapp || '';
    res.json({
      mode: 'hybrid_manual_send',
      generatedBy: 'Assistente Inteligente PetFunny',
      appointment: clean,
      status,
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
    if (status === 'finalizado') await ensureFinancialTransactionForAppointment(req.params.id);
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

async function generateAppointmentsForCustomerPackage(customerPackageId, { startsOn, firstTime = '09:00' } = {}) {
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
  const intervalDays = perMonth >= 4 ? 7 : perMonth === 2 ? 15 : 30;
  const totalSessions = Number(contract.total_sessions || contract.sessions_count || 1);
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
    const appointmentDate = new Date(`${cycleStart}T${firstTime || '09:00'}:00`);
    appointmentDate.setDate(appointmentDate.getDate() + i * intervalDays);
    const startsAt = appointmentDate.toISOString();
    const endsAt = new Date(appointmentDate.getTime() + duration * 60000).toISOString();
    const allocatedTotal = i === totalSessions - 1
      ? Math.max(0, packageTotal - Math.floor(packageTotal / totalSessions) * (totalSessions - 1))
      : Math.floor(packageTotal / totalSessions);
    const discount = Math.max(0, subtotal - allocatedTotal);
    const appt = await query(`
      INSERT INTO appointments (tutor_id, pet_id, customer_package_id, package_session_number, package_total_sessions, starts_at, ends_at, status, source, subtotal_cents, discount_percent, discount_cents, total_cents, package_session_label, notes, payment_status, payment_method_id)
      VALUES ($1::uuid, $2::uuid, $3::uuid, $4::integer, $5::integer, $6::timestamptz, $7::timestamptz, 'agendado', 'package', $8::integer, $9::numeric, $10::integer, $11::integer, $12::text, $13::text, $14::text, NULLIF($15::text,'')::uuid)
      RETURNING id
    `, [contract.tutor_id, contract.pet_id, contract.id, i + 1, totalSessions, startsAt, endsAt, subtotal, subtotal > 0 ? Number(((discount / subtotal) * 100).toFixed(2)) : 0, discount, allocatedTotal, `${i + 1} de ${totalSessions}`, `Sessão ${i + 1} de ${totalSessions} gerada automaticamente pelo pacote ${contract.package_name}. Valor total do pacote: ${(packageTotal / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.`, contract.payment_status || 'pending', contract.payment_method_id || '']);
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

async function refreshCustomerPackageProgress(customerPackageId, { allowRenew = true } = {}) {
  const result = await query(`
    SELECT cp.*, pk.appointments_per_month
    FROM customer_packages cp
    INNER JOIN packages pk ON pk.id = cp.package_id
    WHERE cp.id = $1::uuid AND cp.deleted_at IS NULL
    LIMIT 1
  `, [customerPackageId]);
  const cp = result.rows[0];
  if (!cp) return null;
  const cycleStart = cp.current_cycle_started_on || cp.starts_on;
  const done = await query(`
    SELECT COUNT(*)::int AS finished_count, MAX(starts_at)::date AS last_session_date
    FROM appointments
    WHERE customer_package_id = $1::uuid
      AND deleted_at IS NULL
      AND starts_at::date >= $2::date
      AND status = 'finalizado'
  `, [customerPackageId, cycleStart]);
  const finished = Math.min(Number(done.rows[0]?.finished_count || 0), Number(cp.total_sessions || 0));
  const shouldRenew = Boolean(cp.recurring || cp.recurrence_rule?.enabled) && cp.status === 'active' && allowRenew && finished >= Number(cp.total_sessions || 0);
  if (shouldRenew) {
    const perMonth = Number(cp.appointments_per_month || cp.recurrence_rule?.appointmentsPerMonth || 4);
    const intervalDays = perMonth >= 4 ? 7 : perMonth === 2 ? 15 : 30;
    const base = done.rows[0]?.last_session_date || cycleStart;
    const nextStart = new Date(`${base}T00:00:00`);
    nextStart.setDate(nextStart.getDate() + intervalDays);
    const nextStartText = nextStart.toISOString().slice(0, 10);
    await query(`
      UPDATE customer_packages
      SET used_sessions = 0,
          current_cycle_started_on = $2::date,
          cycle_number = COALESCE(cycle_number, 1) + 1,
          recurrence_rule = COALESCE(recurrence_rule, '{}'::jsonb) || jsonb_build_object('enabled', true, 'lastRenewedOn', $2::text, 'intervalDays', $3::integer),
          updated_at = NOW()
      WHERE id = $1::uuid
    `, [customerPackageId, nextStartText, intervalDays]);
    await generateAppointmentsForCustomerPackage(customerPackageId, { startsOn: nextStartText, firstTime: cp.recurrence_rule?.firstTime || '09:00' });
    return { renewed: true, usedSessions: 0 };
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
    const intervalDays = perMonth >= 4 ? 7 : perMonth === 2 ? 15 : 30;
    await query('BEGIN');
    const sold = await query(`
      INSERT INTO customer_packages (tutor_id, pet_id, package_id, status, starts_on, ends_on, total_sessions, used_sessions, amount_cents, payment_status, payment_method_id, recurring, current_cycle_started_on, recurrence_rule)
      VALUES ($1::uuid, NULLIF($2::text,'')::uuid, $3::uuid, 'active', $4::date, ($4::date + (($5::integer - 1) * $6::integer || ' days')::interval)::date, $5::integer, 0, $7::integer, $8::text, NULLIF($9::text,'')::uuid, $10::boolean, $4::date, jsonb_build_object('enabled', $10::boolean, 'appointmentsPerMonth', $11::integer, 'intervalDays', $6::integer, 'firstTime', $12::text))
      RETURNING *
    `, [tutorId, petId || '', packageId, startsOn, Number(packageRow.sessions_count || 1), intervalDays, Number(packageRow.price_cents || 0), cleanText(req.body?.paymentStatus) || 'pending', paymentMethodId || '', recurring, Number(packageRow.appointments_per_month || 4), firstTime]);
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
        const dateText = item.startsAt ? new Date(item.startsAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'Data a confirmar';
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
  const dateText = appointment.startsAt ? new Date(appointment.startsAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
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

const CRM_STAGES = [
  { code: 'lead_entrou', name: 'Lead entrou', color: '#00a9b7' },
  { code: 'diagnostico_enviado', name: 'Diagnóstico enviado', color: '#7c3aed' },
  { code: 'conversa_iniciada', name: 'Conversa iniciada', color: '#ff9d98' },
  { code: 'proposta_enviada', name: 'Proposta enviada', color: '#f59e0b' },
  { code: 'fechado', name: 'Fechado', color: '#12a876' },
  { code: 'perdido', name: 'Perdido', color: '#94a3b8' }
];

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
      sources: ['manual','whatsapp','instagram','landing_page','indicacao','google','cliente_inativo'],
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
    const result = await query(`
      WITH active_gifts AS (
        SELECT * FROM gifts
        WHERE deleted_at IS NULL
          AND status = 'active'
          AND (starts_on IS NULL OR starts_on <= CURRENT_DATE)
          AND (ends_on IS NULL OR ends_on >= CURRENT_DATE)
      ), spins_today AS (
        SELECT COUNT(*)::int AS total FROM gift_spins WHERE spun_at::date = CURRENT_DATE
      ), spins_month AS (
        SELECT COUNT(*)::int AS total FROM gift_spins WHERE date_trunc('month', spun_at) = date_trunc('month', NOW())
      ), cost_month AS (
        SELECT COALESCE(SUM(COALESCE(g.estimated_cost_cents,0)),0)::int AS total
        FROM gift_spins gs
        LEFT JOIN gifts g ON g.id = gs.gift_id
        WHERE date_trunc('month', gs.spun_at) = date_trunc('month', NOW())
      )
      SELECT
        (SELECT COUNT(*)::int FROM gifts WHERE deleted_at IS NULL) AS total_gifts,
        (SELECT COUNT(*)::int FROM active_gifts) AS active_gifts,
        (SELECT total FROM spins_today) AS spins_today,
        (SELECT total FROM spins_month) AS spins_month,
        (SELECT total FROM cost_month) AS estimated_cost_month_cents
    `);
    const recent = await query(`
      SELECT gs.*, t.name AS tutor_name, p.name AS pet_name
      FROM gift_spins gs
      LEFT JOIN tutors t ON t.id = gs.tutor_id
      LEFT JOIN pets p ON p.id = gs.pet_id
      ORDER BY gs.spun_at DESC
      LIMIT 12
    `);
    res.json({ summary: result.rows[0] || {}, recentSpins: recent.rows.map(sanitizeGiftSpin) });
  } catch (error) { next(error); }
});

app.get('/api/roleta/gifts', requireAuth, async (req, res, next) => {
  try {
    const search = `%${cleanText(req.query.search || '')}%`;
    const status = cleanText(req.query.status || 'all');
    const result = await query(`
      SELECT g.*, COUNT(gs.id)::int AS spins_count
      FROM gifts g
      LEFT JOIN gift_spins gs ON gs.gift_id = g.id
      WHERE g.deleted_at IS NULL
        AND ($1::text = '%%' OR g.title ILIKE $1::text OR COALESCE(g.description,'') ILIKE $1::text)
        AND ($2::text = 'all' OR g.status = $2::text)
      GROUP BY g.id
      ORDER BY g.status ASC, g.probability_weight DESC, g.title ASC
      LIMIT 300
    `, [search, status]);
    res.json({ items: result.rows.map(sanitizeGift) });
  } catch (error) { next(error); }
});

app.post('/api/roleta/gifts', requireAuth, async (req, res, next) => {
  try {
    const title = cleanText(req.body?.title);
    if (!title) return res.status(400).json({ error: 'Informe o título do mimo.' });
    const result = await query(`
      INSERT INTO gifts (title, description, starts_on, ends_on, probability_weight, estimated_cost_cents, status, ai_report)
      VALUES ($1::text, $2::text, NULLIF($3::text,'')::date, NULLIF($4::text,'')::date, GREATEST($5::int, 1), GREATEST($6::int, 0), COALESCE(NULLIF($7::text,''),'active'), $8::jsonb)
      RETURNING *
    `, [
      title,
      cleanText(req.body?.description),
      cleanText(req.body?.startsOn),
      cleanText(req.body?.endsOn),
      Number(req.body?.probabilityWeight || 1),
      moneyToCents(req.body?.estimatedCostCents ?? req.body?.estimatedCost),
      cleanText(req.body?.status || 'active'),
      JSON.stringify(req.body?.aiReport || null)
    ]);
    res.status(201).json({ gift: sanitizeGift(result.rows[0]), message: 'Mimo cadastrado.' });
  } catch (error) { next(error); }
});

app.put('/api/roleta/gifts/:id', requireAuth, async (req, res, next) => {
  try {
    const title = cleanText(req.body?.title);
    if (!title) return res.status(400).json({ error: 'Informe o título do mimo.' });
    const result = await query(`
      UPDATE gifts
      SET title=$2::text,
          description=$3::text,
          starts_on=NULLIF($4::text,'')::date,
          ends_on=NULLIF($5::text,'')::date,
          probability_weight=GREATEST($6::int, 1),
          estimated_cost_cents=GREATEST($7::int, 0),
          status=COALESCE(NULLIF($8::text,''),'active'),
          ai_report=$9::jsonb,
          updated_at=NOW()
      WHERE id=$1::uuid AND deleted_at IS NULL
      RETURNING *
    `, [
      req.params.id,
      title,
      cleanText(req.body?.description),
      cleanText(req.body?.startsOn),
      cleanText(req.body?.endsOn),
      Number(req.body?.probabilityWeight || 1),
      moneyToCents(req.body?.estimatedCostCents ?? req.body?.estimatedCost),
      cleanText(req.body?.status || 'active'),
      JSON.stringify(req.body?.aiReport || null)
    ]);
    if (!result.rowCount) return res.status(404).json({ error: 'Mimo não encontrado.' });
    res.json({ gift: sanitizeGift(result.rows[0]), message: 'Mimo atualizado.' });
  } catch (error) { next(error); }
});

app.patch('/api/roleta/gifts/:id/status', requireAuth, async (req, res, next) => {
  try {
    const status = cleanText(req.body?.status || 'active');
    const result = await query(`
      UPDATE gifts SET status=$2::text, updated_at=NOW()
      WHERE id=$1::uuid AND deleted_at IS NULL
      RETURNING *
    `, [req.params.id, status]);
    if (!result.rowCount) return res.status(404).json({ error: 'Mimo não encontrado.' });
    res.json({ gift: sanitizeGift(result.rows[0]), message: 'Status do mimo atualizado.' });
  } catch (error) { next(error); }
});

app.delete('/api/roleta/gifts/:id', requireAuth, async (req, res, next) => {
  try {
    const result = await query(`UPDATE gifts SET deleted_at=NOW(), updated_at=NOW() WHERE id=$1::uuid AND deleted_at IS NULL RETURNING id`, [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Mimo não encontrado.' });
    res.json({ ok: true, message: 'Mimo removido.' });
  } catch (error) { next(error); }
});

app.post('/api/roleta/spin', requireAuth, async (req, res, next) => {
  try {
    const available = await query(`
      SELECT * FROM gifts
      WHERE deleted_at IS NULL
        AND status = 'active'
        AND probability_weight > 0
        AND (starts_on IS NULL OR starts_on <= CURRENT_DATE)
        AND (ends_on IS NULL OR ends_on >= CURRENT_DATE)
      ORDER BY probability_weight DESC, title ASC
    `);
    const gift = pickWeightedGift(available.rows);
    if (!gift) return res.status(400).json({ error: 'Nenhum mimo ativo disponível para sortear.' });
    const result = await query(`
      INSERT INTO gift_spins (gift_id, tutor_id, pet_id, result_title, spin_context)
      VALUES ($1::uuid, NULLIF($2::text,'')::uuid, NULLIF($3::text,'')::uuid, $4::text, $5::jsonb)
      RETURNING *
    `, [
      gift.id,
      cleanText(req.body?.tutorId),
      cleanText(req.body?.petId),
      gift.title,
      JSON.stringify({ source: 'admin_simulation', weightsTotal: available.rows.reduce((sum, item) => sum + Number(item.probability_weight || 0), 0) })
    ]);
    res.status(201).json({ spin: sanitizeGiftSpin(result.rows[0]), gift: sanitizeGift(gift), message: `Resultado: ${gift.title}` });
  } catch (error) { next(error); }
});

app.get('/api/roleta/spins', requireAuth, async (req, res, next) => {
  try {
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
    const today = await query(`
      WITH base AS (
        SELECT * FROM financial_transactions
        WHERE deleted_at IS NULL
          AND COALESCE(paid_at::date, due_date, created_at::date) >= $1::date
          AND COALESCE(paid_at::date, due_date, created_at::date) < $2::date
      ), payments_today AS (
        SELECT COALESCE(SUM(amount_cents),0)::int AS total FROM payments WHERE paid_at::date = CURRENT_DATE
      )
      SELECT
        (SELECT total FROM payments_today) AS revenue_today_cents,
        COALESCE(SUM(amount_cents) FILTER (WHERE type='income' AND status <> 'paid'),0)::int AS pending_income_cents,
        COUNT(*) FILTER (WHERE type='income' AND status <> 'paid')::int AS pending_income_count,
        COALESCE(SUM(amount_cents) FILTER (WHERE type='expense' AND status <> 'paid'),0)::int AS pending_expense_cents,
        COUNT(*) FILTER (WHERE type='expense' AND status <> 'paid')::int AS pending_expense_count,
        COALESCE(SUM(amount_cents) FILTER (WHERE type='income' AND status='paid' AND paid_at::date = CURRENT_DATE),0)::int AS paid_income_today_cents,
        COALESCE(SUM(amount_cents) FILTER (WHERE type='income' AND status='paid'),0)::int AS paid_income_period_cents,
        COALESCE(SUM(amount_cents) FILTER (WHERE type='expense' AND status='paid' AND paid_at::date = CURRENT_DATE),0)::int AS paid_expense_today_cents,
        COALESCE(SUM(amount_cents) FILTER (WHERE type='income' AND status <> 'paid' AND due_date < CURRENT_DATE),0)::int AS overdue_income_cents,
        COUNT(*) FILTER (WHERE type='income' AND status <> 'paid' AND due_date < CURRENT_DATE)::int AS overdue_income_count
      FROM base
    `, periodParams);
    const flow = await query(`
      SELECT to_char(day, 'DD/MM') AS label,
             COALESCE(SUM(amount_cents) FILTER (WHERE type='income'),0)::int AS income_cents,
             COALESCE(SUM(amount_cents) FILTER (WHERE type='expense'),0)::int AS expense_cents
      FROM generate_series($1::date, ($2::date - INTERVAL '1 day'), INTERVAL '1 day') day
      LEFT JOIN financial_transactions ft ON ft.deleted_at IS NULL AND COALESCE(ft.paid_at::date, ft.due_date, ft.created_at::date) = day::date AND ft.status <> 'canceled'
      GROUP BY day
      ORDER BY day ASC
    `, periodParams);
    const byCategory = await query(`
      SELECT category, type, COALESCE(SUM(amount_cents),0)::int AS total_cents, COUNT(*)::int AS count
      FROM financial_transactions
      WHERE deleted_at IS NULL AND status <> 'canceled'
        AND COALESCE(paid_at::date, due_date, created_at::date) >= $1::date
        AND COALESCE(paid_at::date, due_date, created_at::date) < $2::date
      GROUP BY category, type
      ORDER BY total_cents DESC
      LIMIT 12
    `, periodParams);
    res.json({ period: periodWindow, summary: today.rows[0] || {}, flow: flow.rows, byCategory: byCategory.rows });
  } catch (error) { next(error); }
});

app.get('/api/financeiro/transactions', requireAuth, async (req, res, next) => {
  try {
    const search = cleanText(req.query.search);
    const status = cleanText(req.query.status) || 'all';
    const type = cleanText(req.query.type) || 'all';
    const category = cleanText(req.query.category) || 'all';
    const periodWindow = resolvePeriodWindow({ period: req.query.period || 'month', month: req.query.month, startDate: req.query.startDate, endDate: req.query.endDate });
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
      where.push(`COALESCE(ft.paid_at::date, ft.due_date, ft.created_at::date) >= $${params.length}::date`);
      params.push(periodWindow.end);
      where.push(`COALESCE(ft.paid_at::date, ft.due_date, ft.created_at::date) < $${params.length}::date`);
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

app.get('/api/dashboard/summary', requireAuth, async (req, res, next) => {
  try {
    const summary = await getDashboardSummary();
    res.json(summary);
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

app.get('/api/relatorios/insights', requireAuth, async (req, res, next) => {
  try {
    const periodWindow = resolvePeriodWindow({ period: req.query.period, month: req.query.month, startDate: req.query.startDate, endDate: req.query.endDate });
    const periodParams = [periodWindow.start, periodWindow.end];
    const previousParams = [periodWindow.previousStart, periodWindow.previousEnd];
    const [dashboard, overdue, packages, services, crm] = await Promise.all([
      safeInsightTask('dashboard', () => getDashboardSummary(), { cards: {} }),
      safeInsightTask('inadimplencia', () => query(`
        SELECT COUNT(*)::int AS count, COALESCE(SUM(amount_cents),0)::int AS total_cents
        FROM financial_transactions
        WHERE deleted_at IS NULL
          AND type='income'
          AND status <> 'paid'
          AND due_date < CURRENT_DATE
      `), { rows: [{ count: 0, total_cents: 0 }] }),
      safeInsightTask('pacotes', () => query(`
        SELECT COUNT(*)::int AS count
        FROM customer_packages
        WHERE deleted_at IS NULL
          AND status='active'
          AND (COALESCE(total_sessions, 0) - COALESCE(used_sessions, 0)) <= 1
      `), { rows: [{ count: 0 }] }),
      safeInsightTask('servicos', () => query(`
        SELECT s.name, COUNT(ai.id)::int AS sold_count, COALESCE(SUM(ai.total_cents),0)::int AS total_cents
        FROM appointment_items ai
        LEFT JOIN services s ON s.id=ai.service_id
        GROUP BY s.name
        ORDER BY total_cents DESC NULLS LAST
        LIMIT 5
      `), { rows: [] }),
      safeInsightTask('crm', () => query(`
        SELECT COUNT(*)::int AS open_leads
        FROM crm_leads
        WHERE deleted_at IS NULL
          AND stage NOT IN ('fechado', 'perdido', 'closed')
      `), { rows: [{ open_leads: 0 }] })
    ]);

    const overdueRow = overdue.rows?.[0] || {};
    const insights = [];
    insights.push({ title: 'Agenda de hoje', diagnosis: `Hoje existem ${dashboard.cards?.appointmentsToday?.value || 0} agendamento(s).`, impact: 'A agenda define ocupação, equipe e previsão de faturamento do dia.', action: 'Confirme presença dos tutores pelo WhatsApp e acompanhe check-in/check-out.' });
    if (Number(overdueRow.count || 0) > 0) insights.push({ title: 'Inadimplência ativa', diagnosis: `Há ${overdueRow.count} cobrança(s) vencida(s), somando ${(Number(overdueRow.total_cents || 0)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}.`, impact: 'Valores vencidos reduzem previsibilidade de caixa.', action: 'Acesse Financeiro > Inadimplentes e envie cobrança amigável.' });
    if (Number(packages.rows?.[0]?.count || 0) > 0) insights.push({ title: 'Pacotes perto do fim', diagnosis: `${packages.rows[0].count} pacote(s) ativo(s) têm uma sessão ou menos.`, impact: 'É uma oportunidade direta de renovação antes do cliente encerrar a recorrência.', action: 'Aborde o tutor antes do último atendimento com oferta de renovação.' });
    insights.push({ title: 'Serviços mais fortes', diagnosis: services.rows?.length ? `Serviço com maior receita: ${services.rows[0].name || 'não identificado'}.` : 'Ainda não há volume suficiente de serviços vendidos.', impact: 'Entender serviços fortes ajuda a criar combos e campanhas.', action: 'Use os serviços com melhor desempenho como base para pacotes e promoções.' });
    insights.push({ title: 'CRM e oportunidades', diagnosis: `Existem ${crm.rows?.[0]?.open_leads || 0} lead(s) em aberto no CRM.`, impact: 'Leads parados representam faturamento que ainda não virou agenda.', action: 'Priorize leads com WhatsApp e histórico recente.' });

    const [periodFinance, previousFinance, appointmentsByStatus, packagesProgress, periodServices, periodFlow] = await Promise.all([
      safeInsightTask('financeiro_periodo', () => query(`
        SELECT
          COALESCE(SUM(amount_cents) FILTER (WHERE type='income' AND status <> 'canceled'),0)::int AS income_cents,
          COALESCE(SUM(amount_cents) FILTER (WHERE type='expense' AND status <> 'canceled'),0)::int AS expense_cents,
          COUNT(*) FILTER (WHERE type='income' AND status <> 'canceled')::int AS income_count,
          COUNT(*) FILTER (WHERE type='expense' AND status <> 'canceled')::int AS expense_count
        FROM financial_transactions
        WHERE deleted_at IS NULL
          AND COALESCE(paid_at::date, due_date, created_at::date) >= $1::date
          AND COALESCE(paid_at::date, due_date, created_at::date) < $2::date
      `, periodParams), { rows: [{ income_cents: 0, expense_cents: 0, income_count: 0, expense_count: 0 }] }),
      safeInsightTask('financeiro_periodo_anterior', () => query(`
        SELECT
          COALESCE(SUM(amount_cents) FILTER (WHERE type='income' AND status <> 'canceled'),0)::int AS income_cents,
          COALESCE(SUM(amount_cents) FILTER (WHERE type='expense' AND status <> 'canceled'),0)::int AS expense_cents
        FROM financial_transactions
        WHERE deleted_at IS NULL
          AND COALESCE(paid_at::date, due_date, created_at::date) >= $1::date
          AND COALESCE(paid_at::date, due_date, created_at::date) < $2::date
      `, previousParams), { rows: [{ income_cents: 0, expense_cents: 0 }] }),
      safeInsightTask('agenda_status_periodo', () => query(`
        SELECT status, COUNT(*)::int AS count
        FROM appointments
        WHERE deleted_at IS NULL
          AND starts_at::date >= $1::date
          AND starts_at::date < $2::date
        GROUP BY status
        ORDER BY count DESC
      `, periodParams), { rows: [] }),
      safeInsightTask('pacotes_periodo', () => query(`
        SELECT status, COUNT(*)::int AS count, COALESCE(SUM(total_sessions),0)::int AS total_sessions, COALESCE(SUM(used_sessions),0)::int AS used_sessions
        FROM customer_packages
        WHERE deleted_at IS NULL
          AND created_at::date >= $1::date
          AND created_at::date < $2::date
        GROUP BY status
        ORDER BY count DESC
      `, periodParams), { rows: [] }),
      safeInsightTask('servicos_periodo', () => query(`
        SELECT s.name, COUNT(ai.id)::int AS sold_count, COALESCE(SUM(ai.total_cents),0)::int AS total_cents
        FROM appointment_items ai
        LEFT JOIN services s ON s.id=ai.service_id
        LEFT JOIN appointments a ON a.id=ai.appointment_id
        WHERE a.deleted_at IS NULL
          AND a.starts_at::date >= $1::date
          AND a.starts_at::date < $2::date
        GROUP BY s.name
        ORDER BY total_cents DESC NULLS LAST
        LIMIT 8
      `, periodParams), { rows: [] }),
      safeInsightTask('fluxo_periodo', () => query(`
        SELECT to_char(day, 'DD/MM') AS label,
               COALESCE(SUM(amount_cents) FILTER (WHERE type='income' AND status <> 'canceled'),0)::int AS income_cents,
               COALESCE(SUM(amount_cents) FILTER (WHERE type='expense' AND status <> 'canceled'),0)::int AS expense_cents
        FROM generate_series($1::date, ($2::date - INTERVAL '1 day'), INTERVAL '1 day') day
        LEFT JOIN financial_transactions ft ON ft.deleted_at IS NULL AND COALESCE(ft.paid_at::date, ft.due_date, ft.created_at::date) = day::date
        GROUP BY day
        ORDER BY day ASC
      `, periodParams), { rows: [] })
    ]);

    const [currentGrowth, previousGrowth] = await Promise.all([
      safeInsightTask('crescimento_periodo_atual', () => query(`
        SELECT
          (SELECT COUNT(*)::int FROM appointments WHERE deleted_at IS NULL AND starts_at::date >= $1::date AND starts_at::date < $2::date) AS appointments_count,
          (SELECT COUNT(*)::int FROM customer_packages WHERE deleted_at IS NULL AND created_at::date >= $1::date AND created_at::date < $2::date) AS packages_count,
          (SELECT COUNT(*)::int FROM appointment_items ai LEFT JOIN appointments a ON a.id=ai.appointment_id WHERE a.deleted_at IS NULL AND a.starts_at::date >= $1::date AND a.starts_at::date < $2::date) AS services_count
      `, periodParams), { rows: [{ appointments_count: 0, packages_count: 0, services_count: 0 }] }),
      safeInsightTask('crescimento_periodo_anterior', () => query(`
        SELECT
          (SELECT COUNT(*)::int FROM appointments WHERE deleted_at IS NULL AND starts_at::date >= $1::date AND starts_at::date < $2::date) AS appointments_count,
          (SELECT COUNT(*)::int FROM customer_packages WHERE deleted_at IS NULL AND created_at::date >= $1::date AND created_at::date < $2::date) AS packages_count,
          (SELECT COUNT(*)::int FROM appointment_items ai LEFT JOIN appointments a ON a.id=ai.appointment_id WHERE a.deleted_at IS NULL AND a.starts_at::date >= $1::date AND a.starts_at::date < $2::date) AS services_count
      `, previousParams), { rows: [{ appointments_count: 0, packages_count: 0, services_count: 0 }] })
    ]);

    const growth = {
      current: currentGrowth.rows?.[0] || {},
      previous: previousGrowth.rows?.[0] || {}
    };

    res.json({
      generatedAt: new Date().toISOString(),
      period: periodWindow,
      insights,
      dashboard,
      topServices: services.rows || [],
      comparisons: {
        finance: periodFinance.rows?.[0] || {},
        previousFinance: previousFinance.rows?.[0] || {},
        appointmentsByStatus: appointmentsByStatus.rows || [],
        packagesProgress: packagesProgress.rows || [],
        periodServices: periodServices.rows || [],
        periodFlow: periodFlow.rows || [],
        growth
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

function buildWhatsAppUrl(phone, message) {
  const digits = onlyDigits(phone);
  if (!digits) return '';
  const normalized = digits.startsWith('55') ? digits : `55${digits}`;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message || '')}`;
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

app.get(['/', '/site', '/landing'], (req, res) => sendFrontendFile(res, 'index.html'));
app.get(['/login', '/admin/login'], (req, res) => sendFrontendFile(res, 'pages/login/index.html'));
app.get(['/dashboard', '/admin', '/admin/dashboard'], (req, res) => sendFrontendFile(res, 'pages/dashboard/index.html'));
app.get(['/app/login', '/cliente/login'], (req, res) => sendFrontendFile(res, 'pages/app/login/index.html'));
app.get(['/app/primeiro-acesso', '/cliente/primeiro-acesso'], (req, res) => sendFrontendFile(res, 'pages/app/primeiro-acesso/index.html'));
app.get(['/app', '/app/home', '/app/agenda', '/app/pets', '/app/historico', '/app/pacotes', '/app/mimos', '/app/roleta', '/app/perfil', '/app/pagamento-pix', '/cliente'], (req, res) => sendFrontendFile(res, 'pages/app/home/index.html'));
app.get(['/documentos/recibo/:token', '/public/recibos/:token'], (req, res) => sendFrontendFile(res, 'pages/public/recibo/index.html'));

const modulePages = {
  agenda: 'agenda',
  tutores: 'tutores',
  pets: 'pets',
  servicos: 'servicos',
  pacotes: 'pacotes',
  assinaturas: 'assinaturas',
  financeiro: 'financeiro',
  'comandas-recibos': 'comandas-recibos',
  crm: 'crm',
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

import { query, closePool } from '../config/db.js';
import { env } from '../config/env.js';

const ddl = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  permissions JSONB NOT NULL DEFAULT '["full_access"]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS business_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name TEXT NOT NULL DEFAULT 'PetFunny - Banho e Tosa',
  legal_name TEXT,
  document_number TEXT,
  whatsapp TEXT NOT NULL DEFAULT '5516981535338',
  phone TEXT,
  email TEXT,
  address_street TEXT,
  address_number TEXT,
  address_neighborhood TEXT,
  address_city TEXT NOT NULL DEFAULT 'Ribeirão Preto',
  address_state TEXT NOT NULL DEFAULT 'SP',
  address_zipcode TEXT,
  logo_url TEXT,
  theme JSONB NOT NULL DEFAULT '{"primary":"#00A9B7","accent":"#FF9D98"}'::jsonb,
  document_preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS collaborators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'banho_tosa',
  phone TEXT,
  email TEXT,
  color TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS service_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS appointment_statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL DEFAULT '#00A9B7',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_final BOOLEAN NOT NULL DEFAULT FALSE,
  blocks_slot BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES service_categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  pet_size TEXT NOT NULL DEFAULT 'todos',
  price_cents INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  duration_minutes INTEGER NOT NULL DEFAULT 60 CHECK (duration_minutes > 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (name, pet_size)
);

CREATE TABLE IF NOT EXISTS tutors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  whatsapp TEXT NOT NULL UNIQUE,
  phone TEXT,
  email TEXT,
  document_number TEXT,
  address TEXT,
  city TEXT DEFAULT 'Ribeirão Preto',
  state TEXT DEFAULT 'SP',
  photo_url TEXT,
  tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);



CREATE TABLE IF NOT EXISTS pets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id UUID NOT NULL REFERENCES tutors(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  photo_url TEXT,
  species TEXT NOT NULL DEFAULT 'dog',
  breed TEXT,
  size TEXT NOT NULL DEFAULT 'pequeno',
  coat_type TEXT,
  birth_date DATE,
  weight_kg NUMERIC(6,2),
  preferences TEXT,
  restrictions TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);



CREATE TABLE IF NOT EXISTS client_auth_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp TEXT NOT NULL UNIQUE,
  code_hash TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'app_auth',
  tutor_exists BOOLEAN NOT NULL DEFAULT FALSE,
  verified_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS client_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id UUID NOT NULL UNIQUE REFERENCES tutors(id) ON DELETE CASCADE,
  whatsapp TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  first_access_code_hash TEXT,
  first_access_expires_at TIMESTAMPTZ,
  first_access_confirmed_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'pending_first_access',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS pet_caregivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  tutor_id UUID REFERENCES tutors(id) ON DELETE SET NULL,
  caregiver_tutor_id UUID REFERENCES tutors(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  whatsapp TEXT,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'familiar_autorizado',
  status TEXT NOT NULL DEFAULT 'invited',
  invited_by_tutor_id UUID REFERENCES tutors(id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_pet_caregivers_pet ON pet_caregivers (pet_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_pet_caregivers_caregiver ON pet_caregivers (caregiver_tutor_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_pet_caregivers_unique_whatsapp ON pet_caregivers (pet_id, whatsapp) WHERE deleted_at IS NULL AND whatsapp IS NOT NULL;

CREATE TABLE IF NOT EXISTS pet_wellbeing_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL DEFAULT 'PetFunny 360',
  description TEXT,
  version TEXT NOT NULL DEFAULT '1.0',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS pet_wellbeing_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID REFERENCES pet_wellbeing_forms(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  dimension TEXT NOT NULL,
  question TEXT NOT NULL,
  answer_type TEXT NOT NULL DEFAULT 'scale',
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  weight NUMERIC(6,2) NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_critical BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (code)
);

CREATE TABLE IF NOT EXISTS pet_wellbeing_diagnostics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  tutor_id UUID REFERENCES tutors(id) ON DELETE SET NULL,
  caregiver_id UUID REFERENCES pet_caregivers(id) ON DELETE SET NULL,
  form_id UUID REFERENCES pet_wellbeing_forms(id) ON DELETE SET NULL,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  risk_level TEXT NOT NULL DEFAULT 'baixo',
  summary TEXT,
  insights JSONB NOT NULL DEFAULT '[]'::jsonb,
  recommendations JSONB NOT NULL DEFAULT '[]'::jsonb,
  ai_used BOOLEAN NOT NULL DEFAULT FALSE,
  disclaimer TEXT NOT NULL DEFAULT 'Este diagnóstico é uma análise de bem-estar e comportamento baseada nas respostas dos tutores. Ele não substitui avaliação veterinária.',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_pet_wellbeing_pet ON pet_wellbeing_diagnostics (pet_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_pet_wellbeing_risk ON pet_wellbeing_diagnostics (risk_level, created_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS pet_wellbeing_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  diagnostic_id UUID NOT NULL REFERENCES pet_wellbeing_diagnostics(id) ON DELETE CASCADE,
  question_id UUID REFERENCES pet_wellbeing_questions(id) ON DELETE SET NULL,
  answer_value TEXT,
  answer_score NUMERIC(6,2),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pet_wellbeing_answers_diag ON pet_wellbeing_answers (diagnostic_id);

CREATE TABLE IF NOT EXISTS pet_wellbeing_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  diagnostic_id UUID REFERENCES pet_wellbeing_diagnostics(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'care_insight',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  visible_to_tutor BOOLEAN NOT NULL DEFAULT TRUE,
  visible_to_admin BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_pet_wellbeing_insights_pet ON pet_wellbeing_insights (pet_id, created_at DESC) WHERE deleted_at IS NULL;


-- Tabela-base de pagamentos: precisa existir antes de appointments.payment_method_id.
-- A migration anterior criava appointments antes de payment_methods e quebrava o banco zerado.
CREATE TABLE IF NOT EXISTS payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS business_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  opens_at TIME,
  closes_at TIME,
  is_open BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (weekday)
);

CREATE TABLE IF NOT EXISTS time_slot_capacities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  weekday SMALLINT CHECK (weekday BETWEEN 0 AND 6),
  slot_time TIME NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 1 CHECK (capacity >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (weekday, slot_time)
);

CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id UUID REFERENCES tutors(id) ON DELETE SET NULL,
  pet_id UUID REFERENCES pets(id) ON DELETE SET NULL,
  collaborator_id UUID REFERENCES collaborators(id) ON DELETE SET NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'agendado',
  source TEXT NOT NULL DEFAULT 'manual',
  subtotal_cents INTEGER NOT NULL DEFAULT 0 CHECK (subtotal_cents >= 0),
  discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (discount_percent >= 0 AND discount_percent <= 100),
  discount_cents INTEGER NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
  total_cents INTEGER NOT NULL DEFAULT 0 CHECK (total_cents >= 0),
  package_session_label TEXT,
  notes TEXT,
  payment_status TEXT DEFAULT 'pending',
  payment_method_id UUID REFERENCES payment_methods(id) ON DELETE SET NULL,
  checked_in_at TIMESTAMPTZ,
  checked_out_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);


CREATE TABLE IF NOT EXISTS appointment_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID REFERENCES appointments(id) ON DELETE CASCADE,
  tutor_id UUID REFERENCES tutors(id) ON DELETE CASCADE,
  pet_id UUID REFERENCES pets(id) ON DELETE SET NULL,
  media_type TEXT NOT NULL DEFAULT 'photo' CHECK (media_type IN ('photo','video')),
  url TEXT NOT NULL,
  caption TEXT,
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_appointment_media_appointment ON appointment_media(appointment_id);
CREATE INDEX IF NOT EXISTS idx_appointment_media_tutor ON appointment_media(tutor_id);
CREATE INDEX IF NOT EXISTS idx_appointment_media_pet ON appointment_media(pet_id);
CREATE INDEX IF NOT EXISTS idx_appointment_media_created ON appointment_media(created_at DESC);


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
);
CREATE INDEX IF NOT EXISTS idx_service_reviews_status ON service_reviews(status, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_service_reviews_rating ON service_reviews(rating, submitted_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_service_reviews_appointment ON service_reviews(appointment_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS appointment_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  pet_id UUID REFERENCES pets(id) ON DELETE SET NULL,
  service_id UUID REFERENCES services(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price_cents INTEGER NOT NULL DEFAULT 0 CHECK (unit_price_cents >= 0),
  discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (discount_percent >= 0 AND discount_percent <= 100),
  total_cents INTEGER NOT NULL DEFAULT 0 CHECK (total_cents >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  pet_size TEXT NOT NULL DEFAULT 'todos',
  sessions_count INTEGER NOT NULL CHECK (sessions_count > 0),
  appointments_per_month INTEGER NOT NULL DEFAULT 4 CHECK (appointments_per_month > 0),
  discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (discount_percent >= 0 AND discount_percent <= 100),
  price_cents INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS package_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  service_id UUID REFERENCES services(id) ON DELETE SET NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (package_id, service_id)
);

CREATE TABLE IF NOT EXISTS customer_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id UUID NOT NULL REFERENCES tutors(id) ON DELETE CASCADE,
  pet_id UUID REFERENCES pets(id) ON DELETE SET NULL,
  package_id UUID NOT NULL REFERENCES packages(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'active',
  starts_on DATE NOT NULL DEFAULT CURRENT_DATE,
  ends_on DATE,
  total_sessions INTEGER NOT NULL CHECK (total_sessions > 0),
  used_sessions INTEGER NOT NULL DEFAULT 0 CHECK (used_sessions >= 0),
  amount_cents INTEGER NOT NULL DEFAULT 0 CHECK (amount_cents >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);


ALTER TABLE packages ADD COLUMN IF NOT EXISTS pet_size TEXT NOT NULL DEFAULT 'todos';
ALTER TABLE customer_packages ADD COLUMN IF NOT EXISTS next_session_number INTEGER NOT NULL DEFAULT 1;
ALTER TABLE customer_packages ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE customer_packages ADD COLUMN IF NOT EXISTS recurrence_rule JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE customer_packages ADD COLUMN IF NOT EXISTS recurring BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE customer_packages ADD COLUMN IF NOT EXISTS payment_method_id UUID;
ALTER TABLE customer_packages ADD COLUMN IF NOT EXISTS current_cycle_started_on DATE;
ALTER TABLE customer_packages ADD COLUMN IF NOT EXISTS cycle_number INTEGER NOT NULL DEFAULT 1;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS customer_package_id UUID REFERENCES customer_packages(id) ON DELETE SET NULL;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS package_session_number INTEGER;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS package_total_sessions INTEGER;

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id UUID NOT NULL REFERENCES tutors(id) ON DELETE CASCADE,
  pet_id UUID REFERENCES pets(id) ON DELETE SET NULL,
  package_id UUID REFERENCES packages(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  recurrence TEXT NOT NULL DEFAULT 'monthly',
  amount_cents INTEGER NOT NULL DEFAULT 0 CHECK (amount_cents >= 0),
  starts_on DATE NOT NULL DEFAULT CURRENT_DATE,
  next_billing_on DATE,
  payment_method TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS payment_statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL DEFAULT '#00A9B7',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS tutor_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id UUID NOT NULL REFERENCES tutors(id) ON DELETE CASCADE,
  points_balance INTEGER NOT NULL DEFAULT 0 CHECK (points_balance >= 0),
  level TEXT NOT NULL DEFAULT 'inicial',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tutor_id)
);

CREATE TABLE IF NOT EXISTS tutor_reward_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id UUID NOT NULL REFERENCES tutors(id) ON DELETE CASCADE,
  pet_id UUID REFERENCES pets(id) ON DELETE SET NULL,
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  customer_package_id UUID REFERENCES customer_packages(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS tutor_reward_events_appointment_once_idx
  ON tutor_reward_events (tutor_id, event_type, appointment_id)
  WHERE appointment_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tutor_reward_events_package_once_idx
  ON tutor_reward_events (tutor_id, event_type, customer_package_id)
  WHERE customer_package_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS tutor_reward_events_tutor_created_idx ON tutor_reward_events (tutor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tutor_reward_events_pet_idx ON tutor_reward_events (pet_id);



CREATE TABLE IF NOT EXISTS app_access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id UUID REFERENCES tutors(id) ON DELETE SET NULL,
  phone TEXT,
  event_type TEXT NOT NULL DEFAULT 'page_view',
  page TEXT,
  user_agent TEXT,
  ip_address TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS app_access_logs_tutor_created_idx ON app_access_logs (tutor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS app_access_logs_event_created_idx ON app_access_logs (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS app_access_logs_phone_idx ON app_access_logs (phone);

CREATE TABLE IF NOT EXISTS tutor_engagement_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id UUID NOT NULL REFERENCES tutors(id) ON DELETE CASCADE,
  pet_id UUID REFERENCES pets(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  cta_label TEXT,
  cta_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS tutor_engagement_events_tutor_created_idx ON tutor_engagement_events (tutor_id, created_at DESC);

CREATE TABLE IF NOT EXISTS tutor_referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_tutor_id UUID NOT NULL REFERENCES tutors(id) ON DELETE CASCADE,
  referred_name TEXT,
  referred_phone TEXT,
  referred_tutor_id UUID REFERENCES tutors(id) ON DELETE SET NULL,
  referral_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'created',
  reward_points INTEGER NOT NULL DEFAULT 5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  converted_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS tutor_referrals_code_idx ON tutor_referrals(referral_code);
CREATE INDEX IF NOT EXISTS tutor_referrals_referrer_idx ON tutor_referrals(referrer_tutor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tutor_referrals_phone_idx ON tutor_referrals(referred_phone);
CREATE INDEX IF NOT EXISTS tutor_referrals_status_idx ON tutor_referrals(status);



CREATE TABLE IF NOT EXISTS financial_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  customer_package_id UUID REFERENCES customer_packages(id) ON DELETE SET NULL,
  tutor_id UUID REFERENCES tutors(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  due_date DATE,
  paid_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);



-- v1.6.25 Financeiro v2: competência das entradas por data de vencimento.
-- Mantém dados antigos consistentes: lançamentos vindos de agendamentos passam a usar a data do atendimento como vencimento quando due_date ainda estiver vazio.
UPDATE financial_transactions ft
SET due_date = a.starts_at::date,
    updated_at = NOW()
FROM appointments a
WHERE ft.appointment_id = a.id
  AND ft.deleted_at IS NULL
  AND ft.type = 'income'
  AND ft.due_date IS NULL
  AND a.starts_at IS NOT NULL;

-- Fallback seguro para entradas antigas sem agendamento: usa a data de lançamento apenas quando não houver outra referência.
UPDATE financial_transactions
SET due_date = created_at::date,
    updated_at = NOW()
WHERE deleted_at IS NULL
  AND type = 'income'
  AND due_date IS NULL;

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  financial_transaction_id UUID REFERENCES financial_transactions(id) ON DELETE SET NULL,
  payment_method_id UUID REFERENCES payment_methods(id) ON DELETE SET NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  external_reference TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
  public_token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  document_number TEXT UNIQUE,
  subtotal_cents INTEGER NOT NULL DEFAULT 0,
  discount_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id UUID REFERENCES tutors(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  whatsapp TEXT,
  email TEXT,
  stage TEXT NOT NULL DEFAULT 'lead_entrou',
  source TEXT NOT NULL DEFAULT 'manual',
  last_contact_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS crm_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES crm_leads(id) ON DELETE CASCADE,
  tutor_id UUID REFERENCES tutors(id) ON DELETE SET NULL,
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  direction TEXT NOT NULL DEFAULT 'outbound',
  subject TEXT,
  message TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL UNIQUE,
  description TEXT,
  starts_on DATE,
  ends_on DATE,
  probability_weight INTEGER NOT NULL DEFAULT 1 CHECK (probability_weight > 0),
  estimated_cost_cents INTEGER NOT NULL DEFAULT 0 CHECK (estimated_cost_cents >= 0),
  status TEXT NOT NULL DEFAULT 'active',
  ai_report JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS gift_spins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gift_id UUID REFERENCES gifts(id) ON DELETE SET NULL,
  tutor_id UUID REFERENCES tutors(id) ON DELETE SET NULL,
  pet_id UUID REFERENCES pets(id) ON DELETE SET NULL,
  result_title TEXT NOT NULL,
  spin_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  spun_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Compatibilidade incremental da Roleta de Mimos para bancos já existentes.
-- Garante que instalações antigas passem a listar mimos cadastrados sem exigir reset do banco.
ALTER TABLE gifts ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE gifts ADD COLUMN IF NOT EXISTS starts_on DATE;
ALTER TABLE gifts ADD COLUMN IF NOT EXISTS ends_on DATE;
ALTER TABLE gifts ADD COLUMN IF NOT EXISTS probability_weight INTEGER NOT NULL DEFAULT 1;
ALTER TABLE gifts ADD COLUMN IF NOT EXISTS estimated_cost_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE gifts ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE gifts ADD COLUMN IF NOT EXISTS ai_report JSONB;
ALTER TABLE gifts ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE gifts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE gifts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE gift_spins ADD COLUMN IF NOT EXISTS spin_context JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE gift_spins ADD COLUMN IF NOT EXISTS spun_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE gift_spins ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();



CREATE TABLE IF NOT EXISTS promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  service_id UUID REFERENCES services(id) ON DELETE SET NULL,
  pet_size TEXT NOT NULL DEFAULT 'todos',
  discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (discount_percent >= 0 AND discount_percent <= 100),
  weekdays SMALLINT[] NOT NULL DEFAULT ARRAY[]::SMALLINT[],
  starts_on DATE,
  ends_on DATE,
  status TEXT NOT NULL DEFAULT 'active',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_promotions_active ON promotions (is_active, status, starts_on, ends_on) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_promotions_service ON promotions (service_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
);

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
);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_conversation ON whatsapp_messages (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_phone ON whatsapp_messages (phone, created_at DESC);


ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS website_url TEXT;
ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS instagram_url TEXT;
ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS facebook_url TEXT;
ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS tiktok_url TEXT;
ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS google_business_url TEXT;
ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS maps_url TEXT;
ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS social_links JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS seo_title TEXT;
ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS seo_description TEXT;
ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS seo_keywords TEXT;
ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS seo_image_url TEXT;
ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS seo_settings JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS landing_headline TEXT;
ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS landing_subheadline TEXT;

CREATE TABLE IF NOT EXISTS pet_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pet_sizes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  min_weight_kg NUMERIC(6,2),
  max_weight_kg NUMERIC(6,2),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pet_breeds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_type_id UUID REFERENCES pet_types(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  suggested_size_code TEXT REFERENCES pet_sizes(code) ON DELETE SET NULL,
  coat_type TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (pet_type_id, name)
);

CREATE INDEX IF NOT EXISTS idx_tutors_whatsapp ON tutors (whatsapp);
CREATE INDEX IF NOT EXISTS idx_tutors_name ON tutors (name);
CREATE INDEX IF NOT EXISTS idx_pets_tutor ON pets (tutor_id);
CREATE INDEX IF NOT EXISTS idx_client_auth_codes_whatsapp ON client_auth_codes (whatsapp);
CREATE INDEX IF NOT EXISTS idx_client_accounts_whatsapp ON client_accounts (whatsapp);
CREATE INDEX IF NOT EXISTS idx_client_accounts_tutor ON client_accounts (tutor_id);
CREATE INDEX IF NOT EXISTS idx_services_active ON services (is_active);

ALTER TABLE promotions ADD COLUMN IF NOT EXISTS pet_size TEXT NOT NULL DEFAULT 'todos';
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS weekdays SMALLINT[] NOT NULL DEFAULT ARRAY[]::SMALLINT[];
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
CREATE INDEX IF NOT EXISTS idx_promotions_active ON promotions (is_active, status, starts_on, ends_on) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_promotions_service ON promotions (service_id) WHERE deleted_at IS NULL;


ALTER TABLE service_categories ADD COLUMN IF NOT EXISTS pet_type_code TEXT REFERENCES pet_types(code) ON DELETE SET NULL;
ALTER TABLE service_categories ADD COLUMN IF NOT EXISTS pet_size_code TEXT REFERENCES pet_sizes(code) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_service_categories_pet_filters ON service_categories (pet_type_code, pet_size_code);
CREATE INDEX IF NOT EXISTS idx_service_categories_active ON service_categories (is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_appointment_statuses_active ON appointment_statuses (is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_business_hours_weekday ON business_hours (weekday);
CREATE INDEX IF NOT EXISTS idx_time_slot_capacities_weekday_time ON time_slot_capacities (weekday, slot_time);
ALTER TABLE tutors ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE tutors ADD COLUMN IF NOT EXISTS address_number TEXT;
ALTER TABLE tutors ADD COLUMN IF NOT EXISTS address_neighborhood TEXT;
ALTER TABLE tutors ADD COLUMN IF NOT EXISTS address_zipcode TEXT;
ALTER TABLE pets ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending';
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS payment_method_id UUID REFERENCES payment_methods(id) ON DELETE SET NULL;



CREATE TABLE IF NOT EXISTS appointment_payment_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id UUID NOT NULL REFERENCES tutors(id) ON DELETE CASCADE,
  client_account_id UUID REFERENCES client_accounts(id) ON DELETE SET NULL,
  pet_id UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'mercado_pago',
  status TEXT NOT NULL DEFAULT 'pending',
  amount_cents INTEGER NOT NULL DEFAULT 0 CHECK (amount_cents >= 0),
  description TEXT,
  pending_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  mp_payment_id TEXT,
  mp_status TEXT,
  qr_code TEXT,
  qr_code_base64 TEXT,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + interval '5 minutes'),
  paid_at TIMESTAMPTZ,
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  last_error TEXT,
  provider_response JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_appointment_payment_intents_tutor ON appointment_payment_intents (tutor_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_appointment_payment_intents_mp ON appointment_payment_intents (mp_payment_id) WHERE mp_payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_appointment_payment_intents_status ON appointment_payment_intents (status, expires_at) WHERE deleted_at IS NULL;
ALTER TABLE appointment_payment_intents ADD COLUMN IF NOT EXISTS payment_type TEXT NOT NULL DEFAULT 'pix';
ALTER TABLE appointment_payment_intents ADD COLUMN IF NOT EXISTS mp_preference_id TEXT;
ALTER TABLE appointment_payment_intents ADD COLUMN IF NOT EXISTS checkout_url TEXT;
CREATE INDEX IF NOT EXISTS idx_appointment_payment_intents_preference ON appointment_payment_intents (mp_preference_id) WHERE mp_preference_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS package_payment_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id UUID NOT NULL REFERENCES tutors(id) ON DELETE CASCADE,
  client_account_id UUID REFERENCES client_accounts(id) ON DELETE SET NULL,
  pet_id UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'mercado_pago',
  status TEXT NOT NULL DEFAULT 'pending',
  amount_cents INTEGER NOT NULL DEFAULT 0 CHECK (amount_cents >= 0),
  description TEXT,
  pending_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  mp_payment_id TEXT,
  mp_status TEXT,
  qr_code TEXT,
  qr_code_base64 TEXT,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + interval '5 minutes'),
  paid_at TIMESTAMPTZ,
  customer_package_id UUID REFERENCES customer_packages(id) ON DELETE SET NULL,
  last_error TEXT,
  provider_response JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_package_payment_intents_tutor ON package_payment_intents (tutor_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_package_payment_intents_mp ON package_payment_intents (mp_payment_id) WHERE mp_payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_package_payment_intents_status ON package_payment_intents (status, expires_at) WHERE deleted_at IS NULL;
ALTER TABLE package_payment_intents ADD COLUMN IF NOT EXISTS payment_type TEXT NOT NULL DEFAULT 'pix';
ALTER TABLE package_payment_intents ADD COLUMN IF NOT EXISTS mp_preference_id TEXT;
ALTER TABLE package_payment_intents ADD COLUMN IF NOT EXISTS checkout_url TEXT;
CREATE INDEX IF NOT EXISTS idx_package_payment_intents_preference ON package_payment_intents (mp_preference_id) WHERE mp_preference_id IS NOT NULL;


CREATE TABLE IF NOT EXISTS system_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL DEFAULT 'info',
  priority TEXT NOT NULL DEFAULT 'medium',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  module TEXT NOT NULL DEFAULT 'dashboard',
  action_url TEXT,
  entity_type TEXT,
  entity_id UUID,
  source_key TEXT UNIQUE,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_system_notifications_read ON system_notifications (is_read, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_system_notifications_module ON system_notifications (module, created_at DESC) WHERE deleted_at IS NULL;


CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id UUID REFERENCES tutors(id) ON DELETE CASCADE,
  account_id UUID REFERENCES client_accounts(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT,
  auth TEXT,
  subscription JSONB NOT NULL DEFAULT '{}'::jsonb,
  platform TEXT,
  user_agent TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  last_success_at TIMESTAMPTZ,
  last_error_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_tutor ON push_subscriptions (tutor_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_status ON push_subscriptions (status) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS push_notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id UUID REFERENCES tutors(id) ON DELETE SET NULL,
  account_id UUID REFERENCES client_accounts(id) ON DELETE SET NULL,
  subscription_id UUID REFERENCES push_subscriptions(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  url TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'queued',
  error TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_push_notification_logs_tutor ON push_notification_logs (tutor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_push_notification_logs_status ON push_notification_logs (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_appointments_starts_at ON appointments (starts_at);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments (status);
CREATE INDEX IF NOT EXISTS idx_customer_packages_status ON customer_packages (status, tutor_id, pet_id);
CREATE INDEX IF NOT EXISTS idx_appointments_customer_package ON appointments (customer_package_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_package_items_package ON package_items (package_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions (status, tutor_id, next_billing_on);
CREATE INDEX IF NOT EXISTS idx_financial_status ON financial_transactions (status);
CREATE INDEX IF NOT EXISTS idx_gifts_status_dates ON gifts (status, starts_on, ends_on);

DO $$
DECLARE
  table_name_text TEXT;
BEGIN
  FOREACH table_name_text IN ARRAY ARRAY[
    'users','business_settings','collaborators','service_categories','services','tutors','pets','client_auth_codes','client_accounts',
    'business_hours','time_slot_capacities','appointment_statuses','appointments','appointment_items','packages','package_items',
    'customer_packages','subscriptions','payment_methods','payment_statuses','financial_transactions','payments','receipts','crm_leads',
    'crm_interactions','gifts','settings','pet_types','pet_sizes','pet_breeds','system_notifications','push_subscriptions',
    'pet_caregivers','pet_wellbeing_forms','pet_wellbeing_questions','pet_wellbeing_diagnostics','pet_wellbeing_insights'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON %I', table_name_text, table_name_text);
    EXECUTE format('CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', table_name_text, table_name_text);
  END LOOP;
END $$;
`;

async function main() {
  console.log('[db:migrate] PetFunny OS v0.9 - validando schema com pacotes, sessões e assinaturas.');
  console.log(`[db:migrate] ambiente=${env.nodeEnv} appMode=${env.appMode}`);

  if (!env.databaseUrl) {
    throw new Error('DATABASE_URL não configurada. Crie backend/.env a partir de backend/.env.example antes de rodar npm run db:migrate.');
  }

  await query('BEGIN');
  try {
    await query(ddl);
    await query(`
      INSERT INTO business_settings (business_name, whatsapp, address_city, address_state, seo_title, seo_description, seo_keywords, landing_headline, landing_subheadline)
      SELECT $1::text, $2::text, $3::text, $4::text,
             'PetFunny - Banho e Tosa em Ribeirão Preto'::text,
             'Banho e tosa com carinho, agenda prática, aplicativo do cliente e atendimento pelo WhatsApp em Ribeirão Preto.'::text,
             'banho e tosa Ribeirão Preto, pet shop Ribeirão Preto, PetFunny, banho cachorro, tosa cachorro'::text,
             'O cuidado do seu pet dentro do PetFunny.'::text,
             'Agende banho e tosa, acompanhe histórico e receba novidades pelo aplicativo do cliente.'::text
      WHERE NOT EXISTS (SELECT 1 FROM business_settings)
    `, [env.petfunnyName, env.petfunnyWhatsapp, env.petfunnyCity, env.petfunnyState]);

    await query(`
      INSERT INTO settings (key, value)
      VALUES
        ('app.mode', jsonb_build_object('value', $1::text, 'tenant', false)),
        ('app.identity', jsonb_build_object('name', $2::text, 'city', $3::text, 'state', $4::text, 'whatsapp', $5::text))
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `, [env.appMode, env.petfunnyName, env.petfunnyCity, env.petfunnyState, env.petfunnyWhatsapp]);

    await query(`
      INSERT INTO appointment_statuses (code, name, description, color, sort_order, is_active, is_final, blocks_slot)
      VALUES
        ('agendado', 'Agendado', 'Atendimento criado e aguardando confirmação.', '#5b7cfa', 1, TRUE, FALSE, TRUE),
        ('confirmado', 'Confirmado', 'Atendimento confirmado com o tutor.', '#00A9B7', 2, TRUE, FALSE, TRUE),
        ('em_atendimento', 'Em atendimento', 'Pet já está em atendimento.', '#f59e0b', 3, TRUE, FALSE, TRUE),
        ('finalizado', 'Finalizado', 'Atendimento concluído.', '#22c55e', 4, TRUE, TRUE, FALSE),
        ('cancelado', 'Cancelado', 'Atendimento cancelado.', '#ef4444', 5, TRUE, TRUE, FALSE),
        ('nao_compareceu', 'Não compareceu', 'Tutor/pet não compareceu ao horário.', '#64748b', 6, TRUE, TRUE, FALSE)
      ON CONFLICT (code) DO UPDATE
      SET name = EXCLUDED.name,
          description = EXCLUDED.description,
          color = EXCLUDED.color,
          sort_order = EXCLUDED.sort_order,
          is_active = TRUE,
          is_final = EXCLUDED.is_final,
          blocks_slot = EXCLUDED.blocks_slot,
          deleted_at = NULL,
          updated_at = NOW()
    `);



    await query(`
      INSERT INTO pet_wellbeing_forms (title, description, version, is_active)
      SELECT 'PetFunny 360', 'Avaliação periódica de comportamento, rotina, saúde percebida, socialização e bem-estar emocional do pet.', '1.0', TRUE
      WHERE NOT EXISTS (SELECT 1 FROM pet_wellbeing_forms WHERE deleted_at IS NULL)
    `);

    await query(`
      WITH active_form AS (
        SELECT id FROM pet_wellbeing_forms WHERE deleted_at IS NULL AND is_active = TRUE ORDER BY created_at ASC LIMIT 1
      )
      INSERT INTO pet_wellbeing_questions (form_id, code, dimension, question, answer_type, options, weight, sort_order, is_critical, is_active)
      SELECT active_form.id, q.code, q.dimension, q.question, q.answer_type, q.options::jsonb, q.weight, q.sort_order, q.is_critical, TRUE
      FROM active_form,
      (VALUES
        ('apetite', 'saude_percebida', 'O pet está comendo normalmente?', 'scale', '[{"value":"normal","label":"Sim, normalmente","score":0},{"value":"menos","label":"Comeu menos que o normal","score":2},{"value":"nao","label":"Não quis comer","score":4}]', 1.5, 10, TRUE),
        ('mudanca_apetite', 'saude_percebida', 'Houve mudança de apetite nos últimos dias?', 'scale', '[{"value":"nao","label":"Não","score":0},{"value":"leve","label":"Mudança leve","score":1},{"value":"forte","label":"Mudança forte","score":3}]', 1.2, 20, FALSE),
        ('sono', 'rotina', 'Como está o sono?', 'scale', '[{"value":"normal","label":"Normal","score":0},{"value":"irregular","label":"Irregular","score":1},{"value":"muito_alterado","label":"Muito alterado","score":3}]', 1.0, 30, FALSE),
        ('humor', 'emocional', 'Está mais agitado, medroso ou quieto?', 'scale', '[{"value":"normal","label":"Comportamento normal","score":0},{"value":"leve","label":"Um pouco diferente","score":1},{"value":"forte","label":"Muito diferente","score":3}]', 1.2, 40, FALSE),
        ('coceira', 'saude_percebida', 'Está se coçando mais que o normal?', 'scale', '[{"value":"nao","label":"Não","score":0},{"value":"as_vezes","label":"Às vezes","score":1},{"value":"muito","label":"Muito","score":3}]', 1.2, 50, FALSE),
        ('vocalizacao', 'emocional', 'Tem chorado, latido ou se escondido?', 'scale', '[{"value":"nao","label":"Não","score":0},{"value":"as_vezes","label":"Às vezes","score":1},{"value":"frequente","label":"Com frequência","score":3}]', 1.0, 60, FALSE),
        ('banho_tosa', 'socializacao', 'Como reage ao banho e tosa?', 'scale', '[{"value":"tranquilo","label":"Tranquilo","score":0},{"value":"ansioso","label":"Ansioso","score":1},{"value":"muito_estressado","label":"Muito estressado","score":3}]', 1.2, 70, FALSE),
        ('outros_pets', 'socializacao', 'Como reage a outros pets?', 'scale', '[{"value":"bem","label":"Bem","score":0},{"value":"evita","label":"Evita ou estranha","score":1},{"value":"reativo","label":"Fica reativo/agressivo","score":3}]', 1.0, 80, FALSE),
        ('necessidades', 'saude_percebida', 'Está fazendo necessidades normalmente?', 'scale', '[{"value":"normal","label":"Normalmente","score":0},{"value":"alterado","label":"Alterou um pouco","score":2},{"value":"muito_alterado","label":"Muito alterado","score":4}]', 1.5, 90, TRUE),
        ('mudanca_casa', 'rotina', 'Teve alguma mudança recente na casa ou rotina?', 'scale', '[{"value":"nao","label":"Não","score":0},{"value":"sim_leve","label":"Sim, leve","score":1},{"value":"sim_forte","label":"Sim, importante","score":2}]', 0.8, 100, FALSE),
        ('condicao_saude', 'saude_percebida', 'Tem restrição, medicação ou condição de saúde?', 'text', '[]', 1.0, 110, FALSE),
        ('ultimo_atendimento', 'rotina', 'Como foi o último atendimento no PetFunny?', 'text', '[]', 0.8, 120, FALSE),
        ('sinais_graves', 'alerta', 'Há sinais graves como vômitos recorrentes, dificuldade para respirar, sangramento, dor intensa, apatia forte, convulsão ou alteração urinária importante?', 'scale', '[{"value":"nao","label":"Não","score":0},{"value":"sim","label":"Sim, há sinal grave","score":10}]', 2.0, 130, TRUE)
      ) AS q(code, dimension, question, answer_type, options, weight, sort_order, is_critical)
      ON CONFLICT (code) DO UPDATE SET question=EXCLUDED.question, dimension=EXCLUDED.dimension, options=EXCLUDED.options, weight=EXCLUDED.weight, sort_order=EXCLUDED.sort_order, is_critical=EXCLUDED.is_critical, is_active=TRUE, updated_at=NOW()
    `);


    await query(`
      CREATE TABLE IF NOT EXISTS veterinarians (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        crmv TEXT,
        specialty TEXT NOT NULL DEFAULT 'Clínica geral',
        bio TEXT,
        photo_url TEXT,
        crmv_uf TEXT DEFAULT 'SP',
        phone TEXT,
        whatsapp TEXT,
        email TEXT,
        consultation_price_cents INTEGER NOT NULL DEFAULT 9900,
        return_price_cents INTEGER NOT NULL DEFAULT 0,
        default_duration_minutes INTEGER NOT NULL DEFAULT 30,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ
      );
      CREATE TABLE IF NOT EXISTS teleconsultation_slots (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        veterinarian_id UUID REFERENCES veterinarians(id) ON DELETE SET NULL,
        starts_at TIMESTAMPTZ NOT NULL,
        ends_at TIMESTAMPTZ NOT NULL,
        status TEXT NOT NULL DEFAULT 'available',
        price_cents INTEGER NOT NULL DEFAULT 9900,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ
      );
      CREATE TABLE IF NOT EXISTS teleconsultations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tutor_id UUID NOT NULL REFERENCES tutors(id) ON DELETE CASCADE,
        pet_id UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
        veterinarian_id UUID REFERENCES veterinarians(id) ON DELETE SET NULL,
        slot_id UUID REFERENCES teleconsultation_slots(id) ON DELETE SET NULL,
        reason TEXT NOT NULL,
        symptoms TEXT,
        starts_at TIMESTAMPTZ,
        price_cents INTEGER NOT NULL DEFAULT 9900,
        payment_method TEXT NOT NULL DEFAULT 'pix',
        payment_status TEXT NOT NULL DEFAULT 'pending',
        status TEXT NOT NULL DEFAULT 'pending_payment',
        meeting_url TEXT,
        safety_notice_accepted BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ
      );
      CREATE TABLE IF NOT EXISTS teleconsultation_payment_intents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tutor_id UUID NOT NULL REFERENCES tutors(id) ON DELETE CASCADE,
        client_account_id UUID,
        pet_id UUID REFERENCES pets(id) ON DELETE SET NULL,
        teleconsultation_id UUID REFERENCES teleconsultations(id) ON DELETE SET NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        provider TEXT NOT NULL DEFAULT 'mercado_pago',
        payment_type TEXT NOT NULL DEFAULT 'pix',
        amount_cents INTEGER NOT NULL DEFAULT 0,
        description TEXT,
        pending_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        mp_payment_id TEXT,
        mp_status TEXT,
        qr_code TEXT,
        qr_code_base64 TEXT,
        ticket_url TEXT,
        provider_response JSONB NOT NULL DEFAULT '{}'::jsonb,
        last_error TEXT,
        expires_at TIMESTAMPTZ,
        paid_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ
      );
      CREATE TABLE IF NOT EXISTS pet_health_triages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tutor_id UUID NOT NULL REFERENCES tutors(id) ON DELETE CASCADE,
        pet_id UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
        symptoms TEXT NOT NULL,
        duration TEXT,
        appetite TEXT,
        water TEXT,
        behavior TEXT,
        vomiting TEXT,
        diarrhea TEXT,
        breathing TEXT,
        pain TEXT,
        bleeding TEXT,
        seizure TEXT,
        trauma TEXT,
        poison TEXT,
        fever TEXT,
        other_signs TEXT,
        risk_level TEXT NOT NULL DEFAULT 'low',
        summary TEXT,
        guidance TEXT,
        red_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
        recommended_action TEXT,
        emergency BOOLEAN NOT NULL DEFAULT FALSE,
        ai_used BOOLEAN NOT NULL DEFAULT FALSE,
        raw_result JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ
      );
      CREATE TABLE IF NOT EXISTS pet_medical_records (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tutor_id UUID NOT NULL REFERENCES tutors(id) ON DELETE CASCADE,
        pet_id UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
        type TEXT NOT NULL DEFAULT 'NOTE',
        title TEXT NOT NULL,
        description TEXT,
        source_type TEXT,
        source_id UUID,
        occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ
      );
      CREATE TABLE IF NOT EXISTS pet_health_scores (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tutor_id UUID NOT NULL REFERENCES tutors(id) ON DELETE CASCADE,
        pet_id UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
        score INTEGER NOT NULL DEFAULT 80,
        label TEXT NOT NULL DEFAULT 'Bom',
        factors JSONB NOT NULL DEFAULT '{}'::jsonb,
        calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_health_triages_pet ON pet_health_triages(pet_id, created_at DESC) WHERE deleted_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_medical_records_pet ON pet_medical_records(pet_id, occurred_at DESC) WHERE deleted_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_teleconsultations_tutor ON teleconsultations(tutor_id, starts_at DESC) WHERE deleted_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_teleconsult_payment_tutor ON teleconsultation_payment_intents(tutor_id, created_at DESC) WHERE deleted_at IS NULL;
    `);

    await query(`ALTER TABLE veterinarians ADD COLUMN IF NOT EXISTS crmv_uf TEXT DEFAULT 'SP'`);
    await query(`ALTER TABLE veterinarians ADD COLUMN IF NOT EXISTS phone TEXT`);
    await query(`ALTER TABLE veterinarians ADD COLUMN IF NOT EXISTS whatsapp TEXT`);
    await query(`ALTER TABLE veterinarians ADD COLUMN IF NOT EXISTS email TEXT`);
    await query(`ALTER TABLE veterinarians ADD COLUMN IF NOT EXISTS return_price_cents INTEGER NOT NULL DEFAULT 0`);
    await query(`ALTER TABLE veterinarians ADD COLUMN IF NOT EXISTS default_duration_minutes INTEGER NOT NULL DEFAULT 30`);
    await query(`ALTER TABLE teleconsultation_slots ADD COLUMN IF NOT EXISTS price_cents INTEGER NOT NULL DEFAULT 9900`);
    await query(`ALTER TABLE teleconsultations ADD COLUMN IF NOT EXISTS slot_id UUID`);
    await query(`ALTER TABLE teleconsultations ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'pix'`);
    await query(`ALTER TABLE teleconsultations ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'pending'`);
    await query(`ALTER TABLE teleconsultations ADD COLUMN IF NOT EXISTS meeting_url TEXT`);
    await query(`ALTER TABLE teleconsultation_payment_intents ADD COLUMN IF NOT EXISTS payment_type TEXT NOT NULL DEFAULT 'pix'`);
    await query(`ALTER TABLE teleconsultation_payment_intents ADD COLUMN IF NOT EXISTS checkout_url TEXT`);
    await query(`ALTER TABLE teleconsultation_payment_intents ADD COLUMN IF NOT EXISTS mp_preference_id TEXT`);


    await query(`
      INSERT INTO veterinarians (name, crmv, specialty, bio, consultation_price_cents, is_active)
      VALUES
        ('Dra. Marina Alves', 'CRMV-SP 00000', 'Clínica geral e bem-estar preventivo', 'Orientação veterinária preventiva para tutores PetFunny.', 9900, TRUE),
        ('Dr. Rafael Nogueira', 'CRMV-SP 00001', 'Dermatologia e pele/pelagem', 'Teleorientação para sinais de pele, coceira e rotina de cuidados.', 11900, TRUE)
      ON CONFLICT DO NOTHING
    `);

    await query(`
      INSERT INTO teleconsultation_slots (veterinarian_id, starts_at, ends_at, price_cents, status)
      SELECT id, NOW() + interval '1 day' + interval '10 hours', NOW() + interval '1 day' + interval '10 hours 30 minutes', consultation_price_cents, 'available'
      FROM veterinarians WHERE deleted_at IS NULL AND is_active = TRUE
      ON CONFLICT DO NOTHING
    `);


    await query('COMMIT');
    console.log('[db:migrate] concluído com sucesso. Tabelas exclusivas PetFunny criadas/validadas.');
  } catch (error) {
    await query('ROLLBACK');
    throw error;
  }
}

main()
  .catch((error) => {
    console.error('[db:migrate] erro:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });

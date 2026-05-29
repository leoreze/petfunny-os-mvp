import bcrypt from 'bcryptjs';
import { query, closePool } from '../config/db.js';
import { env } from '../config/env.js';

const adminEmail = process.env.ADMIN_EMAIL || 'admin@petfunny.local';
const adminPassword = process.env.ADMIN_PASSWORD || 'PetFunny@2026';

async function main() {
  console.log('[db:seed] PetFunny OS v0.7.1 - populando admin, demo, configurações operacionais e app do cliente.');

  if (!env.databaseUrl) {
    throw new Error('DATABASE_URL não configurada. Crie backend/.env a partir de backend/.env.example antes de rodar npm run db:seed.');
  }

  await query('BEGIN');
  try {
    const passwordHash = await bcrypt.hash(adminPassword, 12);

    await query(`
      INSERT INTO users (name, email, password_hash, role, permissions)
      VALUES ('Administrador PetFunny', $1, $2, 'admin', '["full_access"]'::jsonb)
      ON CONFLICT (email) DO UPDATE
      SET name = EXCLUDED.name,
          password_hash = EXCLUDED.password_hash,
          role = 'admin',
          permissions = '["full_access"]'::jsonb,
          is_active = TRUE,
          updated_at = NOW()
    `, [adminEmail, passwordHash]);

    await query(`
      UPDATE business_settings
      SET business_name = 'PetFunny - Banho e Tosa',
          legal_name = 'PetFunny - Banho e Tosa',
          whatsapp = '5516981535338',
          phone = '16981535338',
          email = 'contato@petfunny.local',
          address_street = 'Rua Virgílio de Carvalho Neves Neto',
          address_number = '794',
          address_neighborhood = 'Ribeirão Preto',
          address_city = 'Ribeirão Preto',
          address_state = 'SP',
          website_url = 'http://localhost:3000',
          instagram_url = 'https://instagram.com/petfunny',
          google_business_url = '',
          maps_url = '',
          social_links = jsonb_build_object('instagram', 'https://instagram.com/petfunny', 'whatsapp', '5516981535338'),
          seo_title = 'PetFunny - Banho e Tosa em Ribeirão Preto',
          seo_description = 'Banho e tosa com carinho, agenda prática, aplicativo do cliente e atendimento pelo WhatsApp em Ribeirão Preto.',
          seo_keywords = 'banho e tosa Ribeirão Preto, pet shop Ribeirão Preto, PetFunny, banho cachorro, tosa cachorro',
          seo_image_url = '/assets/img/logo-petfunny-full.png',
          seo_settings = jsonb_build_object('title', 'PetFunny - Banho e Tosa em Ribeirão Preto', 'description', 'Banho e tosa com carinho em Ribeirão Preto.', 'keywords', 'banho e tosa, pet shop, Ribeirão Preto, PetFunny'),
          landing_headline = 'O cuidado do seu pet dentro do PetFunny.',
          landing_subheadline = 'Agende banho e tosa, acompanhe histórico e receba novidades pelo aplicativo do cliente.',
          updated_at = NOW()
      WHERE id = (SELECT id FROM business_settings ORDER BY created_at ASC LIMIT 1)
    `);

    await query(`
      INSERT INTO pet_types (code, name, description, sort_order)
      VALUES
        ('dog', 'Cachorro', 'Pets caninos atendidos no banho e tosa.', 1),
        ('cat', 'Gato', 'Pets felinos atendidos com cuidados específicos.', 2),
        ('other', 'Outro', 'Outros tipos de pets cadastráveis.', 99)
      ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description, sort_order=EXCLUDED.sort_order, is_active=TRUE, updated_at=NOW()
    `);

    await query(`
      INSERT INTO pet_sizes (code, name, description, min_weight_kg, max_weight_kg, sort_order)
      VALUES
        ('pequeno', 'Pequeno', 'Pets de pequeno porte.', 0, 10, 1),
        ('medio', 'Médio', 'Pets de médio porte.', 10.01, 20, 2),
        ('grande', 'Grande', 'Pets de grande porte.', 20.01, 40, 3),
        ('gigante', 'Gigante', 'Pets gigantes ou de manejo especial.', 40.01, NULL, 4),
        ('todos', 'Todos', 'Opção técnica para serviços aplicáveis a todos os portes.', NULL, NULL, 99)
      ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description, min_weight_kg=EXCLUDED.min_weight_kg, max_weight_kg=EXCLUDED.max_weight_kg, sort_order=EXCLUDED.sort_order, is_active=TRUE, updated_at=NOW()
    `);

    await query(`
      WITH dog AS (SELECT id FROM pet_types WHERE code='dog')
      INSERT INTO pet_breeds (pet_type_id, name, suggested_size_code, coat_type, sort_order)
      VALUES
        ((SELECT id FROM dog), 'Shih-tzu', 'pequeno', 'longa', 1),
        ((SELECT id FROM dog), 'Spitz Alemão', 'pequeno', 'longa', 2),
        ((SELECT id FROM dog), 'Yorkshire', 'pequeno', 'longa', 3),
        ((SELECT id FROM dog), 'Poodle', 'medio', 'cacheada', 4),
        ((SELECT id FROM dog), 'Golden Retriever', 'grande', 'média', 5),
        ((SELECT id FROM dog), 'Labrador', 'grande', 'curta', 6),
        ((SELECT id FROM dog), 'SRD', 'medio', 'variável', 7)
      ON CONFLICT (pet_type_id, name) DO UPDATE SET suggested_size_code=EXCLUDED.suggested_size_code, coat_type=EXCLUDED.coat_type, sort_order=EXCLUDED.sort_order, is_active=TRUE, updated_at=NOW()
    `);

    await query(`
      WITH cat AS (SELECT id FROM pet_types WHERE code='cat')
      INSERT INTO pet_breeds (pet_type_id, name, suggested_size_code, coat_type, sort_order)
      VALUES
        ((SELECT id FROM cat), 'Persa', 'pequeno', 'longa', 1),
        ((SELECT id FROM cat), 'Siamês', 'pequeno', 'curta', 2),
        ((SELECT id FROM cat), 'SRD Felino', 'pequeno', 'variável', 3)
      ON CONFLICT (pet_type_id, name) DO UPDATE SET suggested_size_code=EXCLUDED.suggested_size_code, coat_type=EXCLUDED.coat_type, sort_order=EXCLUDED.sort_order, is_active=TRUE, updated_at=NOW()
    `);

    await query(`
      INSERT INTO collaborators (name, role, color)
      VALUES
        ('Equipe PetFunny', 'banho_tosa', '#00A9B7'),
        ('Tosa e Finalização', 'banho_tosa', '#FF9D98')
      ON CONFLICT DO NOTHING
    `);

    await query(`
      INSERT INTO service_categories (name, description, sort_order)
      VALUES
        ('Banho', 'Serviços de banho por porte e pelagem.', 1),
        ('Tosa', 'Tosa higiênica, completa e acabamento.', 2),
        ('Tratamentos', 'Hidratação, desembolo e cuidados especiais.', 3)
      ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description, sort_order = EXCLUDED.sort_order, updated_at = NOW()
    `);

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
      WITH cat AS (SELECT id, name FROM service_categories)
      INSERT INTO services (category_id, name, pet_size, price_cents, duration_minutes, description)
      VALUES
        ((SELECT id FROM cat WHERE name='Banho'), 'Banho pequeno', 'pequeno', 5500, 60, 'Banho para pets de pequeno porte.'),
        ((SELECT id FROM cat WHERE name='Banho'), 'Banho médio', 'medio', 7500, 75, 'Banho para pets de médio porte.'),
        ((SELECT id FROM cat WHERE name='Banho'), 'Banho grande', 'grande', 12000, 90, 'Banho para pets grandes ou gigantes.'),
        ((SELECT id FROM cat WHERE name='Tosa'), 'Tosa higiênica', 'todos', 4500, 45, 'Higiene, patas, barriga e acabamento.'),
        ((SELECT id FROM cat WHERE name='Tosa'), 'Tosa completa', 'todos', 9000, 90, 'Tosa completa conforme pelagem.'),
        ((SELECT id FROM cat WHERE name='Tratamentos'), 'Hidratação', 'todos', 5000, 35, 'Tratamento de hidratação da pelagem.'),
        ((SELECT id FROM cat WHERE name='Tratamentos'), 'Desembolo', 'todos', 7000, 60, 'Remoção cuidadosa de nós e embaraços.')
      ON CONFLICT (name, pet_size) DO UPDATE
      SET price_cents = EXCLUDED.price_cents,
          duration_minutes = EXCLUDED.duration_minutes,
          description = EXCLUDED.description,
          updated_at = NOW()
    `);

    await query(`
      INSERT INTO payment_statuses (code, name, description, color, sort_order, is_active)
      VALUES
        ('pending', 'Pendente', 'Pagamento ainda em aberto.', '#F59E0B', 10, TRUE),
        ('paid', 'Pago', 'Pagamento confirmado e baixado.', '#10B981', 20, TRUE)
      ON CONFLICT (code) DO UPDATE
      SET name = EXCLUDED.name,
          description = EXCLUDED.description,
          color = EXCLUDED.color,
          sort_order = EXCLUDED.sort_order,
          is_active = TRUE,
          deleted_at = NULL,
          updated_at = NOW()
    `);

    await query(`
      INSERT INTO payment_methods (name, description, sort_order, is_active)
      VALUES
        ('Dinheiro', 'Pagamento em espécie no balcão.', 10, TRUE),
        ('Pix', 'Pagamento via Pix.', 20, TRUE),
        ('Cartão de Crédito', 'Pagamento no crédito.', 30, TRUE),
        ('Cartão de Débito', 'Pagamento no débito.', 40, TRUE)
      ON CONFLICT (name) DO UPDATE
      SET description = EXCLUDED.description,
          sort_order = EXCLUDED.sort_order,
          is_active = TRUE,
          deleted_at = NULL,
          updated_at = NOW()
    `);

    await query(`
      UPDATE payment_methods
      SET is_active = FALSE, updated_at = NOW()
      WHERE name IN ('Transferência', 'Cortesia', 'Cartão de crédito', 'Cartão de débito')
        AND name NOT IN ('Dinheiro', 'Pix', 'Cartão de Crédito', 'Cartão de Débito')
    `);

    await query(`
      INSERT INTO business_hours (weekday, opens_at, closes_at, is_open)
      VALUES
        (0, NULL, NULL, FALSE),
        (1, '08:00', '18:00', TRUE),
        (2, '08:00', '18:00', TRUE),
        (3, '08:00', '18:00', TRUE),
        (4, '08:00', '18:00', TRUE),
        (5, '08:00', '18:00', TRUE),
        (6, '08:00', '14:00', TRUE)
      ON CONFLICT (weekday) DO UPDATE
      SET opens_at = EXCLUDED.opens_at, closes_at = EXCLUDED.closes_at, is_open = EXCLUDED.is_open, updated_at = NOW()
    `);

    // v0.6.2: capacidade oficial por hora. A agenda deve respeitar esse limite por dia da semana.
    await query(`DELETE FROM time_slot_capacities WHERE EXTRACT(MINUTE FROM slot_time)::int <> 0`);

    const slotRows = [];
    for (let weekday = 1; weekday <= 5; weekday += 1) {
      for (let hour = 8; hour <= 17; hour += 1) {
        slotRows.push([weekday, `${String(hour).padStart(2, '0')}:00:00`, 2]);
      }
    }
    for (let hour = 8; hour <= 13; hour += 1) {
      slotRows.push([6, `${String(hour).padStart(2, '0')}:00:00`, 2]);
    }
    for (let hour = 8; hour <= 17; hour += 1) {
      slotRows.push([0, `${String(hour).padStart(2, '0')}:00:00`, 0]);
    }

    const slotValues = slotRows
      .map((_, index) => `($${index * 3 + 1}::smallint, $${index * 3 + 2}::time, $${index * 3 + 3}::integer)`)
      .join('\n        ,');

    await query(`
      INSERT INTO time_slot_capacities (weekday, slot_time, capacity)
      VALUES ${slotValues}
      ON CONFLICT (weekday, slot_time) DO UPDATE
      SET capacity = EXCLUDED.capacity,
          updated_at = NOW()
    `, slotRows.flat());

    const tutorResult = await query(`
      INSERT INTO tutors (name, whatsapp, email, tags, notes)
      VALUES ('Cliente Demonstração', '5516981535338', 'cliente.demo@petfunny.local', ARRAY['recorrente','demo'], 'Cliente exemplo criado no seed v0.2.')
      ON CONFLICT (whatsapp) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email, tags = EXCLUDED.tags, updated_at = NOW()
      RETURNING id
    `);
    const tutorId = tutorResult.rows[0].id;

    await query(`
      INSERT INTO client_accounts (tutor_id, whatsapp, status, is_active)
      VALUES ($1, '5516981535338', 'pending_first_access', FALSE)
      ON CONFLICT (whatsapp) DO UPDATE
      SET tutor_id = EXCLUDED.tutor_id,
          status = CASE WHEN client_accounts.password_hash IS NULL THEN 'pending_first_access' ELSE client_accounts.status END,
          updated_at = NOW()
    `, [tutorId]);

    const petResult = await query(`
      INSERT INTO pets (tutor_id, name, species, breed, size, coat_type, preferences)
      SELECT $1, 'Mel', 'dog', 'Spitz Alemão', 'pequeno', 'longa', 'Usar laço rosa e perfume suave.'
      WHERE NOT EXISTS (SELECT 1 FROM pets WHERE tutor_id = $1 AND name = 'Mel')
      RETURNING id
    `, [tutorId]);

    const fallbackPet = await query('SELECT id FROM pets WHERE tutor_id = $1 AND name = $2 LIMIT 1', [tutorId, 'Mel']);
    const petId = petResult.rows[0]?.id || fallbackPet.rows[0]?.id;

    const extraTutors = [
      {
        name: 'Mariana Souza', whatsapp: '5516991112233', email: 'mariana.souza@petfunny.local', tags: ['recorrente','vip'], notes: 'Prefere horários pela manhã.',
        pets: [{ name: 'Amora', breed: 'Shih-tzu', size: 'pequeno', coatType: 'longa', preferences: 'Finalização com laço rosa.', restrictions: 'Sensível ao secador.' }]
      },
      {
        name: 'João Pereira', whatsapp: '5516992223344', email: 'joao.pereira@petfunny.local', tags: ['pacote'], notes: 'Cliente de pacote quinzenal.',
        pets: [{ name: 'Thor', breed: 'Golden Retriever', size: 'grande', coatType: 'média', preferences: 'Usar shampoo neutro.', restrictions: 'Cuidado com ouvido direito.' }]
      },
      {
        name: 'Camila Andrade', whatsapp: '5516993334455', email: 'camila.andrade@petfunny.local', tags: ['novo'], notes: 'Veio por indicação.',
        pets: [{ name: 'Luna', breed: 'SRD', size: 'medio', coatType: 'curta', preferences: 'Banho morno.', restrictions: '' }]
      }
    ];

    for (const item of extraTutors) {
      const row = await query(`
        INSERT INTO tutors (name, whatsapp, email, tags, notes)
        VALUES ($1, $2, $3, $4::text[], $5)
        ON CONFLICT (whatsapp) DO UPDATE
        SET name = EXCLUDED.name,
            email = EXCLUDED.email,
            tags = EXCLUDED.tags,
            notes = EXCLUDED.notes,
            deleted_at = NULL,
            status = 'active',
            updated_at = NOW()
        RETURNING id
      `, [item.name, item.whatsapp, item.email, item.tags, item.notes]);

      for (const pet of item.pets) {
        await query(`
          INSERT INTO pets (tutor_id, name, species, breed, size, coat_type, preferences, restrictions, status)
          SELECT $1, $2, 'dog', $3, $4, $5, $6, $7, 'active'
          WHERE NOT EXISTS (SELECT 1 FROM pets WHERE tutor_id = $1 AND lower(name) = lower($2) AND deleted_at IS NULL)
        `, [row.rows[0].id, pet.name, pet.breed, pet.size, pet.coatType, pet.preferences, pet.restrictions]);
      }
    }

    await query(`
      INSERT INTO packages (name, description, sessions_count, appointments_per_month, discount_percent, price_cents)
      VALUES
        ('Pacote Banho Mensal 4 Sessões', 'Quatro banhos no mês com desconto para cliente recorrente.', 4, 4, 10, 19800),
        ('Pacote Quinzenal 2 Sessões', 'Dois atendimentos no mês para manutenção da pelagem.', 2, 2, 5, 10500)
      ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description, sessions_count = EXCLUDED.sessions_count, appointments_per_month = EXCLUDED.appointments_per_month, discount_percent = EXCLUDED.discount_percent, price_cents = EXCLUDED.price_cents, updated_at = NOW()
    `);

    await query(`
      INSERT INTO gifts (title, description, starts_on, ends_on, probability_weight, estimated_cost_cents, status)
      VALUES
        ('10% OFF no banho', 'Desconto promocional para retorno rápido.', CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days', 8, 0, 'active'),
        ('Laço especial', 'Brinde de baixo custo e alta percepção de carinho.', CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days', 5, 350, 'active'),
        ('Banho grátis hoje', 'Mimo raro para campanhas especiais.', CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days', 1, 6500, 'active')
      ON CONFLICT DO NOTHING
    `);

    if (petId) {
      await query(`
        WITH svc AS (SELECT id, price_cents FROM services WHERE name = 'Banho pequeno' AND pet_size = 'pequeno' LIMIT 1),
             col AS (SELECT id FROM collaborators WHERE name = 'Equipe PetFunny' LIMIT 1),
             appt AS (
               INSERT INTO appointments (tutor_id, pet_id, collaborator_id, starts_at, ends_at, status, subtotal_cents, discount_percent, discount_cents, total_cents, notes)
               SELECT $1, $2, col.id, date_trunc('day', NOW()) + interval '10 hours', date_trunc('day', NOW()) + interval '11 hours', 'agendado', svc.price_cents, 0, 0, svc.price_cents, 'Agendamento exemplo criado pelo seed v0.5.'
               FROM svc, col
               WHERE NOT EXISTS (
                 SELECT 1 FROM appointments WHERE tutor_id = $1 AND pet_id = $2 AND starts_at::date = CURRENT_DATE AND starts_at::time = '10:00'::time
               )
               RETURNING id
             )
        INSERT INTO appointment_items (appointment_id, pet_id, service_id, description, quantity, unit_price_cents, total_cents)
        SELECT appt.id, $2, svc.id, 'Banho pequeno', 1, svc.price_cents, svc.price_cents
        FROM appt, svc
      `, [tutorId, petId]);

      await query(`
        WITH svc AS (SELECT id, price_cents FROM services WHERE name = 'Tosa higiênica' AND pet_size = 'todos' LIMIT 1),
             col AS (SELECT id FROM collaborators WHERE name = 'Tosa e Finalização' LIMIT 1),
             appt AS (
               INSERT INTO appointments (tutor_id, pet_id, collaborator_id, starts_at, ends_at, status, subtotal_cents, discount_percent, discount_cents, total_cents, checked_in_at, checked_out_at, notes)
               SELECT $1, $2, col.id, date_trunc('day', NOW()) + interval '8 hours 30 minutes', date_trunc('day', NOW()) + interval '9 hours 15 minutes', 'finalizado', svc.price_cents, 0, 0, svc.price_cents, date_trunc('day', NOW()) + interval '8 hours 25 minutes', date_trunc('day', NOW()) + interval '9 hours 20 minutes', 'Atendimento finalizado para popular o dashboard v0.5.'
               FROM svc, col
               WHERE NOT EXISTS (
                 SELECT 1 FROM appointments WHERE tutor_id = $1 AND pet_id = $2 AND starts_at::date = CURRENT_DATE AND starts_at::time = '08:30'::time
               )
               RETURNING id, total_cents
             ), fin AS (
               INSERT INTO financial_transactions (appointment_id, tutor_id, type, category, description, amount_cents, due_date, paid_at, status)
               SELECT appt.id, $1, 'income', 'atendimento', 'Atendimento finalizado - Tosa higiênica', appt.total_cents, CURRENT_DATE, NOW(), 'paid'
               FROM appt
               RETURNING id, amount_cents
             )
        INSERT INTO payments (financial_transaction_id, payment_method_id, amount_cents, paid_at, notes)
        SELECT fin.id, pm.id, fin.amount_cents, NOW(), 'Pagamento Pix exemplo para dashboard v0.5.'
        FROM fin
        LEFT JOIN payment_methods pm ON pm.name = 'Pix'
      `, [tutorId, petId]);

      await query(`
        WITH svc AS (SELECT id, price_cents FROM services WHERE name = 'Hidratação' AND pet_size = 'todos' LIMIT 1),
             col AS (SELECT id FROM collaborators WHERE name = 'Equipe PetFunny' LIMIT 1),
             appt AS (
               INSERT INTO appointments (tutor_id, pet_id, collaborator_id, starts_at, ends_at, status, subtotal_cents, discount_percent, discount_cents, total_cents, notes)
               SELECT $1, $2, col.id, date_trunc('day', NOW()) + interval '14 hours', date_trunc('day', NOW()) + interval '14 hours 45 minutes', 'em_atendimento', svc.price_cents, 10, ROUND(svc.price_cents * 0.10)::integer, svc.price_cents - ROUND(svc.price_cents * 0.10)::integer, 'Atendimento em andamento exemplo para dashboard v0.5.'
               FROM svc, col
               WHERE NOT EXISTS (
                 SELECT 1 FROM appointments WHERE tutor_id = $1 AND pet_id = $2 AND starts_at::date = CURRENT_DATE AND starts_at::time = '14:00'::time
               )
               RETURNING id, total_cents
             ), item AS (
               INSERT INTO appointment_items (appointment_id, pet_id, service_id, description, quantity, unit_price_cents, discount_percent, total_cents)
               SELECT appt.id, $2, svc.id, 'Hidratação', 1, svc.price_cents, 10, appt.total_cents
               FROM appt, svc
             )
        INSERT INTO financial_transactions (appointment_id, tutor_id, type, category, description, amount_cents, due_date, status)
        SELECT appt.id, $1, 'income', 'atendimento', 'Hidratação pendente', appt.total_cents, CURRENT_DATE, 'pending'
        FROM appt
      `, [tutorId, petId]);

      const packageRow = await query(`
        SELECT id, sessions_count, price_cents FROM packages WHERE name = 'Pacote Banho Mensal 4 Sessões' LIMIT 1
      `);
      if (packageRow.rows[0]) {
        await query(`
          INSERT INTO customer_packages (tutor_id, pet_id, package_id, status, starts_on, ends_on, total_sessions, used_sessions, amount_cents)
          SELECT $1::uuid, $2::uuid, $3::uuid, 'active'::text, CURRENT_DATE - INTERVAL '7 days', CURRENT_DATE + INTERVAL '23 days', $4::integer, 1::integer, $5::integer
          WHERE NOT EXISTS (
            SELECT 1 FROM customer_packages WHERE tutor_id = $1::uuid AND pet_id = $2::uuid AND package_id = $3::uuid AND status = 'active' AND deleted_at IS NULL
          )
        `, [tutorId, petId, packageRow.rows[0].id, packageRow.rows[0].sessions_count, packageRow.rows[0].price_cents]);

        await query(`
          INSERT INTO subscriptions (tutor_id, pet_id, package_id, name, status, recurrence, amount_cents, starts_on, next_billing_on, payment_method, notes)
          SELECT $1::uuid, $2::uuid, $3::uuid, 'Assinatura banho mensal - Luna'::text, 'active'::text, 'monthly'::text, $4::integer, CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days', 'Pix'::text, 'Assinatura de demonstração gerada no seed v0.9.'::text
          WHERE NOT EXISTS (
            SELECT 1 FROM subscriptions WHERE tutor_id = $1::uuid AND pet_id = $2::uuid AND package_id = $3::uuid AND deleted_at IS NULL
          )
        `, [tutorId, petId, packageRow.rows[0].id, packageRow.rows[0].price_cents]);
      }
    }



    // v1.0: despesas demo para validar o módulo Financeiro com entradas e saídas reais.
    await query(`
      INSERT INTO financial_transactions (type, category, description, amount_cents, due_date, status)
      SELECT 'expense', 'fornecedor', 'Compra de shampoo e finalizadores', 18500, CURRENT_DATE, 'pending'
      WHERE NOT EXISTS (
        SELECT 1 FROM financial_transactions WHERE type='expense' AND category='fornecedor' AND description='Compra de shampoo e finalizadores' AND deleted_at IS NULL
      )
    `);
    await query(`
      INSERT INTO financial_transactions (type, category, description, amount_cents, due_date, paid_at, status)
      SELECT 'expense', 'marketing', 'Impulsionamento Instagram PetFunny', 7500, CURRENT_DATE - INTERVAL '1 day', NOW() - INTERVAL '1 day', 'paid'
      WHERE NOT EXISTS (
        SELECT 1 FROM financial_transactions WHERE type='expense' AND category='marketing' AND description='Impulsionamento Instagram PetFunny' AND deleted_at IS NULL
      )
    `);



    // v1.2: CRM & Marketing demo idempotente.
    await query(`
      INSERT INTO crm_leads (tutor_id, name, whatsapp, email, stage, source, last_contact_at, notes)
      SELECT t.id, t.name, t.whatsapp, t.email, 'conversa_iniciada', 'cliente_inativo', NOW() - INTERVAL '3 days', 'Lead criado a partir da base de clientes para campanha de retorno.'
      FROM tutors t
      WHERE t.deleted_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM crm_leads WHERE source='cliente_inativo' AND deleted_at IS NULL)
      ORDER BY t.created_at ASC
      LIMIT 1
    `);
    await query(`
      INSERT INTO crm_leads (name, whatsapp, email, stage, source, last_contact_at, notes)
      SELECT 'Lead Instagram PetFunny', '5516999999999', 'lead.instagram@example.com', 'lead_entrou', 'instagram', NOW() - INTERVAL '1 day', 'Interessado em pacote mensal de banho e tosa.'
      WHERE NOT EXISTS (SELECT 1 FROM crm_leads WHERE whatsapp='5516999999999' AND deleted_at IS NULL)
    `);
    await query(`
      INSERT INTO crm_interactions (lead_id, channel, direction, subject, message, occurred_at)
      SELECT cl.id, 'whatsapp', 'outbound', 'Primeiro contato', 'Mensagem inicial enviada pelo CRM PetFunny.', NOW() - INTERVAL '1 day'
      FROM crm_leads cl
      WHERE cl.whatsapp='5516999999999'
        AND NOT EXISTS (SELECT 1 FROM crm_interactions ci WHERE ci.lead_id=cl.id AND ci.subject='Primeiro contato')
      LIMIT 1
    `);

    await query('COMMIT');

    console.log('[db:seed] concluído com sucesso.');
    console.log(`[db:seed] admin: ${adminEmail}`);
    console.log('[db:seed] senha padrão dev: PetFunny@2026 (altere no Render/produção via ADMIN_PASSWORD antes do primeiro seed).');
  } catch (error) {
    await query('ROLLBACK');
    throw error;
  }
}

main()
  .catch((error) => {
    console.error('[db:seed] erro:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });

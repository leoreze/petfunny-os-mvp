import { query, closePool } from '../config/db.js';
<<<<<<< HEAD
import { env } from '../config/env.js';
=======

const tables = [
  'audit_logs','gift_spins','gifts','crm_interactions','crm_leads','receipts','payments',
  'financial_transactions','payment_methods','customer_packages','package_items','packages',
  'appointment_items','appointments','time_slot_capacities','business_hours','pets','tutors',
  'services','service_categories','collaborators','business_settings','settings','users'
];
>>>>>>> 5b2753e57531cf8b8767c9f9b2fc478ed3f96b0a

async function main() {
  if (process.env.RESET_CONFIRM !== 'YES') {
    throw new Error('Reset bloqueado por segurança. Rode com RESET_CONFIRM=YES npm run db:reset apenas em ambiente local/teste.');
  }
<<<<<<< HEAD

  if (env.nodeEnv === 'production' && process.env.RESET_PRODUCTION !== 'YES') {
    throw new Error('Reset bloqueado em production. Para ambientes produtivos, recrie o banco manualmente ou defina RESET_PRODUCTION=YES de forma consciente.');
  }

  console.log('[db:reset] removendo todas as tabelas do schema public do banco configurado. Não use em produção.');
  await query('BEGIN');
  try {
    await query(`
      DO $$
      DECLARE
        table_record RECORD;
      BEGIN
        FOR table_record IN
          SELECT tablename
          FROM pg_tables
          WHERE schemaname = 'public'
        LOOP
          EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', table_record.tablename);
        END LOOP;
      END $$;
    `);
=======
  console.log('[db:reset] removendo tabelas PetFunny OS v0.2. Não use em produção.');
  await query('BEGIN');
  try {
    await query(`DROP TABLE IF EXISTS ${tables.join(', ')} CASCADE`);
>>>>>>> 5b2753e57531cf8b8767c9f9b2fc478ed3f96b0a
    await query('DROP FUNCTION IF EXISTS set_updated_at CASCADE');
    await query('COMMIT');
    console.log('[db:reset] concluído. Rode npm run db:migrate && npm run db:seed.');
  } catch (error) {
    await query('ROLLBACK');
    throw error;
  }
}

main()
  .catch((error) => {
    console.error('[db:reset] erro:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => closePool());

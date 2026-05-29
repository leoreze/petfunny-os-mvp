# Entrega v0.3.1 — Correção de migration/auth

## Correção aplicada
- Corrigido erro PostgreSQL `could not determine data type of parameter $1` em `backend/src/scripts/migrate.js`.
- Parâmetros de `business_settings` agora usam casts explícitos `::text`.
- Parâmetros usados em `jsonb_build_object` agora usam casts explícitos `::text`.
- Mantido login JWT da v0.3.
- Mantido token único `petfunny_token`.
- Mantido sistema sem tenant/SaaS/master admin.

## Como rodar
```bash
npm install
npm run db:migrate
npm run db:seed
npm start
```

## Login dev
- Email: `admin@petfunny.local`
- Senha: `PetFunny@2026`

# PetFunny OS — Bash para rodar com banco zerado

Use este comando no **Git Bash** do VS Code, ajustando `PGPASSWORD` se sua senha do PostgreSQL local for diferente.

```bash
cd /c/Users/Leoni/FunnyOS

export PGUSER=postgres
export PGPASSWORD=postgres
export PGHOST=localhost
export PGPORT=5432
export DB_NAME=petfunny_os_novo

dropdb --if-exists "$DB_NAME"
createdb "$DB_NAME"

cat > .env <<EOFENV
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/petfunny_os_novo
JWT_SECRET=petfunny_local_dev_2026_trocar_depois
JWT_EXPIRES_IN=7d

APP_NAME=PetFunny OS
APP_MODE=petfunny_single
APP_URL=http://localhost:3000

PETFUNNY_NAME=PetFunny - Banho e Tosa
PETFUNNY_WHATSAPP=5516981535338
PETFUNNY_CITY=Ribeirão Preto
PETFUNNY_STATE=SP

ADMIN_EMAIL=admin@petfunny.local
ADMIN_PASSWORD=PetFunny@2026

OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini

VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:contato@petfunny.com.br

MERCADO_PAGO_ACCESS_TOKEN=
MERCADO_PAGO_PUBLIC_KEY=
MERCADO_PAGO_WEBHOOK_SECRET=
MERCADO_PAGO_ALLOW_TEST_PIX=false
MERCADO_PAGO_PIX_EXPIRATION_MINUTES=15
EOFENV

cp .env backend/.env

rm -rf node_modules backend/node_modules
npm install --legacy-peer-deps
npm run db:migrate
npm run db:seed
npm start
```

Acesse:

```txt
http://localhost:3000/admin/login
```

Login local:

```txt
admin@petfunny.local
PetFunny@2026
```

## Reset sem apagar o database inteiro

Caso prefira usar o script interno:

```bash
cd /c/Users/Leoni/FunnyOS
RESET_CONFIRM=YES npm run db:reset
npm run db:migrate
npm run db:seed
npm start
```

## O que foi corrigido

- `payment_methods` agora é criada antes de `appointments`, porque `appointments.payment_method_id` referencia essa tabela.
- `db:reset` agora remove todas as tabelas do schema `public`, evitando sobras de versões antigas.
- `.env` real foi removido do ZIP e substituído por `.env.example` para evitar subir credenciais reais.

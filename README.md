# PetFunny OS — v1.5 Final

Sistema interno de gestão exclusivo do **PetFunny - Banho e Tosa** em Ribeirão Preto/SP.

Esta versão consolida a reconstrução do projeto como produto único, sem camada SaaS, sem seleção de tenant, sem master admin e sem white-label ativo.

## Ambientes do sistema

- **Landing pública da loja:** `/`
- **Admin fechado:** `/admin/login`
- **Aplicativo do cliente:** `/app/login` e `/app/primeiro-acesso`

## Módulos entregues

- Dashboard operacional
- Agenda com visão dia/semana/mês e board por status
- Tutores/clientes com foto/avatar
- Pets com foto/avatar
- Serviços com tipo e porte vindos das Configurações
- Pacotes
- Assinaturas/recorrência
- Financeiro com aba Inadimplentes
- Comandas e Recibos com link público
- CRM & Marketing
- Roleta de Mimos
- Configurações completas
- Notificações inteligentes
- Relatórios com insights
- Assistente IA com prompt global opcional

## Requisitos

- Node.js 20+
- PostgreSQL
- npm

## Variáveis de ambiente

Copie `backend/.env.example` para `backend/.env` em desenvolvimento local.

```env
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://usuario:senha@localhost:5432/petfunny_os
JWT_SECRET=troque_essa_chave
JWT_EXPIRES_IN=7d
APP_NAME=PetFunny OS
APP_MODE=petfunny_single
APP_URL=http://localhost:3000
PETFUNNY_NAME=PetFunny - Banho e Tosa
PETFUNNY_WHATSAPP=5516981535338
PETFUNNY_CITY=Ribeirão Preto
PETFUNNY_STATE=SP
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
```

A chave da OpenAI é opcional. O sistema não depende de IA para carregar login, dashboard, agenda ou financeiro.

## Como rodar localmente

```bash
npm install
npm run db:migrate
npm run db:seed
npm start
```

Acesse:

```txt
http://localhost:3000/admin/login
```

Credenciais de desenvolvimento:

```txt
Email: admin@petfunny.local
Senha: PetFunny@2026
```

## Comandos

```bash
npm start          # inicia backend e frontend estático
npm run dev        # modo desenvolvimento com watch
npm run db:migrate # cria/atualiza schema
npm run db:seed    # popula dados iniciais idempotentes
npm run db:reset   # exige RESET_CONFIRM=YES
```

## Deploy no Render

Configure as variáveis reais apenas no painel do Render.

**Build Command:**

```bash
npm install && npm run db:migrate
```

**Start Command:**

```bash
npm start
```

Variáveis mínimas no Render:

```env
NODE_ENV=production
PORT=3000
DATABASE_URL=<External Database URL do Render>
JWT_SECRET=<chave longa e segura>
JWT_EXPIRES_IN=7d
APP_NAME=PetFunny OS
APP_MODE=petfunny_single
APP_URL=<URL pública do Render>
PETFUNNY_NAME=PetFunny - Banho e Tosa
PETFUNNY_WHATSAPP=5516981535338
PETFUNNY_CITY=Ribeirão Preto
PETFUNNY_STATE=SP
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
```

## GitHub

Antes de subir, confirme que `.env` não está versionado.

```bash
git init
git add .
git commit -m "petfunny os v1.5 final"
git branch -M main
git remote add origin <URL_DO_REPOSITORIO>
git push -u origin main
```

## Segurança

Nunca subir:

- `.env`
- senhas reais
- DATABASE_URL real
- OPENAI_API_KEY real
- tokens de WhatsApp/Mercado Pago

## Observações finais

- A aplicação usa migrations por comando, não DDL pesado no runtime.
- O loading global usa modal seguro com timeout, sem MutationObserver e sem beforeunload.
- O frontend usa token único `petfunny_token`.
- O sistema foi preparado como operação exclusiva do PetFunny.

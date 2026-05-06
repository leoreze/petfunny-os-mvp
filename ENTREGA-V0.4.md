# Entrega v0.4 — Admin Shell + Ambientes

## Versão entregue
petfunny-os-v0.4-admin-shell.zip

## O que foi feito
- Usada a v0.3.2 como base oficial.
- Mantida autenticação admin com JWT e token único `petfunny_token`.
- Consolidado o shell administrativo fechado em `/admin/*`.
- Preparado o ambiente público da loja em `/`.
- Preparado o ambiente fechado do aplicativo do cliente em `/app/*`.
- Criado fluxo inicial do app do cliente:
  - primeiro acesso por WhatsApp;
  - geração de código de validação sem API externa;
  - criação de senha;
  - login posterior com WhatsApp + senha.
- Criados endpoints do app do cliente:
  - `POST /api/app/first-access/request`
  - `POST /api/app/first-access/confirm`
  - `POST /api/app/login`
  - `GET /api/app/me`
  - `POST /api/app/logout`
- Criada tabela `client_accounts` sem tenant.
- Adicionado seed de conta do cliente em modo primeiro acesso para o tutor demo.
- Mantido runtime sem DDL.
- Mantido visual aprovado: post-it, paleta azul/rosa, CSS responsivo e copyright.

## Ambientes disponíveis
- Loja pública: `/`
- Admin fechado: `/admin/login` e `/admin/dashboard`
- App cliente fechado: `/app/login`, `/app/primeiro-acesso`, `/app/home`

## Como rodar
```bash
npm install
npm run db:migrate
npm run db:seed
npm start
```

## Como testar admin
- Acesse `/admin/login`
- Email: `admin@petfunny.local`
- Senha: `PetFunny@2026`

## Como testar app do cliente
- Acesse `/app/primeiro-acesso`
- WhatsApp demo: `(16) 98153-5338`
- Em desenvolvimento, o código retornado é `123456`.
- Crie uma senha com pelo menos 8 caracteres.
- Depois entre por `/app/login` usando WhatsApp + senha criada.

## Observações
- O envio real por WhatsApp ainda não foi ativado. A v0.4 prepara o fluxo e retorna `devCode` em desenvolvimento.
- O app do cliente ainda é shell/base. Histórico real, pets e agenda entram nas versões dos módulos.
- Nenhum endpoint depende de IA, Mercado Pago ou WhatsApp externo para carregar.

## Próxima versão
petfunny-os-v0.5-dashboard.zip

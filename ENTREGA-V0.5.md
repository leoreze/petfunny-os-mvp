# Entrega v0.5 — Dashboard

Versão entregue: `petfunny-os-v0.5-dashboard.zip`

## O que foi feito

- Implementado dashboard operacional com dados reais do PostgreSQL.
- Expandido `GET /api/dashboard/summary`.
- Criados cards principais:
  - Agendamentos hoje;
  - Faturamento hoje;
  - Pagamentos pendentes;
  - Check-ins ativos;
  - Pets atendidos;
  - Pacotes ativos.
- Criada agenda do dia em tabela filtrável.
- Criada visualização de cards da agenda com menu de três pontinhos.
- Criado calendário visual com alternância Dia/Semana/Mês.
- Criados alertas operacionais e insights simples sem dependência de IA.
- Seed passou a popular dados de dashboard: atendimento agendado, finalizado/pago, em atendimento/pendente e pacote ativo.
- Mantido sem tenant, sem SaaS, sem master admin e sem DDL em runtime.

## Arquivos principais alterados

- `backend/src/app.js`
- `backend/src/scripts/seed.js`
- `frontend/pages/dashboard/index.html`
- `frontend/assets/css/app.css`
- `package.json`
- `backend/package.json`

## Como rodar

```bash
npm install
npm run db:migrate
npm run db:seed
npm start
```

## Como testar

1. Acesse `http://localhost:3000/admin/login`.
2. Entre com:
   - Email: `admin@petfunny.local`
   - Senha: `PetFunny@2026`
3. Acesse `http://localhost:3000/admin/dashboard`.
4. Confirme se os cards carregam dados do banco.
5. Teste o filtro da tabela da agenda.
6. Teste a alternância Dia/Semana/Mês no calendário.

## Observações

- O dashboard não depende de IA, WhatsApp, Mercado Pago ou qualquer API externa para carregar.
- Se o banco estiver vazio, o dashboard mostra estados vazios controlados, sem loading infinito.
- Os dados de demonstração são idempotentes e podem ser recriados com `npm run db:seed`.

## Próxima versão

`petfunny-os-v0.6-tutores-pets.zip`

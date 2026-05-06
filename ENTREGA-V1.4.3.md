# PetFunny OS v1.4.3 — Correção de Notificações

## Correção aplicada

Corrigido erro na geração de notificações em tempo real:

```txt
column cp.sessions_total does not exist
```

A tabela `customer_packages` usa as colunas reais:

- `total_sessions`
- `used_sessions`

As consultas de notificações e relatórios foram ajustadas para usar esses nomes corretamente.

## Arquivos alterados

- `backend/src/app.js`

## Como rodar

```bash
npm install
npm run db:migrate
npm run db:seed
npm start
```

## Como testar

Acesse:

```txt
http://localhost:3000/admin/dashboard
http://localhost:3000/admin/notificacoes
http://localhost:3000/admin/relatorios
```

O backend não deve mais quebrar durante `generateRealtimeNotifications()`.

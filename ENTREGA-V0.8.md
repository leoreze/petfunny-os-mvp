# Entrega v0.8 — Agenda

Versão entregue: `petfunny-os-v0.8-agenda.zip`

## O que foi feito

- Módulo real de Agenda em cima da v0.7.1.
- Endpoint `GET /api/agenda/options`.
- Endpoint `GET /api/agenda` com filtros por data, visão, status e colaborador.
- Endpoint `GET /api/agenda/:id`.
- Endpoint `POST /api/agenda`.
- Endpoint `PUT /api/agenda/:id`.
- Endpoint `PATCH /api/agenda/:id/status`.
- Endpoint `DELETE /api/agenda/:id`.
- Agenda com visão Dia, Semana e Mês.
- Novo agendamento com tutor, pet, serviços, status, colaborador, desconto global e observações.
- Serviços filtrados pelo porte do pet; serviços de porte `todos` aparecem para qualquer pet.
- Status da agenda vindos de Configurações.
- Colaboradores vindos do banco.
- Validação de horário de funcionamento e limite de slots por hora.
- Cards de agendamento com menu de três pontinhos.
- Ações rápidas de Check-in, Check-out e Cancelar.
- Loading post-it reforçado na Agenda, Tutores e Pets.

## Como rodar

```bash
npm install
npm run db:migrate
npm run db:seed
npm start
```

## Como testar

- `http://localhost:3000/admin/login`
- `http://localhost:3000/admin/agenda`
- `http://localhost:3000/admin/configuracoes`
- `http://localhost:3000/admin/tutores`
- `http://localhost:3000/admin/pets`
- `http://localhost:3000/admin/servicos`

## Observações

- A agenda respeita os slots configurados por dia e hora em Configurações.
- O módulo continua sem tenant, sem SaaS, sem master admin e sem DDL em runtime.

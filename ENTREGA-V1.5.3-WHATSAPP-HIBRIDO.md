# PetFunny OS v1.5.3 — WhatsApp híbrido

## O que entrou

- Modelo híbrido sem API oficial do WhatsApp.
- O sistema gera mensagens profissionais e personalizadas.
- O botão abre o WhatsApp com texto preenchido para a equipe revisar e enviar.
- Nenhum disparo automático é feito.
- A IA/OpenAI continua opcional: o sistema funciona sem chave configurada.

## Novos endpoints

- `GET /api/whatsapp/templates`
- `POST /api/whatsapp/message`

## Nova página

- `/admin/whatsapp`

## Pontos integrados

- Agenda: confirmação e lembrete pelo menu do agendamento.
- Financeiro: cobrança amigável em pendências e inadimplentes.
- Página WhatsApp: geração manual rápida para atendimento, CRM, pacotes e marketing.

## Como testar

```bash
npm install
npm run db:migrate
npm run db:seed
npm start
```

Acesse:

- `http://localhost:3000/admin/whatsapp`
- `http://localhost:3000/admin/agenda`
- `http://localhost:3000/admin/financeiro?tab=inadimplentes`


# FunnyOS v1.6.82 — Agente WhatsApp Cloud API + Webhook

## Entrega

Implementação inicial do agente WhatsApp oficial para o PetFunny OS.

## Incluído

- Webhook de verificação da Meta em `GET /api/whatsapp/webhook`.
- Recebimento de mensagens em `POST /api/whatsapp/webhook`.
- Envio de resposta automática pela WhatsApp Cloud API quando as variáveis estão configuradas.
- Agente híbrido com fallback local e uso opcional de OpenAI.
- Handoff para atendimento humano quando o assunto exigir confirmação.
- Persistência automática de conversas e mensagens em tabelas próprias.
- Tela `/admin/whatsapp` atualizada com status do agente, callback URL e conversas recentes.
- Endpoint admin para status: `GET /api/whatsapp/agent/status`.
- Endpoint admin para conversas: `GET /api/whatsapp/agent/conversations`.
- Endpoint admin para mensagens da conversa: `GET /api/whatsapp/agent/conversations/:id/messages`.
- Endpoint admin para envio manual via API: `POST /api/whatsapp/agent/send`.

## Variáveis adicionadas

```env
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
WHATSAPP_VERIFY_TOKEN=petfunnyos_webhook
WHATSAPP_API_VERSION=v21.0
WHATSAPP_AGENT_ENABLED=true
WHATSAPP_AGENT_AUTO_REPLY=true
WHATSAPP_AGENT_USE_OPENAI=true
WHATSAPP_AGENT_HANDOFF_KEYWORD=atendente
```

## Callback URL

Use no painel da Meta:

```text
https://SEU-DOMINIO/api/whatsapp/webhook
```

Em ambiente local, use túnel público como ngrok ou deploy no Render.

## Banco

As tabelas são criadas automaticamente quando os endpoints do agente são chamados. A migration também foi atualizada para instalações novas.

# FunnyOS v1.6.99 — CRM Prioridades com botão Enviar mensagem

## O que foi feito

- Ajustado `/admin/crm` no bloco **Prioridades de hoje**.
- Cada card de prioridade agora mostra um botão direto **Enviar mensagem**.
- O botão usa a mensagem sugerida real do cliente, gerada pelo endpoint `/api/crm/operational`.
- Ao clicar, o sistema registra a interação em `crm_interactions` e abre o WhatsApp com a mensagem preenchida.
- O menu de 3 pontinhos continua disponível para ações extras: copiar mensagem, ativar app, reativar cliente, ofertar pacote, Saúde 360, abrir tutor e ver acessos.

## Arquivos alterados

- `frontend/pages/crm/index.html`
- `frontend/assets/css/app.css`
- `package.json`
- `backend/package.json`
- `DEPLOY_VERSION.txt`

## Como testar

1. Acesse `/admin/crm`.
2. Vá até **Prioridades de hoje**.
3. Confirme que cada card mostra o botão **Enviar mensagem**.
4. Clique no botão.
5. O WhatsApp deve abrir com a mensagem sugerida daquele tutor.
6. A contagem de mensagens enviadas deve atualizar após o registro no CRM.

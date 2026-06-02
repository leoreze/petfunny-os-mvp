# FunnyOS v1.6.45 — Pacote Antigo Horário Manual + Sessões Usadas Automáticas

## O que foi ajustado
- Adicionado campo **Horário da contratação** no modal de Pacote Antigo.
- Removido o campo **Sessões já usadas** da interface.
- A quantidade de sessões usadas agora é calculada automaticamente a partir da data e horário originais da contratação.
- Sessões com data/hora passada são geradas como **finalizado**.
- Sessões futuras são geradas como **agendado**.
- O progresso do pacote é recalculado pelas sessões finalizadas.
- O valor final pago continua manual.

## Como testar
1. Acesse `/admin/pacotes`.
2. Clique em **Pacote antigo**.
3. Informe WhatsApp/tutor, pet, pacote, data original da venda e horário da contratação.
4. Informe total de sessões e valor final pago.
5. Salve.
6. Confira se as sessões passadas aparecem como finalizadas e as futuras como agendadas.

## Arquivos principais alterados
- `frontend/pages/pacotes/index.html`
- `backend/src/app.js`
- `package.json`
- `backend/package.json`
- `DEPLOY_VERSION.txt`

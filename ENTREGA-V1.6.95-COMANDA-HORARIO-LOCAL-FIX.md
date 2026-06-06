# FunnyOS v1.6.95 — Comanda com horário local PetFunny sem deslocamento UTC

## Problema corrigido

Ao cadastrar um agendamento no admin com horário local, por exemplo 09:00, a comanda pública enviada ao tutor podia exibir 12:00.

Isso acontecia porque o agendamento é salvo corretamente em UTC no banco (`09:00 America/Sao_Paulo` = `12:00 UTC`), mas alguns documentos formatavam a data usando o timezone padrão do servidor, normalmente UTC no Render/produção.

## Correção aplicada

- Criado helper backend `formatDocumentDateTimePt()` usando `timeZone: 'America/Sao_Paulo'`.
- Comanda pública individual agora exibe o horário local do PetFunny.
- Comanda consolidada de pacote também exibe as sessões no horário local do PetFunny.
- Prévia da comanda no admin agenda passa a usar timezone fixo `America/Sao_Paulo`.
- Página de Comandas e Recibos usa timezone fixo.
- Página pública de recibo usa timezone fixo.

## Arquivos alterados

- `backend/src/app.js`
- `frontend/pages/agenda/index.html`
- `frontend/pages/comandas-recibos/index.html`
- `frontend/pages/public/recibo/index.html`
- `package.json`
- `backend/package.json`
- `package-lock.json`
- `backend/package-lock.json`
- `DEPLOY_VERSION.txt`

## Como testar

1. Acesse `/admin/agenda`.
2. Crie um agendamento às 09:00.
3. Abra a comanda pelo botão `📋 Comanda`.
4. Copie/abra o link público `/documentos/comanda/:id`.
5. A data deve aparecer como 09:00, não 12:00.

## Observação técnica

O banco continua armazenando `timestamptz` corretamente. A correção é apenas de apresentação/formatação dos documentos para o timezone operacional do PetFunny: `America/Sao_Paulo`.

# FunnyOS v1.6.96 — Avaliações com ordenação, serviços e status finalizado

## Correções

- Corrigidas as setas de ordenação no header da listagem de `/admin/avaliacoes`.
- A ordenação agora funciona por Tutor/Pet, Serviço, Data, Nota e Status.
- A coluna Serviço agora busca o nome do serviço por `appointment_items.description` e, se necessário, usa fallback em `services.name`.
- A listagem de avaliações agora traz somente atendimentos com status `finalizado`, coerente com o fluxo pós-serviço.
- A coluna Status agora mostra o status do atendimento como `Finalizado` e mantém a informação da avaliação como pendente ou respondida.
- Métricas de avaliações passam a considerar apenas atendimentos finalizados.

## Arquivos alterados

- `frontend/pages/avaliacoes/index.html`
- `backend/src/app.js`
- `package.json`
- `backend/package.json`
- `package-lock.json`
- `backend/package-lock.json`
- `DEPLOY_VERSION.txt`

## Testes técnicos

- `node --check backend/src/app.js`
- `node --check /tmp/avaliacoes-v1696-script.mjs`
- `unzip -t FunnyOS-v1.6.96-avaliacoes-ordenacao-servicos-status.zip`

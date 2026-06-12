# FunnyOS v1.6.114 — Tutores Status CRM Ordenável

## O que foi feito

- Em `/admin/tutores`, a coluna **Status CRM** agora possui botão de ordenação.
- A seta preta aparece no header da coluna **Status CRM**.
- A ordenação funciona ao clicar no texto ou na seta.
- A ordem usa prioridade CRM lógica: Novo lead, Ativo, Recorrente, Em atenção, Em risco e Perdido.
- Mantido o visual padrão das outras colunas ordenáveis.

## Arquivos alterados

- `frontend/pages/tutores/index.html`
- `package.json`
- `backend/package.json`
- `DEPLOY_VERSION.txt`

## Validação

- `node --check backend/src/app.js`
- validação sintática do script da página de tutores
- `unzip -t` no pacote final

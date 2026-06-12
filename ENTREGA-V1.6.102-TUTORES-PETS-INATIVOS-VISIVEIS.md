# FunnyOS v1.6.102 — Tutores e Pets Inativos Visíveis

## O que foi corrigido

- Em `/admin/tutores`, ao clicar em **Inativar**, o tutor não é mais removido logicamente com `deleted_at`.
- O tutor passa a ficar com `status = inactive` e continua visível na listagem.
- Em `/admin/pets`, ao clicar em **Inativar pet**, o pet também não some da base.
- O pet passa a ficar com `status = inactive` e continua visível na listagem.
- Ao inativar um tutor, os pets vinculados também são marcados como inativos sem receber `deleted_at`.
- As telas de Tutores e Pets agora abrem por padrão com filtro **Todos**, mostrando ativos e inativos.
- Após inativar, o filtro muda para **Todos** automaticamente para o registro continuar aparecendo com a tag **Inativo**.
- Adicionado destaque visual discreto para linhas/cards inativos.

## Arquivos alterados

- `backend/src/app.js`
- `frontend/pages/tutores/index.html`
- `frontend/pages/pets/index.html`
- `frontend/assets/css/app.css`
- `package.json`
- `backend/package.json`
- `package-lock.json`
- `backend/package-lock.json`
- `DEPLOY_VERSION.txt`

## Como testar

1. Acesse `/admin/tutores`.
2. Clique no menu de 3 pontinhos de um tutor.
3. Clique em **Inativar**.
4. Confirme que o tutor continua na listagem com a tag **Inativo**.
5. Acesse `/admin/pets`.
6. Clique em **Inativar pet**.
7. Confirme que o pet continua na listagem/cards com a tag **Inativo**.

## Observação

Registros inativados em versões antigas que já receberam `deleted_at` continuam ocultos porque foram tratados como removidos lógicos no banco. A partir desta versão, novas inativações não somem da lista.

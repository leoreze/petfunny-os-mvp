# FunnyOS v1.6.109 — Bolão da Copa menu 3 pontinhos + seta preta de ordenação

## Correções

- Corrigido o menu de 3 pontinhos em `/admin/bolao-copa`, que deixou de abrir na v1.6.108.
- O menu agora é renderizado em camada fixa no `body`, evitando corte por tabela/card e garantindo z-index máximo.
- Removida a seta azul dos headers das tabelas.
- Restaurada a seta preta de ordenação ao lado do nome da coluna.
- A seta preta fica dentro do botão de ordenação e funciona ao clicar nela ou no texto do header.
- Aplicado nos cards/tabelas:
  - Jogos do Brasil
  - Palpites dos tutores

## Arquivos alterados

- `frontend/pages/bolao-copa/index.html`
- `frontend/assets/css/app.css`
- `package.json`
- `backend/package.json`
- `package-lock.json`
- `backend/package-lock.json`
- `DEPLOY_VERSION.txt`

## Validação

```bash
node --check backend/src/app.js
node --check /tmp/bolao-v16109.mjs
unzip -t FunnyOS-v1.6.109-bolao-copa-menu-setas-fix.zip
```

# FunnyOS v1.6.108 — Bolão da Copa headers sem seta e menu acima de tudo

## O que foi feito

- Removida a seta azul dos headers das tabelas em `/admin/bolao-copa`.
- Mantida a ordenação ao clicar no texto do header.
- Adicionado destaque discreto por sublinhado no header ativo, sem ícone/seta.
- Ajustado o menu de ações `⋯` para abrir com `position: fixed`.
- Elevado o menu para `z-index: 2147483647`, acima de cards, tabelas e modais.
- O menu fecha ao clicar fora, pressionar `Esc`, rolar a página ou redimensionar a janela.

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
node --check /tmp/bolao-v16108.mjs
unzip -t FunnyOS-v1.6.108-bolao-copa-menu-zindex.zip
```

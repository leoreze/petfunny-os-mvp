# PetFunny OS v1.5.106 — App perfil no topo + Promoções UX

## O que foi feito

- No App do Tutor, removida a opção Perfil do menu inferior.
- Adicionado avatar com iniciais do tutor no topo do app, com link para /app/perfil.
- Em /admin/promocoes, reconstruído o layout com o padrão premium das demais páginas:
  - hero card;
  - big numbers;
  - filtros;
  - tabela com headers e setas;
  - scroll infinito via rolagem da página;
  - modal de cadastro/edição;
  - modal de erro/aviso;
  - modal de confirmação de remoção;
  - botões padronizados.

## Arquivos alterados

- frontend/assets/js/client-shell.js
- frontend/pages/promocoes/index.html
- frontend/assets/css/app.css
- frontend/service-worker.js
- package.json
- backend/package.json
- DEPLOY_VERSION.txt

## Como testar

```bash
npm start
```

App do Tutor:
- http://localhost:3000/app/home

Admin Promoções:
- http://localhost:3000/admin/promocoes

## Migration

Não há migration obrigatória nesta versão.

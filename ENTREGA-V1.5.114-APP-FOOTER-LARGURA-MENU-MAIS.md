# PetFunny OS v1.5.114 — App Footer na largura dos cards e menu Mais fixo

## O que foi feito

- Ajustei o menu fixo do App do Tutor para usar a mesma largura visual dos cards, topo e hero do app.
- Mantive o footer centralizado e responsivo no mobile e desktop.
- Os três últimos itens do menu principal agora ficam sempre dentro do botão de 3 pontinhos / Mais:
  - Roleta
  - Promoções
  - PetFunny 360 IA
- O menu principal preserva em uma linha os atalhos principais:
  - Timeline
  - Agenda
  - Pets
  - Histórico
  - Pacotes
  - Mais
- O item ativo continua destacado mesmo quando estiver dentro do menu Mais.

## Arquivos alterados

- frontend/assets/js/client-shell.js
- frontend/assets/css/app.css
- package.json
- backend/package.json
- DEPLOY_VERSION.txt

## Validação

- node --check frontend/assets/js/client-shell.js

## Migration

Não precisa rodar migration.

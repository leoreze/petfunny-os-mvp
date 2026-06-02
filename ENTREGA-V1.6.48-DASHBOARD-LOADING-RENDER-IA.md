# FunnyOS v1.6.48 — Dashboard Loading Render Completo + IA Timeout Seguro

## O que foi feito
- Corrigido o carregamento do Admin Dashboard para o modal só fechar depois dos dados carregados, DOM montado e pintura visual concluída.
- Dashboard agora busca resumo, engajamento e Gerente IA em paralelo.
- Gerente IA ganhou timeout seguro para não travar a abertura do painel.
- Quando IA/engajamento demoram, o dashboard abre com fallback operacional e permite atualizar a IA pelo botão do card.
- Ajustado loading.js para aceitar timeout configurável e exportar espera de renderização/imagens.

## Arquivos principais alterados
- frontend/pages/dashboard/index.html
- frontend/assets/js/loading.js
- backend/src/app.js
- package.json
- backend/package.json
- DEPLOY_VERSION.txt

## Como rodar
```bash
npm install
npm start
```

## Observação
Não altera banco. Não precisa rodar migration.

# PetFunny OS v1.5.108 — Relatórios, Financeiro, Timeline e Promoções

## O que foi feito
- Relatórios: big numbers removidos de dentro do hero card e posicionados em faixa própria abaixo do hero.
- Financeiro: big numbers removidos de dentro do hero card e posicionados em faixa própria abaixo do hero.
- Adicionado espaçamento vertical/margin-bottom entre hero, big numbers e cards inferiores.
- App do Tutor: timeline agora possui carregamento progressivo/infinito por rolagem.
- App do Tutor: timeline agora separa publicações por data, exibindo “Hoje” para a data atual.
- App do Tutor: adicionadas publicações inteligentes recorrentes/IA local com dicas, lembretes e sugestões.
- Promoções no app: ao clicar em uma promoção, o agendamento abre com banner no topo exibindo título, percentual e dias válidos.
- Promoções no app: calendário/horários do agendamento respeitam os dias da semana cadastrados na promoção, bloqueando dias fora da regra.
- Correção no listener de data do formulário de agendamento do app.

## Arquivos principais alterados
- frontend/pages/relatorios/index.html
- frontend/pages/financeiro/index.html
- frontend/pages/app/home/index.html
- frontend/assets/css/app.css
- package.json
- backend/package.json
- DEPLOY_VERSION.txt

## Como rodar
```bash
npm start
```

## Migration
Não há migration obrigatória nesta versão.

## Validação
- node --check backend/src/app.js
- node --check frontend/pages/app/home/index.html extraído como JS
- node --check frontend/pages/relatorios/index.html extraído como JS
- node --check frontend/pages/financeiro/index.html extraído como JS

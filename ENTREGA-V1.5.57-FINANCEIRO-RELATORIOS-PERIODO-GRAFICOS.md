# PetFunny OS v1.5.57 — Financeiro e Relatórios com período e gráficos

## O que foi feito
- Relatórios ganhou seleção de período por mês, últimos 7 dias, últimos 30 dias e ano.
- Relatórios ganhou gráficos comparativos em CSS/HTML, sem depender de biblioteca externa.
- Relatórios agora compara entradas, saídas, agenda por status, serviços mais vendidos e pacotes contratados.
- Financeiro ganhou filtro por mês na consulta de lançamentos.
- Financeiro atualiza cards e lista conforme o mês selecionado.
- Financeiro manteve scroll infinito pela rolagem da página.
- Financeiro manteve Novo lançamento abrindo em modal padrão.
- Cards de Financeiro e Relatórios receberam espaçamento vertical com margin-bottom de 20px.

## Arquivos alterados
- backend/src/app.js
- frontend/pages/financeiro/index.html
- frontend/pages/relatorios/index.html
- frontend/assets/css/app.css

## Como testar
1. npm install
2. npm start
3. Acesse /admin/relatorios
4. Altere período e mês e veja os gráficos atualizarem
5. Acesse /admin/financeiro
6. Filtre por mês e confira cards/listagem
7. Clique em Novo lançamento e valide abertura em modal

## Observações
- Não há migration obrigatória nesta versão.
- Os gráficos são nativos em CSS/HTML para manter o sistema leve e sem dependências novas.

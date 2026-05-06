# PetFunny OS v1.5.59 — Correção Maximum call stack em Relatórios

## O que foi corrigido

- Corrigido erro `Maximum call stack size exceeded` em `/admin/relatorios`.
- Removida recursão infinita em `buildReportParams()`.
- Removida recursão cruzada entre `growthRows()` e `renderGrowthChart()`.
- Mantidos os filtros por período, mês e período personalizado.
- Mantidos os gráficos comparativos de crescimento entre períodos.
- Mantidos os modais de detalhes dos cards, gráficos e linhas da tabela.
- Nenhuma alteração de banco necessária.

## Arquivo alterado

- `frontend/pages/relatorios/index.html`

## Validação feita

```bash
node --check backend/src/app.js
node --check /tmp/financeiro_index.html.mjs
node --check /tmp/relatorios_index.html.mjs
```

## Observação técnica

O erro acontecia por dois loops recursivos no frontend:

1. `buildReportParams()` chamava `buildReportParams()` dentro dela mesma.
2. `growthRows()` chamava `renderGrowthChart()`, enquanto `renderGrowthChart()` chamava `growthRows()`.

Essas duas chamadas foram separadas: agora `growthRows()` apenas monta os dados, `renderGrowthChart()` apenas renderiza o gráfico e `buildReportParams()` apenas cria os parâmetros da API.

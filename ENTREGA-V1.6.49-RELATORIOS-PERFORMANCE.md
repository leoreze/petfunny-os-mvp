# FunnyOS v1.6.49 — Relatórios Performance Forte

## O que foi feito

- Otimizado o carregamento de `/admin/relatorios`.
- Reescrito o endpoint `/api/relatorios/insights` para usar consultas menores e paralelas.
- Removida a dependência do resumo completo do dashboard dentro dos relatórios, que deixava a página lenta.
- Adicionado timeout seguro por bloco de relatório no PostgreSQL para impedir que uma consulta pesada trave a tela inteira.
- Melhoradas as consultas de período usando comparação direta de datas, evitando `::date` sobre colunas de agenda quando possível.
- Otimizada a evolução mensal com agregações por tabela antes dos joins.
- Frontend agora mostra skeleton inicial, desabilita atualização durante carga, ignora respostas antigas e fecha o loading só depois da renderização visual.
- Filtros de mês e datas agora usam debounce para evitar múltiplas chamadas enquanto o usuário edita o período.
- Scroll infinito da tabela ficou mais leve, evitando varredura premium da página inteira a cada nova linha.

## Arquivos principais alterados

- `backend/src/app.js`
- `frontend/pages/relatorios/index.html`
- `package.json`
- `backend/package.json`
- `DEPLOY_VERSION.txt`

## Banco de dados

Não altera schema.
Não precisa rodar migration.

## Como rodar

```bash
npm install
npm start
```

## Como testar

1. Acesse `http://localhost:3000/admin/relatorios`.
2. Aguarde o modal fechar somente após a tela renderizar.
3. Troque período para mês, últimos 7 dias, últimos 30 dias e ano.
4. Use busca e ordenação da tabela.
5. Abra os cards/modal de detalhes.

## Observação

Se alguma tabela estiver pesada ou sem índice, o bloco específico pode cair no fallback em vez de travar a página inteira.

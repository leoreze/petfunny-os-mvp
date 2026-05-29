# PetFunny OS v1.5.112 — Bem-estar, Financeiro, Relatórios e UX operacional

## Ajustes principais
- App do Tutor /app/bem-estar com espaçamento vertical de 20px entre cards.
- Admin /admin/bem-estar com filtros no padrão visual das outras páginas e remoção da seta azul duplicada.
- Admin /admin/promocoes e /admin/crm com headers de tabela usando apenas seta preta funcional e reforço de modais padronizados.
- CRM: espaçamento de 20px nos cards de Reativação e WhatsApp/Mensagens prontas.
- Financeiro: ações da listagem agora usam menu de 3 pontinhos; Enviar mensagem e Dar baixa abrem em modais.
- Financeiro: botão + Novo Lançamento também acima do card Consulta financeira e abrindo modal padrão.
- Relatórios: gráficos criativos com colunas, pizza, linha, evolução mensal de agendamentos, tutores, pets e mimos.
- Roleta de Mimos: layout alinhado ao padrão premium com hero card, big numbers, copywriting operacional e espaçamento de 20px entre cards.

## Comandos
```bash
npm install
npm run db:migrate
npm start
```

## Observação
Não há migration obrigatória exclusiva desta versão, mas `npm run db:migrate` continua recomendado para ambientes novos.

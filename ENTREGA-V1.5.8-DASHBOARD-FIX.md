# PetFunny OS v1.5.8 — Dashboard fix

Correções aplicadas:

- Removido estado oculto de loading que deixava o cursor como espera/lupa no Dashboard.
- `hideLoading()` agora limpa a classe `has-page-loading` mesmo quando o shell recria o body.
- Tabela de atendimentos do Dashboard ganhou coluna **Pagamento**.
- Endpoint `/api/dashboard/summary` agora envia status e forma de pagamento dos agendamentos.
- Área **Saúde da agenda** agora usa visualização por cards/colunas no padrão da Agenda.
- Cards da operação foram incorporados dentro da saúde da agenda.

Como rodar:

```bash
npm install
npm run db:migrate
npm start
```

Como testar:

```txt
http://localhost:3000/admin/dashboard
```

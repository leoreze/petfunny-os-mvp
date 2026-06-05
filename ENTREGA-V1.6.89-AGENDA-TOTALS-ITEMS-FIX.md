# FunnyOS v1.6.89 — Correção Agenda totals.items iterable

## O que foi corrigido

- Corrigido erro interno ao criar novo agendamento em `POST /api/agenda`:
  - `TypeError: totals.items is not iterable`
- A função `centsFromServices()` agora devolve também a lista `items`, além dos totais financeiros.
- O desconto global do agendamento agora é calculado por item e refletido no `total_cents` dos itens.
- Ajustado o cadastro e a edição de agendamentos para salvar `total_cents` do item com base no total calculado, e não apenas no valor unitário bruto.
- Mantida compatibilidade com taxa de transporte / Táxi PetFunny adicionada ao agendamento.

## Arquivos alterados

- `backend/src/app.js`
- `package.json`
- `backend/package.json`
- `DEPLOY_VERSION.txt`

## Como testar

1. Rodar o backend normalmente.
2. Acessar `http://localhost:3000/admin/agenda`.
3. Clicar em novo agendamento.
4. Selecionar tutor, pet, data, horário e pelo menos um serviço.
5. Salvar.
6. O agendamento deve ser criado sem erro 500.
7. Testar também edição de agendamento com serviços e desconto global.

## Observação técnica

A causa era que `centsFromServices()` retornava apenas:

```js
{ subtotalCents, discountCents, totalCents }
```

mas as rotas de agenda tentavam executar:

```js
for (const item of totals.items)
```

Como `totals.items` não existia, o backend quebrava no cadastro do agendamento.

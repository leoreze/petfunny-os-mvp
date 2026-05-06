# PetFunny OS v1.5.75 — Correção da contagem de pets em Tutores

## Correção

A listagem de `/admin/tutores` mostrava na coluna **Pets** uma quantidade incorreta quando o tutor possuía agendamentos, porque a query fazia `COUNT(p.id)` após `LEFT JOIN appointments`, multiplicando o mesmo pet por cada agendamento relacionado.

## Ajuste aplicado

- Troca de `COUNT(p.id)` para `COUNT(DISTINCT p.id)` nas consultas de tutores.
- Corrigido também o detalhe do tutor e o lookup por WhatsApp usado na Agenda.
- Ajustado relatório de clientes inativos no CRM para não multiplicar pets por agendamentos.

## Arquivo alterado

- `backend/src/app.js`

## Como testar

1. `npm start`
2. Acesse `/admin/tutores`
3. Confira a coluna **Pets**.
4. Ela deve exibir apenas a quantidade real de pets cadastrados para cada tutor.

## Migration

Não há migration obrigatória.

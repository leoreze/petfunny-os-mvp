# REV 1.6.29 — Financeiro 360° v3

## Implementado

- Projeção futura em `Admin > Financeiro > Projeção`.
- Previsão de caixa em `Admin > Financeiro > Caixa futuro`.
- Indicadores de franquia em `Admin > Financeiro > Indicadores`.
- Dashboard executivo em `Admin > Financeiro > Executivo`.
- Endpoint `GET /api/financeiro/360-v3`.

## Regras financeiras preservadas

- Previsão e vencimentos usam `due_date`.
- Caixa realizado usa `paid_at`.
- Auditoria usa `created_at`.

## Compatibilidade

- Mantém Financeiro 360° v1 e v2.
- Não altera Agenda, App do Tutor, Mercado Pago ou Pacotes.
- Não exige migration nova.

## Como testar

1. Rodar `npm start`.
2. Acessar `/admin/financeiro`.
3. Abrir abas: Projeção, Caixa futuro, Indicadores e Executivo.
4. Conferir se os valores carregam sem erro no console.

# PetFunny OS v1.5.19 — Ajuste de UI em Tutores

## Correção

- Removida a seta azul duplicada/inativa dos cabeçalhos da tabela de Tutores.
- Mantida apenas a seta funcional controlada pelo botão de ordenação.
- O comportamento de filtro/ordenação por Tutor, Contato, Pets e Status foi preservado.

## Arquivos alterados

- frontend/assets/css/app.css

## Como testar

1. Rode `npm install`.
2. Rode `npm run db:migrate`.
3. Rode `npm start`.
4. Acesse `/admin/tutores`.
5. Confira que não há mais seta azul duplicada no cabeçalho da tabela.

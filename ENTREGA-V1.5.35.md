# PetFunny OS v1.5.35 — Correção dos menus da Agenda

## Correção aplicada
- Corrigido o problema em que os menus de três pontinhos da Agenda não abriam.
- Substituído o dropdown preso dentro dos cards por um dropdown global único.
- Ao abrir um menu, qualquer outro menu aberto é fechado automaticamente.
- O menu abre acima de tudo, com z-index alto, sem ficar cortado por cards, calendário ou colunas.
- O menu fecha ao clicar fora, ao rolar ou redimensionar a tela.

## Arquivos alterados
- frontend/pages/agenda/index.html
- frontend/assets/css/app.css

## Como testar
1. Acesse `/admin/agenda`.
2. Abra os três pontinhos em cards do calendário, visão por status e lista.
3. Confirme que o menu abre.
4. Abra outro menu e confirme que o anterior fecha.
5. Teste Editar, Cancelar, Comanda e Recibo.

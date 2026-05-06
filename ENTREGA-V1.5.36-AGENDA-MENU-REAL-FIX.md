# PetFunny OS v1.5.36 — Correção real dos menus de três pontinhos da Agenda

## Correção
- Menu dos três pontinhos da Agenda reimplementado com listener em `pointerdown` em fase de captura.
- Dropdown global único acima de tudo.
- Evita toggle duplo entre `pointerdown` e `click`.
- Fecha ao clicar fora, rolar, redimensionar ou pressionar ESC.
- Mantém ações: editar, cancelar, comanda, recibo quando pago e WhatsApp.

## Arquivos alterados
- `frontend/pages/agenda/index.html`
- `frontend/assets/css/app.css`

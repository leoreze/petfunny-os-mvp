# REV146 — Admin Pets: busca de tutor por WhatsApp

## O que foi ajustado

- No modal `Novo pet` em `/admin/pets`, foi incluído o campo **Buscar tutor por WhatsApp** acima do combo **Tutor responsável**.
- Ao digitar ou sair do campo, o sistema busca automaticamente o tutor pelo WhatsApp.
- Ao encontrar, o tutor é selecionado automaticamente no combo.
- Mantido o combo manual para não quebrar o fluxo existente.
- Adicionado feedback visual de encontrado/não encontrado.
- Sem alteração de rotas, banco ou layout global.

## Arquivos alterados

- `frontend/pages/pets/index.html`
- `frontend/assets/css/app.css`

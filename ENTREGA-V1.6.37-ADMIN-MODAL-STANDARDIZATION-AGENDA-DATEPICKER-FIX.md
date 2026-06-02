# FunnyOS v1.6.37 — Admin Modal Standardization + Agenda DatePicker Fix

## O que foi feito

- Padronização global dos modais do Admin com margem superior e inferior de 100px.
- Modais agora usam altura `calc(100dvh - 200px)`.
- Cabeçalho e rodapé permanecem fixos dentro do modal.
- Conteúdo do modal rola apenas no `.modal-body`.
- Correção em `/admin/agenda`, card **Filtros rápidos**, campo **Data Base**: removido o botão extra de calendário, mantendo apenas o ícone nativo do input de data.

## Arquivos alterados

- `frontend/assets/css/app.css`
- `frontend/pages/agenda/index.html`
- `package.json`
- `backend/package.json`

## Como testar

1. Rodar o projeto:

```bash
npm start
```

2. Abrir páginas do Admin com modal:

- `/admin/agenda`
- `/admin/tutores`
- `/admin/pets`
- `/admin/servicos`
- `/admin/pacotes`
- `/admin/financeiro`
- `/admin/saude-360`

3. Verificar se os modais abrem com margem superior/inferior e rolagem interna.
4. Em `/admin/agenda`, verificar em **Filtros rápidos > Data Base** se aparece apenas um calendário.

## Banco de dados

Sem migration.

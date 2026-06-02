# FunnyOS v1.6.38 — Health360 Bulk Actions

## O que foi implementado
- Checkboxes nas listagens de `/admin/saude-360`.
- Seleção individual e seleção geral dos itens visíveis.
- Barra de ações em massa com contador de itens selecionados.
- Exclusão em lote para Veterinários, Agenda de Teleconsultas, Últimas Triagens e Teleconsultas.
- Na aba Agenda, é possível selecionar vários horários e excluir todos de uma vez.

## Rotas novas
- `POST /api/admin/health360/veterinarians/bulk-delete`
- `POST /api/admin/health360/slots/bulk-delete`
- `POST /api/admin/health360/triages/bulk-delete`
- `POST /api/admin/health360/teleconsultations/bulk-delete`

## Arquivos principais alterados
- `backend/src/app.js`
- `frontend/pages/saude-360/index.html`
- `package.json`
- `backend/package.json`

## Como testar
1. Rodar `npm start`.
2. Acessar `/admin/saude-360`.
3. Abrir a aba Agenda.
4. Selecionar 2 ou mais horários.
5. Clicar em `Excluir selecionados`.
6. Confirmar a ação.
7. Verificar se a lista recarrega sem os horários excluídos.

## Observações
- Não exige migration.
- As exclusões são soft delete quando a tabela possui `deleted_at`.
- Mantém o padrão visual do Admin.

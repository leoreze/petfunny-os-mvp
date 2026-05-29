# PetFunny OS v1.5.48 — Pacotes com porte, serviços por tipo e agenda por sessão

## O que foi feito
- Adicionado campo **Porte do pacote** no cadastro de pacotes.
- Serviços inclusos agora são filtrados por porte e agrupados por tipo/categoria, seguindo o mesmo padrão visual e operacional do Novo Agendamento.
- Mantida a seleção múltipla de serviços no pacote.
- Venda de pacote agora filtra pets pelo porte do pacote quando aplicável.
- Geração automática de agenda passa a começar na **data de contratação** e respeita a quantidade de sessões do pacote.
- Sessões geradas recebem vínculo com o pacote do cliente, número da sessão e total de sessões.
- Comanda pública passa a exibir informação de pacote: sessão atual e quantidade total do pacote.
- Pacotes vendidos mostram quantidade de agendas geradas e link rápido para a primeira comanda.
- Financeiro do pacote registra descrição com quantidade de sessões.

## Arquivos principais alterados
- `frontend/pages/pacotes/index.html`
- `frontend/assets/css/app.css`
- `backend/src/app.js`
- `backend/src/scripts/migrate.js`
- `package.json`
- `backend/package.json`

## Como rodar
1. `npm install`
2. `npm run db:migrate`
3. `npm run db:seed` se quiser repopular dados de teste
4. `npm start`

## Como testar
- Acesse `/admin/pacotes`.
- Clique em **Novo pacote**.
- Escolha um porte: Pequeno, Médio, Grande, Gigante ou Todos.
- Verifique se os serviços aparecem agrupados por tipo/categoria e filtrados por porte.
- Selecione mais de um serviço e salve o pacote.
- Clique em **Vender pacote**.
- Selecione tutor, pacote e pet.
- Confirme se a lista de pets respeita o porte do pacote.
- Venda o pacote com geração automática ativada.
- Confira se foram criados agendamentos a partir da data de contratação, com labels como `1 de 4`, `2 de 4`.
- Abra a primeira comanda pelo link exibido em Pacotes vendidos.

## Observações
- É necessário rodar `npm run db:migrate` para criar os novos campos `packages.pet_size`, `appointments.customer_package_id`, `appointments.package_session_number` e `appointments.package_total_sessions`.
- A integração com recibo continua usando o motor de documentos por agendamento. Ao gerar/baixar o pagamento da sessão, o recibo usa os totais da sessão vinculada ao pacote.

# PetFunny OS v1.5.49 — Pacotes: tabelas, ações, portes, pagamento e recorrência

## O que foi feito
- Ajuste visual do header das tabelas de registros em `/admin/pacotes`.
- Ordenação mantida apenas pela seta preta do header, sem transformar o título inteiro em botão.
- Em **Pacotes vendidos**, foi adicionada coluna **Ações** com menu de 3 pontinhos.
- Menu de ações permite:
  - visualizar o pacote vendido;
  - alterar status de pagamento;
  - alterar forma de pagamento;
  - cancelar pacote, interrompendo a recorrência automática.
- Cadastro de pacote mantém o combo **Porte do pacote** carregado a partir da tabela `pet_sizes`, usada pelas Configurações.
- Ao selecionar o porte, os serviços continuam filtrados por porte e agrupados por tipo/categoria.
- Serviços inclusos agora têm campo de quantidade, permitindo exemplo como **4 banhos simples**.
- Venda de pacote agora tem campo **Forma de pagamento**.
- Venda de pacote agora tem opção **Recorrência automática**.
- Quando a recorrência está ativa, o backend renova o ciclo de agendamentos ao concluir todas as sessões do ciclo atual.
- Quando o pacote do cliente é cancelado, a recorrência é desligada.

## Arquivos alterados
- `frontend/pages/pacotes/index.html`
- `frontend/assets/css/app.css`
- `backend/src/app.js`
- `backend/src/scripts/migrate.js`

## Novos campos de banco
Rodar `npm run db:migrate` para garantir:
- `customer_packages.recurring`
- `customer_packages.payment_method_id`
- `customer_packages.current_cycle_started_on`
- `customer_packages.cycle_number`

## Como rodar
```bash
npm install
npm run db:migrate
npm start
```

## Como testar
1. Abrir `http://localhost:3000/admin/pacotes`.
2. Conferir headers das duas tabelas com setas pretas funcionando.
3. Cadastrar pacote, selecionar porte e validar serviços filtrados.
4. Definir quantidade em um serviço, por exemplo 4 em Banho simples.
5. Vender pacote, escolher pagamento, forma de pagamento e marcar recorrência se desejar.
6. Em Pacotes vendidos, abrir menu de 3 pontinhos.
7. Visualizar pacote vendido.
8. Alterar pagamento e forma de pagamento.
9. Cancelar pacote e validar que a recorrência é interrompida.

## Observações
- A rotina automática de renovação roda de forma segura quando os pacotes são consultados ou quando uma sessão é finalizada. Não depende de IA, cron externo ou integração de terceiros.
- O sistema só gera novo ciclo se o pacote vendido estiver ativo e com recorrência ligada.
- Pacote cancelado não renova.

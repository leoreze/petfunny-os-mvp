# FunnyOS v1.6.101 — Pacote Antigo com Renovação Automática por Ciclo

## O que foi feito

- Ajustada a recorrência automática de Pacote Antigo.
- Ao finalizar o ciclo atual, o sistema cria um novo pacote vendido com os mesmos dados do ciclo anterior.
- Para pacotes de 4 sessões, o primeiro agendamento do novo ciclo começa 7 dias após a sessão 4 de 4 finalizada.
- Para pacotes de 2 sessões, o primeiro agendamento do novo ciclo começa 15 dias após a sessão 2 de 2 finalizada.
- O ciclo anterior é marcado como finalizado para evitar duplicidade.
- O novo ciclo mantém recorrência automática ativa até cancelamento.
- A lógica também evita recriar o mesmo ciclo quando a tela é recarregada ou quando a rotina de atualização roda novamente.

## Arquivos principais alterados

- backend/src/app.js
- package.json
- backend/package.json
- package-lock.json
- backend/package-lock.json
- DEPLOY_VERSION.txt

## Como testar

1. Acesse `/admin/pacotes`.
2. Crie um Pacote Antigo com recorrência automática marcada.
3. Para pacote 4 de 4, finalize a sessão 4 de 4 em `/admin/agenda`.
4. O sistema deve criar um novo pacote vendido e gerar o primeiro agendamento 7 dias depois.
5. Para pacote 2 de 2, finalize a sessão 2 de 2.
6. O sistema deve criar um novo pacote vendido e gerar o primeiro agendamento 15 dias depois.
7. Recarregue `/admin/pacotes` e confirme que o mesmo ciclo não duplica.

## Observações

- A renovação é disparada ao finalizar a última sessão ou ao carregar a lista de pacotes/clientes, caso exista ciclo recorrente já vencido.
- O pacote anterior fica como histórico finalizado.
- O novo pacote fica ativo, recorrente e com novos agendamentos.

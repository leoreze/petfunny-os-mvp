# FunnyOS v1.6.76 — App Agenda Transporte Automático

## O que foi feito

- `/app/agenda`: ao selecionar serviço de Transporte, o app verifica se o tutor tem endereço cadastrado.
- Se não tiver endereço completo, abre modal para cadastrar CEP, rua, número, bairro, cidade e estado.
- Após salvar o endereço, o app calcula automaticamente uma estimativa de transporte.
- Novo endpoint: `GET /api/app/transport/estimate`.
- O cálculo atual usa estimativa por zona/bairro/CEP em Ribeirão Preto.
- O valor considera ciclo completo operacional: buscar o pet e entregar depois do atendimento.
- O valor de transporte é somado ao pagamento do agendamento.
- A observação do agendamento registra o transporte, endereço e resumo do cálculo.

## Observação técnica

Para cálculo exato por rota real de mapa, a próxima evolução deve conectar Google Routes API, Google Distance Matrix, OpenRouteService ou Mapbox. A versão atual deixa o fluxo funcionando sem depender de API externa.

## Banco

Não altera banco.
Não precisa rodar migration.

## Como rodar

```bash
npm install
npm start
```

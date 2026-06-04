# FunnyOS v1.6.77 — Transporte com Google Routes API + fallback local

## O que foi feito

- Adicionada integração opcional com Google Routes API para calcular a distância real do trajeto de transporte do pet.
- Mantido fallback local por bairro/CEP quando:
  - `GOOGLE_MAPS_API_KEY` não estiver configurada;
  - a API do Google falhar;
  - a API atingir timeout;
  - não retornar distância válida.
- O cálculo continua considerando o ciclo operacional completo:
  - PetFunny → tutor;
  - tutor → PetFunny;
  - PetFunny → tutor;
  - tutor → PetFunny.
- O valor do transporte entra automaticamente no total do agendamento.
- A observação do agendamento registra endereço, valor, método utilizado e resumo do trajeto.
- `/api/app/transport/estimate` agora informa se usou Google Routes API ou fallback local.

## Variáveis novas

```env
GOOGLE_MAPS_API_KEY=
PETFUNNY_ORIGIN_ADDRESS=PetFunny Banho e Tosa, Ribeirão Preto, SP
TRANSPORT_BASE_FEE=6
TRANSPORT_PRICE_PER_KM=2.20
TRANSPORT_MIN_FEE=12
TRANSPORT_MAX_ONE_WAY_KM=20
```

## Regras de cálculo

```text
valor = taxa base + (km operacional × valor por km)
```

Com mínimo configurável por `TRANSPORT_MIN_FEE`.

## Observações

- Não altera banco.
- Não precisa rodar migration.
- Para usar Google Routes API em produção, configure a chave no Render/local `.env`.
- Sem chave, o sistema continua funcionando com fallback local.

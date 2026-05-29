# REV 132 — Compatibilidade cartão Mercado Pago + listagem Roleta de Mimos

## Correções aplicadas

### App do Tutor / Pagamento
- Corrigida compatibilidade para bancos já existentes em que `appointment_payment_intents` ainda não possui `payment_type`.
- O backend agora garante, antes de criar uma intenção de pagamento, as colunas incrementais necessárias:
  - `payment_type`
  - `mp_preference_id`
  - `checkout_url`
- Aplicado também para `package_payment_intents`, preservando Pix e cartão.

### Admin / Roleta de Mimos
- Ajustada a listagem de `Mimos configurados` para não quebrar quando a tabela `gift_spins` estiver em formato antigo/incompleto.
- A listagem dos mimos agora prioriza as tabelas compatíveis de cadastro e usa contagem de sorteios somente se a coluna `gift_id` existir.
- O resumo da Roleta agora calcula histórico de forma defensiva, sem impedir que os mimos cadastrados apareçam.

## Observação importante
Mesmo com a proteção de compatibilidade em runtime, recomenda-se rodar:

```bash
npm run db:migrate
```

Isso atualiza definitivamente o banco local com as colunas novas.

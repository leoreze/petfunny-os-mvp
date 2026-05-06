# PetFunny OS v1.4.6 — Correção de Comandas e Recibos

## Correção aplicada

Corrigido erro na geração de comanda/recibo causado pela função `getBusinessDocumentPayload()`.

A função ainda consultava um formato antigo de `business_settings` com colunas `key` e `value`, mas a estrutura atual da tabela usa colunas reais como:

- `business_name`
- `legal_name`
- `document_number`
- `whatsapp`
- `address_city`
- `address_state`
- `instagram_url`

## O que mudou

- `getBusinessDocumentPayload()` agora lê corretamente a tabela atual `business_settings`.
- Adicionado fallback oficial do PetFunny caso as configurações não existam ou a consulta falhe.
- A geração de recibos/comandas não derruba mais Financeiro, Comandas ou baixa de pagamento se os dados do comércio estiverem incompletos.

## Como rodar

```bash
npm install
npm run db:migrate
npm run db:seed
npm start
```

## Como testar

- `/admin/financeiro`
- `/admin/comandas-recibos`
- gerar recibo de um agendamento
- baixar pagamento no financeiro

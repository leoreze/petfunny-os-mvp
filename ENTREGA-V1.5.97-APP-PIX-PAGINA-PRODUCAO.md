# PetFunny OS v1.5.97 — App Pix em Página + Proteção Mercado Pago Produção

## O que foi ajustado

- O pagamento Pix do App do Tutor não abre mais em modal.
- Ao salvar o agendamento, o app redireciona para `/app/pagamento-pix?intent=...`.
- A tela de pagamento agora é uma página dedicada dentro do App do Tutor.
- Os botões da tela Pix foram ajustados para manter o padrão visual do app/landing: salmão + turquesa da logo PetFunny.
- O QR Code e o Pix copia e cola continuam sendo os dados oficiais retornados pelo Mercado Pago.
- Adicionada proteção contra uso acidental de credencial `TEST-` para pagamento com banco real.
- Se o backend detectar credencial de teste do Mercado Pago, ele não exibe QR Code para pagamento real e retorna mensagem clara.
- Adicionado `MERCADO_PAGO_ALLOW_TEST_PIX=false` no `.env.example`.
- Atualizado cache do service worker para `petfunny-app-v1.5.97`.

## Por que o banco podia dar erro ao pagar o QR Code

Quando o Mercado Pago usa credenciais de teste, ele pode gerar cobrança Pix de sandbox/teste. Esse QR pode até ser lido por apps bancários, mas não deve ser usado para pagamento real. Para banco real, use sempre `MERCADO_PAGO_ACCESS_TOKEN=APP_USR-...` de produção.

## Variável opcional

Use apenas para teste sandbox:

```env
MERCADO_PAGO_ALLOW_TEST_PIX=true
```

Para produção, mantenha:

```env
MERCADO_PAGO_ALLOW_TEST_PIX=false
```

## Arquivos alterados

- `backend/src/app.js`
- `backend/src/config/env.js`
- `frontend/pages/app/home/index.html`
- `frontend/assets/css/app.css`
- `frontend/service-worker.js`
- `.env.example`

## Como testar

```bash
npm start
```

1. Entre no App do Tutor.
2. Vá em Agenda.
3. Escolha pet, serviços, data e horário disponível.
4. Clique em criar agendamento.
5. O app deve abrir `/app/pagamento-pix?intent=...`.
6. A tela deve exibir QR Code, copia e cola, botão copiar e botão Mercado Pago quando disponível.

## Observação

Não há migration obrigatória nesta versão.

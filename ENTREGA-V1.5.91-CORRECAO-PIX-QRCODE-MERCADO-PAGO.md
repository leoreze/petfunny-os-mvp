# PetFunny OS v1.5.91 — Correção Pix QR Code Mercado Pago

## Correções

- O backend agora valida se o Mercado Pago retornou `qr_code` e `qr_code_base64` válidos antes de exibir o QR Code.
- O Pix copia e cola é normalizado sem espaços/quebras.
- O app usa exatamente o QR oficial retornado pelo Mercado Pago.
- Se a credencial for de teste (`TEST-`), o app avisa que banco real pode não pagar/reconhecer como produção.
- Adicionado link `Abrir no Mercado Pago` quando `ticket_url` existir.
- Fallback de e-mail deixou de usar domínio `.local`.
- Mensagens de erro ficaram mais claras quando a conta Mercado Pago não retorna Pix válido.

## Arquivos alterados

- `backend/src/app.js`
- `frontend/pages/app/home/index.html`
- `frontend/assets/css/app.css`

## Como testar

1. Use credenciais de produção do Mercado Pago para pagamento real.
2. Rode `npm start`.
3. Crie agendamento pelo app.
4. Na tela de Pix, teste primeiro o botão **Copiar código Pix** no app do banco.
5. Depois teste a leitura do QR Code.

Sem migration obrigatória.

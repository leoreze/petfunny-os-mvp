# PetFunny OS v1.5.93 — Pix no app sem voltar para login

## Correção

Ao salvar um agendamento pelo App do Tutor, o pagamento Pix agora abre em modal dentro do próprio app, sem navegar imediatamente para outra rota.

Isso evita que uma troca de página, service worker antigo ou token legado faça o app voltar para `/app/login` antes de exibir o QR Code.

## Ajustes

- O Pix Mercado Pago abre em modal após `POST /api/app/appointments`.
- O token do app agora é salvo em `localStorage` e `sessionStorage`.
- `client-auth.js` aceita token legado `petfunny_app_token` e normaliza para `petfunny_client_token`.
- O service worker foi versionado para `petfunny-app-v1.5.93`, forçando atualização do cache.
- A página `/app/pagamento-pix` continua funcionando como fallback.

## Como testar

1. Rode `npm start`.
2. Acesse `/app/login`.
3. Entre com WhatsApp e senha.
4. Vá em `/app/agenda`.
5. Escolha pet, serviços, data e horário disponível.
6. Clique para salvar.
7. O modal Pix deve abrir sem sair para login.

## Observação

Se o navegador ainda carregar uma versão antiga, limpe o service worker em DevTools > Application > Service Workers > Unregister e recarregue a página.

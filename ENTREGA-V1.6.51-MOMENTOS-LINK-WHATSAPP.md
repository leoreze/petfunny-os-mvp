# FunnyOS v1.6.51 — Momentos Especiais com Link Validado por WhatsApp

## O que foi feito

- Ajustado o fluxo de **Momentos do atendimento** em `/admin/agenda`.
- Ao salvar uma foto ou vídeo do atendimento, o backend agora gera automaticamente um **link Momentos Especiais**.
- O link abre direto a página `/app/momentos` do App do Tutor.
- O acesso é validado por um token seguro associado ao **WhatsApp do tutor**.
- Se o tutor ainda não tiver conta ativa no App do Tutor, o sistema libera uma conta técnica para aquele WhatsApp e cria a sessão do app via link.
- O modal de upload agora mostra:
  - campo com o link gerado;
  - botão **Abrir página**;
  - botão **Copiar link**;
  - botão **Enviar link no WhatsApp** com mensagem pronta.

## Arquivos alterados

- `backend/src/app.js`
- `frontend/pages/agenda/index.html`
- `frontend/pages/app/home/index.html`
- `frontend/assets/css/app.css`
- `DEPLOY_VERSION.txt`

## Como funciona

1. Admin abre `/admin/agenda`.
2. Clica nos três pontinhos de um agendamento.
3. Abre **Momentos do atendimento**.
4. Faz upload de uma foto/vídeo.
5. O sistema salva a mídia.
6. O sistema gera o link seguro de momentos.
7. O admin pode enviar a mensagem pronta pelo WhatsApp.
8. O tutor abre o link e cai direto em `/app/momentos`, sem precisar digitar senha naquele acesso.

## Segurança

- O link não é aberto por WhatsApp puro na URL.
- Ele usa JWT assinado no servidor com escopo específico: `client_app_moments_access`.
- O token expira em 14 dias.
- O token só libera o tutor dono daquele WhatsApp e daquele cadastro.
- Depois de validado, o app gera uma sessão normal `client_app`.

## Banco de dados

- Não cria tabela nova.
- Não altera estrutura.
- Não precisa rodar migration.

## Como rodar

```bash
npm install
npm start
```

## Como testar

1. Abra `/admin/agenda`.
2. Escolha um agendamento existente com tutor e WhatsApp.
3. Clique em **Momentos do atendimento**.
4. Faça upload de uma imagem.
5. Veja se aparece o bloco **Link Momentos Especiais gerado**.
6. Clique em **Abrir página**.
7. Confirme se abre `/app/momentos` com as fotos do tutor.
8. Clique em **Enviar link no WhatsApp** e confira a mensagem pronta.

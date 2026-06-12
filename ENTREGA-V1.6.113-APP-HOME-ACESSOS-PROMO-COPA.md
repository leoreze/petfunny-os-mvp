# FunnyOS v1.6.113 — App Home Indique + Acessos Promo Copa

## O que foi feito

- Em `/app/home`, o card **Indique e ganhe!** recebeu altura mínima de 250px.
- Em `/app/home`, o texto **Copa do Mundo PetFunny** no card da Copa recebeu `margin-top: 20px`.
- Em `/admin/app-acessos`, no card **Lista de acessos**, o menu de 3 pontinhos recebeu a opção **Enviar promoção da Copa**.
- A mensagem abre o WhatsApp do tutor com texto pronto sobre o Bolão da Copa.
- Antes de abrir o WhatsApp, a interação é registrada no CRM quando possível.

## Arquivos alterados

- `frontend/pages/app-acessos/index.html`
- `frontend/assets/css/app.css`
- `package.json`
- `backend/package.json`
- `package-lock.json`
- `backend/package-lock.json`
- `DEPLOY_VERSION.txt`

## Como testar

1. Acesse `/app/home` e confira o card **Indique e ganhe!** com altura maior.
2. Ainda em `/app/home`, confira o respiro superior do texto **Copa do Mundo PetFunny**.
3. Acesse `/admin/app-acessos`.
4. No card **Lista de acessos**, clique no menu `⋯`.
5. Clique em **Enviar promoção da Copa**.
6. O WhatsApp deve abrir com a mensagem pronta do Bolão da Copa.

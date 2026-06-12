# FunnyOS v1.6.112 — Bolão App Respiro Visual

## O que foi feito

- Ajustado o card da promoção da Copa em `/app/home` para altura mínima de 220px.
- Adicionado respiro inferior no texto do card da Copa para não ficar colado no rodapé.
- Ajustado o hero/card do `/app/bolao-copa` com `margin-bottom` e `padding-bottom` de 20px no texto.
- Mantida a regra da v1.6.111: tutor pode enviar apenas 1 palpite por jogo.

## Arquivos alterados

- `frontend/assets/css/app.css`
- `frontend/pages/app/home/index.html`
- `package.json`
- `backend/package.json`
- `package-lock.json`
- `backend/package-lock.json`
- `DEPLOY_VERSION.txt`

## Como testar

1. Acesse `/app/home`.
2. Confira se o card da promoção da Copa tem altura mínima maior e texto com respiro no rodapé.
3. Acesse `/app/bolao-copa`.
4. Confira se o texto do card/hero não fica colado no rodapé.

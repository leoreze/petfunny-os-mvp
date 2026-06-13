# FunnyOS v1.6.116 — App Tutor fonte maior + Indique e Ganhe 180px

## O que foi feito

- Ajustado o card **Indique e ganhe!** em `/app/home` para altura mínima de **180px**.
- Aumentada a fonte global do App do Tutor sem afetar o admin.
- Incluída a tela `/app/login` no ajuste de tipografia do App do Tutor.
- Mantida a margem superior do título **Copa do Mundo PetFunny** criada na versão anterior.

## Arquivos alterados

- `frontend/assets/css/app.css`
- `frontend/pages/app/login/index.html`
- `package.json`
- `backend/package.json`
- `package-lock.json`
- `backend/package-lock.json`
- `DEPLOY_VERSION.txt`

## Validação

```bash
node --check backend/src/app.js
node --check /tmp/apphome-v16116.mjs
unzip -t FunnyOS-v1.6.116-app-tutor-fonte-indique.zip
```

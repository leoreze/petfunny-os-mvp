# PetFunny OS v1.5.122 — Salmão visual unificado

## O que foi ajustado

- Atualizado o rosa principal para um tom mais salmão em todo o frontend.
- Aplicado o novo salmão na landing principal `/`.
- Aplicado o novo salmão na página `/franquias`.
- Aplicado o novo salmão no app do tutor, incluindo `/app/home`, login, primeiro acesso, botões, badges, gradientes, detalhes visuais e estados de formulário.
- Atualizados metadados de tema do navegador e manifesto PWA para manter a identidade consistente.

## Arquivos principais alterados

- frontend/assets/css/app.css
- frontend/index.html
- frontend/pages/app/home/index.html
- frontend/pages/app/login/index.html
- frontend/pages/app/primeiro-acesso/index.html
- frontend/manifest.webmanifest
- frontend/assets/js/toast.js
- frontend/pages/roleta-de-mimos/index.html
- frontend/pages/relatorios/index.html
- package.json
- backend/package.json
- DEPLOY_VERSION.txt

## Como testar

```bash
npm start
```

Acesse:

- http://localhost:3000/
- http://localhost:3000/franquias
- http://localhost:3000/app/home

## Observação

Não precisa rodar migration nesta versão.

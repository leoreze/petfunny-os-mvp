# PetFunny OS v1.5.64 — App do Tutor: Login com logo central e post-it animado

## O que foi feito
- Ajustado layout da primeira tela do App do Tutor.
- Logo PetFunny centralizada no topo do card.
- Texto “App do tutor” abaixo da logo.
- Título principal ajustado para “Entrar no Meu PetFu”.
- Adicionado post-it animado abaixo da logo, com mensagem curta para o tutor.
- Reforçado CSS mobile-first do app para melhor alinhamento, respiro e hierarquia visual.
- Mantido o fluxo funcional de autenticação por WhatsApp, código, cadastro do tutor, cadastro do pet e acesso ao app.

## Arquivos alterados
- frontend/pages/app/login/index.html
- frontend/assets/css/app.css

## Como rodar
```bash
npm install
npm run db:migrate
npm start
```

## Como testar
Acesse:

```txt
http://localhost:3000/app/login
```

Confira no celular ou no modo responsivo do Chrome:
- logo centralizada;
- “App do tutor” abaixo da logo;
- “Entrar no Meu PetFu” em destaque;
- post-it animado abaixo do título;
- formulário de WhatsApp sem quebra visual;
- fluxo das etapas funcionando.

## Validação
- `node --check backend/src/app.js`
- `node --check backend/src/scripts/migrate.js`
- `node --check` do script extraído de `frontend/pages/app/login/index.html`

## Observação
Não há migration obrigatória nesta versão.

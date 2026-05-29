# PetFunny OS v1.5.63 — App do Tutor: autenticação mobile-first por WhatsApp

## O que foi feito

- Substituído o fluxo de login demo/primeiro acesso por uma jornada mobile-first em etapas.
- Primeira tela do app agora começa com WhatsApp.
- O sistema gera código de validação para WhatsApp.
- Em ambiente local, o código aparece na tela como `Código local: 123456`.
- Depois de validar o código:
  - se o tutor já existir, o app pede senha e confirmação de senha;
  - se o tutor não existir, abre cadastro do tutor;
  - depois abre cadastro do pet;
  - ao finalizar pet + senha, libera acesso ao app.
- Mantido fallback seguro e sem dependência de API externa para carregar o app.

## Novos endpoints

- `POST /api/app/auth/request-code`
- `POST /api/app/auth/verify-code`
- `POST /api/app/auth/set-password`
- `POST /api/app/auth/register-tutor`
- `POST /api/app/auth/register-pet`

## Banco de dados

Adicionada a tabela:

- `client_auth_codes`

Ela guarda temporariamente o código validado por WhatsApp.

## Arquivos alterados

- `backend/src/app.js`
- `backend/src/scripts/migrate.js`
- `frontend/pages/app/login/index.html`
- `frontend/pages/app/primeiro-acesso/index.html`
- `frontend/assets/css/app.css`

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

Fluxo cliente existente:

1. Informe o WhatsApp de um tutor cadastrado.
2. Clique em enviar código.
3. Em local, use `123456`.
4. Crie senha e confirme senha.
5. O app entra em `/app/home`.

Fluxo cliente novo:

1. Informe um WhatsApp que ainda não existe em Tutores.
2. Clique em enviar código.
3. Em local, use `123456`.
4. Cadastre o tutor.
5. Cadastre o pet.
6. Crie senha e confirme senha.
7. O app entra em `/app/home`.

## Observação importante

A estrutura está pronta para integrar WhatsApp real. Nesta versão, para não depender de API externa e não travar o app, o envio real por WhatsApp ainda não chama Evolution API, Z-API, n8n ou Meta Cloud API. Em produção, basta conectar o envio dentro do endpoint `POST /api/app/auth/request-code`.

## Validação feita

```bash
node --check backend/src/app.js
node --check backend/src/scripts/migrate.js
node --check scripts extraídos de frontend/pages/app/login/index.html
node --check scripts extraídos de frontend/pages/app/primeiro-acesso/index.html
```

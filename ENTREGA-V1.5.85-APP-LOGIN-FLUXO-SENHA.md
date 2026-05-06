# PetFunny OS v1.5.85 — App Login: fluxo com senha para cliente já validado

## O que foi ajustado

- Ao informar WhatsApp no `/app/login`, o backend agora verifica se já existe conta ativa com senha.
- Se o tutor já validou o acesso antes, o app não exige novo código: abre diretamente a etapa de senha.
- Se o tutor existe mas ainda não criou senha, segue o fluxo de código e criação de senha.
- Se o WhatsApp ainda não existe, segue o fluxo completo: código, cadastro do tutor, cadastro do pet e acesso ao app.
- Adicionada opção “Esqueci minha senha / validar por código” para gerar novo código quando necessário.

## Fluxos cobertos

1. Novo cliente:
   - WhatsApp → Código → Cadastro do tutor → Cadastro do pet + senha → App.

2. Tutor já cadastrado, primeiro acesso:
   - WhatsApp → Código → Criar senha → App.

3. Tutor já validado e com senha:
   - WhatsApp → Senha → App.

## Arquivos alterados

- `backend/src/app.js`
- `frontend/pages/app/login/index.html`
- `frontend/assets/css/app.css`

## Como testar

```bash
npm start
```

Acesse:

```txt
http://localhost:3000/app/login
```

Não precisa rodar migration.

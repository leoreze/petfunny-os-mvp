# Entrega v1.5.69 — App Login: aviso e card WhatsApp nas cores da logo

## O que foi ajustado

- Removido o visual verde da mensagem de sucesso do fluxo de código.
- A mensagem “Código gerado com segurança...” agora usa a paleta da logo PetFunny.
- O card “Envie o código para seu próprio WhatsApp” agora usa rosa/salmão e ciano/turquesa.
- O card do WhatsApp foi ajustado para ter a mesma largura do campo “Código recebido”.
- O botão “Abrir WhatsApp com meu código” também ocupa a mesma largura do campo.
- Mantido o fluxo de autenticação por WhatsApp/código sem alteração de backend.

## Arquivo alterado

- frontend/assets/css/app.css

## Como testar

1. npm install
2. npm start
3. Acessar http://localhost:3000/app/login
4. Informar WhatsApp
5. Verificar etapa de código, aviso e card de WhatsApp

## Migration

Não há migration obrigatória nesta versão.

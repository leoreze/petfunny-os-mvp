# PetFunny OS v1.5.68 — App Login: botões centralizados e aviso nas cores da logo

## O que foi feito
- Centralizado o grupo de botões da etapa de validação do código no `/app/login`.
- Botões `Alterar WhatsApp` e `Validar código` agora ficam alinhados ao centro no desktop/tablet.
- No mobile, os botões ficam empilhados em largura total para melhor toque.
- A caixa de aviso abaixo do código foi centralizada e recebeu a paleta da logo PetFunny.
- O botão `Abrir WhatsApp com meu código` também foi ajustado para a paleta rosa/ciano da logo.

## Arquivos alterados
- `frontend/assets/css/app.css`

## Como testar
1. `npm install`
2. `npm start`
3. Acessar `http://localhost:3000/app/login`
4. Inserir WhatsApp e avançar para a etapa de código.
5. Conferir centralização dos botões e aviso.

## Observações
- Não houve alteração de backend.
- Não há migration obrigatória.

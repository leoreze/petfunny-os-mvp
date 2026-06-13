# FunnyOS v1.6.117 — App Home pet picker + Roleta com prêmio e WhatsApp

## O que foi feito

- Em `/app/home`, o hero principal agora exibe seletor de pet igual ao fluxo de agenda, com avatar do pet e botão `+` para cadastrar novo pet.
- Todos os elementos `.client-mobile-hero` do App do Tutor receberam `padding-bottom: 20px`.
- Em `/app/roleta`, o pet participante agora é obrigatório para garantir que o mimo siga para a agenda com o pet selecionado.
- Ao girar a roleta, o app exibe um modal de premiação com animação, mimo sorteado e botão **Agendar serviços com o mimo**.
- O botão da premiação abre `/app/agenda?mimo=...&petId=...&spinId=...`, já com o pet selecionado e o mimo nas observações.
- No agendamento criado a partir da roleta, os campos ocultos de mimo (`giftSpinId`, `rouletteGiftTitle`, `rouletteGiftDescription`) são enviados ao backend.
- Após pagamento confirmado do agendamento, o botão de WhatsApp agora envia os detalhes para o WhatsApp do PetFunny, com tutor, pet, serviços, horário, valor e código do agendamento.

## Arquivos alterados

- `frontend/pages/app/home/index.html`
- `frontend/assets/css/app.css`
- `package.json`
- `backend/package.json`
- `package-lock.json`
- `backend/package-lock.json`
- `DEPLOY_VERSION.txt`

## Validação

```bash
node --check backend/src/app.js
node --check /tmp/apphome-v16117.mjs
unzip -t FunnyOS-v1.6.117-app-home-roleta-whatsapp.zip
```

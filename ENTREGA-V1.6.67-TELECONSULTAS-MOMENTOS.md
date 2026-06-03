# FunnyOS v1.6.67 — Teleconsultas com listagem + Momentos com câmera

## O que foi feito
- App Tele Consultas agora mostra os agendamentos de teleconsulta com data, horário, status e link.
- Cards de teleconsulta exibem pet, veterinário, motivo, valor e botão de ação.
- Link da sala de teleconsulta aparece quando o pagamento estiver aprovado.
- App Momentos recebeu botão flutuante de câmera/upload no canto inferior direito.
- Tutor pode enviar foto ou vídeo do pet pelo próprio PWA.
- Novo endpoint seguro para upload de momentos pelo tutor.

## Arquivos principais alterados
- backend/src/app.js
- frontend/pages/app/home/index.html
- frontend/assets/css/app.css

## Como rodar
```bash
npm install
npm start
```

## Banco
- Não altera estrutura do banco.
- Não precisa rodar migration.

# PetFunny OS — v0.9.2 Seed Fix

Correção pontual em cima da v0.9.1.

## Correção
- Corrigido erro `packageRow is not defined` no `backend/src/scripts/seed.js`.
- A criação da assinatura demo agora acontece dentro do mesmo escopo onde o pacote demo é recuperado.
- O `COMMIT` volta a acontecer somente depois dos inserts de pacote e assinatura.
- Mantidas Agenda, Pacotes, Assinaturas, status configuráveis e ajustes visuais da v0.9.1.

## Como rodar
```bash
npm install
npm run db:migrate
npm run db:seed
npm start
```

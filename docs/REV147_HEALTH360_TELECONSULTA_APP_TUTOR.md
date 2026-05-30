# REV147 — PetFunny Health 360 + Teleconsulta no App do Tutor

Implementado no App do Tutor:

- nova rota `/app/saude-360`;
- menu Saúde 360 no footer do app;
- PetFunny Health Score™ por pet;
- triagem segura “Meu pet está estranho”;
- classificação low/medium/high sem diagnóstico e sem prescrição;
- prontuário básico automático por pet;
- agendamento de teleconsulta com veterinário parceiro;
- link de chamada Jitsi/Meet-style gerado automaticamente;
- tabelas/migration para veterinários, teleconsultas, triagens, prontuário e score.

## Comandos

```bash
npm run db:migrate
npm start
```

## Observação

A teleconsulta desta revisão é foundation/MVP. O pagamento é registrado como pendente e pode ser integrado depois ao fluxo Mercado Pago existente.

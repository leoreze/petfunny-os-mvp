# FunnyOS v1.6.60 — App Tele Consultas separado do Saúde 360

## O que foi feito

- Removido o botão de agendar teleconsulta da tela `/app/saude-360`.
- Criada nova rota do PWA: `/app/teleconsultas`.
- Criado novo menu **Tele Consultas** no app do tutor.
- Atualizado card/atalho de home para apontar para `/app/teleconsultas`.
- Nova tela de Tele Consultas com fluxo:
  1. selecionar pet;
  2. clicar em **Agendar consulta**;
  3. ver lista de veterinários;
  4. selecionar veterinário;
  5. abrir tela com foto, CRMV, especialidade, bio e valor;
  6. escolher data/horário em cards;
  7. preencher formulário básico;
  8. escolher forma de pagamento;
  9. ir para pagamento;
  10. confirmar teleconsulta após pagamento aprovado.
- Criado endpoint leve para o PWA: `GET /api/app/teleconsultations/options`.
- Atualizados links internos de teleconsulta para a nova tela.
- Removidas mensagens visíveis com referência técnica ao provedor de pagamento.

## Banco

- Não altera banco.
- Não precisa rodar migration.

## Como rodar

```bash
npm install
npm start
```

## Como testar

1. Abrir `/app/saude-360` e confirmar que não existe mais o botão principal de agendar consulta.
2. Abrir `/app/teleconsultas`.
3. Selecionar um pet.
4. Clicar em **Agendar consulta**.
5. Selecionar um veterinário.
6. Escolher um horário.
7. Preencher motivo e descrição.
8. Escolher forma de pagamento.
9. Confirmar que o fluxo segue para a tela de pagamento.

# FunnyOS v1.6.91 — Pacote Antigo com Recorrência Automática

## O que foi feito

- Adicionado o checkbox **Recorrência automática** no modal **Pacote Antigo** em `/admin/pacotes`.
- O frontend agora envia `recurring: true` no payload de importação histórica quando o checkbox está marcado.
- O endpoint `POST /api/pacotes/clientes/historical` agora grava o pacote antigo como recorrente quando selecionado.
- Pacote antigo recorrente permanece `active`, mesmo quando o primeiro ciclo importado já terminou.
- A regra de recorrência passa a ficar registrada em `customer_packages.recurrence_rule` com:
  - `enabled`
  - `historicalImport`
  - `firstTime`
  - `appointmentsPerMonth`
  - `intervalDays`
  - `autoRenewUntilCancelled`
- Criada rotina para reconstruir ciclos históricos recorrentes até o ciclo atual/futuro.
- Datas passadas entram como `finalizado`.
- Datas futuras entram como `agendado`.
- Adicionado bloqueio contra duplicidade na geração de sessões do pacote para evitar recriar a mesma sessão no mesmo horário.

## Arquivos alterados

- `backend/src/app.js`
- `frontend/pages/pacotes/index.html`
- `package.json`
- `backend/package.json`
- `package-lock.json`
- `backend/package-lock.json`
- `DEPLOY_VERSION.txt`

## Como testar

1. Acesse `/admin/pacotes`.
2. Clique em **Pacote Antigo**.
3. Informe tutor, pet, pacote, data original, horário, total de sessões e valor.
4. Marque **Recorrência automática**.
5. Salve.
6. Abra `/admin/agenda`.
7. Verifique se os ciclos antigos foram reconstruídos:
   - sessões passadas como finalizadas;
   - próximas sessões como agendadas;
   - badge do pacote exibindo `1 de 4`, `2 de 4`, etc.
8. Volte em `/admin/pacotes` e confira se o pacote aparece como recorrente/ativo.
9. Cancele o pacote vendido para confirmar que a recorrência é interrompida.

## Observações

- A rotina usa limite de segurança de até 60 ciclos para evitar loop infinito em importações muito antigas.
- A recorrência continua até o pacote ser cancelado, seguindo a frequência configurada no pacote: semanal, quinzenal ou mensal.
- Não há cobrança automática de novos ciclos nesta entrega; a mudança foca na agenda recorrente e reconstrução histórica.

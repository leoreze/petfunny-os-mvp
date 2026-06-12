# FunnyOS v1.6.103 — Pacote Antigo Data Futura como Primeira Sessão

## O que foi corrigido

- Em `/admin/pacotes`, no botão **Pacote Antigo**, a data escolhida agora é tratada como **data do 1º agendamento**.
- Se escolher uma data futura, por exemplo `25/06`, o sistema gera o `1 de 4` exatamente nessa data.
- Para pacotes com 4 sessões, as próximas sessões são geradas a cada 7 dias.
- Para pacotes com 2 sessões, as próximas sessões são geradas a cada 15 dias.
- Datas futuras ficam com status `agendado`.
- Datas passadas continuam entrando como `finalizado`.
- A recorrência automática não renova imediatamente quando o primeiro agendamento escolhido ainda está no futuro.
- O texto do modal foi ajustado para deixar claro que a data é a data da 1ª sessão, não apenas a data da venda.

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
3. Selecione tutor, pet e pacote.
4. Escolha uma data futura, por exemplo `25/06`.
5. Escolha horário, por exemplo `09:00`.
6. Informe total de sessões `4`.
7. Salve.
8. Acesse `/admin/agenda`.
9. Confirme que aparecem:
   - `1 de 4` em `25/06`;
   - `2 de 4` em `02/07`;
   - `3 de 4` em `09/07`;
   - `4 de 4` em `16/07`.

Para pacote de 2 sessões, confirme intervalo de 15 dias entre `1 de 2` e `2 de 2`.

## Validação técnica

- `node --check backend/src/app.js`
- `node --check /tmp/pacotes-v16103-script.mjs`
- `unzip -t FunnyOS-v1.6.103-pacote-antigo-data-futura.zip`

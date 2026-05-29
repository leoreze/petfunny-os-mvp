# PetFunny OS v1.5.30 — Operações com loading, confirmação e links de documentos

## Ajustes entregues

- Dashboard: ao editar agendamento, o sistema exibe modal de carregamento, salva as alterações, atualiza o painel e exibe modal de sucesso com botão OK.
- Agenda: ao cadastrar ou editar agendamento, o sistema exibe modal de carregamento, salva, atualiza a agenda e exibe modal de sucesso com botão OK.
- Comanda na Agenda: botão **Copiar link** habilitado quando a comanda é aberta em modal.
- Recibo na Agenda: botão **Copiar link** habilitado com o link público/imprimível do recibo.
- Criada rota pública simples para comanda:
  - `/documentos/comanda/:appointmentId`
- Criado modal global de resultado em `loading.js`:
  - `showResultModal()`
  - `showSuccessModal()`

## Como testar

1. Acesse `/admin/agenda`.
2. Clique em **+ Novo agendamento**.
3. Cadastre um atendimento.
4. Confira o loading e depois o modal de sucesso com botão OK.
5. Edite um agendamento e confirme o mesmo fluxo.
6. No calendário, abra os três pontinhos > **Comanda**.
7. Clique em **Copiar link**.
8. Para recibo, deixe o pagamento como Pago, abra **Recibo** e clique em **Copiar link**.
9. No Dashboard, edite um agendamento e confirme o fluxo de loading + sucesso.

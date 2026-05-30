# FunnyOS v1.6.10 — Excluir Agendamento na Agenda

## O que foi feito

- Adicionada a opção **Excluir agendamento** no menu de três pontinhos em `/admin/agenda`.
- Inclusa confirmação antes da exclusão.
- A exclusão usa o endpoint existente `DELETE /api/agenda/:id`.
- A listagem da agenda é recarregada automaticamente após excluir.
- Não dispara WhatsApp, push ou mensagens automáticas ao tutor.
- Mantido o layout global e o fluxo atual de editar, cancelar, comanda, recibo e mensagem IA.

## Como rodar

```bash
npm start
```

## Migration

Não precisa rodar migration para esta entrega.

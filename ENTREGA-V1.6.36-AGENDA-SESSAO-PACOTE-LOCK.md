# FunnyOS v1.6.36 — Agenda: Sessão de Pacote com Campos Bloqueados

## O que foi corrigido
- Ao editar um agendamento gerado automaticamente por venda de pacote, o modal da Agenda agora abre em modo bloqueado.
- O campo WhatsApp do cliente fica preenchido e desabilitado.
- O campo Tutor fica preenchido e desabilitado.
- O campo Pet agora traz o nome correto do pet e fica desabilitado.
- O campo Desconto promocional global (%) fica desabilitado.
- O campo Total previsto fica preenchido com o valor real do agendamento/pacote e não pode ser alterado.
- Status, colaborador, status de pagamento, forma de pagamento e serviços ficam bloqueados para preservar pacote, financeiro, recibo e sessões.
- Somente Data, Hora e Observações podem ser alterados.

## Backend
- `PUT /api/agenda/:id` detecta `customer_package_id` e, nesses casos, permite atualizar apenas data/hora e observações.
- Preserva tutor, pet, serviços, total, desconto, status de pagamento e forma de pagamento.

## Frontend
- `/admin/agenda` exibe aviso de “Sessão gerada por pacote”.
- Campos bloqueados recebem visual de leitura.
- Pet vinculado ao pacote é garantido no combo mesmo quando não aparece na lista carregada inicialmente.

## Como testar
1. Venda um pacote que gere sessões automáticas.
2. Acesse `/admin/agenda`.
3. Clique em editar uma sessão do pacote.
4. Confirme que Tutor, WhatsApp, Pet, Total, Desconto, Pagamento, Forma e Serviços estão bloqueados.
5. Altere somente data, hora ou observações.
6. Salve e confirme que pacote/financeiro continuam preservados.

## Migration
Não exige migration.

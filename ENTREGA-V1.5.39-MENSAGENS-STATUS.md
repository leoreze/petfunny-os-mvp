# PetFunny OS v1.5.39 — Mensagens inteligentes por status

## O que foi implementado

- Ao alterar o status de um agendamento na Agenda, o sistema abre um modal com uma mensagem contextual gerada pelo Assistente Inteligente PetFunny.
- A mensagem usa dados reais do registro: tutor, pet, horário, serviço, pagamento e novo status.
- O modal permite revisar o texto antes do envio.
- Botões: Cancelar e Enviar WhatsApp.
- O menu de três pontinhos da Agenda ganhou a opção “Enviar mensagem”.
- A IA é híbrida/segura: gera sugestão local/contextual e abre o WhatsApp para o atendente revisar e enviar manualmente.

## Endpoint criado

GET /api/agenda/:id/status-message?status=novo_status

## Como testar

1. Acesse /admin/agenda.
2. Altere o status de um agendamento pela visão por status ou pelo menu.
3. Confira o modal com a sugestão de mensagem.
4. Clique em Enviar WhatsApp para abrir a conversa com o texto pronto.

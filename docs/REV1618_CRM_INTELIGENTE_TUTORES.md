# REV 1.6.18 — CRM Inteligente de Tutores

## O que foi ajustado

- `/admin/tutores` passa a exibir colunas de relacionamento comercial:
  - total de agendamentos;
  - último agendamento;
  - dias sem agendar;
  - status CRM automático.
- Backend de `/api/tutores` agora calcula os indicadores diretamente do banco.
- Menu 3 pontinhos da listagem ganhou mensagens CRM por perfil:
  - mensagem sugerida automática;
  - convite para primeiro agendamento;
  - retorno de cliente ativo;
  - reativação/saudade;
  - VIP recorrente.
- Mensagens usam o link oficial do App do Tutor:
  - `https://agendapetfunny.com.br/app`

## Régua de status CRM

- Novo lead: 0 agendamentos.
- Ativo: último agendamento até 30 dias.
- Recorrente: 3+ agendamentos e último até 45 dias.
- Em atenção: 46 a 60 dias sem agendar.
- Em risco: 61 a 90 dias sem agendar.
- Perdido: mais de 90 dias sem agendar.

## Banco

Não exige migration.

## Como testar

1. Acesse `/admin/tutores`.
2. Confira as novas colunas da listagem.
3. Abra o menu 3 pontinhos de um tutor.
4. Envie uma mensagem CRM pelo WhatsApp.
5. Confirme que a mensagem muda conforme o perfil do cliente.

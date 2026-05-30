# REV 1.6.12 — Health 360 Agenda Edit + Time Fix

## Ajustes
- Adicionada opção **Editar** no menu 3 pontinhos da aba Agenda em `/admin/saude-360`.
- Criado endpoint `PUT /api/admin/health360/slots/:id` para editar veterinário, início, duração, valor e status do horário.
- Corrigido envio de `datetime-local` para ISO no frontend, evitando gravação de horário diferente por diferença de timezone.
- Modal de horário agora abre preenchido ao editar.

## Banco
- Não exige migration.

# FunnyOS v1.6.78 — Transporte CEP + Táxi Pet no App e Admin

## O que foi feito

- `/app/agenda`: o transporte agora aparece em um card próprio com a opção **Precisa de Táxi Pet?**.
- `/app/agenda`: ao marcar Táxi Pet, se o tutor não tiver endereço completo, abre modal para cadastrar o endereço.
- `/app/agenda`: campo CEP com máscara `00000-000`.
- `/app/agenda`: ao digitar CEP, consulta a base ViaCEP e preenche rua, bairro, cidade e estado.
- `/admin/agenda`: mesmo fluxo de Táxi Pet no modal de agendamento.
- `/admin/agenda`: card próprio para transporte com cálculo do valor.
- `/admin/agenda`: se o tutor não tiver endereço, abre modal com CEP, rua, número, bairro, cidade e estado.
- `/admin/agenda`: CEP com máscara e preenchimento automático por ViaCEP.
- Backend: novo endpoint `GET /api/cep/:cep`.
- Backend: novo endpoint admin `GET /api/transport/estimate?tutorId=...`.
- Backend: novo endpoint `PATCH /api/tutores/:id/address` para salvar endereço do tutor pelo fluxo da agenda.
- Backend: agendamento manual do admin agora aceita transporte calculado e inclui no total.

## Observações

- Mantém Google Routes API quando `GOOGLE_MAPS_API_KEY` estiver configurada.
- Mantém fallback local por bairro/CEP quando Google falhar ou não estiver configurado.
- Não altera banco.
- Não precisa rodar migration.

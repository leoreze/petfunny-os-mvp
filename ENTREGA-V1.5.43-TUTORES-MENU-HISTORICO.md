# PetFunny OS v1.5.43 — Tutores: menu, histórico, pets e agendamento rápido

## O que foi feito
- Menu de três pontinhos funcional em cada tutor.
- Ações do menu:
  - Histórico;
  - Pets;
  - Agendar;
  - Mensagem sobre aplicativo;
  - Editar tutor;
  - Inativar.
- Histórico exibido como extrato de serviços utilizados.
- Filtro do histórico por pet.
- Modal de pets do tutor com listagem e cadastro rápido de novo pet.
- Ação Agendar direciona para o modal de Novo Agendamento já preenchido com o tutor.
- Página Agenda aceita querystring `?new=1&tutorId=...&petId=...` para abrir o modal pré-preenchido.

## Como testar
1. Rodar `npm install`.
2. Rodar `npm run db:migrate`.
3. Rodar `npm start`.
4. Acessar `/admin/tutores`.
5. Abrir o menu de três pontinhos de um tutor.
6. Testar Histórico, Pets, Mensagem do App e Agendar.

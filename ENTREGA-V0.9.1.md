# PetFunny OS v0.9.1 — Ajustes de Agenda

Base utilizada: `petfunny-os-v0.9-pacotes-assinaturas.zip`.

## Ajustes realizados

- Corrigido carregamento da Agenda para ficar mais consistente e menos pesado.
- O loading post-it com GIF foi reforçado na Agenda.
- A Agenda agora renderiza apenas a visão ativa: Dia, Semana ou Mês.
- Botões `Novo agendamento` e `Hoje` foram movidos para cima do calendário, fora de card.
- Incluída visão por status em formato board/kanban.
- Drag & drop entre colunas de status atualiza o status do agendamento.
- Os status do agendamento continuam vindo do cadastro em Configurações.
- As cores dos cards agora seguem a cor cadastrada no status da agenda.
- Cards da agenda receberam borda/faixa lateral com a cor do status.
- Eventos do calendário também usam a cor do status.
- Espaçamento vertical entre cards/seções foi reduzido para evitar buracos grandes.
- Mantidos Pacotes e Assinaturas da v0.9.

## Como rodar

```bash
npm install
npm run db:migrate
npm run db:seed
npm start
```

## Como testar

- Acesse `/admin/agenda`.
- Confira os botões acima do calendário.
- Teste as visões Dia, Semana e Mês.
- Crie um agendamento.
- Arraste o card entre as colunas de status.
- Confira se as cores seguem os status cadastrados em Configurações.

## Próxima versão sugerida

`petfunny-os-v1.0-financeiro.zip`

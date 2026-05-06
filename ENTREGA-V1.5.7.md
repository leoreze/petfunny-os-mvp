# PetFunny OS v1.5.7 — Dashboard UX e Copy Final

## O que foi feito

- Revisão da copy do Dashboard para linguagem final de produção.
- Remoção de mensagens técnicas visíveis como `/api/dashboard/summary`, PostgreSQL e dependência de integração.
- Redução do espaçamento vertical entre títulos, subtítulos e blocos.
- `Agenda do dia` agora ocupa uma linha própria.
- `Alertas` e `Insights` agora ficam lado a lado em uma linha própria.
- `Calendário` agora ocupa uma linha inteira.
- `Cards da agenda / Operação por cards` foi movido para dentro do card `Saúde da agenda`.
- Ajustes finos de hierarquia, espaçamento e legibilidade.

## Como rodar

```bash
npm install
npm run db:migrate
npm start
```

## Como testar

Acesse:

```txt
http://localhost:3000/admin/dashboard
```

Valide:

- Hero sem textos técnicos.
- Big numbers compactos.
- Agenda do dia em linha própria.
- Alertas e Insights em uma linha com dois cards.
- Calendário em linha inteira.
- Cards da agenda dentro de Saúde da agenda.

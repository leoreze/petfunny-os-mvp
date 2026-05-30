# FunnyOS v1.6.20 — Agendamento Antigo com Busca por WhatsApp

## Ajustes
- No modal **Agendamento antigo** em `/admin/agenda`, o campo **WhatsApp do tutor** agora aparece primeiro.
- Ao digitar ou sair do campo, o sistema busca o tutor pelo WhatsApp usando a rota já existente `/api/agenda/client-lookup`.
- Quando encontra o tutor, preenche automaticamente o combo de tutor e carrega os pets vinculados.
- Se existir apenas um pet, ele é selecionado automaticamente.
- Inclui feedback visual de busca, encontrado, não encontrado e erro.
- Mantém o fluxo atual de importação histórica, sem WhatsApp/push.

## Banco
- Sem migration.

## Como rodar
```bash
npm start
```

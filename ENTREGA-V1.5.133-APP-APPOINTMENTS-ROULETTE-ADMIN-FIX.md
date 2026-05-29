# FunnyOS v1.5.133 — App Appointments + Roleta Admin Fix

## Correções

- Corrigida a rota `/api/app/appointments` para responder corretamente em `POST` e também oferecer `GET` autenticado para listagem do app do tutor.
- Adicionado retorno 405 controlado para métodos não permitidos, evitando o erro genérico `Rota não encontrada`.
- Ajustada a leitura de mimos no admin para suportar bancos legados em que campos de data/status podem estar em formatos diferentes.
- A listagem do admin agora usa a mesma origem dos mimos ativos que aparecem no app do tutor, incluindo tabela `gifts` e tabelas legadas compatíveis.
- Mantido layout global e estrutura visual existentes.

## Arquivos alterados

- `backend/src/app.js`
- `ENTREGA-V1.5.133-APP-APPOINTMENTS-ROULETTE-ADMIN-FIX.md`

## Como aplicar

```bash
npm install
npm run db:migrate
npm start
```

## Testes recomendados

1. Abrir `/admin/roleta-de-mimos`.
2. Verificar se “Mimos configurados” lista os mesmos mimos que aparecem no app do tutor.
3. Criar, editar, inativar e excluir um mimo.
4. Abrir o app do tutor e criar agendamento com Pix ou Cartão.
5. Confirmar que `POST /api/app/appointments` não retorna mais `Rota não encontrada`.

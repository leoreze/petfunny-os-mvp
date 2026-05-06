# PetFunny OS v1.5.32 — Agenda, documentos e WhatsApp

## Correções aplicadas

- Corrigido menu de três pontinhos em agendamentos no calendário quando existem múltiplos registros no mesmo horário.
- Menu agora abre como dropdown flutuante, acima dos demais cards, sem ficar preso dentro do card do agendamento.
- Toasts agora aparecem acima de modais abertos.
- Link público da comanda agora usa o mesmo padrão visual dos documentos exibidos no modal.
- Recibo mantém o padrão visual de documento do sistema.
- Botão “Enviar WhatsApp” agora gera mensagem amigável com link da comanda ou recibo.

## Arquivos alterados

- frontend/pages/agenda/index.html
- frontend/assets/js/toast.js
- frontend/assets/css/app.css
- backend/src/app.js

## Como rodar

```bash
npm install
npm run db:migrate
npm start
```

## Como testar

1. Acesse `/admin/agenda`.
2. Abra um horário com dois agendamentos.
3. Clique nos três pontinhos do agendamento superior.
4. Verifique se o menu aparece acima dos cards, sem sobrepor de forma quebrada.
5. Abra Comanda ou Recibo.
6. Clique em Copiar link.
7. Abra o link público e compare o layout com o modal.
8. Clique em Enviar WhatsApp e confirme se a mensagem vem amigável com o link.

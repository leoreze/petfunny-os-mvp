# FunnyOS v1.6.30 — Sprint 3 Indique e Ganhe + Pacotes em Cards

## O que foi implementado
- Tabela `tutor_referrals` para indicações de tutores.
- Endpoints `/api/app/referrals`, `/api/app/referrals/share-link`.
- Pontuação automática de ossinhos ao registrar indicação.
- Nova seção `/app/indique` no menu Mais.
- Compartilhamento de link de indicação por WhatsApp.
- Contratação de pacotes no App do Tutor em cards selecionáveis.
- Pacotes filtrados pelo porte do pet selecionado.
- Cards com título, descrição, valor, sessões e economia estimada.

## Como rodar
```bash
npm run db:migrate
npm start
```

## Como testar
1. Abrir `/app/pacotes`.
2. Selecionar um pet.
3. Conferir se aparecem apenas pacotes compatíveis com o porte.
4. Selecionar um card de pacote.
5. Contratar via Pix/cartão.
6. Abrir `/app/indique`.
7. Registrar indicação e testar link/WhatsApp.

## Observações
- Financeiro 360, agenda, pacotes existentes e pagamentos foram preservados.
- A conversão da indicação para ossinhos adicionais fica preparada para evolução quando o indicado fizer o primeiro agendamento/pagamento.

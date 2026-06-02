# FunnyOS v1.6.44 — Pacotes Antigos com Reconstrução de Histórico

## O que foi implementado
- Venda de Pacote Antigo agora reconstrói automaticamente as sessões do pacote a partir da data e horário de contratação.
- Sessões com data anterior ao momento atual são criadas como `finalizado`.
- Sessões futuras são criadas como `agendado`.
- O progresso do pacote é recalculado após a geração das sessões.
- O valor do pacote antigo continua manual, sem puxar preço/desconto do pacote base.
- O pacote escolhido continua servindo como referência operacional para quantidade de sessões, intervalo e serviços.

## Regra
- 4+ agendamentos/mês: intervalo de 7 dias.
- 2 agendamentos/mês: intervalo de 15 dias.
- Demais casos: intervalo de 30 dias.

## Arquivos principais alterados
- `backend/src/app.js`
- `package.json`
- `backend/package.json`

## Como testar
1. Acesse `/admin/pacotes`.
2. Clique em `Pacote antigo`.
3. Busque tutor por WhatsApp.
4. Escolha pet e pacote.
5. Informe data/hora antiga e valor manual.
6. Salve.
7. Verifique em `/admin/agenda` se as sessões foram criadas.
8. Sessões passadas devem aparecer como finalizadas; futuras como agendadas.
9. Verifique o progresso no pacote vendido.

## Comandos
```bash
npm start
```

Sem migration obrigatória.

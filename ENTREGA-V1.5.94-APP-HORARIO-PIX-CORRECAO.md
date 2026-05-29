# PetFunny OS v1.5.94 — Correção de horário do app antes do Pix

## Correção

Corrigido o erro em `POST /api/app/appointments` que retornava:

```txt
Horário fora do funcionamento configurado.
```

O problema acontecia porque o app enviava o horário local selecionado pelo tutor, mas o backend convertia para ISO/UTC antes da validação do slot. Em alguns ambientes, principalmente produção/Render ou Windows com timezone diferente, o horário podia virar outro horário na validação.

## O que foi ajustado

- O backend agora preserva o horário local escolhido no app para validar contra Configurações.
- O backend converte o horário de São Paulo para UTC somente para gravar/processar pagamento.
- O intent de Pix agora guarda também `startsAtLocal`.
- A confirmação do Pix também valida usando o horário local original.
- `getLocalSlotParts()` agora diferencia horário local sem timezone de ISO com `Z` ou offset.
- Service Worker atualizado para `petfunny-app-v1.5.94`, evitando cache antigo no app.

## Arquivos alterados

- `backend/src/app.js`
- `frontend/service-worker.js`

## Como testar

1. Reinicie o servidor.
2. Acesse `/app/login`.
3. Entre no app.
4. Vá em Agenda.
5. Escolha uma data e um horário disponível no combo.
6. Clique para criar o agendamento.
7. O Pix deve abrir sem retornar erro de horário fora do funcionamento.

Se o navegador estiver com cache antigo, remova o Service Worker em DevTools > Application > Service Workers > Unregister e recarregue.

## Migration

Não precisa rodar migration.

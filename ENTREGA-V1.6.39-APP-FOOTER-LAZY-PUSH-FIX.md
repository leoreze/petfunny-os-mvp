# FunnyOS v1.6.39 — App Footer + Lazy Home + Momentos + Push IA

## Implementado
- Footer principal do App do Tutor com fundo rosa salmão.
- Itens do footer em linha: ícone à esquerda e texto completo à direita.
- Home com carregamento progressivo conforme rolagem.
- `/app/momentos` com avatar do pet pequeno e redondo.
- Ao clicar em links do App, o modal de carregamento abre antes da navegação.
- Endpoint `/api/app/ai-push-reminder` para enviar lembretes push das mensagens/insights gerados pela IA, com proteção contra duplicidade diária.

## Como rodar
```bash
npm start
```

## Observação
Push depende de VAPID e inscrição do tutor no PWA. Sem configuração, o evento fica seguro e não quebra o App.

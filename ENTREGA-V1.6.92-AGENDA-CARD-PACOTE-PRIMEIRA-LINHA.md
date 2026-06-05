# FunnyOS v1.6.92 — Agenda card mostra progresso de pacote na primeira linha

## Correção

- Ajustado o card da agenda para exibir o badge de pacote na primeira linha do card, ao lado do horário e nome do pet.
- O badge agora fica visível antes do menu de ações `⋯`, mesmo quando o nome do pet é grande.
- Adicionado fallback no frontend para extrair `1 de 4`, `2 de 4` etc. das observações/descrição quando registros antigos não vierem com `packageSessionLabel`.

## Arquivos alterados

- `frontend/pages/agenda/index.html`
- `frontend/assets/css/app.css`
- `package.json`
- `backend/package.json`
- `package-lock.json`
- `backend/package-lock.json`
- `DEPLOY_VERSION.txt`

## Como testar

1. Acesse `/admin/agenda`.
2. Confira cards de agendamentos vinculados a pacotes.
3. Na primeira linha, deve aparecer algo como: `09:00 · Amora 📦 1 de 4`.
4. O menu `⋯` continua no canto direito, sem esconder a contagem do pacote.

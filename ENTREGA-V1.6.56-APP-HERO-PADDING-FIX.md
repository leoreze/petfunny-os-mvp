# FunnyOS v1.6.56 — App Tutor Hero Padding Fix

## O que foi feito

- Ajustado o card hero em `/app/home`, `/app/agenda` e `/app/agendamentos`.
- Adicionado respiro inferior de 10px nos cards hero para evitar sobreposição com o card abaixo.
- Removidos botões dos cards hero internos do app.
- Removida a exibição do nome do tutor nos cards hero.
- Garantido subtítulo visível no hero da Agenda.
- Mantidos header/footer fixos do PWA e scroll apenas no miolo.

## Arquivos principais alterados

- `frontend/assets/js/client-shell.js`
- `frontend/pages/app/home/index.html`
- `frontend/assets/css/app.css`

## Banco

- Não altera banco.
- Não precisa rodar migration.

## Como rodar

```bash
npm install
npm start
```

## Como testar

- Abrir `/app/home`.
- Abrir `/app/agenda`.
- Abrir `/app/agendamentos`.
- Conferir que o hero não tem botões nem nome do tutor.
- Conferir que o subtítulo aparece e o card abaixo não sobrepõe o hero.

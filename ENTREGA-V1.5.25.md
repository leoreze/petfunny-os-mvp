# PetFunny OS v1.5.25 — Sidebar rollback seguro

## Correção

Esta versão reverte o ajuste agressivo da v1.5.24 que desconfigurou o layout.

## O que foi mantido

- Base visual da v1.5.23.
- Menu recolhido um pouco mais largo, agora com 104px.
- Ícones centralizados.
- Sidebar com comportamento estável usando `sticky`, sem `fixed` agressivo.
- Mobile preservado.

## Como testar

```bash
npm install
npm run db:migrate
npm start
```

Depois abrir qualquer página administrativa, recolher o menu pela logo e rolar a página.

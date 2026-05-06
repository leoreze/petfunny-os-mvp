# PetFunny OS v1.5.18 — Tutores UI/UX e Loading

## O que foi feito

- Corrigido o comportamento de navegação para preservar o modal de carregamento quando `buildShell()` recria o corpo da página.
- A página de Tutores agora mantém o loading aberto até carregar os dados reais do banco e renderizar a lista.
- Copywriting da página de Tutores revisado para produção, sem mensagens técnicas como PostgreSQL/CRUD.
- Big numbers ajustados para métricas mais relevantes: tutores carregados, pets vinculados e último atendimento.
- Cabeçalhos da tabela agora possuem ordenação funcional com setas.
- Scroll incremental agora usa a rolagem da página, evitando dupla barra vertical.
- Filtros da consulta foram mantidos em layout mais operacional e responsivo.

## Arquivos alterados

- `frontend/pages/tutores/index.html`
- `frontend/assets/js/shell.js`
- `frontend/assets/css/app.css`
- `package.json`
- `backend/package.json`

## Como testar

```bash
npm install
npm run db:migrate
npm start
```

Acesse:

```txt
http://localhost:3000/admin/tutores
```

Valide:

- O loading abre ao clicar no menu Tutores e fecha apenas após os dados aparecerem.
- Não há duas barras verticais de rolagem.
- A lista carrega mais registros ao rolar a página.
- As setas dos cabeçalhos ordenam os registros carregados.

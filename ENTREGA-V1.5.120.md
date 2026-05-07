# PetFunny OS v1.5.120 — Header com fundo ao rolar e hero franquias transparente

## O que foi ajustado
- Hero da página `/franquias` sem fundo/card, deixando a área transparente.
- Header/nav da landing principal `/` e da landing `/franquias` com fundo branco arredondado quando a página é rolada.
- Header/nav permanece sticky no topo durante a rolagem.
- Post-it da logo no header aumentado, mantendo o tamanho atual da logo.
- Reforço para a página `/franquias` usar apenas a rolagem principal da página.

## Arquivos alterados
- `frontend/assets/css/app.css`
- `frontend/assets/js/landing.js`
- `package.json`
- `backend/package.json`
- `DEPLOY_VERSION.txt`

## Como testar
```bash
npm start
```

Acesse:
- `http://localhost:3000/`
- `http://localhost:3000/franquias`

Role as duas páginas e valide o fundo branco arredondado no header.

## Observação
Não precisa rodar migration nesta versão.

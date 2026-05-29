# Entrega v1.5.124 — Franquias: rolagem única e hero sem padding

## Versão entregue
petfunny-os-v1.5.124-franquias-rolagem-unica-hero-sem-padding.zip

## O que foi ajustado
- Reforçada a página `/franquias` para usar somente a rolagem principal do documento.
- Removido o scroll interno do `body.franchise-body`, deixando o `html` como elemento de rolagem.
- Mantidos wrappers da página com `overflow: visible` para não criar barra interna.
- Removido o padding da área do card hero da página `/franquias`.
- Mantido o hero transparente, sem fundo, borda ou sombra.

## Arquivos alterados
- `frontend/assets/css/app.css`
- `package.json`
- `backend/package.json`
- `DEPLOY_VERSION.txt`

## Como testar
```bash
npm start
```

Acesse:
- `http://localhost:3000/franquias`

## Observações
- Não precisa rodar migration.
- A correção é exclusivamente visual/CSS.

# Entrega v1.5.117 — Franquias: correção de barra de rolagem duplicada

## O que foi ajustado

- Corrigida a landing `/franquias` para usar apenas uma barra de rolagem vertical.
- Removido scroll interno herdado de wrappers/admin/shell na página de franquias.
- Mantida a rolagem nativa do navegador como única fonte de scroll.
- Mantido o layout, imagens, seções, CTA e identidade visual da landing de franquias.

## Arquivo alterado

- `frontend/assets/css/app.css`

## Como testar

1. Inicie o projeto normalmente.
2. Acesse `http://localhost:3000/franquias`.
3. Verifique se aparece apenas uma barra de rolagem vertical na lateral da janela.
4. Role a página até o final e confirme que hero, seções, galeria, CTA e footer continuam visíveis.

## Observação

A correção foi aplicada de forma isolada usando o seletor `body.franchise-body`, sem afetar o admin, app do tutor ou landing principal.

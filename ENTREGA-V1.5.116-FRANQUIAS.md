# Entrega v1.5.116 — Landing de Franquias PetFunny

## O que foi feito
- Criada uma seção `Franquias PetFunny para bairros` na landing principal.
- Criada uma landing exclusiva em `/franquias` para apresentação comercial do modelo de franquia PetFunny.
- Incluídas imagens conceituais 3D do modelo de franquia: fachada, loja interna, recepção/produtos, área de banho e tosa, corredor e sala de banho.
- Adicionado conteúdo comercial com diferenciais do PetFunny OS: agenda, App do Tutor, pacotes, assinaturas, financeiro, comandas, recibos, CRM, marketing, PetFunny 360, roleta de mimos e dashboard.
- Adicionada rota backend para `/franquias`, `/franquias-petfunny` e `/franchise`.
- Criados estilos responsivos e premium no CSS global, sem remover funcionalidades existentes.

## Arquivos principais alterados
- `frontend/index.html`
- `frontend/pages/franquias/index.html`
- `frontend/assets/css/app.css`
- `backend/src/app.js`

## Arquivos de imagem adicionados
- `frontend/assets/img/landing/franquias/franquia-fachada-3d.webp`
- `frontend/assets/img/landing/franquias/franquia-loja-interna-3d.webp`
- `frontend/assets/img/landing/franquias/franquia-banho-tosa-3d.webp`
- `frontend/assets/img/landing/franquias/franquia-recepcao-produtos-3d.webp`
- `frontend/assets/img/landing/franquias/franquia-corredor-loja-3d.webp`
- `frontend/assets/img/landing/franquias/franquia-sala-banho-3d.webp`

## Como testar
1. Rodar o projeto normalmente com `npm start`.
2. Abrir `http://localhost:3000/` e verificar a nova seção de franquias na landing principal.
3. Clicar em `Ver landing de franquias`.
4. Abrir diretamente `http://localhost:3000/franquias`.
5. Conferir responsividade no mobile.

## Observações
- As imagens 3D são conceituais para apresentação do modelo de franquia e não substituem projeto arquitetônico executivo.
- A página não depende de API externa, IA, WhatsApp API ou banco para carregar.

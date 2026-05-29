# Entrega v0.6.1 — Configurações do Sistema

## Versão entregue
petfunny-os-v0.6.1-configuracoes.zip

## O que foi feito
- Configurações centrais do comércio PetFunny.
- Campos para WhatsApp, telefone, e-mail, endereço, redes sociais e presença digital.
- Campos de SEO para a landing page: título, descrição, palavras-chave, imagem social, headline e subheadline.
- Endpoint público `/api/public/site` para a landing consumir os dados.
- Cadastros-base de pets: tipos, portes e raças.
- A página de Pets agora consulta opções configuráveis para tipo, porte e raça.
- Migration sem tenant e sem DDL em runtime.
- Seed idempotente com dados iniciais de configurações.

## Endpoints principais
- GET /api/public/site
- GET /api/configuracoes
- PUT /api/configuracoes/business
- GET /api/configuracoes/pet-options
- POST /api/configuracoes/pet-types
- PUT /api/configuracoes/pet-types/:id
- DELETE /api/configuracoes/pet-types/:id
- POST /api/configuracoes/pet-sizes
- PUT /api/configuracoes/pet-sizes/:id
- DELETE /api/configuracoes/pet-sizes/:id
- POST /api/configuracoes/pet-breeds
- PUT /api/configuracoes/pet-breeds/:id
- DELETE /api/configuracoes/pet-breeds/:id

## Como rodar
1. npm install
2. npm run db:migrate
3. npm run db:seed
4. npm start

## Como testar
- /admin/configuracoes
- /admin/pets
- /
- /api/public/site

## Observações
- O sistema continua exclusivo do PetFunny, sem tenant, sem SaaS e sem master admin.
- As integrações externas seguem opcionais.

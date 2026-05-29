# Entrega v0.6 — Tutores e Pets

## Versão entregue
petfunny-os-v0.6-tutores-pets.zip

## O que foi feito
- Implementado CRUD real de tutores.
- Implementado CRUD real de pets.
- Criado vínculo obrigatório tutor/pet.
- Criada busca por nome, WhatsApp, e-mail, pet e raça.
- Criados filtros por status e porte.
- Criado scroll incremental nas listagens.
- Criadas telas administrativas premium para Tutores e Pets.
- Criados formulários com máscaras, validação visual e modais com header/footer fixos.
- Seeds ampliados com tutores e pets de demonstração.
- Mantido sem tenant, sem SaaS, sem master admin e sem DDL em runtime.

## Endpoints adicionados
- GET /api/tutores
- GET /api/tutores/:id
- POST /api/tutores
- PUT /api/tutores/:id
- DELETE /api/tutores/:id
- GET /api/tutores/:id/pets
- GET /api/pets
- GET /api/pets/:id
- POST /api/pets
- PUT /api/pets/:id
- DELETE /api/pets/:id

## Arquivos principais alterados
- backend/src/app.js
- backend/src/scripts/migrate.js
- backend/src/scripts/seed.js
- frontend/pages/tutores/index.html
- frontend/pages/pets/index.html
- frontend/assets/css/app.css
- package.json
- backend/package.json

## Como rodar
1. npm install
2. npm run db:migrate
3. npm run db:seed
4. npm start

## Como testar
- Acesse /admin/login.
- Entre com admin@petfunny.local e PetFunny@2026.
- Acesse /admin/tutores.
- Cadastre, edite, busque e inative um tutor.
- Acesse /admin/pets.
- Cadastre, edite, busque e inative um pet vinculado a um tutor.
- Confirme que o dashboard continua carregando.

## Observações
- O delete é soft delete: os registros são inativados com deleted_at.
- O WhatsApp é normalizado no backend para uso consistente no banco.
- As telas não dependem de IA, WhatsApp externo ou Mercado Pago para carregar.

## Próxima versão
petfunny-os-v0.7-servicos.zip

# PetFunny OS v0.7 — Serviços

## O que foi feito
- Implementado módulo real de Serviços.
- Tipos de serviço agora vêm de Configurações (`service_categories`).
- Portes agora vêm de Configurações (`pet_sizes`).
- Cadastro/edição de serviço com tipo, porte, preço, duração, descrição e status.
- Listagem com filtros por busca, tipo, porte e status.
- Scroll incremental na listagem.
- Cards premium de serviços com menu de três pontinhos.
- Modal loading aplicado no carregamento e nas operações de salvar/inativar.
- Mantidos os loadings globais em Tutores e Pets.
- Mantido sem tenant, sem SaaS e sem master admin.

## Endpoints adicionados
- `GET /api/servicos/options`
- `GET /api/servicos`
- `GET /api/servicos/:id`
- `POST /api/servicos`
- `PUT /api/servicos/:id`
- `DELETE /api/servicos/:id`

## Como rodar
```bash
npm install
npm run db:migrate
npm run db:seed
npm start
```

## Como testar
- `/admin/servicos`
- `/admin/configuracoes`
- Criar tipo de serviço em Configurações.
- Criar porte em Configurações.
- Cadastrar serviço usando o tipo e o porte cadastrados.

## Próxima versão
- `petfunny-os-v0.8-agenda.zip`

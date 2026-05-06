# Entrega v0.3.2 — Correção seed/auth

## Correções
- Removido `generate_series('08:00'::time, '17:30'::time, interval '30 minutes')`, incompatível no PostgreSQL.
- Slots de capacidade agora são gerados em JavaScript e inseridos com casts explícitos.
- Seed agora atualiza também `password_hash` do admin em `ON CONFLICT (email)`, evitando 401 quando já existe usuário antigo com senha diferente.
- Mantida autenticação JWT, token único `petfunny_token`, visual aprovado e sem tenant/SaaS.

## Como rodar
```bash
npm install
npm run db:migrate
npm run db:seed
npm start
```

## Login dev
- Email: admin@petfunny.local
- Senha: PetFunny@2026

## Observação
O aviso `npm warn Unknown global config "python"` vem da configuração global do npm da máquina e não impede o projeto de funcionar.

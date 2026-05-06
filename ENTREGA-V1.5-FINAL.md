# Entrega — petfunny-os-v1.5-final.zip

## O que foi feito

- Consolidação final da versão reconstruída do PetFunny OS.
- Atualização de versão para `1.5.0`.
- README final completo.
- Checklist final de testes manuais.
- Instruções de GitHub e Render.
- Revisão de comandos raiz.
- Preservação dos ajustes críticos anteriores:
  - notificações corrigidas;
  - relatórios defensivos;
  - API path fix;
  - documentos/comandas/recibos com fallback de dados do comércio;
  - IA global opcional.

## Como rodar

```bash
npm install
npm run db:migrate
npm run db:seed
npm start
```

## Como testar

Acesse:

```txt
http://localhost:3000/admin/login
```

Login dev:

```txt
admin@petfunny.local
PetFunny@2026
```

## Observações

- O sistema continua sem depender de API externa para carregar.
- OpenAI permanece opcional.
- Migrations continuam sob comando dedicado.
- O projeto está pronto para validação final local e deploy.

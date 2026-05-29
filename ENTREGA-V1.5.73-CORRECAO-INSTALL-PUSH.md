# PetFunny OS v1.5.73 — Correção de instalação do Push/PWA

## Problema corrigido
O `npm install` podia ficar preso no spinner por causa do `postinstall` da raiz chamando outro `npm install` dentro de `backend`.

O aviso `npm warn Unknown global config "python"` é apenas uma configuração global antiga do npm no Windows e não impede o sistema de rodar.

## Alterações
- Removido `postinstall` automático da raiz.
- Criado comando explícito `npm run install:backend`.
- Criado comando `npm run setup` para instalar raiz + backend sem audit/fund.
- Trocado `npx web-push generate-vapid-keys` por script local `node src/scripts/generateVapidKeys.js`, evitando espera/download pelo `npx`.
- Criado `npm run doctor:install` para diagnosticar dependências do backend.

## Como rodar

```bash
npm install --ignore-scripts --no-audit --no-fund
npm run install:backend
npm run db:migrate
npm start
```

Ou:

```bash
npm run setup
npm run db:migrate
npm start
```

## Gerar chaves push

```bash
npm run push:keys
```

## Observação Windows
Se continuar aparecendo:

```txt
npm warn Unknown global config "python"
```

rode opcionalmente:

```bash
npm config delete python -g
```

Isso só limpa o aviso. Não é obrigatório para o PetFunny OS funcionar.

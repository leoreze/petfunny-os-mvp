# PetFunny OS v1.5.77 — Correção web-push/asn1.js

## Problema corrigido
O backend podia iniciar com o aviso:

```txt
[push] pacote web-push indisponível: Cannot find module 'asn1.js'
```

Isso acontece quando o pacote `web-push` é instalado, mas suas dependências transitivas não ficam completas no `backend/node_modules`, especialmente em instalações interrompidas no Windows/Node 24.

## Correções
- Declaradas explicitamente no `backend/package.json` as dependências usadas pelo `web-push`:
  - `asn1.js`
  - `http_ece`
  - `https-proxy-agent`
  - `jws`
  - `minimist`
- Criado comando de reparo:

```bash
npm run push:repair
```

- Criado diagnóstico específico:

```bash
npm run doctor:push
```

- Atualizado `doctor:install` para checar a cadeia completa do push.

## Como corrigir no ambiente local
Na raiz do projeto:

```bash
npm run push:repair
npm run doctor:push
npm start
```

Se o npm continuar estranho, rode limpeza manual:

```bash
cd backend
rmdir /s /q node_modules
npm install --no-audit --no-fund
cd ..
npm run doctor:push
npm start
```

## Observação
As chaves VAPID continuam necessárias no `.env`:

```env
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:contato@petfunny.com.br
```

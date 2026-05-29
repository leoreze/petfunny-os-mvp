# REV140 — Render / GitHub merge conflicts clean

## O que foi corrigido
- Removidos conflitos de merge (marcadores de conflito do Git) em arquivos críticos.
- Corrigidos `package.json` raiz e `backend/package.json` para JSON válido.
- Atualizado `package-lock.json` raiz para a versão 1.5.139.
- Removido `backend/.env` real do pacote.
- Removidos ZIPs antigos dentro do projeto.
- Mantidos scripts de Render via `npm run render:build`.

## Validações feitas
- `node --check backend/src/app.js`
- `node --check backend/src/scripts/migrate.js`
- `node --check backend/src/scripts/reset.js`
- Busca por conflitos remanescentes retornou vazia.

## Render
Build Command:
```bash
npm run render:build
```

Start Command:
```bash
npm start
```

## GitHub
Subir a pasta limpa com:
```bash
git add .
git commit -m "v1.5.140 remove conflitos para deploy Render"
git push origin main
```

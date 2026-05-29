# PetFunny OS v1.5.74 — Correção VAPID Keys

## Correção
- O comando `npm run push:keys` não depende mais do pacote `web-push` para gerar as chaves VAPID.
- O script agora usa `crypto` nativo do Node.js para gerar par de chaves P-256 compatível com Web Push.
- Melhorado `doctor:install` para detectar quando o pacote `web-push` existe, mas está instalado de forma incompleta/corrompida.

## Comandos
Na raiz:

```bash
npm run push:keys
```

Ou dentro do backend:

```bash
npm run push:keys
```

Se o envio real de push acusar pacote quebrado:

```bash
cd backend
npm install web-push@3.6.7 --save --no-audit --no-fund
cd ..
npm start
```

## Observação
O aviso `npm warn Unknown global config "python"` não bloqueia o projeto. Para remover:

```bash
npm config delete python -g
```

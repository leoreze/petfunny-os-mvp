# Entrega v1.4.5 — Correção de chamadas /api/api

## Correção
- Corrigido bug em que páginas como CRM chamavam endpoints como `/api/api/crm/options`.
- A camada `frontend/assets/js/api.js` agora normaliza caminhos que já começam com `/api/`, evitando duplicação automática.

## Impacto
- Corrige CRM sem precisar alterar cada página isoladamente.
- Previne regressões em Pacotes, Assinaturas, Roleta e outras páginas que ainda chamavam `api.get('/api/...')`.
- Mantém compatibilidade com chamadas corretas como `api.get('/crm/options')`.

## Teste técnico
- `node --check backend/src/app.js`
- `node --check frontend/assets/js/api.js`

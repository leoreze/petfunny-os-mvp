# FunnyOS v1.6.97 — Avaliações com ações em 3 pontinhos e sem seta azul

## O que foi feito

- Removida a seta azul visual dos headers ordenáveis da tela `/admin/avaliacoes`.
- Mantida a ordenação ao clicar nos nomes das colunas.
- A coluna **Ações** agora usa botão de **3 pontinhos**.
- O menu de ações contém:
  - **Copiar link**
  - **Enviar WhatsApp**
- O menu fecha ao clicar fora ou pressionar `Esc`.
- Se o tutor não tiver WhatsApp, o sistema mostra aviso amigável.

## Arquivos alterados

- `frontend/pages/avaliacoes/index.html`
- `frontend/assets/css/app.css`
- `package.json`
- `backend/package.json`
- `package-lock.json`
- `backend/package-lock.json`
- `DEPLOY_VERSION.txt`

## Como testar

1. Subir o projeto localmente.
2. Acessar `http://localhost:3000/admin/avaliacoes`.
3. Conferir que as setas azuis não aparecem mais no header.
4. Clicar nos nomes das colunas para testar a ordenação.
5. Na coluna **Ações**, clicar no botão `⋯`.
6. Testar **Copiar link**.
7. Testar **Enviar WhatsApp**.

## Observação

Esta versão não altera o backend da tela de avaliações. A mudança é de interface e comportamento da listagem.

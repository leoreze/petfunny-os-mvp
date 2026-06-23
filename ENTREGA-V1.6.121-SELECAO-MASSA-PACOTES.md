# PetFunny OS v1.6.121 — Seleção em massa + Pacotes por card

## O que foi ajustado
- Removida a seta azul duplicada da coluna de checkbox em `/admin/saude-360`.
- Adicionada primeira coluna de checkbox em `/admin/tutores`, `/admin/pets`, `/admin/servicos` e `/admin/pacotes`.
- Adicionada barra de seleção em massa com opção de limpar seleção e apagar/inativar selecionados.
- Em `/admin/pacotes`, adicionados os botões `Pacotes Vendidos` e `Consulta de pacotes`, exibindo somente o card escolhido.
- Ajustado CSS compartilhado para checkbox, barra de ações em massa e alternância dos cards de pacotes.
- Corrigido `backend/package-lock.json` para usar registry público do npm, evitando lentidão/falha no Render por registry interno.

## Arquivos alterados
- `frontend/assets/css/app.css`
- `frontend/pages/saude-360/index.html`
- `frontend/pages/tutores/index.html`
- `frontend/pages/pets/index.html`
- `frontend/pages/servicos/index.html`
- `frontend/pages/pacotes/index.html`
- `package.json`
- `package-lock.json`
- `backend/package.json`
- `backend/package-lock.json`
- `DEPLOY_VERSION.txt`

## Validação realizada
- `node --check backend/src/app.js`
- `node --check backend/src/server.js`
- Sintaxe dos scripts inline de `/admin/tutores`, `/admin/pets`, `/admin/servicos`, `/admin/pacotes` e `/admin/saude-360`.
- Validação JSON de `backend/package-lock.json`.

## Observação
A exclusão em massa usa os mesmos endpoints individuais existentes, preservando as regras atuais de histórico/inativação do sistema.

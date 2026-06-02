# FunnyOS v1.6.40 — App Meu Pet Quick Access + Timeline Infinite Scroll Fix

## O que foi ajustado
- Na Home do App, a seção **Acessos rápidos** agora fica acima dos avisos/notificações.
- Big numbers ficam logo abaixo dos acessos rápidos.
- Removida a lógica de carregamento progressivo de todos os cards da Home.
- Mantida uma única rolagem principal na página.
- O scroll infinito agora fica apenas na **Timeline do cuidado**.
- Em `/app/momentos`, a foto do pet na Timeline do cuidado fica pequena e arredondada.

## Arquivos principais alterados
- `frontend/pages/app/home/index.html`
- `frontend/assets/css/app.css`
- `DEPLOY_VERSION.txt`

## Como rodar
```bash
npm start
```

## Observação
Sem migration de banco.

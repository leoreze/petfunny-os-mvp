# Entrega v1.5.119 — Ajustes Franquias, App do Tutor e Agenda

## Versão entregue
petfunny-os-v1.5.119-ajustes-franquias-app-agenda.zip

## O que foi ajustado
- Logo do header da landing reduzida para caber melhor dentro do post-it.
- CTA principal do topo da landing alterado para **Agendar**, apontando para o App do Tutor.
- Card **Franquias PetFunny para bairros** na landing principal recebeu fundo completo no título/kicker.
- Texto principal do card de franquias na landing foi reduzido.
- Página `/franquias` recebeu texto de hero mais curto e direto.
- Visual do hero de `/franquias` ganhou stack extra de fotos e chips flutuantes ao lado da imagem principal.
- Correção reforçada para a página `/franquias` trabalhar com uma única rolagem principal.
- Espaçamento vertical de 20px entre cards das seções de franquias.
- App do Tutor recebeu máscaras automáticas para inputs de formulários, incluindo WhatsApp, CEP, UF, código, horário, percentual e valores quando detectáveis.
- Admin Agenda recebeu botão/ícone de calendário ao lado do campo Data base; ao clicar, abre o seletor nativo de data.

## Arquivos principais alterados
- frontend/index.html
- frontend/pages/franquias/index.html
- frontend/pages/agenda/index.html
- frontend/assets/css/app.css
- frontend/assets/js/shell.js
- frontend/assets/js/client-shell.js
- package.json
- backend/package.json
- DEPLOY_VERSION.txt

## Como rodar
```bash
npm start
```

## Como testar
- Acesse `http://localhost:3000/` e confira o header, a logo menor e o botão **Agendar**.
- Confira a seção **Franquias PetFunny para bairros** na landing principal.
- Acesse `http://localhost:3000/franquias` e valide que existe somente uma barra de rolagem principal.
- Confira o hero da página de franquias com texto menor, fotos extras e chips flutuantes.
- Acesse o App do Tutor e teste formulários com WhatsApp, UF, código e campos numéricos.
- Acesse `http://localhost:3000/admin/agenda` e clique no ícone de calendário no filtro Data base.

## Observações
- Não precisa rodar migration para esta versão.
- Ajustes concentrados em HTML, CSS e JavaScript frontend.

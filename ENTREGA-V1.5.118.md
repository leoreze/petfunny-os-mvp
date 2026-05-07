# PetFunny OS v1.5.118 — Franquias Landing Ajustes

## Versão entregue
petfunny-os-v1.5.118-franquias-landing-ajustes.zip

## O que foi ajustado
- Melhorada a seção Franquias na landing principal `/`.
- Copywriting mais comercial e direto para conversão.
- Novo visual com post-its, cards flutuantes, imagem 3D da unidade, CTAs mais fortes e diferenciais do modelo.
- Melhorada a página `/franquias`.
- Hero da franquia mais premium, com mascote, prova visual, tags de diferenciais e foco em unidade de bairro + sistema próprio.
- Adicionada seção Playbook de operação.
- Adicionado painel explicando o PetFunny OS como diferencial da franquia.
- Mantida a correção de uma única rolagem da versão anterior.
- Mantido padrão visual PetFunny: salmão, turquesa, branco e grafite.

## Arquivos principais alterados
- `frontend/index.html`
- `frontend/pages/franquias/index.html`
- `frontend/assets/css/app.css`
- `package.json`
- `backend/package.json`
- `DEPLOY_VERSION.txt`

## Como rodar
```bash
npm start
```

## Como testar
- Acesse `http://localhost:3000/`
- Acesse `http://localhost:3000/franquias`
- Confirme se existe apenas uma barra de rolagem na página `/franquias`.
- Confirme se os CTAs abrem corretamente a landing ou o WhatsApp.

## Observações
- Não precisa rodar migration para esta versão.
- Alteração focada em HTML, CSS e metadados de versão.

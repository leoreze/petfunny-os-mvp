# PetFunny OS v1.5.26 — Sidebar fixa segura

## O que foi ajustado
- Sidebar fixa no desktop sem quebrar o layout.
- Área principal compensa automaticamente a largura do menu aberto/recolhido.
- Menu recolhido mais largo para não cortar ícones.
- Ícones centralizados no estado recolhido.
- Rolagem interna do menu ajustada para a altura total da tela.
- Mobile preservado com menu lateral sobreposto.

## Como testar
1. `npm install`
2. `npm run db:migrate`
3. `npm start`
4. Acesse qualquer rota `/admin/*`.
5. Role a página: o menu deve permanecer fixo.
6. Clique na logo para recolher/expandir: o conteúdo não deve sobrepor nem quebrar.

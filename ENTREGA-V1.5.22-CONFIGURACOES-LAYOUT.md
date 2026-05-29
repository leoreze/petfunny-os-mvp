# PetFunny OS v1.5.22 — Configurações Layout Fix

## O que foi corrigido
- Ajustado o layout da página `/admin/configuracoes` para não cortar conteúdo.
- Criada classe de página `configuracoes-page` para regras específicas sem afetar outros módulos.
- Corrigidos overflow, largura máxima, grid de formulários, cards de configuração e matriz de slots.
- Mantida uma única rolagem principal da página.
- A matriz de slots preserva rolagem horizontal própria apenas para a tabela larga de horários.

## Como testar
1. `npm install`
2. `npm run db:migrate`
3. `npm start`
4. Acesse `http://localhost:3000/admin/configuracoes`

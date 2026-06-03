# FunnyOS v1.6.58 — App Tutor Hero + Loading Fix

## O que foi feito

- Home do App do Tutor reorganizada para exibir o card hero como primeiro bloco.
- Ajustado padding inferior dos cards hero para evitar sobreposição com o conteúdo abaixo.
- Ajustado hero de `/app/agenda`, `/app/agendamentos` e `/app/pets` para manter o subtítulo dentro do card.
- CTA “Indique e ganhe” ganhou altura maior e padding inferior no subtítulo.
- Carregamento das telas do app otimizado com:
  - busca paralela de `/app/me`, `/app/summary` e `/app/options`;
  - cache de opções em `sessionStorage` por 10 minutos;
  - timeout seguro para opções lentas;
  - fechamento do loading mais rápido após renderização.
- Barra de rolagem visual mantida oculta no miolo do app.

## Banco de dados

Não altera banco. Não precisa rodar migration.

## Como rodar

```bash
npm install
npm start
```

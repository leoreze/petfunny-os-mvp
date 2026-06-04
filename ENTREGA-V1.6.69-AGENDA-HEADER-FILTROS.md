# FunnyOS v1.6.69 — Agenda Header com Filtros Integrados

## O que foi feito

- Removido o card **Filtros rápidos** da página `/admin/agenda`.
- Movida seleção de data para o header do calendário usando botão com ícone de calendário.
- Botão **Hoje** posicionado ao lado do ícone de calendário.
- Campo **Busca rápida** posicionado ao lado do botão **Hoje**.
- Removidas as informações visuais **Arraste no calendário** e **Slots de 1h** do header do calendário.
- Botões **Dia**, **Semana** e **Mês** movidos para o lado direito do header do calendário.
- Mantidos os filtros técnicos de status e colaborador internamente como padrão `Todos`, sem ocupar espaço visual.

## Banco de dados

- Não altera banco.
- Não precisa rodar migration.

## Como rodar

```bash
npm install
npm start
```

## Observação

A última parte do pedido terminou em “e no”, então esta versão implementa todos os ajustes claros enviados até esse ponto.

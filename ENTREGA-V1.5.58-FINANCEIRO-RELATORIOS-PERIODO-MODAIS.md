# PetFunny OS v1.5.58 — Financeiro e Relatórios por período, modais e crescimento

## O que foi feito

### Financeiro
- Aplicado filtro por período no Financeiro.
- Adicionado filtro por data com opção de período personalizado.
- Mantido filtro por mês.
- Cards financeiros com espaçamento vertical `margin-bottom: 20px`.
- Botão **Baixar** preservado com abertura em modal padrão.
- Reforçado `z-index` dos modais de Financeiro e Baixa para abrir por cima da interface.
- Corrigida a geração de mensagem WhatsApp de cobrança amigável no backend, removendo joins inválidos em `financial_transactions`.

### Relatórios
- Adicionado gráfico comparativo de crescimento entre períodos.
- Comparativos exibidos:
  - Entradas;
  - Agendamentos;
  - Serviços vendidos;
  - Pacotes contratados.
- Mantidos gráficos financeiros, agenda, serviços e pacotes.
- Cards e linhas de relatório agora abrem em modal de detalhes.
- Adicionado modal padrão para leitura detalhada dos indicadores.
- Adicionado período personalizado por data nos relatórios.

## Arquivos alterados
- `backend/src/app.js`
- `frontend/pages/financeiro/index.html`
- `frontend/pages/relatorios/index.html`
- `frontend/assets/css/app.css`

## Validação técnica
- `node --check backend/src/app.js`
- `node --check /tmp/financeiro_v158.mjs`
- `node --check /tmp/relatorios_v158.mjs`

## Observações
- Não há migration obrigatória nesta versão.
- O problema do WhatsApp no Financeiro vinha de query tentando acessar colunas que não existem em `financial_transactions`, como `ft.pet_id` e `ft.payment_method_id`.
- A baixa financeira continua usando o endpoint atual: `PATCH /api/financeiro/transactions/:id/pay`.

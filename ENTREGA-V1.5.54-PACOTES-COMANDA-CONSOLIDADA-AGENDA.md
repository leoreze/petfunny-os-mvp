# Entrega v1.5.54 — Pacotes: comanda consolidada em todas as sessões

## O que foi feito

- Reposicionado o campo **Preço do pacote** no cadastro de pacote para ficar por último, próximo ao campo **Desconto %**.
- Mantido o preço do pacote como campo automático, calculado a partir dos serviços selecionados, quantidades e desconto.
- Ajustado o menu de 3 pontinhos em **Pacotes vendidos** para usar um menu flutuante único, com `position: fixed`, alto `z-index` e fechamento seguro ao rolar, redimensionar ou clicar fora.
- Ajustado o documento de comanda pública de agendamento de pacote: ao abrir `/documentos/comanda/:appointmentId`, se o agendamento pertence a um pacote, o sistema redireciona para a **comanda consolidada do pacote**.
- Ajustado o endpoint autenticado de comanda: se o agendamento pertence a pacote, retorna o documento consolidado do pacote com todos os serviços, quantidades, desconto e datas das sessões.
- Ajustado o recibo gerado pela Agenda: se o agendamento pertence a pacote, retorna/abre o **recibo consolidado do pacote**, não o recibo individual da sessão.
- Ajustado Dashboard: botões de comanda e recibo agora abrem os documentos consolidados quando o agendamento pertence a pacote.
- Ajustado Agenda: o modal de comanda/recibo agora renderiza documento completo do pacote quando a sessão é vinculada a pacote.

## Arquivos alterados

- `frontend/pages/pacotes/index.html`
- `frontend/pages/agenda/index.html`
- `frontend/pages/dashboard/index.html`
- `frontend/assets/css/app.css`
- `backend/src/app.js`

## Como rodar

```bash
npm install
npm start
```

Não há migration obrigatória nesta versão.

## Como testar

1. Acesse `/admin/pacotes`.
2. Clique em **Novo pacote**.
3. Confirme que **Preço do pacote** aparece por último, próximo de **Desconto %**.
4. Cadastre um pacote com serviços e quantidade, por exemplo `4 banhos simples`.
5. Venda o pacote e gere agendamentos.
6. Em **Pacotes vendidos**, abra o menu de 3 pontinhos e confirme que ele aparece alinhado acima da tabela.
7. Na Agenda, abra comanda/recibo de qualquer sessão do pacote.
8. Confirme que o documento exibido é o pacote completo, com serviços, quantidades, desconto e todas as datas.
9. No Dashboard, abra comanda/recibo de sessão vinculada a pacote e confirme o mesmo comportamento.

## Validação técnica

- `node --check backend/src/app.js`
- Extração e validação dos scripts embutidos em:
  - `frontend/pages/pacotes/index.html`
  - `frontend/pages/agenda/index.html`
  - `frontend/pages/dashboard/index.html`

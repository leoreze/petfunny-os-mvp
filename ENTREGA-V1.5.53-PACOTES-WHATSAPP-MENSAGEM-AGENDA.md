# Entrega v1.5.53 — Pacotes: WhatsApp, mensagem, documentos e badge na agenda

## O que foi feito

- Adicionado campo **WhatsApp do tutor** na venda do pacote, com busca automática igual ao Novo Agendamento.
- Ao localizar o tutor pelo WhatsApp, o sistema preenche tutor e carrega pets automaticamente.
- Ajustado menu de 3 pontinhos dos Pacotes vendidos para abrir como menu flutuante acima da tabela.
- Adicionada ação **Enviar mensagem** no menu de Pacotes vendidos.
- A mensagem de WhatsApp inclui:
  - nome do pacote;
  - pet;
  - todas as datas dos agendamentos gerados;
  - link da comanda consolidada do pacote;
  - link do recibo consolidado do pacote.
- Comanda consolidada do pacote agora mostra uma seção com todas as datas/horários das sessões geradas.
- Recibo consolidado do pacote também mostra todas as datas/horários das sessões geradas.
- Agenda e Dashboard agora mostram badge de pacote no calendário, exemplo: **📦 1 de 4**.
- Corrigida duplicação acidental de `shouldRenew` no backend para preservar validação de sintaxe.

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

1. Abra `/admin/pacotes`.
2. Clique em **Vender pacote**.
3. Digite o WhatsApp de um tutor já cadastrado.
4. Confirme se tutor e pets são preenchidos automaticamente.
5. Venda o pacote com geração de agenda ativa.
6. Em **Pacotes vendidos**, abra o menu de 3 pontinhos.
7. Clique em **Enviar mensagem** e confira o texto com datas, comanda e recibo.
8. Abra a comanda e o recibo do pacote e confira a seção de datas dos agendamentos.
9. Abra Agenda e Dashboard e confira o badge **📦 1 de 4** nos agendamentos criados por pacote.

## Observações

- A mensagem usa link público da comanda e recibo consolidado do pacote.
- O badge aparece quando o agendamento possui `package_session_label` preenchido.

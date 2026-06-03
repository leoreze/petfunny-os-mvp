# FunnyOS v1.6.55 — App Tutor: Meus Agendamentos e Agenda mais limpa

## O que foi feito

- Aumentada a altura do card hero em `/app/agenda`.
- Removido o bloco de **Próximos agendamentos** da tela de novo agendamento.
- Criada a nova tela `/app/agendamentos` para **Meus Agendamentos**.
- Incluído item visível no menu principal do PWA para acessar a tela de agendamentos.
- A nova tela possui abas:
  - **Próximos**;
  - **Histórico**.
- Cada agendamento agora é exibido em card próprio com:
  - destaque visual da data do lado esquerdo;
  - dia da semana;
  - dia e mês;
  - pet, status, horário, serviços e valor do lado direito.
- Adicionado botão final **Novo Agendamento** no rodapé da tela de Meus Agendamentos.

## Arquivos principais alterados

- `frontend/assets/js/client-shell.js`
- `frontend/pages/app/home/index.html`
- `frontend/assets/css/app.css`
- `backend/src/app.js`

## Banco de dados

Não altera banco.

## Como rodar

```bash
npm install
npm start
```

## Como testar

1. Acesse `http://localhost:3000/app/agenda`.
2. Verifique se o hero está mais alto.
3. Verifique se a tela mostra apenas o formulário de novo agendamento.
4. Acesse `http://localhost:3000/app/agendamentos`.
5. Teste as abas **Próximos** e **Histórico**.
6. Verifique se o botão **Novo Agendamento** leva para `/app/agenda`.
7. Confira o item novo no menu inferior do app.

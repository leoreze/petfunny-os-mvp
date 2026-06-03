# FunnyOS v1.6.54 — App Tutor: Agenda com seletor de pets, tosa condicionada ao banho e remoção de referência Mercado Pago

## O que foi feito

- Ajustado o App do Tutor em `/app/agenda`.
- Card hero da agenda não mostra mais nome do tutor nem botão “Ver meus pets”.
- Fotos de pets ficaram circulares no app.
- Substituído select tradicional de pet por seletor visual igual ao mockup:
  - foto redonda;
  - nome do pet;
  - raça/porte;
  - botão `+ Adicionar`.
- Botão `+ Adicionar` abre modal para cadastrar pet sem sair da agenda.
- Ao salvar um novo pet pela agenda, a tela volta para `/app/agenda` com os dados atualizados.
- Serviços de Tosa ficam desabilitados até selecionar um serviço de Banho.
- Se o usuário desmarcar Banho, as opções de Tosa são bloqueadas novamente.
- Adicionada validação extra no envio para impedir Tosa sem Banho.
- Removidas referências visíveis a “Mercado Pago” nas telas e mensagens principais do app, trocando por linguagem genérica de pagamento online seguro.

## Arquivos principais alterados

- `frontend/pages/app/home/index.html`
- `frontend/assets/js/client-shell.js`
- `frontend/assets/css/app.css`
- `frontend/pages/financeiro/index.html`
- `backend/src/app.js`

## Como rodar

```bash
npm install
npm start
```

## Como testar

1. Abrir `http://localhost:3000/app/agenda`.
2. Conferir que o hero da agenda não mostra nome do tutor nem botão “Ver meus pets”.
3. Conferir que os pets aparecem como cards circulares com foto/nome.
4. Clicar no botão `+ Adicionar` e cadastrar um pet.
5. Confirmar que volta para a agenda após salvar.
6. Conferir que Tosa aparece bloqueada antes de selecionar Banho.
7. Selecionar Banho e confirmar que Tosa libera.
8. Desmarcar Banho e confirmar que Tosa bloqueia novamente.
9. Abrir pagamentos e confirmar que não aparece a marca Mercado Pago para o tutor.

## Observações

- Não altera banco.
- Não precisa rodar migration.
- O provedor de pagamento continua tecnicamente integrado por baixo, mas sem exposição da marca para o tutor nas interfaces principais.

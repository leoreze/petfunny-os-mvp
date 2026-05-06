# PetFunny OS v1.5.52 — Pacotes: preço automático, comanda/recibo consolidado e menu acima da tabela

## O que foi feito

- Cadastro de pacote agora calcula automaticamente o **Preço do pacote**.
- O preço é calculado pela soma dos serviços selecionados com suas quantidades e aplicação do desconto percentual.
- O backend também recalcula o valor do pacote antes de salvar, mesmo se o frontend enviar valor incorreto.
- A comanda consolidada do pacote foi criada em rota própria.
- O recibo consolidado do pacote foi criado em rota própria.
- A comanda/recibo do pacote exibem:
  - todos os serviços inclusos;
  - quantidade total de cada serviço, exemplo: `4 Banhos simples`;
  - valor unitário;
  - total por serviço;
  - total dos serviços;
  - desconto aplicado em R$ e %;
  - preço final do pacote.
- A listagem de Pacotes vendidos agora usa link para a comanda consolidada do pacote.
- O menu de 3 pontinhos dos pacotes vendidos foi ajustado para abrir por cima da tabela e não ficar preso no scroll/overflow.
- O menu de ações ganhou links para:
  - visualizar pacote;
  - alterar pagamento;
  - comanda do pacote;
  - recibo do pacote;
  - cancelar pacote.
- Ao dar erro no cadastro/edição de pacote, a mensagem aparece em modal com botão **OK** para fechar.

## Arquivos alterados

- `backend/src/app.js`
- `frontend/pages/pacotes/index.html`
- `frontend/assets/css/app.css`

## Novas rotas públicas

- `/documentos/pacote-comanda/:customerPackageId`
- `/documentos/pacote-recibo/:customerPackageId`

## Como rodar

```bash
npm install
npm run db:migrate
npm start
```

## Como testar

1. Acesse `/admin/pacotes`.
2. Clique em **Novo pacote**.
3. Selecione um porte.
4. Marque um serviço, por exemplo `Banho simples`.
5. Ajuste a quantidade para `4`.
6. Informe um desconto.
7. Confira se o campo **Preço do pacote** calcula automaticamente.
8. Salve o pacote.
9. Venda o pacote para um tutor/pet.
10. Em **Pacotes vendidos**, abra o menu de 3 pontinhos.
11. Abra **Comanda do pacote** e **Recibo do pacote**.
12. Confira se aparece a quantidade total e o desconto aplicado.

## Observações

- Não houve alteração de schema obrigatória nesta versão.
- O backend continua aceitando o campo `priceCents`, mas ele é recalculado no servidor para evitar divergência.

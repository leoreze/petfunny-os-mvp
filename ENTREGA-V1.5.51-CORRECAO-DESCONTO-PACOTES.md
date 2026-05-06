# PetFunny OS v1.5.51 — Correção desconto em pacotes

## Correção aplicada

Corrigido erro no cadastro de pacotes em `POST /api/pacotes`:

```txt
new row for relation "packages" violates check constraint "packages_discount_percent_check"
```

## Causa

O campo `discount_percent` podia chegar ao backend como texto com vírgula, porcentagem ou valor inválido. Nesses casos, `Number(...)` podia gerar `NaN`, e o PostgreSQL recusava a linha pela constraint `packages_discount_percent_check`.

## Ajuste

Foi adicionada a função segura `parsePercent()`, usada no cadastro e edição de pacotes. Agora o desconto:

- aceita `10`;
- aceita `10,5`;
- aceita `10.5`;
- aceita `10%`;
- converte valor inválido para `0`;
- limita automaticamente entre `0` e `100`;
- salva com até 2 casas decimais.

## Arquivo alterado

- `backend/src/app.js`

## Como testar

1. Rode o servidor.
2. Acesse `/admin/pacotes`.
3. Clique em `Novo pacote`.
4. Preencha desconto como `10`, `10,5` ou `10%`.
5. Salve o pacote.
6. O erro de constraint não deve mais ocorrer.

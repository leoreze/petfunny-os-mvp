# Entrega v1.5.50 — Pacotes: headers e botões

## Ajustes realizados

- Removida a seta azul/indicador duplicado dos headers das tabelas em `/admin/pacotes`.
- Mantida a ordenação funcionando somente pelo botão de seta preta no header.
- Botão **Vender pacote** da seção **Pacotes vendidos** alinhado à direita.
- Botão **Novo pacote** movido para a linha abaixo do bloco:
  - **Consulta de pacotes**
  - “Busque pacotes, revise valores, sessões e frequência antes de oferecer ao tutor.”
- Mantida a lógica existente de filtros, ordenação, venda, cadastro e recorrência.

## Arquivos alterados

- `frontend/pages/pacotes/index.html`
- `frontend/assets/css/app.css`

## Como testar

1. Rodar o projeto normalmente.
2. Acessar `http://localhost:3000/admin/pacotes`.
3. Confirmar que os headers não exibem seta azul.
4. Confirmar que a seta preta continua ordenando as colunas.
5. Confirmar que **Novo pacote** aparece abaixo de **Consulta de pacotes**.
6. Confirmar que **Vender pacote** em **Pacotes vendidos** aparece alinhado à direita.

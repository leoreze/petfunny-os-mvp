# FunnyOS v1.6.61 — Tele Consultas UX + Timestamp Fix

## O que foi feito

- Ajustado padding dos cards em `/app/teleconsultas`, principalmente no bloco **Escolha o veterinário**.
- Estilizado o botão **← Voltar para veterinários**.
- Forma de pagamento da teleconsulta agora aparece em cards selecionáveis, igual ao fluxo de agenda.
- Corrigido erro de timestamp no backend ao salvar teleconsulta com horário vindo do banco como `Date`.
- Backend agora converte `starts_at` para ISO seguro antes de enviar ao PostgreSQL.

## Banco

- Não altera banco.
- Não precisa rodar migration.

## Como rodar

```bash
npm install
npm start
```

## Como testar

1. Abrir `/app/teleconsultas`.
2. Selecionar pet.
3. Clicar em **Agendar consulta**.
4. Verificar padding dos cards de veterinário.
5. Selecionar veterinário.
6. Verificar estilo do botão voltar.
7. Selecionar data/horário.
8. Escolher forma de pagamento por cards.
9. Enviar formulário sem erro de timestamp.

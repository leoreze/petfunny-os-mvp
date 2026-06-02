# FunnyOS v1.6.43 — Pacote Antigo com Busca por WhatsApp

## O que foi ajustado
- Modal **Pacote antigo** agora começa com o campo **WhatsApp do tutor**.
- Ao digitar o WhatsApp, o sistema busca o tutor automaticamente.
- Se o tutor existir, preenche o combo Tutor e carrega os pets vinculados.
- Se houver apenas um pet, ele é selecionado automaticamente.
- O pacote continua servindo apenas como referência histórica.
- O valor final continua manual, sem puxar preço ou desconto automaticamente.

## Como testar
1. Acesse `/admin/pacotes`.
2. Clique em **Pacote antigo**.
3. Digite o WhatsApp de um tutor já cadastrado.
4. Confira se Tutor e Pet são preenchidos/carregados.
5. Escolha o pacote, informe data, sessões, valor manual e salve.

## Comandos
```bash
npm start
```

Sem migration obrigatória.

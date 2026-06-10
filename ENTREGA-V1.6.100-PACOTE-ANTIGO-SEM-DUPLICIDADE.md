# FunnyOS v1.6.100 — Pacote Antigo sem duplicidade

## Objetivo
Corrigir o fluxo de `/admin/pacotes` no botão **Pacote Antigo**, evitando que o mesmo pacote antigo seja salvo duas vezes quando o formulário é disparado em duplicidade.

## O que foi corrigido

- Adicionado bloqueio visual e lógico no frontend para impedir duplo submit do formulário de Pacote Antigo.
- O botão **Salvar pacote antigo** fica desabilitado enquanto o envio está em andamento.
- Adicionado `clientRequestId` no payload do Pacote Antigo.
- Adicionado controle anti-duplicidade no backend para `/api/pacotes/clientes/historical`.
- Se o mesmo pacote antigo for reenviado em sequência para o mesmo tutor, pet, pacote, data, horário, sessões e valor, o backend retorna o registro já criado em vez de criar outro.
- Adicionado advisory lock no backend durante a importação histórica para reduzir risco de duplicidade em cliques rápidos/requisições simultâneas.

## Arquivos alterados

- `backend/src/app.js`
- `frontend/pages/pacotes/index.html`
- `package.json`
- `backend/package.json`
- `package-lock.json`
- `backend/package-lock.json`
- `DEPLOY_VERSION.txt`

## Como testar

1. Acesse `/admin/pacotes`.
2. Clique em **Pacote Antigo**.
3. Preencha tutor, pet, pacote, data, horário, total de sessões e valor.
4. Clique uma vez em **Salvar pacote antigo**.
5. Tente clicar novamente rapidamente.
6. O sistema deve criar apenas um pacote vendido.
7. Se a mesma requisição for enviada novamente em sequência, o backend deve evitar duplicidade e retornar o pacote já criado.

## Observação

A regra não impede criar outro pacote legítimo depois. Ela só bloqueia duplicidade imediata causada por clique duplo, reenvio ou repetição acidental do mesmo cadastro histórico.

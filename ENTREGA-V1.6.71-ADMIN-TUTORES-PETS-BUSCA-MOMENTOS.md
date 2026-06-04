# FunnyOS v1.6.71 — Admin Tutores/Pets Busca, Cards e Momentos

## O que foi feito
- Corrigida busca em `/admin/tutores` para filtrar por nome, WhatsApp e e-mail sem retornar tudo quando o termo não tem número.
- Corrigida busca em `/admin/pets` para filtrar por nome do pet, tutor, WhatsApp e e-mail.
- Incluídos botões de visão `Lista` e `Cards` em Tutores.
- Incluídos botões de visão `Lista` e `Cards` em Pets.
- Transformadas ações de Pets em menu de 3 pontinhos.
- Incluída opção `Momentos Especiais` no menu do Pet.
- Criada visualização administrativa das fotos/vídeos enviados em agendamentos por pet.
- Incluída ação para apagar foto/vídeo dos Momentos Especiais.

## Banco de dados
- Não altera banco.
- Não precisa rodar migration.

## Como rodar
```bash
npm install
npm start
```

## Validação
```bash
node --check backend/src/app.js
node --check frontend/pages/tutores inline script
node --check frontend/pages/pets inline script
unzip -t
```

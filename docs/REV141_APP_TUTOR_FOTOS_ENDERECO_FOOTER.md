# REV141 — App Tutor: fotos, endereço e footer mobile

## O que foi ajustado

- `/app/perfil`: edição do perfil agora permite upload de foto do tutor.
- `/app/perfil`: formulário recebeu campos de endereço: CEP, rua/avenida, número, bairro, cidade e estado.
- `/app/perfil`: foto do tutor é exibida no avatar superior após salvar.
- `/app/pets`: cadastro e edição de pet agora permitem upload de foto.
- `/app/pets`: listagem de pets exibe a foto cadastrada com fallback por inicial.
- Footer fixo do App do Tutor agora mantém 4 itens visíveis: Timeline, Agenda, Pets e Histórico.
- Demais menus ficam concentrados no botão de 3 pontinhos (“Mais”).

## Backend

- `PUT /api/app/profile` passou a salvar foto e endereço do tutor.
- `POST /api/app/pets` e `PUT /api/app/pets/:id` passaram a aceitar `photoDataUrl`.
- Migration adiciona colunas compatíveis de endereço em `tutors`.

## Observações

- Upload implementado como Data URL com limite aproximado de 700 KB, preservando simplicidade do projeto atual sem storage externo.
- Não altera layout global do admin.
- Não altera fluxo de Pix/cartão já implementado.

## Comando necessário

```bash
npm run db:migrate
npm start
```

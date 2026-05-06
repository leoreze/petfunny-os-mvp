# PetFunny OS v0.6.4 — Slots por horário e fotos de tutores/pets

## O que foi feito
- Ajustado o painel de slots para exibir apenas horários dentro do funcionamento cadastrado por dia.
- A matriz de slots atualiza automaticamente quando abre/fecha ou horários do dia são alterados.
- O endpoint de configurações operacionais agora retorna capacidades apenas dentro dos horários abertos.
- Adicionado upload de foto no cadastro/edição de tutores.
- Adicionado upload de foto no cadastro/edição de pets.
- Listagens mostram foto quando houver imagem; quando não houver, mostram avatar com iniciais do nome.
- Schema atualizado com `photo_url` em `tutors` e `pets`, com `ALTER TABLE IF NOT EXISTS` para bancos já criados.
- Mantida arquitetura sem tenant, sem SaaS e sem DDL em runtime.

## Como rodar
```bash
npm install
npm run db:migrate
npm run db:seed
npm start
```

## Como testar
- Acesse `/admin/configuracoes` e altere dias/horários. Os slots devem aparecer apenas dentro do intervalo de cada dia.
- Acesse `/admin/tutores`, crie/edite um tutor e envie uma foto.
- Acesse `/admin/pets`, crie/edite um pet e envie uma foto.
- Remova a foto ou cadastre sem foto para validar avatar por iniciais.

## Observações
- Nesta fase, a foto é armazenada como Data URL no banco para manter a entrega simples. Em produção, a evolução ideal é mover imagens para storage externo ou pasta controlada com referência no banco.
- Limite visual recomendado: até 750 KB por imagem.

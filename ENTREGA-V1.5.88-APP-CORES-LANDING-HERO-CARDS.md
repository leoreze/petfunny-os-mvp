# PetFunny OS v1.5.88 — App do Tutor com padrão visual da landing e hero por área

## O que foi feito

- Ajustado o CSS do App do Tutor para seguir o mesmo padrão visual da landing pública.
- Botões do app agora usam o gradiente da landing com salmão/rosa da logo + turquesa.
- Removidos tons de verde/laranja dos principais elementos do app.
- Criado um card hero mais forte para cada área do app.
- Cada seção do app agora recebe:
  - post-it de contexto;
  - título/subtítulo;
  - ícone grande animado;
  - CTA contextual;
  - chip com o nome do tutor.
- Áreas contempladas:
  - Timeline;
  - Agenda;
  - Pets;
  - Histórico;
  - Pacotes;
  - Mimos;
  - Roleta;
  - Perfil.
- Ajustado menu inferior, cards, badges, progresso e alertas para a paleta PetFunny.

## Arquivos alterados

- `frontend/assets/js/client-shell.js`
- `frontend/assets/css/app.css`

## Como testar

```bash
npm start
```

Depois acesse:

```txt
http://localhost:3000/app/login
```

Entre no app e navegue entre:

```txt
/app/home
/app/agenda
/app/pets
/app/roleta
/app/perfil
```

## Observação

Não há migration obrigatória nesta versão.

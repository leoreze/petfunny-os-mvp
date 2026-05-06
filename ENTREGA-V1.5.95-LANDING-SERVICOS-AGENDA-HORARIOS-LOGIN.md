# PetFunny OS v1.5.95 — Landing serviços, horários disponíveis e login admin

## O que foi feito

- Landing page:
  - seção **Serviços** ajustada para o filtro por porte ficar em uma linha própria;
  - serviços agora são agrupados por tipo/categoria;
  - serviços continuam sem preço na landing;
  - mantida a identidade visual da logo PetFunny.

- App do Tutor:
  - em **Novo agendamento**, removido o texto “Solicite um horário usando os mesmos serviços cadastrados no admin.”;
  - hero da área Agenda agora fica apenas com o título;
  - campo **Data do atendimento** bloqueia datas passadas com `min`;
  - horários passados não aparecem;
  - quando não há vaga, o horário fica desabilitado e não permite salvar;
  - antes de salvar, o app valida se existe horário disponível.

- Admin / Agenda:
  - criado endpoint administrativo para horários disponíveis;
  - modal de Novo Agendamento agora carrega apenas horários com vaga;
  - datas passadas e horários passados não ficam disponíveis para seleção;
  - horários lotados não aparecem no combo;
  - botões rápidos de agendamento não aparecem para horários sem vaga ou horários passados;
  - backend passa a bloquear agendamentos em horários passados também.

- Login Admin:
  - removido aviso com usuário/senha padrão;
  - removido email preenchido automaticamente;
  - adicionado copyright do PetFunny.

## Arquivos alterados

- `frontend/index.html`
- `frontend/assets/js/landing.js`
- `frontend/assets/js/client-shell.js`
- `frontend/assets/css/app.css`
- `frontend/pages/app/home/index.html`
- `frontend/pages/agenda/index.html`
- `frontend/pages/login/index.html`
- `backend/src/app.js`

## Novos endpoints

- `GET /api/agenda/availability?date=YYYY-MM-DD`

## Como testar

```bash
npm start
```

### Landing

Acesse:

```txt
http://localhost:3000/
```

- Verifique a seção Serviços.
- O filtro por porte deve ficar sozinho em uma linha.
- Os serviços devem aparecer agrupados por tipo.

### App do Tutor

Acesse:

```txt
http://localhost:3000/app/login
```

- Entre no app.
- Vá em Agenda.
- Data passada não deve ser selecionável.
- Horário passado não deve aparecer.
- Se não houver vaga, não deve permitir salvar.

### Admin

Acesse:

```txt
http://localhost:3000/admin/agenda
```

- Abra Novo Agendamento.
- O combo de horário deve carregar somente horários disponíveis.
- Horários passados/lotações não devem aparecer.

### Login Admin

Acesse:

```txt
http://localhost:3000/admin
```

- Não deve aparecer aviso com usuário e senha padrão.
- Deve aparecer copyright no card.

## Migration

Não há migration obrigatória nesta versão.

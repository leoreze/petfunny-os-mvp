# FunnyOS v1.6.33 — Acessos do App e Logs de Uso

## O que foi implementado
- Tabela `app_access_logs` para registrar uso real do App do Tutor.
- Registro automático de login e abertura de páginas do App.
- Endpoint `POST /api/app/access-log`.
- Endpoint admin `GET /api/app-access/tutors`.
- Endpoint admin `GET /api/app-access/tutors/:id`.
- Nova página admin `/admin/app-acessos`.
- Opção **Acessos do App** no menu 3 pontinhos da listagem de tutores.
- Modal por tutor com primeiro acesso, último acesso, total de acessos e últimas ações.

## Status calculado
- Nunca acessou
- Acessou hoje
- Ativo
- Inativo 7 dias
- Inativo 30 dias

## Eventos registrados
- login
- page_view
- agenda_open
- roleta_open
- packages_open
- moments_open
- health360_open
- logout

## Como rodar
```bash
npm run db:migrate
npm start
```

## Como testar
1. Entrar no App do Tutor.
2. Abrir Home, Agenda, Saúde 360, Momentos ou Pacotes.
3. Ir para `/admin/app-acessos`.
4. Ir para `/admin/tutores`, abrir 3 pontinhos e clicar em **Acessos do App**.

# PetFunny OS v1.5.70 — App do Tutor funcional

## O que foi feito

- Página principal do app transformada em uma timeline mobile-first.
- Timeline com posts de IA local, lembretes, pacotes, atualização do sistema e roleta de mimos.
- Perfil do tutor editável pelo app, bloqueando alteração de WhatsApp.
- Senha do tutor pode ser criada/atualizada no app.
- CRUD de pets no app:
  - criar pet;
  - editar pet;
  - remover/inativar pet;
  - campos de porte, raça, pelagem, nascimento, peso, preferências, restrições e observações.
- Novo agendamento pelo app usando os serviços reais do admin.
- Contratação de pacotes pelo app.
- Pacote contratado gera agendamentos automaticamente.
- Opção de recorrência automática no pacote.
- Novo menu/rota `/app/roleta`.
- Roleta de Mimos funcionando com os mimos ativos cadastrados no admin.
- Registro do giro da roleta em `gift_spins`.
- Endpoint de opções do app para serviços, colaboradores, portes, pacotes, formas de pagamento e mimos.
- Corrigido payload do tutor no app para garantir `tutor.id` válido.

## Arquivos principais alterados

- `backend/src/app.js`
- `frontend/pages/app/home/index.html`
- `frontend/assets/js/client-shell.js`
- `frontend/assets/js/client-api.js`
- `frontend/assets/css/app.css`

## Novos endpoints

- `GET /api/app/options`
- `PUT /api/app/profile`
- `PUT /api/app/password`
- `POST /api/app/pets`
- `PUT /api/app/pets/:id`
- `DELETE /api/app/pets/:id`
- `POST /api/app/appointments`
- `POST /api/app/packages`
- `POST /api/app/roleta/spin`

## Como rodar

```bash
npm install
npm run db:migrate
npm start
```

## Como testar

1. Acesse `/app/login`.
2. Informe o WhatsApp e valide o código.
3. Cadastre tutor, pet e senha caso seja cliente novo.
4. Entre no app.
5. Teste:
   - timeline inicial em `/app/home`;
   - novo agendamento em `/app/agenda`;
   - CRUD de pets em `/app/pets`;
   - contratação de pacotes em `/app/pacotes`;
   - roleta em `/app/roleta`;
   - edição de perfil e senha em `/app/perfil`.

## Observações

- Não há migration obrigatória nesta versão.
- O WhatsApp continua protegido: o tutor não consegue alterar esse dado pelo app.
- A roleta depende de mimos ativos cadastrados no admin.
- O agendamento criado pelo app entra como `source = app_tutor` e status `agendado`.

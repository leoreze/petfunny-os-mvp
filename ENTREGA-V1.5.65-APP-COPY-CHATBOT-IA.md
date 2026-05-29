# PetFunny OS v1.5.65 — App copy premium + chatbot IA contextual no admin

## O que foi feito

### App do Tutor
- Ajustado o copy principal da tela de login do app.
- Mantido "App do tutor" com destaque na cor rosa da logo.
- Substituído "Entrar no Meu PetFu" por uma chamada mais emocional e clara para o cliente:
  - "Seu pet cuidado, você por dentro de tudo".
- Removido o texto técnico sobre ambiente local/produção.
- Adicionado copyright institucional do PetFunny.
- Reforçado CSS mobile-first da tela de autenticação.

### Admin — Chatbot IA contextual
- Adicionado chatbot flutuante de IA em todas as telas do admin.
- O chatbot muda o contexto automaticamente conforme o item do menu:
  - Dashboard;
  - Agenda;
  - Tutores;
  - Pets;
  - Serviços;
  - Pacotes;
  - Financeiro;
  - Relatórios;
  - CRM & Marketing;
  - Roleta de Mimos;
  - Notificações;
  - WhatsApp;
  - Assistente IA;
  - Configurações.
- Cada módulo tem:
  - título contextual;
  - descrição operacional;
  - sugestões rápidas de perguntas;
  - campo livre para perguntar.

### Backend IA real
- O endpoint `/api/assistente-ia/analyze` agora tenta usar OpenAI de verdade quando `OPENAI_API_KEY` estiver configurada.
- Se a chave não existir ou a OpenAI falhar, o sistema retorna resposta local segura e não trava.
- A IA recebe um snapshot operacional seguro do módulo aberto, incluindo dados recentes conforme o contexto.
- O sistema não expõe a chave da OpenAI no frontend.

## Arquivos alterados
- `frontend/pages/app/login/index.html`
- `frontend/assets/css/app.css`
- `frontend/assets/js/shell.js`
- `frontend/assets/js/admin-ai-chat.js`
- `backend/src/app.js`

## Variáveis de ambiente opcionais
No `backend/.env`, para IA real:

```env
OPENAI_API_KEY=sua_chave_aqui
OPENAI_MODEL=gpt-4.1-mini
```

Sem essas variáveis, o PetFunny OS continua funcionando normalmente.

## Como rodar
```bash
npm install
npm run db:migrate
npm start
```

## Como testar
1. Acesse `http://localhost:3000/app/login`.
2. Confira a logo central, copy nova, post-it animado e copyright.
3. Acesse qualquer tela do admin, exemplo `http://localhost:3000/admin/dashboard`.
4. Clique no botão flutuante de IA no canto inferior direito.
5. Teste uma pergunta contextual.

## Validação técnica
- `node --check backend/src/app.js`
- `node --check frontend/assets/js/shell.js`
- `node --check frontend/assets/js/admin-ai-chat.js`
- `node --check` no script extraído do login do app.

## Observação
A integração com IA real depende apenas da variável `OPENAI_API_KEY`. Ela é opcional e não bloqueia dashboard, agenda, financeiro, app do tutor ou demais módulos.

# PetFunny OS v1.5.66 — App com código via WhatsApp e chatbot somente ícone

## O que foi feito

### App do Tutor
- O código de autenticação agora é gerado automaticamente com 6 dígitos aleatórios em qualquer ambiente.
- Removido o comportamento de desenvolvimento com código fixo `123456`.
- Removidos retornos `devCode` das rotas de autenticação do app.
- Após informar o WhatsApp, o sistema gera um link real `wa.me` com uma mensagem pronta contendo o código.
- O tutor toca em **Abrir WhatsApp com meu código**, envia a mensagem para o próprio WhatsApp, copia os 6 números e valida no app.
- A tela de código ganhou um card explicativo com botão de abertura do WhatsApp.
- Mantido o fluxo completo:
  - WhatsApp;
  - código;
  - cliente existente cria senha;
  - cliente novo cadastra tutor;
  - cadastra pet;
  - acessa o app.

### Admin — Chatbot IA
- O botão flutuante do chatbot agora usa somente um ícone de IA.
- Removido o texto `IA` de dentro do botão.
- Mantido o painel contextual por módulo e integração real com OpenAI quando `OPENAI_API_KEY` estiver configurada.

## Arquivos alterados
- `backend/src/app.js`
- `frontend/pages/app/login/index.html`
- `frontend/pages/app/primeiro-acesso/index.html`
- `frontend/assets/js/admin-ai-chat.js`
- `frontend/assets/css/app.css`

## Como testar
```bash
npm install
npm run db:migrate
npm start
```

Acesse:

```txt
http://localhost:3000/app/login
```

Fluxo esperado:
1. Informe o WhatsApp.
2. Clique em enviar/gerar código.
3. Na tela seguinte, toque em **Abrir WhatsApp com meu código**.
4. Envie a mensagem pronta para o próprio WhatsApp.
5. Copie os 6 números.
6. Volte para o app e valide.

## Observações
- Não há migration obrigatória nesta versão.
- O envio via `wa.me` não depende de API externa e funciona como fluxo manual de produção até integrar Evolution API, Z-API, n8n ou Meta Cloud API.
- O sistema não mostra mais código de teste/dev na tela.

# FunnyOS v1.6.115 — App Tutor Acesso por WhatsApp + Primeiro Acesso

## O que foi feito

- Reformulado o fluxo de acesso do App do Tutor em `/app/login`.
- Primeiro passo agora é somente o WhatsApp.
- Se o tutor já possui senha ativa, abre tela de senha para login seguro.
- Se for primeiro acesso de tutor já cadastrado no admin, abre tela para criar senha e entra direto no `/app/home`.
- Se o WhatsApp não existir no sistema, abre criação de senha, depois cadastro completo do tutor e depois cadastro do pet.
- Cadastro do tutor no app agora tem campos equivalentes ao admin: nome, WhatsApp, telefone, e-mail, documento, CEP, número, rua, bairro, cidade, UF, tags e observações.
- Campo CEP busca `/api/cep/:cep` e autocompleta rua, bairro, cidade e UF quando existir.
- Cadastro do pet carrega portes e raças reais do sistema via `/api/app/public-options`.
- Ao selecionar raça cadastrada, o app sugere porte e pelagem quando configurados.
- Criado endpoint `/api/app/auth/start-whatsapp` para decidir o próximo passo do fluxo sem depender de código manual.

## Arquivos alterados

- `backend/src/app.js`
- `frontend/pages/app/login/index.html`
- `package.json`
- `backend/package.json`
- `package-lock.json`
- `backend/package-lock.json`
- `DEPLOY_VERSION.txt`

## Como testar

1. Rode `npm install`.
2. Rode `npm run db:migrate`.
3. Rode `npm start`.
4. Acesse `/app` ou `/app/login`.
5. Teste um WhatsApp de tutor já cadastrado sem senha ativa: deve criar senha e entrar no app.
6. Teste um WhatsApp de tutor já com senha: deve pedir a senha.
7. Teste um WhatsApp novo: deve criar senha, cadastrar tutor, cadastrar pet e entrar no app.
8. No cadastro do tutor, preencha CEP válido e confira o autocompletar.
9. No cadastro do pet, confira se raças cadastradas aparecem no campo Raça.

## Observações

- O login de retorno continua exigindo senha quando o cliente já tem acesso ativo.
- O fluxo antigo com código continua no backend para compatibilidade, mas a tela principal do app não usa mais esse caminho.

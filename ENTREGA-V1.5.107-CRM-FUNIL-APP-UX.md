# PetFunny OS v1.5.107 — CRM com funil automático do App e UX padronizada

## O que foi feito
- CRM agora recebe automaticamente leads quando o tutor informa o WhatsApp no App.
- Funil automático: Lead entrou, Código validado, Cadastro do tutor, Senha cadastrada, Pet cadastrado e Primeiro agendamento.
- Origem do acesso registrada com source app_tutor, referrer, UTM, tela e user-agent quando enviados pelo frontend.
- Eventos do app viram interações no histórico do lead.
- /admin/crm refeito no padrão visual premium das demais páginas: hero card, big numbers, filtros, tabela, setas, scroll infinito e modais padronizados.

## Arquivos alterados
- backend/src/app.js
- frontend/pages/app/login/index.html
- frontend/pages/crm/index.html
- frontend/assets/css/app.css
- package.json
- backend/package.json
- DEPLOY_VERSION.txt

## Como testar
1. npm start
2. Acesse /app/login com um WhatsApp novo.
3. Abra /admin/crm e confira o lead na etapa Lead entrou.
4. Valide código, cadastre tutor, pet e faça primeiro agendamento.
5. Atualize /admin/crm e confira a evolução automática do funil.

## Migration
Não há migration obrigatória.

# Checklist Final — PetFunny OS v1.5

## Base

- [x] Sistema exclusivo PetFunny
- [x] Sem fluxo SaaS ativo
- [x] Sem master admin
- [x] Login admin funcional
- [x] Token único `petfunny_token`
- [x] Migrations por comando
- [x] Seed idempotente
- [x] Loading seguro com timeout

## Rotas principais

- [ ] `/api/health`
- [ ] `/admin/login`
- [ ] `/admin/dashboard`
- [ ] `/admin/agenda`
- [ ] `/admin/tutores`
- [ ] `/admin/pets`
- [ ] `/admin/servicos`
- [ ] `/admin/pacotes`
- [ ] `/admin/assinaturas`
- [ ] `/admin/financeiro`
- [ ] `/admin/comandas-recibos`
- [ ] `/admin/crm`
- [ ] `/admin/roleta-de-mimos`
- [ ] `/admin/configuracoes`
- [ ] `/admin/notificacoes`
- [ ] `/admin/relatorios`
- [ ] `/admin/assistente-ia`
- [ ] `/app/login`
- [ ] `/app/primeiro-acesso`

## Testes manuais recomendados

1. Rodar `npm run db:migrate`.
2. Rodar `npm run db:seed`.
3. Fazer login admin.
4. Abrir Dashboard e verificar cards.
5. Criar tutor com foto.
6. Criar pet com foto.
7. Criar serviço com tipo/porte vindos de Configurações.
8. Criar agendamento com status, status de pagamento e forma de pagamento.
9. Mover card da Agenda por drag & drop.
10. Dar baixa em lançamento financeiro.
11. Gerar recibo.
12. Abrir link público de recibo.
13. Ver notificações no ícone e página completa.
14. Abrir Relatórios.
15. Testar Assistente IA sem chave OpenAI — deve funcionar em modo offline.

## Deploy

- [ ] Variáveis configuradas no Render.
- [ ] `.env` não enviado ao GitHub.
- [ ] Banco Render conectado.
- [ ] Build command definido.
- [ ] Start command definido.

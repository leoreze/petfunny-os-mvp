# PetFunny OS v1.1 — Comandas e Recibos

## Correção crítica incluída
- Corrigido erro do Financeiro: `toast.js` agora exporta `showToast` e mantém compatibilidade com `toast()`, `toast.success()`, `toast.error()`, `toast.warning()` e `toast.info()`.

## O que foi feito
- Módulo administrativo de Comandas e Recibos em `/admin/comandas-recibos`.
- Menu principal atualizado com Comandas e Recibos.
- Listagem de atendimentos documentáveis.
- Visualização de comanda antes do pagamento.
- Geração/preparação de recibo com link público.
- Página pública/imprimível de recibo em `/documentos/recibo/:token`.
- Compartilhamento por WhatsApp preparado.
- Recibo com dados do comércio, tutor, pet, serviços, desconto, total original e total final.
- Integração: ao baixar um lançamento financeiro ligado a agendamento, o recibo é criado/atualizado automaticamente.
- Integração: ao finalizar um agendamento, é criado lançamento financeiro de entrada caso ainda não exista.

## Endpoints adicionados
- `GET /api/documentos/appointments`
- `GET /api/documentos/comanda/:appointmentId`
- `POST /api/documentos/recibos/:appointmentId/generate`
- `GET /api/public/recibos/:token`

## Como rodar
1. `npm install`
2. `npm run db:migrate`
3. `npm run db:seed`
4. `npm start`

## Como testar
- Acesse `/admin/financeiro` para confirmar que o erro de `showToast` sumiu.
- Acesse `/admin/comandas-recibos`.
- Abra uma comanda.
- Gere um recibo.
- Copie/abra o link público do recibo.

## Observações
- O módulo permanece sem tenant, sem SaaS e sem master admin.
- O PDF real pode entrar em uma próxima versão; nesta etapa há página imprimível profissional.

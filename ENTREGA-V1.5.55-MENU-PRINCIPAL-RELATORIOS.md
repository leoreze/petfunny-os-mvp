# PetFunny OS v1.5.55 — Menu principal com Relatórios abaixo de Financeiro

## O que foi feito

- Removido o item **Assinaturas** do menu principal lateral.
- Removido o item **Comandas e Recibos** do menu principal lateral.
- Adicionado/reposicionado o item **Relatórios** imediatamente abaixo de **Financeiro**.
- Mantidas as páginas e rotas internas existentes, sem remoção de arquivos ou quebra de links públicos/documentos.
- Ajustado também o arquivo auxiliar de rotas para refletir a nova ordem do menu.

## Arquivos alterados

- `frontend/assets/js/shell.js`
- `frontend/assets/js/router.js`

## Como validar

1. Inicie o projeto normalmente.
2. Acesse `http://localhost:3000/admin/dashboard` ou qualquer rota administrativa.
3. Confira o menu lateral principal:
   - Dashboard
   - Agenda
   - Tutores
   - Pets
   - Serviços
   - Pacotes
   - Financeiro
   - Relatórios
   - CRM & Marketing
   - Roleta de Mimos
   - Notificações
   - WhatsApp
   - Assistente IA
   - Configurações
4. Confirme que **Assinaturas** e **Comandas e Recibos** não aparecem mais no menu principal.

## Observação

As páginas de Assinaturas e Comandas/Recibos não foram apagadas. Apenas foram removidas do menu principal para evitar regressão em documentos públicos, links antigos ou funcionalidades internas.

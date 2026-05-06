# PetFunny OS v1.5.104 — PWA, Promoções e Recibos no App

## O que foi entregue

- Corrigido o modal de instalação PWA para aparecer também em desktop.
- O botão de instalação agora usa o prompt nativo quando o navegador permite e mostra instruções quando não permite.
- Criado módulo Admin > Promoções.
- Promoções podem ser configuradas por serviço, porte, porcentagem, período e dias da semana.
- Criado menu Promoções no App do Tutor.
- No agendamento pelo app, promoções ativas são exibidas junto dos serviços e aplicadas automaticamente no valor do Pix.
- Exemplo suportado: Banho simples terça e quarta com 10% de desconto.
- Ao confirmar Pix de agendamento, o backend agora gera recibo automaticamente.
- Pacotes pagos continuam com comanda/recibo consolidado do pacote.

## Migration obrigatória

```bash
npm run db:migrate
```

Cria a tabela:

```txt
promotions
```

## Arquivos principais alterados

- backend/src/app.js
- backend/src/scripts/migrate.js
- frontend/pages/app/home/index.html
- frontend/pages/promocoes/index.html
- frontend/assets/js/client-shell.js
- frontend/assets/js/shell.js
- frontend/assets/js/client-pwa-install.js
- frontend/assets/css/app.css
- frontend/service-worker.js
- package.json
- DEPLOY_VERSION.txt

## Como testar

1. Rode `npm run db:migrate`.
2. Acesse `/admin/promocoes`.
3. Crie uma promoção para um serviço, porte e dias da semana.
4. Acesse `/app/promocoes` para conferir a promoção no app.
5. Vá em `/app/agenda`, escolha pet, data e serviço contemplado.
6. O desconto aparece no serviço e o Pix é gerado já com desconto.
7. Após confirmação do Pix, o agendamento é criado como pago e com recibo disponível.

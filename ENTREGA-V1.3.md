# Entrega v1.3 — Roleta de Mimos

Versão entregue: `petfunny-os-v1.3-roleta-mimos.zip`

## O que foi feito
- Módulo real de Roleta de Mimos.
- Cadastro, edição, ativação/inativação e remoção lógica de mimos.
- Controle de título, descrição, data inicial, data final, peso de probabilidade, custo estimado e status.
- Simulação de roleta com sorteio ponderado pelo peso de probabilidade.
- Registro de sorteios em `gift_spins`.
- Dashboard da roleta com mimos cadastrados, mimos ativos, sorteios do dia e custo estimado do mês.
- Histórico dos últimos sorteios.
- Sugestões de mimos com relatório local, sem depender de API externa.
- Visual premium com roleta animada, cards de mimos e loading post-it preservado.

## Endpoints adicionados
- `GET /api/roleta/options`
- `GET /api/roleta/summary`
- `GET /api/roleta/gifts`
- `POST /api/roleta/gifts`
- `PUT /api/roleta/gifts/:id`
- `PATCH /api/roleta/gifts/:id/status`
- `DELETE /api/roleta/gifts/:id`
- `POST /api/roleta/spin`
- `GET /api/roleta/spins`
- `POST /api/roleta/ai-suggestions`

## Como rodar
```bash
npm install
npm run db:migrate
npm run db:seed
npm start
```

## Como testar
- Acesse `/admin/roleta-de-mimos`.
- Cadastre um mimo.
- Edite probabilidade e custo.
- Gere sugestões.
- Faça uma simulação de sorteio.
- Confira o histórico e os indicadores.

## Observações
- A IA desta etapa é simulada/local para não travar o sistema nem depender de OpenAI.
- As tabelas `gifts` e `gift_spins` já existiam na base limpa e foram aproveitadas.
- O projeto permanece sem tenant, sem SaaS e sem master admin.

## Próxima versão
- `petfunny-os-v1.4-configuracoes.zip`

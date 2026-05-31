# FunnyOS v1.6.30 — Sprint 4 IA de Cuidados

## O que foi implementado

- Endpoint `GET /api/app/pets/:petId/care-insights`.
- Insight local/fallback sem depender de OpenAI.
- Regras por raça, porte, pelagem, histórico de agendamentos, pacote ativo e Saúde 360.
- CTA automático para:
  - Agendar teleconsulta;
  - Agendar banho;
  - Agendar banho/tosa;
  - Ver pacote;
  - Ver Saúde 360.
- Card **IA de Cuidados** na Home do Tutor.
- Evento de **IA de Cuidados** na Timeline do Tutor.
- Payload `careInsight` incluído em `/api/app/summary` e `/api/app/engagement/summary`.
- Estilo mobile-first em `frontend/assets/css/app.css`.

## Arquivos alterados

- `backend/src/app.js`
- `frontend/pages/app/home/index.html`
- `frontend/assets/css/app.css`

## Nova rota

```http
GET /api/app/pets/:petId/care-insights
```

Resposta esperada:

```json
{
  "ok": true,
  "insight": {
    "petId": "uuid",
    "title": "Pelagem pede rotina preventiva",
    "message": "...",
    "priority": "normal",
    "ctaLabel": "Agendar banho/tosa",
    "ctaAction": "grooming",
    "url": "/app/agenda",
    "source": "local_rules",
    "facts": ["Raça: Shih-tzu", "Porte: pequeno", "Pelagem: longa"]
  }
}
```

## Como testar

1. Rode:

```bash
npm start
```

2. Acesse:

```text
http://localhost:3000/app
```

3. Faça login no App do Tutor.
4. Confira na Home o card **IA de Cuidados**.
5. Confira na Timeline o evento de IA de Cuidados.
6. Teste diretamente:

```text
GET /api/app/pets/:petId/care-insights
```

## Observações

- Não exige migration.
- Não depende de `OPENAI_API_KEY`.
- Não altera Financeiro 360, Pix, cartão, Agenda, Pacotes ou Saúde 360.
- A lógica foi criada como fallback seguro e pode futuramente ser enriquecida com OpenAI.

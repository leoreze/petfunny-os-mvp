# FunnyOS v1.6.86 — Radar IA de Clientes

## Entrega

Nova página administrativa `/admin/radar-clientes` com fila diária inteligente de relacionamento via WhatsApp.

## Incluído

- Novo menu: **Radar IA Clientes**.
- Novo endpoint: `GET /api/client-radar/daily`.
- IA operacional local com opção de refinamento OpenAI quando `OPENAI_API_KEY` estiver configurada.
- Análise de tutores por:
  - último atendimento;
  - primeiro acesso ao app;
  - pacotes perto do fim;
  - pendências financeiras;
  - histórico de WhatsApp outbound;
  - quantidade de pets e serviços.
- Lista com:
  - nome do tutor;
  - situação/status;
  - cadência segura de envio;
  - motivo;
  - benefício ao enviar;
  - mensagem sugerida;
  - botão de copiar;
  - botão de enviar WhatsApp.
- Big numbers iniciais:
  - tutores na análise;
  - pode enviar hoje;
  - prioridade alta;
  - aguardar cadência.

## Banco

Não altera banco.

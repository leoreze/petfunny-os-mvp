# FunnyOS v1.6.87 — Avaliação Pública Pós-Serviço

## Incluído

- Página pública mobile-first de avaliação em `/avaliacao/:token`.
- Link automático de avaliação na mensagem gerada quando o agendamento é finalizado.
- Avaliação simples com 5 carinhas coloridas em escala termômetro: vermelho até verde.
- Confirmação pública após envio da avaliação.
- Novo menu admin **Avaliações** em `/admin/avaliacoes`.
- Big numbers de avaliações: total, respondidas, média e pendentes.
- Lista admin com tutor, pet, serviços, data, nota, status e ações.
- Botão para copiar link e enviar WhatsApp de avaliação.
- Tabela `service_reviews` criada automaticamente no primeiro uso e incluída na migration.

## Banco

A tabela é criada automaticamente no primeiro uso. Para banco zerado, a migration já contém a tabela.

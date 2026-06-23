# FunnyOS v1.6.21 — Triagem Diária Inteligente Saúde 360

## O que foi implementado
- Card diário na Timeline do App do Tutor com tema rotativo de triagem.
- Temas alternados: apetite, água, energia, fezes, sono, pele/pelagem e respiração.
- Modal de triagem diária com perguntas específicas do tema do dia.
- Envio para a IA/engine Saúde 360 existente.
- Devolutiva salva em `pet_health_triages` e no prontuário `pet_medical_records`.
- CTA para teleconsulta veterinária e agendamento de banho/tosa após a devolutiva.
- Card destacado dentro de `/app/saude-360` para estimular resposta diária.

## Observações
- Não exige nova migration porque usa as tabelas de triagem e prontuário já existentes.
- A IA continua segura: não diagnostica e não prescreve medicamentos.
- As respostas diárias alimentam o prontuário e melhoram o histórico preventivo do pet.

## Como rodar
```bash
npm start
```

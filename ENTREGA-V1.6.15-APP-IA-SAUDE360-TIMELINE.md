# FunnyOS v1.6.15 — App IA Saúde 360 Timeline

## O que foi ajustado

- App do Tutor com maior presença de Saúde 360 e PetFunny 360 IA na timeline.
- Timeline passa a receber eventos reais de triagens Health 360 e teleconsultas.
- Timeline inclui CTAs recorrentes para:
  - Agendar teleconsulta veterinária;
  - Agendar banho, tosa e cuidados PetFunny;
  - Abrir Saúde 360;
  - Responder PetFunny 360 IA.
- Formulário “Meu pet está estranho” ampliado para coletar mais dados preventivos:
  - energia;
  - sono;
  - apetite;
  - ingestão de água;
  - comportamento;
  - vômito;
  - diarreia;
  - respiração;
  - dor;
  - pele/pelagem/coceira;
  - olhos/ouvidos;
  - urina;
  - fezes;
  - vacinas/preventivos;
  - eventos críticos;
  - medicamentos/histórico;
  - outros sinais.
- Análise Health 360 IA mais completa, com:
  - risco baixo, atenção ou urgente;
  - resumo;
  - possíveis causas gerais;
  - plano de observação;
  - sugestões de cuidado;
  - sinais de alerta;
  - recomendação de teleconsulta ou emergência.
- Prontuário salva descrição mais rica da triagem.

## Segurança

- A IA continua sem dar diagnóstico definitivo.
- A IA continua sem prescrever medicamentos.
- Casos críticos continuam orientando emergência presencial.

## Banco

- Sem migration.
- Dados extras são persistidos no `raw_result` da triagem e no prontuário.

## Como rodar

```bash
npm start
```

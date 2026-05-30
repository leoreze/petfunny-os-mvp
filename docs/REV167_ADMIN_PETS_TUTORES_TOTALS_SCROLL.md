# REV 1.6.7 — Admin Pets/Tutores Totais e Scroll Progressivo

## Ajustes
- Big numbers de `/admin/pets` agora usam totais retornados pela API, independentes da quantidade já carregada na rolagem.
- Big numbers de `/admin/tutores` agora usam totais retornados pela API, independentes da quantidade já carregada na rolagem.
- Rodapé das listagens mostra contador de carregamento progressivo, exemplo: `100/150 pets carregados` e `100/150 tutores carregados`.
- Endpoints `/api/pets` e `/api/tutores` retornam objeto `stats` com métricas agregadas do resultado completo.
- Sem alteração de layout global, banco ou migrations.

## Como testar
1. `npm start`
2. Acesse `/admin/pets`.
3. Confira se os big numbers mostram o total completo, mesmo com apenas o primeiro lote carregado.
4. Role até o fim e confira o contador `carregados/total`.
5. Repita em `/admin/tutores`.

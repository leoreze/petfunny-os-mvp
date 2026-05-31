# FunnyOS v1.6.32 — Momentos Scroll + Avatar Fix

## Ajustes
- Corrigida rolagem dupla em `/app/momentos`.
- Mantida apenas a rolagem principal do App do Tutor.
- Foto do pet no card “Meus pets” agora aparece pequena, redonda e no padrão visual da tela de Pets.
- Sem alteração de banco, APIs ou regras de negócio.

## Como rodar
```bash
npm start
```

## Teste
1. Abrir `http://localhost:3000/app/momentos`.
2. Confirmar que existe apenas uma barra de rolagem vertical.
3. Conferir o card “Meus pets”.
4. Validar que a foto do pet aparece pequena e circular.

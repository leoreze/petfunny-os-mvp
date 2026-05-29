# PetFunny OS v1.5.84 — Landing com mascote animado no hero

## O que foi feito
- Inserido mascote PetFunny animado no lado direito do hero da landing.
- Adicionado segundo mascote menor como detalhe visual complementar.
- As imagens foram otimizadas em WebP com transparência.
- A animação foi implementada via CSS, sem gerar imagem estática.
- Mantida a landing existente, galeria, app mockup, CTAs e navegação.

## Arquivos alterados
- frontend/index.html
- frontend/assets/css/app.css

## Arquivos criados
- frontend/assets/img/landing/mascotes/mascote-banho-tosa.webp
- frontend/assets/img/landing/mascotes/mascote-toalha.webp

## Como testar
```bash
npm start
```

Acesse:
```txt
http://localhost:3000/
```

## Observações
- Não há migration obrigatória.
- A animação respeita `prefers-reduced-motion`.

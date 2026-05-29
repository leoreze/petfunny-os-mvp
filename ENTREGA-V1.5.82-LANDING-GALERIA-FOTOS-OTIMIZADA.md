# Versão v1.5.82 — Landing com galeria real otimizada

## O que foi feito
- Adicionada galeria de fotos reais do PetFunny na landing pública.
- Fotos otimizadas em WebP para carregamento rápido no celular.
- Criadas versões em thumbnail e versões maiores para melhor equilíbrio entre qualidade e performance.
- Mantida a paleta visual alinhada à logo PetFunny: rosa/salmão, turquesa, branco e grafite.
- Refinado o header estilo post-it, os itens do menu e os gradientes dos botões para remover qualquer laranja fora do padrão.
- Melhorado o mockup visual do app com cores consistentes da marca.
- Serviços continuam sem preço na landing.

## Arquivos alterados
- frontend/index.html
- frontend/assets/css/app.css

## Arquivos criados
- frontend/assets/img/landing/pets/petfunny-galeria-01.webp
- frontend/assets/img/landing/pets/petfunny-galeria-01-thumb.webp
- frontend/assets/img/landing/pets/petfunny-galeria-02.webp
- frontend/assets/img/landing/pets/petfunny-galeria-02-thumb.webp
- frontend/assets/img/landing/pets/petfunny-galeria-03.webp
- frontend/assets/img/landing/pets/petfunny-galeria-03-thumb.webp
- frontend/assets/img/landing/pets/petfunny-galeria-04.webp
- frontend/assets/img/landing/pets/petfunny-galeria-04-thumb.webp
- frontend/assets/img/landing/pets/petfunny-galeria-05.webp
- frontend/assets/img/landing/pets/petfunny-galeria-05-thumb.webp
- frontend/assets/img/landing/pets/petfunny-galeria-06.webp
- frontend/assets/img/landing/pets/petfunny-galeria-06-thumb.webp
- frontend/assets/img/landing/pets/petfunny-galeria-07.webp
- frontend/assets/img/landing/pets/petfunny-galeria-07-thumb.webp
- frontend/assets/img/landing/pets/petfunny-galeria-08.webp
- frontend/assets/img/landing/pets/petfunny-galeria-08-thumb.webp
- frontend/assets/img/landing/pets/petfunny-galeria-09.webp
- frontend/assets/img/landing/pets/petfunny-galeria-09-thumb.webp
- frontend/assets/img/landing/pets/petfunny-galeria-10.webp
- frontend/assets/img/landing/pets/petfunny-galeria-10-thumb.webp

## Como testar
```bash
npm start
```

Acesse:

```txt
http://localhost:3000/
```

Também funciona em:

```txt
http://localhost:3000/site
http://localhost:3000/landing
```

## Observações
- Não há migration obrigatória.
- As imagens originais não foram incluídas; apenas versões WebP otimizadas para a landing.
- O carregamento usa `loading="lazy"` e `decoding="async"`.

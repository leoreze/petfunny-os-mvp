# PetFunny OS v1.5.79 — Landing page premium pública

## Versão entregue
`petfunny-os-v1.5.79-landing-page-premium.zip`

## O que foi feito
- Recriada a página pública `/` como landing page premium do PetFunny.
- Adicionados CTAs fortes para:
  - Agendamento pelo App do Tutor;
  - WhatsApp;
  - Primeiro acesso do cliente;
  - Admin.
- Adicionadas seções de copywriting:
  - Hero premium;
  - Serviços;
  - Fotos/experiência;
  - App do Tutor;
  - Pacotes e recorrência;
  - Depoimentos;
  - Endereço, horários e redes sociais;
  - CTA final.
- Criada galeria visual com imagens SVG locais, sem dependência de CDN externa.
- A landing consome `/api/public/site` para preencher automaticamente:
  - nome do comércio;
  - WhatsApp;
  - endereço;
  - cidade/estado;
  - redes sociais configuradas;
  - SEO configurado;
  - serviços ativos;
  - horários de funcionamento.
- Criadas rotas públicas alternativas:
  - `/site`
  - `/landing`
- Mantido `/` como a nova landing principal.

## Arquivos alterados
- `frontend/index.html`
- `frontend/assets/css/app.css`
- `frontend/assets/js/landing.js`
- `backend/src/app.js`

## Arquivos criados
- `frontend/assets/img/landing-pet-hero.svg`
- `frontend/assets/img/landing-gallery-banho.svg`
- `frontend/assets/img/landing-gallery-tosa.svg`
- `frontend/assets/img/landing-gallery-app.svg`
- `ENTREGA-V1.5.79-LANDING-PAGE-PREMIUM.md`

## Como testar
1. Rode o projeto:
   ```bash
   npm start
   ```
2. Acesse:
   ```txt
   http://localhost:3000/
   ```
3. Também teste:
   ```txt
   http://localhost:3000/site
   http://localhost:3000/landing
   ```
4. Confira se os CTAs abrem:
   - `/app/login`
   - WhatsApp com mensagem pronta
   - `/admin/login`

## Observações
- Não há migration obrigatória.
- A landing funciona mesmo se não houver serviços cadastrados, usando cards fallback.
- As redes sociais aparecem somente quando estiverem configuradas em Configurações.
- Os horários aparecem a partir da tabela `business_hours`.

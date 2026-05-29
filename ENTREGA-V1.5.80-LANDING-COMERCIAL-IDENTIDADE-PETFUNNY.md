# PetFunny OS v1.5.80 — Landing comercial com identidade PetFunny

## O que foi feito
- Landing page pública refeita com paleta da logo PetFunny: rosa/salmão, coral, turquesa, branco e grafite.
- Copywriting mais comercial e focado em conversão.
- Hero com CTAs para App do Tutor e WhatsApp.
- Mockup 3D animado do App do Tutor baseado na interface real: timeline, pacote, roleta e comanda.
- Seção mostrando experiência multiplataforma: celular, tablet, desktop/web e PWA instalável.
- Post-its animados seguindo a linguagem visual do app.
- Serviços, pacotes, depoimentos, galeria, redes sociais, endereço e horários.
- Mantida integração com `/api/public/site` para puxar dados configurados no admin.

## Arquivos alterados
- `frontend/index.html`
- `frontend/assets/css/app.css`

## Como testar
```bash
npm start
```

Acesse:
- `http://localhost:3000/`
- `http://localhost:3000/site`
- `http://localhost:3000/landing`

## Observações
- Não há migration obrigatória.
- Não foram alterados admin, app do tutor, push ou backend funcional.

# Entrega v1.5.60 — App do Tutor Mobile-First

## Objetivo
Iniciar a evolução do App do Tutor/Cliente como uma experiência mobile-first, sem alterar a estabilidade do Admin PetFunny.

## O que foi feito
- Criada base visual mobile-first para `/app/home`.
- App passa a ter navegação inferior fixa, adequada para celular.
- Adicionados atalhos principais: Início, Agenda, Pets, Histórico e Perfil.
- Criadas rotas frontend para:
  - `/app/home`
  - `/app/agenda`
  - `/app/pets`
  - `/app/historico`
  - `/app/pacotes`
  - `/app/mimos`
  - `/app/perfil`
- Criado endpoint `/api/app/summary` para consolidar dados reais do tutor logado.
- O app agora exibe:
  - próximo atendimento;
  - quantidade de pets;
  - próximos agendamentos;
  - pacotes ativos;
  - histórico de atendimentos;
  - comandas e recibos;
  - sessões de pacote com badge `📦 1 de 4`;
  - perfil do tutor;
  - atalho de WhatsApp.
- Comanda e recibo de agendamentos vinculados a pacote continuam apontando para documentos consolidados do pacote.
- Adicionado bloco de experiência/carrossel explicando a jornada do app.
- Login e primeiro acesso continuam compatíveis com WhatsApp + senha.

## Arquivos alterados
- `backend/src/app.js`
- `frontend/pages/app/home/index.html`
- `frontend/assets/js/client-shell.js`
- `frontend/assets/css/app.css`

## Como rodar
```bash
npm install
npm start
```

## Como testar
1. Acesse `http://localhost:3000/app/primeiro-acesso`.
2. Informe o WhatsApp de um tutor existente.
3. Em desenvolvimento, use o código `123456`.
4. Crie a senha.
5. Acesse `http://localhost:3000/app/home`.
6. Navegue por:
   - Início;
   - Agenda;
   - Pets;
   - Histórico;
   - Pacotes;
   - Perfil.

## Observações
- Não há migration obrigatória nesta versão.
- A base de mimos foi preparada visualmente, mas ainda depende da integração futura com campanhas/roleta específicas para o tutor.
- O foco desta versão foi fundação mobile-first, dados reais e navegação fluida.

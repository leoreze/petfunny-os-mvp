# FunnyOS v1.6.52 — App do Tutor Home Mockup + Header/Footer Fixos

## O que foi feito

- Reorganizada a home do App do Tutor/PWA para seguir o mockup aprovado.
- Header superior fixo com logo do PetFunny à esquerda.
- Botão de notificações fixo à direita.
- Footer/menu inferior fixo no rodapé, sem arredondamento no container.
- Conteúdo central agora é a única área com rolagem/scroll.
- Página inicial reorganizada na ordem:
  1. Card hero do pet.
  2. Bloco “O que você deseja?”.
  3. Cards/botões principais.
  4. CTA “Indique e ganhe!”.
  5. Demais blocos do app.
- Cards rápidos atualizados com:
  - Agendar Serviço;
  - Meus Agendamentos;
  - Momentos Especiais;
  - Clube de Benefícios;
  - Saúde 360;
  - Tele Consulta Veterinária;
  - Meus Pets;
  - Histórico;
  - Fale Conosco.
- Menu inferior ajustado para:
  - Início;
  - Agendar;
  - Meus Pets;
  - Benefícios;
  - Perfil.
- Demais funcionalidades continuam no menu “Mais”.
- Adicionada opção de sair dentro de Perfil.

## Arquivos principais alterados

- `frontend/assets/js/client-shell.js`
- `frontend/pages/app/home/index.html`
- `frontend/assets/css/app.css`

## Banco de dados

- Não altera banco.
- Não precisa rodar migration.

## Como rodar

```bash
npm install
npm start
```

## Como testar

1. Acesse `/app` ou `/app/home`.
2. Verifique o header fixo com logo à esquerda e notificações à direita.
3. Role a tela e confirme que apenas o conteúdo central rola.
4. Verifique o footer fixo no rodapé sem arredondamento do container.
5. Confira a ordem da home: hero, “O que você deseja?”, cards, CTA e demais blocos.
6. Teste os botões dos cards rápidos.
7. Acesse Perfil e teste o botão “Sair do app”.

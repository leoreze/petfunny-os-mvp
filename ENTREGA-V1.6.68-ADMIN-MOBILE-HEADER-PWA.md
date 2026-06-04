# FunnyOS v1.6.68 — Admin Mobile Header + PWA

## O que foi feito

- Header mobile do Admin agora mostra somente o ícone/logo redondo do PetFunny.
- Ícone de notificações e ícone do usuário aparecem ao lado do botão sanduíche.
- Botão sanduíche redesenhado com estilo premium.
- Menu lateral mobile abre da esquerda por cima de tudo, com z-index máximo seguro.
- Backdrop do menu também ficou acima da interface.
- Adicionado manifesto PWA específico do Admin: `/admin-manifest.webmanifest`.
- Admin registra service worker e abre convite automático para instalar o painel como PWA.

## Observação técnica

Navegadores não permitem instalar um PWA totalmente sem ação do usuário. A versão abre automaticamente o convite de instalação; o clique final em “Instalar agora” ainda depende da permissão do navegador.

## Banco

Não altera banco. Não precisa rodar migration.

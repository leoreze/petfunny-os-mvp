# PetFunny OS v1.5.44 — Links rápidos operacionais

## O que foi feito

- Adicionados cards de links rápidos no Dashboard:
  - Novo Agendamento
  - Novo Tutor
  - Novo Pet
  - Vender Pacote
- Os atalhos levam diretamente para o fluxo correto:
  - `/admin/agenda?new=1`
  - `/admin/tutores?new=1`
  - `/admin/pets?new=1`
  - `/admin/pacotes?sell=1`
- As páginas de Tutores, Pets e Pacotes agora interpretam os parâmetros de URL para abrir o modal correspondente automaticamente.
- Visual dos cards segue o design system premium atual do PetFunny OS.

## Como testar

1. Acesse `/admin/dashboard`.
2. Clique em cada card de link rápido.
3. Confirme se o modal/fluxo abre automaticamente na página de destino.

## Base

Versão criada em cima da v1.5.43.

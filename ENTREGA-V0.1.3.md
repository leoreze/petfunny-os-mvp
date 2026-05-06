# PetFunny OS — v0.1.3 Design System Responsivo

## Versão entregue
`petfunny-os-v0.1.3-design-system-responsivo.zip`

## O que foi feito
- Padronização visual do sistema com paleta azul/ciano/rosa da marca PetFunny.
- Menu desktop fixo com recolhimento ao clicar na logo.
- Menu mobile com logo horizontal, botão sanduíche, abertura lateral animada, backdrop e botão fechar no canto superior direito.
- Remoção visual do badge `tenant=false` do header.
- Novo menu de perfil com: Perfil, Termos de Uso e Responsabilidade, Suporte e Sair.
- Conteúdo das páginas ocupando 100% da área disponível, com margem lateral segura para não grudar nas bordas.
- Logo horizontal com simulação de post-it animado por baixo na área do menu.
- Inputs, selects, textarea e botões padronizados.
- Botões padrão: salvar, editar, cancelar, fechar e OK.
- Modal demonstrativo com header e footer fixos e scroll interno estilizado.
- Loading seguro com logo horizontal animada por CSS.
- Listagem demonstrativa com filtros no header, cabeçalho ordenável visual, scroll e carregamento infinito simulado.
- Cards premium com menu de três pontinhos.
- Big number cards padronizados.
- Agenda visual simulada com calendário, colunas, cards e drag and drop visual.
- Páginas de módulos atualizadas para herdar o novo shell visual.

## Observações
- O projeto não tinha um GIF horizontal específico disponível; por estabilidade, foi usada a logo horizontal existente com animação em CSS no loading e nos modais.
- A versão continua sem banco obrigatório, sem tenant ativo, sem SaaS e sem DDL em runtime.
- Esta entrega é uma revisão visual da base antes da v0.2 de banco e migrations.

## Como rodar
```bash
npm install
npm start
```

## Como testar
- Abrir `http://localhost:3000/admin/dashboard`.
- Reduzir a largura do navegador para mobile.
- Confirmar que aparece logo horizontal + botão sanduíche.
- Clicar no botão sanduíche e validar menu lateral vindo da esquerda.
- Clicar no X para fechar.
- No desktop, clicar na logo do menu para recolher/expandir.
- Testar botão de perfil no topo.
- Testar botão `Simular aguarde`.
- Testar `/api/health` pelo botão do dashboard.

## Próxima versão
`petfunny-os-v0.2-database.zip`

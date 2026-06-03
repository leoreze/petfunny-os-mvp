# FunnyOS v1.6.53 — App Tutor Layout Fix

## O que foi feito

- Ajustado o PWA do tutor em `/app`.
- Header fixo com cantos inferiores arredondados.
- Footer fixo com cantos superiores arredondados.
- Área central com scroll interno, sem exibir barra de rolagem.
- Card hero da home ficou mais alto para evitar corte de conteúdo/foto.
- Correção preventiva de sobreposição de conteúdo nas telas internas do app.
- Menu inferior reorganizado com botão **Mais** na mesma linha dos demais itens.
- Menu **Mais** com três pontinhos e estilo visual igual ao footer.
- Ícones do footer com margem inferior de 10px até o texto.
- Botões circulares do footer com padding maior e melhor estado ativo.

## Arquivos alterados

- `frontend/assets/js/client-shell.js`
- `frontend/assets/css/app.css`

## Banco de dados

Não altera banco.

Não precisa rodar migration.

## Como rodar

```bash
npm install
npm start
```

## Como testar

1. Abrir `/app` ou `/app/home`.
2. Confirmar header fixo com logo à esquerda e notificações à direita.
3. Confirmar footer fixo no rodapé com: Início, Agendar, Meus Pets, Benefícios e Mais.
4. Clicar em **Mais** e validar abertura do menu extra.
5. Rolar a home e validar que apenas o conteúdo central rola.
6. Validar que a barra de rolagem não aparece visualmente.
7. Abrir telas internas, como Agenda, Saúde 360, Momentos, Pets e Perfil, e conferir que o conteúdo não sobrepõe header/footer.

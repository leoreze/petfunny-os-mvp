# PetFunny OS v1.5.121 — Header fixo unificado e agenda filtros

## Ajustes
- Header/nav fixo, branco e arredondado na landing principal `/` e na página `/franquias`.
- Header das duas landings com o mesmo comportamento durante a rolagem.
- CTA principal do header de `/franquias` alterado para `Contato`.
- Hero de `/franquias` alinhado à mesma largura do conteúdo/nav.
- Filtros da agenda ajustados para impedir sobreposição entre `Data base` e `Status`.

## Teste
```bash
npm start
```

Acessar:
- http://localhost:3000/
- http://localhost:3000/franquias
- http://localhost:3000/admin/agenda

Não precisa rodar migration.

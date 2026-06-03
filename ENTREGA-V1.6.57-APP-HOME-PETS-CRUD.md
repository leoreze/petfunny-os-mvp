# FunnyOS v1.6.57 — App Tutor Home + Pets Detalhado + CRUD

## Ajustes implementados

- Corrigido subtítulo dos cards hero em `/app/agenda` e `/app/agendamentos`.
- Aplicado padding inferior e respiro visual nos heroes para evitar sobreposição com o card seguinte.
- Reordenada a Home do App Tutor:
  1. O que você deseja?
  2. Big numbers
  3. Próximo cuidado / Pacote ativo / Ossinhos PetFunny / Status do tutor
  4. CTA Indique e ganhe
  5. demais blocos
- CTA “Indique e ganhe” aumentado e com informações visíveis.
- `/app/pets` agora tem botão **Selecionar** em cada pet.
- Criada tela individual do pet em `/app/pets/:id`.
- Tela do pet com card principal contendo foto, nome e botão de edição.
- Criadas áreas do pet:
  - Dados do Pet
  - Histórico de Serviços
  - Histórico de Vacinas
  - Alergias e observações
  - Documentos
- Criado CRUD de registros vinculados ao pet usando `pet_medical_records`.
- Documentos aceitam upload de arquivo via DataURL vinculado ao registro do pet.

## Banco

Não cria tabela nova.
Usa a tabela existente `pet_medical_records`.
Não precisa rodar migration.

## Como rodar

```bash
npm install
npm start
```

## Validação

- `node --check backend/src/app.js`
- `node --check frontend/assets/js/client-shell.js`
- `node --check tmp_app_home_check.mjs`
- `unzip -t`

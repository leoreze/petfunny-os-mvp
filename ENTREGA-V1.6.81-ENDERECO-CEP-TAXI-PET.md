# FunnyOS v1.6.81 — Endereço unificado CEP + Táxi Pet Admin/App

## O que foi feito
- Corrigida a listagem de tutores para retornar endereço completo estruturado ao Admin.
- Admin Agenda agora consegue calcular Táxi Pet usando o endereço cadastrado pelo tutor no App.
- Card “Precisa de Táxi Pet?” no Admin Agenda recebeu margem superior de 15px.
- Cadastro de Tutor no Admin agora possui CEP, rua, número, bairro, cidade e UF.
- Campo CEP no Admin Tutor tem máscara e busca automática via ViaCEP.
- Perfil do Tutor no App agora usa CEP com máscara e autopreenchimento via ViaCEP.
- Primeiro acesso do App também ganhou CEP com máscara e autopreenchimento automático.
- Backend de criação/edição de tutor passa a salvar address_number, address_neighborhood e address_zipcode.
- Fluxo de primeiro acesso do App salva endereço completo estruturado.

## Banco
- Não cria tabela nova.
- Não precisa rodar migration, assumindo as colunas já existentes usadas pelo App: address_number, address_neighborhood e address_zipcode.

## Como rodar
```bash
npm install
npm start
```

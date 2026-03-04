# Sistema de Controle de Obras (Obra360)

> **Nota:** Este projeto está configurado para deploy no Vercel.

Sistema para gestão financeira e física de obras, com foco em controle de Capex/Opex e ativos imobilizados.

## Funcionalidades Principais
  
- **Dashboard**: Visão consolidada de orçamento vs realizado.
- **Obras**: Cadastro e fluxo de aprovação de projetos.
- **Budgets**: Gestão orçamentária detalhada.
- **Ativos**: Controle de ativos em andamento e cálculo de depreciação.
- **Inventário**: Agendamento e realização de inventário físico.

## Stack Tecnológica

- **Frontend**: React, Vite, TypeScript, Tailwind CSS, Shadcn/ui
- **Backend**: Node.js, Express, tRPC
- **Banco de Dados**: Firebase Firestore

## Como rodar

1. Instale as dependências: `npm install` ou `yarn`
2. Copie o arquivo `.env.example` para um novo arquivo chamado `.env` na raiz do projeto.
3. Abra o arquivo `.env` e preencha a variável `FIREBASE_SERVICE_ACCOUNT_KEY` com a sua chave de serviço do Firebase. As instruções detalhadas estão no próprio arquivo.
4. Inicie o servidor de desenvolvimento: `npm run dev`
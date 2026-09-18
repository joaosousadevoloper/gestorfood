# Giro Pizza

Base SaaS multiempresa para lanchonetes e pizzarias: autenticação, lojas separadas, pedidos, cardápio, clientes e movimentações de caixa.

## Rodar localmente

1. Crie um projeto no Supabase.
2. No **SQL Editor**, execute [`supabase/schema.sql`](supabase/schema.sql).
3. Copie `.env.example` para `.env.local` e preencha a URL e a **publishable key** do Supabase. Nunca use a `service_role` no frontend.
4. Instale e execute:

```bash
npm install
npm run dev
```

## Publicar

1. Envie a pasta `app/` para um repositório GitHub.
2. Importe o repositório no Vercel.
3. Configure as mesmas variáveis de ambiente de `.env.local` no projeto Vercel.
4. Publique. A URL será o painel administrativo; a página pública de cardápio entra na próxima etapa.

## O que já está conectado

- Cadastro/autenticação de usuários via Supabase Auth.
- Criação da primeira loja e vínculo do dono.
- Isolamento por estabelecimento no banco, com RLS.
- Cadastro de pedidos, itens de cardápio, clientes e movimentações de caixa.
- Atualização de status da produção.

## Próxima implementação

- Página pública `pedido/{slug}` com carrinho e fechamento seguro via função de backend.
- Entregadores, cálculo de taxa e link de rota.
- Disparo por WhatsApp Business API feito por função segura.
- Estoque, ficha técnica, relatórios e emissão fiscal.
# gestorfood

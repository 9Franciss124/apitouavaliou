# Loja Apitou Avaliou — pagamento e frete automáticos

O site calcula o frete pelo CEP (Melhor Envio) e leva o cliente para pagar no Mercado Pago (Pix ou cartão). Os preços são conferidos no servidor, então ninguém consegue mudar o valor pelo navegador.

## O que tem aqui
- `public/index.html` — o site (simulador, endereço, frete, botão de pagar)
- `public/obrigado.html` — página para onde o cliente volta depois de pagar
- `api/frete.js (lógica em server/frete.js)` — calcula as opções de entrega pelo CEP
- `api/checkout.js (lógica em server/checkout.js)` — cria o pagamento no Mercado Pago
- `api/webhook.js (lógica em server/webhook.js)` — recebe o aviso de pagamento aprovado (e-mail opcional)

## 1. Pegue as chaves (guarde em segredo; não mande por chat nem e-mail)
**Mercado Pago**
1. Entre em mercadopago.com.br/developers e crie uma aplicação (Checkout Pro / pagamentos online).
2. Em "Credenciais de produção", copie o **Access Token**.

**Melhor Envio**
1. Crie conta em melhorenvio.com.br e preencha seu cadastro.
2. Na área de integrações/tokens, gere um token com permissão de **cálculo de frete** (shipping-calculate).

## 2. Publique na Vercel
1. Crie uma conta grátis em github.com e um repositório novo. Use "Add file > Upload files" e envie TODO o conteúdo desta pasta (mantendo as pastas `public`, `api` e `server`).
2. Na vercel.com: Add New > Project > importe o repositório do GitHub. Em "Framework Preset" deixe **Other**. Não precisa mudar build nem pastas.
3. ANTES de clicar em Deploy, abra "Environment Variables" e crie estas variáveis:

| Nome | Valor |
|---|---|
| `MP_ACCESS_TOKEN` | Access Token do Mercado Pago |
| `ME_TOKEN` | token do Melhor Envio |
| `ME_CONTATO_EMAIL` | e-mail de contato (o Melhor Envio exige) |
| `ORIGEM_CEP` | CEP de onde você envia as placas |
| `SITE_URL` | endereço final do site, ex.: https://apitouavaliou.vercel.app (sem barra no final) |
| `PESO_PLACA_KG` | peso real de 1 placa embalada, ex.: 0.15 (pese uma na balança) |
| `COMPRIMENTO_CM`, `LARGURA_CM`, `ALTURA_CM` | medidas de 1 placa embalada (padrão: 20, 15, 3) |

Opcional, para receber e-mail de pedido pago: crie conta grátis no resend.com e adicione `RESEND_API_KEY` e `NOTIFY_EMAIL` (seu e-mail).
4. Clique em Deploy. Se o endereço que a Vercel der for diferente do `SITE_URL` que você digitou, corrija a variável em Settings > Environment Variables e faça Redeploy.

## 3. Avise o Mercado Pago do endereço de notificações
No painel da sua aplicação, em Webhooks/Notificações, informe `SITE_URL/api/webhook` (ex.: https://apitouavaliou.vercel.app/api/webhook) e marque "Pagamentos".

## 4. Teste antes de divulgar
1. Faça um pedido de 1 placa e pague de verdade (pode ser com o seu cartão ou Pix). Depois estorne pelo painel do Mercado Pago, se quiser.
2. Confira: o frete aparece com as opções, o valor no Mercado Pago bate com o total do site e o pedido aparece no seu painel do Mercado Pago com os dados do cliente.
3. Teste também um CEP de outra cidade.

## Domínio próprio
Registre apitouavaliou.com.br no registro.br e, na Vercel, vá em Settings > Domains > Add. Depois atualize `SITE_URL` e o endereço do webhook.

## Mudar preços
Os preços ficam em dois lugares: no começo de `server/_lib.js` (valem para a cobrança) e no `public/index.html` (o que o cliente vê). Altere nos dois.

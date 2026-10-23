# Changes review — messaging correctness and reliability

Registro das decisões tomadas durante a implementação das fases da revisão do
fluxo de mensageria. Cada entrada diz o que foi feito quando o código real
divergia da descrição da tarefa, ou quando havia mais de uma opção razoável.

## Registro de decisões

### Fase 1 — Bugs de correção

#### 1. Mensagens persistentes

- O helper ficou em `libs/messaging/rabbitmq/publishing/publish-event.ts`, com
  a assinatura sugerida `publishEvent(amqp, exchange, routingKey, event)`.
- O `correlationId` vem do contexto assíncrono (`CorrelationIdService`) e, se
  não houver contexto, do corpo do evento. Assim o helper funciona também fora
  de um consumidor ou request (ex.: o relay do outbox da Fase 2).
- O helper não aceita `options` extras de propósito: não há hoje nenhum
  publish que precise de outra opção, e aceitar `options` abriria a porta para
  alguém sobrescrever `persistent`.
- No `cancelOrder` do gateway, a variável `correlationId` que só alimentava o
  publish foi removida. Passá-la para o construtor do evento é item da Fase 4
  e ficou para lá.

#### 2. Tombstone no cancelamento

- **payment-service**: `CANCELLED` entrou no enum como estado terminal, com
  `PROCESSING → CANCELLED` na state machine; `amount` virou opcional. A
  tombstone é criada direto em `CANCELLED` (não é uma transição, por isso a
  state machine não precisa de um estado de origem para ela).
- No P2002 da tombstone, o pagamento criado pelo `order.created` é relido e
  segue para `cancelPaymentByStatus`, como pedido. Se ele estiver em
  `PROCESSING`, a transição condicional para `CANCELLED` ganha ou perde a
  corrida com a aprovação; se perder (já `APPROVED`), o
  `ConcurrentPaymentUpdateError` faz retry, e a releitura leva a `REFUNDED`.
- `handleOrderCreated` trata `CANCELLED` antes do ramo de "republicar
  resultado", com log próprio, e `publishResult` também não publica nada para
  `CANCELLED` (defesa dupla).
- **Métrica nova `payments_cancelled_total`**: o cancelamento em `PROCESSING`
  contava como `payments_declined_total{reason="order_cancelled"}`. Com o
  status `CANCELLED`, contar como decline seria enganoso e distorcia a taxa de
  aprovação do dashboard (o denominador soma os declines). O dashboard do
  Grafana não foi alterado (fora do escopo); o painel de declines por motivo
  simplesmente deixa de mostrar `order_cancelled`.
- **order-service**: `userId` e `total` viraram opcionais e o cancelamento de
  um pedido inexistente grava uma tombstone `CANCELLED` com o `orderId` do
  gateway. O `createOrder` que chega depois cai no P2002 já existente, encontra
  `CANCELLED` e não publica `order.created`. No P2002 da própria tombstone (o
  create gravou o pedido entre o update e o insert), a transição para
  `CANCELLED` é refeita sobre o pedido real.
- A tombstone de pedido **publica `order.cancelled`**, como qualquer
  cancelamento do usuário. É redundante (sem `order.created` não há pagamento),
  mas mantém um único caminho de código e é inofensivo: o payment-service
  grava a própria tombstone. Não encontrei desenho mais simples que evitasse a
  tombstone no order-service: não publicar o `orderId` antes de persistir
  exigiria o gateway falar com o banco do order-service.
- O `OrderCreatedEvent` passou a usar `userId`/`total` do payload em vez do
  registro, porque os campos agora são anuláveis no tipo. Só a tombstone tem
  nulos, e ela nunca chega a publicar `order.created`.
- Os DTOs de resposta (`amount`, `userId`, `total`) passaram a ser anuláveis.

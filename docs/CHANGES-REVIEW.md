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

#### 3. Persistir o motivo de decline/fail

- `failureReason` é gravado no mesmo `updateMany` condicional que faz a
  transição (o `transition` ganhou um parâmetro `data`), então status e motivo
  nunca ficam dessincronizados.
- `publishDeclined`/`publishFailed` passaram a receber só o `Payment` e a ler o
  motivo dele. No caminho normal, o objeto em memória recebe o motivo
  (`{ ...payment, failureReason }`) para não precisar reler o registro.
- Os textos `Insufficient funds` / `Unknown error` continuam como fallback,
  só para pagamentos decididos antes da coluna existir.
- `failureReason` também foi exposto no `PaymentResponseDto`, para que o
  cenário de validação "pagamento DECLINED com failureReason" seja
  verificável pela API.
- O `prisma format` realinhou as colunas do schema; o diff sem espaços é só a
  coluna nova.

#### 4. Remover o eco do decline

- O consumidor de resultados roteia `payment.declined` e `payment.failed` para
  o mesmo `failOrder`, que só faz a transição para `FAILED` e não publica nada.
  Não criei um método separado para decline porque o comportamento é idêntico.
- `cancelByPaymentDeclined` e `cancelOrderInternal` sumiram; a lógica de
  cancelamento ficou em `cancelByUser`, a única origem de `order.cancelled`.
- `CancelReason.PAYMENT_DECLINED` foi removido. O enum ficou só com
  `USER_REQUESTED`: mantive o campo `reason` no contrato para não quebrar
  consumidores e para abrir espaço a outros motivos no futuro.
- Efeito nas métricas: um decline passa a contar em `orders_failed_total` em
  vez de `orders_cancelled_total{reason="PAYMENT_DECLINED"}`. Isso corrige a
  semântica (o pedido fica `FAILED`); o dashboard não foi alterado.
- Teste novo `order.consumer.spec.ts` cobre o roteamento dos três resultados
  de pagamento, já que a mudança está no consumidor.

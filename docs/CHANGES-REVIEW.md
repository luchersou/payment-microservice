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

# 🧩 Payment Microservices System

A backend project that demonstrates a **microservices architecture** using **NestJS**, **RabbitMQ**, **Docker**, **PostgreSQL**, and **Prisma ORM**.
This project was built to showcase real-world backend architecture concepts such as **event-driven systems**, **Saga pattern (Choreography)**, **asynchronous processing**, and **distributed transaction management**.

![NestJS](https://img.shields.io/badge/nestjs-%23E0234E.svg?style=for-the-badge&logo=nestjs&logoColor=white)
![RabbitMQ](https://img.shields.io/badge/Rabbitmq-FF6600?style=for-the-badge&logo=rabbitmq&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/postgres-%23316192.svg?style=for-the-badge&logo=postgresql&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-3982CE?style=for-the-badge&logo=Prisma&logoColor=white)
![Docker](https://img.shields.io/badge/docker-%230db7ed.svg?style=for-the-badge&logo=docker&logoColor=white)
![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white)
![Prometheus](https://img.shields.io/badge/Prometheus-E6522C?style=for-the-badge&logo=prometheus&logoColor=white)
![Grafana](https://img.shields.io/badge/Grafana-F46800?style=for-the-badge&logo=grafana&logoColor=white)
[![CI](https://github.com/luchersou/payment-microservice/actions/workflows/ci.yml/badge.svg)](https://github.com/luchersou/payment-microservice/actions/workflows/ci.yml)

---

## 📐 Architecture

This project implements a **microservices architecture** with an **API Gateway** that orchestrates communication between services using both **synchronous HTTP** (for queries) and **asynchronous events** (for commands).
```mermaid
graph LR
    Client[Client] -->|HTTP| GW[API Gateway]

    GW -->|Events| RMQ[RabbitMQ]
    GW -.->|HTTP| Order[Order Service]
    GW -.->|HTTP| Payment[Payment Service]

    RMQ <-->|Events| Order
    RMQ <-->|Events| Payment

    Order --> OrderDB[(PostgreSQL<br/>Order DB)]
    Payment --> PaymentDB[(PostgreSQL<br/>Payment DB)]

    style GW fill:#4A90E2,color:#fff
    style RMQ fill:#FF6B35,color:#fff
    style Order fill:#50C878,color:#fff
    style Payment fill:#50C878,color:#fff
    style OrderDB fill:#9B59B6,color:#fff
    style PaymentDB fill:#9B59B6,color:#fff
```

### Architecture Highlights

- **API Gateway**: Single entry point for all client requests (port 3000)
- **Event-Driven Commands**: POST/PATCH operations emit events via RabbitMQ
- **Synchronous Queries**: GET operations make direct HTTP calls to microservices
- **Saga Pattern (Choreography)**: Distributed transactions coordinated through events, with compensating actions for failures and cancellations
- **Service Autonomy**: Each microservice has its own database and business logic
- **Decoupled Communication**: Services communicate through events, not direct calls

---

## 🏗️ Project Structure
```
payment-microservice/
├── apps/
│   ├── api-gateway/                 # API Gateway (Port 3000)
│   │   └── src/
│   │       ├── common/
│   │       │   ├── http/            # Downstream HTTP client + error mapping
│   │       │   └── middleware/      # Correlation ID
│   │       ├── config/              # Environment schema (validated at boot)
│   │       ├── modules/
│   │       │   ├── health/
│   │       │   ├── metrics/
│   │       │   ├── orders/
│   │       │   │   └── dto/
│   │       │   └── payments/
│   │       ├── app.module.ts
│   │       └── main.ts
│   │
│   ├── order-service/               # Order Microservice (Port 3001)
│   │   ├── prisma/                  # Schema, migrations, generated client
│   │   └── src/
│   │       ├── config/
│   │       ├── modules/
│   │       │   ├── health/
│   │       │   ├── metrics/
│   │       │   └── order/
│   │       │       ├── consumers/   # Main + DLQ consumers
│   │       │       ├── controllers/
│   │       │       ├── domain/      # Order state machine
│   │       │       ├── dto/
│   │       │       └── services/
│   │       ├── app.module.ts
│   │       └── main.ts
│   │
│   └── payment-service/             # Payment Microservice (Port 3002)
│       ├── prisma/
│       └── src/
│           ├── config/
│           ├── modules/
│           │   ├── health/
│           │   ├── metrics/
│           │   └── payment/
│           │       ├── consumers/
│           │       ├── controllers/
│           │       ├── domain/      # Payment state machine
│           │       ├── dto/
│           │       └── services/
│           ├── app.module.ts
│           └── main.ts
│
├── libs/
│   ├── contracts/                   # Shared contracts, split by domain
│   │   ├── order-events/            # Order domain events, types, and cancel reasons
│   │   └── payment-events/          # Payment domain events and types
│   │
│   ├── messaging/                   # Shared RabbitMQ module
│   │   └── rabbitmq/
│   │       ├── config/              # Connection, exchanges, queue options
│   │       ├── constants/           # Exchanges, queues, routing keys, DLQs
│   │       └── error-handling/      # Bounded retries + dead-lettering
│   │
│   └── common/                      # Shared utilities
│       ├── config/                  # Env validation helpers
│       ├── context/                 # Correlation ID (AsyncLocalStorage)
│       ├── events/                  # Generic BaseEvent
│       ├── health/                  # Database / RabbitMQ health checks
│       ├── logger/                  # Correlation-aware logger
│       ├── messaging/
│       └── metrics/                 # MetricNames (event_type label values)
│
├── monitoring/                      # Prometheus config + provisioned Grafana
│   ├── grafana/
│   │   └── provisioning/            # Datasource + Microservices Overview dashboard
│   └── prometheus.yml
│
├── scripts/
│   └── generate-traffic.mjs         # Load generator for the dashboard
│
├── .github/workflows/ci.yml         # Lint, type-check, tests, build
├── docker-compose.yml
└── README.md
```

---

## 🚀 Features

### ✅ API Gateway
- Single entry point for all client requests
- Routes queries (GET) directly to microservices via HTTP
- Emits commands as events via RabbitMQ exchanges without knowledge of downstream queues
- Generates the `orderId` and returns it immediately (`202 Accepted`), so clients can track the order
- Validates input: request bodies via DTOs and every `:id` / `:orderId` as a UUID (`400` otherwise)
- Maps downstream failures to gateway status codes (see [Error Responses](#-error-responses))
- Propagates a correlation ID (`x-correlation-id`) through HTTP calls and events

### ✅ Order Service
* Manages the order lifecycle with an explicit state machine:
  ```
  PENDING_PAYMENT ──► PAID ──► CANCELLED   (user cancel, payment refunded)
         │
         ├──► CANCELLED                    (user cancel)
         └──► FAILED                       (payment declined or failed)
  ```
  `CANCELLED` and `FAILED` are terminal
* Consumes `order.create.requested` and `order.cancel.requested` to create and cancel orders
* Consumes `payment.approved`, `payment.declined`, `payment.failed` to update the order status
* Emits `order.created` and `order.cancelled` to trigger downstream reactions
* RESTful API for order queries (GET endpoints)
* Isolated PostgreSQL database

### ✅ Payment Service
* Manages the payment lifecycle with an explicit state machine:
  ```
  PROCESSING ──► APPROVED ──► REFUNDED   (order cancelled after payment)
      │
      ├──► DECLINED                      (gateway declined, or order cancelled while processing)
      └──► FAILED                        (unexpected gateway error)
  ```
* Consumes `order.created` to process the payment and `order.cancelled` to decline or refund it
* Emits `payment.approved`, `payment.declined`, `payment.failed` based on the result
* Simulates a payment gateway (~1.5s latency, ~20% declined for insufficient funds)
* Provides payment statistics and queries
* Isolated PostgreSQL database

### ✅ Event-Driven Architecture
- RabbitMQ topic exchanges (`orders.exchange`, `payments.exchange`) for asynchronous pub/sub
- Each service owns its queues and binds them to the routing keys it consumes
- No shared queues between services
- Durable queues and persistent messages

### ✅ Reliability
- **Bounded retries**: a failing message is retried **3 times, 5 seconds apart** (through a `<queue>.retry` TTL queue), then sent to the service's **DLQ**
- **Dead letters are persisted** in a `failed_messages` table with the real error; if the database is down, the DLQ message is requeued instead of lost
- **Idempotent consumers**: redelivered messages never create duplicate orders or payments; if a previous attempt crashed after writing, the event is republished or the payment is resumed
- **Atomic state transitions**: every status change is a conditional update guarded by the state machine, so concurrent events (e.g. a cancel racing a payment approval) cannot overwrite each other
- **Out-of-order events**: a cancel that arrives before the order or payment exists is retried instead of dropped
- **Health checks** (database + RabbitMQ) used by Docker Compose, **graceful shutdown** on `SIGTERM`, and **environment validation** at boot

### ✅ Saga Pattern (Choreography)
- **Happy path**: `order.create.requested` → `order.created` → `payment.approved` → order `PAID`
- **Failure path**: `payment.declined` or `payment.failed` → order `FAILED`
- **Compensating transaction**: `order.cancel.requested` → order `CANCELLED` → `order.cancelled` → payment `DECLINED` (if still processing) or `REFUNDED` (if already approved)
- **No central coordinator**: each service reacts to domain events via its own queues and emits new events

### Messaging Design

| Exchange | Routing key | Published by | Consumed by (queue) |
|----------|-------------|--------------|---------------------|
| `orders.exchange` | `order.create.requested` | API Gateway | Order Service (`order.create.queue`) |
| `orders.exchange` | `order.cancel.requested` | API Gateway | Order Service (`order.cancel-requested.queue`) |
| `orders.exchange` | `order.created` | Order Service | Payment Service (`payment.order-created.queue`) |
| `orders.exchange` | `order.cancelled` | Order Service | Payment Service (`payment.order-cancelled.queue`) |
| `payments.exchange` | `payment.approved` / `payment.declined` / `payment.failed` | Payment Service | Order Service (`order.payment-result.queue`) |

Each queue has a `<queue>.retry` companion and a dead-letter queue bound on `dlx.exchange` (e.g. `order.create.dlq`).

---

## 🛠️ Technologies

| Technology | Purpose |
|------------|---------|
| **NestJS** | Backend framework for building scalable Node.js applications |
| **TypeScript** | Type-safe language for robust code |
| **RabbitMQ** | Message broker for event-driven architecture |
| **PostgreSQL** | Relational database for order and payment data |
| **Prisma ORM** | Type-safe database access and migrations |
| **Prometheus** | Metrics collection (services + RabbitMQ) |
| **Grafana** | Provisioned dashboard |
| **Jest** | Unit tests |
| **GitHub Actions** | CI: lint, type-check, tests, build |
| **Docker** | Containerization for consistent environments |
| **Docker Compose** | Multi-container orchestration |

---

## 📦 Installation

### Prerequisites

- **Docker** and **Docker Compose**
- **Node.js 20+** and **npm** (only for local development, tests, and the traffic generator)

### Steps

1. **Clone the repository**
```bash
   git clone https://github.com/luchersou/payment-microservice.git
   cd payment-microservice
```

2. **Start everything with Docker Compose** (services, databases, RabbitMQ, Prometheus, Grafana)
```bash
   docker compose up --build
```
   Migrations run automatically on startup. If port 3000 is already in use, pick another host port for the gateway:
```bash
   API_GATEWAY_PORT=3010 docker compose up --build
```

3. **Install dependencies locally** (optional: for tests, lint, and `npm run traffic`)
```bash
   npm install
```

### Ports

| Service | URL |
|---------|-----|
| API Gateway | http://localhost:3000/api |
| Order Service | http://localhost:3001 |
| Payment Service | http://localhost:3002 |
| Grafana | http://localhost:3003 |
| Prometheus | http://localhost:9090 |
| RabbitMQ Management | http://localhost:15672 |
| Order DB / Payment DB | `localhost:5433` / `localhost:5434` |

### Environment Variables

Validated at boot: a service with an invalid or missing variable fails to start and lists every problem. Docker Compose sets them for you.

| Variable | Used by | Default |
|----------|---------|---------|
| `PORT` | all | `3000` / `3001` / `3002` |
| `RABBITMQ_URL` | all | `amqp://localhost:5672` |
| `DATABASE_URL` | order, payment | **required** (`postgresql://...`) |
| `ORDER_SERVICE_URL` | gateway | `http://localhost:3001` |
| `PAYMENT_SERVICE_URL` | gateway | `http://localhost:3002` |
| `REQUEST_TIMEOUT` | gateway | `5000` (ms) |

---

## 📊 Observability

The stack ships with Prometheus and a provisioned Grafana dashboard. Nothing to import.

| Tool | URL | Credentials |
|------|-----|-------------|
| **Grafana** (dashboard *Microservices → Microservices Overview*) | http://localhost:3003 | `admin` / `admin123` |
| **Prometheus** (Status → Targets) | http://localhost:9090 | — |
| **RabbitMQ Management** | http://localhost:15672 | `admin` / `admin123` |

**Generate traffic** so the panels have data (needs the stack running and `npm install`):
```bash
npm run traffic                          # ~2 orders/s for 2 minutes
npm run traffic -- --duration 60 --rate 5
GATEWAY_URL=http://localhost:3010/api npm run traffic   # custom gateway port
```

The dashboard has five sections:

- **Overview**: services up, orders created, payment approval rate, gateway 5xx rate, retries and dead-lettered messages
- **Business**: orders and payments per second by outcome
- **API Gateway (HTTP)**: requests by route, responses by status code, p95 latency
- **Messaging (RabbitMQ)**: p95 processing time per event, queue depth (including `*.retry` and `*.dlq`), failed messages by outcome
- **Runtime (Node.js)**: CPU, memory and event loop lag per service

Scraped endpoints: `api-gateway:3000/api/metrics`, `order-service:3001/metrics`, `payment-service:3002/metrics`, and RabbitMQ's built-in exporter (`rabbitmq:15692/metrics/detailed`).

---

## 🔌 API Endpoints

All requests go through the **API Gateway** on `http://localhost:3000/api`

### 📋 Orders

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/orders` | Create an order (emits event, returns `orderId`) |
| `GET` | `/orders` | Get all orders (paginated, `page` / `limit` ≤ 100) |
| `GET` | `/orders/:id` | Get order by ID |
| `PATCH` | `/orders/:id/cancel` | Cancel an order (emits event) |

### 💳 Payments

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/payments` | Get all payments (paginated) |
| `GET` | `/payments/:id` | Get payment by ID |
| `GET` | `/payments/order/:orderId` | Get payment by order ID |
| `GET` | `/payments/stats` | Get payment statistics by status |

### ⚙️ Operations

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Gateway health (RabbitMQ). Services expose `GET /health` with database + RabbitMQ |
| `GET` | `/metrics` | Prometheus metrics |

### ❗ Error Responses

| Status | When |
|--------|------|
| `400 Bad Request` | Invalid body or an `:id` that is not a UUID |
| `404 Not Found` | Order or payment does not exist |
| `502 Bad Gateway` | A downstream service returned 5xx |
| `503 Service Unavailable` | A downstream service is unreachable |
| `504 Gateway Timeout` | A downstream service did not answer within `REQUEST_TIMEOUT` |

---

## 📡 Event Flow

### Create Order Flow
```
1. Client → POST /api/orders
2. API Gateway → Generate orderId
               → Emit order.create.requested → RabbitMQ
               → Respond 202 with orderId

3. Order Service → Consume order.create.requested
   - Persist order (status: PENDING_PAYMENT)
   - Emit order.created → RabbitMQ

4. Payment Service → Consume order.created
   - Create payment (status: PROCESSING)
   - Call the simulated payment gateway

5. Payment Service → Emit:
   - payment.approved
   - OR payment.declined
   - OR payment.failed

6. Order Service → Consume payment event
   - Update order status:
     - payment.approved → PAID
     - payment.declined → FAILED
     - payment.failed   → FAILED
```

### Cancel Order Flow
```
1. Client → PATCH /api/orders/:id/cancel
2. API Gateway → Emit order.cancel.requested → RabbitMQ

3. Order Service → Consume order.cancel.requested
   - If PENDING_PAYMENT or PAID → Update order status → CANCELLED
                                → Emit order.cancelled → RabbitMQ
   - If FAILED → Ignore (terminal)

4. Payment Service → Consume order.cancelled
   - If PROCESSING → Mark as DECLINED
   - If APPROVED   → Refund → Mark as REFUNDED
   - Otherwise     → Ignore
```
---

## 🧪 Example Requests

### 📋 Orders

#### Create Order
```bash
POST http://localhost:3000/api/orders
Content-Type: application/json

{
  "userId": "d55fa6d6-63c2-4633-aeaf-ecf0c80fb48f",
  "total": 999
}
```

**cURL:**
```bash
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "d55fa6d6-63c2-4633-aeaf-ecf0c80fb48f",
    "total": 999
  }'
```

**Response:** `202 Accepted`
```json
{
    "orderId": "476f5730-aa83-4ff0-ab9f-d6e19836e195",
    "message": "Order creation request accepted",
    "status": "PENDING"
}
```

#### Get All Orders (Paginated)
```bash
GET http://localhost:3000/api/orders?page=1&limit=10
```

**cURL:**
```bash
curl "http://localhost:3000/api/orders?page=1&limit=10"
```

**Response:**
```json
{
  "data": [
    {
      "id": "476f5730-aa83-4ff0-ab9f-d6e19836e195",
      "userId": "d55fa6d6-63c2-4633-aeaf-ecf0c80fb48f",
      "total": 999,
      "status": "PAID",
      "createdAt": "2026-02-15T01:42:19.000Z",
      "updatedAt": "2026-02-15T01:42:21.000Z"
    },
    {
      "id": "b7740f92-e574-4936-aa23-56f98ba61418",
      "userId": "d55fa6d6-63c2-4633-aeaf-ecf0c80fb48f",
      "total": 999,
      "status": "CANCELLED",
      "createdAt": "2026-02-15T01:42:39.000Z",
      "updatedAt": "2026-02-15T01:42:40.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 2,
    "totalPages": 1
  }
}
```

#### Get Order by ID
```bash
GET http://localhost:3000/api/orders/476f5730-aa83-4ff0-ab9f-d6e19836e195
```

**cURL:**
```bash
curl http://localhost:3000/api/orders/476f5730-aa83-4ff0-ab9f-d6e19836e195
```

**Response:**
```json
{
  "id": "476f5730-aa83-4ff0-ab9f-d6e19836e195",
  "userId": "d55fa6d6-63c2-4633-aeaf-ecf0c80fb48f",
  "total": 999,
  "status": "PAID",
  "createdAt": "2026-02-15T01:42:19.000Z",
  "updatedAt": "2026-02-15T01:42:21.000Z"
}
```

#### Cancel Order
```bash
PATCH http://localhost:3000/api/orders/476f5730-aa83-4ff0-ab9f-d6e19836e195/cancel
```

**cURL:**
```bash
curl -X PATCH http://localhost:3000/api/orders/476f5730-aa83-4ff0-ab9f-d6e19836e195/cancel
```

**Response:** `202 Accepted`
```json
{
    "orderId": "476f5730-aa83-4ff0-ab9f-d6e19836e195",
    "message": "Order cancellation request accepted"
}
```

---

### 💳 Payments

#### Get All Payments (Paginated)
```bash
GET http://localhost:3000/api/payments?page=1&limit=10
```

**cURL:**
```bash
curl "http://localhost:3000/api/payments?page=1&limit=10"
```

**Response:**
```json
{
  "data": [
    {
      "id": "8a5da4d7-3512-4c74-bd62-64b6c0e93e7a",
      "orderId": "476f5730-aa83-4ff0-ab9f-d6e19836e195",
      "amount": 999,
      "status": "APPROVED",
      "createdAt": "2026-02-15T01:42:19.500Z",
      "updatedAt": "2026-02-15T01:42:20.500Z"
    },
    {
      "id": "1220b65f-df5f-456d-8238-e03520bff097",
      "orderId": "b7740f92-e574-4936-aa23-56f98ba61418",
      "amount": 999,
      "status": "DECLINED",
      "createdAt": "2026-02-15T01:42:39.200Z",
      "updatedAt": "2026-02-15T01:42:40.200Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 2,
    "totalPages": 1
  }
}
```

#### Get Payment by ID
```bash
GET http://localhost:3000/api/payments/8a5da4d7-3512-4c74-bd62-64b6c0e93e7a
```

**cURL:**
```bash
curl http://localhost:3000/api/payments/8a5da4d7-3512-4c74-bd62-64b6c0e93e7a
```

**Response:**
```json
{
  "id": "8a5da4d7-3512-4c74-bd62-64b6c0e93e7a",
  "orderId": "476f5730-aa83-4ff0-ab9f-d6e19836e195",
  "amount": 999,
  "status": "APPROVED",
  "createdAt": "2026-02-15T01:42:19.500Z",
  "updatedAt": "2026-02-15T01:42:20.500Z"
}
```

#### Get Payment by Order ID
```bash
GET http://localhost:3000/api/payments/order/476f5730-aa83-4ff0-ab9f-d6e19836e195
```

**cURL:**
```bash
curl http://localhost:3000/api/payments/order/476f5730-aa83-4ff0-ab9f-d6e19836e195
```

**Response:**
```json
{
  "id": "8a5da4d7-3512-4c74-bd62-64b6c0e93e7a",
  "orderId": "476f5730-aa83-4ff0-ab9f-d6e19836e195",
  "amount": 999,
  "status": "APPROVED",
  "createdAt": "2026-02-15T01:42:19.500Z",
  "updatedAt": "2026-02-15T01:42:20.500Z"
}
```

#### Get Payment Statistics
```bash
GET http://localhost:3000/api/payments/stats
```

**cURL:**
```bash
curl http://localhost:3000/api/payments/stats
```

**Response:**
```json
{
  "byStatus": [
    {
      "status": "APPROVED",
      "count": 2,
      "totalAmount": 1998
    },
    {
      "status": "DECLINED",
      "count": 1,
      "totalAmount": 999
    }
  ]
}
```

---

## 🧑‍💻 Development

```bash
npm test               # unit tests (Jest)
npm run lint:check     # lint without fixing (npm run lint fixes)
npm run typecheck      # type-check, including specs
npm run build          # build libs and the three apps
```

CI runs the same four steps on every pull request and push to `main`.

To run a service outside Docker, start the infrastructure with `docker compose up -d order-db payment-db rabbitmq` and set the [environment variables](#environment-variables) for that service, e.g. for the order service:

```bash
DATABASE_URL=postgresql://admin:admin123@localhost:5433/order_db \
RABBITMQ_URL=amqp://admin:admin123@localhost:5672 \
npm run start:order:dev
```

---

## 🏛️ Design Patterns Used

- **Microservices Architecture**: Independent services with isolated databases
- **API Gateway Pattern**: Single entry point for client requests
- **Event-Driven Architecture**: Asynchronous communication via RabbitMQ
- **Saga Pattern (Choreography)**: Distributed transactions with compensating actions across services
- **State Machine**: Explicit, atomically enforced status transitions for orders and payments
- **Idempotent Consumer**: Safe handling of redelivered messages
- **Retry + Dead Letter Queue**: Bounded, delayed retries before isolating poison messages

---

## 📄 License

This project is licensed under the MIT License.

---

## 👤 Author

Lucas Herzinger Souza
- GitHub: [@luchersou](https://github.com/luchersou)

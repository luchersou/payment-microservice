# 🧩 Payment Microservices System

A backend project that demonstrates a **microservices architecture** using **NestJS**, **RabbitMQ**, **PostgreSQL**, and **Prisma ORM**.
This project was built to showcase real-world backend architecture concepts such as event-driven systems, asynchronous processing, and service separation.

![NestJS](https://img.shields.io/badge/nestjs-%23E0234E.svg?style=for-the-badge&logo=nestjs&logoColor=white)
![RabbitMQ](https://img.shields.io/badge/Rabbitmq-FF6600?style=for-the-badge&logo=rabbitmq&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/postgres-%23316192.svg?style=for-the-badge&logo=postgresql&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-3982CE?style=for-the-badge&logo=Prisma&logoColor=white)
![Docker](https://img.shields.io/badge/docker-%230db7ed.svg?style=for-the-badge&logo=docker&logoColor=white)

## 📐 Architecture
```mermaid
graph LR
    A[Client] --> B[API Service]
    B --> C[RabbitMQ]
    C --> D[Worker Service]
    B --> E[(PostgreSQL)]
    D --> E
```
### 🔹 API Service
- Exposes REST endpoints
- Creates orders in the database
- Publishes events to RabbitMQ
### 🔹 Worker Service
- Consumes messages from RabbitMQ
- Processes orders asynchronously
- Updates order status in the database

## 🚀 Tech Stack
- **NestJS** — Node.js framework
- **RabbitMQ** — Message broker
- **PostgreSQL** — Relational database
- **Prisma ORM** — Database access
- **Docker** — Local infrastructure

## ⚙️ Running the Project Locally
### 1. Clone the repository
```bash
git clone https://github.com/luchersou/payment-microservice.git
cd payment-microservice
```
### 2. Create environment variables
Create a `.env` file in the root directory.
For local development, you can use:
```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/orders_db"
RABBITMQ_URL="amqp://guest:guest@localhost:5672"

POSTGRES_USER="postgres"
POSTGRES_PASSWORD="postgres"
POSTGRES_DB="orders_db"

RABBITMQ_USER="guest"
RABBITMQ_PASS="guest"
```
⚠️ These credentials are for local testing only.
### 3. Start infrastructure (PostgreSQL + RabbitMQ)
```bash
docker compose up -d
```
### 4. Install dependencies
```bash
npm install
```
### 5. Generate Prisma client
```bash
npx prisma generate
```
### 6. Run database migrations
```bash
npx prisma migrate dev
```
### 7. Start the services
Open two terminals.
**API Service**
```bash
npm run start:api:dev
```
**Worker Service**
```bash
npm run start:worker:dev
```

## 🧪 Testing the Application
### ➕ Create Order
**Request:**
```http
POST http://localhost:3000/orders
Content-Type: application/json

{
  "total": 50
}
```

**Response:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "total": 50,
  "status": "PENDING",
  "createdAt": "2025-01-25T..."
}
```
### 🔍 Get Order
```
GET http://localhost:3000/orders/{id}
```
### 🔄 Order Status Flow
```
PENDING → PROCESSING → PAID
```
The status is updated asynchronously by the Worker service after receiving the event from RabbitMQ.

## 🧠 Concepts Demonstrated
- Microservices architecture
- Event-driven communication
- Message broker integration
- Asynchronous background processing
- Separation of API and worker responsibilities
- ORM-based database access
- Containerized local environment

## 👨‍💻 Author
Lucas Herzinger Souza - Fullstack developer

[![LinkedIn](https://img.shields.io/badge/LinkedIn-0077B5?style=for-the-badge&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/lucas-herzinger-souza-42141a2ba/)
[![GitHub](https://img.shields.io/badge/GitHub-100000?style=for-the-badge&logo=github&logoColor=white)](https://github.com/luchersou)

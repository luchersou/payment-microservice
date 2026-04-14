-- CreateTable
CREATE TABLE "failed_messages" (
    "id" TEXT NOT NULL,
    "queue" TEXT NOT NULL,
    "routingKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "failed_messages_pkey" PRIMARY KEY ("id")
);

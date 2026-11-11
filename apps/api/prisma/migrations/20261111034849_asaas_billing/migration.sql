-- CreateEnum
CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "BillingStatus" AS ENUM ('NONE', 'OK', 'PENDING', 'OVERDUE', 'CANCELED');

-- CreateTable
CREATE TABLE "Billing" (
    "restaurantId" TEXT NOT NULL,
    "cpfCnpj" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "asaasCustomerId" TEXT,
    "asaasSubscriptionId" TEXT,
    "cycle" "BillingCycle" NOT NULL DEFAULT 'MONTHLY',
    "valueCents" INTEGER,
    "nextDueDate" DATE,
    "status" "BillingStatus" NOT NULL DEFAULT 'NONE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Billing_pkey" PRIMARY KEY ("restaurantId")
);

-- CreateTable
CREATE TABLE "BillingPayment" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "asaasId" TEXT NOT NULL,
    "valueCents" INTEGER NOT NULL,
    "dueDate" DATE NOT NULL,
    "status" TEXT NOT NULL,
    "invoiceUrl" TEXT,
    "paidAt" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingEvent" (
    "id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Billing_asaasCustomerId_key" ON "Billing"("asaasCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Billing_asaasSubscriptionId_key" ON "Billing"("asaasSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingPayment_asaasId_key" ON "BillingPayment"("asaasId");

-- CreateIndex
CREATE INDEX "BillingPayment_restaurantId_dueDate_idx" ON "BillingPayment"("restaurantId", "dueDate");

-- AddForeignKey
ALTER TABLE "Billing" ADD CONSTRAINT "Billing_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingPayment" ADD CONSTRAINT "BillingPayment_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

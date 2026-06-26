-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('active', 'cancelled');

-- CreateEnum
CREATE TYPE "SubscriptionPeriod" AS ENUM ('monthly', 'yearly');

-- AlterTable
ALTER TABLE "receipts" ADD COLUMN     "subscription_id" TEXT;

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "owner_type" "OwnerType" NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT,
    "amount_usd" DECIMAL(10,2) NOT NULL,
    "period" "SubscriptionPeriod" NOT NULL DEFAULT 'monthly',
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'active',
    "source" TEXT NOT NULL,
    "email_connection_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "subscriptions_owner_id_owner_type_idx" ON "subscriptions"("owner_id", "owner_type");

-- CreateIndex
CREATE INDEX "receipts_subscription_id_idx" ON "receipts"("subscription_id");

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

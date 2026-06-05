-- CreateEnum
CREATE TYPE "OwnerType" AS ENUM ('user', 'org');

-- CreateEnum
CREATE TYPE "Provider" AS ENUM ('openai', 'anthropic', 'gemini', 'bedrock');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('active', 'error', 'expired');

-- CreateEnum
CREATE TYPE "BackfillStatus" AS ENUM ('pending', 'in_progress', 'complete', 'failed');

-- CreateEnum
CREATE TYPE "UsageSource" AS ENUM ('api_poll', 'receipt_email', 'receipt_upload');

-- CreateEnum
CREATE TYPE "BudgetPeriod" AS ENUM ('daily', 'weekly', 'monthly');

-- CreateTable
CREATE TABLE "profiles" (
    "clerk_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("clerk_user_id")
);

-- CreateTable
CREATE TABLE "org_profiles" (
    "clerk_org_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "org_profiles_pkey" PRIMARY KEY ("clerk_org_id")
);

-- CreateTable
CREATE TABLE "provider_connections" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "owner_type" "OwnerType" NOT NULL,
    "provider" "Provider" NOT NULL,
    "enc_credentials" TEXT NOT NULL,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'active',
    "last_synced_at" TIMESTAMP(3),
    "backfill_from" DATE NOT NULL,
    "backfill_status" "BackfillStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_records" (
    "id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "owner_type" "OwnerType" NOT NULL,
    "date" DATE NOT NULL,
    "provider" "Provider" NOT NULL,
    "model" TEXT NOT NULL,
    "input_tokens" BIGINT NOT NULL DEFAULT 0,
    "output_tokens" BIGINT NOT NULL DEFAULT 0,
    "cost_usd" DECIMAL(12,6) NOT NULL,
    "source" "UsageSource" NOT NULL DEFAULT 'api_poll',
    "raw_payload" JSONB,

    CONSTRAINT "usage_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipts" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "owner_type" "OwnerType" NOT NULL,
    "provider" TEXT,
    "amount_usd" DECIMAL(10,2) NOT NULL,
    "billing_period_start" DATE,
    "billing_period_end" DATE,
    "invoice_id" TEXT,
    "source" TEXT NOT NULL,
    "parsed_at" TIMESTAMP(3),
    "raw_content" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_rules" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "owner_type" "OwnerType" NOT NULL,
    "provider" "Provider",
    "period" "BudgetPeriod" NOT NULL,
    "limit_usd" DECIMAL(10,2) NOT NULL,
    "alert_at_pct" INTEGER NOT NULL DEFAULT 80,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budget_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" TEXT NOT NULL,
    "budget_rule_id" TEXT NOT NULL,
    "triggered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "spend_usd" DECIMAL(10,2) NOT NULL,
    "acknowledged_at" TIMESTAMP(3),

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_settings" (
    "clerk_user_id" TEXT NOT NULL,
    "backfill_months" INTEGER NOT NULL DEFAULT 3,
    "notification_email" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("clerk_user_id")
);

-- CreateTable
CREATE TABLE "org_settings" (
    "clerk_org_id" TEXT NOT NULL,
    "backfill_months" INTEGER NOT NULL DEFAULT 3,

    CONSTRAINT "org_settings_pkey" PRIMARY KEY ("clerk_org_id")
);

-- CreateIndex
CREATE INDEX "provider_connections_owner_id_owner_type_idx" ON "provider_connections"("owner_id", "owner_type");

-- CreateIndex
CREATE INDEX "usage_records_owner_id_owner_type_date_idx" ON "usage_records"("owner_id", "owner_type", "date");

-- CreateIndex
CREATE UNIQUE INDEX "usage_records_connection_id_date_model_key" ON "usage_records"("connection_id", "date", "model");

-- AddForeignKey
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "provider_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_budget_rule_id_fkey" FOREIGN KEY ("budget_rule_id") REFERENCES "budget_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

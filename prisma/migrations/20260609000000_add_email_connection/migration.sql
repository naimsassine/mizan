-- CreateTable
CREATE TABLE "email_connections" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "owner_type" "OwnerType" NOT NULL,
    "email_address" TEXT NOT NULL,
    "enc_credentials" TEXT NOT NULL,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'active',
    "last_scanned_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_connections_email_address_owner_id_key" ON "email_connections"("email_address", "owner_id");

-- CreateIndex
CREATE INDEX "email_connections_owner_id_owner_type_idx" ON "email_connections"("owner_id", "owner_type");

-- AlterTable: add columns to receipts
ALTER TABLE "receipts"
    ADD COLUMN "email_connection_id" TEXT,
    ADD COLUMN "external_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "receipts_email_connection_id_external_id_key" ON "receipts"("email_connection_id", "external_id");

-- CreateIndex
CREATE INDEX "receipts_owner_id_owner_type_idx" ON "receipts"("owner_id", "owner_type");

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_email_connection_id_fkey" FOREIGN KEY ("email_connection_id") REFERENCES "email_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

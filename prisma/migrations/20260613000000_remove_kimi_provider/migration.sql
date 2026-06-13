-- Remove kimi from Provider enum
-- Kimi/Moonshot has no public cost tracking API

-- Step 1: delete any existing kimi usage records and connections
DELETE FROM "usage_records" WHERE "provider" = 'kimi';
DELETE FROM "provider_connections" WHERE "provider" = 'kimi';
DELETE FROM "budget_rules" WHERE "provider" = 'kimi';

-- Step 2: recreate the enum without kimi
ALTER TYPE "Provider" RENAME TO "Provider_old";
CREATE TYPE "Provider" AS ENUM ('openai', 'anthropic', 'gemini', 'bedrock', 'groq', 'mistral', 'grok', 'openrouter', 'litellm');

-- Step 3: migrate columns
ALTER TABLE "provider_connections" ALTER COLUMN "provider" TYPE "Provider" USING "provider"::text::"Provider";
ALTER TABLE "usage_records" ALTER COLUMN "provider" TYPE "Provider" USING "provider"::text::"Provider";
ALTER TABLE "budget_rules" ALTER COLUMN "provider" TYPE "Provider" USING "provider"::text::"Provider";

-- Step 4: drop old enum
DROP TYPE "Provider_old";

-- Fix provider: all current data plans came from SMEPlug API, not Subpadi
UPDATE service_plans
SET provider = 'smeplug', updated_at = now()
WHERE service_type = 'data' AND provider = 'subpadi';
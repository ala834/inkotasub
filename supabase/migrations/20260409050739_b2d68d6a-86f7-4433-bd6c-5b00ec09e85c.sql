-- Delete all smeplug data plans - they'll be re-synced with correct network mappings
DELETE FROM service_plans WHERE service_type = 'data' AND provider = 'smeplug';
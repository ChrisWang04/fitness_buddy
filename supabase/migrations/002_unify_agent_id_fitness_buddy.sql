-- 002: unify agent_id after the xbuddy -> fitness_buddy rename.
--
-- Before the rename, rows were written under inconsistent IDs: the backend used
-- 'fitness-buddy', the column default was the template's 'founder-buddy', and some
-- frontend paths used 'xbuddy'. The app now writes and reads 'fitness_buddy' only.
--
-- Safe to run more than once. No unique constraint includes agent_id
-- (business_plans: user_id + thread_id; section_states: user_id + thread_id + section_id),
-- so rewriting the ID can't create duplicates.

UPDATE section_states
SET agent_id = 'fitness_buddy'
WHERE agent_id IN ('fitness-buddy', 'xbuddy', 'founder-buddy');

UPDATE business_plans
SET agent_id = 'fitness_buddy'
WHERE agent_id IN ('fitness-buddy', 'xbuddy', 'founder-buddy');

UPDATE conversation_messages
SET agent_id = 'fitness_buddy'
WHERE agent_id IN ('fitness-buddy', 'xbuddy', 'founder-buddy');

ALTER TABLE section_states        ALTER COLUMN agent_id SET DEFAULT 'fitness_buddy';
ALTER TABLE business_plans        ALTER COLUMN agent_id SET DEFAULT 'fitness_buddy';
ALTER TABLE conversation_messages ALTER COLUMN agent_id SET DEFAULT 'fitness_buddy';

-- Verify: every row should now report 'fitness_buddy'.
SELECT 'section_states' AS tbl, agent_id, count(*) FROM section_states GROUP BY agent_id
UNION ALL
SELECT 'business_plans', agent_id, count(*) FROM business_plans GROUP BY agent_id
UNION ALL
SELECT 'conversation_messages', agent_id, count(*) FROM conversation_messages GROUP BY agent_id
ORDER BY tbl, agent_id;

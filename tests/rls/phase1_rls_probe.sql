-- Run against a local Supabase database with test JWT contexts.
-- Replace the set_config values with real auth.uid values from seeded users.

begin;

select plan(10);

-- These probes intentionally call direct table operations. They document the
-- definition of done even when run manually without pgTAP.

-- Viewer:
-- select set_config('request.jwt.claim.sub', '<viewer-user-id>', true);
-- insert into transactions (...) values (...); -- must fail 42501
-- insert into tenant_products (...) values (...); -- must fail 42501

-- Staff:
-- select set_config('request.jwt.claim.sub', '<staff-user-id>', true);
-- purchase/sale insert should pass.
-- adjustment/return/damage insert should fail.
-- tenant_memberships update should fail.
-- tenant_products opening_balance update should fail.

-- Owner:
-- select set_config('request.jwt.claim.sub', '<owner-user-id>', true);
-- tenant_memberships writes should pass.
-- sole owner self-demotion should fail until second owner exists.

select * from finish();

rollback;

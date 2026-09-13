alter table app_api_keys
  drop constraint if exists app_api_keys_scopes_check;

alter table app_api_keys
  add constraint app_api_keys_scopes_check
  check (
    scopes <@ array[
      'data:read',
      'portfolio:read',
      'portfolio:write',
      'lists:read',
      'lists:write',
      'alerts:manage',
      'shares:manage',
      'profile:read'
    ]::text[]
    and scopes @> array['data:read']::text[]
  );

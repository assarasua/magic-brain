update app_users
set product_tour_completed = false,
    updated_at = now()
where authenticated_at is not null;

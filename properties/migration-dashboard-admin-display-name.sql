UPDATE dashboard_users
SET display_name = 'Admin', updated_at = datetime('now')
WHERE account_id = 'admin';
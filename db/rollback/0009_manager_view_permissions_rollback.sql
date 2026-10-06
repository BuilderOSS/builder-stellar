-- Rollback: manager view permissions (0009_manager_view_permissions.sql)
REVOKE SELECT ON ALL TABLES IN SCHEMA manager FROM app_server;

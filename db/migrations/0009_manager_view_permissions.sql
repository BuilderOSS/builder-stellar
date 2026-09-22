-- Allow the application role to read DAO registry views.
GRANT USAGE ON SCHEMA manager TO app_server;
GRANT SELECT ON ALL TABLES IN SCHEMA manager TO app_server;

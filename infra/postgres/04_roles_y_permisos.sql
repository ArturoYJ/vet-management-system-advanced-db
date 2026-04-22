DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'role_app_admin') THEN
        CREATE ROLE role_app_admin NOLOGIN;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'role_app_reception') THEN
        CREATE ROLE role_app_reception NOLOGIN;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'role_app_veterinarian') THEN
        CREATE ROLE role_app_veterinarian NOLOGIN;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'api_user') THEN
        CREATE ROLE api_user LOGIN PASSWORD 'api_pass' NOINHERIT;
    END IF;
END;
$$;

ALTER ROLE api_user WITH
    LOGIN
    PASSWORD 'api_pass'
    NOSUPERUSER
    NOCREATEDB
    NOCREATEROLE
    NOREPLICATION
    NOINHERIT;

GRANT role_app_admin TO api_user;
GRANT role_app_reception TO api_user;
GRANT role_app_veterinarian TO api_user;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO role_app_admin, role_app_reception, role_app_veterinarian;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE
    duenos,
    veterinarios,
    mascotas,
    vet_atiende_mascota,
    citas,
    inventario_vacunas,
    vacunas_aplicadas,
    historial_movimientos,
    alertas
TO role_app_admin;

GRANT SELECT
ON TABLE
    duenos,
    veterinarios,
    mascotas,
    citas,
    v_mascotas_vacunacion_pendiente
TO role_app_reception;

GRANT INSERT ON TABLE citas TO role_app_reception;

GRANT SELECT
ON TABLE
    duenos,
    veterinarios,
    mascotas,
    vet_atiende_mascota,
    citas,
    vacunas_aplicadas,
    inventario_vacunas,
    v_mascotas_vacunacion_pendiente
TO role_app_veterinarian;

GRANT INSERT ON TABLE citas, vacunas_aplicadas TO role_app_veterinarian;
GRANT UPDATE (stock_actual) ON TABLE inventario_vacunas TO role_app_veterinarian;

GRANT USAGE, SELECT ON SEQUENCE citas_id_seq TO role_app_admin, role_app_reception, role_app_veterinarian;
GRANT USAGE, SELECT ON SEQUENCE vacunas_aplicadas_id_seq TO role_app_admin, role_app_veterinarian;

GRANT USAGE, SELECT, UPDATE
ON ALL SEQUENCES IN SCHEMA public
TO role_app_admin;

GRANT EXECUTE ON PROCEDURE sp_agendar_cita(INT, INT, TIMESTAMP, TEXT)
TO role_app_admin, role_app_reception, role_app_veterinarian;

GRANT EXECUTE ON FUNCTION fn_total_facturado(INT, INT)
TO role_app_admin, role_app_reception, role_app_veterinarian;

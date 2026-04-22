CREATE OR REPLACE FUNCTION app_current_vet_id()
RETURNS INT
LANGUAGE sql
STABLE
AS $$
    SELECT NULLIF(current_setting('app.current_vet_id', true), '')::INT;
$$;

REVOKE ALL ON FUNCTION app_current_vet_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_current_vet_id() TO role_app_admin, role_app_reception, role_app_veterinarian;

ALTER TABLE mascotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE citas ENABLE ROW LEVEL SECURITY;
ALTER TABLE vacunas_aplicadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE vet_atiende_mascota ENABLE ROW LEVEL SECURITY;

ALTER TABLE mascotas FORCE ROW LEVEL SECURITY;
ALTER TABLE citas FORCE ROW LEVEL SECURITY;
ALTER TABLE vacunas_aplicadas FORCE ROW LEVEL SECURITY;
ALTER TABLE vet_atiende_mascota FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mascotas_admin_all ON mascotas;
DROP POLICY IF EXISTS mascotas_reception_select ON mascotas;
DROP POLICY IF EXISTS mascotas_veterinarian_select ON mascotas;

CREATE POLICY mascotas_admin_all
ON mascotas
FOR ALL
TO role_app_admin
USING (true)
WITH CHECK (true);

CREATE POLICY mascotas_reception_select
ON mascotas
FOR SELECT
TO role_app_reception
USING (true);

CREATE POLICY mascotas_veterinarian_select
ON mascotas
FOR SELECT
TO role_app_veterinarian
USING (
    EXISTS (
        SELECT 1
        FROM vet_atiende_mascota vam
        WHERE vam.mascota_id = mascotas.id
          AND vam.vet_id = app_current_vet_id()
          AND vam.activa = TRUE
    )
);

DROP POLICY IF EXISTS citas_admin_all ON citas;
DROP POLICY IF EXISTS citas_reception_select ON citas;
DROP POLICY IF EXISTS citas_reception_insert ON citas;
DROP POLICY IF EXISTS citas_veterinarian_select ON citas;
DROP POLICY IF EXISTS citas_veterinarian_insert ON citas;

CREATE POLICY citas_admin_all
ON citas
FOR ALL
TO role_app_admin
USING (true)
WITH CHECK (true);

CREATE POLICY citas_reception_select
ON citas
FOR SELECT
TO role_app_reception
USING (true);

CREATE POLICY citas_reception_insert
ON citas
FOR INSERT
TO role_app_reception
WITH CHECK (true);

CREATE POLICY citas_veterinarian_select
ON citas
FOR SELECT
TO role_app_veterinarian
USING (veterinario_id = app_current_vet_id());

CREATE POLICY citas_veterinarian_insert
ON citas
FOR INSERT
TO role_app_veterinarian
WITH CHECK (
    veterinario_id = app_current_vet_id()
    AND EXISTS (
        SELECT 1
        FROM vet_atiende_mascota vam
        WHERE vam.mascota_id = citas.mascota_id
          AND vam.vet_id = app_current_vet_id()
          AND vam.activa = TRUE
    )
);

DROP POLICY IF EXISTS vacunas_admin_all ON vacunas_aplicadas;
DROP POLICY IF EXISTS vacunas_veterinarian_select ON vacunas_aplicadas;
DROP POLICY IF EXISTS vacunas_veterinarian_insert ON vacunas_aplicadas;

CREATE POLICY vacunas_admin_all
ON vacunas_aplicadas
FOR ALL
TO role_app_admin
USING (true)
WITH CHECK (true);

CREATE POLICY vacunas_veterinarian_select
ON vacunas_aplicadas
FOR SELECT
TO role_app_veterinarian
USING (
    EXISTS (
        SELECT 1
        FROM vet_atiende_mascota vam
        WHERE vam.mascota_id = vacunas_aplicadas.mascota_id
          AND vam.vet_id = app_current_vet_id()
          AND vam.activa = TRUE
    )
);

CREATE POLICY vacunas_veterinarian_insert
ON vacunas_aplicadas
FOR INSERT
TO role_app_veterinarian
WITH CHECK (
    veterinario_id = app_current_vet_id()
    AND EXISTS (
        SELECT 1
        FROM vet_atiende_mascota vam
        WHERE vam.mascota_id = vacunas_aplicadas.mascota_id
          AND vam.vet_id = app_current_vet_id()
          AND vam.activa = TRUE
    )
);

DROP POLICY IF EXISTS vam_admin_all ON vet_atiende_mascota;
DROP POLICY IF EXISTS vam_reception_select ON vet_atiende_mascota;
DROP POLICY IF EXISTS vam_veterinarian_select ON vet_atiende_mascota;

CREATE POLICY vam_admin_all
ON vet_atiende_mascota
FOR ALL
TO role_app_admin
USING (true)
WITH CHECK (true);

CREATE POLICY vam_reception_select
ON vet_atiende_mascota
FOR SELECT
TO role_app_reception
USING (true);

CREATE POLICY vam_veterinarian_select
ON vet_atiende_mascota
FOR SELECT
TO role_app_veterinarian
USING (vet_id = app_current_vet_id());

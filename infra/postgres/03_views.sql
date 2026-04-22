CREATE OR REPLACE FUNCTION fn_total_facturado(
    p_mascota_id INT,
    p_anio INT
)
RETURNS NUMERIC
LANGUAGE plpgsql
AS $$
DECLARE
    v_total_appointments NUMERIC(12, 2);
    v_total_vaccines NUMERIC(12, 2);
BEGIN
    SELECT COALESCE(SUM(c.costo), 0)
    INTO v_total_appointments
    FROM citas c
    WHERE c.mascota_id = p_mascota_id
      AND c.estado = 'COMPLETADA'
      AND EXTRACT(YEAR FROM c.fecha_hora) = p_anio;

    SELECT COALESCE(SUM(va.costo_cobrado), 0)
    INTO v_total_vaccines
    FROM vacunas_aplicadas va
    WHERE va.mascota_id = p_mascota_id
      AND EXTRACT(YEAR FROM va.fecha_aplicacion) = p_anio;

    RETURN COALESCE(v_total_appointments, 0) + COALESCE(v_total_vaccines, 0);
END;
$$;

CREATE OR REPLACE VIEW v_mascotas_vacunacion_pendiente AS
WITH last_vaccine_per_pet AS (
    SELECT
        va.mascota_id,
        MAX(va.fecha_aplicacion) AS last_vaccine_date
    FROM vacunas_aplicadas va
    GROUP BY va.mascota_id
)
SELECT
    m.id AS mascota_id,
    m.nombre AS nombre_mascota,
    m.especie,
    d.nombre AS nombre_dueno,
    d.telefono AS telefono_dueno,
    lv.last_vaccine_date AS fecha_ultima_vacuna,
    CASE
        WHEN lv.last_vaccine_date IS NULL THEN NULL
        ELSE (CURRENT_DATE - lv.last_vaccine_date)
    END AS dias_desde_ultima_vacuna,
    CASE
        WHEN lv.last_vaccine_date IS NULL THEN 'NUNCA_VACUNADA'
        ELSE 'VENCIDA'
    END AS prioridad
FROM mascotas m
INNER JOIN duenos d
    ON d.id = m.dueno_id
LEFT JOIN last_vaccine_per_pet lv
    ON lv.mascota_id = m.id
WHERE lv.last_vaccine_date IS NULL
   OR lv.last_vaccine_date < (CURRENT_DATE - INTERVAL '365 days');

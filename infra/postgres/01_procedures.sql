CREATE UNIQUE INDEX IF NOT EXISTS uq_citas_vet_fecha_hora_activa
ON citas (veterinario_id, fecha_hora)
WHERE estado <> 'CANCELADA';

CREATE OR REPLACE PROCEDURE sp_agendar_cita(
    p_mascota_id INT,
    p_veterinario_id INT,
    p_fecha_hora TIMESTAMP,
    p_motivo TEXT,
    OUT p_cita_id INT
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_vet_active BOOLEAN;
    v_vet_rest_days TEXT;
    v_day_name TEXT;
BEGIN
    IF p_fecha_hora IS NULL THEN
        RAISE EXCEPTION 'Appointment datetime is required';
    END IF;

    PERFORM 1
    FROM mascotas
    WHERE id = p_mascota_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pet % does not exist', p_mascota_id;
    END IF;

    SELECT
        activo,
        LOWER(REPLACE(COALESCE(dias_descanso, ''), ' ', ''))
    INTO
        v_vet_active,
        v_vet_rest_days
    FROM veterinarios
    WHERE id = p_veterinario_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Veterinarian % does not exist', p_veterinario_id;
    END IF;

    IF v_vet_active IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'Veterinarian % is not active', p_veterinario_id;
    END IF;

    v_day_name := CASE EXTRACT(ISODOW FROM p_fecha_hora)::INT
        WHEN 1 THEN 'lunes'
        WHEN 2 THEN 'martes'
        WHEN 3 THEN 'miercoles'
        WHEN 4 THEN 'jueves'
        WHEN 5 THEN 'viernes'
        WHEN 6 THEN 'sabado'
        WHEN 7 THEN 'domingo'
    END;

    IF v_vet_rest_days <> ''
       AND v_day_name = ANY (STRING_TO_ARRAY(v_vet_rest_days, ',')) THEN
        RAISE EXCEPTION
            'Veterinarian % is off on %',
            p_veterinario_id,
            v_day_name;
    END IF;

    PERFORM 1
    FROM citas
    WHERE veterinario_id = p_veterinario_id
      AND fecha_hora = p_fecha_hora
      AND estado <> 'CANCELADA';

    IF FOUND THEN
        RAISE EXCEPTION
            'Schedule conflict for veterinarian % at %',
            p_veterinario_id,
            p_fecha_hora;
    END IF;

    INSERT INTO citas (
        mascota_id,
        veterinario_id,
        fecha_hora,
        motivo,
        estado
    )
    VALUES (
        p_mascota_id,
        p_veterinario_id,
        p_fecha_hora,
        p_motivo,
        'AGENDADA'
    )
    RETURNING id INTO p_cita_id;

EXCEPTION
    WHEN unique_violation THEN
        RAISE EXCEPTION
            'Schedule conflict for veterinarian % at %',
            p_veterinario_id,
            p_fecha_hora;
    WHEN OTHERS THEN
        RAISE;
END;
$$;

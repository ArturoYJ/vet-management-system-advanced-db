CREATE OR REPLACE FUNCTION fn_log_scheduled_appointment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_pet_name TEXT;
    v_vet_name TEXT;
BEGIN
    SELECT nombre
    INTO v_pet_name
    FROM mascotas
    WHERE id = NEW.mascota_id;

    SELECT nombre
    INTO v_vet_name
    FROM veterinarios
    WHERE id = NEW.veterinario_id;

    INSERT INTO historial_movimientos (
        tipo,
        referencia_id,
        descripcion
    )
    VALUES (
        'CITA_AGENDADA',
        NEW.id,
        FORMAT(
            'Appointment for %s with %s on %s',
            COALESCE(v_pet_name, 'Unknown pet'),
            COALESCE(v_vet_name, 'Unknown veterinarian'),
            TO_CHAR(NEW.fecha_hora, 'DD/MM/YYYY HH24:MI')
        )
    );

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION fn_log_scheduled_appointment() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_historial_cita ON citas;

CREATE TRIGGER trg_historial_cita
AFTER INSERT ON citas
FOR EACH ROW
EXECUTE FUNCTION fn_log_scheduled_appointment();

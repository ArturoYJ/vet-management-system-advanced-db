import cors from "cors";
import express, { Request, Response } from "express";
import path from "path";
import { ZodError } from "zod";
import { config } from "./config";
import {
  buildPendingVaccinationCacheKey,
  invalidatePendingVaccinationCache,
  readPendingVaccinationCache,
  writePendingVaccinationCache
} from "./cache";
import { pool, query, withAuthorizedClient } from "./db";
import { createSession, getSession } from "./session";
import { AuthContext, PendingVaccinationRow, PetSearchRow } from "./types";
import {
  applyVaccineSchema,
  assignVetSchema,
  createAppointmentSchema,
  loginSchema,
  searchPetsSchema,
  updateInventorySchema
} from "./validation";

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const frontendPath = path.resolve(__dirname, "../../frontend");
app.use(express.static(frontendPath));

const resolveAuth = (req: Request): AuthContext => {
  const token = req.header("x-session-token");
  if (!token) {
    throw new Error("Missing x-session-token header");
  }

  const auth = getSession(token);
  if (!auth) {
    throw new Error("Invalid or expired session token");
  }

  return auth;
};

const ensureRole = (auth: AuthContext, allowed: AuthContext["role"][]): void => {
  if (!allowed.includes(auth.role)) {
    throw new Error("Forbidden for current role");
  }
};

app.post("/api/auth/login", (req: Request, res: Response) => {
  try {
    const parsed = loginSchema.parse(req.body);
    const role = parsed.role;
    const vetId = role === "veterinarian" ? (parsed.vetId ?? null) : null;

    if (role === "veterinarian" && vetId === null) {
      res.status(400).json({ error: "vetId is required for veterinarian role" });
      return;
    }

    const token = createSession({ role, vetId });
    res.json({ token, role, vetId });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }

    res.status(400).json({ error: (error as Error).message });
  }
});

app.get("/api/pets/search", async (req: Request, res: Response) => {
  try {
    const auth = resolveAuth(req);
    const parsed = searchPetsSchema.parse({ q: req.query.q });

    const result = await query<PetSearchRow>(
      auth,
      `
        SELECT
          m.id,
          m.nombre,
          m.especie,
          d.nombre AS dueno_nombre,
          d.telefono AS dueno_telefono
        FROM mascotas m
        INNER JOIN duenos d ON d.id = m.dueno_id
        WHERE m.nombre ILIKE $1
           OR m.especie ILIKE $1
           OR d.nombre ILIKE $1
        ORDER BY m.id ASC
        LIMIT 100
      `,
      [`%${parsed.q}%`]
    );

    res.json({ rows: result.rows });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }

    res.status(400).json({ error: (error as Error).message });
  }
});

app.get("/api/pets", async (req: Request, res: Response) => {
  try {
    const auth = resolveAuth(req);

    const result = await query<PetSearchRow>(
      auth,
      `
        SELECT
          m.id,
          m.nombre,
          m.especie,
          d.nombre AS dueno_nombre,
          d.telefono AS dueno_telefono
        FROM mascotas m
        INNER JOIN duenos d ON d.id = m.dueno_id
        ORDER BY m.id ASC
      `
    );

    res.json({ rows: result.rows });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

app.get("/api/vaccines/applied", async (req: Request, res: Response) => {
  try {
    const auth = resolveAuth(req);

    const result = await query<{
      id: number;
      mascota_id: number;
      vacuna_id: number;
      veterinario_id: number;
      fecha_aplicacion: string;
      costo_cobrado: string;
    }>(
      auth,
      `
        SELECT
          id,
          mascota_id,
          vacuna_id,
          veterinario_id,
          fecha_aplicacion,
          costo_cobrado
        FROM vacunas_aplicadas
        ORDER BY id ASC
      `
    );

    res.json({ rows: result.rows });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

app.get("/api/vaccination/pending", async (req: Request, res: Response) => {
  const start = Date.now();
  try {
    const auth = resolveAuth(req);
    const cacheScope = auth.role === "veterinarian" ? `vet:${auth.vetId}` : auth.role;
    const cacheKey = buildPendingVaccinationCacheKey(cacheScope);

    const cached = await readPendingVaccinationCache(cacheKey);
    if (cached) {
      const elapsed = Date.now() - start;
      console.log(`[${new Date().toISOString()}] [CACHE HIT] ${cacheKey} (${elapsed}ms)`);
      res.json({ source: "cache", rows: cached, latencyMs: elapsed });
      return;
    }

    const result = await query<PendingVaccinationRow>(
      auth,
      `
        SELECT
          v.mascota_id,
          v.nombre_mascota,
          v.especie,
          v.nombre_dueno,
          v.telefono_dueno,
          v.fecha_ultima_vacuna,
          v.dias_desde_ultima_vacuna,
          v.prioridad
        FROM v_mascotas_vacunacion_pendiente v
        INNER JOIN mascotas m
          ON m.id = v.mascota_id
        ORDER BY prioridad ASC, dias_desde_ultima_vacuna DESC NULLS FIRST
      `
    );

    await writePendingVaccinationCache(cacheKey, result.rows);
    const elapsed = Date.now() - start;
    console.log(`[${new Date().toISOString()}] [CACHE MISS] ${cacheKey} (${elapsed}ms)`);

    res.json({ source: "db", rows: result.rows, latencyMs: elapsed });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

app.post("/api/appointments", async (req: Request, res: Response) => {
  try {
    const auth = resolveAuth(req);
    ensureRole(auth, ["admin", "reception", "veterinarian"]);
    const payload = createAppointmentSchema.parse(req.body);

    const result = await withAuthorizedClient(auth, async (client) => {
      const callResult = await client.query<{ p_cita_id: number }>(
        "CALL sp_agendar_cita($1, $2, $3::timestamp, $4, NULL)",
        [payload.mascotaId, payload.veterinarioId, payload.fechaHora, payload.motivo]
      );

      const row = callResult.rows[0];
      if (!row) {
        throw new Error("Procedure did not return appointment id");
      }

      return row.p_cita_id;
    });

    res.status(201).json({ citaId: result });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }

    res.status(400).json({ error: (error as Error).message });
  }
});

app.post("/api/vaccines/apply", async (req: Request, res: Response) => {
  try {
    const auth = resolveAuth(req);
    ensureRole(auth, ["admin", "veterinarian"]);

    const payload = applyVaccineSchema.parse(req.body);
    const effectiveVetId = auth.role === "veterinarian" ? auth.vetId : payload.veterinarioId;

    if (!effectiveVetId) {
      res.status(400).json({ error: "veterinarioId is required for admin operations" });
      return;
    }

    const result = await withAuthorizedClient(auth, async (client) => {
      const insertResult = await client.query<{ id: number }>(
        `
          INSERT INTO vacunas_aplicadas (
            mascota_id,
            vacuna_id,
            veterinario_id,
            fecha_aplicacion,
            costo_cobrado
          )
          VALUES ($1, $2, $3, COALESCE($4::date, CURRENT_DATE), $5)
          RETURNING id
        `,
        [
          payload.mascotaId,
          payload.vacunaId,
          effectiveVetId,
          payload.fechaAplicacion ?? null,
          payload.costoCobrado
        ]
      );

      const stockUpdateResult = await client.query<{ id: number }>(
        `
          UPDATE inventario_vacunas
          SET stock_actual = stock_actual - 1
          WHERE id = $1
            AND stock_actual > 0
          RETURNING id
        `,
        [payload.vacunaId]
      );

      if (stockUpdateResult.rowCount !== 1) {
        throw new Error("Vaccine does not exist or has no stock available");
      }

      return insertResult.rows[0]?.id;
    });

    await invalidatePendingVaccinationCache();
    console.log(`[${new Date().toISOString()}] [CACHE INVALIDATE] vaccination:pending:*`);
    res.status(201).json({ vacunaAplicadaId: result });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }

    res.status(400).json({ error: (error as Error).message });
  }
});

app.post("/api/admin/assignments", async (req: Request, res: Response) => {
  try {
    const auth = resolveAuth(req);
    ensureRole(auth, ["admin"]);

    const payload = assignVetSchema.parse(req.body);

    const result = await query<{ id: number }>(
      auth,
      `
        INSERT INTO vet_atiende_mascota (
          vet_id,
          mascota_id,
          fecha_inicio_atencion,
          activa
        )
        VALUES ($1, $2, CURRENT_DATE, $3)
        ON CONFLICT (vet_id, mascota_id)
        DO UPDATE SET activa = EXCLUDED.activa
        RETURNING id
      `,
      [payload.vetId, payload.mascotaId, payload.activa]
    );

    res.status(201).json({ assignmentId: result.rows[0]?.id ?? null });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }

    res.status(400).json({ error: (error as Error).message });
  }
});

app.patch("/api/admin/inventory/:id", async (req: Request, res: Response) => {
  try {
    const auth = resolveAuth(req);
    ensureRole(auth, ["admin"]);

    const vaccineIdRaw = req.params.id ?? "";
    const vaccineId = Number.parseInt(vaccineIdRaw, 10);
    if (Number.isNaN(vaccineId) || vaccineId <= 0) {
      res.status(400).json({ error: "Invalid inventory id" });
      return;
    }

    const payload = updateInventorySchema.parse(req.body);

    const result = await query<{ id: number }>(
      auth,
      `
        UPDATE inventario_vacunas
        SET
          stock_actual = $2,
          stock_minimo = COALESCE($3, stock_minimo),
          costo_unitario = COALESCE($4, costo_unitario)
        WHERE id = $1
        RETURNING id
      `,
      [
        vaccineId,
        payload.stockActual,
        payload.stockMinimo ?? null,
        payload.costoUnitario ?? null
      ]
    );

    res.json({ updatedId: result.rows[0]?.id ?? null });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }

    res.status(400).json({ error: (error as Error).message });
  }
});

app.get("/api/health", async (_req: Request, res: Response) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: (error as Error).message });
  }
});

app.get("*", (_req: Request, res: Response) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

app.listen(config.port, () => {
  console.log(`API listening on port ${config.port}`);
});

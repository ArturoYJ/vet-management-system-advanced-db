import { z } from "zod";

export const authHeaderSchema = z.object({
  role: z.enum(["admin", "reception", "veterinarian"]),
  vetId: z.number().int().positive().nullable()
});

export const searchPetsSchema = z.object({
  q: z.string().trim().min(1).max(80)
});

export const createAppointmentSchema = z.object({
  mascotaId: z.number().int().positive(),
  veterinarioId: z.number().int().positive(),
  fechaHora: z.string().trim().min(1),
  motivo: z.string().trim().min(1).max(500)
});

export const applyVaccineSchema = z.object({
  mascotaId: z.number().int().positive(),
  vacunaId: z.number().int().positive(),
  veterinarioId: z.number().int().positive().optional(),
  costoCobrado: z.number().nonnegative(),
  fechaAplicacion: z.string().trim().optional()
});

export const assignVetSchema = z.object({
  vetId: z.number().int().positive(),
  mascotaId: z.number().int().positive(),
  activa: z.boolean().default(true)
});

export const loginSchema = z.object({
  role: z.enum(["admin", "reception", "veterinarian"]),
  vetId: z.number().int().positive().nullable().optional()
});

export const updateInventorySchema = z.object({
  stockActual: z.number().int().nonnegative(),
  stockMinimo: z.number().int().nonnegative().optional(),
  costoUnitario: z.number().nonnegative().optional()
});

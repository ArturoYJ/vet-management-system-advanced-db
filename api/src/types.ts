export type AppRole = "admin" | "reception" | "veterinarian";

export type AuthContext = {
  role: AppRole;
  vetId: number | null;
};

export type PendingVaccinationRow = {
  mascota_id: number;
  nombre_mascota: string;
  especie: string;
  nombre_dueno: string;
  telefono_dueno: string | null;
  fecha_ultima_vacuna: string | null;
  dias_desde_ultima_vacuna: number | null;
  prioridad: "NUNCA_VACUNADA" | "VENCIDA";
};

export type PetSearchRow = {
  id: number;
  nombre: string;
  especie: string;
  dueno_nombre: string;
  dueno_telefono: string | null;
};

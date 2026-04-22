const state = {
  token: null,
  role: null,
  vetId: null
};

const els = {
  authStatus: document.getElementById("auth-status"),
  searchStatus: document.getElementById("search-status"),
  pendingStatus: document.getElementById("pending-status"),
  vaccineStatus: document.getElementById("vaccine-status"),
  appointmentStatus: document.getElementById("appointment-status"),
  petsTbody: document.getElementById("pets-tbody"),
  pendingTbody: document.getElementById("pending-tbody")
};

const setStatus = (element, message, isError = false) => {
  element.textContent = message;
  element.classList.toggle("error", isError);
};

const authHeaders = () => {
  if (!state.token) {
    throw new Error("Please login first.");
  }

  return {
    "Content-Type": "application/json",
    "x-session-token": state.token
  };
};

const renderPets = (rows) => {
  els.petsTbody.innerHTML = rows
    .map(
      (row) => `
        <tr>
          <td>${row.id}</td>
          <td>${row.nombre}</td>
          <td>${row.especie}</td>
          <td>${row.dueno_nombre}</td>
          <td>${row.dueno_telefono ?? "-"}</td>
        </tr>
      `
    )
    .join("");
};

const renderPending = (rows) => {
  els.pendingTbody.innerHTML = rows
    .map(
      (row) => `
        <tr>
          <td>${row.nombre_mascota}</td>
          <td>${row.especie}</td>
          <td>${row.nombre_dueno}</td>
          <td>${row.fecha_ultima_vacuna ?? "Never"}</td>
          <td>${row.dias_desde_ultima_vacuna ?? "-"}</td>
          <td class="priority">${row.prioridad}</td>
        </tr>
      `
    )
    .join("");
};

document.getElementById("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  const role = document.getElementById("role").value;
  const vetRaw = document.getElementById("vet-id").value;
  const vetId = vetRaw ? Number(vetRaw) : null;

  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, vetId })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(JSON.stringify(data.error));
    }

    state.token = data.token;
    state.role = data.role;
    state.vetId = data.vetId;
    setStatus(
      els.authStatus,
      `Session active: role=${state.role} ${state.vetId ? `vetId=${state.vetId}` : ""}`
    );
  } catch (error) {
    setStatus(els.authStatus, error.message, true);
  }
});

document.getElementById("search-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    const q = document.getElementById("search-input").value;
    const response = await fetch(`/api/pets/search?q=${encodeURIComponent(q)}`, {
      method: "GET",
      headers: authHeaders()
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(JSON.stringify(data.error));
    }

    renderPets(data.rows);
    setStatus(els.searchStatus, `${data.rows.length} results loaded.`);
  } catch (error) {
    setStatus(els.searchStatus, error.message, true);
  }
});

document.getElementById("load-all-pets").addEventListener("click", async () => {
  try {
    const response = await fetch("/api/pets", {
      method: "GET",
      headers: authHeaders()
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(JSON.stringify(data.error));
    }

    renderPets(data.rows);
    setStatus(els.searchStatus, `${data.rows.length} visible pets loaded.`);
  } catch (error) {
    setStatus(els.searchStatus, error.message, true);
  }
});

document.getElementById("load-pending").addEventListener("click", async () => {
  try {
    const response = await fetch("/api/vaccination/pending", {
      headers: authHeaders()
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(JSON.stringify(data.error));
    }

    renderPending(data.rows);
    setStatus(
      els.pendingStatus,
      `Loaded ${data.rows.length} rows from ${data.source} in ${data.latencyMs}ms.`
    );
  } catch (error) {
    setStatus(els.pendingStatus, error.message, true);
  }
});

document.getElementById("vaccine-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    const payload = {
      mascotaId: Number(document.getElementById("v-pet-id").value),
      vacunaId: Number(document.getElementById("v-vaccine-id").value),
      costoCobrado: Number(document.getElementById("v-cost").value),
      fechaAplicacion: document.getElementById("v-date").value || undefined,
      veterinarioId: document.getElementById("v-vet-id").value
        ? Number(document.getElementById("v-vet-id").value)
        : undefined
    };

    const response = await fetch("/api/vaccines/apply", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(JSON.stringify(data.error));
    }

    setStatus(els.vaccineStatus, `Vaccine applied. ID=${data.vacunaAplicadaId}`);
  } catch (error) {
    setStatus(els.vaccineStatus, error.message, true);
  }
});

document.getElementById("appointment-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    const payload = {
      mascotaId: Number(document.getElementById("a-pet-id").value),
      veterinarioId: Number(document.getElementById("a-vet-id").value),
      fechaHora: document.getElementById("a-datetime").value,
      motivo: document.getElementById("a-reason").value
    };

    const response = await fetch("/api/appointments", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(JSON.stringify(data.error));
    }

    setStatus(els.appointmentStatus, `Appointment created. ID=${data.citaId}`);
  } catch (error) {
    setStatus(els.appointmentStatus, error.message, true);
  }
});

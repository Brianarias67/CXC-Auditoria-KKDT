const state = {
  board: null,
  query: "",
  issueFilter: "all",
  balanceFilter: "all",
  selectedKey: null,
  saveTimer: null,
  staticMode: false,
};

const statusOrder = [
  "pending_review",
  "in_review",
  "reviewed_ok",
  "needs_reconciliation",
  "pending_system_changes",
  "blocked",
  "unassigned_credits",
  "incobrable_legal",
  "completed",
];

const issueLabels = {
  None: "Ninguno",
  "Duplicated receipt": "Recibo duplicado",
  "Unapplied receipt": "Recibo no aplicado",
  "Missing movement": "Movimiento faltante",
  "Credit note mismatch": "Diferencia en nota de credito",
  "Debit note mismatch": "Diferencia en nota de debito",
  "Customer dispute": "Disputa del cliente",
  "System timing difference": "Diferencia por fecha / sistema",
  "Write-off review": "Revision de castigo",
  Other: "Otro",
};

const priorityLabels = {
  Low: "Baja",
  Normal: "Normal",
  High: "Alta",
  Critical: "Critica",
};

const STORAGE_KEY = "ar-audit-board-state-v1";

const DEFAULT_STATUSES = [
  { id: "pending_review", label: "Pendiente de Revision" },
  { id: "in_review", label: "En Revision" },
  { id: "reviewed_ok", label: "Revisado - OK" },
  { id: "needs_reconciliation", label: "Necesita Conciliacion" },
  { id: "pending_system_changes", label: "Pendiente de Cambios en Sistema" },
  { id: "blocked", label: "Revision Presidencia" },
  { id: "unassigned_credits", label: "Creditos / Recibos sin Asignar" },
  { id: "incobrable_legal", label: "Incobrable / Legal" },
  { id: "completed", label: "Completado" },
];

const DEFAULT_ISSUES = [
  "None",
  "Duplicated receipt",
  "Unapplied receipt",
  "Missing movement",
  "Credit note mismatch",
  "Debit note mismatch",
  "Customer dispute",
  "System timing difference",
  "Write-off review",
  "Other",
];

const el = {
  board: document.querySelector("#board"),
  kpis: document.querySelector("#kpis"),
  drawer: document.querySelector("#detailDrawer"),
  fileInput: document.querySelector("#fileInput"),
  jsonInput: document.querySelector("#jsonInput"),
  sourceFile: document.querySelector("#sourceFile"),
  sourceMeta: document.querySelector("#sourceMeta"),
  searchInput: document.querySelector("#searchInput"),
  issueFilter: document.querySelector("#issueFilter"),
  balanceFilter: document.querySelector("#balanceFilter"),
  clearFilters: document.querySelector("#clearFilters"),
  toast: document.querySelector("#toast"),
};

function money(value) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function number(value) {
  return new Intl.NumberFormat("en-US").format(Number(value || 0));
}

function date(value) {
  if (!value) return "-";
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("es-DO", { year: "numeric", month: "short", day: "2-digit" });
}

function statusLabel(statusId) {
  return state.board?.statuses?.find((status) => status.id === statusId)?.label || statusId;
}

function issueLabel(issue) {
  return issueLabels[issue] || issue;
}

function priorityLabel(priority) {
  return priorityLabels[priority] || priority;
}

function showToast(message) {
  el.toast.textContent = message;
  el.toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => el.toast.classList.remove("show"), 2800);
}

async function api(path, options = {}) {
  const response = await fetch(path, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Solicitud fallida: ${response.status}`);
  return payload;
}

async function loadBoard() {
  if (new URLSearchParams(window.location.search).has("static")) {
    state.staticMode = true;
    state.board = loadStaticBoard();
    populateIssueFilter();
    render();
    showToast("Modo GitHub Pages: usando datos guardados en este navegador.");
    return;
  }
  try {
    state.board = await api("/api/board");
    state.staticMode = false;
  } catch (error) {
    state.staticMode = true;
    state.board = loadStaticBoard();
    showToast("Modo GitHub Pages: usando datos guardados en este navegador.");
  }
  populateIssueFilter();
  render();
}

function emptyBoard() {
  return {
    importedAt: "",
    fileName: "",
    sheetName: "",
    headers: [],
    statuses: DEFAULT_STATUSES,
    issueTypes: DEFAULT_ISSUES,
    clients: [],
    summary: {
      clients: 0,
      documents: 0,
      totalPending: 0,
      negativeClients: 0,
      mixedClients: 0,
      unassignedClients: 0,
      over360Clients: 0,
      invoice2019ForwardClients: 0,
      oldOnlyClients: 0,
    },
  };
}

function normalizeBoard(board) {
  const normalized = { ...emptyBoard(), ...(board || {}) };
  normalized.statuses = DEFAULT_STATUSES;
  normalized.issueTypes = normalized.issueTypes?.length ? normalized.issueTypes : DEFAULT_ISSUES;
  normalized.clients = (normalized.clients || []).map((client) => ({
    ...client,
    flags: client.flags || {},
    audit: {
      status: "pending_review",
      issueType: "None",
      priority: "Normal",
      owner: "",
      followUpDate: "",
      findingNote: "",
      resolution: "",
      expectedAdjustment: "",
      reviewedBy: "",
      reviewedAt: "",
      tags: [],
      auditLog: [],
      ...(client.audit || {}),
    },
    documents: client.documents || [],
  }));
  normalized.summary = calculateSummary(normalized.clients);
  return normalized;
}

function loadStaticBoard() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return emptyBoard();
  try {
    return normalizeBoard(JSON.parse(saved));
  } catch (error) {
    return emptyBoard();
  }
}

function saveStaticBoard() {
  if (!state.staticMode || !state.board) return;
  state.board.summary = calculateSummary(state.board.clients || []);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.board));
}

function populateIssueFilter() {
  const selected = el.issueFilter.value || "all";
  el.issueFilter.innerHTML = '<option value="all">Todos los hallazgos</option>';
  for (const issue of state.board.issueTypes || []) {
    const option = document.createElement("option");
    option.value = issue;
    option.textContent = issueLabel(issue);
    el.issueFilter.append(option);
  }
  el.issueFilter.value = selected;
}

function filteredClients() {
  const q = state.query.trim().toLowerCase();
  return (state.board?.clients || []).filter((client) => {
    const audit = client.audit || {};
    const haystack = [
      client.name,
      client.codEmpresa,
      client.clientId,
      client.empresa,
      audit.findingNote,
      audit.resolution,
      issueLabel(audit.issueType),
      ...(client.documents || []).slice(0, 50).flatMap((doc) => [doc.document, doc.reference]),
    ]
      .join(" ")
      .toLowerCase();
    if (q && !haystack.includes(q)) return false;
    if (state.issueFilter !== "all" && audit.issueType !== state.issueFilter) return false;
    if (state.balanceFilter === "negative" && !client.flags.negativeOnly) return false;
    if (state.balanceFilter === "mixed" && !client.flags.mixedBalance) return false;
    if (state.balanceFilter === "over360" && !client.flags.over360) return false;
    if (state.balanceFilter === "activity2019" && !client.flags.hasInvoice2019Forward) return false;
    if (state.balanceFilter === "oldCarryforward" && !client.flags.oldCarryforwardWithNewActivity) return false;
    if (state.balanceFilter === "oldOnly" && !client.flags.oldOnlyBalance) return false;
    if (state.balanceFilter === "unassigned" && !client.flags.missingClient) return false;
    return true;
  });
}

function render() {
  renderSource();
  renderKpis();
  renderBoard();
  renderDrawer();
}

function renderSource() {
  if (!state.board?.fileName) {
    el.sourceFile.textContent = "No hay archivo importado";
    el.sourceMeta.textContent = state.staticMode
      ? "Importa un respaldo JSON para comenzar en GitHub Pages."
      : "Importa tu reporte de AR para comenzar.";
    return;
  }
  el.sourceFile.textContent = state.board.fileName;
  const mode = state.staticMode ? "modo estatico" : "modo local";
  el.sourceMeta.textContent = `${state.board.sheetName || "Hoja"} - ${number(state.board.summary.documents)} docs - ${mode} - importado ${new Date(
    state.board.importedAt
  ).toLocaleString("es-DO")}`;
}

function calculateSummary(clients) {
  return clients.reduce(
    (acc, client) => {
      acc.clients += 1;
      acc.documents += Number(client.documentCount || 0);
      acc.totalPending += Number(client.totalPending || 0);
      acc.negativeClients += client.flags.negativeOnly ? 1 : 0;
      acc.mixedClients += client.flags.mixedBalance ? 1 : 0;
      acc.unassignedClients += client.flags.missingClient ? 1 : 0;
      acc.over360Clients += client.flags.over360 ? 1 : 0;
      acc.invoice2019ForwardClients += client.flags.hasInvoice2019Forward ? 1 : 0;
      acc.oldOnlyClients += client.flags.oldOnlyBalance ? 1 : 0;
      return acc;
    },
    {
      clients: 0,
      documents: 0,
      totalPending: 0,
      negativeClients: 0,
      mixedClients: 0,
      unassignedClients: 0,
      over360Clients: 0,
      invoice2019ForwardClients: 0,
      oldOnlyClients: 0,
    }
  );
}

function renderKpis() {
  const summary = calculateSummary(filteredClients());
  const items = [
    ["Total pendiente", money(summary.totalPending)],
    ["Clientes", number(summary.clients)],
    ["Documentos", number(summary.documents)],
    ["Clientes negativos", number(summary.negativeClients)],
    ["Balances mixtos", number(summary.mixedClients)],
    ["Clientes con facturas 2019+", number(summary.invoice2019ForwardClients)],
  ];
  el.kpis.innerHTML = items
    .map(([label, value]) => `<article class="kpi"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`)
    .join("");
}

function renderBoard() {
  const clients = filteredClients();
  const byStatus = Object.fromEntries(statusOrder.map((status) => [status, []]));
  for (const client of clients) {
    const status = client.audit?.status || "pending_review";
    (byStatus[status] || byStatus.pending_review).push(client);
  }

  el.board.innerHTML = "";
  for (const status of state.board?.statuses || []) {
    const statusClients = byStatus[status.id] || [];
    const column = document.createElement("article");
    column.className = "column";
    column.innerHTML = `
      <div class="column-header">
        <div class="column-title">
          <strong>${escapeHtml(status.label)}</strong>
          <span>${statusClients.length} clientes</span>
        </div>
        <div class="column-total">${money(statusClients.reduce((sum, client) => sum + Number(client.totalPending || 0), 0))}</div>
      </div>
      <div class="cards" data-status="${escapeHtml(status.id)}"></div>
    `;
    const cards = column.querySelector(".cards");
    cards.addEventListener("dragover", onDragOver);
    cards.addEventListener("dragleave", onDragLeave);
    cards.addEventListener("drop", onDrop);
    if (!statusClients.length) {
      cards.innerHTML = '<div class="empty-state">No hay tarjetas para los filtros actuales</div>';
    } else {
      for (const client of statusClients) cards.append(renderCard(client));
    }
    el.board.append(column);
  }
}

function renderCard(client) {
  const card = document.createElement("button");
  card.type = "button";
  card.draggable = true;
  card.className = [
    "client-card",
    client.flags.negativeOnly ? "negative" : "",
    client.flags.mixedBalance ? "mixed" : "",
    client.audit?.status === "reviewed_ok" ? "reviewed" : "",
  ]
    .filter(Boolean)
    .join(" ");
  card.dataset.key = client.key;
  card.innerHTML = `
    <div class="card-main">
      <div class="card-title-row">
        <div>
          <div class="client-name">${escapeHtml(client.name || "Cliente sin nombre")}</div>
          <div class="chip">${escapeHtml(client.codEmpresa || client.clientId || "Sin asignar")}</div>
        </div>
        <div class="balance ${client.totalPending < 0 ? "negative-text" : ""}">${money(client.totalPending)}</div>
      </div>
      <div class="card-meta">
        <span class="chip">${number(client.documentCount)} docs</span>
        <span class="chip">Mas antigua ${escapeHtml(date(client.oldestDate))}</span>
        ${client.flags.negativeOnly ? '<span class="chip red">Negativo</span>' : ""}
        ${client.flags.mixedBalance ? '<span class="chip amber">Mixto</span>' : ""}
        ${client.flags.over360 ? '<span class="chip blue">360+</span>' : ""}
        ${client.flags.oldCarryforwardWithNewActivity ? '<span class="chip amber">Viejo + nuevo</span>' : ""}
        ${client.flags.hasInvoice2019Forward && !client.flags.oldCarryforwardWithNewActivity ? '<span class="chip green">2019+</span>' : ""}
        ${client.flags.oldOnlyBalance ? '<span class="chip">Solo viejo</span>' : ""}
        ${client.flags.inactive ? '<span class="chip">Inactivo</span>' : ""}
      </div>
      ${
        client.audit?.findingNote
          ? `<div class="card-note">${escapeHtml(client.audit.findingNote).slice(0, 150)}</div>`
          : ""
      }
    </div>
  `;
  card.addEventListener("click", () => {
    state.selectedKey = client.key;
    renderDrawer();
  });
  card.addEventListener("dragstart", (event) => {
    event.dataTransfer.setData("text/plain", client.key);
    event.dataTransfer.effectAllowed = "move";
  });
  return card;
}

function renderDrawer() {
  const client = selectedClient();
  if (!client) {
    el.drawer.classList.remove("open");
    el.drawer.innerHTML = "";
    return;
  }

  const audit = client.audit || {};
  el.drawer.classList.add("open");
  el.drawer.innerHTML = `
    <div class="drawer-header">
      <div class="drawer-actions">
        <button class="icon-button" id="closeDrawer" type="button" aria-label="Cerrar">x</button>
        <button class="button" id="saveAudit" type="button">Guardar caso</button>
      </div>
      <h2>${escapeHtml(client.name || "Cliente sin nombre")}</h2>
      <p class="drawer-subtitle">${escapeHtml(client.codEmpresa || "Sin asignar")} - ${escapeHtml(client.empresa || "Sin empresa")} - ${number(
        client.documentCount
      )} documentos</p>
    </div>
    <div class="drawer-body">
      <div class="summary-grid">
        <div class="summary-item"><span>Pendiente</span><strong class="${client.totalPending < 0 ? "negative-text" : ""}">${money(
          client.totalPending
        )}</strong></div>
        <div class="summary-item"><span>Original</span><strong>${money(client.totalOriginal)}</strong></div>
        <div class="summary-item"><span>Mas antigua</span><strong>${escapeHtml(date(client.oldestDate))}</strong></div>
        <div class="summary-item"><span>Mayor doc.</span><strong>${money(client.largestPendingDocument)}</strong></div>
      </div>

      <section class="section">
        <h3>Fuente de Verdad de Auditoria</h3>
        <div class="form-grid">
          <div class="field">
            <label for="auditStatus">Status</label>
            <select id="auditStatus">${statusOptions(audit.status)}</select>
          </div>
          <div class="field">
            <label for="issueType">Tipo de Hallazgo</label>
            <select id="issueType">${issueOptions(audit.issueType)}</select>
          </div>
          <div class="field">
            <label for="priority">Prioridad</label>
            <select id="priority">
              ${Object.entries(priorityLabels).map(([value, label]) => option(value, audit.priority, label)).join("")}
            </select>
          </div>
          <div class="field">
            <label for="owner">Responsable</label>
            <input id="owner" value="${attr(audit.owner)}" placeholder="Revisor o responsable" />
          </div>
          <div class="field">
            <label for="followUpDate">Seguimiento</label>
            <input id="followUpDate" type="date" value="${attr(audit.followUpDate)}" />
          </div>
          <div class="field">
            <label for="expectedAdjustment">Ajuste Esperado</label>
            <input id="expectedAdjustment" value="${attr(audit.expectedAdjustment)}" placeholder="Ejemplo: -75166 recibo duplicado" />
          </div>
          <div class="field full">
            <label for="findingNote">Hallazgo</label>
            <textarea id="findingNote" placeholder="Ejemplo: Cliente tiene balance negativo de 75,166 porque el recibo RI-000 parece duplicado.">${escapeHtml(
              audit.findingNote || ""
            )}</textarea>
          </div>
          <div class="field full">
            <label for="resolution">Resolucion / Conclusion</label>
            <textarea id="resolution" placeholder="Conclusion final, ajuste solicitado, evidencia de soporte, o razon por la cual el balance esta OK.">${escapeHtml(
              audit.resolution || ""
            )}</textarea>
          </div>
          <div class="field">
            <label for="reviewedBy">Revisado Por</label>
            <input id="reviewedBy" value="${attr(audit.reviewedBy)}" />
          </div>
          <div class="field">
            <label for="reviewedAt">Fecha Revision</label>
            <input id="reviewedAt" type="date" value="${attr(audit.reviewedAt)}" />
          </div>
          <div class="field full">
            <label for="logMessage">Agregar Nota al Historial</label>
            <input id="logMessage" placeholder="Nota opcional que se agrega al historial al guardar" />
          </div>
        </div>
      </section>

      <section class="section">
        <h3>Detalle del Cliente</h3>
        <div class="summary-grid">
          <div class="summary-item"><span>Contacto</span><strong>${escapeHtml(client.contact || "-")}</strong></div>
          <div class="summary-item"><span>Status Cliente</span><strong>${escapeHtml(client.clientStatus || "-")}</strong></div>
          <div class="summary-item"><span>Docs Positivos</span><strong>${number(client.positiveDocs)}</strong></div>
          <div class="summary-item"><span>Docs Negativos</span><strong>${number(client.negativeDocs)}</strong></div>
        </div>
      </section>

      <section class="section">
        <h3>Documentos</h3>
        <div class="document-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Documento</th>
                <th>Referencia</th>
                <th>Tipo</th>
                <th>Pendiente</th>
                <th>Antiguedad</th>
              </tr>
            </thead>
            <tbody>
              ${(client.documents || [])
                .map(
                  (doc) => `
                <tr>
                  <td>${escapeHtml(date(doc.date))}</td>
                  <td>${escapeHtml(doc.document)}</td>
                  <td>${escapeHtml(doc.reference)}</td>
                  <td>${escapeHtml(doc.type)}</td>
                  <td class="amount ${doc.pendingAmount < 0 ? "negative-text" : ""}">${money(doc.pendingAmount)}</td>
                  <td>${escapeHtml(doc.agingBucket)}</td>
                </tr>`
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </section>

      <section class="section">
        <h3>Historial de Auditoria</h3>
        <div class="timeline">
          ${(audit.auditLog || [])
            .slice()
            .reverse()
            .map(
              (item) => `
              <div class="timeline-item">
                <time>${escapeHtml(new Date(item.at).toLocaleString("es-DO"))}</time>
                <p>${escapeHtml(item.message)}</p>
              </div>`
            )
            .join("") || '<div class="empty-state">No hay entradas en el historial</div>'}
        </div>
      </section>
    </div>
  `;
  document.querySelector("#closeDrawer").addEventListener("click", () => {
    state.selectedKey = null;
    renderDrawer();
  });
  document.querySelector("#saveAudit").addEventListener("click", saveCurrentAudit);
}

function selectedClient() {
  return (state.board?.clients || []).find((client) => client.key === state.selectedKey);
}

function statusOptions(selected) {
  return (state.board?.statuses || []).map((status) => option(status.id, selected, status.label)).join("");
}

function issueOptions(selected) {
  return (state.board?.issueTypes || []).map((issue) => option(issue, selected, issueLabel(issue))).join("");
}

function option(value, selected, label = value) {
  return `<option value="${attr(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(label)}</option>`;
}

async function saveCurrentAudit() {
  const client = selectedClient();
  if (!client) return;
  const payload = {
    status: value("#auditStatus"),
    issueType: value("#issueType"),
    priority: value("#priority"),
    owner: value("#owner"),
    followUpDate: value("#followUpDate"),
    findingNote: value("#findingNote"),
    resolution: value("#resolution"),
    expectedAdjustment: value("#expectedAdjustment"),
    reviewedBy: value("#reviewedBy"),
    reviewedAt: value("#reviewedAt"),
    logMessage: value("#logMessage"),
  };
  if (state.staticMode) {
    client.audit = updateAuditObject(client.audit, payload);
    saveStaticBoard();
  } else {
    const response = await api(`/api/client/${encodeURIComponent(client.key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    client.audit = response.audit;
  }
  showToast("Caso guardado.");
  render();
}

function updateAuditObject(currentAudit, updates) {
  const current = { ...(currentAudit || {}) };
  const oldStatus = current.status;
  for (const [key, value] of Object.entries(updates)) {
    if (key !== "logMessage") current[key] = value;
  }
  current.updatedAt = new Date().toISOString();
  current.auditLog = current.auditLog || [];
  if (current.status !== oldStatus) {
    current.auditLog.push({
      at: current.updatedAt,
      type: "status",
      message: `Movido de ${statusLabel(oldStatus)} a ${statusLabel(current.status)}.`,
    });
  }
  if (updates.logMessage) {
    current.auditLog.push({ at: current.updatedAt, type: "note", message: updates.logMessage });
  }
  return current;
}

function value(selector) {
  return document.querySelector(selector)?.value || "";
}

function onDragOver(event) {
  event.preventDefault();
  event.currentTarget.classList.add("drag-over");
}

function onDragLeave(event) {
  event.currentTarget.classList.remove("drag-over");
}

async function onDrop(event) {
  event.preventDefault();
  event.currentTarget.classList.remove("drag-over");
  const key = event.dataTransfer.getData("text/plain");
  const status = event.currentTarget.dataset.status;
  const client = (state.board?.clients || []).find((item) => item.key === key);
  if (!client || !status || client.audit?.status === status) return;
  if (state.staticMode) {
    client.audit = updateAuditObject(client.audit, { status });
    saveStaticBoard();
  } else {
    const response = await api(`/api/client/${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    client.audit = response.audit;
  }
  showToast(`Movido a ${statusLabel(status)}.`);
  render();
}

async function importWorkbook(file) {
  if (state.staticMode) {
    showToast("En GitHub Pages importa un respaldo JSON. El import de Excel requiere el servidor local.");
    return;
  }
  const form = new FormData();
  form.append("file", file);
  showToast("Importando archivo...");
  const payload = await api("/api/import", { method: "POST", body: form });
  state.board = payload;
  state.selectedKey = null;
  populateIssueFilter();
  render();
  showToast(`Importados ${number(payload.summary.clients)} clientes y ${number(payload.summary.documents)} documentos.`);
}

async function importJsonBackup(file) {
  const text = await file.text();
  const payload = normalizeBoard(JSON.parse(text));
  state.board = payload;
  state.selectedKey = null;
  if (state.staticMode) saveStaticBoard();
  populateIssueFilter();
  render();
  showToast(`JSON importado: ${number(payload.summary.clients)} clientes.`);
}

function summaryRowsForExport() {
  return (state.board?.clients || []).map((client) => {
    const audit = client.audit || {};
    return {
      "Cod Empresa": client.codEmpresa || "",
      "Cliente ID": client.clientId || "",
      "Razon Social": client.name || "",
      Empresa: client.empresa || "",
      "Total Pendiente": client.totalPending || 0,
      Documentos: client.documentCount || 0,
      "Fecha Mas Antigua": client.oldestDate || "",
      "Dias Vencidos Max": client.maxDaysOverdue || "",
      "Status Auditoria": statusLabel(audit.status || ""),
      "Tipo Hallazgo": issueLabel(audit.issueType || ""),
      Prioridad: priorityLabel(audit.priority || ""),
      Responsable: audit.owner || "",
      Seguimiento: audit.followUpDate || "",
      "Ajuste Esperado": audit.expectedAdjustment || "",
      Hallazgo: audit.findingNote || "",
      Resolucion: audit.resolution || "",
      "Revisado Por": audit.reviewedBy || "",
      "Revisado En": audit.reviewedAt || "",
      Flags: Object.entries(client.flags || {})
        .filter(([, value]) => value)
        .map(([key]) => key)
        .join(", "),
    };
  });
}

function documentRowsForExport() {
  const rows = [];
  for (const client of state.board?.clients || []) {
    const audit = client.audit || {};
    for (const doc of client.documents || []) {
      rows.push({
        "Cod Empresa": client.codEmpresa || "",
        "Cliente ID": client.clientId || "",
        "Razon Social": client.name || "",
        Empresa: client.empresa || "",
        "Status Auditoria": statusLabel(audit.status || ""),
        "Tipo Hallazgo": issueLabel(audit.issueType || ""),
        Documento: doc.document || "",
        Referencia: doc.reference || "",
        "Tipo Doc": doc.type || "",
        Origen: doc.origin || "",
        Fecha: doc.date || "",
        "Fecha Vencimiento": doc.dueDate || "",
        "Valor Original": doc.originalAmount || 0,
        "Valor Pendiente": doc.pendingAmount || 0,
        "Dias Vencidos": doc.daysOverdue || "",
        "Rango Dias Vencidos": doc.agingBucket || "",
        "Status Factura": doc.invoiceStatus || "",
      });
    }
  }
  return rows;
}

function statusRowsForExport() {
  return DEFAULT_STATUSES.map((status) => {
    const clients = (state.board?.clients || []).filter((client) => client.audit?.status === status.id);
    const summary = calculateSummary(clients);
    return {
      Status: status.label,
      Clientes: summary.clients,
      Documentos: summary.documents,
      "Total Pendiente": summary.totalPending,
      "Clientes Negativos": summary.negativeClients,
      "Clientes Mixtos": summary.mixedClients,
      "Clientes 2019+": summary.invoice2019ForwardClients,
    };
  });
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function rowsToCsv(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  return [headers.map(csvEscape).join(","), ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(","))].join("\r\n");
}

function downloadBlob(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportJson() {
  const payload = normalizeBoard(state.board);
  downloadBlob("ar-audit-board.json", JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
}

function exportCsv() {
  downloadBlob("ar-audit-summary.csv", "\uFEFF" + rowsToCsv(summaryRowsForExport()), "text/csv;charset=utf-8");
}

function xmlCell(value) {
  const isNumber = typeof value === "number" && Number.isFinite(value);
  const type = isNumber ? "Number" : "String";
  const safe = String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  return `<Cell><Data ss:Type="${type}">${safe}</Data></Cell>`;
}

function xmlSheet(name, rows) {
  if (!rows.length) return `<Worksheet ss:Name="${name}"><Table><Row>${xmlCell("Sin datos")}</Row></Table></Worksheet>`;
  const headers = Object.keys(rows[0]);
  const body = [
    `<Row>${headers.map(xmlCell).join("")}</Row>`,
    ...rows.map((row) => `<Row>${headers.map((header) => xmlCell(row[header])).join("")}</Row>`),
  ].join("");
  return `<Worksheet ss:Name="${name}"><Table>${body}</Table></Worksheet>`;
}

function exportExcelCompatible() {
  const workbook = `<?xml version="1.0" encoding="UTF-8"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
${xmlSheet("Audit Summary", summaryRowsForExport())}
${xmlSheet("Documents", documentRowsForExport())}
${xmlSheet("Status Summary", statusRowsForExport())}
</Workbook>`;
  downloadBlob("ar-audit-export.xls", workbook, "application/vnd.ms-excel;charset=utf-8");
}

function handleExportClick(event) {
  const href = event.currentTarget.getAttribute("href");
  if (!state.staticMode) return;
  event.preventDefault();
  if (href.endsWith(".xlsx")) exportExcelCompatible();
  if (href.endsWith(".csv")) exportCsv();
  if (href.endsWith(".json")) exportJson();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function attr(value) {
  return escapeHtml(value);
}

el.fileInput.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (file) importWorkbook(file).catch((error) => showToast(error.message));
  event.target.value = "";
});

el.jsonInput.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (file) importJsonBackup(file).catch((error) => showToast(error.message));
  event.target.value = "";
});

document.querySelectorAll('.sidebar-footer a[href^="/api/export"]').forEach((link) => {
  link.addEventListener("click", handleExportClick);
});

el.searchInput.addEventListener("input", (event) => {
  state.query = event.target.value;
  renderKpis();
  renderBoard();
});

el.issueFilter.addEventListener("change", (event) => {
  state.issueFilter = event.target.value;
  renderKpis();
  renderBoard();
});

el.balanceFilter.addEventListener("change", (event) => {
  state.balanceFilter = event.target.value;
  renderKpis();
  renderBoard();
});

el.clearFilters.addEventListener("click", () => {
  state.query = "";
  state.issueFilter = "all";
  state.balanceFilter = "all";
  el.searchInput.value = "";
  el.issueFilter.value = "all";
  el.balanceFilter.value = "all";
  renderKpis();
  renderBoard();
});

loadBoard().catch((error) => showToast(error.message));

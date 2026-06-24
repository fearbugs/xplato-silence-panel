(() => {
  "use strict";

  const config = window.SILENCE_CONFIG || {};
  const apiBase = String(config.apiBase || "").replace(/\/$/, "");
  const state = {
    targets: [],
    receiptToken: new URLSearchParams(location.hash.slice(1)).get("receipt") || "",
    adminToken: readSession("silence-admin-token") || "",
    theme: readLocal("silence-theme") || document.documentElement.dataset.theme || "light",
    adminHoldTimer: null,
  };

  const elements = Object.fromEntries([
    "serviceState", "themeToggle", "workspace", "batchForm", "uidInput", "defaultHours", "durationPresets", "startMode",
    "startAtField", "startAt", "addTargets", "otp", "note", "submitBatch", "clearBatch",
    "targetRows", "targetCount", "activity", "receiptBand", "receiptSummary", "receiptRows",
    "refreshReceipt", "adminTrigger", "adminPage", "closeAdmin", "adminLogin", "masterPassword",
    "adminLoginError", "adminDashboard", "adminMetrics", "adminRows", "adminStatusFilter",
    "refreshAdmin", "adminLogout", "runnerState", "extendDialog", "extendForm", "extendHours",
    "extendSilenceId", "closeExtend",
  ].map((id) => [id, document.getElementById(id)]));

  function request(path, options = {}) {
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    };
    if (state.adminToken && path.startsWith("/api/admin/")) {
      headers.Authorization = `Bearer ${state.adminToken}`;
    }
    return fetch(`${apiBase}${path}`, {
      credentials: "include",
      ...options,
      headers,
    }).then(async (response) => {
      const data = await response.json().catch(() => ({ error: "invalid_response" }));
      if (!response.ok || !data.ok) {
        const error = new Error(data.message || readableError(data.error));
        error.code = data.error;
        throw error;
      }
      return data;
    });
  }

  function readableError(value) {
    return String(value || "Request failed").replace(/_/g, " ");
  }

  function readLocal(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return "";
    }
  }

  function writeLocal(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Theme still applies for this page even if persistence is unavailable.
    }
  }

  function readSession(key) {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return "";
    }
  }

  function writeSession(key, value) {
    try {
      sessionStorage.setItem(key, value);
    } catch {
      // Admin still works for this page load through in-memory state.
    }
  }

  function removeSession(key) {
    try {
      sessionStorage.removeItem(key);
    } catch {
      // Ignore storage cleanup failures.
    }
  }

  function applyTheme(theme) {
    state.theme = theme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = state.theme;
    writeLocal("silence-theme", state.theme);
    const dark = state.theme === "dark";
    elements.themeToggle.setAttribute("aria-pressed", String(dark));
    elements.themeToggle.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
  }

  function toggleTheme() {
    applyTheme(state.theme === "dark" ? "light" : "dark");
  }

  function parseUidInput() {
    const values = elements.uidInput.value.split(/[\s,;]+/).map((value) => value.trim().toLowerCase()).filter(Boolean);
    const existing = new Set(state.targets.map((target) => target.uid));
    const invalid = [];
    for (const uid of values) {
      if (!/^[0-9a-z]+-[0-9a-z]+$/.test(uid)) {
        invalid.push(uid);
        continue;
      }
      if (!existing.has(uid)) {
        state.targets.push({ uid, hours: Number(elements.defaultHours.value) || 4, indefinite: false });
        existing.add(uid);
      }
    }
    elements.uidInput.value = "";
    renderTargets();
    if (invalid.length) setActivity("Some UIDs were skipped", invalid.join(", "), "warn");
    else setActivity("Batch updated", `${state.targets.length} target${state.targets.length === 1 ? "" : "s"} ready.`, "");
  }

  function renderTargets() {
    elements.targetRows.replaceChildren();
    elements.targetCount.textContent = String(state.targets.length);
    if (!state.targets.length) {
      const row = document.createElement("tr");
      row.className = "empty-row";
      const cell = document.createElement("td");
      cell.colSpan = 3;
      cell.textContent = "No UIDs added.";
      row.append(cell);
      elements.targetRows.append(row);
      return;
    }

    state.targets.forEach((target, index) => {
      const row = document.createElement("tr");
      const uid = document.createElement("td");
      uid.className = "uid-cell";
      uid.textContent = target.uid;

      const duration = document.createElement("td");
      const editor = document.createElement("div");
      editor.className = "duration-editor";
      const hours = document.createElement("input");
      hours.type = "number";
      hours.min = "4";
      hours.max = "720";
      hours.step = "0.25";
      hours.value = String(target.hours);
      hours.disabled = target.indefinite;
      hours.setAttribute("aria-label", `Duration hours for ${target.uid}`);
      hours.addEventListener("change", () => {
        target.hours = Math.max(4, Math.min(720, Number(hours.value) || 4));
        hours.value = String(target.hours);
      });
      const indefiniteLabel = document.createElement("label");
      const indefinite = document.createElement("input");
      indefinite.type = "checkbox";
      indefinite.checked = target.indefinite;
      indefinite.addEventListener("change", () => {
        target.indefinite = indefinite.checked;
        hours.disabled = target.indefinite;
      });
      indefiniteLabel.append(indefinite, document.createTextNode("Indefinite"));
      editor.append(hours, indefiniteLabel);
      duration.append(editor);

      const actions = document.createElement("td");
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "icon-button";
      remove.title = "Remove UID";
      remove.setAttribute("aria-label", `Remove ${target.uid}`);
      remove.textContent = "×";
      remove.addEventListener("click", () => {
        state.targets.splice(index, 1);
        renderTargets();
      });
      actions.append(remove);
      row.append(uid, duration, actions);
      elements.targetRows.append(row);
    });
  }

  function setActivity(title, detail, kind = "") {
    elements.activity.className = `activity${kind ? ` ${kind}` : ""}`;
    elements.activity.replaceChildren();
    const strong = document.createElement("strong");
    strong.textContent = title;
    const span = document.createElement("span");
    span.textContent = detail;
    elements.activity.append(strong, span);
  }

  async function submitBatch(event) {
    event.preventDefault();
    if (elements.uidInput.value.trim()) parseUidInput();
    if (!state.targets.length) return setActivity("No targets", "Add at least one valid UID.", "error");
    if (!elements.otp.value.trim()) return setActivity("OTP required", "Generate a one-time password in Discord.", "error");

    const targets = state.targets.map((target) => ({
      uid: target.uid,
      durationMinutes: target.indefinite ? undefined : Math.round(target.hours * 60),
      indefinite: target.indefinite,
    }));
    const body = {
      otp: elements.otp.value,
      targets,
      note: elements.note.value.trim(),
      startAt: elements.startMode.value === "scheduled" && elements.startAt.value
        ? new Date(elements.startAt.value).toISOString()
        : null,
    };
    let idempotencyKey = sessionStorage.getItem("silence-pending-key");
    if (!idempotencyKey) {
      idempotencyKey = crypto.randomUUID();
      sessionStorage.setItem("silence-pending-key", idempotencyKey);
    }

    elements.submitBatch.disabled = true;
    setActivity("Submitting batch", "Validating the one-time password.");
    try {
      const data = await request("/api/batches", {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: JSON.stringify(body),
      });
      sessionStorage.removeItem("silence-pending-key");
      elements.otp.value = "";
      state.receiptToken = data.receiptToken;
      history.replaceState(null, "", `#receipt=${encodeURIComponent(data.receiptToken)}`);
      setActivity("Batch scheduled", `${data.targets.length} target${data.targets.length === 1 ? "" : "s"} accepted.`);
      await loadReceipt();
    } catch (error) {
      if (["invalid_or_expired_otp", "otp_already_used"].includes(error.code)) {
        sessionStorage.removeItem("silence-pending-key");
      }
      setActivity("Batch rejected", error.message, "error");
    } finally {
      elements.submitBatch.disabled = false;
    }
  }

  async function loadReceipt() {
    if (!state.receiptToken) return;
    elements.receiptBand.classList.remove("hidden");
    try {
      const data = await request(`/api/receipts/${encodeURIComponent(state.receiptToken)}`);
      const batch = data.batch;
      elements.receiptSummary.replaceChildren(
        summaryText(`Batch ${batch.id.slice(0, 8)}`),
        summaryText(`${batch.targetCount} targets`),
        summaryText(`Created ${formatDate(batch.createdAt)}`),
        statusTag(batch.status),
      );
      elements.receiptRows.replaceChildren();
      data.silences.forEach((silence) => {
        const row = document.createElement("tr");
        row.append(
          textCell(silence.uid, "uid-cell"),
          textCell(formatDuration(silence)),
          nodeCell(statusTag(silence.status)),
          textCell(formatNext(silence)),
        );
        elements.receiptRows.append(row);
      });
    } catch (error) {
      elements.receiptSummary.textContent = error.message;
    }
  }

  async function checkHealth() {
    try {
      await request("/health");
      elements.serviceState.className = "service-state online";
      elements.serviceState.lastElementChild.textContent = "Service online";
    } catch {
      elements.serviceState.className = "service-state offline";
      elements.serviceState.lastElementChild.textContent = "Service unavailable";
    }
  }

  function openAdmin() {
    elements.workspace.classList.add("hidden");
    elements.receiptBand.classList.add("hidden");
    elements.adminPage.classList.remove("hidden");
    elements.masterPassword.focus();
    if (state.adminToken) loadAdmin({ quietUnauthorized: true });
    else showAdminLogin();
  }

  function closeAdminPage() {
    elements.adminPage.classList.add("hidden");
    elements.workspace.classList.remove("hidden");
    if (state.receiptToken) loadReceipt();
  }

  async function adminLogin(event) {
    event.preventDefault();
    elements.adminLoginError.textContent = "";
    try {
      const data = await request("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ password: elements.masterPassword.value }),
      });
      state.adminToken = data.sessionToken || "";
      if (state.adminToken) writeSession("silence-admin-token", state.adminToken);
      elements.masterPassword.value = "";
      elements.adminLogin.classList.add("hidden");
      elements.adminDashboard.classList.remove("hidden");
      await loadAdmin();
    } catch (error) {
      elements.adminLoginError.textContent = error.message;
    }
  }

  async function loadAdmin(options = {}) {
    try {
      const status = elements.adminStatusFilter.value;
      const [overview, listing] = await Promise.all([
        request("/api/admin/overview"),
        request(`/api/admin/silences?limit=100${status ? `&status=${encodeURIComponent(status)}` : ""}`),
      ]);
      elements.adminLogin.classList.add("hidden");
      elements.adminDashboard.classList.remove("hidden");
      renderMetrics(overview);
      renderAdminRows(listing.silences);
      renderRunner(overview.runner, overview.serverTime);
    } catch (error) {
      if (error.code === "unauthorized") {
        state.adminToken = "";
        removeSession("silence-admin-token");
        showAdminLogin();
        if (!options.quietUnauthorized) elements.adminLoginError.textContent = "Admin session expired. Please log in again.";
      }
      else elements.runnerState.textContent = error.message;
    }
  }

  function renderMetrics(overview) {
    const active = Number(overview.counts.active || 0) + Number(overview.counts.holding || 0);
    const values = [
      [active, "Running"],
      [overview.counts.scheduled || 0, "Scheduled"],
      [overview.counts.failed || 0, "Failed"],
      [overview.counts.completed || 0, "Completed"],
    ];
    elements.adminMetrics.replaceChildren(...values.map(([value, label]) => {
      const metric = document.createElement("div");
      metric.className = "metric";
      const strong = document.createElement("strong");
      strong.textContent = String(value);
      const span = document.createElement("span");
      span.textContent = label;
      metric.append(strong, span);
      return metric;
    }));
  }

  function renderAdminRows(rows) {
    elements.adminRows.replaceChildren();
    if (!rows.length) {
      const row = document.createElement("tr");
      const cell = textCell("No matching silences.");
      cell.colSpan = 6;
      row.append(cell);
      elements.adminRows.append(row);
      return;
    }
    rows.forEach((silence) => {
      const row = document.createElement("tr");
      const actions = document.createElement("div");
      actions.className = "table-actions";
      if (["scheduled", "queued", "active", "holding"].includes(silence.status)) {
        const extend = document.createElement("button");
        extend.type = "button";
        extend.textContent = "Extend";
        extend.addEventListener("click", () => {
          elements.extendSilenceId.value = silence.id;
          elements.extendHours.value = String((silence.durationMinutes || 480) / 60);
          elements.extendDialog.showModal();
        });
        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.className = "danger";
        cancel.textContent = "Cancel";
        cancel.addEventListener("click", () => cancelSilence(silence.id));
        actions.append(extend, cancel);
      } else if (silence.status === "failed") {
        const retry = document.createElement("button");
        retry.type = "button";
        retry.textContent = "Retry";
        retry.addEventListener("click", () => retrySilence(silence.id));
        actions.append(retry);
      }
      row.append(
        textCell(silence.moderator || silence.note || "—", "moderator-cell"),
        textCell(silence.uid, "uid-cell"),
        nodeCell(statusTag(silence.status)),
        textCell(silence.endAt ? formatDate(silence.endAt) : silence.indefinite ? "Indefinite" : "Pending"),
        textCell(silence.nextRunAt ? formatDate(silence.nextRunAt) : "None"),
        nodeCell(actions),
      );
      elements.adminRows.append(row);
    });
  }

  function renderRunner(runner, serverTime) {
    elements.runnerState.className = "activity compact-activity";
    elements.runnerState.replaceChildren();
    const strong = document.createElement("strong");
    const span = document.createElement("span");
    if (!runner) {
      elements.runnerState.classList.add("error");
      strong.textContent = "Runner not registered";
      span.textContent = "No heartbeat has been received.";
    } else {
      const age = Number(serverTime) - Number(runner.heartbeatAt);
      const online = age < 120000;
      if (!online) elements.runnerState.classList.add("error");
      else if (!runner.liveEnabled) elements.runnerState.classList.add("warn");
      strong.textContent = online ? (runner.liveEnabled ? "Runner online" : "Runner in dry-run standby") : "Runner offline";
      span.textContent = `Heartbeat ${formatDate(runner.heartbeatAt)}${runner.lastPlatoAckAt ? ` · Last ACK ${formatDate(runner.lastPlatoAckAt)}` : ""}`;
    }
    elements.runnerState.append(strong, span);
  }

  async function cancelSilence(id) {
    try {
      await request(`/api/admin/silences/${id}/cancel`, { method: "POST", body: "{}" });
      await loadAdmin();
    } catch (error) {
      elements.runnerState.textContent = error.message;
    }
  }

  async function extendSilence(event) {
    event.preventDefault();
    const id = elements.extendSilenceId.value;
    try {
      await request(`/api/admin/silences/${id}/extend`, {
        method: "POST",
        body: JSON.stringify({ durationMinutes: Math.round(Number(elements.extendHours.value) * 60) }),
      });
      elements.extendDialog.close();
      await loadAdmin();
    } catch (error) {
      elements.extendHours.setCustomValidity(error.message);
      elements.extendHours.reportValidity();
      setTimeout(() => elements.extendHours.setCustomValidity(""), 1500);
    }
  }

  async function retrySilence(id) {
    try {
      await request(`/api/admin/silences/${id}/retry`, { method: "POST", body: "{}" });
      await loadAdmin();
    } catch (error) {
      elements.runnerState.textContent = error.message;
    }
  }

  async function logoutAdmin() {
    await request("/api/admin/logout", { method: "POST", body: "{}" }).catch(() => {});
    state.adminToken = "";
    removeSession("silence-admin-token");
    showAdminLogin();
  }

  function showAdminLogin() {
    elements.adminDashboard.classList.add("hidden");
    elements.adminLogin.classList.remove("hidden");
  }

  function statusTag(status) {
    const span = document.createElement("span");
    span.className = `status-tag ${status}`;
    span.textContent = status;
    return span;
  }

  function summaryText(value) {
    const span = document.createElement("span");
    span.textContent = value;
    return span;
  }

  function textCell(value, className = "") {
    const cell = document.createElement("td");
    cell.className = className;
    cell.textContent = value;
    return cell;
  }

  function nodeCell(node) {
    const cell = document.createElement("td");
    cell.append(node);
    return cell;
  }

  function formatDuration(silence) {
    if (silence.indefinite) return "Indefinite";
    const hours = Number(silence.durationMinutes) / 60;
    return `${Number.isInteger(hours) ? hours : hours.toFixed(2)}h`;
  }

  function formatNext(silence) {
    if (silence.nextRunAt) return formatDate(silence.nextRunAt);
    if (silence.endAt) return `Expires ${formatDate(silence.endAt)}`;
    return "Pending";
  }

  function formatDate(timestamp) {
    if (!timestamp) return "—";
    return new Intl.DateTimeFormat(undefined, {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    }).format(new Date(Number(timestamp)));
  }

  function startAdminHold(event) {
    if (event.button !== undefined && event.button !== 0) return;
    if (event.cancelable) event.preventDefault();
    if (state.adminHoldTimer) return;
    state.adminHoldTimer = setTimeout(() => {
      state.adminHoldTimer = null;
      openAdmin();
    }, 1000);
  }

  function cancelAdminHold(event) {
    if (event?.cancelable) event.preventDefault();
    clearTimeout(state.adminHoldTimer);
    state.adminHoldTimer = null;
  }

  elements.addTargets.addEventListener("click", parseUidInput);
  elements.uidInput.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") parseUidInput();
  });
  elements.durationPresets.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-hours]");
    if (!button) return;
    elements.defaultHours.value = button.dataset.hours;
    elements.durationPresets.querySelectorAll("button").forEach((item) => item.classList.toggle("selected", item === button));
  });
  elements.defaultHours.addEventListener("input", () => {
    elements.durationPresets.querySelectorAll("button").forEach((item) => item.classList.toggle("selected", item.dataset.hours === elements.defaultHours.value));
  });
  elements.startMode.addEventListener("change", () => {
    elements.startAtField.classList.toggle("hidden", elements.startMode.value !== "scheduled");
    if (elements.startMode.value === "scheduled" && !elements.startAt.value) {
      const start = new Date(Date.now() + 5 * 60 * 1000);
      start.setSeconds(0, 0);
      const local = new Date(start.getTime() - start.getTimezoneOffset() * 60 * 1000);
      elements.startAt.value = local.toISOString().slice(0, 16);
    }
  });
  elements.batchForm.addEventListener("submit", submitBatch);
  elements.clearBatch.addEventListener("click", () => {
    state.targets = [];
    renderTargets();
    setActivity("Ready", "Add UIDs to prepare a batch.");
  });
  elements.refreshReceipt.addEventListener("click", loadReceipt);
  elements.themeToggle.addEventListener("click", toggleTheme);

  elements.adminTrigger.addEventListener("touchstart", startAdminHold, { passive: false });
  elements.adminTrigger.addEventListener("touchend", cancelAdminHold, { passive: false });
  elements.adminTrigger.addEventListener("touchcancel", cancelAdminHold, { passive: false });
  elements.adminTrigger.addEventListener("mousedown", startAdminHold);
  elements.adminTrigger.addEventListener("mouseup", cancelAdminHold);
  elements.adminTrigger.addEventListener("mouseleave", cancelAdminHold);
  elements.adminTrigger.addEventListener("click", (event) => event.preventDefault());
  elements.adminTrigger.addEventListener("contextmenu", (event) => event.preventDefault());
  elements.closeAdmin.addEventListener("click", closeAdminPage);
  elements.adminLogin.addEventListener("submit", adminLogin);
  elements.refreshAdmin.addEventListener("click", loadAdmin);
  elements.adminStatusFilter.addEventListener("change", loadAdmin);
  elements.adminLogout.addEventListener("click", logoutAdmin);
  elements.extendForm.addEventListener("submit", extendSilence);
  elements.closeExtend.addEventListener("click", () => elements.extendDialog.close());

  renderTargets();
  applyTheme(state.theme);
  checkHealth();
  if (state.receiptToken) loadReceipt();
})();

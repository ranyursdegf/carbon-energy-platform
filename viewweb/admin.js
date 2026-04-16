const api = window.CarbonApi;

const state = {
  admin: null,
  areas: [],
  selectedAreaId: null,
  editingAreaId: null
};

const dom = {
  adminName: document.getElementById("adminName"),
  adminRoleText: document.getElementById("adminRoleText"),
  logoutButton: document.getElementById("logoutButton"),
  passwordForm: document.getElementById("passwordForm"),
  passwordStatus: document.getElementById("passwordStatus"),
  areaFormTitle: document.getElementById("areaFormTitle"),
  areaForm: document.getElementById("areaForm"),
  areaStatus: document.getElementById("areaStatus"),
  cancelAreaEdit: document.getElementById("cancelAreaEdit"),
  deactivateAreaButton: document.getElementById("deactivateAreaButton"),
  areaList: document.getElementById("areaList"),
  readingForm: document.getElementById("readingForm"),
  readingAreaSelect: document.getElementById("readingAreaSelect"),
  readingStatus: document.getElementById("readingStatus"),
  readingPeriodSelect: document.querySelector("#readingForm [name='periodType']"),
  readingTimeInput: document.querySelector("#readingForm [name='readingTime']"),
  readingImportFile: document.getElementById("readingImportFile"),
  downloadReadingTemplate: document.getElementById("downloadReadingTemplate"),
  importReadingButton: document.getElementById("importReadingButton"),
  importStatus: document.getElementById("importStatus"),
  adminStats: document.getElementById("adminStats")
};

init();

async function init() {
  bindEvents();
  await ensureAdmin();
  dom.readingForm.readingTime.value = new Date().toISOString().slice(0, 10);
  syncReadingTimeInput();
  await loadAreas();
}

function bindEvents() {
  dom.logoutButton.addEventListener("click", async () => {
    await api.logoutAdmin();
    window.location.href = "./index.html";
  });

  dom.passwordForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(dom.passwordForm);
    if (form.get("newPassword") !== form.get("confirmPassword")) {
      setStatus(dom.passwordStatus, "两次新密码不一致", "danger");
      return;
    }

    setStatus(dom.passwordStatus, "更新中...");
    try {
      await api.changeAdminPassword({
        currentPassword: form.get("currentPassword"),
        newPassword: form.get("newPassword")
      });
      setStatus(dom.passwordStatus, "密码已更新，请重新登录", "success");
      setTimeout(() => {
        window.location.href = "./index.html?admin=login";
      }, 900);
    } catch (error) {
      setStatus(dom.passwordStatus, error.message, "danger");
    }
  });

  dom.areaForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus(dom.areaStatus, "保存中...");
    try {
      const form = new FormData(dom.areaForm);
      const payload = {
        name: form.get("name"),
        code: form.get("code"),
        areaType: form.get("areaType"),
        floorAreaM2: form.get("floorAreaM2"),
        staffCount: form.get("staffCount"),
        annualBudgetKwh: form.get("annualBudgetKwh"),
        gridEmissionFactor: form.get("gridEmissionFactor"),
        note: form.get("note")
      };
      const area = state.editingAreaId
        ? await api.updateArea(state.editingAreaId, payload)
        : await api.createArea(payload);
      resetAreaForm();
      state.selectedAreaId = area.id;
      setStatus(dom.areaStatus, state.editingAreaId ? "已更新" : "已保存", "success");
      state.editingAreaId = null;
      renderAreaFormMode();
      await loadAreas();
    } catch (error) {
      setStatus(dom.areaStatus, error.message, "danger");
    }
  });

  dom.cancelAreaEdit.addEventListener("click", () => {
    resetAreaForm();
    state.editingAreaId = null;
    renderAreaFormMode();
    setStatus(dom.areaStatus, "");
  });

  dom.deactivateAreaButton.addEventListener("click", async () => {
    if (!state.editingAreaId) {
      return;
    }
    const area = state.areas.find((item) => item.id === state.editingAreaId);
    const confirmed = window.confirm(`确定停用「${area ? area.name : "当前区域"}」吗？停用后前台不再统计该区域。`);
    if (!confirmed) {
      return;
    }

    setStatus(dom.areaStatus, "停用中...");
    try {
      await api.deleteArea(state.editingAreaId);
      resetAreaForm();
      state.editingAreaId = null;
      state.selectedAreaId = null;
      renderAreaFormMode();
      setStatus(dom.areaStatus, "区域已停用", "success");
      await loadAreas();
    } catch (error) {
      setStatus(dom.areaStatus, error.message, "danger");
    }
  });

  dom.readingForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!dom.readingAreaSelect.value) {
      setStatus(dom.readingStatus, "请先选择区域", "danger");
      return;
    }

    setStatus(dom.readingStatus, "保存中...");
    try {
      const form = new FormData(dom.readingForm);
      const periodType = form.get("periodType");
      await api.addElectricityReading(form.get("areaId"), {
        periodType,
        readingTime: normalizeReadingTime(form.get("readingTime"), periodType),
        kwh: form.get("kwh"),
        source: form.get("source"),
        note: form.get("note")
      });
      dom.readingForm.kwh.value = "";
      dom.readingForm.note.value = "";
      setStatus(dom.readingStatus, "已保存", "success");
      await loadAreas();
    } catch (error) {
      setStatus(dom.readingStatus, error.message, "danger");
    }
  });

  dom.readingAreaSelect.addEventListener("change", () => {
    state.selectedAreaId = Number(dom.readingAreaSelect.value);
    renderAreaList();
  });

  dom.readingPeriodSelect.addEventListener("change", syncReadingTimeInput);

  dom.downloadReadingTemplate.addEventListener("click", downloadReadingTemplate);
  dom.importReadingButton.addEventListener("click", importReadingCsv);
}

async function ensureAdmin() {
  try {
    state.admin = await api.getCurrentAdmin();
    dom.adminName.textContent = state.admin.displayName || state.admin.username;
    dom.adminRoleText.textContent = `账号：${state.admin.username}`;
  } catch (error) {
    api.clearAdminAuth();
    window.location.href = "./index.html?admin=login";
    throw error;
  }
}

async function loadAreas() {
  try {
    state.areas = await api.listAreas({ includeStats: true });
    if (!state.selectedAreaId && state.areas[0]) {
      state.selectedAreaId = state.areas[0].id;
    }
    renderAreaOptions();
    renderAreaList();
    renderStats();
  } catch (error) {
    dom.areaList.innerHTML = `<div class="empty-state">${error.message}</div>`;
    dom.adminStats.innerHTML = "";
  }
}

function renderAreaOptions() {
  if (state.areas.length === 0) {
    dom.readingAreaSelect.innerHTML = `<option value="">暂无区域</option>`;
    return;
  }

  dom.readingAreaSelect.innerHTML = state.areas.map((area) => `
    <option value="${area.id}" ${area.id === state.selectedAreaId ? "selected" : ""}>${area.name}</option>
  `).join("");
}

function renderAreaList() {
  if (state.areas.length === 0) {
    dom.areaList.innerHTML = `<div class="empty-state">暂无区域</div>`;
    return;
  }

  dom.areaList.innerHTML = state.areas.map((area) => `
    <div class="area-card admin-area-card ${area.id === state.selectedAreaId ? "active" : ""}">
      <span>${area.code}</span>
      <strong>${area.name}</strong>
      <i>${formatNumber(area.total_kwh || 0, 1)} kWh</i>
      <div class="area-actions">
        <button class="secondary-button" type="button" data-select-area="${area.id}">选择</button>
        <button class="secondary-button" type="button" data-edit-area="${area.id}">编辑</button>
      </div>
    </div>
  `).join("");

  dom.areaList.querySelectorAll("[data-select-area]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedAreaId = Number(button.dataset.selectArea);
      dom.readingAreaSelect.value = String(state.selectedAreaId);
      renderAreaList();
    });
  });

  dom.areaList.querySelectorAll("[data-edit-area]").forEach((button) => {
    button.addEventListener("click", () => {
      startAreaEdit(Number(button.dataset.editArea));
    });
  });
}

function renderStats() {
  const totalKwh = state.areas.reduce((sum, area) => sum + Number(area.total_kwh || 0), 0);
  const totalCarbon = state.areas.reduce((sum, area) => sum + Number(area.total_carbon_tons || 0), 0);
  const totalStaff = state.areas.reduce((sum, area) => sum + Number(area.staff_count || 0), 0);
  const totalArea = state.areas.reduce((sum, area) => sum + Number(area.floor_area_m2 || 0), 0);

  dom.adminStats.innerHTML = [
    { label: "区域数量", value: `${state.areas.length} 个`, note: "当前启用区域" },
    { label: "累计用电", value: `${formatNumber(totalKwh, 1)} kWh`, note: "电耗记录汇总" },
    { label: "联动碳排", value: `${formatNumber(totalCarbon, 3)} t CO₂e`, note: "按区域排放因子折算" },
    { label: "面积 / 人数", value: `${formatNumber(totalArea, 1)} m²`, note: `${totalStaff} 人` }
  ].map((item) => `
    <div class="stat-card">
      <span>${item.label}</span>
      <strong>${item.value}</strong>
      <p>${item.note}</p>
    </div>
  `).join("");
}

function resetAreaForm() {
  dom.areaForm.reset();
  dom.areaForm.areaId.value = "";
  dom.areaForm.areaType.value = "office";
  dom.areaForm.floorAreaM2.value = "0";
  dom.areaForm.staffCount.value = "0";
  dom.areaForm.gridEmissionFactor.value = "0.42";
}

function startAreaEdit(areaId) {
  const area = state.areas.find((item) => item.id === areaId);
  if (!area) {
    return;
  }
  state.editingAreaId = area.id;
  state.selectedAreaId = area.id;
  dom.readingAreaSelect.value = String(area.id);
  dom.areaForm.areaId.value = area.id;
  dom.areaForm.name.value = area.name || "";
  dom.areaForm.code.value = area.code || "";
  dom.areaForm.areaType.value = area.area_type || "office";
  dom.areaForm.floorAreaM2.value = area.floor_area_m2 || 0;
  dom.areaForm.staffCount.value = area.staff_count || 0;
  dom.areaForm.annualBudgetKwh.value = area.annual_budget_kwh || "";
  dom.areaForm.gridEmissionFactor.value = area.grid_emission_factor || "0.42";
  dom.areaForm.note.value = area.note || "";
  renderAreaFormMode();
  renderAreaList();
  setStatus(dom.areaStatus, `正在编辑：${area.name}`);
}

function renderAreaFormMode() {
  const editing = Boolean(state.editingAreaId);
  dom.areaFormTitle.textContent = editing ? "编辑区域" : "新增区域";
  dom.cancelAreaEdit.classList.toggle("hidden", !editing);
  dom.deactivateAreaButton.classList.toggle("hidden", !editing);
}

function normalizeReadingTime(value, periodType) {
  if (periodType === "hour") {
    return value.includes("T") ? `${value.replace("T", " ")}:00` : value;
  }
  if (periodType === "month") {
    return `${value.slice(0, 7)}-01`;
  }
  if (periodType === "year") {
    return `${value.slice(0, 4)}-01-01`;
  }
  return value;
}

async function importReadingCsv() {
  if (!dom.readingAreaSelect.value) {
    setStatus(dom.importStatus, "请先选择区域", "danger");
    return;
  }
  const file = dom.readingImportFile.files[0];
  if (!file) {
    setStatus(dom.importStatus, "请选择 CSV 文件", "danger");
    return;
  }

  setStatus(dom.importStatus, "正在读取...");
  try {
    const text = await file.text();
    const readings = parseReadingCsv(text);
    if (readings.length === 0) {
      setStatus(dom.importStatus, "文件里没有可导入的数据", "danger");
      return;
    }

    setStatus(dom.importStatus, `正在导入 ${readings.length} 条...`);
    await api.addElectricityReading(dom.readingAreaSelect.value, { readings });
    dom.readingImportFile.value = "";
    setStatus(dom.importStatus, `已导入 ${readings.length} 条`, "success");
    await loadAreas();
  } catch (error) {
    setStatus(dom.importStatus, error.message, "danger");
  }
}

function parseReadingCsv(text) {
  const rows = parseCsvRows(text);
  if (rows.length < 2) {
    return [];
  }
  const headers = rows[0].map((item) => item.trim().replace(/^\uFEFF/, ""));
  const headerMap = new Map(headers.map((header, index) => [header, index]));
  const required = ["readingTime", "kwh"];
  required.forEach((field) => {
    if (!headerMap.has(field)) {
      throw new Error(`CSV 缺少 ${field} 列`);
    }
  });

  return rows.slice(1)
    .filter((row) => row.some((cell) => cell.trim() !== ""))
    .map((row, index) => {
      const lineNumber = index + 2;
      const periodType = getCsvValue(row, headerMap, "periodType") || dom.readingPeriodSelect.value || "day";
      const readingTime = getCsvValue(row, headerMap, "readingTime");
      const kwh = getCsvValue(row, headerMap, "kwh");
      if (!readingTime || !kwh) {
        throw new Error(`第 ${lineNumber} 行缺少 readingTime 或 kwh`);
      }
      if (Number(kwh) < 0 || Number.isNaN(Number(kwh))) {
        throw new Error(`第 ${lineNumber} 行 kwh 不是有效数字`);
      }
      return {
        periodType,
        readingTime: normalizeReadingTime(readingTime, periodType),
        kwh,
        source: getCsvValue(row, headerMap, "source") || "CSV导入",
        note: getCsvValue(row, headerMap, "note")
      };
    });
}

function getCsvValue(row, headerMap, key) {
  if (!headerMap.has(key)) {
    return "";
  }
  return (row[headerMap.get(key)] || "").trim();
}

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function downloadReadingTemplate() {
  const content = [
    "readingTime,kwh,periodType,source,note",
    "2026-04-16,168.4,day,CSV导入,日用电",
    "2026-04,4380,month,CSV导入,月度用电"
  ].join("\n");
  const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "electricity-readings-template.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function syncReadingTimeInput() {
  const periodType = dom.readingPeriodSelect.value;
  const currentDate = (dom.readingTimeInput.value || new Date().toISOString().slice(0, 10)).slice(0, 10);
  if (periodType === "hour") {
    dom.readingTimeInput.type = "datetime-local";
    dom.readingTimeInput.step = "3600";
    if (!dom.readingTimeInput.value.includes("T")) {
      dom.readingTimeInput.value = `${currentDate}T00:00`;
    }
    return;
  }
  dom.readingTimeInput.type = "date";
  dom.readingTimeInput.removeAttribute("step");
  dom.readingTimeInput.value = currentDate;
}

function setStatus(target, message, tone) {
  target.textContent = message;
  target.className = `data-status ${tone ? `status-${tone}` : ""}`;
}

function formatNumber(value, digits = 0) {
  return Number(value || 0).toLocaleString("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

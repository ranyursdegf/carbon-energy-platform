const api = window.CarbonApi;

const state = {
  areas: [],
  selectedAreaId: null,
  summary: []
};

const dom = {
  apiBaseUrl: document.getElementById("apiBaseUrl"),
  areaList: document.getElementById("areaList"),
  summaryGroup: document.getElementById("summaryGroup"),
  summaryCards: document.getElementById("summaryCards"),
  summaryTable: document.getElementById("summaryTable")
};

init();

function init() {
  dom.apiBaseUrl.textContent = "实时同步";
  bindEvents();
  loadAreas();
}

function bindEvents() {
  dom.summaryGroup.addEventListener("change", loadSummary);
}

async function loadAreas() {
  try {
    state.areas = await api.listAreas({ includeStats: true });
    if (!state.selectedAreaId && state.areas[0]) {
      state.selectedAreaId = state.areas[0].id;
    }
    renderAreaList();
    await loadSummary();
  } catch (error) {
    dom.areaList.innerHTML = `<div class="empty-state">${error.message}</div>`;
    dom.summaryCards.innerHTML = "";
    dom.summaryTable.innerHTML = "";
  }
}

async function loadSummary() {
  if (!state.selectedAreaId) {
    renderSummary();
    return;
  }

  try {
    state.summary = await api.getElectricitySummary(state.selectedAreaId, {
      groupBy: dom.summaryGroup.value
    });
    renderSummary();
  } catch (error) {
    dom.summaryCards.innerHTML = "";
    dom.summaryTable.innerHTML = `<div class="empty-state">${error.message}</div>`;
  }
}

function renderAreaList() {
  if (state.areas.length === 0) {
    dom.areaList.innerHTML = `<div class="empty-state">暂无区域</div>`;
    return;
  }

  dom.areaList.innerHTML = state.areas.map((area) => `
    <button class="area-card ${area.id === state.selectedAreaId ? "active" : ""}" type="button" data-area-id="${area.id}">
      <span>${area.code}</span>
      <strong>${area.name}</strong>
      <i>${formatNumber(area.total_kwh || 0, 1)} kWh</i>
    </button>
  `).join("");

  dom.areaList.querySelectorAll("[data-area-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedAreaId = Number(button.dataset.areaId);
      renderAreaList();
      loadSummary();
    });
  });
}

function renderSummary() {
  const selectedArea = state.areas.find((area) => area.id === state.selectedAreaId);
  const totalKwh = state.summary.reduce((sum, item) => sum + Number(item.total_kwh || 0), 0);
  const totalCarbon = state.summary.reduce((sum, item) => sum + Number(item.total_carbon_tons || 0), 0);

  dom.summaryCards.innerHTML = [
    { label: "当前区域", value: selectedArea ? selectedArea.name : "未选择", note: selectedArea ? selectedArea.code : "" },
    { label: "累计用电", value: `${formatNumber(totalKwh, 1)} kWh`, note: `${state.summary.length} 条汇总记录` },
    { label: "联动碳排", value: `${formatNumber(totalCarbon, 3)} t CO₂e`, note: "按区域排放因子折算" },
    { label: "建筑面积", value: selectedArea ? `${formatNumber(selectedArea.floor_area_m2, 1)} m²` : "-", note: selectedArea ? `${selectedArea.staff_count || 0} 人` : "" }
  ].map((item) => `
    <div class="stat-card">
      <span>${item.label}</span>
      <strong>${item.value}</strong>
      <p>${item.note}</p>
    </div>
  `).join("");

  if (state.summary.length === 0) {
    dom.summaryTable.innerHTML = `<div class="empty-state">暂无用电数据</div>`;
    return;
  }

  dom.summaryTable.innerHTML = `
    <div class="table-row head">
      <span>时间</span>
      <span>用电量</span>
      <span>碳排</span>
      <span>记录数</span>
    </div>
    ${state.summary.map((item) => `
      <div class="table-row">
        <span>${item.bucket}</span>
        <span>${formatNumber(item.total_kwh, 3)} kWh</span>
        <span>${formatNumber(item.total_carbon_tons, 4)} t CO₂e</span>
        <span>${item.reading_count}</span>
      </div>
    `).join("")}
  `;
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

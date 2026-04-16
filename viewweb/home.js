const shared = window.CarbonShared;
const api = window.CarbonApi;

const state = shared.getPlatformState();
const dashboardState = {
  overview: null,
  ranking: [],
  error: ""
};

const dom = {
  adminLoginButton: document.getElementById("adminLoginButton"),
  adminLoginModal: document.getElementById("adminLoginModal"),
  adminLoginForm: document.getElementById("adminLoginForm"),
  adminLoginClose: document.getElementById("adminLoginClose"),
  adminLoginStatus: document.getElementById("adminLoginStatus"),
  heroTags: document.getElementById("heroTags"),
  globalControls: document.getElementById("globalControls"),
  selectionSummary: document.getElementById("selectionSummary"),
  officeSnapshot: document.getElementById("officeSnapshot"),
  overviewStats: document.getElementById("overviewStats"),
  moduleGroups: document.getElementById("moduleGroups")
};

init();

function init() {
  bindAdminLogin();
  renderHome();
  loadDashboardData();
}

async function loadDashboardData() {
  try {
    const [overview, ranking] = await Promise.all([
      api.getDashboardOverview(),
      api.getAreaRanking()
    ]);
    dashboardState.overview = overview || {};
    dashboardState.ranking = Array.isArray(ranking) ? ranking : [];
    dashboardState.error = "";
  } catch (error) {
    dashboardState.error = error.message;
  }
  renderHome();
}

function renderHome() {
  renderAdminEntry();
  renderHero();
  renderGlobalControls();
  renderSummary();
  renderSnapshot();
  renderOverviewStats();
  renderModuleGroups();
}

function bindAdminLogin() {
  dom.adminLoginButton.addEventListener("click", () => {
    const auth = api.getAdminAuth();
    if (auth && auth.token) {
      window.location.href = "./admin.html";
      return;
    }
    openAdminLogin();
  });

  dom.adminLoginClose.addEventListener("click", closeAdminLogin);
  dom.adminLoginModal.addEventListener("click", (event) => {
    if (event.target === dom.adminLoginModal) {
      closeAdminLogin();
    }
  });

  dom.adminLoginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setLoginStatus("登录中...");
    try {
      const form = new FormData(dom.adminLoginForm);
      await api.loginAdmin({
        username: form.get("username"),
        password: form.get("password")
      });
      setLoginStatus("登录成功，正在进入管理中心", "success");
      window.location.href = "./admin.html";
    } catch (error) {
      setLoginStatus(error.message, "danger");
    }
  });

  if (new URLSearchParams(window.location.search).get("admin") === "login") {
    openAdminLogin();
  }
}

function renderAdminEntry() {
  const auth = api.getAdminAuth();
  dom.adminLoginButton.textContent = auth && auth.token ? "进入管理员界面" : "管理员登录";
}

function openAdminLogin() {
  dom.adminLoginModal.classList.remove("hidden");
  dom.adminLoginModal.setAttribute("aria-hidden", "false");
  dom.adminLoginForm.username.value = "admin";
  dom.adminLoginForm.password.value = "";
  setLoginStatus("");
  setTimeout(() => dom.adminLoginForm.password.focus(), 0);
}

function closeAdminLogin() {
  dom.adminLoginModal.classList.add("hidden");
  dom.adminLoginModal.setAttribute("aria-hidden", "true");
}

function setLoginStatus(message, tone) {
  dom.adminLoginStatus.textContent = message;
  dom.adminLoginStatus.className = `data-status ${tone ? `status-${tone}` : ""}`;
}

function renderHero() {
  if (dashboardState.error) {
    dom.heroTags.innerHTML = [
      createTag("数据暂不可用"),
      createTag("稍后刷新"),
      createTag("待补充记录")
    ].join("");
    return;
  }

  const overview = dashboardState.overview;
  const dataUpdatedAt = getOverviewUpdatedAt(overview);
  dom.heroTags.innerHTML = [
    createTag(`区域 ${formatNumber(getNumber(overview, "area_count"), 0)} 个`),
    createTag(`累计用电 ${formatNumber(getNumber(overview, "total_kwh"), 1)} kWh`),
    createTag(`累计碳排 ${formatNumber(getNumber(overview, "total_carbon_tons"), 3)} t`),
    createTag(`最新 ${formatDateTime(dataUpdatedAt)}`)
  ].join("");
}

function renderGlobalControls() {
  const options = shared.getPlatformOptions();
  dom.globalControls.innerHTML = `
    <label class="field">
      <span>企业 / 园区</span>
      <select id="siteSelect">
        ${options.sites.map((item) => `
          <option value="${item.id}" ${item.id === state.siteId ? "selected" : ""}>${item.label}</option>
        `).join("")}
      </select>
    </label>
    <label class="field">
      <span>时间范围</span>
      <select id="timeRangeSelect">
        ${options.timeRanges.map((item) => `
          <option value="${item.id}" ${item.id === state.timeRange ? "selected" : ""}>${item.label}</option>
        `).join("")}
      </select>
    </label>
    <label class="field">
      <span>能源类型</span>
      <select id="energyTypeSelect">
        ${options.energyTypes.map((item) => `
          <option value="${item.id}" ${item.id === state.energyType ? "selected" : ""}>${item.label}</option>
        `).join("")}
      </select>
    </label>
    <div class="control-static">
      <span>数据更新时间</span>
      <strong>${formatDateTime(getOverviewUpdatedAt(dashboardState.overview))}</strong>
      <p>按最新添加记录同步</p>
    </div>
  `;

  dom.globalControls.querySelector("#siteSelect").addEventListener("change", (event) => {
    updateState({ siteId: event.target.value });
  });

  dom.globalControls.querySelector("#timeRangeSelect").addEventListener("change", (event) => {
    updateState({ timeRange: event.target.value });
  });

  dom.globalControls.querySelector("#energyTypeSelect").addEventListener("change", (event) => {
    updateState({ energyType: event.target.value });
  });
}

function renderSummary() {
  if (dashboardState.error) {
    dom.selectionSummary.innerHTML = `
      <span class="mini-label">连接状态</span>
      <strong class="status-danger">数据暂不可用</strong>
      <p>${dashboardState.error}</p>
    `;
    return;
  }

  const overview = dashboardState.overview;
  dom.selectionSummary.innerHTML = `
    <span class="mini-label">当前概况</span>
    <strong>${formatNumber(getNumber(overview, "area_count"), 0)} 个区域 / ${shared.getEnergyTypeLabel(state.energyType)}</strong>
    <p>累计用电 ${formatNumber(getNumber(overview, "total_kwh"), 1)} kWh，联动碳排 ${formatNumber(getNumber(overview, "total_carbon_tons"), 3)} t CO₂e。</p>
  `;
}

function renderSnapshot() {
  const topAreas = dashboardState.ranking.slice(0, 4);
  const snapshotItems = topAreas.length > 0
    ? topAreas.map((area) => ({
      label: area.code,
      value: area.name,
      note: `${formatNumber(area.total_kwh, 1)} kWh / ${formatNumber(area.total_carbon_tons, 3)} t CO₂e`
    }))
    : [
      { label: "区域", value: "暂无", note: "等待区域维护。" },
      { label: "用电", value: "暂无", note: "等待电耗记录。" },
      { label: "碳排联动", value: "待计算", note: "电耗和排放因子会自动折算。" },
      { label: "管理维护", value: "待处理", note: "基础数据维护后自动同步。" }
    ];

  dom.officeSnapshot.innerHTML = snapshotItems.map((item) => `
    <div class="snapshot-card">
      <span>${item.label}</span>
      <strong>${item.value}</strong>
      <p>${item.note}</p>
    </div>
  `).join("");
}

function renderOverviewStats() {
  if (dashboardState.error) {
    dom.overviewStats.innerHTML = `
      <div class="empty-state">${dashboardState.error}</div>
    `;
    return;
  }

  const overview = dashboardState.overview;
  const dataUpdatedAt = getOverviewUpdatedAt(overview);
  const stats = [
    { label: "区域数量", value: `${formatNumber(getNumber(overview, "area_count"), 0)} 个`, note: "启用统计区域", danger: false },
    { label: "累计用电量", value: `${formatNumber(getNumber(overview, "total_kwh"), 1)} kWh`, note: "累计电耗记录", danger: false },
    { label: "累计碳排放", value: `${formatNumber(getNumber(overview, "total_carbon_tons"), 3)} t CO₂e`, note: "按区域排放因子折算", danger: false },
    { label: "最新数据时间", value: formatDateTime(dataUpdatedAt), note: "按最新添加记录同步", danger: false }
  ];

  dom.overviewStats.innerHTML = stats.map((item) => `
    <div class="stat-card">
      <span>${item.label}</span>
      <strong class="${item.danger ? "status-danger" : "status-success"}">${item.value}</strong>
      <p>${item.note}</p>
    </div>
  `).join("");
}

function renderModuleGroups() {
  dom.moduleGroups.innerHTML = shared.MENU_GROUPS.map((group) => `
    <article class="module-group-card">
      <div class="module-group-head">
        <p class="eyebrow">业务分组</p>
        <h3>${group.title}</h3>
        <p>${group.description}</p>
      </div>
      <div class="module-entry-list">
        ${group.items.map((moduleId) => {
          const module = shared.getModule(moduleId);
          return `
            <a class="module-entry-card" href="./module.html?module=${moduleId}">
              <div>
                <strong>${module.title}</strong>
              </div>
              <i>进入</i>
            </a>
          `;
        }).join("")}
      </div>
    </article>
  `).join("");
}

function updateState(patch) {
  const nextState = shared.setPlatformState({ ...state, ...patch });
  Object.assign(state, nextState);
  renderHome();
}

function createTag(text) {
  return `<span class="tag">${text}</span>`;
}

function getNumber(source, key) {
  if (!source || source[key] === undefined || source[key] === null) {
    return 0;
  }
  return Number(source[key]) || 0;
}

function getOverviewUpdatedAt(overview) {
  return overview && (overview.latest_data_updated_at || overview.latest_reading_time);
}

function formatNumber(value, digits = 0) {
  return Number(value || 0).toLocaleString("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function formatDateTime(value) {
  if (!value) {
    return "暂无";
  }
  return String(value).replace("T", " ").slice(0, 16);
}

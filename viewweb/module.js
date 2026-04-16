const shared = window.CarbonShared;
const api = window.CarbonApi;
const params = new URLSearchParams(window.location.search);
const requestedModuleId = params.get("module");
const initialModule = shared.MODULES[requestedModuleId] ? requestedModuleId : "energy-query";
const storedState = shared.getPlatformState();
const rawStoredState = readRawStoredState();

// 这些模块可以直接复用 energy_readings 的汇总结果，优先展示数据库中的真实能耗与碳排数据。
const DATABASE_MODULES = new Set([
  "energy-query",
  "energy-intensity",
  "energy-analysis",
  "benchmarking",
  "energy-flow",
  "balance-opt",
  "budget-management",
  "carbon-emissions",
  "carbon-footprint",
  "verification",
  "carbon-assets"
]);
const WEEKDAY_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const currentDate = new Date();
const hasStoredDatabaseDate = typeof rawStoredState.databaseDateKey === "string" && rawStoredState.databaseDateKey !== "";
let userSelectedDatabaseYear = Number.isInteger(rawStoredState.databaseYear);

const state = {
  moduleId: initialModule,
  siteId: storedState.siteId,
  view: storedState.timeRange,
  energyType: storedState.energyType,
  monthIndex: DATABASE_MODULES.has(initialModule) && !hasStoredDatabaseDate ? currentDate.getMonth() : storedState.monthIndex,
  dateKey: storedState.dateKey,
  databaseYear: storedState.databaseYear || currentDate.getFullYear(),
  databaseDateKey: storedState.databaseDateKey || "",
  databaseAreaId: storedState.databaseAreaId || "all"
};

const dbState = {
  loading: false,
  error: "",
  areas: [],
  meters: [],
  summary: [],
  auditLogs: [],
  availableYears: [],
  loadedKey: "",
  lastUpdatedAt: ""
};

const AREA_TYPE_LABELS = {
  park: "校区 / 园区",
  building: "楼宇",
  floor: "楼层",
  room: "房间",
  office: "功能区",
  custom: "自定义区域"
};

const ENERGY_TYPE_META = {
  electricity: { amountLabel: "用电量", unit: "kWh", trendLabel: "用电" },
  water: { amountLabel: "用水量", unit: "m³", trendLabel: "用水" },
  gas: { amountLabel: "天然气用量", unit: "m³", trendLabel: "天然气" },
  steam: { amountLabel: "热力 / 蒸汽用量", unit: "GJ", trendLabel: "热力 / 蒸汽" },
  combined: { amountLabel: "综合能耗", unit: "综合值", trendLabel: "综合能耗" }
};

const ENERGY_CONVERSION_FACTORS = {
  electricity: {
    label: "电力",
    unit: "kWh",
    gjPerUnit: 0.0036,
    kgcePerUnit: 0.1229,
    carbonKgPerUnit: 0.42,
    note: "1 kWh = 3.6 MJ，按 0.1229 kgce/kWh 折标煤。"
  },
  water: {
    label: "自来水",
    unit: "m³",
    gjPerUnit: 0.002512,
    kgcePerUnit: 0.0857,
    carbonKgPerUnit: 0.168,
    note: "按给水等效能耗系数折算。"
  },
  gas: {
    label: "天然气",
    unit: "m³",
    gjPerUnit: 0.035588,
    kgcePerUnit: 1.2143,
    carbonKgPerUnit: 2.162,
    note: "按低位热值折算为 GJ，再换算标准煤。"
  },
  steam: {
    label: "热力 / 蒸汽",
    unit: "GJ",
    gjPerUnit: 1,
    kgcePerUnit: 34.12,
    carbonKgPerUnit: 110,
    note: "热力直接以 GJ 计量，1 GJ 约等于 34.12 kgce。"
  }
};

const DEVICE_PROFILE = [
  { label: "空调系统", ratio: 0.42, color: "#2f6b56", note: "冷热源、末端空调与新风负荷。" },
  { label: "照明系统", ratio: 0.18, color: "#a8793d", note: "公共照明、办公照明与会议照明。" },
  { label: "电梯", ratio: 0.08, color: "#4f9a78", note: "垂直交通与待机负荷。" },
  { label: "办公与插座设备", ratio: 0.22, color: "#8aa5a0", note: "电脑、打印、茶水与会议设备。" },
  { label: "其他重点设备", ratio: 0.10, color: "#cf7458", note: "机房、小动力与周末基荷。" }
];

const ENERGY_TYPE_COLORS = {
  electricity: "#2f6b56",
  water: "#4f9a78",
  gas: "#a8793d",
  steam: "#cf7458",
  combined: "#8aa5a0"
};

const dom = {
  moduleGroup: document.getElementById("moduleGroup"),
  moduleTitle: document.getElementById("moduleTitle"),
  moduleTags: document.getElementById("moduleTags"),
  groupTitle: document.getElementById("groupTitle"),
  globalControls: document.getElementById("globalControls"),
  moduleSwitcher: document.getElementById("moduleSwitcher"),
  yearField: document.getElementById("yearField"),
  monthField: document.getElementById("monthField"),
  dayField: document.getElementById("dayField"),
  yearSelect: document.getElementById("yearSelect"),
  monthSelect: document.getElementById("monthSelect"),
  daySelect: document.getElementById("daySelect"),
  viewStateCard: document.getElementById("viewStateCard"),
  moduleWorkspace: document.getElementById("moduleWorkspace")
};

init();

function readRawStoredState() {
  try {
    const raw = window.localStorage.getItem(shared.PLATFORM.storageKey);
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    return {};
  }
}

function init() {
  bindEvents();
  renderModulePage();
  refreshDatabaseModule();
}

function bindEvents() {
  dom.yearSelect.addEventListener("change", (event) => {
    state.databaseYear = Number(event.target.value);
    userSelectedDatabaseYear = true;
    syncDateKey();
    persistState();
    renderModulePage();
    refreshDatabaseModule();
  });

  dom.monthSelect.addEventListener("change", (event) => {
    state.monthIndex = Number(event.target.value);
    syncDateKey();
    persistState();
    renderModulePage();
    refreshDatabaseModule();
  });

  dom.daySelect.addEventListener("change", (event) => {
    if (isDatabaseModule()) {
      state.databaseDateKey = event.target.value;
    } else {
      state.dateKey = event.target.value;
    }
    persistState();
    renderModulePage();
    refreshDatabaseModule();
  });
}

function renderModulePage() {
  syncDateKey();
  renderGlobalControls();
  syncYearOptions();
  syncMonthOptions();
  syncDayOptions();
  toggleDateFields();

  const context = buildContext();
  renderModuleHeader(context);
  renderModuleSwitcher(context);
  renderAnalysisState(context);
  renderModuleWorkspace(context);
}

function buildContext() {
  const module = shared.getModule(state.moduleId);
  const group = shared.getGroup(module.groupId);
  const options = {
    view: state.view,
    monthIndex: state.monthIndex,
    dateKey: state.dateKey,
    energyType: state.energyType
  };
  const period = shared.getPeriod(options);
  const metrics = shared.getMetrics(state.moduleId, period, options);
  const events = shared.getEventItems(period, options);
  const recommendations = shared.getRecommendations(state.moduleId);
  const energyPie = shared.getPieData("energy-flow", period, { ...options, energyType: "electricity" });
  const carbonPie = shared.getPieData("carbon-emissions", period, { ...options, energyType: "carbon" });
  const modulePie = shared.getPieData(state.moduleId, period, options);
  const lineMode = getLineMode(state.moduleId, state.energyType);
  const peakPoint = getPeakPoint(period, lineMode);
  const lowPoint = getLowPoint(period, lineMode);
  const overBudgetCount = period.points.filter((item) => item[lineMode.valueKey] > item[lineMode.budgetKey]).length;

  return {
    moduleId: state.moduleId,
    module,
    group,
    options,
    period,
    metrics,
    events,
    recommendations,
    energyPie,
    carbonPie,
    modulePie,
    lineMode,
    peakPoint,
    lowPoint,
    overBudgetCount,
    selectedRecord: state.view === "day" ? shared.DATA.recordMap[state.dateKey] : null,
    annualProjection: getAnnualProjection(period),
    budgetScale: getBudgetScale(state.view),
    database: buildDatabaseContext()
  };
}

function renderGlobalControls() {
  const options = shared.getPlatformOptions();
  const updatedAtText = getDataUpdatedAtText(options.updatedAt);
  const areaControl = isDatabaseModule() ? renderDatabaseAreaControl() : "";
  dom.globalControls.innerHTML = `
    <label class="field">
      <span>企业 / 园区</span>
      <select id="siteSelect">
        ${options.sites.map((item) => `
          <option value="${item.id}" ${item.id === state.siteId ? "selected" : ""}>${item.label}</option>
        `).join("")}
      </select>
    </label>
    ${areaControl}
    <label class="field">
      <span>时间范围</span>
      <select id="timeRangeSelect">
        ${options.timeRanges.map((item) => `
          <option value="${item.id}" ${item.id === state.view ? "selected" : ""}>${item.label}</option>
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
      <strong>${updatedAtText}</strong>
    </div>
  `;

  dom.globalControls.querySelector("#siteSelect").addEventListener("change", (event) => {
    state.siteId = event.target.value;
    persistState();
    renderModulePage();
    refreshDatabaseModule();
  });

  dom.globalControls.querySelector("#timeRangeSelect").addEventListener("change", (event) => {
    state.view = event.target.value;
    syncDateKey();
    persistState();
    renderModulePage();
    refreshDatabaseModule();
  });

  dom.globalControls.querySelector("#energyTypeSelect").addEventListener("change", (event) => {
    state.energyType = event.target.value;
    persistState();
    renderModulePage();
    refreshDatabaseModule();
  });

  const databaseAreaSelect = dom.globalControls.querySelector("#databaseAreaSelect");
  if (databaseAreaSelect) {
    databaseAreaSelect.addEventListener("change", (event) => {
      state.databaseAreaId = event.target.value;
      persistState();
      renderModulePage();
      refreshDatabaseModule();
    });
  }
}

function renderDatabaseAreaControl() {
  const options = [
    { id: "all", label: "全部区域" },
    ...dbState.areas.map((area) => ({
      id: String(area.id),
      label: `${area.name} · ${getAreaTypeLabel(area.area_type)}`
    }))
  ];
  return `
    <label class="field">
      <span>区域范围</span>
      <select id="databaseAreaSelect">
        ${options.map((item) => `
          <option value="${item.id}" ${item.id === state.databaseAreaId ? "selected" : ""}>${item.label}</option>
        `).join("")}
      </select>
    </label>
  `;
}

function renderModuleHeader(context) {
  dom.moduleGroup.textContent = context.group.title;
  dom.moduleTitle.textContent = context.module.title;
  dom.moduleTags.innerHTML = [
    createTag(context.group.title),
    createTag(`${getActiveYear()}年`),
    createTag(shared.getTimeRangeLabel(state.view)),
    createTag(shared.getEnergyTypeLabel(state.energyType)),
    createTag(context.database.isDatabaseModule ? "实时概览" : "综合分析")
  ].join("");
  document.body.dataset.moduleGroup = context.group.id;
}

function renderModuleSwitcher(context) {
  dom.groupTitle.textContent = context.group.title;
  dom.moduleSwitcher.innerHTML = context.group.items.map((itemId) => {
    const module = shared.getModule(itemId);
    return `
      <a class="switch-chip ${itemId === state.moduleId ? "active" : ""}" href="./module.html?module=${itemId}">
        ${module.title}
      </a>
    `;
  }).join("");
}

function renderAnalysisState(context) {
  if (context.database.isDatabaseModule) {
    dom.viewStateCard.innerHTML = `
      <span>当前查看状态</span>
      <strong>${state.databaseYear} 年 / ${getSelectedAreaLabel(context.database)} / ${shared.getTimeRangeLabel(state.view)} / ${shared.getEnergyTypeLabel(state.energyType)}</strong>
      <p>${context.database.statusText}</p>
    `;
    return;
  }

  dom.viewStateCard.innerHTML = `
    <span>当前查看状态</span>
    <strong>${shared.getTimeRangeLabel(state.view)} / ${shared.getEnergyTypeLabel(state.energyType)}</strong>
  `;
}

function syncYearOptions() {
  const years = getDatabaseYearOptions();
  dom.yearSelect.innerHTML = years.map((year) => `
    <option value="${year}" ${year === state.databaseYear ? "selected" : ""}>${year}年</option>
  `).join("");
}

function syncMonthOptions() {
  const year = getActiveYear();
  dom.monthSelect.innerHTML = shared.getMonths().map((label, index) => `
    <option value="${index}" ${index === state.monthIndex ? "selected" : ""}>${year}年${label}</option>
  `).join("");
}

function syncDateKey() {
  if (isDatabaseModule()) {
    syncDatabaseDateKey();
    return;
  }

  const days = shared.getDaysForMonth(state.monthIndex);
  if (!days.some((item) => item.key === state.dateKey)) {
    state.dateKey = shared.getDefaultDateKey(state.monthIndex);
  }
}

function syncDayOptions() {
  const days = isDatabaseModule()
    ? getDatabaseDaysForMonth(state.databaseYear, state.monthIndex)
    : shared.getDaysForMonth(state.monthIndex);
  const selectedDate = isDatabaseModule() ? state.databaseDateKey : state.dateKey;
  dom.daySelect.innerHTML = days.map((entry) => `
    <option value="${entry.key}" ${entry.key === selectedDate ? "selected" : ""}>${entry.key} ${entry.weekdayName}</option>
  `).join("");
}

function toggleDateFields() {
  dom.yearField.classList.toggle("hidden", !isDatabaseModule());
  dom.monthField.classList.toggle("hidden", state.view === "year");
  dom.dayField.classList.toggle("hidden", state.view !== "day");
}

function isDatabaseModule(moduleId = state.moduleId) {
  return DATABASE_MODULES.has(moduleId);
}

function getActiveYear() {
  return isDatabaseModule() ? state.databaseYear : shared.OFFICE.year;
}

function getDatabaseYearOptions() {
  const years = new Set([
    state.databaseYear,
    currentDate.getFullYear(),
    shared.OFFICE.year,
    ...dbState.availableYears
  ]);
  return Array.from(years)
    .filter((year) => Number.isInteger(year) && year >= 2000 && year <= 2100)
    .sort((a, b) => b - a);
}

function syncDatabaseDateKey() {
  const days = getDatabaseDaysForMonth(state.databaseYear, state.monthIndex);
  if (!days.some((item) => item.key === state.databaseDateKey)) {
    state.databaseDateKey = getDefaultDatabaseDateKey(state.databaseYear, state.monthIndex);
  }
}

function getDatabaseDaysForMonth(year, monthIndex) {
  const dayCount = new Date(year, monthIndex + 1, 0).getDate();
  return Array.from({ length: dayCount }, (_, index) => {
    const day = index + 1;
    const date = new Date(year, monthIndex, day);
    return {
      key: `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`,
      weekdayName: WEEKDAY_LABELS[date.getDay()]
    };
  });
}

function getDefaultDatabaseDateKey(year, monthIndex) {
  const isCurrentMonth = year === currentDate.getFullYear() && monthIndex === currentDate.getMonth();
  const day = isCurrentMonth ? currentDate.getDate() : 1;
  return `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;
}

function renderModuleWorkspace(context) {
  dom.moduleWorkspace.innerHTML = renderWorkspaceByModule(context);
  bindWorkspaceInteractions(context);
}

function bindWorkspaceInteractions(context) {
  if (context.moduleId === "energy-intensity") {
    bindIntensityCalculator();
  }
  if (context.moduleId === "benchmarking") {
    bindBenchmarkModeSelector();
  }
  if (context.moduleId === "budget-management") {
    bindBudgetReportActions(context);
  }
  if (context.moduleId === "carbon-footprint") {
    bindFootprintReportActions(context);
  }
  if (context.moduleId === "verification") {
    bindVerificationReportActions(context);
  }
}

function renderWorkspaceByModule(context) {
  // 数据库驱动模块统一走一套真实数据渲染入口；供应链暂时保留前端演示数据。
  if (context.database.isDatabaseModule) {
    return renderDatabaseWorkspace(context);
  }

  const renderers = {
    "energy-query": renderEnergyQueryWorkspace,
    "energy-intensity": renderEnergyIntensityWorkspace,
    "energy-analysis": renderEnergyAnalysisWorkspace,
    benchmarking: renderBenchmarkWorkspace,
    "energy-flow": renderEnergyFlowWorkspace,
    "balance-opt": renderBalanceWorkspace,
    "budget-management": renderBudgetWorkspace,
    "carbon-emissions": renderCarbonEmissionWorkspace,
    "carbon-footprint": renderFootprintWorkspace,
    "supply-chain": renderSupplyChainWorkspace,
    verification: renderVerificationWorkspace,
    "carbon-assets": renderAssetWorkspace
  };

  return renderers[state.moduleId](context);
}

function bindBenchmarkModeSelector() {
  const selector = dom.moduleWorkspace.querySelector("[data-benchmark-mode-select]");
  if (!selector) {
    return;
  }
  const applyMode = () => {
    const mode = selector.value || "all";
    dom.moduleWorkspace.querySelectorAll("[data-benchmark-section]").forEach((section) => {
      const matched = mode === "all" || section.dataset.benchmarkSection === mode;
      section.classList.toggle("hidden", !matched);
    });
  };
  selector.addEventListener("change", applyMode);
  applyMode();
}

function bindBudgetReportActions(context) {
  dom.moduleWorkspace.querySelectorAll("[data-budget-export]").forEach((button) => {
    button.addEventListener("click", () => {
      downloadBudgetReport(context, button.dataset.budgetExport || "execution");
    });
  });
}

function downloadBudgetReport(context, type) {
  const database = context.database;
  const rows = type === "area"
    ? buildDatabaseBudgetAreaReportRows(database)
    : buildDatabaseBudgetExecutionReportRows(database);
  const headers = type === "area"
    ? ["区域", "年度用能预算", "本期用能预算", "本期碳预算", "面积", "人数"]
    : ["时间", "实际值", "预算值", "剩余预算", "碳排", "碳预算"];
  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replaceAll("\"", "\"\"")}"`).join(","))
    .join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${type === "area" ? "区域预算考核报表" : "预算执行报表"}-${getSelectionLabel()}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function bindFootprintReportActions(context) {
  dom.moduleWorkspace.querySelectorAll("[data-footprint-report]").forEach((button) => {
    button.addEventListener("click", () => {
      exportFootprintReport(context, button.dataset.footprintReport || "download");
    });
  });
}

function exportFootprintReport(context, action) {
  const data = buildFootprintReportData(context);
  const html = buildFootprintReportHtml(data);
  if (action === "print") {
    const reportWindow = window.open("", "_blank");
    if (!reportWindow) {
      downloadFootprintReportHtml(data, html);
      return;
    }
    reportWindow.document.open();
    reportWindow.document.write(html);
    reportWindow.document.close();
    reportWindow.focus();
    window.setTimeout(() => reportWindow.print(), 250);
    return;
  }
  downloadFootprintReportHtml(data, html);
}

function downloadFootprintReportHtml(data, html) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `碳足迹报告-${data.periodLabel}.html`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function bindVerificationReportActions(context) {
  dom.moduleWorkspace.querySelectorAll("[data-verification-report]").forEach((button) => {
    button.addEventListener("click", () => {
      exportVerificationReport(context, button.dataset.verificationReport || "summary");
    });
  });
}

function exportVerificationReport(context, type) {
  const data = buildVerificationReportData(context);
  if (type === "ledger") {
    downloadVerificationLedgerCsv(data);
    return;
  }
  const html = buildVerificationReportHtml(data);
  const reportWindow = window.open("", "_blank");
  if (!reportWindow) {
    downloadVerificationReportHtml(data, html);
    return;
  }
  reportWindow.document.open();
  reportWindow.document.write(html);
  reportWindow.document.close();
  reportWindow.focus();
}

function downloadVerificationLedgerCsv(data) {
  const headers = ["数据项", "频次", "状态", "备注"];
  const csv = [headers, ...data.activityRows]
    .map((row) => row.map((cell) => `"${String(cell).replaceAll("\"", "\"\"")}"`).join(","))
    .join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `核查数据汇总表-${data.periodLabel}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadVerificationReportHtml(data, html) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `温室气体排放核查报告-${data.periodLabel}.html`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function buildFootprintReportData(context) {
  if (context.database?.hasData) {
    const database = context.database;
    const scope = getDatabaseScopeStats(database);
    const quality = buildDatabaseQualityStats(database);
    const coverage = estimateDatabaseBoundaryCoverage(database, quality);
    const stages = buildDatabaseLifecycleStages(database);
    const product = buildDatabaseProductFootprintModel(database, scope, stages, coverage);
    return {
      periodLabel: getSelectionLabel(),
      scopeLabel: getSelectedAreaLabel(database),
      product,
      stages,
      hotspots: buildFootprintHotspotCards(stages),
      scenarios: buildFootprintScenarioCards(product),
      generatedAt: formatLocalDateTime(new Date().toISOString())
    };
  }

  const coverage = parsePercentValue(context.metrics[0].value);
  const stages = buildDemoLifecycleStages(context);
  const product = buildDemoProductFootprintModel(context, stages, coverage);
  return {
    periodLabel: getSelectionLabel(),
    scopeLabel: shared.PLATFORM.sites[0]?.label || "演示组织",
    product,
    stages,
    hotspots: buildFootprintHotspotCards(stages),
    scenarios: buildFootprintScenarioCards(product),
    generatedAt: formatLocalDateTime(new Date().toISOString())
  };
}

function buildFootprintReportHtml(data) {
  const stageRows = data.stages.map((stage) => `
    <tr>
      <td>${escapeHtml(stage.name)}</td>
      <td>${shared.formatNumber(stage.carbonTons, 4)} t CO₂e</td>
      <td>${shared.formatPercent(stage.share)}</td>
      <td>${escapeHtml(stage.status)}</td>
    </tr>
  `).join("");
  const scenarioRows = data.scenarios.map((item) => `
    <tr>
      <td>${escapeHtml(item.title)}</td>
      <td>${escapeHtml(item.value || "")}</td>
      <td>${escapeHtml(item.note || item.copy || "")}</td>
    </tr>
  `).join("");
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>碳足迹报告 - ${escapeHtml(data.product.name)}</title>
  <style>
    body { font-family: "Microsoft YaHei", Arial, sans-serif; margin: 40px; color: #20352d; background: #fbfaf4; }
    h1 { font-size: 30px; margin: 0 0 8px; }
    h2 { margin-top: 28px; border-bottom: 1px solid #d8d0bf; padding-bottom: 8px; }
    .meta, .summary { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin: 18px 0; }
    .card { border: 1px solid #d8d0bf; border-radius: 14px; padding: 16px; background: #fffdf7; }
    .card strong { display: block; font-size: 22px; margin-top: 6px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; background: #fffdf7; }
    th, td { border: 1px solid #d8d0bf; padding: 10px; text-align: left; }
    th { background: #eef5ef; }
    .note { color: #63746e; line-height: 1.7; }
    @media print { body { background: #fff; margin: 24px; } .no-print { display: none; } }
  </style>
</head>
<body>
  <button class="no-print" onclick="window.print()">打印 / 另存 PDF</button>
  <h1>产品碳足迹说明书</h1>
  <p class="note">核算对象：${escapeHtml(data.product.name)}；范围：${escapeHtml(data.scopeLabel)}；周期：${escapeHtml(data.periodLabel)}；生成时间：${escapeHtml(data.generatedAt)}。</p>
  <section class="summary">
    <div class="card">单位碳足迹<strong>${shared.formatNumber(data.product.unitFootprintKg, 3)} kg CO₂e/${escapeHtml(data.product.unit)}</strong></div>
    <div class="card">生命周期碳足迹<strong>${shared.formatNumber(data.product.totalCarbonTons, 3)} t CO₂e</strong></div>
    <div class="card">核算产出<strong>${shared.formatNumber(data.product.outputCount, 0)} ${escapeHtml(data.product.unit)}</strong></div>
    <div class="card">报告覆盖率<strong>${shared.formatPercent(data.product.coverage)}</strong></div>
  </section>
  <h2>生命周期阶段</h2>
  <table>
    <thead><tr><th>阶段</th><th>排放量</th><th>占比</th><th>状态</th></tr></thead>
    <tbody>${stageRows}</tbody>
  </table>
  <h2>热点识别</h2>
  <div class="meta">
    ${data.hotspots.map((item) => `<div class="card"><b>${escapeHtml(item.title)}</b><p class="note">${escapeHtml(item.copy)}</p></div>`).join("")}
  </div>
  <h2>方案对比</h2>
  <table>
    <thead><tr><th>方案</th><th>单位足迹</th><th>说明</th></tr></thead>
    <tbody>${scenarioRows}</tbody>
  </table>
  <h2>核算边界说明</h2>
  <p class="note">${escapeHtml(data.product.boundary)}</p>
</body>
</html>`;
}

function buildVerificationReportData(context) {
  if (context.database?.hasData) {
    const database = context.database;
    const quality = buildDatabaseQualityStats(database);
    return {
      periodLabel: getSelectionLabel(),
      scopeLabel: getSelectedAreaLabel(database),
      boundaryRows: buildDatabaseVerificationBoundaryRows(database),
      activityRows: buildDatabaseVerificationActivityRows(database),
      factorRows: buildDatabaseVerificationFactorRows(database),
      evidenceRows: buildDatabaseEvidenceRows(database, quality),
      auditRows: buildDatabaseAuditRows(database, quality),
      quality,
      totalCarbon: database.period.totalCarbon,
      generatedAt: formatLocalDateTime(new Date().toISOString())
    };
  }

  return {
    periodLabel: getSelectionLabel(),
    scopeLabel: shared.PLATFORM.sites[0]?.label || "演示组织",
    boundaryRows: buildDemoVerificationBoundaryRows(context),
    activityRows: buildVerificationSources(),
    factorRows: buildDemoVerificationFactorRows(),
    evidenceRows: buildDemoEvidenceRows(context),
    auditRows: buildDemoAuditRows(context),
    quality: {
      completeness: parsePercentValue(context.metrics[0].value),
      traceability: parsePercentValue(context.metrics[2].value),
      uncertainty: 0.046
    },
    totalCarbon: context.period.totalCarbon,
    generatedAt: formatLocalDateTime(new Date().toISOString())
  };
}

function buildVerificationReportHtml(data) {
  const renderRows = (rows) => rows.map((row) => `
    <tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>
  `).join("");
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>温室气体排放核查报告 - ${escapeHtml(data.scopeLabel)}</title>
  <style>
    body { font-family: "Microsoft YaHei", Arial, sans-serif; margin: 40px; color: #20352d; background: #fbfaf4; }
    h1 { margin: 0 0 8px; font-size: 30px; }
    h2 { margin-top: 28px; border-bottom: 1px solid #d8d0bf; padding-bottom: 8px; }
    .summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin: 18px 0; }
    .card { border: 1px solid #d8d0bf; border-radius: 14px; padding: 16px; background: #fffdf7; }
    .card strong { display: block; margin-top: 6px; font-size: 22px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; background: #fffdf7; }
    th, td { border: 1px solid #d8d0bf; padding: 10px; text-align: left; }
    th { background: #eef5ef; }
    .note { color: #63746e; line-height: 1.7; }
    @media print { body { background: #fff; margin: 24px; } .no-print { display: none; } }
  </style>
</head>
<body>
  <button class="no-print" onclick="window.print()">打印 / 另存 PDF</button>
  <h1>温室气体排放核查报告</h1>
  <p class="note">范围：${escapeHtml(data.scopeLabel)}；周期：${escapeHtml(data.periodLabel)}；生成时间：${escapeHtml(data.generatedAt)}。</p>
  <section class="summary">
    <div class="card">核算排放<strong>${shared.formatNumber(data.totalCarbon, 3)} t CO₂e</strong></div>
    <div class="card">数据完整率<strong>${shared.formatPercent(data.quality.completeness || 0)}</strong></div>
    <div class="card">追溯覆盖率<strong>${shared.formatPercent(data.quality.traceability || 0)}</strong></div>
  </section>
  <h2>核算边界</h2>
  <table><thead><tr><th>边界项</th><th>纳入状态</th><th>核查说明</th></tr></thead><tbody>${renderRows(data.boundaryRows)}</tbody></table>
  <h2>活动数据台账</h2>
  <table><thead><tr><th>数据项</th><th>频次</th><th>状态</th><th>备注</th></tr></thead><tbody>${renderRows(data.activityRows)}</tbody></table>
  <h2>排放因子版本</h2>
  <table><thead><tr><th>能源类型</th><th>排放因子</th><th>适用年份</th><th>状态</th></tr></thead><tbody>${renderRows(data.factorRows)}</tbody></table>
  <h2>证据材料</h2>
  <table><thead><tr><th>材料类型</th><th>关联数据</th><th>状态</th><th>留痕说明</th></tr></thead><tbody>${renderRows(data.evidenceRows)}</tbody></table>
  <h2>日志与留痕</h2>
  <table><thead><tr><th>时间</th><th>操作人</th><th>操作对象</th><th>变更内容</th></tr></thead><tbody>${renderRows(data.auditRows)}</tbody></table>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function bindIntensityCalculator() {
  const panel = dom.moduleWorkspace.querySelector("[data-intensity-calculator]");
  if (!panel) {
    return;
  }

  const controls = panel.querySelectorAll("input, select");
  controls.forEach((control) => {
    control.addEventListener("input", () => updateIntensityCalculator(panel));
    control.addEventListener("change", () => updateIntensityCalculator(panel));
  });
  updateIntensityCalculator(panel);
}

function updateIntensityCalculator(panel) {
  const energyType = panel.querySelector("[name='energyTypeCode']")?.value || "electricity";
  const factor = ENERGY_CONVERSION_FACTORS[energyType] || ENERGY_CONVERSION_FACTORS.electricity;
  const amount = getPanelNumber(panel, "amount");
  const areaM2 = getPanelNumber(panel, "areaM2");
  const outputValue = getPanelNumber(panel, "outputValue");
  const productOutput = getPanelNumber(panel, "productOutput");
  const energyGJ = amount * factor.gjPerUnit;
  const standardCoalKg = amount * factor.kgcePerUnit;
  const standardCoalTons = standardCoalKg / 1000;
  const carbonTons = (amount * factor.carbonKgPerUnit) / 1000;
  const areaIntensity = areaM2 > 0 ? standardCoalKg / areaM2 : 0;
  const outputIntensity = outputValue > 0 ? standardCoalKg / outputValue : 0;
  const productIntensity = productOutput > 0 ? standardCoalKg / productOutput : 0;
  const result = panel.querySelector("[data-calculator-result]");
  const formula = panel.querySelector("[data-calculator-formula]");

  if (formula) {
    formula.textContent = `${shared.formatNumber(amount, 3)} ${factor.unit} × ${factor.kgcePerUnit} kgce/${factor.unit}`;
  }
  if (result) {
    result.innerHTML = `
      <div><span>综合能耗</span><strong>${shared.formatNumber(standardCoalTons, 4)} tce</strong><small>${shared.formatNumber(standardCoalKg, 2)} kgce</small></div>
      <div><span>热值折算</span><strong>${shared.formatNumber(energyGJ, 3)} GJ</strong><small>${factor.note}</small></div>
      <div><span>单位面积强度</span><strong>${shared.formatNumber(areaIntensity, 3)} kgce/m²</strong><small>面积 ${shared.formatNumber(areaM2, 1)} m²</small></div>
      <div><span>单位产值能耗</span><strong>${shared.formatNumber(outputIntensity, 3)} kgce/万元</strong><small>未填写产值时不计算</small></div>
      <div><span>单位产品能耗</span><strong>${shared.formatNumber(productIntensity, 3)} kgce/件</strong><small>未填写产量时不计算</small></div>
      <div><span>碳排估算</span><strong>${shared.formatNumber(carbonTons, 4)} t CO₂e</strong><small>按当前选择系数估算</small></div>
    `;
  }
}

function getPanelNumber(panel, name) {
  const raw = panel.querySelector(`[name='${name}']`)?.value;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

async function refreshDatabaseModule() {
  if (!DATABASE_MODULES.has(state.moduleId)) {
    return;
  }

  if (dbState.loading) {
    return;
  }

  dbState.loading = true;
  dbState.error = "";
  renderModulePage();

  try {
    const areaId = getSelectedDatabaseAreaId();
    const energyTypeCode = getDatabaseEnergyTypeCode();
    // 先取年份列表，避免真实数据不在当前年份时页面默认空白。
    const yearSummary = await api.getEnergySummary({
      areaId,
      energyTypeCode,
      groupBy: "year"
    });
    dbState.availableYears = getYearsFromSummary(yearSummary);

    if (!userSelectedDatabaseYear && dbState.availableYears.length > 0) {
      state.databaseYear = Math.max(...dbState.availableYears);
      syncDatabaseDateKey();
      persistState();
    }

    const key = getDatabaseRequestKey();
    if (dbState.loadedKey === key) {
      return;
    }

    const range = getDatabaseRange();
    // 页面主体需要区域、表计和时间序列三类数据，合并后在前端生成各模块指标。
    const auditLogRequest = api.getAdminAuth()
      ? api.listAuditLogs({ limit: 12 }).catch(() => [])
      : Promise.resolve([]);
    const [areas, meters, summary, auditLogs] = await Promise.all([
      api.listAreas({ includeStats: true }),
      api.listMeters(areaId ? { areaId } : {}),
      api.getEnergySummary({
        areaId,
        energyTypeCode,
        groupBy: range.groupBy,
        from: range.from,
        to: range.to
      }),
      auditLogRequest
    ]);
    dbState.areas = Array.isArray(areas) ? areas : [];
    dbState.meters = Array.isArray(meters) ? meters : [];
    dbState.summary = Array.isArray(summary) ? summary : [];
    dbState.auditLogs = Array.isArray(auditLogs) ? auditLogs : [];
    if (getSelectedDatabaseAreaId() && !dbState.areas.some((area) => Number(area.id) === getSelectedDatabaseAreaId())) {
      state.databaseAreaId = "all";
    }
    dbState.loadedKey = key;
    dbState.error = "";
    dbState.lastUpdatedAt = new Date().toISOString();
  } catch (error) {
    dbState.error = error.message;
    dbState.summary = [];
    dbState.meters = [];
    dbState.auditLogs = [];
  } finally {
    dbState.loading = false;
    renderModulePage();
  }
}

function buildDatabaseContext() {
  const isDatabaseModule = DATABASE_MODULES.has(state.moduleId);
  if (!isDatabaseModule) {
    return { isDatabaseModule: false };
  }

  const period = buildDatabasePeriod();
  const hasData = period.points.length > 0;
  const lineMode = getDatabaseLineMode(state.moduleId, state.energyType, period.unit);
  const peakPoint = hasData ? getPeakPoint(period, lineMode) : { label: "暂无", value: 0 };
  const lowPoint = hasData ? getLowPoint(period, lineMode) : { label: "暂无", value: 0 };
  const overBudgetCount = period.points.filter((item) => item[lineMode.budgetKey] > 0 && item[lineMode.valueKey] > item[lineMode.budgetKey]).length;

  return {
    isDatabaseModule,
    loading: dbState.loading,
    error: dbState.error,
    hasData,
    period,
    lineMode,
    peakPoint,
    lowPoint,
    overBudgetCount,
    areas: dbState.areas,
    meters: dbState.meters,
    auditLogs: dbState.auditLogs,
    selectedArea: getSelectedDatabaseArea(),
    energyMeta: getDatabaseEnergyMeta(),
    statusText: getDatabaseStatusText(hasData)
  };
}

function buildDatabasePeriod() {
  const range = getDatabaseRange();
  const grouped = aggregateSummaryRows(dbState.summary);
  const energyMeta = getDatabaseEnergyMeta();
  const unit = resolveDatabaseUnit(dbState.summary, energyMeta.unit);
  const budgetAreas = getSelectedDatabaseAreaId()
    ? dbState.areas.filter((area) => Number(area.id) === getSelectedDatabaseAreaId())
    : dbState.areas;
  const totalAnnualBudget = budgetAreas.reduce((sum, area) => sum + Number(area.annual_budget_kwh || 0), 0);
  const fallbackBudget = totalAnnualBudget > 0 ? totalAnnualBudget : shared.OFFICE.annualBudgetKWh;
  const budgetPerPoint = getBudgetPerPoint(fallbackBudget, range);

  const points = grouped.map((item) => ({
    label: formatBucketLabel(item.bucket, range.groupBy),
    bucket: item.bucket,
    value: item.kwh,
    budget: budgetPerPoint,
    carbon: item.carbon,
    budgetCarbon: (budgetPerPoint * shared.OFFICE.gridFactor) / 1000,
    readingCount: item.readingCount
  }));

  const totalKWh = points.reduce((sum, item) => sum + item.value, 0);
  const totalCarbon = points.reduce((sum, item) => sum + item.carbon, 0);
  const budgetKWh = points.reduce((sum, item) => sum + item.budget, 0);
  const budgetCarbon = points.reduce((sum, item) => sum + item.budgetCarbon, 0);

  return {
    label: getSelectionLabel(),
    unit,
    totalKWh,
    totalCarbon,
    budgetKWh,
    budgetCarbon,
    energyGJ: totalKWh * 0.0036,
    points
  };
}

function aggregateSummaryRows(rows) {
  const buckets = new Map();
  rows.forEach((row) => {
    const bucket = normalizeBucket(row.bucket);
    const current = buckets.get(bucket) || { bucket, kwh: 0, carbon: 0, readingCount: 0 };
    current.kwh += Number(row.total_amount || 0);
    current.carbon += Number(row.total_carbon_tons || 0);
    current.readingCount += Number(row.reading_count || 0);
    buckets.set(bucket, current);
  });
  return Array.from(buckets.values()).sort((a, b) => a.bucket.localeCompare(b.bucket));
}

function getSelectedDatabaseAreaId() {
  const id = Number(state.databaseAreaId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function getSelectedDatabaseArea() {
  const areaId = getSelectedDatabaseAreaId();
  if (!areaId) {
    return null;
  }
  return dbState.areas.find((area) => Number(area.id) === areaId) || null;
}

function getSelectedAreaLabel(database = {}) {
  const area = database.selectedArea || getSelectedDatabaseArea();
  return area ? area.name : "全部区域";
}

function getAreaTypeLabel(areaType) {
  return AREA_TYPE_LABELS[areaType] || "功能区";
}

function getDatabaseEnergyTypeCode() {
  if (state.energyType === "combined") {
    return undefined;
  }
  if (state.energyType === "carbon") {
    return "electricity";
  }
  return state.energyType || "electricity";
}

function getDatabaseEnergyMeta() {
  return ENERGY_TYPE_META[state.energyType] || ENERGY_TYPE_META.electricity;
}

function formatDisplayUnit(unit) {
  if (!unit) {
    return "";
  }
  return String(unit)
    .replace(/CO(?:2|₂)e/g, "CO₂e")
    .replace(/CO(?:2|₂)/g, "CO₂")
    .replace(/kg\s*CO₂e/g, "kg CO₂e")
    .replace(/t\s*CO₂e/g, "t CO₂e")
    .replace(/m(?:2|²)/g, "m²")
    .replace(/m(?:3|³)/g, "m³");
}

function resolveDatabaseUnit(rows, fallbackUnit) {
  const units = new Set((Array.isArray(rows) ? rows : [])
    .map((row) => row.unit)
    .filter(Boolean)
    .map(String));
  if (units.size === 1) {
    return formatDisplayUnit([...units][0]);
  }
  if (units.size > 1) {
    return "综合值";
  }
  return fallbackUnit;
}

function getDatabaseLineMode(moduleId, energyType, unit) {
  if (moduleId.startsWith("carbon")) {
    return getLineMode(moduleId, "carbon");
  }
  const meta = ENERGY_TYPE_META[energyType] || ENERGY_TYPE_META.electricity;
  return {
    valueKey: "value",
    budgetKey: "budget",
    unit: unit || meta.unit,
    label: meta.trendLabel
  };
}

function getYearsFromSummary(rows) {
  const years = new Set();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const year = Number(normalizeBucket(row.bucket).slice(0, 4));
    if (Number.isInteger(year) && year >= 2000 && year <= 2100) {
      years.add(year);
    }
  });
  return Array.from(years).sort((a, b) => b - a);
}

function renderDatabaseWorkspace(context) {
  const database = context.database;
  if (database.loading) {
    return `<div class="empty-state">正在更新数据...</div>`;
  }
  if (database.error) {
    return `<div class="empty-state">${database.error}</div>`;
  }
  if (!database.hasData) {
    return `
      <div class="empty-state">当前选择下暂无记录。</div>
      ${renderRecommendationPanel("数据准备", [
        { title: "维护区域", copy: "新增办公区、楼栋或楼层。" },
        { title: "记录用能", copy: "按小时、按日、按月或按年维护能耗数据。" },
        { title: "批量整理", copy: "通过批量导入整理历史数据。" }
      ])}
    `;
  }

  const databaseRenderers = {
    "energy-query": renderDatabaseEnergyQueryWorkspace,
    "energy-intensity": renderDatabaseIntensityWorkspace,
    "energy-analysis": renderDatabaseAnalysisWorkspace,
    benchmarking: renderDatabaseBenchmarkWorkspace,
    "energy-flow": renderDatabaseFlowWorkspace,
    "balance-opt": renderDatabaseBalanceWorkspace,
    "budget-management": renderDatabaseBudgetWorkspace,
    "carbon-emissions": renderDatabaseCarbonWorkspace,
    "carbon-footprint": renderDatabaseFootprintWorkspace,
    verification: renderDatabaseVerificationWorkspace,
    "carbon-assets": renderDatabaseAssetWorkspace
  };
  return (databaseRenderers[state.moduleId] || renderDatabaseEnergyQueryWorkspace)(context);
}

function renderDatabaseEnergyQueryWorkspace(context) {
  const database = context.database;
  const period = database.period;
  const unit = period.unit;
  const areaTotals = buildDatabaseAreaTotals(database);
  const energyTypePie = buildDatabaseEnergyTypePieData(database);
  const deviceDrivers = buildDatabaseDeviceDrivers(database);
  const average = period.points.length ? period.totalKWh / period.points.length : 0;
  const cards = [
    { label: `${period.label}${database.energyMeta.amountLabel}`, value: `${shared.formatNumber(period.totalKWh, 1)} ${unit}` },
    { label: "平均时段值", value: `${shared.formatNumber(average, 1)} ${unit}`, note: "按当前维度聚合。" },
    { label: "峰值点", value: database.peakPoint.label, note: `${shared.formatNumber(database.peakPoint.value, 1)} ${unit}` },
    { label: "覆盖区域", value: `${areaTotals.length} 个`, note: getSelectedAreaLabel(database), tone: areaTotals.length > 0 ? "success" : "neutral" }
  ];

  return `
    ${renderSummaryStrip(cards)}
    ${renderEnergyQueryOverviewPanel()}
    <div class="workspace-two-col">
      ${renderLinePanel({ ...context, period, lineMode: database.lineMode }, { title: "历史能耗趋势" })}
      ${renderDatabaseTablePanel("数据表格", period, unit)}
    </div>
    <div class="workspace-two-col">
      ${renderDatabaseBarPanel("区域能耗柱状图", areaTotals, unit)}
      ${renderPiePanel("能源类型结构", energyTypePie)}
    </div>
    <div class="workspace-two-col">
      ${renderDatabaseAreaMapPanel("地图 / 楼层高亮", areaTotals, unit)}
      ${renderDriverPanel("重点设备能耗排行", deviceDrivers)}
    </div>
    <div class="workspace-three-col">
      ${renderDatabaseAreaEnergyPanel(areaTotals, unit)}
      ${renderMetricPanel("查询摘要", buildDatabaseMetrics(database))}
      ${renderRecommendationPanel("数据维护建议", buildDatabaseRecommendations())}
    </div>
  `;
}

function renderEnergyQueryOverviewPanel() {
  return `
    <section class="panel workspace-panel energy-query-intro">
      <div>
        <p class="eyebrow">查询说明</p>
        <h3>能耗查询</h3>
      </div>
      <p>用于按时间、区域和能源类型查看能耗总览、历史趋势、区域对比及设备排行，详细数据在下方图表和表格中展示。</p>
    </section>
  `;
}

function buildDatabaseAreaTotals(database) {
  const areaMap = new Map(database.areas.map((area) => [String(area.id), area]));
  const totals = new Map();
  dbState.summary.forEach((row) => {
    const key = String(row.area_id || "unknown");
    const area = areaMap.get(key);
    const current = totals.get(key) || {
      id: key,
      name: row.area_name || (area ? area.name : "未命名区域"),
      code: area ? area.code : "",
      areaType: area ? area.area_type : "office",
      floorArea: area ? Number(area.floor_area_m2 || 0) : 0,
      staffCount: area ? Number(area.staff_count || 0) : 0,
      annualBudget: area ? Number(area.annual_budget_kwh || 0) : 0,
      value: 0,
      carbon: 0,
      readingCount: 0
    };
    current.value += Number(row.total_amount || 0);
    current.carbon += Number(row.total_carbon_tons || 0);
    current.readingCount += Number(row.reading_count || 0);
    totals.set(key, current);
  });

  const totalValue = Array.from(totals.values()).reduce((sum, item) => sum + item.value, 0);
  return Array.from(totals.values())
    .map((item) => ({
      ...item,
      share: totalValue > 0 ? item.value / totalValue : 0
    }))
    .sort((a, b) => b.value - a.value);
}

function buildDatabaseAreaTypeStats(database, areaTotals) {
  const totalsByType = new Map();
  const areas = areaTotals.length > 0
    ? areaTotals
    : database.areas.map((area) => ({
      areaType: area.area_type,
      value: 0
    }));
  areas.forEach((area) => {
    const key = area.areaType || "office";
    const current = totalsByType.get(key) || { label: getAreaTypeLabel(key), count: 0, value: 0 };
    current.count += 1;
    current.value += Number(area.value || 0);
    totalsByType.set(key, current);
  });
  return Array.from(totalsByType.values());
}

function buildDatabaseEnergyTypePieData(database) {
  const totals = new Map();
  dbState.summary.forEach((row) => {
    const code = row.energy_type_code || state.energyType || "electricity";
    const current = totals.get(code) || {
      label: row.energy_type_name || shared.getEnergyTypeLabel(code),
      value: 0,
      color: ENERGY_TYPE_COLORS[code] || ENERGY_TYPE_COLORS.combined,
      note: row.unit ? `单位 ${formatDisplayUnit(row.unit)}` : "当前选择"
    };
    current.value += Number(row.total_amount || 0);
    totals.set(code, current);
  });

  const items = Array.from(totals.values());
  return {
    title: "能源类型结构",
    unit: database.period.unit,
    centerLabel: "当前合计",
    items: items.length > 0 ? items : [{
      label: shared.getEnergyTypeLabel(state.energyType),
      value: database.period.totalKWh,
      color: ENERGY_TYPE_COLORS[state.energyType] || ENERGY_TYPE_COLORS.electricity,
      note: "当前选择"
    }]
  };
}

function buildDatabaseStandardEnergySummary(database) {
  const totals = new Map();
  dbState.summary.forEach((row) => {
    const code = row.energy_type_code || state.energyType || "electricity";
    const factor = getEnergyConversionFactor(code);
    const current = totals.get(code) || {
      code,
      label: row.energy_type_name || factor.label,
      unit: row.unit || factor.unit,
      amount: 0,
      energyGJ: 0,
      standardCoalKg: 0,
      standardCoalTons: 0,
      carbonTons: 0,
      factor
    };
    const amount = Number(row.total_amount || 0);
    current.amount += amount;
    current.energyGJ += amount * factor.gjPerUnit;
    current.standardCoalKg += amount * factor.kgcePerUnit;
    current.standardCoalTons = current.standardCoalKg / 1000;
    current.carbonTons += Number(row.total_carbon_tons || 0) || (amount * factor.carbonKgPerUnit) / 1000;
    totals.set(code, current);
  });

  if (totals.size === 0 && database.period.totalKWh > 0) {
    const factor = getEnergyConversionFactor(state.energyType);
    const amount = database.period.totalKWh;
    totals.set(state.energyType || "electricity", {
      code: state.energyType || "electricity",
      label: factor.label,
      unit: database.period.unit || factor.unit,
      amount,
      energyGJ: amount * factor.gjPerUnit,
      standardCoalKg: amount * factor.kgcePerUnit,
      standardCoalTons: (amount * factor.kgcePerUnit) / 1000,
      carbonTons: database.period.totalCarbon,
      factor
    });
  }

  const rows = Array.from(totals.values()).sort((a, b) => b.standardCoalTons - a.standardCoalTons);
  return {
    rows,
    totalAmount: rows.reduce((sum, row) => sum + row.amount, 0),
    totalGJ: rows.reduce((sum, row) => sum + row.energyGJ, 0),
    totalStandardCoalKg: rows.reduce((sum, row) => sum + row.standardCoalKg, 0),
    totalStandardCoalTons: rows.reduce((sum, row) => sum + row.standardCoalTons, 0),
    totalCarbonTons: rows.reduce((sum, row) => sum + row.carbonTons, 0)
  };
}

function getEnergyConversionFactor(code) {
  if (code === "combined") {
    return ENERGY_CONVERSION_FACTORS.electricity;
  }
  return ENERGY_CONVERSION_FACTORS[code] || ENERGY_CONVERSION_FACTORS.electricity;
}

function buildDatabaseDeviceDrivers(database) {
  const total = Math.max(database.period.totalKWh, 0);
  const meterNote = database.meters.length > 0 ? `已登记 ${database.meters.length} 块表计` : "按重点设备结构查看";
  return DEVICE_PROFILE.map((item, index) => ({
    rank: index + 1,
    title: item.label,
    ratio: item.ratio,
    color: item.color,
    value: `${shared.formatNumber(total * item.ratio, 1)} ${database.period.unit}`,
    note: `${item.note} ${meterNote}。`
  }));
}

function renderDatabaseBarPanel(title, areaTotals, unit) {
  if (areaTotals.length === 0) {
    return `<section class="panel workspace-panel"><div class="empty-state">暂无区域能耗记录。</div></section>`;
  }
  const maxValue = Math.max(...areaTotals.map((item) => item.value), 1);
  return `
    <section class="panel workspace-panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">柱状图</p>
          <h3>${title}</h3>
        </div>
      </div>
      <div class="query-bar-list">
        ${areaTotals.slice(0, 8).map((item) => `
          <div class="query-bar-row">
            <div class="query-bar-copy">
              <strong>${item.name}</strong>
              <span>${getAreaTypeLabel(item.areaType)} · ${shared.formatPercent(item.share)}</span>
            </div>
            <div class="query-bar-track">
              <i class="query-bar-fill" style="width:${getBarWidth(item.value, maxValue)}%;"></i>
            </div>
            <div class="query-bar-value">${shared.formatNumber(item.value, 1)} ${unit}</div>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function renderDatabaseAreaMapPanel(title, areaTotals, unit) {
  if (areaTotals.length === 0) {
    return `<section class="panel workspace-panel"><div class="empty-state">暂无区域高亮记录。</div></section>`;
  }
  const maxValue = Math.max(...areaTotals.map((item) => item.value), 1);
  return `
    <section class="panel workspace-panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">区域高亮</p>
          <h3>${title}</h3>
        </div>
      </div>
      <div class="area-map-grid">
        ${areaTotals.slice(0, 12).map((item) => {
          const level = Math.max(item.value / maxValue, 0.08);
          const hot = item.share >= 0.35;
          return `
            <div class="area-map-cell ${hot ? "is-hot" : ""}" style="--level:${level};">
              <strong>${item.name}</strong>
              <span>${shared.formatNumber(item.value, 1)} ${unit}</span>
              <small>${getAreaTypeLabel(item.areaType)} · ${shared.formatNumber(item.floorArea, 0)} m²</small>
            </div>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function renderDatabaseAreaEnergyPanel(areaTotals, unit) {
  const rows = areaTotals.slice(0, 8).map((area) => [
    area.name,
    getAreaTypeLabel(area.areaType),
    `${shared.formatNumber(area.value, 3)} ${unit}`,
    shared.formatPercent(area.share)
  ]);
  if (rows.length === 0) {
    return `<section class="panel workspace-panel"><div class="empty-state">暂无区域记录。</div></section>`;
  }
  return renderTablePanel("区域能耗查询", ["区域", "层级", "能耗", "占比"], rows);
}

function renderDatabaseBudgetWorkspace(context) {
  const database = context.database;
  const period = database.period;
  const executionRate = period.budgetKWh > 0 ? period.totalKWh / period.budgetKWh : 0;
  const carbonRate = period.budgetCarbon > 0 ? period.totalCarbon / period.budgetCarbon : 0;
  const scope = getDatabaseScopeStats(database);
  const areaTotals = buildDatabaseAreaTotals(database);
  const configRows = buildDatabaseBudgetConfigRows(database, scope);
  const executionRows = buildDatabaseBudgetAreaExecutionRows(database, areaTotals);
  const alertCards = buildDatabaseBudgetAlertCards(database, executionRows, executionRate, carbonRate);
  const deviationCards = buildDatabaseBudgetDeviationCards(database, executionRows, executionRate, carbonRate);
  const reportCards = buildDatabaseBudgetReportCards(database);
  const cards = [
    { label: "能耗执行率", value: `${shared.formatNumber(executionRate * 100, 1)} %`, note: "实际用电 / 拆分预算。", tone: executionRate > 1 ? "danger" : "success" },
    { label: "碳排执行率", value: `${shared.formatNumber(carbonRate * 100, 1)} %`, note: "实际碳排 / 碳预算。", tone: carbonRate > 1 ? "danger" : "success" },
    { label: "剩余电量预算", value: `${shared.withSign(period.budgetKWh - period.totalKWh)} kWh`, note: "负数表示已超预算。", tone: period.totalKWh > period.budgetKWh ? "danger" : "neutral" },
    { label: "剩余碳预算", value: `${shared.withSign(period.budgetCarbon - period.totalCarbon)} t`, note: "按当前电力因子折算。", tone: period.totalCarbon > period.budgetCarbon ? "danger" : "neutral" }
  ];

  return `
    ${renderSummaryStrip(cards)}
    <div class="workspace-two-col">
      ${renderLinePanel({ ...context, period, lineMode: database.lineMode }, { title: "预算执行趋势" })}
      ${renderDatabaseTablePanel("预算执行明细", period, "kWh")}
    </div>
    <div class="workspace-two-col">
      ${renderTablePanel("预算配置概览", ["区域", "年度用能预算", "本期用能预算", "本期碳预算"], configRows)}
      ${renderTablePanel("区域预算执行监控", ["区域", "实际用能", "本期预算", "剩余预算", "状态"], executionRows.map((row) => row.cells))}
    </div>
    <div class="workspace-three-col">
      ${renderInfoCardsPanel("预算预警", alertCards)}
      ${renderInfoCardsPanel("预算偏差分析", deviationCards)}
      ${renderBudgetReportPanel("预算报表", reportCards)}
    </div>
    <div class="workspace-two-col">
      ${renderScenarioPanel("预算判断", buildBudgetScenarioCards(period))}
      ${renderRecommendationPanel("预算维护建议", buildDatabaseBudgetRecommendations(database, executionRows))}
    </div>
  `;
}

function renderDatabaseCarbonWorkspace(context) {
  const database = context.database;
  const period = database.period;
  const scope = getDatabaseScopeStats(database);
  const standardEnergy = buildDatabaseStandardEnergySummary(database);
  const areaTotals = buildDatabaseAreaTotals(database);
  const intensity = safeDivide(period.totalCarbon, scope.floorArea);
  const perCapitaCarbon = safeDivide(period.totalCarbon, scope.staffCount);
  const carbonRate = safeDivide(period.totalCarbon, period.budgetCarbon);
  const carbonEnergyRows = buildDatabaseCarbonEnergyRows(database, standardEnergy);
  const carbonAreaRows = buildDatabaseCarbonAreaRows(database, areaTotals, scope);
  const cards = [
    { label: `${period.label}碳排`, value: `${shared.formatNumber(period.totalCarbon, 3)} t CO₂e`, note: "由能源活动数据和排放因子自动计算。" },
    { label: "能源口径", value: `${standardEnergy.rows.length || 1} 类`, note: `${shared.formatNumber(period.totalKWh, 1)} ${period.unit} 纳入核算。` },
    { label: "单位面积碳强度", value: `${shared.formatNumber(intensity, 5)} t CO₂e/m²`, note: `${scope.floorAreaLabel} 参与计算。` },
    { label: "碳预算执行率", value: `${shared.formatPercent(carbonRate)}`, note: `${shared.withSign(period.budgetCarbon - period.totalCarbon)} t CO₂e 剩余额度。`, tone: carbonRate > 1 ? "danger" : "success" }
  ];

  return `
    ${renderSummaryStrip(cards)}
    <div class="workspace-two-col-wide">
      ${renderLinePanel({ ...context, period, lineMode: getLineMode("carbon-emissions", "carbon") }, { title: "碳排趋势" }, "carbon")}
      ${renderPiePanel("分能源类型碳排结构", buildDatabaseCarbonEnergyPieData(database, standardEnergy))}
    </div>
    <div class="workspace-two-col">
      ${renderTablePanel("碳排自动计算", ["能源类型", "活动数据", "排放因子", "碳排放", "占比"], carbonEnergyRows)}
      ${renderTablePanel("分区域碳排放", ["区域", "碳排放", "单位面积", "占比", "状态"], carbonAreaRows)}
    </div>
    <div class="workspace-three-col">
      ${renderMetricPanel("碳排强度分析", buildDatabaseCarbonMetrics(database, scope, intensity, perCapitaCarbon))}
      ${renderInfoCardsPanel("趋势分析", buildDatabaseCarbonTrendCards(database))}
      ${renderScenarioPanel("减排成效", buildDatabaseCarbonReductionCards(database))}
    </div>
    <div class="workspace-two-col">
      ${renderDatabaseTablePanel("碳排明细汇总", period, "t CO₂e", "carbon")}
      ${renderRecommendationPanel("碳数据建议", buildDatabaseModuleRecommendations(database, "carbon-emissions"))}
    </div>
  `;
}

function renderDatabaseIntensityWorkspace(context) {
  const database = context.database;
  const period = database.period;
  const scope = getDatabaseScopeStats(database);
  const standardEnergy = buildDatabaseStandardEnergySummary(database);
  const eui = safeDivide(period.totalKWh, scope.floorArea);
  const perCapitaEnergy = safeDivide(period.totalKWh, scope.staffCount);
  const carbonIntensity = safeDivide(period.totalCarbon, scope.floorArea);
  const standardCoalTons = standardEnergy.totalStandardCoalTons;
  const standardCoalAreaIntensity = safeDivide(standardCoalTons * 1000, scope.floorArea);
  const compareRows = [
    { label: "单位面积能耗", actual: eui, target: safeDivide(period.budgetKWh, scope.floorArea), unit: `${period.unit}/m²`, note: "适合园区、楼宇和办公区横向比较。" },
    { label: "单位面积标煤强度", actual: standardCoalAreaIntensity, target: safeDivide(period.budgetKWh * getEnergyConversionFactor(state.energyType).kgcePerUnit, scope.floorArea), unit: "kgce/m²", note: "把不同能源统一到标准煤口径后比较。" },
    { label: "人均能耗", actual: perCapitaEnergy, target: safeDivide(period.budgetKWh, scope.staffCount), unit: `${period.unit}/人`, note: "把人员规模差异归一化。" },
    { label: "单位面积碳强度", actual: carbonIntensity, target: safeDivide(period.budgetCarbon, scope.floorArea), unit: "t CO₂e/m²", note: "从双碳管理角度观察强度。" }
  ];
  const cards = [
    { label: "综合能耗", value: `${shared.formatNumber(standardCoalTons, 4)} tce`, note: `${standardEnergy.rows.length} 类能源统一折标煤。`, tone: standardCoalTons > 0 ? "success" : "neutral" },
    { label: "单位面积能耗", value: `${shared.formatNumber(eui, 3)} ${period.unit}/m²`, note: `${scope.floorAreaLabel} 参与计算。`, tone: eui > compareRows[0].target ? "danger" : "success" },
    { label: "单位面积标煤强度", value: `${shared.formatNumber(standardCoalAreaIntensity, 3)} kgce/m²`, note: "更适合多能源统一对比。" },
    { label: "单位面积碳强度", value: `${shared.formatNumber(carbonIntensity, 5)} t CO₂e/m²`, note: "由能源活动数据联动折算。" }
  ];
  const assumptions = [
    { title: "面积口径", copy: `当前按 ${scope.floorAreaLabel} 计算单位面积强度。`, tone: "success" },
    { title: "统一口径", copy: `当前范围已折算为 ${shared.formatNumber(standardEnergy.totalGJ, 3)} GJ / ${shared.formatNumber(standardCoalTons, 4)} tce。`, tone: "neutral" },
    { title: "产值与产品", copy: "需要经营或生产口径时，可在右侧折算器补充产值和产量。", tone: "neutral" }
  ];

  return `
    ${renderSummaryStrip(cards)}
    <div class="workspace-two-col-wide">
      ${renderStandardEnergyReportPanel("综合能耗计算中心", standardEnergy)}
      ${renderIntensityCalculatorPanel(scope)}
    </div>
    <div class="workspace-two-col">
      ${renderComparePanel("强度指标对标", compareRows)}
      ${renderFormulaPanel("强度公式", context.module.formulas)}
    </div>
    <div class="workspace-three-col">
      ${renderMetricPanel("强度计算结果", buildDatabaseIntensityMetrics(database))}
      ${renderInfoCardsPanel("计算口径", assumptions)}
      ${renderRecommendationPanel("强度优化建议", buildDatabaseModuleRecommendations(database, "energy-intensity"))}
    </div>
  `;
}

function renderDatabaseAnalysisWorkspace(context) {
  const database = context.database;
  const period = database.period;
  const saving = estimateDatabaseSavingPotential(database);
  const carbonSaving = estimateDatabaseCarbonSaving(database);
  const driverItems = buildDatabaseDeviceDrivers(database);
  const trendInsight = buildDatabaseTrendInsight(database);
  const peakValley = buildDatabasePeakValleyInsight(database);
  const anomalyItems = buildDatabaseAnomalyItems(database, peakValley);
  const strategyCards = buildDatabaseStrategyCards(database, driverItems, saving, carbonSaving);
  const savingsMetrics = buildDatabaseSavingsMetrics(database, saving, carbonSaving);
  const cards = [
    { label: "趋势判断", value: trendInsight.label, note: trendInsight.note, tone: trendInsight.tone },
    { label: "峰谷差", value: `${shared.formatNumber(peakValley.spread, 1)} ${period.unit}`, note: `${peakValley.peak.label} / ${peakValley.valley.label}` },
    { label: "异常时段", value: `${anomalyItems.filter((item) => item.danger).length} 个`, note: "按预算偏差和低负荷时段识别。", tone: anomalyItems.some((item) => item.danger) ? "danger" : "success" },
    { label: "节能潜力", value: `${shared.formatNumber(saving, 1)} ${period.unit}`, note: `约可减排 ${shared.formatNumber(carbonSaving, 3)} t CO₂e。` }
  ];

  return `
    ${renderSummaryStrip(cards)}
    <div class="workspace-two-col-wide">
      ${renderLinePanel({ ...context, period, lineMode: database.lineMode }, { title: getTrendTitle(context, "用能走势") })}
      ${renderPeakValleyPanel("峰谷用能分析", peakValley)}
    </div>
    <div class="workspace-two-col">
      ${renderDriverPanel("能耗结构分析", driverItems)}
      ${renderTimelinePanel("异常用能识别", anomalyItems)}
    </div>
    <div class="workspace-three-col">
      ${renderMetricPanel("节能潜力测算", savingsMetrics)}
      ${renderScenarioPanel("用能策略推荐", strategyCards)}
      ${renderRecommendationPanel("执行建议", buildDatabaseModuleRecommendations(database, "energy-analysis"))}
    </div>
  `;
}

function renderDatabaseBenchmarkWorkspace(context) {
  const database = context.database;
  const period = database.period;
  const scope = getDatabaseScopeStats(database);
  const areaTotals = buildDatabaseAreaTotals(database);
  const areaRows = buildDatabaseAreaBenchmarkRows(database, areaTotals);
  const highEnergyRows = buildDatabaseHighEnergyAreaRows(areaTotals);
  const deviceRows = buildDatabaseDeviceBenchmarkRows(database);
  const timeRows = buildDatabaseTimeBenchmarkRows(database);
  const currentEui = safeDivide(period.totalKWh, scope.floorArea);
  const perCapitaEnergy = safeDivide(period.totalKWh, scope.staffCount);
  const targetEui = safeDivide(period.budgetKWh, scope.floorArea);
  const targetPerCapitaEnergy = safeDivide(period.budgetKWh, scope.staffCount);
  const carbonIntensity = safeDivide(period.totalCarbon, scope.floorArea);
  const targetCarbonIntensity = safeDivide(period.budgetCarbon, scope.floorArea);
  const bestArea = areaRows.length > 0 ? areaRows[0] : null;
  const compareRows = [
    { label: "单位面积能耗", actual: currentEui, target: targetEui, unit: `${period.unit}/m²`, note: "当前范围与预算强度对标。" },
    { label: "单位人数能耗", actual: perCapitaEnergy, target: targetPerCapitaEnergy, unit: `${period.unit}/人`, note: "按人数规模归一化。" },
    { label: "单位面积碳强度", actual: carbonIntensity, target: targetCarbonIntensity, unit: "t CO₂e/m²", note: "按面积观察碳排强度。" },
    { label: "预算执行率", actual: safeDivide(period.totalKWh, period.budgetKWh), target: 1, unit: "", note: "1.00 表示刚好命中预算线。" }
  ];
  const cards = [
    { label: "当前强度", value: `${shared.formatNumber(currentEui, 3)} ${period.unit}/m²`, note: `目标 ${shared.formatNumber(targetEui, 3)}。`, tone: currentEui > targetEui ? "danger" : "success" },
    { label: "最佳区域", value: bestArea ? bestArea.name : "暂无", note: bestArea ? `${shared.formatNumber(bestArea.eui, 3)} ${period.unit}/m²` : "等待更多区域数据。" },
    { label: "高耗能区域", value: highEnergyRows[0] ? highEnergyRows[0].name : "暂无", note: highEnergyRows[0] ? `${shared.formatNumber(highEnergyRows[0].value, 1)} ${period.unit}` : getSelectedAreaLabel(database), tone: highEnergyRows[0] ? "danger" : "neutral" },
    { label: "参与对标对象", value: `${areaRows.length || scope.areaCount} 个`, note: "区域、时间、指标和设备排行联动。" }
  ];
  const areaTableRows = areaRows.slice(0, 8).map((row) => [
    row.name,
    `${shared.formatNumber(row.eui, 3)} ${period.unit}/m²`,
    `${shared.formatNumber(row.targetEui, 3)} ${period.unit}/m²`,
    row.status
  ]);
  const highAreaTableRows = highEnergyRows.slice(0, 8).map((row) => [
    row.name,
    getAreaTypeLabel(row.areaType),
    `${shared.formatNumber(row.value, 1)} ${period.unit}`,
    shared.formatPercent(row.share)
  ]);
  const deviceTableRows = deviceRows.map((row) => [
    row.name,
    `${shared.formatNumber(row.value, 1)} ${period.unit}`,
    shared.formatPercent(row.ratio),
    row.status
  ]);
  const timeTableRows = timeRows.map((row) => [
    row.label,
    `${shared.formatNumber(row.current, 2)} ${period.unit}`,
    row.previousLabel,
    shared.withSign(row.changeRate * 100) + " %"
  ]);

  return `
    ${renderSummaryStrip(cards)}
    ${renderBenchmarkModePanel()}
    <div class="workspace-two-col" data-benchmark-section="area">
      ${renderTablePanel("区域能效排行", ["区域", "当前强度", "目标强度", "状态"], areaTableRows)}
      ${renderTablePanel("高耗能区域排行", ["区域", "层级", "能耗", "占比"], highAreaTableRows)}
    </div>
    <div class="workspace-two-col" data-benchmark-section="time">
      ${renderTablePanel("时间对标", ["当前时段", "当前值", "对比时段", "变化率"], timeTableRows)}
      ${renderInfoCardsPanel("时间变化判断", buildDatabaseTimeBenchmarkCards(timeRows, period.unit))}
    </div>
    <div class="workspace-two-col" data-benchmark-section="indicator">
      ${renderComparePanel("指标对标", compareRows)}
      ${renderMetricPanel("指标偏差", buildDatabaseBenchmarkMetrics(database, currentEui, targetEui))}
    </div>
    <div class="workspace-two-col" data-benchmark-section="target">
      ${renderComparePanel("目标值对标", compareRows)}
      ${renderInfoCardsPanel("目标判断", buildDatabaseBenchmarkLevelCards(database, currentEui, targetEui, bestArea))}
    </div>
    <div class="workspace-three-col" data-benchmark-section="ranking">
      ${renderTablePanel("重点设备能耗排行", ["设备", "估算能耗", "占比", "状态"], deviceTableRows)}
      ${renderInfoCardsPanel("排行解读", buildDatabaseRankingCards(areaRows, highEnergyRows, deviceRows))}
      ${renderRecommendationPanel("对标建议", buildDatabaseModuleRecommendations(database, "benchmarking"))}
    </div>
  `;
}

function renderDatabaseFlowWorkspace(context) {
  const database = context.database;
  const period = database.period;
  const flowItems = buildDatabaseFlowItems(database);
  const areaTotals = buildDatabaseAreaTotals(database);
  const sankeyData = buildDatabaseSankeyData(database, areaTotals, flowItems);
  const meterRows = buildDatabaseMeterHierarchyRows(database);
  const lossCards = buildDatabaseLossCards(database, areaTotals);
  const keyNodes = buildDatabaseKeyNodeCards(database, areaTotals, flowItems);
  const cards = [
    { label: "输入能量", value: `${shared.formatNumber(period.totalKWh, 1)} ${period.unit}`, note: "当前筛选范围的能源输入。" },
    { label: "最大去向", value: flowItems[0].label, note: `${shared.formatPercent(safeDivide(flowItems[0].value, period.totalKWh))} · ${shared.formatNumber(flowItems[0].value, 1)} ${period.unit}` },
    { label: "计量层级", value: `${meterRows.length} 项`, note: database.meters.length > 0 ? "表计关系已纳入。" : "按区域台账生成基础层级。", tone: database.meters.length > 0 ? "success" : "neutral" },
    { label: "疑似损耗", value: `${shared.formatNumber(sankeyData.lossValue, 1)} ${period.unit}`, note: "按输入与分项去向差额估算。", tone: sankeyData.lossRate > 0.06 ? "danger" : "neutral" }
  ];
  const endUseCards = flowItems.map((item) => ({
    title: item.label,
    copy: `${shared.formatNumber(item.value, 1)} ${period.unit} · ${shared.formatPercent(safeDivide(item.value, period.totalKWh))} · ${item.note}`,
    tone: safeDivide(item.value, period.totalKWh) > 0.4 ? "danger" : "neutral"
  }));

  return `
    ${renderSummaryStrip(cards)}
    <div class="workspace-two-col workspace-two-col-wide">
      ${renderSankeyPanel("能流拓扑桑基图", sankeyData)}
      ${renderInfoCardsPanel("末端重点负荷", endUseCards)}
    </div>
    <div class="workspace-two-col">
      ${renderFlowPanel("能源流向分析", flowItems, period.totalKWh, period.unit)}
      ${renderTablePanel("分级计量关系", ["层级", "对象", "计量类型", "说明"], meterRows)}
    </div>
    <div class="workspace-three-col">
      ${renderStackedBalancePanel("损耗结构", buildDatabaseBalancePieces())}
      ${renderInfoCardsPanel("损耗核验", lossCards)}
      ${renderInfoCardsPanel("重点节点识别", keyNodes)}
    </div>
    <div class="workspace-two-col">
      ${renderRecommendationPanel("能流完善建议", buildDatabaseModuleRecommendations(database, "energy-flow"))}
      ${renderFormulaPanel("能流核验口径", context.module.formulas)}
    </div>
  `;
}

function renderDatabaseBalanceWorkspace(context) {
  const database = context.database;
  const period = database.period;
  const saving = estimateDatabaseSavingPotential(database);
  const carbonSaving = estimateDatabaseCarbonSaving(database);
  const revenue = saving * 0.92 + carbonSaving * shared.OFFICE.carbonPrice;
  const areaTotals = buildDatabaseAreaTotals(database);
  const loadBalance = buildDatabaseLoadBalanceRows(database, areaTotals);
  const operationPlans = buildDatabaseOperationPlans(database, saving);
  const lossOptimization = buildDatabaseLossOptimizationCards(database, saving);
  const objectiveCards = buildDatabaseMultiObjectiveCards(database, saving, carbonSaving, revenue);
  const simulation = buildDatabaseOptimizationSimulation(database, saving, carbonSaving, revenue);
  const cards = [
    { label: "负荷均衡度", value: `${shared.formatNumber(loadBalance.balanceScore * 100, 1)} %`, note: loadBalance.summary, tone: loadBalance.balanceScore < 0.72 ? "danger" : "success" },
    { label: "预计节能率", value: `${shared.formatPercent(simulation.savingRate)}`, note: `${shared.formatNumber(saving, 1)} ${period.unit}` },
    { label: "预计减排", value: `${shared.formatNumber(carbonSaving, 3)} t CO₂e`, note: "由优化节能量折算。" },
    { label: "优化收益", value: `¥${shared.formatNumber(revenue, 0)}`, note: "按电价和碳价估算。" }
  ];

  return `
    ${renderSummaryStrip(cards)}
    <div class="workspace-two-col">
      ${renderTablePanel("区域负荷平衡", ["区域", "负荷", "占比", "状态"], loadBalance.rows)}
      ${renderInfoCardsPanel("多目标优化", objectiveCards)}
    </div>
    <div class="workspace-two-col">
      ${renderBeforeAfterPanel("优化前后对比", [
        { name: "当前", items: buildDatabaseBalancePieces() },
        { name: "优化后", items: buildDatabaseOptimizedBalancePieces() }
      ])}
      ${renderMetricPanel("模拟优化效果", simulation.metrics)}
    </div>
    <div class="workspace-two-col">
      ${renderScenarioPanel("设备运行优化", operationPlans)}
      ${renderInfoCardsPanel("能耗损失优化", lossOptimization)}
    </div>
    <div class="workspace-two-col">
      ${renderMetricPanel("收益与平衡指标", buildDatabaseBalanceMetrics(database, saving, carbonSaving, revenue))}
      ${renderRecommendationPanel("运行调度建议", buildDatabaseModuleRecommendations(database, "balance-opt"))}
    </div>
  `;
}

function renderDatabaseFootprintWorkspace(context) {
  const database = context.database;
  const period = database.period;
  const scope = getDatabaseScopeStats(database);
  const quality = buildDatabaseQualityStats(database);
  const coverage = estimateDatabaseBoundaryCoverage(database, quality);
  const stages = buildDatabaseLifecycleStages(database);
  const product = buildDatabaseProductFootprintModel(database, scope, stages, coverage);
  const layers = buildDatabaseFootprintLayers(database, coverage, product.unitFootprintKg);
  const hotspot = stages[0];
  const cards = [
    { label: "单位碳足迹", value: `${shared.formatNumber(product.unitFootprintKg, 3)} kg CO₂e/${product.unit}`, note: product.name },
    { label: "生命周期碳足迹", value: `${shared.formatNumber(product.totalCarbonTons, 3)} t CO₂e`, note: "按当前边界与补充阶段估算。" },
    { label: "热点阶段", value: hotspot.name, note: `${shared.formatPercent(hotspot.share)} · ${shared.formatNumber(hotspot.carbonTons, 3)} t CO₂e`, tone: hotspot.share > 0.5 ? "danger" : "neutral" },
    { label: "报告覆盖率", value: `${shared.formatPercent(coverage)}`, note: "用于判断报告可用程度。", tone: coverage < 0.8 ? "danger" : "success" }
  ];

  return `
    ${renderSummaryStrip(cards)}
    <div class="workspace-two-col-wide">
      ${renderProductFootprintPanel("产品碳足迹核算", product)}
      ${renderPiePanel("生命周期阶段拆分", buildLifecyclePieData(stages))}
    </div>
    <div class="workspace-two-col">
      ${renderTablePanel("生命周期明细", ["阶段", "排放量", "占比", "核算状态"], buildLifecycleTableRows(stages))}
      ${renderInfoCardsPanel("碳足迹热点识别", buildFootprintHotspotCards(stages))}
    </div>
    <div class="workspace-three-col">
      ${renderScenarioPanel("方案对比", buildFootprintScenarioCards(product))}
      ${renderFootprintReportPanel("碳足迹报告", product, coverage)}
      ${renderRecommendationPanel("足迹完善建议", buildDatabaseModuleRecommendations(database, "carbon-footprint"))}
    </div>
    <div class="workspace-two-col">
      ${renderBoundaryPanel("边界覆盖地图", layers)}
      ${renderFormulaPanel("核算逻辑", context.module.formulas)}
    </div>
  `;
}

function renderDatabaseVerificationWorkspace(context) {
  const database = context.database;
  const quality = buildDatabaseQualityStats(database);
  const boundaryRows = buildDatabaseVerificationBoundaryRows(database);
  const activityRows = buildDatabaseVerificationActivityRows(database);
  const factorRows = buildDatabaseVerificationFactorRows(database);
  const evidenceRows = buildDatabaseEvidenceRows(database, quality);
  const auditRows = buildDatabaseAuditRows(database, quality);
  const reportCards = buildVerificationReportCards(database.period.totalCarbon, quality);
  const cards = [
    { label: "核算边界", value: `${boundaryRows.length} 项`, note: "区域、能源和组织口径统一管理。", tone: boundaryRows.length > 0 ? "success" : "neutral" },
    { label: "活动数据台账", value: `${quality.readingCount} 条`, note: `${quality.actualPoints}/${quality.expectedPoints} 个时间点。`, tone: quality.completeness < 0.8 ? "danger" : "success" },
    { label: "证据材料", value: `${evidenceRows.filter((row) => row[2] !== "待补充").length}/${evidenceRows.length}`, note: "凭证、原始数据和表计记录留档。" },
    { label: "追溯覆盖率", value: `${shared.formatPercent(quality.traceability)}`, note: "按数据完整率和表计覆盖估算。", tone: quality.traceability < 0.85 ? "danger" : "success" }
  ];

  return `
    ${renderSummaryStrip(cards)}
    <div class="workspace-two-col">
      ${renderTablePanel("核算边界配置", ["边界项", "纳入状态", "核查说明"], boundaryRows)}
      ${renderTablePanel("活动数据台账", ["数据项", "频次", "状态", "备注"], activityRows)}
    </div>
    <div class="workspace-two-col">
      ${renderTablePanel("排放因子管理", ["能源类型", "排放因子", "适用年份", "状态"], factorRows)}
      ${renderTablePanel("证据材料管理", ["材料类型", "关联数据", "状态", "留痕说明"], evidenceRows)}
    </div>
    <div class="workspace-three-col">
      ${renderVerificationReportPanel("核查报表生成", reportCards)}
      ${renderStepPanel("证据链状态", buildDatabaseVerificationSteps(database, quality))}
      ${renderPiePanel("数据质量分层", buildDatabaseQualityPieData(quality))}
    </div>
    <div class="workspace-two-col">
      ${renderTablePanel("日志与留痕", ["时间", "操作人", "操作对象", "变更内容"], auditRows)}
      ${renderFormulaPanel("核查口径", context.module.formulas)}
    </div>
  `;
}

function renderDatabaseAssetWorkspace(context) {
  const database = context.database;
  const period = database.period;
  const gap = Math.max(period.totalCarbon - period.budgetCarbon, 0);
  const plannedReduction = estimateDatabaseCarbonSaving(database);
  const remainingGap = Math.max(gap - plannedReduction, 0);
  const cards = [
    { label: "碳缺口", value: `${shared.formatNumber(gap, 3)} t CO₂e`, note: "当前碳排高于预算的部分。", tone: gap > 0 ? "danger" : "success" },
    { label: "潜在碳成本", value: `¥${shared.formatNumber(gap * shared.OFFICE.carbonPrice, 0)}`, note: "按基准碳价估算。" },
    { label: "计划减排量", value: `${shared.formatNumber(plannedReduction, 3)} t CO₂e`, note: "由优化场景估算。" },
    { label: "履约余量", value: `${shared.formatNumber(period.budgetCarbon - period.totalCarbon, 3)} t CO₂e`, note: "负值表示需要补足。", tone: remainingGap > 0 ? "danger" : "success" }
  ];

  return `
    ${renderSummaryStrip(cards)}
    <div class="workspace-two-col">
      ${renderScenarioPanel("碳价情景", buildDatabaseAssetScenarios(database, gap))}
      ${renderProjectPanel("减排项目组合", buildDatabaseProjectPipeline(database))}
    </div>
    <div class="workspace-two-col">
      ${renderPiePanel("资产状态结构", buildDatabaseAssetPieData(period, plannedReduction, gap))}
      ${renderRecommendationPanel("资产管理建议", buildDatabaseModuleRecommendations(database, "carbon-assets"))}
    </div>
  `;
}

function renderEnergyQueryWorkspace(context) {
  const averageValue = context.period.totalKWh / context.period.points.length;
  const cards = [
    { label: `${context.period.label}用电量`, value: `${shared.formatNumber(context.period.totalKWh, 1)} kWh`, note: "当前查询结果的总电耗。" },
    { label: "平均时段值", value: `${shared.formatNumber(averageValue, 1)} ${context.lineMode.unit}`, note: "按当前选中维度折算。" },
    { label: "峰值点", value: context.peakPoint.label, note: `${shared.formatNumber(context.peakPoint.value, 1)} ${context.lineMode.unit}` },
    { label: "超预算点", value: `${context.overBudgetCount} 个`, note: "适合继续下钻查看异常原因。", tone: context.overBudgetCount > 0 ? "danger" : "success" }
  ];

  return `
    ${renderSummaryStrip(cards)}
    <div class="workspace-two-col">
      ${renderLinePanel(context, {
        title: getTrendTitle(context, context.lineMode.label)
      })}
      ${renderHeatPanel(context, {
        title: "负荷热区"
      })}
    </div>
    <div class="workspace-three-col">
      ${renderTimelinePanel("异常日期榜单", context.events)}
      ${renderMetricPanel("查询摘要", context.metrics)}
      ${renderRecommendationPanel("排查建议", context.recommendations.slice(0, 3))}
    </div>
  `;
}

function renderEnergyIntensityWorkspace(context) {
  const eui = context.period.totalKWh / shared.OFFICE.area;
  const perCapKWh = context.period.totalKWh / shared.OFFICE.staff;
  const perCapCarbon = context.period.totalCarbon / shared.OFFICE.staff;
  const targetScale = context.budgetScale;
  const cards = [
    { label: "单位面积能耗 EUI", value: `${shared.formatNumber(eui, 2)} kWh/m²`, note: "当前维度强度。" },
    { label: "人均电耗", value: `${shared.formatNumber(perCapKWh, 1)} kWh/人`, note: "适合横向比较不同规模团队。" },
    { label: "人均碳排", value: `${shared.formatNumber(perCapCarbon, 2)} t CO₂e/人`, note: "兼顾能耗与碳排视角。" },
    { label: "终端能耗", value: `${shared.formatNumber(context.period.energyGJ, 2)} GJ`, note: "便于做能量单位换算。" }
  ];
  const compareRows = [
    { label: "EUI", actual: eui, target: shared.OFFICE.benchmarkEUI * targetScale, unit: "kWh/m²", note: "与目标强度对照。" },
    { label: "人均电耗", actual: perCapKWh, target: (shared.OFFICE.annualBudgetKWh / shared.OFFICE.staff) * targetScale, unit: "kWh/人", note: "按人数归一化。" },
    { label: "人均碳排", actual: perCapCarbon, target: shared.OFFICE.benchmarkPerCapCarbon * targetScale, unit: "t CO₂e/人", note: "人均碳排更适合管理视角。" }
  ];
  const assumptions = [
    { title: "人数假设", copy: `${shared.OFFICE.staff} 人固定工位，用于人均指标对比办公区。`, tone: "success" },
    { title: "面积假设", copy: `${shared.OFFICE.area} m² 办公区，EUI 对标基于同一面积口径。`, tone: "neutral" },
    { title: "排放因子", copy: `${shared.OFFICE.gridFactor} kg CO₂e/kWh，用于同步换算碳强度。`, tone: "neutral" }
  ];

  return `
    ${renderSummaryStrip(cards)}
    <div class="workspace-two-col">
      ${renderComparePanel("强度对标面板", compareRows)}
      ${renderFormulaPanel("换算工作台", context.module.formulas)}
    </div>
    <div class="workspace-three-col">
      ${renderMetricPanel("核心指标", context.metrics)}
      ${renderInfoCardsPanel("口径与假设", assumptions)}
      ${renderRecommendationPanel("应用建议", context.recommendations.slice(0, 3))}
    </div>
  `;
}

function renderEnergyAnalysisWorkspace(context) {
  const driverItems = context.energyPie.items.map((item, index) => ({
    title: item.label,
    value: `${shared.formatNumber(item.value, 0)} kWh`,
    note: item.note,
    ratio: item.value / context.period.totalKWh,
    color: item.color,
    rank: index + 1
  }));
  const opportunities = buildOpportunityCards();
  const cards = [
    { label: "夏季空调占比", value: context.metrics[0].value, note: context.metrics[0].note, tone: context.metrics[0].danger ? "danger" : "neutral" },
    { label: "加班负荷占比", value: context.metrics[1].value, note: context.metrics[1].note, tone: context.metrics[1].danger ? "danger" : "neutral" },
    { label: "可节电潜力", value: context.metrics[2].value, note: "优先用来安排节能动作。" },
    { label: "潜在减排量", value: context.metrics[3].value, note: "同步估算碳收益。" }
  ];

  return `
    ${renderSummaryStrip(cards)}
    <div class="workspace-two-col">
      ${renderLinePanel(context, {
        title: getTrendTitle(context, "用能走势")
      })}
      ${renderDriverPanel("原因画像", driverItems)}
    </div>
    <div class="workspace-three-col">
      ${renderTimelinePanel("热点事件", context.events)}
      ${renderScenarioPanel("节能机会", opportunities)}
      ${renderRecommendationPanel("建议动作", context.recommendations)}
    </div>
  `;
}

function renderBenchmarkWorkspace(context) {
  const eui = context.period.totalKWh / shared.OFFICE.area;
  const perCapCarbon = context.period.totalCarbon / shared.OFFICE.staff;
  const peerRows = [
    { name: "当前办公区", value: shared.formatNumber(eui, 2), target: shared.formatNumber(shared.OFFICE.benchmarkEUI * context.budgetScale, 2), status: eui > shared.OFFICE.benchmarkEUI * context.budgetScale ? "高于目标" : "达标" },
    { name: "内部优秀值", value: shared.formatNumber(shared.OFFICE.benchmarkEUI * context.budgetScale * 0.92, 2), target: shared.formatNumber(shared.OFFICE.benchmarkEUI * context.budgetScale, 2), status: "优秀基线" },
    { name: "内部平均值", value: shared.formatNumber(shared.OFFICE.benchmarkEUI * context.budgetScale * 1.04, 2), target: shared.formatNumber(shared.OFFICE.benchmarkEUI * context.budgetScale, 2), status: "平均基线" }
  ];
  const compareRows = [
    { label: "单位面积能耗", actual: eui, target: shared.OFFICE.benchmarkEUI * context.budgetScale, unit: "kWh/m²", note: "能效最常用的对标指标。" },
    { label: "人均碳排", actual: perCapCarbon, target: shared.OFFICE.benchmarkPerCapCarbon * context.budgetScale, unit: "t CO₂e/人", note: "从团队规模角度观察偏差。" },
    { label: "预算执行率", actual: context.period.totalKWh / Math.max(context.period.budgetKWh, 1), target: 1, unit: "", note: "1.00 表示正好命中预算。" }
  ];
  const levelCards = [
    { title: "当前等级", copy: eui > shared.OFFICE.benchmarkEUI * context.budgetScale ? "需要优化" : "保持良好", tone: eui > shared.OFFICE.benchmarkEUI * context.budgetScale ? "danger" : "success" },
    { title: "最佳月份", copy: `${shared.DATA.insights.lowMonth.label} 是当前最低月。`, tone: "success" },
    { title: "改进方向", copy: "优先压缩夏季空调和加班尾峰，会更容易把强度拉回目标线。", tone: "neutral" }
  ];
  const cards = [
    { label: "年度对标偏差", value: context.metrics[0].value, note: context.metrics[0].note, tone: context.metrics[0].danger ? "danger" : "neutral" },
    { label: "最佳月份", value: context.metrics[1].value, note: context.metrics[1].note },
    { label: "年度人均碳排", value: context.metrics[2].value, note: context.metrics[2].note },
    { label: "当前单位面积电耗", value: context.metrics[3].value, note: context.metrics[3].note, tone: context.metrics[3].danger ? "danger" : "neutral" }
  ];

  return `
    ${renderSummaryStrip(cards)}
    <div class="workspace-two-col">
      ${renderComparePanel("目标对标", compareRows)}
      ${renderTablePanel("内部对标表", ["对象", "当前值", "目标值", "状态"], peerRows.map((row) => [row.name, `${row.value}`, `${row.target}`, row.status]))}
    </div>
    <div class="workspace-three-col">
      ${renderInfoCardsPanel("等级判断", levelCards)}
      ${renderMetricPanel("关键偏差", context.metrics)}
      ${renderRecommendationPanel("管理建议", context.recommendations.slice(0, 3))}
    </div>
  `;
}

function renderEnergyFlowWorkspace(context) {
  const balanceCards = [
    { label: "输入电量", value: `${shared.formatNumber(context.period.totalKWh, 1)} kWh`, note: "当前选中维度的总输入能量。" },
    { label: "有效利用", value: `${shared.formatNumber(context.period.totalKWh * 0.84, 1)} kWh`, note: "按办公场景估算。" },
    { label: "待机损耗", value: `${shared.formatNumber(context.period.totalKWh * 0.08, 1)} kWh`, note: "夜间和周末损耗。", tone: "danger" },
    { label: "运行损失", value: `${shared.formatNumber(context.period.totalKWh * 0.08, 1)} kWh`, note: "控制不精细导致的损失。" }
  ];
  const endUseCards = context.energyPie.items.map((item) => ({
    title: item.label,
    copy: `${shared.formatNumber(item.value, 0)} kWh · ${shared.formatPercent(item.value / context.period.totalKWh)} · ${item.note}`,
    tone: item.value / context.period.totalKWh > 0.4 ? "danger" : "neutral"
  }));

  return `
    ${renderSummaryStrip(balanceCards)}
    <div class="workspace-two-col workspace-two-col-wide">
      ${renderFlowPanel("能流去向", context.energyPie.items, context.period.totalKWh)}
      ${renderInfoCardsPanel("末端重点负荷", endUseCards)}
    </div>
    <div class="workspace-two-col">
      ${renderStackedBalancePanel("损耗结构", [
        { label: "有效利用", value: 84, color: "#2f6b56" },
        { label: "待机损耗", value: 8, color: "#cf7458" },
        { label: "运行损失", value: 8, color: "#d2b06b" }
      ])}
      ${renderRecommendationPanel("优化抓手", context.recommendations)}
    </div>
  `;
}

function renderBalanceWorkspace(context) {
  const scenarios = [
    { title: "空调分区启停", value: `${shared.formatNumber(shared.DATA.insights.savingPotentialKWh * 0.42, 0)} kWh/年`, note: "优先降低夏季高峰和空载时段。", tone: "success" },
    { title: "待机治理", value: `${shared.formatNumber(shared.DATA.insights.savingPotentialKWh * 0.28, 0)} kWh/年`, note: "针对打印、茶水间和插座设备。", tone: "neutral" },
    { title: "照明时段策略", value: `${shared.formatNumber(shared.DATA.insights.savingPotentialKWh * 0.18, 0)} kWh/年`, note: "适合结合下班后延时关闭。", tone: "neutral" },
    { title: "会议区联动控制", value: `${shared.formatNumber(shared.DATA.insights.savingPotentialKWh * 0.12, 0)} kWh/年`, note: "把会议室的空调和投影联动到预约。", tone: "neutral" }
  ];
  const cards = [
    { label: "有效利用电量", value: `${shared.formatNumber(context.period.totalKWh * 0.84, 1)} kWh`, note: "当前阶段的有效利用部分。" },
    { label: "待机损耗", value: `${shared.formatNumber(context.period.totalKWh * 0.08, 1)} kWh`, note: "夜间和周末的主要损耗。", tone: "danger" },
    { label: "运行损失", value: `${shared.formatNumber(context.period.totalKWh * 0.08, 1)} kWh`, note: "需要靠控制优化和设备策略改善。" },
    { label: "优化收益", value: context.metrics[3].value, note: context.metrics[3].note }
  ];

  return `
    ${renderSummaryStrip(cards)}
    <div class="workspace-two-col">
      ${renderBeforeAfterPanel("平衡前后对比", [
        { name: "当前", items: [{ label: "有效利用", value: 84, color: "#2f6b56" }, { label: "待机损耗", value: 8, color: "#cf7458" }, { label: "运行损失", value: 8, color: "#d2b06b" }] },
        { name: "优化后", items: [{ label: "有效利用", value: 89, color: "#2f6b56" }, { label: "待机损耗", value: 5, color: "#cf7458" }, { label: "运行损失", value: 6, color: "#d2b06b" }] }
      ])}
      ${renderScenarioPanel("优化组合", scenarios)}
    </div>
    <div class="workspace-two-col">
      ${renderMetricPanel("收益与平衡指标", context.metrics)}
      ${renderRecommendationPanel("优先顺序", context.recommendations)}
    </div>
  `;
}

function renderBudgetWorkspace(context) {
  const remainingBudget = context.period.budgetKWh - context.period.totalKWh;
  const monthlyRows = shared.DATA.monthly.map((month) => ({
    title: month.label,
    copy: `${shared.formatNumber(month.kWh, 0)} / ${shared.formatNumber(month.budgetKWh, 0)} kWh · ${month.kWh > month.budgetKWh ? `超出 ${shared.formatNumber(month.kWh - month.budgetKWh, 0)} kWh` : `结余 ${shared.formatNumber(month.budgetKWh - month.kWh, 0)} kWh`}`,
    tone: month.kWh > month.budgetKWh ? "danger" : "success"
  }));
  const forecastCards = [
    { title: "滚动预测", value: `${shared.formatNumber(context.annualProjection, 0)} kWh/年`, note: `当前趋势${context.annualProjection > shared.OFFICE.annualBudgetKWh ? "高于" : "低于"}年度预算。`, tone: context.annualProjection > shared.OFFICE.annualBudgetKWh ? "danger" : "success" },
    { title: "剩余预算", value: `${shared.withSign(remainingBudget)} kWh`, note: "适合继续用作月内预警。", tone: remainingBudget < 0 ? "danger" : "neutral" },
    { title: "执行节奏", value: "月 / 周 / 日", note: "建议三级拆解预算，便于及时预警。", tone: "neutral" }
  ];
  const cards = [
    { label: "能耗执行率", value: context.metrics[0].value, note: context.metrics[0].note, tone: context.metrics[0].danger ? "danger" : "neutral" },
    { label: "碳排执行率", value: context.metrics[1].value, note: context.metrics[1].note, tone: context.metrics[1].danger ? "danger" : "neutral" },
    { label: "剩余碳预算", value: context.metrics[2].value, note: context.metrics[2].note, tone: context.metrics[2].danger ? "danger" : "neutral" },
    { label: "累计差额", value: context.metrics[3].value, note: context.metrics[3].note, tone: context.metrics[3].danger ? "danger" : "neutral" }
  ];

  return `
    ${renderSummaryStrip(cards)}
    <div class="workspace-two-col">
      ${renderLinePanel(context, {
        title: getTrendTitle(context, "预算执行")
      })}
      ${renderInfoCardsPanel("月度预算追踪", monthlyRows)}
    </div>
    <div class="workspace-three-col">
      ${renderScenarioPanel("滚动预测", forecastCards)}
      ${renderTimelinePanel("异常预警", context.events)}
      ${renderRecommendationPanel("预算动作", context.recommendations)}
    </div>
  `;
}

function renderCarbonEmissionWorkspace(context) {
  const intensity = context.period.totalCarbon / shared.OFFICE.area;
  const perCapitaCarbon = context.period.totalCarbon / shared.OFFICE.staff;
  const carbonRate = context.period.budgetCarbon > 0 ? context.period.totalCarbon / context.period.budgetCarbon : 0;
  const cards = [
    { label: `${context.period.label}碳排`, value: `${shared.formatNumber(context.period.totalCarbon, 2)} t CO₂e`, note: "由活动数据和排放因子自动计算。" },
    { label: "单位面积碳强度", value: `${shared.formatNumber(intensity, 4)} t CO₂e/m²`, note: "适合横向对比办公区。" },
    { label: "单位人数碳排", value: `${shared.formatNumber(perCapitaCarbon, 3)} t CO₂e/人`, note: "按办公人数归一化。" },
    { label: "碳预算执行率", value: `${shared.formatPercent(carbonRate)}`, note: context.metrics[3].note, tone: carbonRate > 1 ? "danger" : "success" }
  ];

  return `
    ${renderSummaryStrip(cards)}
    <div class="workspace-two-col-wide">
      ${renderLinePanel(context, {
        title: getTrendTitle(context, "碳排趋势")
      }, "carbon")}
      ${renderPiePanel("分能源类型碳排结构", buildDemoCarbonEnergyPieData(context))}
    </div>
    <div class="workspace-two-col">
      ${renderTablePanel("碳排自动计算", ["能源类型", "活动数据", "排放因子", "碳排放", "占比"], buildDemoCarbonCalculationRows(context))}
      ${renderTablePanel("分区域碳排放", ["区域", "碳排放", "单位面积", "占比", "状态"], buildDemoCarbonAreaRows(context))}
    </div>
    <div class="workspace-three-col">
      ${renderMetricPanel("碳排强度分析", buildDemoCarbonIntensityMetrics(context, intensity, perCapitaCarbon))}
      ${renderInfoCardsPanel("趋势分析", buildDemoCarbonTrendCards(context))}
      ${renderScenarioPanel("减排成效", buildDemoCarbonReductionCards(context))}
    </div>
    <div class="workspace-two-col">
      ${renderPiePanel("终端排放结构", context.carbonPie)}
      ${renderTimelinePanel("重点排放事件", context.events)}
    </div>
  `;
}

function buildDemoCarbonCalculationRows(context) {
  const factor = shared.OFFICE.gridFactor;
  return [[
    "购入电力",
    `${shared.formatNumber(context.period.totalKWh, 1)} kWh`,
    `${shared.formatNumber(factor, 3)} kg CO₂e/kWh`,
    `${shared.formatNumber(context.period.totalCarbon, 3)} t CO₂e`,
    "100.0 %"
  ]];
}

function buildDemoCarbonEnergyPieData(context) {
  return {
    title: "分能源类型碳排结构",
    unit: "t CO₂e",
    centerLabel: "碳排",
    items: [{
      label: "购入电力",
      value: Math.max(context.period.totalCarbon, 0.001),
      color: ENERGY_TYPE_COLORS.electricity,
      note: `${shared.formatNumber(context.period.totalKWh, 1)} kWh`
    }]
  };
}

function buildDemoCarbonAreaRows(context) {
  const areas = [
    { name: "办公区", ratio: 0.42, area: shared.OFFICE.area * 0.46 },
    { name: "会议区", ratio: 0.18, area: shared.OFFICE.area * 0.2 },
    { name: "设备间", ratio: 0.25, area: shared.OFFICE.area * 0.12 },
    { name: "公共区域", ratio: 0.15, area: shared.OFFICE.area * 0.22 }
  ];
  return areas.map((area) => {
    const carbon = context.period.totalCarbon * area.ratio;
    const status = area.ratio > 0.24 ? "重点关注" : "常规跟踪";
    return [
      area.name,
      `${shared.formatNumber(carbon, 3)} t CO₂e`,
      `${shared.formatNumber(safeDivide(carbon, area.area), 5)} t CO₂e/m²`,
      shared.formatPercent(area.ratio),
      status
    ];
  });
}

function buildDemoCarbonIntensityMetrics(context, intensity, perCapitaCarbon) {
  const outputValue = Math.max(shared.OFFICE.staff * 18, 1);
  return [
    metric("单位面积碳排", `${shared.formatNumber(intensity, 5)} t CO₂e/m²`, "用于楼宇和办公区横向比较。", false),
    metric("单位人数碳排", `${shared.formatNumber(perCapitaCarbon, 4)} t CO₂e/人`, "按办公人数归一化。", false),
    metric("单位产值碳排", `${shared.formatNumber(safeDivide(context.period.totalCarbon * 1000, outputValue), 3)} kg CO₂e/万元`, "按管理产值口径折算。", false),
    metric("碳预算强度", `${shared.formatNumber(safeDivide(context.period.budgetCarbon, shared.OFFICE.area), 5)} t CO₂e/m²`, "用于观察预算线压力。", context.period.totalCarbon > context.period.budgetCarbon)
  ];
}

function buildDemoCarbonTrendCards(context) {
  const points = context.period.points || [];
  if (points.length < 2) {
    return [
      { title: "趋势方向", copy: "当前时间范围内展示本期核算结果。", tone: "neutral" },
      { title: "预算线", copy: `${points.filter((point) => point.carbon > point.budgetCarbon).length} 个时间点高于碳预算线。`, tone: "neutral" },
      { title: "峰值排放", copy: "切换到月度或年度可查看更完整趋势。", tone: "neutral" }
    ];
  }
  const first = points[0];
  const last = points[points.length - 1];
  const changeRate = safeDivide(last.carbon - first.carbon, first.carbon);
  const peak = points.reduce((best, point) => point.carbon > best.carbon ? point : best, points[0]);
  const overCount = points.filter((point) => point.carbon > point.budgetCarbon).length;
  return [
    {
      title: "趋势方向",
      copy: `${last.label} 较 ${first.label} ${changeRate >= 0 ? "上升" : "下降"} ${shared.formatPercent(Math.abs(changeRate))}。`,
      tone: changeRate > 0.05 ? "danger" : "success"
    },
    {
      title: "峰值排放",
      copy: `${peak.label} 达到 ${shared.formatNumber(peak.carbon, 3)} t CO₂e。`,
      tone: overCount > 0 ? "danger" : "neutral"
    },
    {
      title: "预算线",
      copy: `${overCount} 个时间点高于碳预算线。`,
      tone: overCount > 0 ? "danger" : "success"
    }
  ];
}

function buildDemoCarbonReductionCards(context) {
  const points = context.period.points || [];
  const peak = points.length > 0 ? points.reduce((best, point) => point.carbon > best.carbon ? point : best, points[0]) : { label: "暂无", carbon: 0 };
  const low = points.length > 0 ? points.reduce((best, point) => point.carbon < best.carbon ? point : best, points[0]) : { label: "暂无", carbon: 0 };
  const remaining = context.period.budgetCarbon - context.period.totalCarbon;
  return [
    { title: "节能措施减排", value: `${shared.formatNumber(shared.DATA.insights.savingPotentialCarbon, 2)} t CO₂e`, note: "由当前节能潜力折算。", tone: "success" },
    { title: "较峰值削减", value: `${shared.formatNumber(Math.max(peak.carbon - low.carbon, 0), 3)} t CO₂e`, note: `${peak.label} 与 ${low.label} 的排放差额。`, tone: "neutral" },
    { title: "预算剩余额", value: `${shared.withSign(remaining)} t CO₂e`, note: remaining >= 0 ? "当前仍在碳预算内。" : "需要通过节能动作消化缺口。", tone: remaining < 0 ? "danger" : "success" }
  ];
}

function renderFootprintWorkspace(context) {
  const coverage = parsePercentValue(context.metrics[0].value);
  const stages = buildDemoLifecycleStages(context);
  const product = buildDemoProductFootprintModel(context, stages, coverage);
  const layers = buildFootprintLayers(context, product.unitFootprintKg);
  const hotspot = stages[0];
  const cards = [
    { label: "单位碳足迹", value: `${shared.formatNumber(product.unitFootprintKg, 3)} kg CO₂e/${product.unit}`, note: product.name },
    { label: "生命周期碳足迹", value: `${shared.formatNumber(product.totalCarbonTons, 3)} t CO₂e`, note: "按当前边界与补充阶段估算。" },
    { label: "热点阶段", value: hotspot.name, note: `${shared.formatPercent(hotspot.share)} · ${shared.formatNumber(hotspot.carbonTons, 3)} t CO₂e`, tone: hotspot.share > 0.5 ? "danger" : "neutral" },
    { label: "报告覆盖率", value: context.metrics[0].value, note: context.metrics[0].note, tone: context.metrics[0].danger ? "danger" : "success" }
  ];

  return `
    ${renderSummaryStrip(cards)}
    <div class="workspace-two-col-wide">
      ${renderProductFootprintPanel("产品碳足迹核算", product)}
      ${renderPiePanel("生命周期阶段拆分", buildLifecyclePieData(stages))}
    </div>
    <div class="workspace-two-col">
      ${renderTablePanel("生命周期明细", ["阶段", "排放量", "占比", "核算状态"], buildLifecycleTableRows(stages))}
      ${renderInfoCardsPanel("碳足迹热点识别", buildFootprintHotspotCards(stages))}
    </div>
    <div class="workspace-three-col">
      ${renderScenarioPanel("方案对比", buildFootprintScenarioCards(product))}
      ${renderFootprintReportPanel("碳足迹报告", product, coverage)}
      ${renderRecommendationPanel("下一步建议", context.recommendations)}
    </div>
    <div class="workspace-two-col">
      ${renderBoundaryPanel("边界覆盖地图", layers)}
      ${renderFormulaPanel("核算逻辑", context.module.formulas)}
    </div>
  `;
}

function renderSupplyChainWorkspace(context) {
  const supplierRows = shared.DATA.suppliers.map((item) => [
    item.name,
    `${item.spend} %`,
    `${shared.formatNumber(item.intensity, 3)} t CO₂e/万元`,
    `${shared.formatNumber(item.emissions, 1)} t CO₂e`
  ]);
  const cards = [
    { label: "加权碳强度", value: context.metrics[0].value, note: context.metrics[0].note, tone: context.metrics[0].danger ? "danger" : "neutral" },
    { label: "高风险供应商占比", value: context.metrics[1].value, note: context.metrics[1].note, tone: context.metrics[1].danger ? "danger" : "neutral" },
    { label: "优先整改对象", value: context.metrics[2].value, note: context.metrics[2].note },
    { label: "问卷覆盖率", value: context.metrics[3].value, note: context.metrics[3].note, tone: context.metrics[3].danger ? "danger" : "neutral" }
  ];
  const actions = [
    { title: "高排放供应商优先约谈", copy: "先从 ICT 设备和物流供应商入手，推动填报和减排承诺。", tone: "danger" },
    { title: "采购规则加碳评分", copy: "把价格、交付和碳数据三类维度并列纳入采购评价。", tone: "neutral" },
    { title: "季度问卷复盘", copy: "按季度追踪碳强度变化，形成供应商分层管理。", tone: "neutral" }
  ];

  return `
    ${renderSummaryStrip(cards)}
    <div class="workspace-two-col">
      ${renderTablePanel("供应商碳排榜单", ["供应商", "采购占比", "碳强度", "排放量"], supplierRows)}
      ${renderRiskMatrixPanel("风险矩阵", shared.DATA.suppliers)}
    </div>
    <div class="workspace-two-col">
      ${renderPiePanel("供应链碳排结构", context.modulePie)}
      ${renderInfoCardsPanel("协同动作", actions)}
    </div>
  `;
}

function renderVerificationWorkspace(context) {
  const sourceRows = buildVerificationSources();
  const steps = buildVerificationSteps();
  const boundaryRows = buildDemoVerificationBoundaryRows(context);
  const factorRows = buildDemoVerificationFactorRows();
  const evidenceRows = buildDemoEvidenceRows(context);
  const auditRows = buildDemoAuditRows(context);
  const reportCards = buildVerificationReportCards(context.period.totalCarbon, {
    completeness: parsePercentValue(context.metrics[0].value),
    traceability: parsePercentValue(context.metrics[2].value)
  });
  const cards = [
    { label: "核算边界", value: `${boundaryRows.length} 项`, note: "组织、区域和能源口径统一管理。" },
    { label: "活动数据台账", value: context.metrics[0].value, note: context.metrics[0].note },
    { label: "证据材料", value: `${evidenceRows.filter((row) => row[2] !== "待补充").length}/${evidenceRows.length}`, note: "凭证、原始数据和因子版本留档。" },
    { label: "追溯覆盖率", value: context.metrics[2].value, note: context.metrics[2].note, tone: context.metrics[2].danger ? "danger" : "success" }
  ];

  return `
    ${renderSummaryStrip(cards)}
    <div class="workspace-two-col">
      ${renderTablePanel("核算边界配置", ["边界项", "纳入状态", "核查说明"], boundaryRows)}
      ${renderTablePanel("活动数据台账", ["数据项", "频次", "状态", "备注"], sourceRows)}
    </div>
    <div class="workspace-two-col">
      ${renderTablePanel("排放因子管理", ["能源类型", "排放因子", "适用年份", "状态"], factorRows)}
      ${renderTablePanel("证据材料管理", ["材料类型", "关联数据", "状态", "留痕说明"], evidenceRows)}
    </div>
    <div class="workspace-three-col">
      ${renderVerificationReportPanel("核查报表生成", reportCards)}
      ${renderStepPanel("证据链状态", steps)}
      ${renderPiePanel("数据质量分层", context.modulePie)}
    </div>
    <div class="workspace-two-col">
      ${renderTablePanel("日志与留痕", ["时间", "操作人", "操作对象", "变更内容"], auditRows)}
      ${renderFormulaPanel("核查口径", context.module.formulas)}
    </div>
  `;
}

function renderAssetWorkspace(context) {
  const priceScenarios = buildAssetScenarios();
  const pipeline = buildProjectPipeline();
  const cards = [
    { label: "碳缺口", value: context.metrics[0].value, note: context.metrics[0].note, tone: context.metrics[0].danger ? "danger" : "neutral" },
    { label: "潜在碳成本", value: context.metrics[1].value, note: context.metrics[1].note, tone: context.metrics[1].danger ? "danger" : "neutral" },
    { label: "计划减排量", value: context.metrics[2].value, note: context.metrics[2].note },
    { label: "状态提示", value: context.metrics[3].value, note: context.metrics[3].note, tone: context.metrics[3].danger ? "danger" : "neutral" }
  ];

  return `
    ${renderSummaryStrip(cards)}
    <div class="workspace-two-col">
      ${renderScenarioPanel("碳价情景", priceScenarios)}
      ${renderProjectPanel("减排项目组合", pipeline)}
    </div>
    <div class="workspace-two-col">
      ${renderPiePanel("资产状态结构", context.modulePie)}
      ${renderRecommendationPanel("决策建议", context.recommendations)}
    </div>
  `;
}

function renderSummaryStrip(cards) {
  return `
    <section class="workspace-kpi-strip">
      ${cards.map((card) => `
        <article class="workspace-kpi-card ${card.tone ? `tone-${card.tone}` : ""}">
          <span>${card.label}</span>
          <strong class="${card.tone === "danger" ? "status-danger" : card.tone === "success" ? "status-success" : ""}">${card.value}</strong>
          ${card.note ? `<p>${card.note}</p>` : ""}
        </article>
      `).join("")}
    </section>
  `;
}

function renderLinePanel(context, config, forceMode) {
  const mode = forceMode ? getLineMode(forceMode, forceMode) : context.lineMode;
  return `
    <section class="panel workspace-panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">趋势分析</p>
          <h3>${config.title}</h3>
        </div>
      </div>
      ${renderLineChartMarkup(context.period, mode)}
    </section>
  `;
}

function renderPiePanel(title, pieData) {
  return `
    <section class="panel workspace-panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">结构分析</p>
          <h3>${title}</h3>
        </div>
      </div>
      ${renderPieChartMarkup(pieData)}
    </section>
  `;
}

function renderHeatPanel(context, config) {
  const mode = context.lineMode;
  const maxValue = Math.max(...context.period.points.map((item) => item[mode.valueKey]), 1);
  return `
    <section class="panel workspace-panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">热区扫描</p>
          <h3>${config.title}</h3>
        </div>
      </div>
      <div class="heat-grid">
        ${context.period.points.map((item) => {
          const ratio = item[mode.valueKey] / maxValue;
          const over = item[mode.valueKey] > item[mode.budgetKey];
          return `
            <div class="heat-cell ${over ? "heat-hot" : ""}" style="--heat:${0.24 + ratio * 0.68}">
              <strong>${item.label}</strong>
              <span>${shared.formatNumber(item[mode.valueKey], mode.unit === "t CO₂e" ? 2 : 0)} ${mode.unit}</span>
              <small>${over ? "高于预算" : "预算以内"}</small>
            </div>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function renderMetricPanel(title, items) {
  return `
    <section class="panel workspace-panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">指标聚合</p>
          <h3>${title}</h3>
        </div>
      </div>
      <div class="metric-grid">
        ${items.map((item) => `
          <div class="metric-card">
            <strong>${item.label}</strong>
            <p><span class="${item.statusClass}">${item.value}</span><br>${item.note}</p>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function renderRecommendationPanel(title, items) {
  return `
    <section class="panel workspace-panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">建议动作</p>
          <h3>${title}</h3>
        </div>
      </div>
      <div class="recommend-list">
        ${items.map((item) => `
          <div class="recommend-item">
            <strong>${item.title}</strong>
            <p>${item.copy}</p>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function renderTimelinePanel(title, items) {
  return `
    <section class="panel workspace-panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">时间线</p>
          <h3>${title}</h3>
        </div>
      </div>
      <div class="timeline-list">
        ${items.map((item) => `
          <div class="timeline-item">
            <div class="timeline-head">
              <strong>${item.title}</strong>
              ${createStatusBadge(item.badgeLabel, item.danger)}
            </div>
            <p>${item.copy}</p>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function renderFormulaPanel(title, formulas) {
  return `
    <section class="panel workspace-panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">关键公式</p>
          <h3>${title}</h3>
        </div>
      </div>
      <div class="formula-grid">
        ${formulas.map((item) => `
          <div class="formula-card">
            <strong>${item.title}</strong>
            <code>${item.equation}</code>
            <p>${item.note}</p>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function renderPeakValleyPanel(title, insight) {
  return `
    <section class="panel workspace-panel peak-valley-panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">峰谷分析</p>
          <h3>${title}</h3>
        </div>
      </div>
      <div class="peak-valley-board">
        <div class="peak-card tone-danger">
          <span>高峰</span>
          <strong>${insight.peak.label}</strong>
          <p>${shared.formatNumber(insight.peak.value, 2)} ${insight.unit}</p>
        </div>
        <div class="peak-card tone-success">
          <span>低谷</span>
          <strong>${insight.valley.label}</strong>
          <p>${shared.formatNumber(insight.valley.value, 2)} ${insight.unit}</p>
        </div>
      </div>
      <div class="peak-valley-meter">
        <div class="compare-track">
          <div class="compare-fill over" style="width:${Math.min(insight.peakRatio * 100, 100)}%;"></div>
        </div>
        <div class="compare-values">
          <span>峰谷比 ${shared.formatNumber(insight.peakRatio, 2)}</span>
          <span>差额 ${shared.formatNumber(insight.spread, 2)} ${insight.unit}</span>
        </div>
      </div>
      <div class="strategy-strip">
        ${insight.signals.map((item) => `
          <span class="${item.tone ? `tone-${item.tone}` : ""}">${item.label}</span>
        `).join("")}
      </div>
    </section>
  `;
}

function renderBenchmarkModePanel() {
  return `
    <section class="panel workspace-panel benchmark-mode-panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">对标方式</p>
          <h3>选择对比维度</h3>
        </div>
      </div>
      <div class="benchmark-mode-control">
        <label class="field">
          <span>对标维度</span>
          <select data-benchmark-mode-select>
            <option value="all" selected>全部维度</option>
            <option value="area">区域对标</option>
            <option value="time">时间对标</option>
            <option value="indicator">指标对标</option>
            <option value="target">目标值对标</option>
            <option value="ranking">排行榜</option>
          </select>
        </label>
        <p>按同一时间范围、能源类型和区域口径进行横向、纵向及目标线对比。</p>
      </div>
    </section>
  `;
}

function renderStandardEnergyReportPanel(title, standardEnergy) {
  const rows = standardEnergy.rows.length > 0 ? standardEnergy.rows : Object.entries(ENERGY_CONVERSION_FACTORS).map(([code, factor]) => ({
    code,
    label: factor.label,
    unit: factor.unit,
    amount: 0,
    energyGJ: 0,
    standardCoalTons: 0,
    carbonTons: 0,
    factor
  }));
  return `
    <section class="panel workspace-panel standard-energy-panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">计算中心</p>
          <h3>${title}</h3>
        </div>
      </div>
      <div class="standard-energy-total">
        <div>
          <span>综合能耗</span>
          <strong>${shared.formatNumber(standardEnergy.totalStandardCoalTons, 4)} tce</strong>
        </div>
        <div>
          <span>热值口径</span>
          <strong>${shared.formatNumber(standardEnergy.totalGJ, 3)} GJ</strong>
        </div>
        <div>
          <span>碳排估算</span>
          <strong>${shared.formatNumber(standardEnergy.totalCarbonTons, 4)} t CO₂e</strong>
        </div>
      </div>
      <div class="standard-energy-list">
        ${rows.map((row) => `
          <div class="standard-energy-row">
            <div>
              <strong>${row.label}</strong>
              <span>${shared.formatNumber(row.amount, 3)} ${formatDisplayUnit(row.unit)}</span>
            </div>
            <div>
              <span>${shared.formatNumber(row.energyGJ, 3)} GJ</span>
              <span>${shared.formatNumber(row.standardCoalTons, 4)} tce</span>
            </div>
            <small>${row.factor.note}</small>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function renderIntensityCalculatorPanel(scope) {
  return `
    <section class="panel workspace-panel intensity-calculator" data-intensity-calculator>
      <div class="section-head">
        <div>
          <p class="eyebrow">在线计算器</p>
          <h3>能源折算器</h3>
        </div>
      </div>
      <div class="calculator-form">
        <label class="field">
          <span>能源种类</span>
          <select name="energyTypeCode">
            ${Object.entries(ENERGY_CONVERSION_FACTORS).map(([code, factor]) => `
              <option value="${code}" ${code === "electricity" ? "selected" : ""}>${factor.label}（${factor.unit}）</option>
            `).join("")}
          </select>
        </label>
        <label class="field">
          <span>消费量</span>
          <input name="amount" type="number" min="0" step="0.001" value="1000">
        </label>
        <label class="field">
          <span>建筑面积 m²</span>
          <input name="areaM2" type="number" min="0" step="0.1" value="${shared.formatNumber(scope.floorArea, 1)}">
        </label>
        <label class="field">
          <span>产值 万元</span>
          <input name="outputValue" type="number" min="0" step="0.1" placeholder="可选">
        </label>
        <label class="field">
          <span>产品产量 件</span>
          <input name="productOutput" type="number" min="0" step="1" placeholder="可选">
        </label>
      </div>
      <p class="calculator-formula" data-calculator-formula></p>
      <div class="calculator-result" data-calculator-result></div>
    </section>
  `;
}

function renderComparePanel(title, rows) {
  const maxValue = Math.max(...rows.flatMap((row) => [row.actual, row.target]), 1);
  return `
    <section class="panel workspace-panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">比较面板</p>
          <h3>${title}</h3>
        </div>
      </div>
      <div class="compare-board">
        ${rows.map((row) => {
          const actualWidth = Math.min(row.actual / maxValue, 1) * 100;
          const targetPosition = Math.min(row.target / maxValue, 1) * 100;
          return `
            <div class="compare-row">
              <div class="compare-copy">
                <strong>${row.label}</strong>
                <p>${row.note}</p>
              </div>
              <div class="compare-values">
                <span>当前 ${shared.formatNumber(row.actual, row.unit ? 2 : 2)}${row.unit ? ` ${row.unit}` : ""}</span>
                <span>目标 ${shared.formatNumber(row.target, row.unit ? 2 : 2)}${row.unit ? ` ${row.unit}` : ""}</span>
              </div>
              <div class="compare-track">
                <div class="compare-fill ${row.actual > row.target ? "over" : ""}" style="width:${actualWidth}%"></div>
                <i class="compare-target" style="left:${targetPosition}%"></i>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function renderInfoCardsPanel(title, items) {
  return `
    <section class="panel workspace-panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">信息卡片</p>
          <h3>${title}</h3>
        </div>
      </div>
      <div class="info-card-list">
        ${items.map((item) => `
          <div class="info-card ${item.tone ? `tone-${item.tone}` : ""}">
            <strong>${item.title}</strong>
            <p>${item.copy}</p>
            ${item.value ? `<div class="info-emphasis">${item.value}</div>` : ""}
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function renderProductFootprintPanel(title, product) {
  return `
    <section class="panel workspace-panel product-footprint-panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">核算对象</p>
          <h3>${title}</h3>
        </div>
      </div>
      <div class="product-footprint-hero">
        <div>
          <span>${product.name}</span>
          <strong>${shared.formatNumber(product.unitFootprintKg, 3)} kg CO₂e/${product.unit}</strong>
          <p>${product.boundary}</p>
        </div>
        <div class="product-footprint-meta">
          <span>核算产出 ${shared.formatNumber(product.outputCount, 0)} ${product.unit}</span>
          <span>总足迹 ${shared.formatNumber(product.totalCarbonTons, 3)} t CO₂e</span>
          <span>覆盖率 ${shared.formatPercent(product.coverage)}</span>
        </div>
      </div>
    </section>
  `;
}

function renderFootprintReportPanel(title, product, coverage) {
  const ready = coverage >= 0.75;
  const items = [
    {
      title: "产品碳足迹说明书",
      copy: `${product.name} 已形成单位足迹、阶段拆分、热点环节和方案对比。`,
      action: "生成说明书",
      type: "download",
      tone: "success"
    },
    {
      title: "打印 / 另存 PDF",
      copy: ready ? "当前数据覆盖度较好，可生成独立报告后打印留档。" : "当前报告可预览，后续建议补齐更多活动数据。",
      action: "打印报告",
      type: "print",
      tone: ready ? "success" : "neutral"
    }
  ];
  return `
    <section class="panel workspace-panel footprint-report-panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">报告输出</p>
          <h3>${title}</h3>
        </div>
      </div>
      <div class="info-card-list">
        ${items.map((item) => `
          <div class="info-card ${item.tone ? `tone-${item.tone}` : ""}">
            <strong>${item.title}</strong>
            <p>${item.copy}</p>
            <button class="secondary-button" type="button" data-footprint-report="${item.type}">${item.action}</button>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function renderVerificationReportPanel(title, items) {
  return `
    <section class="panel workspace-panel verification-report-panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">报告输出</p>
          <h3>${title}</h3>
        </div>
      </div>
      <div class="info-card-list">
        ${items.map((item) => `
          <div class="info-card ${item.tone ? `tone-${item.tone}` : ""}">
            <strong>${item.title}</strong>
            <p>${item.copy}</p>
            <button class="secondary-button" type="button" data-verification-report="${item.type}">${item.action}</button>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function renderDriverPanel(title, items) {
  return `
    <section class="panel workspace-panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">驱动拆解</p>
          <h3>${title}</h3>
        </div>
      </div>
      <div class="driver-list">
        ${items.map((item) => `
          <div class="driver-item">
            <div class="driver-head">
              <strong>${item.rank}. ${item.title}</strong>
              <span>${shared.formatPercent(item.ratio)}</span>
            </div>
            <div class="driver-track">
              <div class="driver-fill" style="width:${Math.min(item.ratio * 100, 100)}%; background:${item.color};"></div>
            </div>
            <p>${item.value} · ${item.note}</p>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function renderScenarioPanel(title, items) {
  return `
    <section class="panel workspace-panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">情景 / 机会</p>
          <h3>${title}</h3>
        </div>
      </div>
      <div class="scenario-grid">
        ${items.map((item) => `
          <div class="scenario-card ${item.tone ? `tone-${item.tone}` : ""}">
            <strong>${item.title}</strong>
            ${item.value ? `<div class="scenario-value">${item.value}</div>` : ""}
            <p>${item.note || item.copy}</p>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function renderBudgetReportPanel(title, items) {
  return `
    <section class="panel workspace-panel budget-report-panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">报表输出</p>
          <h3>${title}</h3>
        </div>
      </div>
      <div class="info-card-list">
        ${items.map((item) => `
          <div class="info-card ${item.tone ? `tone-${item.tone}` : ""}">
            <strong>${item.title}</strong>
            <p>${item.copy}</p>
            <button class="secondary-button" type="button" data-budget-export="${item.type}">${item.action}</button>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function renderFlowPanel(title, items, total, unit = "kWh") {
  const safeTotal = Math.max(Number(total || 0), 1);
  return `
    <section class="panel workspace-panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">能流结构</p>
          <h3>${title}</h3>
        </div>
      </div>
      <div class="flow-board">
        <div class="flow-source">
          <span>输入能量</span>
          <strong>${shared.formatNumber(total, 0)} ${unit}</strong>
          <p>当前筛选范围的能源输入。</p>
        </div>
        <div class="flow-lanes">
          ${items.map((item) => `
            <div class="flow-lane">
              <div class="flow-copy">
                <strong>${item.label}</strong>
                <p>${item.note}</p>
              </div>
              <div class="flow-track">
                <div class="flow-fill" style="width:${Math.min(item.value / safeTotal, 1) * 100}%; background:${item.color};"></div>
              </div>
              <div class="flow-value">${shared.formatNumber(item.value, 0)} ${unit}</div>
            </div>
          `).join("")}
        </div>
      </div>
    </section>
  `;
}

function renderSankeyPanel(title, data) {
  if (!data || data.nodes.length === 0) {
    return `<section class="panel workspace-panel"><div class="empty-state">暂无能流拓扑数据。</div></section>`;
  }
  const width = 760;
  const height = 360;
  const links = data.links.map((link) => {
    const source = data.nodes.find((node) => node.id === link.source);
    const target = data.nodes.find((node) => node.id === link.target);
    if (!source || !target) {
      return "";
    }
    const x1 = source.x + source.width;
    const y1 = source.y + source.height * link.sourceOffset;
    const x2 = target.x;
    const y2 = target.y + target.height * link.targetOffset;
    const mid = (x1 + x2) / 2;
    const strokeWidth = Math.max(2, Math.min(26, link.width));
    return `
      <path class="sankey-link" d="M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}" stroke="${link.color}" stroke-width="${strokeWidth}"></path>
    `;
  }).join("");
  const nodes = data.nodes.map((node) => `
    <g class="sankey-node">
      <rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" rx="12" fill="${node.color}"></rect>
      <text x="${node.x + 12}" y="${node.y + 20}">${node.label}</text>
      <text class="sankey-node-value" x="${node.x + 12}" y="${node.y + node.height - 12}">${node.valueLabel}</text>
    </g>
  `).join("");

  return `
    <section class="panel workspace-panel sankey-panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">能流拓扑</p>
          <h3>${title}</h3>
        </div>
      </div>
      <div class="sankey-host">
        <svg class="sankey-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${title}">
          ${links}
          ${nodes}
        </svg>
      </div>
      <div class="sankey-caption">
        <span>输入 ${shared.formatNumber(data.totalValue, 1)} ${data.unit}</span>
        <span>疑似损耗 ${shared.formatPercent(data.lossRate)}</span>
        <span>${data.nodes.length} 个节点 / ${data.links.length} 条流向</span>
      </div>
    </section>
  `;
}

function renderStackedBalancePanel(title, items) {
  return `
    <section class="panel workspace-panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">平衡结构</p>
          <h3>${title}</h3>
        </div>
      </div>
      <div class="stacked-bar">
        ${items.map((item) => `
          <div class="stack-piece" style="width:${item.value}%; background:${item.color};">
            <span>${item.label}</span>
            <strong>${item.value} %</strong>
          </div>
        `).join("")}
      </div>
      <div class="stack-legend">
        ${items.map((item) => `
          <span class="legend-inline"><i class="legend-swatch" style="background:${item.color};"></i>${item.label}</span>
        `).join("")}
      </div>
    </section>
  `;
}

function renderBeforeAfterPanel(title, groups) {
  return `
    <section class="panel workspace-panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">前后对比</p>
          <h3>${title}</h3>
        </div>
      </div>
      <div class="before-after-board">
        ${groups.map((group) => `
          <div class="before-after-item">
            <strong>${group.name}</strong>
            <div class="stacked-bar compact">
              ${group.items.map((item) => `
                <div class="stack-piece" style="width:${item.value}%; background:${item.color};">
                  <span>${item.label}</span>
                  <strong>${item.value} %</strong>
                </div>
              `).join("")}
            </div>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function renderBoundaryPanel(title, items) {
  return `
    <section class="panel workspace-panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">边界视图</p>
          <h3>${title}</h3>
        </div>
      </div>
      <div class="boundary-grid">
        ${items.map((item) => `
          <div class="boundary-item ${item.tone ? `tone-${item.tone}` : ""}">
            <div class="boundary-head">
              <strong>${item.title}</strong>
              <span class="pill ${item.tone ? `pill-${item.tone}` : ""}">${item.status}</span>
            </div>
            ${item.value ? `<div class="boundary-value">${item.value}</div>` : ""}
            <p>${item.copy}</p>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function renderTablePanel(title, headers, rows) {
  return `
    <section class="panel workspace-panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">表格视图</p>
          <h3>${title}</h3>
        </div>
      </div>
      <div class="table-shell">
        <div class="table-row head">
          ${headers.map((header) => `<span>${header}</span>`).join("")}
        </div>
        ${rows.map((row) => `
          <div class="table-row">
            ${row.map((cell) => `<span>${cell}</span>`).join("")}
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function renderRiskMatrixPanel(title, suppliers) {
  return `
    <section class="panel workspace-panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">风险矩阵</p>
          <h3>${title}</h3>
        </div>
      </div>
      <div class="risk-matrix">
        <div class="risk-axis risk-axis-x">采购占比</div>
        <div class="risk-axis risk-axis-y">碳强度</div>
        <div class="risk-grid"></div>
        ${suppliers.map((item) => `
          <div class="risk-bubble" style="left:${20 + item.spend * 3.2}%; top:${88 - item.intensity * 100}%; background:${item.color};">
            <span>${item.name}</span>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function renderStepPanel(title, steps) {
  return `
    <section class="panel workspace-panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">流程状态</p>
          <h3>${title}</h3>
        </div>
      </div>
      <div class="step-chain">
        ${steps.map((item) => `
          <div class="step-item ${item.tone ? `tone-${item.tone}` : ""}">
            <div class="step-top">
              <strong>${item.title}</strong>
              <span class="pill ${item.tone ? `pill-${item.tone}` : ""}">${item.status}</span>
            </div>
            <p>${item.copy}</p>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function renderProjectPanel(title, items) {
  return `
    <section class="panel workspace-panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">项目管线</p>
          <h3>${title}</h3>
        </div>
      </div>
      <div class="project-list">
        ${items.map((item) => `
          <div class="project-item">
            <div class="project-head">
              <strong>${item.title}</strong>
              <span>${item.stage}</span>
            </div>
            <div class="project-meta">
              <span>减排 ${item.reduction}</span>
              <span>收益 ${item.value}</span>
            </div>
            <div class="compare-track">
              <div class="compare-fill" style="width:${item.progress}%;"></div>
            </div>
            <p>${item.copy}</p>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function renderLineChartMarkup(period, mode) {
  if (period.points.length === 0) {
    return `<div class="empty-state">暂无趋势数据</div>`;
  }

  if (period.points.length === 1) {
    return renderSinglePointChartMarkup(period.points[0], mode, period.label);
  }

  const width = 720;
  const height = 310;
  const padding = { top: 20, right: 18, bottom: 46, left: 54 };
  const maxValue = Math.max(
    ...period.points.map((item) => item[mode.valueKey]),
    ...period.points.map((item) => item[mode.budgetKey]),
    1
  );
  const graphHeight = height - padding.top - padding.bottom;
  const graphWidth = width - padding.left - padding.right;
  const stepX = period.points.length > 1 ? graphWidth / (period.points.length - 1) : graphWidth;

  const scaleX = (index) => padding.left + stepX * index;
  const scaleY = (value) => padding.top + graphHeight - (value / (maxValue * 1.1)) * graphHeight;

  const actualPolyline = period.points.map((item, index) => `${scaleX(index)},${scaleY(item[mode.valueKey])}`).join(" ");
  const budgetPolyline = period.points.map((item, index) => `${scaleX(index)},${scaleY(item[mode.budgetKey])}`).join(" ");

  const gridLines = Array.from({ length: 5 }, (_, index) => {
    const value = (maxValue * 1.1 / 4) * index;
    const y = scaleY(value);
    return `
      <line class="line-grid" x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}"></line>
      <text x="${padding.left - 8}" y="${y + 4}" text-anchor="end" fill="#75807a" font-size="11">${formatAxisValue(value, mode.unit)}</text>
    `;
  }).join("");

  const labels = period.points.map((item, index) => {
    const skip = period.points.length > 16 ? 2 : 1;
    if (index % skip !== 0 && index !== period.points.length - 1) {
      return "";
    }
    return `<text x="${scaleX(index)}" y="${height - 16}" text-anchor="middle" fill="#75807a" font-size="11">${item.label}</text>`;
  }).join("");

  const circles = period.points.map((item, index) => `
    <circle class="${item[mode.valueKey] > item[mode.budgetKey] ? "point-danger" : "point-success"}" cx="${scaleX(index)}" cy="${scaleY(item[mode.valueKey])}" r="4.2"></circle>
  `).join("");

  return `
    <div class="chart-host">
      <svg class="line-chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${period.label}">
        ${gridLines}
        <line class="line-axis" x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}"></line>
        <polyline class="budget-path" points="${budgetPolyline}"></polyline>
        <polyline class="line-path" points="${actualPolyline}"></polyline>
        ${circles}
        ${labels}
      </svg>
      <div class="chart-caption">
        <span class="legend-inline"><i class="legend-swatch" style="background:#275847;"></i>实际值</span>
        <span class="legend-inline"><i class="legend-swatch" style="background:#b4834b;"></i>预算 / 基准</span>
        <span class="legend-inline"><i class="legend-swatch" style="background:#c45444;"></i>超标点</span>
        <span class="legend-inline"><i class="legend-swatch" style="background:#2f8b5d;"></i>达标点</span>
        <span class="legend-inline">${mode.unit}</span>
      </div>
    </div>
  `;
}

function renderSinglePointChartMarkup(point, mode, periodLabel) {
  const actual = Number(point[mode.valueKey] || 0);
  const budget = Number(point[mode.budgetKey] || 0);
  const maxValue = Math.max(actual, budget, 1);
  const actualWidth = getBarWidth(actual, maxValue);
  const budgetWidth = getBarWidth(budget, maxValue);
  const overBudget = budget > 0 && actual > budget;
  const gap = actual - budget;
  const gapCopy = budget > 0
    ? `${overBudget ? "高于" : "低于"}预算 / 基准 ${formatChartValue(Math.abs(gap), mode.unit)}`
    : "暂无预算 / 基准";

  return `
    <div class="chart-host single-point-chart">
      <div class="single-chart-head">
        <span>${point.bucket || periodLabel}</span>
        <strong class="${overBudget ? "status-danger" : "status-success"}">${formatChartValue(actual, mode.unit)}</strong>
        <p>${gapCopy}</p>
      </div>
      <div class="single-bar-list">
        <div class="single-bar-row">
          <div class="single-bar-label">
            <strong>实际值</strong>
            <span>${formatChartValue(actual, mode.unit)}</span>
          </div>
          <div class="single-bar-track">
            <i class="single-bar-fill ${overBudget ? "tone-danger" : "tone-success"}" style="width:${actualWidth}%;"></i>
          </div>
        </div>
        <div class="single-bar-row">
          <div class="single-bar-label">
            <strong>预算 / 基准</strong>
            <span>${formatChartValue(budget, mode.unit)}</span>
          </div>
          <div class="single-bar-track">
            <i class="single-bar-fill tone-budget" style="width:${budgetWidth}%;"></i>
          </div>
        </div>
      </div>
      <div class="chart-caption">
        <span class="legend-inline"><i class="legend-swatch" style="background:${overBudget ? "#c45444" : "#2f8b5d"};"></i>实际值</span>
        <span class="legend-inline"><i class="legend-swatch" style="background:#b4834b;"></i>预算 / 基准</span>
        <span class="legend-inline">${mode.unit}</span>
      </div>
    </div>
  `;
}

function getBarWidth(value, maxValue) {
  if (value <= 0) {
    return 0;
  }
  return Math.max((value / maxValue) * 100, 4);
}

function renderPieChartMarkup(pieData) {
  const total = pieData.items.reduce((sum, item) => sum + item.value, 0);
  const positiveItems = pieData.items.filter((item) => item.value > 0);
  const cx = 110;
  const cy = 110;
  const outerRadius = 78;
  const innerRadius = 48;
  let angleCursor = -90;

  const arcs = pieData.items.map((item) => {
    if (positiveItems.length === 1 && item.value > 0) {
      return `<circle cx="${cx}" cy="${cy}" r="${(outerRadius + innerRadius) / 2}" fill="none" stroke="${item.color}" stroke-width="${outerRadius - innerRadius}"></circle>`;
    }
    const angle = total === 0 ? 0 : (item.value / total) * 360;
    const path = describeArc(cx, cy, outerRadius, innerRadius, angleCursor, angleCursor + angle);
    angleCursor += angle;
    return `<path d="${path}" fill="${item.color}"></path>`;
  }).join("");

  return `
    <div class="pie-layout">
      <svg class="pie-chart-svg" viewBox="0 0 220 220" role="img" aria-label="${pieData.title}">
        ${arcs}
        <circle cx="${cx}" cy="${cy}" r="${innerRadius}" fill="#fffdfa"></circle>
        <text class="pie-total-label" x="${cx}" y="${cy - 8}" text-anchor="middle">${pieData.centerLabel}</text>
        <text class="pie-total" x="${cx}" y="${cy + 18}" text-anchor="middle">${shared.formatPieValue(total, pieData.unit)}</text>
      </svg>
      <div class="pie-legend">
        ${pieData.items.map((item) => {
          const share = total === 0 ? 0 : item.value / total;
          return `
            <div class="legend-row">
              <i class="legend-swatch" style="background:${item.color};"></i>
              <div>
                <strong>${item.label}</strong>
                <span>${item.note}</span>
              </div>
              <div class="legend-value">${shared.formatPieValue(item.value, pieData.unit)}<br><span>${shared.formatPercent(share)}</span></div>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

function buildOpportunityCards() {
  return [
    { title: "夏季空调优化", value: `${shared.formatNumber(shared.DATA.insights.savingPotentialKWh * 0.45, 0)} kWh/年`, note: "通过温控、分区和时段管理削峰。", tone: "success" },
    { title: "尾峰压降", value: `${shared.formatNumber(shared.DATA.insights.savingPotentialKWh * 0.22, 0)} kWh/年`, note: "针对加班尾峰和会议室晚间占用。", tone: "neutral" },
    { title: "周末待机治理", value: `${shared.formatNumber(shared.DATA.insights.savingPotentialKWh * 0.18, 0)} kWh/年`, note: "优先针对打印、茶水和插座设备。", tone: "neutral" },
    { title: "照明策略优化", value: `${shared.formatNumber(shared.DATA.insights.savingPotentialKWh * 0.15, 0)} kWh/年`, note: "适合和时段策略联动。", tone: "neutral" }
  ];
}

function buildFootprintLayers(context, unitFootprintKg) {
  return [
    { title: "产品 / 服务单元", status: "已建立", value: `${shared.formatNumber(unitFootprintKg, 3)} kg CO₂e/工位日`, copy: "以工位日作为当前可计量的服务产品。", tone: "success" },
    { title: "生命周期阶段", status: "已拆分", value: "5 个阶段", copy: "覆盖原材料、运输、运营、使用和废弃阶段。", tone: "success" },
    { title: "活动数据", status: "已纳入", value: `${shared.formatNumber(context.period.totalCarbon, 2)} t CO₂e`, copy: "能源活动数据作为运营阶段核心来源。", tone: "success" },
    { title: "扩展凭证", status: "待完善", value: "采购 / 物流 / 废弃", copy: "可继续接入采购、物流和废弃物凭证。", tone: "neutral" }
  ];
}

function buildDemoLifecycleStages(context) {
  return normalizeLifecycleStages([
    { name: "原材料阶段", carbonTons: context.period.totalCarbon * 0.18, status: "估算", tone: "neutral" },
    { name: "运输阶段", carbonTons: context.period.totalCarbon * 0.06, status: "估算", tone: "neutral" },
    { name: "运营生产阶段", carbonTons: context.period.totalCarbon, status: "已核算", tone: "success" },
    { name: "使用阶段", carbonTons: context.period.totalCarbon * 0.08, status: "估算", tone: "neutral" },
    { name: "废弃阶段", carbonTons: context.period.totalCarbon * 0.03, status: "估算", tone: "neutral" }
  ]);
}

function buildDemoProductFootprintModel(context, stages, coverage) {
  const totalCarbonTons = stages.reduce((sum, stage) => sum + stage.carbonTons, 0);
  const outputCount = Math.max(shared.OFFICE.staff * getDemoPeriodDayCount(context), 1);
  return {
    name: "工位日服务",
    unit: "工位日",
    outputCount,
    totalCarbonTons,
    unitFootprintKg: safeDivide(totalCarbonTons * 1000, outputCount),
    coverage,
    boundary: "以办公服务为核算对象，当前重点纳入能源活动数据，并对上下游阶段做管理估算。"
  };
}

function getDemoPeriodDayCount(context) {
  if (context.options.view === "year") {
    return shared.DATA.records.length;
  }
  if (context.options.view === "month") {
    return context.period.points.length;
  }
  return 1;
}

function normalizeLifecycleStages(stages) {
  const total = stages.reduce((sum, stage) => sum + Number(stage.carbonTons || 0), 0);
  return stages
    .map((stage) => ({
      ...stage,
      carbonTons: Number(stage.carbonTons || 0),
      share: safeDivide(stage.carbonTons, total)
    }))
    .sort((a, b) => b.carbonTons - a.carbonTons);
}

function buildLifecyclePieData(stages) {
  const colors = ["#2f6b56", "#6aa383", "#a8793d", "#d2b06b", "#cf7458"];
  return {
    title: "生命周期阶段拆分",
    unit: "t CO₂e",
    centerLabel: "足迹",
    items: stages.map((stage, index) => ({
      label: stage.name,
      value: Math.max(stage.carbonTons, 0.001),
      color: colors[index % colors.length],
      note: `${stage.status} · ${shared.formatPercent(stage.share)}`
    }))
  };
}

function buildLifecycleTableRows(stages) {
  return stages.map((stage) => [
    stage.name,
    `${shared.formatNumber(stage.carbonTons, 4)} t CO₂e`,
    shared.formatPercent(stage.share),
    stage.status
  ]);
}

function buildFootprintHotspotCards(stages) {
  const [top, second] = stages;
  const material = stages.find((stage) => stage.name.includes("原材料")) || second || top;
  return [
    {
      title: "最高排放环节",
      copy: top ? `${top.name} 贡献 ${shared.formatPercent(top.share)}，是当前优先优化对象。` : "当前暂无生命周期数据。",
      tone: top && top.share > 0.5 ? "danger" : "neutral"
    },
    {
      title: "材料贡献",
      copy: material ? `${material.name} 排放 ${shared.formatNumber(material.carbonTons, 4)} t CO₂e。` : "材料阶段等待补充。",
      tone: material && material.share > 0.2 ? "danger" : "neutral"
    },
    {
      title: "边界完整性",
      copy: stages.some((stage) => stage.status === "估算") ? "部分阶段为估算口径，报告中需要标注数据来源。" : "当前阶段均已形成核算结果。",
      tone: stages.some((stage) => stage.status === "估算") ? "neutral" : "success"
    }
  ];
}

function buildFootprintScenarioCards(product) {
  const current = product.unitFootprintKg;
  const materialOptimized = current * 0.88;
  const logisticsOptimized = current * 0.94;
  const combinedOptimized = current * 0.78;
  return [
    {
      title: "基准方案",
      value: `${shared.formatNumber(current, 3)} kg/${product.unit}`,
      note: "作为报告基准方案。",
      tone: "neutral"
    },
    {
      title: "材料优化方案",
      value: `${shared.formatNumber(materialOptimized, 3)} kg/${product.unit}`,
      note: `预计降低 ${shared.formatPercent(safeDivide(current - materialOptimized, current))}。`,
      tone: "success"
    },
    {
      title: "综合优化方案",
      value: `${shared.formatNumber(combinedOptimized, 3)} kg/${product.unit}`,
      note: `预计降低 ${shared.formatPercent(safeDivide(current - combinedOptimized, current))}，优先级最高。`,
      tone: "success"
    },
    {
      title: "运输优化",
      value: `${shared.formatNumber(logisticsOptimized, 3)} kg/${product.unit}`,
      note: `预计降低 ${shared.formatPercent(safeDivide(current - logisticsOptimized, current))}。`,
      tone: "neutral"
    }
  ];
}

function buildVerificationSources() {
  return [
    ["办公电表", "日", "已同步", "原始用电数据自动采集"],
    ["天然气记录", "月", "待接入", "可接入燃气表或燃气账单"],
    ["外购热力记录", "月", "待接入", "可接入热力表或热力账单"],
    ["采购台账", "月", "待复核", "用于扩展供应链和足迹核算"],
    ["数据来源记录", "按需", "已登记", "记录自动采集、导入和手工录入来源"]
  ];
}

function buildDemoVerificationBoundaryRows(context) {
  return [
    ["组织边界", "已纳入", shared.PLATFORM.sites[0]?.label || "当前组织"],
    ["区域边界", "已纳入", "总部办公区、会议区、设备间和公共区域"],
    ["能源边界", "已纳入", shared.getEnergyTypeLabel(context.options.energyType)],
    ["扩展活动", "待完善", "差旅、采购和废弃物作为扩展边界维护"]
  ];
}

function buildDemoVerificationFactorRows() {
  return [
    ["电力", `${shared.OFFICE.gridFactor} kg CO₂e/kWh`, `${shared.OFFICE.year}`, "已锁定"],
    ["天然气", "2.162 kg CO₂e/m³", `${shared.OFFICE.year}`, "待启用"],
    ["热力 / 蒸汽", "110 kg CO₂e/GJ", `${shared.OFFICE.year}`, "待启用"],
    ["自来水", "0.168 kg CO₂e/m³", `${shared.OFFICE.year}`, "待启用"]
  ];
}

function buildDemoEvidenceRows(context) {
  const year = getActiveYear();
  return [
    ["电费单", "办公电表", "已归档", `${year} 年度电费凭证已登记`],
    ["燃气单", "天然气记录", "待补充", "等待燃气活动数据接入"],
    ["热力账单", "外购热力记录", "待补充", "等待热力活动数据接入"],
    ["Excel 原始数据", "日电表数据", "已归档", `${context.period.points.length} 个时间点可追溯`],
    ["检测报告", "表计校准", "待复核", "用于支撑表计准确性说明"]
  ];
}

function buildDemoAuditRows(context) {
  return [
    ["2026-04-15 19:42", "admin", "日电表数据", `同步 ${context.period.points.length} 个时间点`],
    ["2026-04-15 19:40", "admin", "排放因子", "确认电力因子版本"],
    ["2026-04-15 19:35", "admin", "核算边界", "更新办公区边界说明"],
    ["2026-04-15 19:30", "system", "报表任务", "生成核查工作台视图"]
  ];
}

function buildVerificationReportCards(totalCarbon, quality) {
  const complete = Number(quality.completeness || 0);
  const traceability = Number(quality.traceability || 0);
  return [
    {
      title: "温室气体排放报告",
      copy: `${shared.formatNumber(totalCarbon, 3)} t CO₂e 已纳入报告摘要。`,
      action: "生成报告",
      type: "summary",
      tone: complete >= 0.8 ? "success" : "neutral"
    },
    {
      title: "数据汇总表",
      copy: `完整率 ${shared.formatPercent(complete)}，可导出台账 CSV。`,
      action: "导出台账",
      type: "ledger",
      tone: complete >= 0.8 ? "success" : "neutral"
    },
    {
      title: "年度核算报表",
      copy: `追溯覆盖率 ${shared.formatPercent(traceability)}，用于年度留档。`,
      action: "打开报表",
      type: "annual",
      tone: traceability >= 0.85 ? "success" : "neutral"
    }
  ];
}

function buildVerificationSteps() {
  return [
    { title: "活动数据采集", status: "已完成", copy: "日电表数据已生成并留存时间戳。", tone: "success" },
    { title: "口径与因子锁定", status: "已完成", copy: "当前排放因子与预算口径已固定。", tone: "success" },
    { title: "凭证对应", status: "进行中", copy: "采购与票据证据链已建立，部分仍待复核。", tone: "neutral" },
    { title: "第三方核查准备", status: "待完成", copy: "待补录供应链问卷和扩展边界凭证。", tone: "danger" }
  ];
}

function buildAssetScenarios() {
  const gap = Math.max(shared.DATA.annual.carbon - shared.OFFICE.carbonBudgetTons, 0);
  return [
    { title: "低碳价", value: `¥${shared.formatNumber(gap * 58, 0)}`, note: "按 58 元/吨估算的超额成本。", tone: "neutral" },
    { title: "基准碳价", value: `¥${shared.formatNumber(gap * shared.OFFICE.carbonPrice, 0)}`, note: "按基准碳价估算。", tone: "success" },
    { title: "高碳价", value: `¥${shared.formatNumber(gap * 108, 0)}`, note: "高碳价场景下，缺口成本会明显抬升。", tone: "danger" }
  ];
}

function buildProjectPipeline() {
  return [
    { title: "空调群控优化", stage: "方案设计", reduction: "1.08 t CO₂e", value: "¥5,600/年", progress: 35, copy: "优先处理夏季高峰和会议区负荷波动。" },
    { title: "待机治理专项", stage: "快速落地", reduction: "0.54 t CO₂e", value: "¥2,400/年", progress: 62, copy: "主要针对插座、打印和茶水设备的夜间待机。" },
    { title: "照明与感应联动", stage: "储备项目", reduction: "0.32 t CO₂e", value: "¥1,700/年", progress: 18, copy: "适合做为第二阶段的节能与减排动作。" }
  ];
}

function getDatabaseRequestKey() {
  const range = getDatabaseRange();
  return [
    state.moduleId,
    state.view,
    state.databaseYear,
    state.monthIndex,
    state.databaseDateKey,
    state.databaseAreaId,
    state.energyType,
    range.groupBy,
    range.from,
    range.to
  ].join("|");
}

function getDatabaseRange() {
  const year = state.databaseYear;
  if (state.view === "year") {
    return {
      groupBy: "month",
      from: `${year}-01-01`,
      to: `${year}-12-31 23:59:59`
    };
  }
  if (state.view === "month") {
    const month = state.monthIndex + 1;
    const lastDay = new Date(year, month, 0).getDate();
    return {
      groupBy: "day",
      from: `${year}-${pad2(month)}-01`,
      to: `${year}-${pad2(month)}-${pad2(lastDay)} 23:59:59`
    };
  }
  return {
    groupBy: "hour",
    from: state.databaseDateKey,
    to: `${state.databaseDateKey} 23:59:59`
  };
}

function getDatabaseStatusText(hasData) {
  if (dbState.loading) {
    return "正在更新数据。";
  }
  if (dbState.error) {
    return "数据服务暂不可用。";
  }
  return hasData ? "当前选择下已有记录。" : "当前选择下暂无记录。";
}

function getDataUpdatedAtText(fallback) {
  if (!isDatabaseModule()) {
    return fallback;
  }
  if (dbState.loading) {
    return "正在更新";
  }
  if (!dbState.lastUpdatedAt) {
    return "待更新";
  }
  return formatLocalDateTime(dbState.lastUpdatedAt);
}

function formatLocalDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "待更新";
  }
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  const hour = pad2(date.getHours());
  const minute = pad2(date.getMinutes());
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

function getBudgetPerPoint(annualBudget, range) {
  if (range.groupBy === "month") {
    return annualBudget / 12;
  }
  if (range.groupBy === "hour") {
    return annualBudget / 365 / 24;
  }
  const fromDate = new Date(range.from.slice(0, 10));
  const toDate = new Date(range.to.slice(0, 10));
  const days = Math.max(Math.round((toDate - fromDate) / 86400000) + 1, 1);
  if (state.view === "day") {
    return annualBudget / 365;
  }
  return annualBudget / 365;
}

function formatBucketLabel(bucket, groupBy) {
  const normalized = normalizeBucket(bucket);
  if (groupBy === "hour") {
    return `${Number(normalized.slice(11, 13) || 0)}:00`;
  }
  if (groupBy === "month") {
    return `${Number(normalized.slice(5, 7))}月`;
  }
  if (groupBy === "year") {
    return normalized.slice(0, 4);
  }
  return `${Number(normalized.slice(8, 10))}日`;
}

function normalizeBucket(bucket) {
  if (!bucket) {
    return "";
  }
  const value = String(bucket).replace("T", " ");
  return value.length >= 13 ? value.slice(0, 13) : value.slice(0, 10);
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function metric(label, value, note, danger) {
  return {
    label,
    value,
    note,
    statusClass: danger ? "status-danger" : "status-success"
  };
}

function buildDatabaseMetrics(database) {
  const period = database.period;
  const readingCount = period.points.reduce((sum, item) => sum + item.readingCount, 0);
  return [
    metric("记录数", `${readingCount} 条`, "当前选择下纳入统计的读数。", false),
    metric("最低点", database.lowPoint.label, `${shared.formatNumber(database.lowPoint.value, 1)} ${period.unit}`, false),
    metric("预算线", `${shared.formatNumber(period.budgetKWh, 1)} ${period.unit}`, "按区域年度预算拆分得到。", false),
    metric("数据状态", database.hasData ? "已同步" : "暂无", "按当前选择统计。", !database.hasData)
  ];
}

function buildDatabaseCarbonMetrics(database, scope, intensity, perCapitaCarbon) {
  const period = database.period;
  const outputValue = getCarbonManagementOutputValue(scope);
  const outputIntensity = safeDivide(period.totalCarbon * 1000, outputValue);
  return [
    metric("单位面积碳排", `${shared.formatNumber(intensity, 5)} t CO₂e/m²`, "用于楼宇、园区和区域横向比较。", false),
    metric("单位人数碳排", `${shared.formatNumber(perCapitaCarbon, 4)} t CO₂e/人`, `${scope.staffLabel} 参与折算。`, false),
    metric("单位产值碳排", `${shared.formatNumber(outputIntensity, 3)} kg CO₂e/万元`, "按管理产值口径折算。", false),
    metric("碳预算强度", `${shared.formatNumber(safeDivide(period.budgetCarbon, scope.floorArea), 5)} t CO₂e/m²`, "用于判断当前强度是否贴近预算线。", period.totalCarbon > period.budgetCarbon)
  ];
}

function buildDatabaseCarbonEnergyRows(database, standardEnergy) {
  const rows = standardEnergy.rows.length > 0
    ? standardEnergy.rows
    : [{
      label: shared.getEnergyTypeLabel(state.energyType),
      unit: database.period.unit,
      amount: database.period.totalKWh,
      carbonTons: database.period.totalCarbon,
      factor: getEnergyConversionFactor(state.energyType)
    }];
  const totalCarbon = Math.max(standardEnergy.totalCarbonTons || database.period.totalCarbon, 0);
  return rows.slice(0, 8).map((row) => {
    const amount = Number(row.amount || 0);
    const carbonTons = Number(row.carbonTons || 0);
    const factor = amount > 0 ? (carbonTons * 1000) / amount : Number(row.factor?.carbonKgPerUnit || 0);
    return [
      row.label,
      `${shared.formatNumber(amount, 3)} ${formatDisplayUnit(row.unit || row.factor?.unit)}`,
      `${shared.formatNumber(factor, 4)} kg CO₂e/${formatDisplayUnit(row.unit || row.factor?.unit)}`,
      `${shared.formatNumber(carbonTons, 4)} t CO₂e`,
      shared.formatPercent(safeDivide(carbonTons, totalCarbon))
    ];
  });
}

function buildDatabaseCarbonEnergyPieData(database, standardEnergy) {
  const items = standardEnergy.rows.map((row) => ({
    label: row.label,
    value: Math.max(Number(row.carbonTons || 0), 0.001),
    color: ENERGY_TYPE_COLORS[row.code] || ENERGY_TYPE_COLORS.combined,
    note: `${shared.formatNumber(row.amount, 2)} ${formatDisplayUnit(row.unit)}`
  }));
  return {
    title: "分能源类型碳排结构",
    unit: "t CO₂e",
    centerLabel: "碳排",
    items: items.length > 0 ? items : [{
      label: shared.getEnergyTypeLabel(state.energyType),
      value: Math.max(database.period.totalCarbon, 0.001),
      color: ENERGY_TYPE_COLORS[state.energyType] || ENERGY_TYPE_COLORS.electricity,
      note: "当前筛选口径"
    }]
  };
}

function buildDatabaseCarbonAreaRows(database, areaTotals, scope) {
  const scale = getDatabasePeriodBudgetScale(database);
  const rowsSource = areaTotals.length > 0
    ? areaTotals
    : (scope.areas.length > 0 ? scope.areas : [{
      name: getSelectedAreaLabel(database),
      floor_area_m2: scope.floorArea,
      annual_budget_kwh: scope.annualBudget,
      grid_emission_factor: shared.OFFICE.gridFactor,
      carbon: database.period.totalCarbon
    }]).map((area) => ({
      name: area.name,
      floorArea: Number(area.floor_area_m2 || scope.floorArea),
      annualBudget: Number(area.annual_budget_kwh || scope.annualBudget),
      carbon: Number(area.carbon || 0),
      value: 0,
      share: 0,
      factor: Number(area.grid_emission_factor || shared.OFFICE.gridFactor)
    }));
  const totalCarbon = Math.max(database.period.totalCarbon, rowsSource.reduce((sum, row) => sum + Number(row.carbon || 0), 0), 0);
  return rowsSource.slice(0, 8).map((area) => {
    const carbon = Number(area.carbon || 0);
    const floorArea = Number(area.floorArea || area.floor_area_m2 || 0);
    const factor = Number(area.factor || area.grid_emission_factor || shared.OFFICE.gridFactor);
    const annualBudget = Number(area.annualBudget || area.annual_budget_kwh || 0);
    const carbonBudget = annualBudget > 0
      ? annualBudget * scale * factor / 1000
      : safeDivide(database.period.budgetCarbon, Math.max(rowsSource.length, 1));
    const rate = safeDivide(carbon, carbonBudget);
    const status = rate > 1 ? "高于预算" : rate >= 0.9 ? "接近预算" : "预算内";
    return [
      area.name,
      `${shared.formatNumber(carbon, 4)} t CO₂e`,
      `${shared.formatNumber(safeDivide(carbon, floorArea), 5)} t CO₂e/m²`,
      shared.formatPercent(safeDivide(carbon, totalCarbon)),
      status
    ];
  });
}

function buildDatabaseCarbonTrendCards(database) {
  const points = database.period.points;
  if (points.length < 2) {
    return [
      { title: "趋势方向", copy: "当前时间范围内数据点较少，先展示本期核算结果。", tone: "neutral" },
      { title: "预算线", copy: `${database.overBudgetCount} 个时间点高于碳预算线。`, tone: database.overBudgetCount > 0 ? "danger" : "success" },
      { title: "峰值排放", copy: `${database.peakPoint.label} 为当前峰值点。`, tone: "neutral" }
    ];
  }
  const first = points[0];
  const last = points[points.length - 1];
  const changeRate = safeDivide(last.carbon - first.carbon, first.carbon);
  const firstHalf = points.slice(0, Math.ceil(points.length / 2));
  const secondHalf = points.slice(Math.ceil(points.length / 2));
  const firstAvg = safeDivide(firstHalf.reduce((sum, point) => sum + point.carbon, 0), firstHalf.length);
  const secondAvg = safeDivide(secondHalf.reduce((sum, point) => sum + point.carbon, 0), Math.max(secondHalf.length, 1));
  const avgChange = safeDivide(secondAvg - firstAvg, firstAvg);
  const peak = points.reduce((best, point) => point.carbon > best.carbon ? point : best, points[0]);
  return [
    {
      title: "趋势方向",
      copy: `${last.label} 较 ${first.label} ${changeRate >= 0 ? "上升" : "下降"} ${shared.formatPercent(Math.abs(changeRate))}。`,
      tone: changeRate > 0.05 ? "danger" : "success"
    },
    {
      title: "阶段均值",
      copy: `后半段均值较前半段 ${avgChange >= 0 ? "上升" : "下降"} ${shared.formatPercent(Math.abs(avgChange))}。`,
      tone: avgChange > 0.05 ? "danger" : "success"
    },
    {
      title: "峰值排放",
      copy: `${peak.label} 达到 ${shared.formatNumber(peak.carbon, 4)} t CO₂e，${database.overBudgetCount} 个点高于预算线。`,
      tone: database.overBudgetCount > 0 ? "danger" : "neutral"
    }
  ];
}

function buildDatabaseCarbonReductionCards(database) {
  const points = database.period.points;
  const saving = estimateDatabaseCarbonSaving(database);
  const remaining = database.period.budgetCarbon - database.period.totalCarbon;
  const peak = points.length > 0
    ? points.reduce((best, point) => point.carbon > best.carbon ? point : best, points[0])
    : { label: "暂无", carbon: 0 };
  const low = points.length > 0
    ? points.reduce((best, point) => point.carbon < best.carbon ? point : best, points[0])
    : { label: "暂无", carbon: 0 };
  return [
    {
      title: "节能措施减排",
      value: `${shared.formatNumber(saving, 4)} t CO₂e`,
      note: "由当前节能潜力按排放因子折算。",
      tone: "success"
    },
    {
      title: "较峰值削减",
      value: `${shared.formatNumber(Math.max(peak.carbon - low.carbon, 0), 4)} t CO₂e`,
      note: `${peak.label} 与 ${low.label} 的排放差额。`,
      tone: "neutral"
    },
    {
      title: "预算剩余额",
      value: `${shared.withSign(remaining)} t CO₂e`,
      note: remaining >= 0 ? "当前仍在碳预算内。" : "需要通过节能或管理动作消化缺口。",
      tone: remaining < 0 ? "danger" : "success"
    }
  ];
}

function getCarbonManagementOutputValue(scope) {
  return Math.max(scope.staffCount * 18, 1);
}

function safeDivide(value, divisor) {
  const normalizedDivisor = Number(divisor || 0);
  if (!Number.isFinite(normalizedDivisor) || normalizedDivisor <= 0) {
    return 0;
  }
  return Number(value || 0) / normalizedDivisor;
}

function parsePercentValue(value) {
  const match = String(value || "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) / 100 : 0;
}

function getDatabaseScopeStats(database) {
  const selectedAreaId = getSelectedDatabaseAreaId();
  const areas = selectedAreaId && database.selectedArea ? [database.selectedArea] : database.areas;
  const floorArea = areas.reduce((sum, area) => sum + Number(area.floor_area_m2 || 0), 0) || shared.OFFICE.area;
  const staffCount = areas.reduce((sum, area) => sum + Number(area.staff_count || 0), 0) || shared.OFFICE.staff;
  const annualBudget = areas.reduce((sum, area) => sum + Number(area.annual_budget_kwh || 0), 0) || shared.OFFICE.annualBudgetKWh;
  return {
    areas,
    areaCount: areas.length,
    floorArea,
    staffCount,
    annualBudget,
    floorAreaLabel: `${shared.formatNumber(floorArea, 0)} m²`,
    staffLabel: `${shared.formatNumber(staffCount, 0)} 人`
  };
}

function getDatabasePeriodBudgetScale(database) {
  const scope = getDatabaseScopeStats(database);
  return scope.annualBudget > 0 ? safeDivide(database.period.budgetKWh, scope.annualBudget) : getBudgetScale(state.view);
}

function getDatabaseCarbonFactor(database) {
  return database.period.totalKWh > 0
    ? (database.period.totalCarbon * 1000) / database.period.totalKWh
    : shared.OFFICE.gridFactor;
}

function estimateDatabaseSavingPotential(database) {
  const overBudget = database.period.points.reduce((sum, point) => sum + Math.max(point.value - point.budget, 0), 0);
  const standbyBase = database.period.totalKWh * 0.05;
  return Math.max(overBudget * 0.42, standbyBase);
}

function estimateDatabaseCarbonSaving(database) {
  return (estimateDatabaseSavingPotential(database) * getDatabaseCarbonFactor(database)) / 1000;
}

function buildDatabaseIntensityMetrics(database) {
  const scope = getDatabaseScopeStats(database);
  const period = database.period;
  const standardEnergy = buildDatabaseStandardEnergySummary(database);
  const eui = safeDivide(period.totalKWh, scope.floorArea);
  const targetEui = safeDivide(period.budgetKWh, scope.floorArea);
  const standardCoalAreaIntensity = safeDivide(standardEnergy.totalStandardCoalKg, scope.floorArea);
  return [
    metric("综合能耗", `${shared.formatNumber(standardEnergy.totalStandardCoalTons, 4)} tce`, "多能源统一折算后的标煤口径。", false),
    metric("单位面积强度", `${shared.formatNumber(eui, 3)} ${period.unit}/m²`, `目标 ${shared.formatNumber(targetEui, 3)}。`, eui > targetEui),
    metric("人均强度", `${shared.formatNumber(safeDivide(period.totalKWh, scope.staffCount), 2)} ${period.unit}/人`, "用于比较不同人数区域。", false),
    metric("标煤面积强度", `${shared.formatNumber(standardCoalAreaIntensity, 3)} kgce/m²`, "统一口径后适合多能源对比。", false)
  ];
}

function buildDatabaseBenchmarkMetrics(database, currentEui, targetEui) {
  const scope = getDatabaseScopeStats(database);
  const deviation = targetEui > 0 ? (currentEui - targetEui) / targetEui : 0;
  return [
    metric("对标偏差", `${shared.formatPercent(deviation)}`, "正值表示高于目标强度。", deviation > 0),
    metric("单位面积碳强度", `${shared.formatNumber(safeDivide(database.period.totalCarbon, scope.floorArea), 5)} t CO₂e/m²`, "适合不同区域横向比较。", false),
    metric("预算执行率", `${shared.formatPercent(safeDivide(database.period.totalKWh, database.period.budgetKWh))}`, "超过 100 % 表示高于预算。", database.period.totalKWh > database.period.budgetKWh),
    metric("最低点", database.lowPoint.label, `${shared.formatNumber(database.lowPoint.value, 1)} ${database.period.unit}`, false)
  ];
}

function buildDatabaseHighEnergyAreaRows(areaTotals) {
  return [...areaTotals].sort((a, b) => b.value - a.value);
}

function buildDatabaseDeviceBenchmarkRows(database) {
  const total = Math.max(database.period.totalKWh, 0);
  return DEVICE_PROFILE
    .map((item) => {
      const value = total * item.ratio;
      return {
        name: item.label,
        value,
        ratio: item.ratio,
        status: item.ratio >= 0.35 ? "高耗能" : item.ratio >= 0.18 ? "重点关注" : "常规"
      };
    })
    .sort((a, b) => b.value - a.value);
}

function buildDatabaseTimeBenchmarkRows(database) {
  const points = database.period.points;
  if (points.length === 0) {
    return [];
  }
  return points.map((point, index) => {
    const previous = index > 0 ? points[index - 1] : null;
    const previousValue = previous ? previous.value : point.budget;
    const changeRate = previousValue > 0 ? (point.value - previousValue) / previousValue : 0;
    return {
      label: point.label,
      current: point.value,
      previousLabel: previous ? previous.label : "目标线",
      previousValue,
      changeRate
    };
  }).slice(-8);
}

function buildDatabaseTimeBenchmarkCards(rows, unit) {
  if (rows.length === 0) {
    return [
      { title: "时间对标", copy: "当前范围暂无时间序列数据。", tone: "neutral" }
    ];
  }
  const sorted = [...rows].sort((a, b) => b.changeRate - a.changeRate);
  const maxRise = sorted[0];
  const maxDrop = sorted[sorted.length - 1];
  const averageChange = safeDivide(rows.reduce((sum, row) => sum + row.changeRate, 0), rows.length);
  return [
    { title: "最大升幅", copy: `${maxRise.label} 较 ${maxRise.previousLabel} 变化 ${shared.withSign(maxRise.changeRate * 100)} %。`, tone: maxRise.changeRate > 0 ? "danger" : "success" },
    { title: "最大降幅", copy: `${maxDrop.label} 较 ${maxDrop.previousLabel} 变化 ${shared.withSign(maxDrop.changeRate * 100)} %。`, tone: maxDrop.changeRate < 0 ? "success" : "neutral" },
    { title: "平均变化", copy: `${shared.withSign(averageChange * 100)} %，最近 ${rows.length} 个时段参与对标，单位 ${unit}。`, tone: averageChange > 0 ? "danger" : "success" }
  ];
}

function buildDatabaseRankingCards(areaRows, highEnergyRows, deviceRows) {
  const bestArea = areaRows[0];
  const highestArea = highEnergyRows[0];
  const topDevice = deviceRows[0];
  return [
    { title: "能效最优区域", copy: bestArea ? `${bestArea.name} 当前单位面积强度最低。` : "区域数据完善后生成排行。", tone: "success" },
    { title: "高耗能区域", copy: highestArea ? `${highestArea.name} 能耗占比 ${shared.formatPercent(highestArea.share)}。` : "当前暂无区域能耗排行。", tone: highestArea ? "danger" : "neutral" },
    { title: "重点设备", copy: topDevice ? `${topDevice.name} 估算占比 ${shared.formatPercent(topDevice.ratio)}。` : "当前暂无设备结构数据。", tone: topDevice && topDevice.ratio >= 0.35 ? "danger" : "neutral" }
  ];
}

function buildDatabaseAreaBenchmarkRows(database, areaTotals) {
  const scale = getDatabasePeriodBudgetScale(database);
  const rows = areaTotals.map((area) => {
    const floorArea = area.floorArea || shared.OFFICE.area;
    const periodBudget = area.annualBudget > 0
      ? area.annualBudget * scale
      : safeDivide(database.period.budgetKWh, Math.max(areaTotals.length, 1));
    const eui = safeDivide(area.value, floorArea);
    const targetEui = safeDivide(periodBudget, floorArea);
    return {
      name: area.name,
      eui,
      targetEui,
      status: eui > targetEui ? "高于目标" : "达标"
    };
  });
  return rows.sort((a, b) => a.eui - b.eui);
}

function buildDatabaseBenchmarkLevelCards(database, currentEui, targetEui, bestArea) {
  return [
    { title: "当前等级", copy: currentEui > targetEui ? "需要优化，建议优先查看超预算点。" : "当前范围处于目标线内。", tone: currentEui > targetEui ? "danger" : "success" },
    { title: "标杆区域", copy: bestArea ? `${bestArea.name} 当前强度最低。` : "区域数据继续补齐后可形成排行。", tone: "success" },
    { title: "管理口径", copy: `${getSelectedAreaLabel(database)} 使用同一时间范围和能源口径进行对标。`, tone: "neutral" }
  ];
}

function buildDatabaseEvents(database) {
  return database.period.points
    .map((point) => ({ point, gap: point.value - point.budget }))
    .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))
    .slice(0, 4)
    .map(({ point, gap }) => ({
      title: `${point.bucket || point.label}`,
      badgeLabel: gap > 0 ? "超预算" : "低负荷",
      danger: gap > 0,
      copy: `实际 ${shared.formatNumber(point.value, 2)} ${database.period.unit}，预算 ${shared.formatNumber(point.budget, 2)} ${database.period.unit}，差额 ${shared.withSign(gap)} ${database.period.unit}。`
    }));
}

function buildDatabaseTrendInsight(database) {
  const points = database.period.points;
  if (points.length < 2) {
    return {
      label: points.length === 1 ? "单点记录" : "暂无数据",
      note: points.length === 1 ? "当前范围只有一个统计点。" : "当前范围暂无可分析数据。",
      tone: "neutral",
      rate: 0
    };
  }

  const first = points[0].value;
  const last = points[points.length - 1].value;
  const average = safeDivide(points.reduce((sum, point) => sum + point.value, 0), points.length);
  const rate = first > 0 ? (last - first) / first : 0;
  const highCount = points.filter((point) => point.value > average * 1.15).length;
  if (rate > 0.08) {
    return {
      label: "上升",
      note: `末段较首段上升 ${shared.formatPercent(rate)}，${highCount} 个时段高于均值。`,
      tone: "danger",
      rate
    };
  }
  if (rate < -0.08) {
    return {
      label: "下降",
      note: `末段较首段下降 ${shared.formatPercent(Math.abs(rate))}，整体负荷有所回落。`,
      tone: "success",
      rate
    };
  }
  return {
    label: "平稳",
    note: `波动处于常规范围，均值 ${shared.formatNumber(average, 1)} ${database.period.unit}。`,
    tone: "neutral",
    rate
  };
}

function buildDatabasePeakValleyInsight(database) {
  const points = database.period.points;
  const fallback = { label: "暂无", bucket: "", value: 0, budget: 0 };
  const peak = points.length > 0
    ? points.reduce((best, point) => (point.value > best.value ? point : best), points[0])
    : fallback;
  const valley = points.length > 0
    ? points.reduce((best, point) => (point.value < best.value ? point : best), points[0])
    : fallback;
  const spread = Math.max(peak.value - valley.value, 0);
  const peakRatio = valley.value > 0 ? peak.value / valley.value : peak.value > 0 ? 1 : 0;
  const signals = [];
  if (peak.value > peak.budget && peak.budget > 0) {
    signals.push({ label: "高峰超预算", tone: "danger" });
  }
  if (isNightBucket(peak.bucket) && peak.value > 0) {
    signals.push({ label: "夜间高负荷", tone: "danger" });
  }
  if (peakRatio >= 2) {
    signals.push({ label: "峰谷差明显", tone: "danger" });
  }
  if (signals.length === 0) {
    signals.push({ label: "峰谷处于可控范围", tone: "success" });
  }
  return {
    peak,
    valley,
    spread,
    peakRatio,
    unit: database.period.unit,
    signals
  };
}

function buildDatabaseAnomalyItems(database, peakValley) {
  const points = database.period.points;
  const average = safeDivide(points.reduce((sum, point) => sum + point.value, 0), points.length);
  const anomalies = points
    .map((point) => {
      const budgetGap = point.value - point.budget;
      const nightLoad = isNightBucket(point.bucket) && point.value > average * 0.75;
      const suddenHigh = point.value > average * 1.35;
      const danger = budgetGap > 0 || nightLoad || suddenHigh;
      let badgeLabel = "正常";
      if (budgetGap > 0) {
        badgeLabel = "超预算";
      } else if (nightLoad) {
        badgeLabel = "夜间高负荷";
      } else if (suddenHigh) {
        badgeLabel = "异常抬升";
      }
      return {
        title: point.bucket || point.label,
        badgeLabel,
        danger,
        score: Math.abs(budgetGap) + (nightLoad ? average : 0) + (suddenHigh ? average * 0.6 : 0),
        copy: danger
          ? `实际 ${shared.formatNumber(point.value, 2)} ${database.period.unit}，建议核对该时段设备运行和区域占用。`
          : `实际 ${shared.formatNumber(point.value, 2)} ${database.period.unit}，处于常规范围。`
      };
    })
    .filter((item) => item.danger)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  if (anomalies.length > 0) {
    return anomalies;
  }
  return [
    {
      title: peakValley.peak.bucket || peakValley.peak.label,
      badgeLabel: "重点观察",
      danger: false,
      copy: `当前未识别明显异常，可持续观察高峰时段 ${peakValley.peak.label}。`
    }
  ];
}

function buildDatabaseStrategyCards(database, driverItems, saving, carbonSaving) {
  const period = database.period;
  const topDriver = driverItems[0] || { title: "重点负荷", ratio: 0, value: `0 ${period.unit}` };
  const costSaving = saving * 0.92;
  return [
    {
      title: "空调提前关停",
      value: `${shared.formatNumber(saving * 0.32, 1)} ${period.unit}`,
      note: "在低占用尾段提前 30 分钟收敛空调负荷。",
      tone: topDriver.title.includes("空调") ? "success" : "neutral"
    },
    {
      title: "照明分区联动",
      value: `${shared.formatNumber(saving * 0.18, 1)} ${period.unit}`,
      note: "按区域占用联动照明回路，降低空置区域照明。",
      tone: "neutral"
    },
    {
      title: "设备错峰运行",
      value: `${shared.formatNumber(saving * 0.28, 1)} ${period.unit}`,
      note: "将可调度设备避开高峰时段运行。",
      tone: database.overBudgetCount > 0 ? "danger" : "neutral"
    },
    {
      title: "重点区域改造",
      value: `¥${shared.formatNumber(costSaving + carbonSaving * shared.OFFICE.carbonPrice, 0)}`,
      note: `优先处理 ${topDriver.title}，同步降低能耗和碳排。`,
      tone: "success"
    }
  ];
}

function buildDatabaseSavingsMetrics(database, saving, carbonSaving) {
  const period = database.period;
  const savingRate = safeDivide(saving, period.totalKWh);
  const costSaving = saving * 0.92;
  return [
    metric("预计节电率", `${shared.formatPercent(savingRate)}`, "按超预算点和待机负荷估算。", false),
    metric("预计节能量", `${shared.formatNumber(saving, 2)} ${period.unit}`, "用于形成策略优先级。", false),
    metric("预计减排量", `${shared.formatNumber(carbonSaving, 3)} t CO₂e`, "由节能量联动排放因子折算。", false),
    metric("预计节省成本", `¥${shared.formatNumber(costSaving, 0)}`, "按能源单价估算。", false)
  ];
}

function isNightBucket(bucket) {
  const normalized = normalizeBucket(bucket);
  if (normalized.length < 13) {
    return false;
  }
  const hour = Number(normalized.slice(11, 13));
  return Number.isFinite(hour) && (hour < 7 || hour >= 20);
}

function buildDatabaseOpportunityCards(database) {
  const saving = estimateDatabaseSavingPotential(database);
  return [
    { title: "峰值削减", value: `${shared.formatNumber(saving * 0.36, 1)} ${database.period.unit}`, note: "针对峰值点设置削峰策略。", tone: database.overBudgetCount > 0 ? "danger" : "neutral" },
    { title: "待机治理", value: `${shared.formatNumber(saving * 0.28, 1)} ${database.period.unit}`, note: "优先排查夜间、周末和无人时段。", tone: "neutral" },
    { title: "照明策略", value: `${shared.formatNumber(saving * 0.18, 1)} ${database.period.unit}`, note: "按区域占用联动开关和亮度。", tone: "neutral" },
    { title: "设备优化", value: `${shared.formatNumber(saving * 0.18, 1)} ${database.period.unit}`, note: "对高占比设备做运行参数优化。", tone: "success" }
  ];
}

function buildDatabaseFlowItems(database) {
  return DEVICE_PROFILE
    .map((item) => ({
      label: item.label,
      value: database.period.totalKWh * item.ratio,
      color: item.color,
      note: item.note
    }))
    .sort((a, b) => b.value - a.value);
}

function buildDatabaseSankeyData(database, areaTotals, flowItems) {
  const total = Math.max(database.period.totalKWh, 0);
  const unit = database.period.unit;
  const width = 94;
  const nodes = [];
  const links = [];
  const topAreas = (areaTotals.length > 0 ? areaTotals : [{
    id: "selected",
    name: getSelectedAreaLabel(database),
    value: total,
    share: 1,
    areaType: "office"
  }]).slice(0, 4);
  const areaTotal = topAreas.reduce((sum, area) => sum + Number(area.value || 0), 0);
  const visibleAreaTotal = areaTotal > 0 ? areaTotal : total;
  const lossRate = Math.max(0.04, Math.min(0.12, 0.08 + (database.meters.length === 0 ? 0.02 : -0.02)));
  const lossValue = total * lossRate;
  const loadTotal = Math.max(total - lossValue, 0);
  const loadItems = flowItems.slice(0, 5).map((item) => ({
    ...item,
    value: loadTotal * item.ratio
  }));

  nodes.push({
    id: "input",
    label: "总输入",
    valueLabel: `${shared.formatNumber(total, 1)} ${unit}`,
    x: 28,
    y: 128,
    width,
    height: 96,
    color: "#2f6b56"
  });

  topAreas.forEach((area, index) => {
    const value = Number(area.value || 0);
    const areaShare = visibleAreaTotal > 0 ? value / visibleAreaTotal : safeDivide(1, Math.max(topAreas.length, 1));
    const linkValue = loadTotal * areaShare;
    nodes.push({
      id: `area-${index}`,
      label: area.name,
      valueLabel: `${shared.formatNumber(value, 1)} ${unit}`,
      x: 260,
      y: 34 + index * 76,
      width,
      height: 52,
      color: index === 0 ? "#4f9a78" : "#7fab93"
    });
    links.push({
      source: "input",
      target: `area-${index}`,
      value: linkValue,
      width: safeDivide(linkValue, Math.max(total, 1)) * 26,
      color: "rgba(47, 107, 86, 0.35)",
      sourceOffset: 0.18 + index * 0.2,
      targetOffset: 0.5
    });
  });

  loadItems.forEach((item, index) => {
    nodes.push({
      id: `load-${index}`,
      label: item.label,
      valueLabel: `${shared.formatNumber(item.value, 1)} ${unit}`,
      x: 520,
      y: 18 + index * 62,
      width: 118,
      height: 46,
      color: item.color
    });
  });

  topAreas.forEach((area, areaIndex) => {
    const areaValue = Number(area.value || 0);
    const areaShare = visibleAreaTotal > 0 ? areaValue / visibleAreaTotal : safeDivide(1, Math.max(topAreas.length, 1));
    loadItems.slice(0, 4).forEach((item, loadIndex) => {
      const value = loadTotal * areaShare * item.ratio;
      links.push({
        source: `area-${areaIndex}`,
        target: `load-${loadIndex}`,
        value,
        width: safeDivide(value, Math.max(total, 1)) * 22,
        color: `${hexToRgba(item.color, 0.28)}`,
        sourceOffset: 0.22 + loadIndex * 0.18,
        targetOffset: 0.5
      });
    });
  });

  nodes.push({
    id: "loss",
    label: "疑似损耗",
    valueLabel: `${shared.formatNumber(lossValue, 1)} ${unit}`,
    x: 520,
    y: 315,
    width: 118,
    height: 42,
    color: "#cf7458"
  });
  links.push({
    source: "input",
    target: "loss",
    value: lossValue,
    width: safeDivide(lossValue, Math.max(total, 1)) * 26,
    color: "rgba(196, 84, 68, 0.34)",
    sourceOffset: 0.92,
    targetOffset: 0.5
  });

  return {
    nodes,
    links,
    totalValue: total,
    lossValue,
    lossRate,
    unit
  };
}

function buildDatabaseMeterHierarchyRows(database) {
  const rows = [
    ["一级", getSelectedAreaLabel(database), "总表 / 总量边界", `${shared.formatNumber(database.period.totalKWh, 1)} ${database.period.unit}`]
  ];
  const areas = database.selectedArea ? [database.selectedArea] : database.areas.slice(0, 6);
  areas.forEach((area) => {
    rows.push(["二级", area.name, getAreaTypeLabel(area.area_type), `${shared.formatNumber(Number(area.floor_area_m2 || 0), 0)} m²`]);
  });
  if (database.meters.length > 0) {
    database.meters.slice(0, 8).forEach((meter) => {
      rows.push(["三级", meter.name || meter.code, meter.energy_type_name || "能源表计", meter.location || meter.area_name || "已登记"]);
    });
  } else {
    DEVICE_PROFILE.slice(0, 4).forEach((item) => {
      rows.push(["三级", item.label, "末端负荷节点", item.note]);
    });
  }
  return rows.slice(0, 12);
}

function buildDatabaseLossCards(database, areaTotals) {
  const total = Math.max(database.period.totalKWh, 0);
  const areaSum = areaTotals.reduce((sum, area) => sum + Number(area.value || 0), 0);
  const balanceGap = Math.max(total - areaSum, 0);
  const estimatedLoss = total * (database.meters.length > 0 ? 0.06 : 0.1);
  return [
    { title: "总分表差额", copy: `${shared.formatNumber(balanceGap, 2)} ${database.period.unit}，用于核验总量和区域分项是否一致。`, tone: balanceGap > total * 0.05 ? "danger" : "success" },
    { title: "线路与管网损耗", copy: `${shared.formatNumber(estimatedLoss, 2)} ${database.period.unit}，按计量覆盖情况估算。`, tone: estimatedLoss > total * 0.08 ? "danger" : "neutral" },
    { title: "表计覆盖", copy: database.meters.length > 0 ? `${database.meters.length} 块表计已登记。` : "当前以区域台账和末端负荷结构生成能流。", tone: database.meters.length > 0 ? "success" : "neutral" }
  ];
}

function buildDatabaseKeyNodeCards(database, areaTotals, flowItems) {
  const topArea = areaTotals.length > 0 ? areaTotals[0] : null;
  const topLoad = flowItems[0];
  const lossValue = database.period.totalKWh * (database.meters.length > 0 ? 0.06 : 0.1);
  return [
    { title: "最大区域节点", copy: topArea ? `${topArea.name} 占 ${shared.formatPercent(topArea.share)}。` : `${getSelectedAreaLabel(database)} 为当前核算边界。`, tone: topArea && topArea.share > 0.35 ? "danger" : "neutral" },
    { title: "最大末端节点", copy: `${topLoad.label} 约 ${shared.formatNumber(topLoad.value, 1)} ${database.period.unit}。`, tone: safeDivide(topLoad.value, database.period.totalKWh) > 0.4 ? "danger" : "success" },
    { title: "损耗节点", copy: `${shared.formatNumber(lossValue, 1)} ${database.period.unit} 进入损耗核验。`, tone: lossValue > database.period.totalKWh * 0.08 ? "danger" : "neutral" }
  ];
}

function hexToRgba(hex, alpha) {
  const normalized = String(hex || "#2f6b56").replace("#", "");
  const value = normalized.length === 3
    ? normalized.split("").map((item) => item + item).join("")
    : normalized;
  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function buildDatabaseBalancePieces() {
  return [
    { label: "有效利用", value: 84, color: "#2f6b56" },
    { label: "待机损耗", value: 8, color: "#cf7458" },
    { label: "运行损失", value: 8, color: "#d2b06b" }
  ];
}

function buildDatabaseOptimizedBalancePieces() {
  return [
    { label: "有效利用", value: 89, color: "#2f6b56" },
    { label: "待机损耗", value: 5, color: "#cf7458" },
    { label: "运行损失", value: 6, color: "#d2b06b" }
  ];
}

function buildDatabaseOptimizationScenarios(database) {
  const saving = estimateDatabaseSavingPotential(database);
  return [
    { title: "空调分区启停", value: `${shared.formatNumber(saving * 0.42, 1)} ${database.period.unit}`, note: "优先降低高峰和空载时段。", tone: "success" },
    { title: "待机治理", value: `${shared.formatNumber(saving * 0.28, 1)} ${database.period.unit}`, note: "针对插座、办公设备和公共设备待机。", tone: "neutral" },
    { title: "照明时段策略", value: `${shared.formatNumber(saving * 0.18, 1)} ${database.period.unit}`, note: "下班后延时关闭与区域联动。", tone: "neutral" },
    { title: "会议区联动", value: `${shared.formatNumber(saving * 0.12, 1)} ${database.period.unit}`, note: "和预约、门禁或使用状态联动。", tone: "neutral" }
  ];
}

function buildDatabaseLoadBalanceRows(database, areaTotals) {
  const rowsSource = areaTotals.length > 0 ? areaTotals : [{
    name: getSelectedAreaLabel(database),
    value: database.period.totalKWh,
    share: 1
  }];
  const averageShare = safeDivide(1, rowsSource.length);
  const maxShare = rowsSource.reduce((max, area) => Math.max(max, Number(area.share || 0)), 0);
  const balanceScore = Math.max(0, 1 - Math.max(maxShare - averageShare, 0));
  const rows = rowsSource.slice(0, 8).map((area) => {
    const share = Number(area.share || 0);
    const status = share > averageShare * 1.45 ? "局部偏高" : share < averageShare * 0.55 ? "偏低" : "均衡";
    return [
      area.name,
      `${shared.formatNumber(area.value, 1)} ${database.period.unit}`,
      shared.formatPercent(share),
      status
    ];
  });
  return {
    rows,
    balanceScore,
    summary: maxShare > averageShare * 1.45 ? "存在局部负荷集中。" : "区域负荷分布较均衡。"
  };
}

function buildDatabaseOperationPlans(database, saving) {
  return [
    { title: "空调群控优化", value: `${shared.formatNumber(saving * 0.4, 1)} ${database.period.unit}`, note: "按区域负荷和高峰时段分区启停。", tone: "success" },
    { title: "照明时段优化", value: `${shared.formatNumber(saving * 0.22, 1)} ${database.period.unit}`, note: "将公共区照明与占用状态联动。", tone: "neutral" },
    { title: "动力设备调度", value: `${shared.formatNumber(saving * 0.2, 1)} ${database.period.unit}`, note: "将可调度设备移出高峰时段。", tone: database.overBudgetCount > 0 ? "danger" : "neutral" },
    { title: "水泵运行策略", value: `${shared.formatNumber(saving * 0.18, 1)} ${database.period.unit}`, note: "按负荷曲线调整启停和轮换。", tone: "neutral" }
  ];
}

function buildDatabaseLossOptimizationCards(database, saving) {
  return [
    { title: "降低待机损耗", copy: `预计减少 ${shared.formatNumber(saving * 0.28, 1)} ${database.period.unit}，重点处理夜间和周末基荷。`, tone: "danger" },
    { title: "减少照明空耗", copy: `预计减少 ${shared.formatNumber(saving * 0.18, 1)} ${database.period.unit}，联动时段和区域占用。`, tone: "neutral" },
    { title: "优化高峰时段", copy: `预计削减 ${shared.formatNumber(saving * 0.34, 1)} ${database.period.unit}，降低峰值运行压力。`, tone: database.overBudgetCount > 0 ? "danger" : "success" }
  ];
}

function buildDatabaseMultiObjectiveCards(database, saving, carbonSaving, revenue) {
  const total = Math.max(database.period.totalKWh, 1);
  return [
    { title: "舒适度约束", copy: `保留核心运行负荷，优化幅度控制在 ${shared.formatPercent(Math.min(safeDivide(saving, total), 0.18))} 内。`, tone: "success" },
    { title: "运行连续性", copy: "办公、教学或生产时段优先保障，策略集中在低占用和高峰可调时段。", tone: "neutral" },
    { title: "经济与碳效益", copy: `预计收益 ¥${shared.formatNumber(revenue, 0)}，同步减排 ${shared.formatNumber(carbonSaving, 3)} t CO₂e。`, tone: "success" }
  ];
}

function buildDatabaseOptimizationSimulation(database, saving, carbonSaving, revenue) {
  const period = database.period;
  const savingRate = safeDivide(saving, period.totalKWh);
  const optimizedEnergy = Math.max(period.totalKWh - saving, 0);
  const optimizedCarbon = Math.max(period.totalCarbon - carbonSaving, 0);
  return {
    savingRate,
    metrics: [
      metric("优化后能耗", `${shared.formatNumber(optimizedEnergy, 2)} ${period.unit}`, `较当前下降 ${shared.formatPercent(savingRate)}。`, false),
      metric("优化后碳排", `${shared.formatNumber(optimizedCarbon, 3)} t CO₂e`, `预计减少 ${shared.formatNumber(carbonSaving, 3)} t CO₂e。`, false),
      metric("节能收益", `¥${shared.formatNumber(revenue, 0)}`, "包含节电收益和碳价收益估算。", false),
      metric("优化强度", `${shared.formatNumber(saving, 2)} ${period.unit}`, "由超预算点和待机损耗综合估算。", false)
    ]
  };
}

function buildDatabaseBalanceMetrics(database, saving, carbonSaving, revenue) {
  return [
    metric("可节能量", `${shared.formatNumber(saving, 2)} ${database.period.unit}`, "由超预算点和待机损耗估算。", false),
    metric("可减排量", `${shared.formatNumber(carbonSaving, 3)} t CO₂e`, "节能量联动排放因子折算。", false),
    metric("经济收益", `¥${shared.formatNumber(revenue, 0)}`, "按电价和碳价场景估算。", false),
    metric("优化后损耗", "11 %", "从 16 % 损耗降至约 11 %。", false)
  ];
}

function getDatabaseExpectedPointCount() {
  const range = getDatabaseRange();
  if (range.groupBy === "month") {
    return 12;
  }
  if (range.groupBy === "hour") {
    return 24;
  }
  return getDatabasePeriodDayCount();
}

function getDatabasePeriodDayCount() {
  const range = getDatabaseRange();
  const fromDate = new Date(range.from.slice(0, 10));
  const toDate = new Date(range.to.slice(0, 10));
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return 1;
  }
  return Math.max(Math.round((toDate - fromDate) / 86400000) + 1, 1);
}

function buildDatabaseQualityStats(database) {
  const expectedPoints = getDatabaseExpectedPointCount();
  const actualPoints = database.period.points.length;
  const readingCount = database.period.points.reduce((sum, point) => sum + point.readingCount, 0);
  const completeness = Math.min(safeDivide(actualPoints, expectedPoints), 1);
  const meterCoverage = database.meters.length > 0 ? 1 : 0.45;
  const traceability = Math.min(0.55 + completeness * 0.3 + meterCoverage * 0.15, 1);
  const uncertainty = Math.max(0.046, (1 - completeness) * 0.16 + (1 - meterCoverage) * 0.08);
  return {
    expectedPoints,
    actualPoints,
    readingCount,
    completeness,
    meterCoverage,
    traceability,
    uncertainty
  };
}

function estimateDatabaseBoundaryCoverage(database, quality) {
  const hasCarbon = database.period.totalCarbon > 0 ? 0.45 : 0;
  const hasArea = database.areas.length > 0 ? 0.15 : 0;
  const hasMeter = database.meters.length > 0 ? 0.12 : 0;
  const hasTimeSeries = quality.completeness * 0.18;
  return Math.min(hasCarbon + hasArea + hasMeter + hasTimeSeries, 0.9);
}

function buildDatabaseLifecycleStages(database) {
  const baseCarbon = Math.max(database.period.totalCarbon, 0);
  return normalizeLifecycleStages([
    { name: "原材料阶段", carbonTons: baseCarbon * 0.16, status: "估算", tone: "neutral" },
    { name: "运输阶段", carbonTons: baseCarbon * 0.05, status: "估算", tone: "neutral" },
    { name: "运营生产阶段", carbonTons: baseCarbon, status: "已核算", tone: "success" },
    { name: "使用阶段", carbonTons: baseCarbon * 0.08, status: "估算", tone: "neutral" },
    { name: "废弃阶段", carbonTons: baseCarbon * 0.03, status: "估算", tone: "neutral" }
  ]);
}

function buildDatabaseProductFootprintModel(database, scope, stages, coverage) {
  const totalCarbonTons = stages.reduce((sum, stage) => sum + stage.carbonTons, 0);
  const outputCount = Math.max(scope.staffCount * getDatabasePeriodDayCount(), 1);
  return {
    name: `${getSelectedAreaLabel(database)}工位日服务`,
    unit: "工位日",
    outputCount,
    totalCarbonTons,
    unitFootprintKg: safeDivide(totalCarbonTons * 1000, outputCount),
    coverage,
    boundary: "以当前区域服务量作为产品单元，纳入能源活动数据，并对上下游阶段做管理估算。"
  };
}

function buildDatabaseFootprintLayers(database, coverage, unitFootprintKg) {
  return [
    { title: "产品 / 服务单元", status: "已建立", value: `${shared.formatNumber(unitFootprintKg, 3)} kg CO₂e/工位日`, copy: "以工位日作为当前可计量的服务产品。", tone: "success" },
    { title: "生命周期阶段", status: "已拆分", value: "5 个阶段", copy: "覆盖原材料、运输、运营、使用和废弃阶段。", tone: "success" },
    { title: "能源活动数据", status: "已纳入", value: `${shared.formatNumber(database.period.totalCarbon, 3)} t CO₂e`, copy: `${getSelectedAreaLabel(database)} 的运营阶段核心数据。`, tone: "success" },
    { title: "扩展凭证", status: "待完善", value: `${shared.formatPercent(coverage)}`, copy: "可继续接入采购、物流和废弃物凭证。", tone: coverage >= 0.8 ? "success" : "neutral" }
  ];
}

function buildDatabaseFootprintRoadmap(database, coverage) {
  return [
    { title: "阶段 1", value: "能源边界", note: "先保证电、水、气、热活动数据连续。", tone: "success" },
    { title: "阶段 2", value: "凭证边界", note: "补齐票据、表计和采集来源。", tone: coverage >= 0.7 ? "success" : "neutral" },
    { title: "阶段 3", value: "扩展边界", note: "继续纳入差旅、采购和废弃物。", tone: "neutral" }
  ];
}

function buildDatabaseVerificationRows(database, quality) {
  return [
    ["能源读数", shared.getTimeRangeLabel(state.view), quality.completeness >= 0.8 ? "较完整" : "待补齐", `${quality.actualPoints}/${quality.expectedPoints} 个时间点已有数据`],
    ["区域台账", "按需", database.areas.length > 0 ? "已维护" : "待维护", `${database.areas.length} 个区域纳入当前系统`],
    ["表计台账", "按需", database.meters.length > 0 ? "已维护" : "待维护", `${database.meters.length} 块表计可追溯`],
    ["排放因子", "年度", "已启用", "按能源类型和年份参与碳排计算"]
  ];
}

function buildDatabaseVerificationBoundaryRows(database) {
  const energyTypes = buildDatabaseStandardEnergySummary(database).rows;
  const energyLabel = energyTypes.length > 0
    ? energyTypes.map((row) => row.label).join("、")
    : shared.getEnergyTypeLabel(state.energyType);
  return [
    ["组织边界", "已纳入", getSelectedAreaLabel(database)],
    ["区域边界", database.areas.length > 0 ? "已纳入" : "待维护", `${database.areas.length || 1} 个区域参与核算`],
    ["能源边界", "已纳入", energyLabel],
    ["表计边界", database.meters.length > 0 ? "已登记" : "待完善", database.meters.length > 0 ? `${database.meters.length} 块表计可追溯` : "建议补充表计台账"],
    ["扩展活动", "待完善", "差旅、采购和废弃物可作为扩展边界"]
  ];
}

function buildDatabaseVerificationActivityRows(database) {
  const rows = buildDatabaseVerificationRows(database, buildDatabaseQualityStats(database));
  const summaryRows = dbState.summary.slice(0, 8).map((row) => [
    row.energy_type_name || shared.getEnergyTypeLabel(row.energy_type_code || state.energyType),
    shared.getTimeRangeLabel(state.view),
    Number(row.reading_count || 0) > 0 ? "已同步" : "待补齐",
    `${row.area_name || getSelectedAreaLabel(database)} · ${shared.formatNumber(Number(row.total_amount || 0), 3)} ${formatDisplayUnit(row.unit || database.period.unit)}`
  ]);
  return summaryRows.length > 0 ? summaryRows : rows;
}

function buildDatabaseVerificationFactorRows(database) {
  const standardEnergy = buildDatabaseStandardEnergySummary(database);
  const rows = standardEnergy.rows.map((row) => {
    const amount = Number(row.amount || 0);
    const factor = amount > 0 ? (Number(row.carbonTons || 0) * 1000) / amount : Number(row.factor?.carbonKgPerUnit || 0);
    return [
      row.label,
      `${shared.formatNumber(factor, 4)} kg CO₂e/${formatDisplayUnit(row.unit || row.factor?.unit)}`,
      `${getActiveYear()}`,
      "已启用"
    ];
  });
  if (rows.length > 0) {
    return rows;
  }
  return [
    ["电力", `${shared.OFFICE.gridFactor} kg CO₂e/kWh`, `${getActiveYear()}`, "已启用"],
    ["天然气", "2.162 kg CO₂e/m³", `${getActiveYear()}`, "待启用"],
    ["热力 / 蒸汽", "110 kg CO₂e/GJ", `${getActiveYear()}`, "待启用"]
  ];
}

function buildDatabaseEvidenceRows(database, quality) {
  return [
    ["电费单", "能源读数", quality.readingCount > 0 ? "已归档" : "待补充", `${quality.readingCount} 条读数可关联`],
    ["燃气单", "天然气记录", state.energyType === "gas" ? "已归档" : "待补充", "用于扩展燃气活动数据"],
    ["热力账单", "外购热力记录", state.energyType === "steam" ? "已归档" : "待补充", "用于扩展热力活动数据"],
    ["Excel 原始数据", "批量导入", quality.completeness >= 0.8 ? "已归档" : "待复核", `${quality.actualPoints}/${quality.expectedPoints} 个时间点已有数据`],
    ["表计校准记录", "表计台账", database.meters.length > 0 ? "已登记" : "待补充", database.meters.length > 0 ? `${database.meters.length} 块表计` : "建议补充表计校准材料"]
  ];
}

function buildDatabaseAuditRows(database, quality) {
  const realRows = buildDatabaseAuditLogRows(database.auditLogs || []);
  if (realRows.length > 0) {
    return realRows;
  }

  const updatedAt = getDataUpdatedAtText(dbState.lastUpdatedAt);
  return [
    [updatedAt, "system", "能源汇总", `同步 ${quality.readingCount} 条活动数据`],
    [updatedAt, "admin", "核算边界", `${getSelectedAreaLabel(database)} 纳入当前核算范围`],
    [updatedAt, "admin", "排放因子", `${buildDatabaseVerificationFactorRows(database).length} 个因子版本可用`],
    [updatedAt, "system", "证据材料", `生成 ${buildDatabaseEvidenceRows(database, quality).length} 项材料清单`]
  ];
}

function buildDatabaseAuditLogRows(logs) {
  return logs.slice(0, 8).map((log) => [
    formatLocalDateTime(log.created_at || log.createdAt),
    log.username || log.display_name || "system",
    formatAuditTarget(log),
    formatAuditChange(log)
  ].map(escapeHtml));
}

function formatAuditTarget(log) {
  const labels = {
    admin: "管理员",
    area: "区域",
    meter: "表计",
    energy_reading: "能源读数"
  };
  const targetType = String(log.target_type || log.targetType || "");
  const label = labels[targetType] || targetType || "系统";
  const targetId = log.target_id || log.targetId;
  return targetId ? `${label} #${targetId}` : label;
}

function formatAuditChange(log) {
  const detail = parseAuditDetail(log.detail);
  const action = String(log.action || "");
  const name = detail.name || detail.username || detail.code || "";
  const actionLabels = {
    ADMIN_LOGIN: "管理员登录",
    ADMIN_LOGOUT: "管理员退出登录",
    CHANGE_PASSWORD: "修改管理员密码",
    CREATE_AREA: `新增区域${name ? `：${name}` : ""}`,
    UPDATE_AREA: "更新区域信息",
    DELETE_AREA: "停用区域",
    UPSERT_ELECTRICITY_READING: `同步 ${detail.savedCount || 1} 条电力活动数据`,
    CREATE_METER: `新增表计${name ? `：${name}` : ""}`,
    CREATE_ENERGY_READING: `录入能源读数${detail.amount ? `：${detail.amount}` : ""}`
  };
  return actionLabels[action] || action || "系统记录";
}

function parseAuditDetail(detail) {
  if (!detail) {
    return {};
  }
  if (typeof detail === "object") {
    return detail;
  }
  try {
    return JSON.parse(detail);
  } catch (error) {
    return {};
  }
}

function buildDatabaseVerificationSteps(database, quality) {
  return [
    { title: "活动数据采集", status: quality.completeness >= 0.8 ? "较完整" : "待补齐", copy: `${quality.actualPoints}/${quality.expectedPoints} 个时间点已有记录。`, tone: quality.completeness >= 0.8 ? "success" : "danger" },
    { title: "区域边界确认", status: database.areas.length > 0 ? "已建立" : "待建立", copy: `${getSelectedAreaLabel(database)} 已作为核算边界。`, tone: database.areas.length > 0 ? "success" : "neutral" },
    { title: "表计与来源留痕", status: database.meters.length > 0 ? "已登记" : "待登记", copy: "表计越完整，核查追溯越稳。", tone: database.meters.length > 0 ? "success" : "neutral" },
    { title: "第三方核查准备", status: quality.traceability >= 0.85 ? "可推进" : "待完善", copy: "需要继续补齐凭证、来源和因子版本说明。", tone: quality.traceability >= 0.85 ? "success" : "danger" }
  ];
}

function buildDatabaseQualityPieData(quality) {
  const complete = Math.max(quality.completeness, 0.01);
  return {
    title: "数据质量分层",
    unit: "%",
    centerLabel: "质量",
    items: [
      { label: "完整数据", value: complete * 100, color: "#2f6b56", note: "当前已有记录覆盖。" },
      { label: "待补齐", value: Math.max(100 - complete * 100, 0), color: "#cf7458", note: "缺少的时间点或凭证。" }
    ]
  };
}

function buildDatabaseAssetScenarios(database, gap) {
  return [
    { title: "低碳价", value: `¥${shared.formatNumber(gap * 58, 0)}`, note: "按 58 元/吨估算。", tone: "neutral" },
    { title: "基准碳价", value: `¥${shared.formatNumber(gap * shared.OFFICE.carbonPrice, 0)}`, note: "按当前基准碳价估算。", tone: gap > 0 ? "danger" : "success" },
    { title: "高碳价", value: `¥${shared.formatNumber(gap * 108, 0)}`, note: "高碳价下缺口成本更敏感。", tone: gap > 0 ? "danger" : "neutral" }
  ];
}

function buildDatabaseProjectPipeline(database) {
  const carbonSaving = estimateDatabaseCarbonSaving(database);
  return [
    { title: "空调群控优化", stage: "方案设计", reduction: `${shared.formatNumber(carbonSaving * 0.42, 3)} t CO₂e`, value: `¥${shared.formatNumber(carbonSaving * 0.42 * shared.OFFICE.carbonPrice, 0)}/期`, progress: 35, copy: "优先处理峰值和高负荷区域。" },
    { title: "待机治理专项", stage: "快速落地", reduction: `${shared.formatNumber(carbonSaving * 0.28, 3)} t CO₂e`, value: `¥${shared.formatNumber(carbonSaving * 0.28 * shared.OFFICE.carbonPrice, 0)}/期`, progress: 62, copy: "主要针对夜间和周末基荷。" },
    { title: "照明与分区联动", stage: "储备项目", reduction: `${shared.formatNumber(carbonSaving * 0.18, 3)} t CO₂e`, value: `¥${shared.formatNumber(carbonSaving * 0.18 * shared.OFFICE.carbonPrice, 0)}/期`, progress: 18, copy: "适合作为第二阶段节能动作。" }
  ];
}

function buildDatabaseAssetPieData(period, plannedReduction, gap) {
  return {
    title: "资产状态结构",
    unit: "t CO₂e",
    centerLabel: "碳资产",
    items: [
      { label: "预算内排放", value: Math.max(Math.min(period.totalCarbon, period.budgetCarbon), 0.001), color: "#2f6b56", note: "当前预算覆盖部分。" },
      { label: "待消化缺口", value: Math.max(gap, 0), color: "#cf7458", note: "需要靠减排或资产动作处理。" },
      { label: "计划减排", value: Math.max(plannedReduction, 0.001), color: "#a8793d", note: "优化项目预计贡献。" }
    ]
  };
}

function buildDatabaseBudgetConfigRows(database, scope) {
  const scale = getDatabasePeriodBudgetScale(database);
  const areas = scope.areas.length > 0 ? scope.areas : database.areas;
  if (areas.length === 0) {
    return [[getSelectedAreaLabel(database), `${shared.formatNumber(scope.annualBudget, 1)} kWh`, `${shared.formatNumber(database.period.budgetKWh, 1)} kWh`, `${shared.formatNumber(database.period.budgetCarbon, 3)} t CO₂e`]];
  }
  return areas.slice(0, 8).map((area) => {
    const annualBudget = Number(area.annual_budget_kwh || 0) || safeDivide(scope.annualBudget, Math.max(areas.length, 1));
    const periodBudget = annualBudget * scale;
    const carbonFactor = Number(area.grid_emission_factor || shared.OFFICE.gridFactor);
    return [
      area.name,
      `${shared.formatNumber(annualBudget, 1)} kWh`,
      `${shared.formatNumber(periodBudget, 1)} kWh`,
      `${shared.formatNumber((periodBudget * carbonFactor) / 1000, 3)} t CO₂e`
    ];
  });
}

function buildDatabaseBudgetAreaExecutionRows(database, areaTotals) {
  const scale = getDatabasePeriodBudgetScale(database);
  const rowsSource = areaTotals.length > 0
    ? areaTotals
    : [{
      name: getSelectedAreaLabel(database),
      value: database.period.totalKWh,
      annualBudget: database.period.budgetKWh / Math.max(scale, 0.0001)
    }];
  return rowsSource.slice(0, 8).map((area) => {
    const budget = Number(area.annualBudget || 0) > 0
      ? Number(area.annualBudget) * scale
      : safeDivide(database.period.budgetKWh, Math.max(rowsSource.length, 1));
    const remaining = budget - Number(area.value || 0);
    const rate = safeDivide(area.value, budget);
    const status = rate > 1 ? "超预算" : rate >= 0.9 ? "接近上限" : "预算内";
    return {
      name: area.name,
      value: Number(area.value || 0),
      budget,
      remaining,
      rate,
      cells: [
        area.name,
        `${shared.formatNumber(area.value, 1)} ${database.period.unit}`,
        `${shared.formatNumber(budget, 1)} ${database.period.unit}`,
        `${shared.withSign(remaining)} ${database.period.unit}`,
        status
      ]
    };
  });
}

function buildDatabaseBudgetAlertCards(database, executionRows, executionRate, carbonRate) {
  const topRisk = [...executionRows].sort((a, b) => b.rate - a.rate)[0];
  const energyTone = executionRate > 1 ? "danger" : executionRate >= 0.9 ? "neutral" : "success";
  const carbonTone = carbonRate > 1 ? "danger" : carbonRate >= 0.9 ? "neutral" : "success";
  return [
    {
      title: "用能预算预警",
      copy: executionRate > 1
        ? `当前已超出预算 ${shared.formatPercent(executionRate - 1)}。`
        : `当前执行率 ${shared.formatPercent(executionRate)}。`,
      tone: energyTone
    },
    {
      title: "碳排预算预警",
      copy: carbonRate > 1
        ? `碳排已超出预算 ${shared.formatPercent(carbonRate - 1)}。`
        : `碳排执行率 ${shared.formatPercent(carbonRate)}。`,
      tone: carbonTone
    },
    {
      title: "区域上限提示",
      copy: topRisk ? `${topRisk.name} 执行率 ${shared.formatPercent(topRisk.rate)}。` : "当前暂无区域预算风险。",
      tone: topRisk && topRisk.rate >= 0.9 ? "danger" : "success"
    }
  ];
}

function buildDatabaseBudgetDeviationCards(database, executionRows, executionRate, carbonRate) {
  const highRows = executionRows.filter((row) => row.rate > 1);
  const peak = database.peakPoint;
  const reason = highRows.length > 0
    ? `${highRows[0].name} 超出本期预算，建议核对该区域运行时段和设备负荷。`
    : database.overBudgetCount > 0
      ? `${database.overBudgetCount} 个时间点高于预算线，建议复核峰值时段。`
      : "当前预算偏差处于可控范围。";
  return [
    { title: "偏差来源", copy: reason, tone: highRows.length > 0 || database.overBudgetCount > 0 ? "danger" : "success" },
    { title: "峰值影响", copy: `${peak.label} 达到 ${shared.formatNumber(peak.value, 1)} ${database.period.unit}。`, tone: database.overBudgetCount > 0 ? "danger" : "neutral" },
    { title: "碳能联动", copy: `能耗执行率 ${shared.formatPercent(executionRate)}，碳排执行率 ${shared.formatPercent(carbonRate)}。`, tone: executionRate > 1 || carbonRate > 1 ? "danger" : "success" }
  ];
}

function buildDatabaseBudgetReportCards(database) {
  const pointCount = database.period.points.length;
  const areaCount = database.areas.length || 1;
  return [
    { title: "预算执行报表", type: "execution", action: "导出执行报表", copy: `${pointCount} 个时间点纳入执行统计。`, tone: "success" },
    { title: "区域预算考核", type: "area", action: "导出区域报表", copy: `${areaCount} 个区域纳入预算考核。`, tone: "neutral" }
  ];
}

function buildDatabaseBudgetExecutionReportRows(database) {
  return database.period.points.map((point) => [
    point.bucket,
    `${shared.formatNumber(point.value, 3)} ${database.period.unit}`,
    `${shared.formatNumber(point.budget, 3)} ${database.period.unit}`,
    `${shared.withSign(point.budget - point.value)} ${database.period.unit}`,
    `${shared.formatNumber(point.carbon, 4)} t CO₂e`,
    `${shared.formatNumber(point.budgetCarbon, 4)} t CO₂e`
  ]);
}

function buildDatabaseBudgetAreaReportRows(database) {
  const scope = getDatabaseScopeStats(database);
  const scale = getDatabasePeriodBudgetScale(database);
  const areas = scope.areas.length > 0 ? scope.areas : database.areas;
  if (areas.length === 0) {
    return [[
      getSelectedAreaLabel(database),
      `${shared.formatNumber(scope.annualBudget, 3)} kWh`,
      `${shared.formatNumber(database.period.budgetKWh, 3)} kWh`,
      `${shared.formatNumber(database.period.budgetCarbon, 6)} t CO₂e`,
      `${shared.formatNumber(scope.floorArea, 2)} m²`,
      `${scope.staffCount} 人`
    ]];
  }
  return areas.slice(0, 100).map((area) => {
    const annualBudget = Number(area.annual_budget_kwh || 0) || safeDivide(scope.annualBudget, Math.max(areas.length, 1));
    const periodBudget = annualBudget * scale;
    const carbonFactor = Number(area.grid_emission_factor || shared.OFFICE.gridFactor);
    return [
      area.name,
      `${shared.formatNumber(annualBudget, 3)} kWh`,
      `${shared.formatNumber(periodBudget, 3)} kWh`,
      `${shared.formatNumber((periodBudget * carbonFactor) / 1000, 6)} t CO₂e`,
      `${shared.formatNumber(Number(area.floor_area_m2 || 0), 2)} m²`,
      `${Number(area.staff_count || 0)} 人`
    ];
  });
}

function buildDatabaseBudgetRecommendations(database, executionRows) {
  const riskyArea = [...executionRows].sort((a, b) => b.rate - a.rate)[0];
  return [
    { title: "维护预算配置", copy: "按年度、月度和区域维度维护能耗与碳排预算。" },
    riskyArea && riskyArea.rate >= 0.9
      ? { title: "跟踪高风险区域", copy: `${riskyArea.name} 执行率 ${shared.formatPercent(riskyArea.rate)}，建议纳入预警跟踪。` }
      : { title: "保持执行监控", copy: "当前区域预算执行整体平稳，继续按周期复核。" },
    { title: "复盘预算偏差", copy: "结合峰值时段、区域负荷和设备运行记录定位偏差原因。" }
  ];
}

function buildDatabaseModuleRecommendations(database, moduleId) {
  const common = [
    database.overBudgetCount > 0
      ? { title: "先处理超预算点", copy: `${database.overBudgetCount} 个时间点高于预算线，建议优先下钻排查。` }
      : { title: "保持连续监测", copy: "当前范围没有明显超预算点，建议继续保持数据连续。" },
    database.meters.length === 0
      ? { title: "补齐表计台账", copy: "表计信息越完整，能流、核查和分项分析越可靠。" }
      : { title: "细化分项计量", copy: `当前已有 ${database.meters.length} 块表计，可继续补充空调、照明和插座分项。` }
  ];
  const specific = {
    "energy-intensity": { title: "维护面积和人数", copy: "面积、人数和年度预算是强度计算的三个关键口径。" },
    "energy-analysis": { title: "把策略落到时段", copy: "对峰值点、周末低负荷和异常波动分别设置策略。" },
    benchmarking: { title: "建立内部标杆", copy: "先用同一园区内的楼宇或楼层做横向对标。" },
    "energy-flow": { title: "用分项表计校准结构", copy: "当前结构按办公场景估算，分项表计可提升准确度。" },
    "balance-opt": { title: "把优化变成收益", copy: "同步展示节电收益和减排收益，方便做改造优先级。" },
    "carbon-emissions": { title: "维护排放因子", copy: "按能源类型、地区和年度版本维护排放因子，保证核算口径一致。" },
    "carbon-footprint": { title: "扩展活动边界", copy: "能源数据稳定后，继续纳入差旅、采购和废弃物。" },
    verification: { title: "保留凭证与版本", copy: "核查时要能追溯活动数据、排放因子和修改记录。" },
    "carbon-assets": { title: "联动减排项目", copy: "把碳缺口、碳价和减排项目放在一起看履约压力。" }
  };
  return [specific[moduleId], ...common, { title: "同步更新预算", copy: "预算口径变化后，趋势图和预警线会一起变化。" }].filter(Boolean);
}

function buildBudgetScenarioCards(period) {
  const executionRate = period.budgetKWh > 0 ? period.totalKWh / period.budgetKWh : 0;
  return [
    {
      title: "预算执行率",
      value: `${shared.formatNumber(executionRate * 100, 1)} %`,
      note: executionRate > 1 ? "当前筛选范围已经超过预算线。" : "当前筛选范围仍在预算线内。",
      tone: executionRate > 1 ? "danger" : "success"
    },
    {
      title: "预算口径",
      value: "区域年度预算",
      note: "按年度预算均摊，也可细化到月度预算。",
      tone: "neutral"
    },
    {
      title: "预警基础",
      value: `${period.points.filter((item) => item.value > item.budget).length} 个点`,
      note: "超预算点进入预警跟踪。",
      tone: period.points.some((item) => item.value > item.budget) ? "danger" : "success"
    }
  ];
}

function buildDatabaseRecommendations() {
  return [
    { title: "补齐时间序列", copy: "保持连续的日、月、年数据。" },
    { title: "同步能耗记录", copy: "新增记录后会同步更新统计结果。" },
    { title: "批量导入", copy: "通过 Excel 或 CSV 整理历史数据。" }
  ];
}

function renderDatabaseTablePanel(title, period, unit, valueType = "energy") {
  const rows = period.points.map((point) => [
    point.bucket,
    valueType === "carbon" ? `${shared.formatNumber(point.carbon, 4)} ${unit}` : `${shared.formatNumber(point.value, 3)} ${unit}`,
    valueType === "carbon" ? `${shared.formatNumber(point.budgetCarbon, 4)} ${unit}` : `${shared.formatNumber(point.budget, 3)} ${unit}`,
    point.readingCount
  ]);
  return renderTablePanel(title, ["时间", "实际值", "预算值", "记录数"], rows);
}

function renderDatabaseAreaPanel(areas) {
  const rows = areas.slice(0, 8).map((area) => [
    area.name,
    area.code,
    `${shared.formatNumber(Number(area.floor_area_m2 || 0), 1)} m²`,
    `${shared.formatNumber(Number(area.annual_budget_kwh || 0), 0)} kWh`
  ]);
  if (rows.length === 0) {
    return `<section class="panel workspace-panel"><div class="empty-state">暂无区域。</div></section>`;
  }
  return renderTablePanel("区域基础数据", ["区域", "编码", "面积", "年度预算"], rows);
}

function getTrendTitle(context, label) {
  if (state.view === "year") {
    return `${getActiveYear()} 年月度${label}`;
  }
  if (state.view === "month") {
    return `${getActiveYear()} 年 ${shared.MONTHS[state.monthIndex]}日度${label}`;
  }
  return `${isDatabaseModule() ? state.databaseDateKey : state.dateKey} 小时级${label}`;
}

function getLineMode(moduleId, energyType) {
  const forceCarbon = moduleId.startsWith("carbon");
  const currentType = forceCarbon ? "carbon" : energyType;
  if (currentType === "carbon") {
    return {
      valueKey: "carbon",
      budgetKey: "budgetCarbon",
      unit: "t CO₂e",
      label: "碳排"
    };
  }

  return {
    valueKey: "value",
    budgetKey: "budget",
    unit: "kWh",
    label: "用电"
  };
}

function getPeakPoint(period, mode) {
  return period.points.reduce((best, item) => (item[mode.valueKey] > best.value ? {
    label: item.label,
    value: item[mode.valueKey]
  } : best), { label: period.points[0].label, value: period.points[0][mode.valueKey] });
}

function getLowPoint(period, mode) {
  return period.points.reduce((best, item) => (item[mode.valueKey] < best.value ? {
    label: item.label,
    value: item[mode.valueKey]
  } : best), { label: period.points[0].label, value: period.points[0][mode.valueKey] });
}

function getAnnualProjection(period) {
  if (state.view === "year") {
    return period.totalKWh;
  }
  if (state.view === "month") {
    return period.totalKWh * 12;
  }
  return period.totalKWh * 365;
}

function getBudgetScale(view) {
  if (view === "year") {
    return 1;
  }
  if (view === "month") {
    return 1 / 12;
  }
  return 1 / 30;
}

function getSelectionLabel() {
  if (state.view === "year") {
    return `${getActiveYear()} 年度`;
  }
  if (state.view === "month") {
    return `${getActiveYear()}年${shared.MONTHS[state.monthIndex]}`;
  }
  return isDatabaseModule() ? state.databaseDateKey : state.dateKey;
}

function formatAxisValue(value, unit) {
  if (unit === "t CO₂e") {
    return value >= 1 ? shared.formatNumber(value, 1) : shared.formatNumber(value, 2);
  }
  return shared.formatCompact(value);
}

function formatChartValue(value, unit) {
  const digits = unit === "t CO₂e" ? 3 : 1;
  return `${shared.formatNumber(value, digits)} ${unit}`;
}

function persistState(patch = {}) {
  const nextState = shared.setPlatformState({
    siteId: patch.siteId ?? state.siteId,
    timeRange: patch.timeRange ?? state.view,
    energyType: patch.energyType ?? state.energyType,
    monthIndex: patch.monthIndex ?? state.monthIndex,
    dateKey: patch.dateKey ?? state.dateKey,
    databaseYear: patch.databaseYear ?? state.databaseYear,
    databaseDateKey: patch.databaseDateKey ?? state.databaseDateKey,
    databaseAreaId: patch.databaseAreaId ?? state.databaseAreaId
  });

  state.siteId = nextState.siteId;
  state.view = nextState.timeRange;
  state.energyType = nextState.energyType;
  state.monthIndex = nextState.monthIndex;
  state.dateKey = nextState.dateKey;
  state.databaseYear = nextState.databaseYear;
  state.databaseDateKey = nextState.databaseDateKey;
  state.databaseAreaId = nextState.databaseAreaId;
}

function describeArc(cx, cy, outerRadius, innerRadius, startAngle, endAngle) {
  const startOuter = polarToCartesian(cx, cy, outerRadius, endAngle);
  const endOuter = polarToCartesian(cx, cy, outerRadius, startAngle);
  const startInner = polarToCartesian(cx, cy, innerRadius, endAngle);
  const endInner = polarToCartesian(cx, cy, innerRadius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  return [
    "M", startOuter.x, startOuter.y,
    "A", outerRadius, outerRadius, 0, largeArcFlag, 0, endOuter.x, endOuter.y,
    "L", endInner.x, endInner.y,
    "A", innerRadius, innerRadius, 0, largeArcFlag, 1, startInner.x, startInner.y,
    "Z"
  ].join(" ");
}

function polarToCartesian(cx, cy, radius, angleInDegrees) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(angleInRadians),
    y: cy + radius * Math.sin(angleInRadians)
  };
}

function createTag(text) {
  return `<span class="tag">${text}</span>`;
}

function createStatusBadge(text, danger) {
  return `<span class="badge ${danger ? "badge-danger" : "badge-success"}">${text}</span>`;
}

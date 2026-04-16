(function () {
  const OFFICE = {
    year: 2025,
    staff: 40,
    area: 520,
    gridFactor: 0.42,
    annualBudgetKWh: 58000,
    benchmarkEUI: 110,
    benchmarkPerCapCarbon: 0.61,
    carbonPrice: 78
  };

  const PLATFORM = {
    title: "双碳能源管理可视化平台",
    intro: "面向办公场景的能耗、碳排与能效一体化平台。",
    updatedAt: "2026-04-05 09:30",
    storageKey: "double-carbon-platform-state",
    sites: [
      {
        id: "demo-office",
        label: "绿色办公科技 / 总部办公区",
        note: "40人办公室场景"
      }
    ],
    energyTypes: [
      {
        id: "electricity",
        label: "用电量",
        note: "以购入电力数据为主"
      },
      {
        id: "water",
        label: "用水量",
        note: "查看自来水消耗"
      },
      {
        id: "gas",
        label: "天然气",
        note: "查看燃气消耗"
      },
      {
        id: "steam",
        label: "热力 / 蒸汽",
        note: "查看热力与蒸汽消耗"
      },
      {
        id: "combined",
        label: "综合能耗",
        note: "汇总全部能源类型"
      }
    ],
    timeRanges: [
      { id: "year", label: "按年" },
      { id: "month", label: "按月" },
      { id: "day", label: "按日" }
    ]
  };

  const MONTHS = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
  const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const UNITS = {
    carbonTon: "t CO₂e",
    carbonKg: "kg CO₂e",
    area: "m²",
    volume: "m³",
    electricity: "kWh",
    energy: "GJ"
  };

  OFFICE.carbonBudgetTons = round((OFFICE.annualBudgetKWh * OFFICE.gridFactor) / 1000, 2);

  const MENU_GROUPS = [
    {
      id: "energy-efficiency",
      title: "能耗与能效",
      description: "能耗查询、强度计算、分析与优化",
      items: ["energy-query", "energy-intensity", "energy-analysis", "benchmarking", "energy-flow", "balance-opt"]
    },
    {
      id: "carbon-management",
      title: "碳核算与管理",
      description: "预算管理、碳排放、碳足迹",
      items: ["budget-management", "carbon-emissions", "carbon-footprint"]
    },
    {
      id: "extension-assets",
      title: "扩展与资产",
      description: "供应链、核查支撑与碳资产管理",
      items: ["supply-chain", "verification", "carbon-assets"]
    }
  ];

  const MODULES = {
    "energy-query": {
      title: "能耗查询",
      groupId: "energy-efficiency",
      summary: "按年、月、日查看办公室用电趋势，快速定位峰值月份、异常日期和预算偏差。",
      explanation: "这个系统强调先把能耗看清楚。它把原始电表数据按时间聚合后展示出来，让管理者能快速发现高峰、低谷、加班和节假日等典型场景。",
      focus: [
        "查看年、月、日用电趋势",
        "定位异常日期和预算超支点",
        "用红绿状态直接提示是否超标"
      ],
      formulas: [
        { title: "时间段总电耗", equation: "时间段电耗 = Σ 分时电量(kWh)", note: "把小时级数据汇总到年、月、日。" },
        { title: "环比变化率", equation: "环比 = (本期电耗 - 上期电耗) / 上期电耗 × 100 %", note: "用于判断近期变化是否明显。" },
        { title: "碳排换算", equation: "碳排放 = 电耗 × 排放因子 / 1000", note: "排放因子为 0.42 kg CO₂e/kWh。" }
      ]
    },
    "energy-intensity": {
      title: "能源消费量与强度计算",
      groupId: "energy-efficiency",
      summary: "把电、水、气、热等能源统一折算为标准煤，并计算单位面积、单位产值和单位产品强度。",
      explanation: "本模块将不同能源消费量统一到可比较口径，完成综合能耗折算，并按面积、人数、产值或产品产量形成可对标的强度指标。",
      focus: [
        "按统一口径计算综合能耗和折标煤",
        "计算单位面积、人均、单位产值和单位产品强度",
        "提供在线换算器展示不同能源的折算过程"
      ],
      formulas: [
        { title: "综合能耗", equation: "综合能耗(tce) = Σ(能源消费量 × 折标煤系数) / 1000", note: "先把不同单位统一到标准煤口径。" },
        { title: "单位面积能耗", equation: "单位面积能耗 = 综合能耗 / 建筑面积", note: "适合建筑、园区和办公区横向比较。" },
        { title: "单位产值能耗", equation: "单位产值能耗 = 综合能耗 / 产值", note: "用于经营口径下的能效评价。" },
        { title: "单位产品能耗", equation: "单位产品能耗 = 产品对应综合能耗 / 产品产量", note: "用于生产口径下的能效评价。" }
      ]
    },
    "energy-analysis": {
      title: "能源消费分析与用能策略推荐",
      groupId: "energy-efficiency",
      summary: "围绕趋势、峰谷、异常、结构和节能潜力形成用能诊断，并输出可执行策略。",
      explanation: "该模块把能耗数据转化为管理动作：先识别趋势和异常，再拆解主要负荷来源，最后给出削峰、错峰、待机治理和重点区域改造建议。",
      focus: [
        "识别趋势变化、峰谷差和异常时段",
        "拆解空调、照明、动力等重点负荷占比",
        "测算节能、减排和成本节省潜力"
      ],
      formulas: [
        { title: "节能潜力", equation: "节能潜力 = 基线电耗 - 优化后预测电耗", note: "用于评估可节约空间。" },
        { title: "峰谷比", equation: "峰谷比 = 高峰用能 / 低谷用能", note: "用于判断用能波动和错峰空间。" },
        { title: "异常偏差", equation: "偏差率 = (实际值 - 基准值) / 基准值 × 100 %", note: "用于发现异常用能。" }
      ]
    },
    benchmarking: {
      title: "能效对标",
      groupId: "energy-efficiency",
      summary: "支持区域、时间、指标和目标线多维对标，并展示能效排行和高耗能对象。",
      explanation: "能效对标用于发现同类对象之间的效率差距，也用于观察当前周期与历史周期、目标值之间的偏差，帮助确定优先治理对象。",
      focus: [
        "支持区域横向对比和时间纵向对比",
        "对单位面积、单位人数和碳强度等指标进行目标线判断",
        "展示能效最优区域、高耗能区域和重点设备排行"
      ],
      formulas: [
        { title: "对标偏差", equation: "偏差率 = (实际强度 - 标杆强度) / 标杆强度 × 100 %", note: "正值表示高于标杆。" },
        { title: "时间变化率", equation: "变化率 = (当前值 - 对比期值) / 对比期值 × 100 %", note: "用于观察环比或相邻时段变化。" },
        { title: "单位面积碳强度", equation: "碳强度 = 时间段碳排放 / 建筑面积", note: "适合不同面积区域横向比较。" }
      ]
    },
    "energy-flow": {
      title: "能流分析",
      groupId: "energy-efficiency",
      summary: "展示能源从总输入到区域、表计、末端负荷和损耗节点的流向关系。",
      explanation: "能流分析用于识别能源输入、区域分配、末端负荷和损耗之间的关系，帮助定位主要耗能节点和计量缺口。",
      focus: [
        "展示数据驱动的能流拓扑和桑基图",
        "梳理总表、区域和末端节点的计量关系",
        "识别主要耗能节点和疑似损耗节点"
      ],
      formulas: [
        { title: "子系统占比", equation: "占比 = 子系统能耗 / 总能耗 × 100 %", note: "用于判断重点负荷。" },
        { title: "计量差额", equation: "计量差额 = 总表读数 - Σ分项读数", note: "用于核验总分表一致性。" },
        { title: "损耗率", equation: "损耗率 = 疑似损耗 / 总输入能量 × 100 %", note: "用于观察线路、管网或待机损耗。" }
      ]
    },
    "balance-opt": {
      title: "能效平衡与优化",
      groupId: "energy-efficiency",
      summary: "在负荷平衡、设备调度和损耗治理基础上模拟优化效果，并估算节能、减排和收益。",
      explanation: "能效平衡与优化用于把能流诊断结果转化为调度策略，兼顾舒适度、运行连续性、能耗成本和碳排约束。",
      focus: [
        "分析区域负荷分布是否均衡",
        "形成设备运行和高峰调度策略",
        "模拟优化前后节能、减排和收益变化"
      ],
      formulas: [
        { title: "能效平衡", equation: "输入能量 = 有效利用 + 待机损耗 + 运行损失", note: "用于定位损耗环节。" },
        { title: "优化收益", equation: "收益 = 节电量 × 电价 + 减排量 × 碳价", note: "适合做简单经济测算。" },
        { title: "负荷均衡度", equation: "均衡度 = 1 - max(区域占比 - 平均占比)", note: "用于判断局部负荷集中程度。" }
      ]
    },
    "budget-management": {
      title: "用能与碳排放预算管理",
      groupId: "carbon-management",
      summary: "配置用能与碳排预算，跟踪执行进度、剩余额度、预警状态和区域考核。",
      explanation: "预算管理用于把年度目标拆分到区域和时间周期，并持续跟踪能耗、碳排、偏差和预警，支撑月度执行复盘与区域考核。",
      focus: [
        "维护年度、月度和区域预算口径",
        "同步跟踪用能预算、碳排预算和剩余额度",
        "识别超预算风险并输出预算执行报表"
      ],
      formulas: [
        { title: "预算执行率", equation: "预算执行率 = 实际值 / 预算值 × 100 %", note: "超过 100 % 表示超预算。" },
        { title: "剩余预算", equation: "剩余预算 = 总预算 - 累计实际", note: "适合滚动预测。" },
        { title: "预警阈值", equation: "预警阈值 = 实际值 / 预算值", note: "接近或超过 1 时进入预警跟踪。" }
      ]
    },
    "carbon-emissions": {
      title: "碳排放",
      groupId: "carbon-management",
      summary: "根据能源活动数据自动计算碳排放，展示区域、能源类型、趋势、强度和减排成效。",
      explanation: "碳排放模块用于把电、水、气、热等能源活动数据按排放因子折算为统一的 CO₂e 口径，并支持从总览、结构、趋势和强度四个角度追踪排放状态。",
      focus: [
        "自动计算不同能源类型的碳排放",
        "按区域和能源类型查看排放结构",
        "跟踪碳排趋势、强度指标和减排效果"
      ],
      formulas: [
        { title: "碳排放核算", equation: "碳排放 = 活动数据 × 排放因子 / 1000", note: "把 kg CO₂e 折算为 t CO₂e。" },
        { title: "人均碳排", equation: "人均碳排 = 总碳排 / 办公人数", note: "可用于规模归一化比较。" },
        { title: "单位面积碳强度", equation: "单位面积碳强度 = 总碳排 / 建筑面积", note: "用于不同区域横向比较。" },
        { title: "减排量", equation: "减排量 = 基准排放 - 当前排放", note: "用于展示节能措施带来的碳收益。" }
      ]
    },
    "carbon-footprint": {
      title: "碳足迹核算",
      groupId: "carbon-management",
      summary: "按产品或服务单元核算碳足迹，拆分生命周期阶段，识别热点并生成报告。",
      explanation: "碳足迹核算用于把原材料、运输、生产运营、使用和废弃等阶段统一到产品或服务单元上，识别生命周期排放热点，并评估不同优化路径的减排效果。",
      focus: [
        "计算单位产品或服务单元碳足迹",
        "拆分生命周期阶段并识别排放热点",
        "生成碳足迹说明书并支持打印留档"
      ],
      formulas: [
        { title: "产品碳足迹", equation: "产品碳足迹 = Σ(阶段活动数据 × 阶段排放因子)", note: "覆盖生命周期内各阶段活动。" },
        { title: "单位产品碳足迹", equation: "单位产品碳足迹 = 生命周期总碳排 / 产品数量", note: "服务型场景可使用工位日等服务单元。" },
        { title: "热点占比", equation: "热点占比 = 某阶段碳排 / 生命周期总碳排 × 100 %", note: "用于识别优先减排环节。" },
        { title: "方案减排率", equation: "方案减排率 = (基准足迹 - 方案足迹) / 基准足迹 × 100 %", note: "用于比较材料或工艺调整效果。" }
      ]
    },
    "supply-chain": {
      title: "供应链碳管理",
      groupId: "extension-assets",
      summary: "结合采购金额、供应商碳强度和风险等级，识别高风险供应商。",
      explanation: "供应链碳管理关注上游协同，通过采购份额和碳强度识别重点对象。",
      focus: [
        "供应商采购占比与碳排贡献",
        "识别高风险供应商",
        "沉淀供应商台账"
      ],
      formulas: [
        { title: "供应商碳排", equation: "供应商碳排 = 采购量或采购额 × 供应商排放因子", note: "可按金额、数量或重量估算。" },
        { title: "加权碳强度", equation: "加权碳强度 = Σ(采购占比 × 供应商碳强度)", note: "用于评价整体供应链表现。" },
        { title: "高风险占比", equation: "高风险占比 = 高风险供应商碳排 / 总供应链碳排 × 100 %", note: "帮助确定优先治理对象。" }
      ]
    },
    verification: {
      title: "碳核查支撑",
      groupId: "extension-assets",
      summary: "管理核算边界、活动数据、排放因子、证据材料、核查报表和操作留痕。",
      explanation: "碳核查支撑用于把核算过程中的边界口径、活动数据、因子版本、原始凭证和修改记录集中管理，让内部审计和第三方核查能够追溯数据来源与变更过程。",
      focus: [
        "配置组织、区域和能源核算边界",
        "维护活动数据台账、排放因子和证据材料",
        "生成核查报表并保留日志留痕"
      ],
      formulas: [
        { title: "数据完整率", equation: "完整率 = 已采集数据点 / 应采集数据点 × 100 %", note: "判断数据是否齐全。" },
        { title: "差异率", equation: "差异率 = |申报值 - 核查值| / 核查值 × 100 %", note: "用于核查前后比对。" },
        { title: "追溯覆盖率", equation: "追溯覆盖率 = 有凭证数据量 / 总数据量 × 100 %", note: "衡量证据链完备性。" },
        { title: "因子版本匹配", equation: "核算排放 = 活动数据 × 对应年份排放因子", note: "保证活动数据和因子版本一致。" }
      ]
    },
    "carbon-assets": {
      title: "碳资产管理",
      groupId: "extension-assets",
      summary: "把碳预算、超额缺口、潜在减排量和碳价场景放在一起，展示碳成本与减排收益。",
      explanation: "碳资产管理把碳看作一种可管理资源，用预算缺口和减排潜力衡量经营影响。",
      focus: [
        "展示碳预算与超额缺口",
        "估算碳价场景下的成本与收益",
        "帮助管理层理解减排的资产意义"
      ],
      formulas: [
        { title: "配额盈余或缺口", equation: "配额结余 = 碳预算或配额 - 实际排放", note: "负值表示存在缺口。" },
        { title: "碳成本", equation: "碳成本 = 超额排放量 × 碳价", note: "可从财务角度评估风险。" },
        { title: "减排收益", equation: "减排收益 = 计划减排量 × 碳价", note: "用于论证节能项目价值。" }
      ]
    }
  };

  const DATA = generateOfficeData();

  function normalizePlatformState(input = {}) {
    const siteId = PLATFORM.sites.some((item) => item.id === input.siteId) ? input.siteId : PLATFORM.sites[0].id;
    const timeRange = PLATFORM.timeRanges.some((item) => item.id === input.timeRange) ? input.timeRange : "year";
    const energyType = PLATFORM.energyTypes.some((item) => item.id === input.energyType) ? input.energyType : "electricity";
    const currentYear = new Date().getFullYear();
    const databaseYear = Number.isInteger(input.databaseYear) && input.databaseYear >= 2000 && input.databaseYear <= 2100
      ? input.databaseYear
      : currentYear;
    const rawDatabaseAreaId = input.databaseAreaId === undefined ? "all" : String(input.databaseAreaId);
    const databaseAreaId = rawDatabaseAreaId === "all" || /^[1-9]\d*$/.test(rawDatabaseAreaId)
      ? rawDatabaseAreaId
      : "all";
    const databaseDateKey = typeof input.databaseDateKey === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.databaseDateKey)
      ? input.databaseDateKey
      : "";
    const monthIndex = Number.isInteger(input.monthIndex) && input.monthIndex >= 0 && input.monthIndex < MONTHS.length
      ? input.monthIndex
      : getDefaultMonthIndex();
    const selectedDate = typeof input.dateKey === "string" ? input.dateKey : "";
    const validDate = DATA.recordMap[selectedDate] && DATA.recordMap[selectedDate].month === monthIndex
      ? selectedDate
      : getDefaultDateKey(monthIndex);

    return {
      siteId,
      timeRange,
      energyType,
      monthIndex,
      dateKey: validDate,
      databaseYear,
      databaseDateKey,
      databaseAreaId,
      updatedAt: PLATFORM.updatedAt
    };
  }

  function readStoredPlatformState() {
    try {
      const raw = window.localStorage.getItem(PLATFORM.storageKey);
      return raw ? JSON.parse(raw) : {};
    } catch (error) {
      return {};
    }
  }

  function getPlatformState() {
    return normalizePlatformState(readStoredPlatformState());
  }

  function setPlatformState(patch = {}) {
    const nextState = normalizePlatformState({ ...getPlatformState(), ...patch });
    try {
      window.localStorage.setItem(PLATFORM.storageKey, JSON.stringify(nextState));
    } catch (error) {
      // Ignore local storage failures in file preview mode.
    }
    return nextState;
  }

  function getPlatformOptions() {
    return {
      sites: PLATFORM.sites.map((item) => ({ ...item })),
      timeRanges: PLATFORM.timeRanges.map((item) => ({ ...item })),
      energyTypes: PLATFORM.energyTypes.map((item) => ({ ...item })),
      updatedAt: PLATFORM.updatedAt
    };
  }

  function getTimeRangeLabel(timeRange) {
    const found = PLATFORM.timeRanges.find((item) => item.id === timeRange);
    return found ? found.label : PLATFORM.timeRanges[0].label;
  }

  function getEnergyTypeLabel(energyType) {
    const found = PLATFORM.energyTypes.find((item) => item.id === energyType);
    return found ? found.label : PLATFORM.energyTypes[0].label;
  }

  function generateOfficeData() {
    const rand = mulberry32(4025);
    const seasonalFactor = [1.14, 1.1, 0.97, 0.9, 0.92, 1.0, 1.24, 1.28, 1.06, 0.95, 1.03, 1.12];
    const weekdayFactor = [0.34, 1.0, 1.03, 1.02, 1.04, 1.08, 0.45];
    const budgetMonthBias = [1.02, 1.03, 1.02, 1.01, 1.0, 1.01, 0.95, 0.94, 0.99, 1.01, 1.02, 0.98];

    const holidays = new Map([
      ["2025-01-29", "春节假期"], ["2025-01-30", "春节假期"], ["2025-01-31", "春节假期"],
      ["2025-02-01", "春节假期"], ["2025-02-02", "春节假期"], ["2025-02-03", "春节假期"], ["2025-02-04", "春节假期"],
      ["2025-05-01", "劳动节假期"], ["2025-05-02", "劳动节假期"], ["2025-05-03", "劳动节假期"],
      ["2025-10-01", "国庆假期"], ["2025-10-02", "国庆假期"], ["2025-10-03", "国庆假期"], ["2025-10-04", "国庆假期"],
      ["2025-10-05", "国庆假期"], ["2025-10-06", "国庆假期"], ["2025-10-07", "国庆假期"]
    ]);

    const specialEvents = {
      "2025-03-27": { factor: 1.18, note: "季度结算加班", scenario: "overtime" },
      "2025-04-09": { factor: 0.86, note: "照明系统调试，局部节能", scenario: "retrofit" },
      "2025-06-18": { factor: 1.16, note: "客户开放日，会议室全天占用", scenario: "meeting" },
      "2025-07-22": { factor: 1.22, note: "持续高温，空调负荷明显升高", scenario: "heatwave" },
      "2025-08-15": { factor: 1.27, note: "服务器维护与夜间加班叠加", scenario: "maintenance" },
      "2025-09-12": { factor: 1.14, note: "培训活动集中，照明与投影设备高负荷", scenario: "training" },
      "2025-11-20": { factor: 0.88, note: "节能日试运行，提前关灯关空调", scenario: "campaign" },
      "2025-12-29": { factor: 1.19, note: "年度结账与加班", scenario: "overtime" }
    };

    const rawRecords = [];
    for (let month = 0; month < 12; month += 1) {
      const days = new Date(OFFICE.year, month + 1, 0).getDate();
      for (let day = 1; day <= days; day += 1) {
        const date = new Date(OFFICE.year, month, day);
        const key = toDateKey(date);
        const weekday = date.getDay();
        const isWeekend = weekday === 0 || weekday === 6;
        const holidayName = holidays.get(key);
        const hasHoliday = Boolean(holidayName);
        let note = isWeekend ? "周末值守" : "正常办公";
        let scenario = isWeekend ? "weekend" : "weekday";
        let base = isWeekend ? 55 : 154;
        let load = base * seasonalFactor[month] * weekdayFactor[weekday] * (0.95 + rand() * 0.12);

        if (!hasHoliday && !isWeekend && rand() > 0.77) {
          load *= 1.07 + rand() * 0.13;
          note = "部门加班";
          scenario = "overtime";
        }

        if (!hasHoliday && !isWeekend && month >= 6 && month <= 7) {
          load *= 1.02 + rand() * 0.05;
        }

        if (!hasHoliday && !isWeekend && (month <= 1 || month === 11)) {
          load *= 1.01 + rand() * 0.04;
        }

        if (hasHoliday) {
          load = 24 + rand() * 16;
          note = holidayName;
          scenario = "holiday";
        }

        if (specialEvents[key]) {
          load *= specialEvents[key].factor;
          note = specialEvents[key].note;
          scenario = specialEvents[key].scenario;
        }

        rawRecords.push({
          key,
          month,
          day,
          weekday,
          weekdayName: WEEKDAYS[weekday],
          isWeekend,
          holidayName,
          scenario,
          note,
          rawKWh: load
        });
      }
    }

    const desiredAnnual = 61280;
    const currentAnnual = rawRecords.reduce((sum, item) => sum + item.rawKWh, 0);
    const scale = desiredAnnual / currentAnnual;

    rawRecords.forEach((item) => {
      item.kWh = round(item.rawKWh * scale, 1);
      item.budgetKWh = round(buildDailyBudget(item, seasonalFactor, weekdayFactor, budgetMonthBias, scale), 1);
      item.carbon = round((item.kWh * OFFICE.gridFactor) / 1000, 3);
      item.energyGJ = round(item.kWh * 0.0036, 3);
    });

    const monthly = MONTHS.map((label, month) => {
      const days = rawRecords.filter((item) => item.month === month);
      const kWh = round(days.reduce((sum, item) => sum + item.kWh, 0), 1);
      const budgetKWh = round(days.reduce((sum, item) => sum + item.budgetKWh, 0), 1);
      const carbon = round(days.reduce((sum, item) => sum + item.carbon, 0), 3);
      return {
        month,
        label,
        days,
        kWh,
        budgetKWh,
        carbon,
        budgetCarbon: round((budgetKWh * OFFICE.gridFactor) / 1000, 3),
        energyGJ: round(kWh * 0.0036, 3)
      };
    });

    const annualKWh = round(monthly.reduce((sum, item) => sum + item.kWh, 0), 1);
    const annual = {
      kWh: annualKWh,
      budgetKWh: OFFICE.annualBudgetKWh,
      carbon: round((annualKWh * OFFICE.gridFactor) / 1000, 3),
      budgetCarbon: OFFICE.carbonBudgetTons,
      energyGJ: round(annualKWh * 0.0036, 3)
    };

    const suppliers = [
      { name: "ICT设备供应商", spend: 18, intensity: 0.51, emissions: 9.2, color: "#2a6b52" },
      { name: "办公耗材供应商", spend: 10, intensity: 0.36, emissions: 3.6, color: "#6aa383" },
      { name: "物业与保洁服务商", spend: 12, intensity: 0.41, emissions: 4.9, color: "#9bc5ab" },
      { name: "办公家具供应商", spend: 8, intensity: 0.34, emissions: 2.7, color: "#d2b06b" },
      { name: "快递与物流供应商", spend: 7, intensity: 0.44, emissions: 3.1, color: "#cf7458" }
    ];

    const verification = [
      { name: "已自动采集并核验", value: 82, color: "#2a6b52", note: "办公用电数据与时间戳已闭环" },
      { name: "已有凭证待复核", value: 10, color: "#d2b06b", note: "采购与票据已收集，待管理复核" },
      { name: "待补录数据", value: 8, color: "#c74837", note: "供应链问卷与部分凭证待补充" }
    ];

    const assetMix = [
      { label: "预算内排放", value: OFFICE.carbonBudgetTons, color: "#2a6b52", note: "企业年度碳预算" },
      { label: "超额缺口", value: round(Math.max(annual.carbon - OFFICE.carbonBudgetTons, 0), 2), color: "#c74837", note: "高于预算的部分" },
      { label: "计划减排量", value: 2.1, color: "#d2b06b", note: "空调优化与待机治理计划" }
    ];

    return {
      records: rawRecords,
      monthly,
      annual,
      suppliers,
      verification,
      assetMix,
      totalSupplierSpend: suppliers.reduce((sum, item) => sum + item.spend, 0),
      highRiskShare: (suppliers[0].emissions + suppliers[4].emissions) / suppliers.reduce((sum, item) => sum + item.emissions, 0),
      recordMap: Object.fromEntries(rawRecords.map((item) => [item.key, item])),
      insights: buildInsights(rawRecords, monthly)
    };
  }

  function buildInsights(records, monthly) {
    const abnormalDays = records.filter((item) => item.kWh > item.budgetKWh || item.kWh < item.budgetKWh * 0.7).length;
    const avgWeekend = average(records.filter((item) => item.isWeekend && !item.holidayName).map((item) => item.kWh));
    const overtimeRecords = records.filter((item) => item.scenario === "overtime" || item.note.includes("加班"));
    const overtimeShare = overtimeRecords.reduce((sum, item) => sum + item.kWh, 0) / records.reduce((sum, item) => sum + item.kWh, 0);
    const peakMonth = monthly.reduce((current, item) => (item.kWh > current.kWh ? item : current), monthly[0]);
    const lowMonth = monthly.reduce((current, item) => (item.kWh < current.kWh ? item : current), monthly[0]);
    const workdayRecords = records.filter((item) => !item.isWeekend && !item.holidayName);
    const workstationDays = workdayRecords.length * OFFICE.staff;

    return {
      abnormalDays,
      avgWeekend,
      overtimeShare,
      peakMonth,
      lowMonth,
      summerHvacShare: 0.47,
      savingPotentialKWh: 4850,
      savingPotentialCarbon: round((4850 * OFFICE.gridFactor) / 1000, 2),
      boundaryCoverage: 0.72,
      carbonPerWorkstationDay: (records.reduce((sum, item) => sum + item.carbon, 0) * 1000) / workstationDays,
      autoCollectionCoverage: 0.82,
      traceCoverage: 0.91
    };
  }

  function buildDailyBudget(item, seasonalFactor, weekdayFactor, budgetMonthBias, scale) {
    if (item.holidayName) {
      return (26 + (item.day % 5) * 2) * scale;
    }
    const base = item.isWeekend ? 58 : 148;
    return base * seasonalFactor[item.month] * weekdayFactor[item.weekday] * budgetMonthBias[item.month] * scale;
  }
  function getDefaultMonthIndex() {
    return 7;
  }

  function getDefaultDateKey(monthIndex) {
    const month = DATA.monthly[monthIndex];
    return month.days[Math.floor(month.days.length / 2)].key;
  }

  function getPeriod(options) {
    const view = options.view;
    if (view === "year") {
      return {
        label: `${OFFICE.year}年`,
        chartTitle: `${OFFICE.year}年月度趋势与预算对比`,
        chartMeta: "展示全年 12 个月的电耗变化和预算对比。",
        totalKWh: DATA.annual.kWh,
        totalCarbon: DATA.annual.carbon,
        energyGJ: DATA.annual.energyGJ,
        budgetKWh: DATA.annual.budgetKWh,
        budgetCarbon: DATA.annual.budgetCarbon,
        points: DATA.monthly.map((item) => ({
          label: item.label,
          value: item.kWh,
          budget: item.budgetKWh,
          carbon: item.carbon,
          budgetCarbon: item.budgetCarbon
        })),
        records: DATA.records
      };
    }

    if (view === "month") {
      const month = DATA.monthly[options.monthIndex];
      return {
        label: `${OFFICE.year}年${month.label}`,
        chartTitle: `${OFFICE.year}年${month.label}日度趋势与预算对比`,
        chartMeta: "用于查看当月每天的高低波动、周末值守和假期低负荷。",
        totalKWh: month.kWh,
        totalCarbon: month.carbon,
        energyGJ: month.energyGJ,
        budgetKWh: month.budgetKWh,
        budgetCarbon: month.budgetCarbon,
        points: month.days.map((item) => ({
          label: String(item.day),
          value: item.kWh,
          budget: item.budgetKWh,
          carbon: item.carbon,
          budgetCarbon: round((item.budgetKWh * OFFICE.gridFactor) / 1000, 3)
        })),
        records: month.days
      };
    }

    const record = DATA.recordMap[options.dateKey];
    const hourlyProfile = createHourlyProfile(record);
    return {
      label: record.key,
      chartTitle: `${record.key} 小时级负荷曲线`,
      chartMeta: `${record.weekdayName}，${record.note}。用于查看一天内的启动、峰值与回落。`,
      totalKWh: record.kWh,
      totalCarbon: record.carbon,
      energyGJ: record.energyGJ,
      budgetKWh: record.budgetKWh,
      budgetCarbon: round((record.budgetKWh * OFFICE.gridFactor) / 1000, 3),
      points: hourlyProfile.actual.map((value, hour) => ({
        label: `${hour}`,
        value,
        budget: hourlyProfile.budget[hour],
        carbon: round((value * OFFICE.gridFactor) / 1000, 3),
        budgetCarbon: round((hourlyProfile.budget[hour] * OFFICE.gridFactor) / 1000, 3)
      })),
      records: [record],
      selectedRecord: record
    };
  }

  function getEnergyBreakdown(period, options) {
    const monthIndex = options.view === "day" ? DATA.recordMap[options.dateKey].month : options.monthIndex;
    const record = options.view === "day" ? DATA.recordMap[options.dateKey] : null;
    const shares = getEnergyShares(monthIndex, record);
    return shares.map((item) => ({
      label: item.label,
      value: round(period.totalKWh * item.ratio, 1),
      color: item.color,
      note: item.note
    }));
  }

  function getPieData(moduleId, period, options) {
    if (moduleId === "supply-chain") {
      return {
        title: "办公供应链碳排结构",
        unit: "t CO₂e",
        centerLabel: "供应链碳排",
        items: DATA.suppliers.map((item) => ({
          label: item.name,
          value: item.emissions,
          color: item.color,
          note: `采购占比 ${formatPercent(item.spend / DATA.totalSupplierSpend)}`
        }))
      };
    }

    if (moduleId === "verification") {
      return {
        title: "数据质量与核查覆盖率",
        unit: "%",
        centerLabel: "覆盖率",
        items: DATA.verification.map((item) => ({
          label: item.name,
          value: item.value,
          color: item.color,
          note: item.note
        }))
      };
    }

    if (moduleId === "carbon-assets") {
      return {
        title: "碳预算与资产状态",
        unit: "t CO₂e",
        centerLabel: "资产状态",
        items: DATA.assetMix
      };
    }

    const energyItems = getEnergyBreakdown(period, options);
    const isCarbonMode = moduleId.startsWith("carbon") || options.energyType === "carbon";
    return {
      title: isCarbonMode ? "办公碳排结构拆分" : "办公用能结构拆分",
      unit: isCarbonMode ? "t CO₂e" : "kWh",
      centerLabel: isCarbonMode ? "当前碳排" : "当前用电",
      items: energyItems.map((item) => ({
        label: item.label,
        value: isCarbonMode ? round((item.value * OFFICE.gridFactor) / 1000, 2) : item.value,
        color: item.color,
        note: item.note
      }))
    };
  }

  function getMetrics(moduleId, period, options) {
    const annualEui = DATA.annual.kWh / OFFICE.area;
    const currentEui = period.totalKWh / OFFICE.area;
    const perCapKWh = period.totalKWh / OFFICE.staff;
    const perCapCarbon = period.totalCarbon / OFFICE.staff;
    const budgetGap = period.totalKWh - period.budgetKWh;
    const carbonGap = period.totalCarbon - period.budgetCarbon;
    const supplierIntensity = DATA.suppliers.reduce((sum, item) => sum + item.intensity * (item.spend / DATA.totalSupplierSpend), 0);
    const selectedRecord = options.view === "day" ? DATA.recordMap[options.dateKey] : null;
    const breakdown = getEnergyBreakdown(period, options);

    const base = {
      "energy-query": [
        metric("异常日期数量", `${DATA.insights.abnormalDays} 天`, "全年包含超预算日和极低负荷日。", DATA.insights.abnormalDays > 20),
        metric("峰值月份", DATA.insights.peakMonth.label, `${formatNumber(DATA.insights.peakMonth.kWh, 0)} kWh，为全年最高月。`, false),
        metric("周末基荷", `${formatNumber(DATA.insights.avgWeekend, 1)} kWh/日`, "周末仍有待机负荷。", DATA.insights.avgWeekend > 55),
        metric("预算差额", `${withSign(budgetGap)} kWh`, "高于预算时显示红色。", budgetGap > 0)
      ],
      "energy-intensity": [
        metric("年度 EUI", `${formatNumber(annualEui, 1)} kWh/m²`, "与年度目标 110 kWh/m² 比较。", annualEui > OFFICE.benchmarkEUI),
        metric("当前人均电耗", `${formatNumber(perCapKWh, 1)} kWh/人`, "当前维度的人均强度。", false),
        metric("当前人均碳排", `${formatNumber(perCapCarbon, 2)} t CO₂e/人`, "便于规模归一化比较。", perCapCarbon > OFFICE.benchmarkPerCapCarbon / 12),
        metric("当前终端能耗", `${formatNumber(period.energyGJ, 2)} GJ`, "按 GJ 展示终端能耗。", false)
      ],
      "energy-analysis": [
        metric("夏季空调占比", `${formatPercent(DATA.insights.summerHvacShare)}`, "夏季空调是最明显的拉升项。", DATA.insights.summerHvacShare > 0.45),
        metric("加班负荷占比", `${formatPercent(DATA.insights.overtimeShare)}`, "夜间加班推高尾峰。", DATA.insights.overtimeShare > 0.1),
        metric("可节电潜力", `${formatNumber(DATA.insights.savingPotentialKWh, 0)} kWh/年`, "按当前结果估算。", false),
        metric("潜在减排量", `${formatNumber(DATA.insights.savingPotentialCarbon, 2)} t CO₂e`, "节能潜力同步折算为碳效益。", false)
      ],
      benchmarking: [
        metric("年度对标偏差", `${formatPercent((annualEui - OFFICE.benchmarkEUI) / OFFICE.benchmarkEUI)}`, "与年度 EUI 目标的偏差。", annualEui > OFFICE.benchmarkEUI),
        metric("最佳月份", DATA.insights.lowMonth.label, `${formatNumber(DATA.insights.lowMonth.kWh, 0)} kWh，为全年最低月。`, false),
        metric("年度人均碳排", `${formatNumber(DATA.annual.carbon / OFFICE.staff, 2)} t CO₂e/人`, "可与内部标杆比较。", DATA.annual.carbon / OFFICE.staff > OFFICE.benchmarkPerCapCarbon),
        metric("当前单位面积电耗", `${formatNumber(currentEui, 2)} kWh/m²`, "当前时间段单位面积强度。", currentEui > OFFICE.benchmarkEUI / 12)
      ],
      "energy-flow": [
        metric("空调负荷占比", `${formatPercent(breakdown[0].value / period.totalKWh)}`, "办公场景的第一大负荷项。", breakdown[0].value / period.totalKWh > 0.44),
        metric("照明占比", `${formatPercent(breakdown[1].value / period.totalKWh)}`, "与办公时段高度相关。", false),
        metric("IT 设备占比", `${formatPercent(breakdown[2].value / period.totalKWh)}`, "反映设备运行与待机状态。", false),
        metric("其他与待机", `${formatPercent(breakdown[4].value / period.totalKWh)}`, "对周末基荷影响较大。", breakdown[4].value / period.totalKWh > 0.1)
      ],
      "balance-opt": [
        metric("有效利用电量", `${formatNumber(period.totalKWh * 0.84, 1)} kWh`, "约 84 % 视为有效利用。", false),
        metric("待机损耗", `${formatNumber(period.totalKWh * 0.08, 1)} kWh`, "主要集中在夜间和周末。", true),
        metric("运行损失", `${formatNumber(period.totalKWh * 0.08, 1)} kWh`, "与控制精细度和运行效率相关。", false),
        metric("优化收益", `¥${formatNumber(DATA.insights.savingPotentialKWh * 0.92 + DATA.insights.savingPotentialCarbon * OFFICE.carbonPrice, 0)}`, "按电价和碳价场景估算。", false)
      ],
      "budget-management": [
        metric("能耗执行率", `${formatPercent(period.totalKWh / period.budgetKWh)}`, "超过 100 % 表示高于预算。", period.totalKWh > period.budgetKWh),
        metric("碳排执行率", `${formatPercent(period.totalCarbon / period.budgetCarbon)}`, "同步跟踪碳预算偏差。", period.totalCarbon > period.budgetCarbon),
        metric("剩余碳预算", `${formatNumber(Math.max(period.budgetCarbon - period.totalCarbon, 0), 2)} t CO₂e`, "为 0 表示已经超预算。", period.totalCarbon > period.budgetCarbon),
        metric("累计差额", `${withSign(budgetGap)} kWh`, "用于滚动预测风险。", budgetGap > 0)
      ],
      "carbon-emissions": [
        metric("排放因子", `${OFFICE.gridFactor} kg CO₂e/kWh`, "当前因子可按地区实际数据替换。", false),
        metric("当前碳排", `${formatNumber(period.totalCarbon, 2)} t CO₂e`, "购入电力 Scope 2。", period.totalCarbon > period.budgetCarbon),
        metric("年度碳预算", `${formatNumber(OFFICE.carbonBudgetTons, 2)} t CO₂e`, "与能耗预算同步设置。", false),
        metric("预算偏差", `${withSign(carbonGap)} t CO₂e`, "高于基准时显示红色。", carbonGap > 0)
      ],
      "carbon-footprint": [
        metric("边界覆盖率", `${formatPercent(DATA.insights.boundaryCoverage)}`, "已纳入办公用电、差旅与采购边界。", DATA.insights.boundaryCoverage < 0.8),
        metric("组织碳足迹", `${formatNumber(DATA.annual.carbon, 2)} t CO₂e`, "以办公室组织边界核算。", DATA.annual.carbon > OFFICE.carbonBudgetTons),
        metric("工位日碳足迹", `${formatNumber(DATA.insights.carbonPerWorkstationDay, 2)} kg CO₂e/工位日`, "便于服务量归一化比较。", false),
        metric("边界扩展方向", "差旅 / 采购 / 废弃物", "待补充服务活动记录。", false)
      ],
      "supply-chain": [
        metric("加权碳强度", `${formatNumber(supplierIntensity, 3)} t CO₂e/万元`, "按采购额加权得到的供应链平均强度。", supplierIntensity > 0.18),
        metric("高风险供应商占比", `${formatPercent(DATA.highRiskShare)}`, "高风险供应商贡献了更高比例的上游碳排。", DATA.highRiskShare > 0.35),
        metric("优先整改对象", DATA.suppliers[0].name, `${formatNumber(DATA.suppliers[0].emissions, 1)} t CO₂e，为第一高排放项。`, false),
        metric("采购问卷覆盖率", `${formatPercent(0.8)}`, "5 家中的 4 家已完成问卷。", 0.8 < 0.9)
      ],
      verification: [
        metric("数据完整率", `${formatPercent(DATA.verification[0].value / 100)}`, "日电表数据已全量生成并留痕。", false),
        metric("自动采集覆盖率", `${formatPercent(DATA.insights.autoCollectionCoverage)}`, "用于观察采集覆盖程度。", DATA.insights.autoCollectionCoverage < 0.85),
        metric("凭证追溯覆盖率", `${formatPercent(DATA.insights.traceCoverage)}`, "用于支撑第三方核查。", DATA.insights.traceCoverage < 0.9),
        metric("估计不确定度", "±4.6 %", "示范核算中的综合不确定度。", false)
      ],
      "carbon-assets": [
        metric("碳缺口", `${formatNumber(DATA.annual.carbon - OFFICE.carbonBudgetTons, 2)} t CO₂e`, "正值表示需要补足。", DATA.annual.carbon > OFFICE.carbonBudgetTons),
        metric("潜在碳成本", `¥${formatNumber((DATA.annual.carbon - OFFICE.carbonBudgetTons) * OFFICE.carbonPrice, 0)}`, "按碳价场景估算超额成本。", DATA.annual.carbon > OFFICE.carbonBudgetTons),
        metric("计划减排量", `${formatNumber(DATA.assetMix[2].value, 2)} t CO₂e`, "空调优化与待机治理计划。", false),
        metric("选定日期状态", selectedRecord ? selectedRecord.note : "年度汇总", selectedRecord ? "切换到日视图可追踪单日风险成因。" : "建议切到日视图查看单日波动。", selectedRecord && selectedRecord.kWh > selectedRecord.budgetKWh)
      ]
    };

    const result = base[moduleId];
    result.statusSummary = carbonGap > 0 ? "当前碳排高于预算。" : "当前碳排低于预算。";
    return result;
  }

  function getEventItems(period, options) {
    if (options.view === "day") {
      const record = DATA.recordMap[options.dateKey];
      const profile = createHourlyProfile(record);
      return profile.actual
        .map((value, hour) => ({ hour, value, budget: profile.budget[hour] }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 3)
        .map((item, index) => ({
          title: `小时峰值 ${index + 1}: ${String(item.hour).padStart(2, "0")}:00`,
          badgeLabel: item.value > item.budget ? "偏高" : "正常",
          danger: item.value > item.budget,
          copy: `该时段负荷约 ${formatNumber(item.value, 1)} kWh；对应日期备注为“${record.note}”。`
        }));
    }

    const records = options.view === "year" ? DATA.records : DATA.monthly[options.monthIndex].days;
    return records
      .map((item) => ({ item, gap: item.kWh - item.budgetKWh }))
      .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))
      .slice(0, 4)
      .map(({ item, gap }) => ({
        title: `${item.key} ${item.weekdayName}`,
        badgeLabel: gap > 0 ? "超预算" : "低负荷",
        danger: gap > 0,
        copy: `${item.note}，实际 ${formatNumber(item.kWh, 1)} kWh，预算 ${formatNumber(item.budgetKWh, 1)} kWh，差额 ${withSign(gap)} kWh。`
      }));
  }

  function getRecommendations(moduleId) {
    const moduleSpecific = {
      "energy-query": { title: "先从红色日期排查", copy: "建议优先查看红色日期，判断是业务活动、气候波动还是设备控制问题。" },
      "energy-intensity": { title: "面积和人数保持可维护", copy: "办公人数、出租率和有效面积应定期维护。" },
      "energy-analysis": { title: "联动预警规则", copy: "连续超预算或周末基荷过高时自动触发提醒。" },
      benchmarking: { title: "先做内部对标", copy: "建议先用企业内部楼层或相似办公区建立基准线，再逐步引入外部参考。" },
      "energy-flow": { title: "优先补齐分项计量", copy: "建议补充空调、照明和插座分项表计，结构图会更准确。" },
      "balance-opt": { title: "把收益转换成财务语言", copy: "建议同步展示投资回收期、节电收益和减排收益。" },
      "budget-management": { title: "建议做滚动预测", copy: "可以结合季节因子和历史趋势按月滚动修正预算。" },
      "carbon-emissions": { title: "排放因子可切换", copy: "按地区、年度版本或核算口径切换排放因子。" },
      "carbon-footprint": { title: "下一步扩展边界", copy: "办公用电稳定后，可继续纳入差旅、采购和废弃物数据。" },
      "supply-chain": { title: "把碳指标写进采购规则", copy: "建议把供应商碳数据填报和绿色评分纳入招标条件。" },
      verification: { title: "加强版本与证据留痕", copy: "保留因子版本号、上传凭证和审批日志。" },
      "carbon-assets": { title: "减排项目与碳成本联动", copy: "同时展示不改造的成本和改造后的收益，会更利于决策。" }
    };

    return [
      { title: "优先治理夏季空调", copy: `${DATA.insights.peakMonth.label}为全年峰值月，建议先优化温控和分区启停策略。` },
      { title: "收紧周末待机基荷", copy: `当前周末平均电耗 ${formatNumber(DATA.insights.avgWeekend, 1)} kWh/日，建议重点治理打印设备和茶水间设备待机。` },
      moduleSpecific[moduleId],
      { title: "针对加班尾峰设置规则", copy: `加班相关负荷约占全年 ${formatPercent(DATA.insights.overtimeShare)}，可设置下班后延时关闭照明和会议室空调。` }
    ];
  }

  function getOverviewStats() {
    const overBudgetMonths = DATA.monthly.filter((item) => item.kWh > item.budgetKWh).length;
    const overBudgetDays = DATA.records.filter((item) => item.kWh > item.budgetKWh).length;
    return [
      { label: "年度总用电量", value: `${formatNumber(DATA.annual.kWh, 0)} kWh`, note: "40人办公室全年结果", danger: false },
      { label: "年度总碳排放", value: `${formatNumber(DATA.annual.carbon, 2)} t CO₂e`, note: "按购入电力 Scope 2 核算", danger: DATA.annual.carbon > OFFICE.carbonBudgetTons },
      { label: "超预算月份", value: `${overBudgetMonths} 个月`, note: "用于展示红绿预警场景", danger: overBudgetMonths > 0 },
      { label: "超预算日期", value: `${overBudgetDays} 天`, note: "便于月度和日度分析", danger: overBudgetDays > 0 }
    ];
  }

  function getCategoryCards() {
    return MENU_GROUPS.map((group) => ({
      title: group.title,
      description: group.description,
      systems: group.items.map((itemId) => MODULES[itemId].title)
    }));
  }
  function getMonths() {
    return MONTHS.slice();
  }

  function getDaysForMonth(monthIndex) {
    return DATA.monthly[monthIndex].days;
  }

  function getModule(moduleId) {
    return MODULES[moduleId] || MODULES["energy-query"];
  }

  function getGroup(groupId) {
    return MENU_GROUPS.find((item) => item.id === groupId);
  }

  function getGroupIdByModule(moduleId) {
    return getModule(moduleId).groupId;
  }

  function createHourlyProfile(record) {
    const templates = {
      holiday: normalizeArray([0.02, 0.02, 0.02, 0.02, 0.03, 0.03, 0.03, 0.04, 0.04, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.04, 0.04, 0.03, 0.03, 0.02]),
      weekend: normalizeArray([0.015, 0.015, 0.015, 0.015, 0.02, 0.025, 0.03, 0.04, 0.05, 0.055, 0.06, 0.06, 0.06, 0.06, 0.06, 0.06, 0.055, 0.05, 0.045, 0.04, 0.035, 0.03, 0.025, 0.02]),
      workday: normalizeArray([0.012, 0.012, 0.012, 0.012, 0.014, 0.017, 0.025, 0.04, 0.055, 0.065, 0.07, 0.068, 0.06, 0.058, 0.062, 0.068, 0.072, 0.07, 0.06, 0.045, 0.035, 0.025, 0.018, 0.015]),
      summer: normalizeArray([0.012, 0.012, 0.012, 0.012, 0.014, 0.018, 0.028, 0.045, 0.06, 0.072, 0.078, 0.076, 0.064, 0.06, 0.064, 0.072, 0.078, 0.075, 0.064, 0.048, 0.036, 0.026, 0.018, 0.014]),
      overtime: normalizeArray([0.012, 0.012, 0.012, 0.012, 0.014, 0.017, 0.025, 0.04, 0.055, 0.065, 0.07, 0.067, 0.058, 0.055, 0.058, 0.065, 0.072, 0.075, 0.07, 0.058, 0.047, 0.034, 0.022, 0.016]),
      maintenance: normalizeArray([0.014, 0.014, 0.014, 0.014, 0.016, 0.018, 0.026, 0.042, 0.055, 0.065, 0.07, 0.068, 0.06, 0.058, 0.064, 0.07, 0.078, 0.082, 0.078, 0.064, 0.05, 0.036, 0.025, 0.018])
    };

    let profile = templates.workday;
    if (record.holidayName) {
      profile = templates.holiday;
    } else if (record.scenario === "maintenance") {
      profile = templates.maintenance;
    } else if (record.scenario === "overtime") {
      profile = templates.overtime;
    } else if (record.isWeekend) {
      profile = templates.weekend;
    } else if (record.month >= 6 && record.month <= 7) {
      profile = templates.summer;
    }

    const budgetProfile = record.isWeekend || record.holidayName ? templates.weekend : templates.workday;

    return {
      actual: profile.map((ratio) => round(record.kWh * ratio, 1)),
      budget: budgetProfile.map((ratio) => round(record.budgetKWh * ratio, 1))
    };
  }

  function getEnergyShares(monthIndex, record) {
    let shares = [
      { label: "空调与新风", ratio: 0.41, color: "#2a6b52", note: "受季节影响最明显" },
      { label: "照明系统", ratio: 0.18, color: "#6aa383", note: "与办公时段高度相关" },
      { label: "IT设备与工位", ratio: 0.21, color: "#9bc5ab", note: "电脑、显示器与弱电设备" },
      { label: "插座与办公辅机", ratio: 0.12, color: "#d2b06b", note: "打印、茶水间与会议设备" },
      { label: "其他与待机损耗", ratio: 0.08, color: "#cf7458", note: "夜间与周末基荷的重要组成" }
    ];

    if (monthIndex >= 6 && monthIndex <= 7) {
      shares = [
        { ...shares[0], ratio: 0.46 },
        { ...shares[1], ratio: 0.17 },
        { ...shares[2], ratio: 0.19 },
        { ...shares[3], ratio: 0.11 },
        { ...shares[4], ratio: 0.07 }
      ];
    }

    if (monthIndex <= 1 || monthIndex === 11) {
      shares = [
        { ...shares[0], ratio: shares[0].ratio + 0.03 },
        { ...shares[1], ratio: shares[1].ratio - 0.01 },
        { ...shares[2], ratio: shares[2].ratio - 0.01 },
        { ...shares[3], ratio: shares[3].ratio },
        { ...shares[4], ratio: shares[4].ratio - 0.01 }
      ];
    }

    if (record && (record.isWeekend || record.holidayName)) {
      shares = [
        { ...shares[0], ratio: 0.34 },
        { ...shares[1], ratio: 0.11 },
        { ...shares[2], ratio: 0.27 },
        { ...shares[3], ratio: 0.13 },
        { ...shares[4], ratio: 0.15 }
      ];
    }

    return normalizeShareObjects(shares);
  }

  function metric(label, value, note, danger) {
    return {
      label,
      value,
      note,
      danger,
      statusClass: danger ? "status-danger" : "status-success"
    };
  }

  function toDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function normalizeArray(values) {
    const total = values.reduce((sum, value) => sum + value, 0);
    return values.map((value) => value / total);
  }

  function normalizeShareObjects(items) {
    const total = items.reduce((sum, item) => sum + item.ratio, 0);
    return items.map((item) => ({ ...item, ratio: item.ratio / total }));
  }

  function average(values) {
    if (!values.length) {
      return 0;
    }
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  function round(value, digits = 2) {
    return Number(value.toFixed(digits));
  }

  function formatNumber(value, digits = 0) {
    return Number(value).toLocaleString("zh-CN", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    });
  }

  function formatPercent(value) {
    return `${formatNumber(value * 100, 1)} %`;
  }

  function formatCompact(value) {
    if (value >= 1000) {
      return `${formatNumber(value / 1000, 1)}k`;
    }
    return formatNumber(value, 0);
  }

  function formatPieValue(value, unit) {
    if (unit === "%") {
      return `${formatNumber(value, 0)} %`;
    }
    if (unit === "t CO₂e") {
      return `${formatNumber(value, 2)} ${unit}`;
    }
    const digits = unit === "m\u00b3" || unit === "GJ" ? 1 : 0;
    return `${formatNumber(value, digits)} ${unit}`;
  }

  function withSign(value) {
    const fixed = formatNumber(value, Math.abs(value) >= 10 ? 1 : 2);
    return `${value > 0 ? "+" : ""}${fixed}`;
  }

  function mulberry32(seed) {
    let value = seed >>> 0;
    return function random() {
      value += 0x6D2B79F5;
      let temp = value;
      temp = Math.imul(temp ^ (temp >>> 15), temp | 1);
      temp ^= temp + Math.imul(temp ^ (temp >>> 7), temp | 61);
      return ((temp ^ (temp >>> 14)) >>> 0) / 4294967296;
    };
  }

  window.CarbonShared = {
    OFFICE,
    UNITS,
    PLATFORM,
    DATA,
    MENU_GROUPS,
    MODULES,
    MONTHS,
    getPlatformOptions,
    getPlatformState,
    setPlatformState,
    getTimeRangeLabel,
    getEnergyTypeLabel,
    getModule,
    getGroup,
    getGroupIdByModule,
    getOverviewStats,
    getCategoryCards,
    getDefaultMonthIndex,
    getDefaultDateKey,
    getMonths,
    getDaysForMonth,
    getPeriod,
    getPieData,
    getMetrics,
    getEventItems,
    getRecommendations,
    formatNumber,
    formatPercent,
    formatCompact,
    formatPieValue,
    withSign
  };
}());

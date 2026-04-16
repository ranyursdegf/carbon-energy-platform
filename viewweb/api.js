(function () {
  // 静态文件直接打开时走本地后端地址；通过 Spring Boot 访问时走同源 /api。
  const fallbackBase = window.location.protocol === "file:"
    ? "http://localhost:3000/api"
    : "/api";
  const baseUrl = window.localStorage.getItem("carbon-api-base") || fallbackBase;
  const adminStorageKey = "carbon-admin-auth";

  async function request(path, options = {}) {
    const { skipAuth = false, headers = {}, ...fetchOptions } = options;
    const adminAuth = skipAuth ? null : getAdminAuth();
    const requestHeaders = {
      "Content-Type": "application/json",
      ...headers
    };
    if (adminAuth && adminAuth.token) {
      requestHeaders.Authorization = `Bearer ${adminAuth.token}`;
    }

    let response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        headers: requestHeaders,
        ...fetchOptions
      });
    } catch (error) {
      throw new Error("数据服务暂不可用，请确认平台已启动后重试。");
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      let message = payload.error && payload.error.message
        ? payload.error.message
        : `数据请求失败：${response.status}`;
      if (!payload.error && response.status === 404) {
        message = "登录服务暂不可用，请稍后重试。";
      }
      throw new Error(message);
    }
    return payload.data;
  }

  function getAdminAuth() {
    try {
      const raw = window.localStorage.getItem(adminStorageKey);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      if (parsed.expiresAt && Date.parse(parsed.expiresAt) <= Date.now()) {
        clearAdminAuth();
        return null;
      }
      return parsed;
    } catch (error) {
      clearAdminAuth();
      return null;
    }
  }

  function setAdminAuth(auth) {
    window.localStorage.setItem(adminStorageKey, JSON.stringify(auth));
  }

  function clearAdminAuth() {
    window.localStorage.removeItem(adminStorageKey);
  }

  window.CarbonApi = {
    baseUrl,
    getAdminAuth,
    clearAdminAuth,
    // 页面层只调用这里的方法，后续换接口路径时不用到各个页面里散改。
    getHealth: () => request("/health"),
    loginAdmin: async (data) => {
      const auth = await request("/auth/login", {
        method: "POST",
        body: JSON.stringify(data),
        skipAuth: true
      });
      setAdminAuth(auth);
      return auth;
    },
    getCurrentAdmin: () => request("/auth/me"),
    changeAdminPassword: async (data) => {
      await request("/auth/change-password", {
        method: "POST",
        body: JSON.stringify(data)
      });
      clearAdminAuth();
    },
    logoutAdmin: async () => {
      try {
        await request("/auth/logout", { method: "POST" });
      } finally {
        clearAdminAuth();
      }
    },
    getDashboardOverview: (params = {}) => request(`/dashboard/overview${toQuery(params)}`),
    getAreaRanking: () => request("/dashboard/area-ranking"),
    listEnergyTypes: () => request("/energy-types"),
    convertEnergy: (data) => request("/energy-calculator/convert", {
      method: "POST",
      body: JSON.stringify(data)
    }),
    getEnergyIntensitySummary: (params = {}) => request(`/energy-intensity/summary${toQuery(params)}`),
    listMeters: (params = {}) => request(`/meters${toQuery(params)}`),
    getEnergySummary: (params = {}) => request(`/energy-readings/summary${toQuery(params)}`),
    listAuditLogs: (params = {}) => request(`/audit-logs${toQuery(params)}`),
    listAreas: (params = {}) => request(`/areas${toQuery(params)}`),
    createArea: (data) => request("/areas", {
      method: "POST",
      body: JSON.stringify(data)
    }),
    updateArea: (id, data) => request(`/areas/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data)
    }),
    deleteArea: (id) => request(`/areas/${id}`, { method: "DELETE" }),
    addElectricityReading: (areaId, data) => request(`/areas/${areaId}/electricity-readings`, {
      method: "POST",
      body: JSON.stringify(data)
    }),
    listElectricityReadings: (areaId, params = {}) => request(`/areas/${areaId}/electricity-readings${toQuery(params)}`),
    getElectricitySummary: (areaId, params = {}) => request(`/areas/${areaId}/electricity-summary${toQuery(params)}`)
  };

  function toQuery(params) {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        search.set(key, value);
      }
    });
    const query = search.toString();
    return query ? `?${query}` : "";
  }
})();

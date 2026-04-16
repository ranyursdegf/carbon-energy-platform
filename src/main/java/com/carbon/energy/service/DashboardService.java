package com.carbon.energy.service;

import static com.carbon.energy.support.RequestUtils.normalizeDateTime;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class DashboardService {

  private final JdbcTemplate jdbcTemplate;

  public DashboardService(JdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = jdbcTemplate;
  }

  public Map<String, Object> getOverview(String from, String to) {
    // 汇总接口当前基于兼容电耗表，后续可切换到 v_area_energy_monthly 支持多能源驾驶舱。
    List<Object> params = new ArrayList<>();
    List<String> filters = new ArrayList<>();
    filters.add("a.is_active = 1");

    if (from != null && !from.isBlank()) {
      filters.add("r.reading_time >= ?");
      params.add(normalizeDateTime(from, "from"));
    }
    if (to != null && !to.isBlank()) {
      filters.add("r.reading_time <= ?");
      params.add(normalizeDateTime(to, "to"));
    }

    return jdbcTemplate.queryForMap("""
        SELECT
          COUNT(DISTINCT a.id) AS area_count,
          COALESCE(SUM(r.kwh), 0) AS total_kwh,
          COALESCE(SUM(r.kwh * a.grid_emission_factor) / 1000, 0) AS total_carbon_tons,
          MAX(r.reading_time) AS latest_reading_time
        FROM areas a
        LEFT JOIN electricity_readings r ON r.area_id = a.id
        WHERE %s
        """.formatted(String.join(" AND ", filters)), params.toArray());
  }

  public List<Map<String, Object>> getAreaRanking() {
    return jdbcTemplate.queryForList("""
        SELECT
          a.id,
          a.name,
          a.code,
          COALESCE(SUM(r.kwh), 0) AS total_kwh,
          COALESCE(SUM(r.kwh * a.grid_emission_factor) / 1000, 0) AS total_carbon_tons
        FROM areas a
        LEFT JOIN electricity_readings r ON r.area_id = a.id
        WHERE a.is_active = 1
        GROUP BY a.id
        ORDER BY total_kwh DESC
        LIMIT 10
        """);
  }
}

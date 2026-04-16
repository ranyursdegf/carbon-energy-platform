package com.carbon.energy.service;

import static com.carbon.energy.support.RequestUtils.allowed;
import static com.carbon.energy.support.RequestUtils.badRequest;
import static com.carbon.energy.support.RequestUtils.normalizeDateTime;
import static com.carbon.energy.support.RequestUtils.optionalDecimal;
import static com.carbon.energy.support.RequestUtils.optionalInteger;
import static com.carbon.energy.support.RequestUtils.optionalLong;
import static com.carbon.energy.support.RequestUtils.optionalString;
import static com.carbon.energy.support.RequestUtils.positiveIntOrDefault;
import static com.carbon.energy.support.RequestUtils.positiveLong;
import static com.carbon.energy.support.RequestUtils.requiredString;

import java.math.BigDecimal;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * 区域和电耗兼容服务。
 *
 * <p>这个类承接当前前端“区域与用电数据”页面的接口。
 * 后续更多能源类型建议走 EnergyService 里的通用 energy_readings 表。</p>
 */
@Service
public class AreaService {

  private static final Set<String> AREA_TYPES = Set.of("park", "building", "floor", "room", "office", "custom");
  private static final Set<String> PERIOD_TYPES = Set.of("hour", "day", "month", "year");
  private static final Set<String> GROUP_BY_TYPES = Set.of("hour", "day", "month", "year");

  private final JdbcTemplate jdbcTemplate;
  private final AuditService auditService;

  public AreaService(JdbcTemplate jdbcTemplate, AuditService auditService) {
    this.jdbcTemplate = jdbcTemplate;
    this.auditService = auditService;
  }

  /**
   * 查询区域列表。includeStats=true 时会把兼容电耗表 electricity_readings 的汇总一起返回。
   */
  public List<Map<String, Object>> listAreas(boolean includeInactive, boolean includeStats, String limitValue, String pageValue) {
    int limit = Math.min(positiveIntOrDefault(limitValue, 100), 500);
    int offset = Math.max(positiveIntOrDefault(pageValue, 1) - 1, 0) * limit;
    String where = includeInactive ? "1 = 1" : "a.is_active = 1";
    String selectStats = includeStats ? """
        ,
        COALESCE(SUM(r.kwh), 0) AS total_kwh,
        COALESCE(SUM(r.kwh * a.grid_emission_factor) / 1000, 0) AS total_carbon_tons,
        MAX(r.reading_time) AS latest_reading_time
        """ : "";
    String joinStats = includeStats ? "LEFT JOIN electricity_readings r ON r.area_id = a.id" : "";
    String groupBy = includeStats ? "GROUP BY a.id" : "";

    String sql = """
        SELECT
          a.id,
          a.organization_id,
          o.name AS organization_name,
          a.parent_area_id,
          a.code,
          a.name,
          a.area_type,
          a.floor_area_m2,
          a.staff_count,
          a.grid_emission_factor,
          a.annual_budget_kwh,
          a.note,
          a.is_active,
          a.created_at,
          a.updated_at
          %s
        FROM areas a
        JOIN organizations o ON o.id = a.organization_id
        %s
        WHERE %s
        %s
        ORDER BY a.created_at DESC
        LIMIT ? OFFSET ?
        """.formatted(selectStats, joinStats, where, groupBy);

    return jdbcTemplate.queryForList(sql, limit, offset);
  }

  public Map<String, Object> getArea(long id) {
    List<Map<String, Object>> rows = jdbcTemplate.queryForList("""
        SELECT
          a.id,
          a.organization_id,
          o.name AS organization_name,
          a.parent_area_id,
          a.code,
          a.name,
          a.area_type,
          a.floor_area_m2,
          a.staff_count,
          a.grid_emission_factor,
          a.annual_budget_kwh,
          a.note,
          a.is_active,
          a.created_at,
          a.updated_at
        FROM areas a
        JOIN organizations o ON o.id = a.organization_id
        WHERE a.id = ?
        LIMIT 1
        """, id);

    if (rows.isEmpty()) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "区域不存在");
    }
    return rows.get(0);
  }

  public Map<String, Object> createArea(Map<String, Object> body, String requestIp, Long userId) {
    AreaPayload payload = normalizeArea(body, false);
    KeyHolder keyHolder = new GeneratedKeyHolder();

    jdbcTemplate.update(connection -> {
      PreparedStatement statement = connection.prepareStatement("""
          INSERT INTO areas (
            organization_id,
            parent_area_id,
            code,
            name,
            area_type,
            floor_area_m2,
            staff_count,
            grid_emission_factor,
            annual_budget_kwh,
            note
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          """, Statement.RETURN_GENERATED_KEYS);
      statement.setLong(1, payload.organizationId());
      setNullableLong(statement, 2, payload.parentAreaId());
      statement.setString(3, payload.code());
      statement.setString(4, payload.name());
      statement.setString(5, payload.areaType());
      statement.setBigDecimal(6, payload.floorAreaM2());
      statement.setInt(7, payload.staffCount());
      statement.setBigDecimal(8, payload.gridEmissionFactor());
      statement.setBigDecimal(9, payload.annualBudgetKwh());
      statement.setString(10, payload.note());
      return statement;
    }, keyHolder);

    Number id = keyHolder.getKey();
    if (id == null) {
      throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "区域创建失败");
    }
    auditService.log(userId, "CREATE_AREA", "area", id.longValue(), requestIp, Map.of("code", payload.code(), "name", payload.name()));
    return getArea(id.longValue());
  }

  public Map<String, Object> updateArea(long id, Map<String, Object> body, String requestIp, Long userId) {
    if (body.isEmpty()) {
      throw badRequest("没有可更新的字段");
    }

    Map<String, Object> normalized = normalizeAreaUpdate(body);
    if (normalized.isEmpty()) {
      throw badRequest("没有可更新的字段");
    }

    List<String> fields = new ArrayList<>();
    List<Object> params = new ArrayList<>();
    for (Map.Entry<String, Object> entry : normalized.entrySet()) {
      fields.add(entry.getKey() + " = ?");
      params.add(entry.getValue());
    }
    params.add(id);

    jdbcTemplate.update("UPDATE areas SET " + String.join(", ", fields) + " WHERE id = ?", params.toArray());
    auditService.log(userId, "UPDATE_AREA", "area", id, requestIp, normalized);
    return getArea(id);
  }

  public Map<String, Object> deleteArea(long id, String requestIp, Long userId) {
    jdbcTemplate.update("UPDATE areas SET is_active = 0 WHERE id = ?", id);
    auditService.log(userId, "DELETE_AREA", "area", id, requestIp, Map.of("isActive", false));
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("id", id);
    result.put("isActive", false);
    return result;
  }

  public List<Map<String, Object>> listReadings(long areaId, String periodType, String from, String to, String limitValue) {
    getArea(areaId);
    List<Object> params = new ArrayList<>();
    List<String> filters = new ArrayList<>();
    filters.add("area_id = ?");
    params.add(areaId);

    if (periodType != null && !periodType.isBlank()) {
      filters.add("period_type = ?");
      params.add(allowed(periodType, PERIOD_TYPES, "periodType"));
    }
    if (from != null && !from.isBlank()) {
      filters.add("reading_time >= ?");
      params.add(normalizeDateTime(from, "from"));
    }
    if (to != null && !to.isBlank()) {
      filters.add("reading_time <= ?");
      params.add(normalizeDateTime(to, "to"));
    }

    int limit = Math.min(positiveIntOrDefault(limitValue, 200), 1000);
    params.add(limit);

    return jdbcTemplate.queryForList("""
        SELECT id, area_id, reading_time, period_type, kwh, source, note, created_at, updated_at
        FROM electricity_readings
        WHERE %s
        ORDER BY reading_time DESC
        LIMIT ?
        """.formatted(String.join(" AND ", filters)), params.toArray());
  }

  @Transactional
  @SuppressWarnings("unchecked")
  public Map<String, Object> saveReadings(long areaId, Map<String, Object> body, String requestIp, Long userId) {
    getArea(areaId);
    Object readingsObject = body.get("readings");
    List<Map<String, Object>> readings;
    if (readingsObject instanceof List<?> list) {
      readings = list.stream()
          .filter(Map.class::isInstance)
          .map(item -> (Map<String, Object>) item)
          .toList();
    } else {
      readings = List.of(body);
    }

    if (readings.isEmpty()) {
      throw badRequest("readings 不能为空");
    }

    int savedCount = 0;
    List<Number> insertedIds = new ArrayList<>();
    for (Map<String, Object> item : readings) {
      ReadingPayload payload = normalizeReading(item);
      KeyHolder keyHolder = new GeneratedKeyHolder();
      jdbcTemplate.update(connection -> {
        PreparedStatement statement = connection.prepareStatement("""
            INSERT INTO electricity_readings (area_id, reading_time, period_type, kwh, source, note)
            VALUES (?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
              kwh = VALUES(kwh),
              source = VALUES(source),
              note = VALUES(note)
            """, Statement.RETURN_GENERATED_KEYS);
        statement.setLong(1, areaId);
        statement.setString(2, payload.readingTime());
        statement.setString(3, payload.periodType());
        statement.setBigDecimal(4, payload.kwh());
        statement.setString(5, payload.source());
        statement.setString(6, payload.note());
        return statement;
      }, keyHolder);
      savedCount += 1;
      if (keyHolder.getKey() != null) {
        insertedIds.add(keyHolder.getKey());
      }
      syncElectricityToEnergyReading(areaId, payload);
    }

    Map<String, Object> result = new LinkedHashMap<>();
    result.put("areaId", areaId);
    result.put("savedCount", savedCount);
    result.put("insertedIds", insertedIds);
    auditService.log(userId, "UPSERT_ELECTRICITY_READING", "area", areaId, requestIp, result);
    return result;
  }

  public List<Map<String, Object>> getElectricitySummary(long areaId, String groupBy, String from, String to) {
    getArea(areaId);
    String grouping = allowed(groupBy == null || groupBy.isBlank() ? "month" : groupBy, GROUP_BY_TYPES, "groupBy");
    String bucketSql = switch (grouping) {
      case "hour" -> "DATE_FORMAT(r.reading_time, '%Y-%m-%d %H:00:00')";
      case "day" -> "DATE(r.reading_time)";
      case "year" -> "DATE_FORMAT(r.reading_time, '%Y-01-01')";
      default -> "DATE_FORMAT(r.reading_time, '%Y-%m-01')";
    };

    List<Object> params = new ArrayList<>();
    List<String> filters = new ArrayList<>();
    filters.add("r.area_id = ?");
    params.add(areaId);
    if (from != null && !from.isBlank()) {
      filters.add("r.reading_time >= ?");
      params.add(normalizeDateTime(from, "from"));
    }
    if (to != null && !to.isBlank()) {
      filters.add("r.reading_time <= ?");
      params.add(normalizeDateTime(to, "to"));
    }

    return jdbcTemplate.queryForList("""
        SELECT
          %s AS bucket,
          SUM(r.kwh) AS total_kwh,
          SUM(r.kwh * a.grid_emission_factor) / 1000 AS total_carbon_tons,
          COUNT(*) AS reading_count
        FROM electricity_readings r
        JOIN areas a ON a.id = r.area_id
        WHERE %s
        GROUP BY %s
        ORDER BY bucket ASC
        """.formatted(bucketSql, String.join(" AND ", filters), bucketSql), params.toArray());
  }

  private AreaPayload normalizeArea(Map<String, Object> body, boolean partial) {
    long organizationId = body.containsKey("organizationId")
        ? positiveLong(body.get("organizationId"), "organizationId")
        : 1L;
    String code = partial ? optionalString(body, "code") : requiredString(body, "code", "区域编码");
    String name = partial ? optionalString(body, "name") : requiredString(body, "name", "区域名称");
    String areaType = body.containsKey("areaType")
        ? allowed(String.valueOf(body.get("areaType")), AREA_TYPES, "areaType")
        : "office";

    return new AreaPayload(
        organizationId,
        optionalLong(body, "parentAreaId"),
        code,
        name,
        areaType,
        optionalDecimal(body, "floorAreaM2", BigDecimal.ZERO),
        optionalInteger(body, "staffCount", 0),
        optionalDecimal(body, "gridEmissionFactor", new BigDecimal("0.42")),
        optionalDecimal(body, "annualBudgetKwh", null),
        optionalString(body, "note"),
        body.containsKey("isActive") ? Boolean.TRUE.equals(body.get("isActive")) : null
    );
  }

  private Map<String, Object> normalizeAreaUpdate(Map<String, Object> body) {
    AreaPayload payload = normalizeArea(body, true);
    Map<String, Object> fields = new LinkedHashMap<>();
    if (body.containsKey("organizationId")) fields.put("organization_id", payload.organizationId());
    if (body.containsKey("parentAreaId")) fields.put("parent_area_id", payload.parentAreaId());
    if (body.containsKey("code")) fields.put("code", payload.code());
    if (body.containsKey("name")) fields.put("name", payload.name());
    if (body.containsKey("areaType")) fields.put("area_type", payload.areaType());
    if (body.containsKey("floorAreaM2")) fields.put("floor_area_m2", payload.floorAreaM2());
    if (body.containsKey("staffCount")) fields.put("staff_count", payload.staffCount());
    if (body.containsKey("gridEmissionFactor")) fields.put("grid_emission_factor", payload.gridEmissionFactor());
    if (body.containsKey("annualBudgetKwh")) fields.put("annual_budget_kwh", payload.annualBudgetKwh());
    if (body.containsKey("note")) fields.put("note", payload.note());
    if (body.containsKey("isActive")) fields.put("is_active", payload.isActive() ? 1 : 0);
    return fields;
  }

  private ReadingPayload normalizeReading(Map<String, Object> body) {
    String periodType = allowed(String.valueOf(body.getOrDefault("periodType", "day")), PERIOD_TYPES, "periodType");
    BigDecimal kwh = optionalDecimal(body, "kwh", null);
    if (kwh == null) {
      throw badRequest("kWh 必须是数字");
    }
    if (kwh.compareTo(BigDecimal.ZERO) < 0) {
      throw badRequest("kWh 不能小于 0");
    }
    Object time = body.containsKey("readingTime") ? body.get("readingTime") : body.get("date");

    return new ReadingPayload(
        normalizeDateTime(time, "readingTime"),
        periodType,
        kwh,
        optionalString(body, "source") == null ? "manual" : optionalString(body, "source"),
        optionalString(body, "note")
    );
  }

  private void syncElectricityToEnergyReading(long areaId, ReadingPayload payload) {
    long energyTypeId = getElectricityTypeId();
    Long meterId = getDefaultMeterId(areaId, energyTypeId);
    List<Map<String, Object>> existingRows = jdbcTemplate.queryForList("""
        SELECT id
        FROM energy_readings
        WHERE area_id = ?
          AND energy_type_id = ?
          AND reading_time = ?
          AND period_type = ?
        LIMIT 1
        """, areaId, energyTypeId, payload.readingTime(), payload.periodType());

    if (existingRows.isEmpty()) {
      jdbcTemplate.update("""
          INSERT INTO energy_readings (area_id, meter_id, energy_type_id, reading_time, period_type, amount, source, note)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          """, areaId, meterId, energyTypeId, payload.readingTime(), payload.periodType(), payload.kwh(), payload.source(), payload.note());
      return;
    }

    jdbcTemplate.update("""
        UPDATE energy_readings
        SET meter_id = ?, amount = ?, source = ?, note = ?
        WHERE id = ?
        """, meterId, payload.kwh(), payload.source(), payload.note(), existingRows.get(0).get("id"));
  }

  private long getElectricityTypeId() {
    List<Map<String, Object>> rows = jdbcTemplate.queryForList(
        "SELECT id FROM energy_types WHERE code = 'electricity' AND is_active = 1 LIMIT 1"
    );
    if (rows.isEmpty()) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "电力能源类型不存在");
    }
    return ((Number) rows.get(0).get("id")).longValue();
  }

  private Long getDefaultMeterId(long areaId, long energyTypeId) {
    List<Map<String, Object>> rows = jdbcTemplate.queryForList("""
        SELECT id
        FROM meters
        WHERE area_id = ? AND energy_type_id = ? AND is_active = 1
        ORDER BY id ASC
        LIMIT 1
        """, areaId, energyTypeId);
    if (rows.isEmpty()) {
      return null;
    }
    return ((Number) rows.get(0).get("id")).longValue();
  }

  private void setNullableLong(PreparedStatement statement, int index, Long value) throws java.sql.SQLException {
    if (value == null) {
      statement.setObject(index, null);
    } else {
      statement.setLong(index, value);
    }
  }

  private record AreaPayload(
      long organizationId,
      Long parentAreaId,
      String code,
      String name,
      String areaType,
      BigDecimal floorAreaM2,
      Integer staffCount,
      BigDecimal gridEmissionFactor,
      BigDecimal annualBudgetKwh,
      String note,
      Boolean isActive
  ) {
  }

  private record ReadingPayload(
      String readingTime,
      String periodType,
      BigDecimal kwh,
      String source,
      String note
  ) {
  }
}

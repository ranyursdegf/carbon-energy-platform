package com.carbon.energy.service;

import static com.carbon.energy.support.RequestUtils.allowed;
import static com.carbon.energy.support.RequestUtils.badRequest;
import static com.carbon.energy.support.RequestUtils.normalizeDateTime;
import static com.carbon.energy.support.RequestUtils.optionalDecimal;
import static com.carbon.energy.support.RequestUtils.optionalLong;
import static com.carbon.energy.support.RequestUtils.optionalString;
import static com.carbon.energy.support.RequestUtils.positiveLong;
import static com.carbon.energy.support.RequestUtils.requiredString;

import java.math.BigDecimal;
import java.math.RoundingMode;
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
 * 通用能源服务。
 *
 * <p>AreaService 里保留了“电耗兼容接口”，供现有前端页面使用。
 * 这个服务面向后续扩展：电、水、气、蒸汽等都可以统一写入 energy_readings。</p>
 */
@Service
public class EnergyService {

  private static final Set<String> PERIOD_TYPES = Set.of("hour", "day", "month", "year");
  private static final Set<String> GROUP_BY_TYPES = Set.of("hour", "day", "month", "year");
  private static final BigDecimal THOUSAND = new BigDecimal("1000");
  private static final Map<String, EnergyConversionFactor> CONVERSION_FACTORS = createConversionFactors();

  private final JdbcTemplate jdbcTemplate;
  private final AuditService auditService;

  public EnergyService(JdbcTemplate jdbcTemplate, AuditService auditService) {
    this.jdbcTemplate = jdbcTemplate;
    this.auditService = auditService;
  }

  public List<Map<String, Object>> listEnergyTypes() {
    return jdbcTemplate.queryForList("""
        SELECT id, code, name, unit, default_emission_factor, carbon_unit, note, is_active
        FROM energy_types
        WHERE is_active = 1
        ORDER BY id ASC
        """);
  }

  public Map<String, Object> convertEnergy(Map<String, Object> body) {
    String energyTypeCode = optionalString(body, "energyTypeCode");
    EnergyConversionFactor factor = getConversionFactor(energyTypeCode == null ? "electricity" : energyTypeCode);
    BigDecimal amount = optionalDecimal(body, "amount", null);
    if (amount == null) {
      throw badRequest("amount 必须是数字");
    }
    requireNonNegative(amount, "amount");

    BigDecimal areaM2 = optionalDecimal(body, "areaM2", BigDecimal.ZERO);
    BigDecimal outputValue = optionalDecimal(body, "outputValue", BigDecimal.ZERO);
    BigDecimal productOutput = optionalDecimal(body, "productOutput", BigDecimal.ZERO);
    requireNonNegative(areaM2, "areaM2");
    requireNonNegative(outputValue, "outputValue");
    requireNonNegative(productOutput, "productOutput");

    return buildConversionResult(factor, amount, areaM2, outputValue, productOutput);
  }

  public Map<String, Object> getEnergyIntensitySummary(Long areaId, String energyTypeCode, String from, String to) {
    List<Object> params = new ArrayList<>();
    List<String> filters = new ArrayList<>();
    filters.add("1 = 1");
    if (areaId != null) {
      filters.add("r.area_id = ?");
      params.add(areaId);
    }
    if (energyTypeCode != null && !energyTypeCode.isBlank()) {
      filters.add("et.code = ?");
      params.add(energyTypeCode);
    }
    if (from != null && !from.isBlank()) {
      filters.add("r.reading_time >= ?");
      params.add(normalizeDateTime(from, "from"));
    }
    if (to != null && !to.isBlank()) {
      filters.add("r.reading_time <= ?");
      params.add(normalizeDateTime(to, "to"));
    }

    List<Map<String, Object>> sourceRows = jdbcTemplate.queryForList("""
        SELECT
          et.code AS energy_type_code,
          et.name AS energy_type_name,
          et.unit,
          SUM(r.amount) AS total_amount,
          SUM(r.amount * COALESCE(ef.factor_value, et.default_emission_factor, 0)) / 1000 AS total_carbon_tons,
          COUNT(*) AS reading_count,
          MAX(r.reading_time) AS latest_reading_time,
          MAX(COALESCE(r.updated_at, r.created_at)) AS latest_data_updated_at
        FROM energy_readings r
        JOIN energy_types et ON et.id = r.energy_type_id
        LEFT JOIN emission_factors ef
          ON ef.energy_type_id = et.id
          AND ef.factor_year = YEAR(r.reading_time)
          AND ef.is_active = 1
        WHERE %s
        GROUP BY et.id, et.code, et.name, et.unit
        ORDER BY et.id ASC
        """.formatted(String.join(" AND ", filters)), params.toArray());

    BigDecimal totalEnergyGJ = BigDecimal.ZERO;
    BigDecimal totalStandardCoalKgce = BigDecimal.ZERO;
    BigDecimal totalCarbonTons = BigDecimal.ZERO;
    long readingCount = 0;
    List<Map<String, Object>> rows = new ArrayList<>();
    for (Map<String, Object> row : sourceRows) {
      String code = String.valueOf(row.get("energy_type_code"));
      EnergyConversionFactor factor = getConversionFactor(code);
      BigDecimal amount = decimalValue(row.get("total_amount"));
      Map<String, Object> converted = buildConversionResult(factor, amount, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO);
      BigDecimal rowEnergyGJ = decimalValue(converted.get("energyGJ"));
      BigDecimal rowStandardCoalKgce = decimalValue(converted.get("standardCoalKgce"));
      BigDecimal rowCarbonTons = decimalValue(row.get("total_carbon_tons"));
      if (rowCarbonTons.compareTo(BigDecimal.ZERO) == 0) {
        rowCarbonTons = decimalValue(converted.get("carbonTons"));
      }
      long rowReadingCount = ((Number) row.get("reading_count")).longValue();

      Map<String, Object> payload = new LinkedHashMap<>();
      payload.put("energyTypeCode", code);
      payload.put("energyTypeName", row.get("energy_type_name"));
      payload.put("unit", row.get("unit"));
      payload.put("amount", round(amount, 6));
      payload.put("energyGJ", rowEnergyGJ);
      payload.put("standardCoalKgce", rowStandardCoalKgce);
      payload.put("standardCoalTce", converted.get("standardCoalTce"));
      payload.put("carbonTons", round(rowCarbonTons, 6));
      payload.put("readingCount", rowReadingCount);
      payload.put("factorNote", factor.note());
      rows.add(payload);

      totalEnergyGJ = totalEnergyGJ.add(rowEnergyGJ);
      totalStandardCoalKgce = totalStandardCoalKgce.add(rowStandardCoalKgce);
      totalCarbonTons = totalCarbonTons.add(rowCarbonTons);
      readingCount += rowReadingCount;
    }

    Map<String, Object> scope = getIntensityScope(areaId);
    BigDecimal floorAreaM2 = decimalValue(scope.get("floorAreaM2"));
    BigDecimal staffCount = decimalValue(scope.get("staffCount"));

    Map<String, Object> summary = new LinkedHashMap<>();
    summary.put("standardCoalKgce", round(totalStandardCoalKgce, 6));
    summary.put("standardCoalTce", divide(totalStandardCoalKgce, THOUSAND, 6));
    summary.put("energyGJ", round(totalEnergyGJ, 6));
    summary.put("carbonTons", round(totalCarbonTons, 6));
    summary.put("floorAreaM2", round(floorAreaM2, 2));
    summary.put("staffCount", round(staffCount, 0));
    summary.put("areaIntensityKgcePerM2", divide(totalStandardCoalKgce, floorAreaM2, 6));
    summary.put("perCapitaKgce", divide(totalStandardCoalKgce, staffCount, 6));
    summary.put("readingCount", readingCount);

    Map<String, Object> result = new LinkedHashMap<>();
    result.put("summary", summary);
    result.put("rows", rows);
    result.put("scope", scope);
    return result;
  }

  public List<Map<String, Object>> listEmissionFactors(String energyTypeCode) {
    List<Object> params = new ArrayList<>();
    List<String> filters = new ArrayList<>();
    filters.add("ef.is_active = 1");
    if (energyTypeCode != null && !energyTypeCode.isBlank()) {
      filters.add("et.code = ?");
      params.add(energyTypeCode);
    }

    return jdbcTemplate.queryForList("""
        SELECT
          ef.id,
          et.code AS energy_type_code,
          et.name AS energy_type_name,
          ef.region_code,
          ef.factor_year,
          ef.factor_value,
          ef.factor_unit,
          ef.source_name,
          ef.version,
          ef.is_active
        FROM emission_factors ef
        JOIN energy_types et ON et.id = ef.energy_type_id
        WHERE %s
        ORDER BY ef.factor_year DESC, et.code ASC
        """.formatted(String.join(" AND ", filters)), params.toArray());
  }

  public List<Map<String, Object>> listMeters(Long areaId) {
    List<Object> params = new ArrayList<>();
    List<String> filters = new ArrayList<>();
    filters.add("m.is_active = 1");
    if (areaId != null) {
      filters.add("m.area_id = ?");
      params.add(areaId);
    }

    return jdbcTemplate.queryForList("""
        SELECT
          m.id,
          m.area_id,
          a.name AS area_name,
          et.code AS energy_type_code,
          et.name AS energy_type_name,
          m.code,
          m.name,
          m.location,
          m.manufacturer,
          m.installed_at,
          m.is_active
        FROM meters m
        JOIN areas a ON a.id = m.area_id
        JOIN energy_types et ON et.id = m.energy_type_id
        WHERE %s
        ORDER BY m.created_at DESC
        """.formatted(String.join(" AND ", filters)), params.toArray());
  }

  public Map<String, Object> createMeter(Map<String, Object> body, String requestIp, Long userId) {
    long areaId = positiveLong(body.get("areaId"), "areaId");
    long energyTypeId = resolveEnergyTypeId(body);
    String code = requiredString(body, "code", "表计编码");
    String name = requiredString(body, "name", "表计名称");
    String location = optionalString(body, "location");
    String manufacturer = optionalString(body, "manufacturer");
    String installedAt = optionalString(body, "installedAt");

    KeyHolder keyHolder = new GeneratedKeyHolder();
    jdbcTemplate.update(connection -> {
      PreparedStatement statement = connection.prepareStatement("""
          INSERT INTO meters (area_id, energy_type_id, code, name, location, manufacturer, installed_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          """, Statement.RETURN_GENERATED_KEYS);
      statement.setLong(1, areaId);
      statement.setLong(2, energyTypeId);
      statement.setString(3, code);
      statement.setString(4, name);
      statement.setString(5, location);
      statement.setString(6, manufacturer);
      statement.setString(7, installedAt);
      return statement;
    }, keyHolder);

    Number id = keyHolder.getKey();
    if (id == null) {
      throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "表计创建失败");
    }

    auditService.log(userId, "CREATE_METER", "meter", id.longValue(), requestIp, Map.of("code", code, "name", name));
    return getMeter(id.longValue());
  }

  @Transactional
  public Map<String, Object> saveEnergyReading(Map<String, Object> body, String requestIp, Long userId) {
    long areaId = positiveLong(body.get("areaId"), "areaId");
    Long meterId = optionalLong(body, "meterId");
    long energyTypeId = resolveEnergyTypeId(body);
    String periodType = allowed(String.valueOf(body.getOrDefault("periodType", "day")), PERIOD_TYPES, "periodType");
    String readingTime = normalizeDateTime(body.get("readingTime"), "readingTime");
    BigDecimal amount = optionalDecimal(body, "amount", null);
    if (amount == null) {
      throw badRequest("amount 必须是数字");
    }
    if (amount.compareTo(BigDecimal.ZERO) < 0) {
      throw badRequest("amount 不能小于 0");
    }

    KeyHolder keyHolder = new GeneratedKeyHolder();
    jdbcTemplate.update(connection -> {
      PreparedStatement statement = connection.prepareStatement("""
          INSERT INTO energy_readings (area_id, meter_id, energy_type_id, reading_time, period_type, amount, source, note)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          """, Statement.RETURN_GENERATED_KEYS);
      statement.setLong(1, areaId);
      if (meterId == null) {
        statement.setObject(2, null);
      } else {
        statement.setLong(2, meterId);
      }
      statement.setLong(3, energyTypeId);
      statement.setString(4, readingTime);
      statement.setString(5, periodType);
      statement.setBigDecimal(6, amount);
      statement.setString(7, optionalString(body, "source") == null ? "manual" : optionalString(body, "source"));
      statement.setString(8, optionalString(body, "note"));
      return statement;
    }, keyHolder);

    Number id = keyHolder.getKey();
    if (id == null) {
      throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "能源读数保存失败");
    }

    auditService.log(userId, "CREATE_ENERGY_READING", "energy_reading", id.longValue(), requestIp,
        Map.of("areaId", areaId, "energyTypeId", energyTypeId, "amount", amount));
    return getEnergyReading(id.longValue());
  }

  public List<Map<String, Object>> getEnergySummary(Long areaId, String energyTypeCode, String groupBy, String from, String to) {
    String grouping = allowed(groupBy == null || groupBy.isBlank() ? "month" : groupBy, GROUP_BY_TYPES, "groupBy");
    // 按前端选择的粒度动态生成时间桶，避免为年/月/日分别写多套查询。
    String bucketSql = switch (grouping) {
      case "hour" -> "DATE_FORMAT(r.reading_time, '%Y-%m-%d %H:00:00')";
      case "day" -> "DATE(r.reading_time)";
      case "year" -> "DATE_FORMAT(r.reading_time, '%Y-01-01')";
      default -> "DATE_FORMAT(r.reading_time, '%Y-%m-01')";
    };

    List<Object> params = new ArrayList<>();
    List<String> filters = new ArrayList<>();
    filters.add("1 = 1");
    if (areaId != null) {
      filters.add("r.area_id = ?");
      params.add(areaId);
    }
    if (energyTypeCode != null && !energyTypeCode.isBlank()) {
      filters.add("et.code = ?");
      params.add(energyTypeCode);
    }
    if (from != null && !from.isBlank()) {
      filters.add("r.reading_time >= ?");
      params.add(normalizeDateTime(from, "from"));
    }
    if (to != null && !to.isBlank()) {
      filters.add("r.reading_time <= ?");
      params.add(normalizeDateTime(to, "to"));
    }

    // 同一查询同时返回活动数据和碳排结果，页面可据此生成趋势、强度、预算与核查视图。
    return jdbcTemplate.queryForList("""
        SELECT
          %s AS bucket,
          a.id AS area_id,
          a.name AS area_name,
          et.code AS energy_type_code,
          et.name AS energy_type_name,
          et.unit,
          SUM(r.amount) AS total_amount,
          SUM(r.amount * COALESCE(ef.factor_value, et.default_emission_factor, 0)) / 1000 AS total_carbon_tons,
          COUNT(*) AS reading_count,
          MAX(r.reading_time) AS latest_reading_time,
          MAX(COALESCE(r.updated_at, r.created_at)) AS latest_data_updated_at
        FROM energy_readings r
        JOIN areas a ON a.id = r.area_id
        JOIN energy_types et ON et.id = r.energy_type_id
        LEFT JOIN emission_factors ef
          ON ef.energy_type_id = et.id
          AND ef.factor_year = YEAR(r.reading_time)
          AND ef.is_active = 1
        WHERE %s
        GROUP BY %s, a.id, a.name, et.code, et.name, et.unit
        ORDER BY bucket ASC, a.id ASC
        """.formatted(bucketSql, String.join(" AND ", filters), bucketSql), params.toArray());
  }

  private static Map<String, EnergyConversionFactor> createConversionFactors() {
    Map<String, EnergyConversionFactor> factors = new LinkedHashMap<>();
    factors.put("electricity", new EnergyConversionFactor(
        "electricity",
        "电力",
        "kWh",
        new BigDecimal("0.0036"),
        new BigDecimal("0.1229"),
        new BigDecimal("0.420"),
        "1 kWh = 3.6 MJ，按 0.1229 kgce/kWh 折标煤。"
    ));
    factors.put("water", new EnergyConversionFactor(
        "water",
        "自来水",
        "m³",
        new BigDecimal("0.002512"),
        new BigDecimal("0.0857"),
        new BigDecimal("0.168"),
        "按给水等效能耗系数折算。"
    ));
    factors.put("gas", new EnergyConversionFactor(
        "gas",
        "天然气",
        "m³",
        new BigDecimal("0.035588"),
        new BigDecimal("1.2143"),
        new BigDecimal("2.162"),
        "按低位热值折算为 GJ，再换算标准煤。"
    ));
    factors.put("steam", new EnergyConversionFactor(
        "steam",
        "热力 / 蒸汽",
        "GJ",
        BigDecimal.ONE,
        new BigDecimal("34.12"),
        new BigDecimal("110"),
        "热力直接以 GJ 计量，1 GJ 约等于 34.12 kgce。"
    ));
    return Map.copyOf(factors);
  }

  private Map<String, Object> buildConversionResult(
      EnergyConversionFactor factor,
      BigDecimal amount,
      BigDecimal areaM2,
      BigDecimal outputValue,
      BigDecimal productOutput
  ) {
    BigDecimal energyGJ = amount.multiply(factor.gjPerUnit());
    BigDecimal standardCoalKgce = amount.multiply(factor.kgcePerUnit());
    BigDecimal carbonTons = amount.multiply(factor.carbonKgPerUnit()).divide(THOUSAND, 12, RoundingMode.HALF_UP);

    Map<String, Object> result = new LinkedHashMap<>();
    result.put("energyTypeCode", factor.code());
    result.put("energyTypeName", factor.label());
    result.put("unit", factor.unit());
    result.put("amount", round(amount, 6));
    result.put("energyGJ", round(energyGJ, 6));
    result.put("standardCoalKgce", round(standardCoalKgce, 6));
    result.put("standardCoalTce", divide(standardCoalKgce, THOUSAND, 6));
    result.put("carbonTons", round(carbonTons, 6));
    result.put("areaIntensityKgcePerM2", divide(standardCoalKgce, areaM2, 6));
    result.put("outputIntensityKgcePerValue", divide(standardCoalKgce, outputValue, 6));
    result.put("productIntensityKgcePerUnit", divide(standardCoalKgce, productOutput, 6));
    result.put("formula", amount.stripTrailingZeros().toPlainString() + " " + factor.unit()
        + " × " + factor.kgcePerUnit().stripTrailingZeros().toPlainString() + " kgce/" + factor.unit());
    result.put("factorNote", factor.note());
    return result;
  }

  private Map<String, Object> getIntensityScope(Long areaId) {
    String filter = areaId == null ? "is_active = 1" : "id = ? AND is_active = 1";
    Object[] params = areaId == null ? new Object[] {} : new Object[] { areaId };
    Map<String, Object> row = jdbcTemplate.queryForMap("""
        SELECT
          COUNT(*) AS area_count,
          COALESCE(SUM(floor_area_m2), 0) AS floor_area_m2,
          COALESCE(SUM(staff_count), 0) AS staff_count,
          COALESCE(SUM(annual_budget_kwh), 0) AS annual_budget_kwh
        FROM areas
        WHERE %s
        """.formatted(filter), params);

    Map<String, Object> scope = new LinkedHashMap<>();
    scope.put("areaCount", ((Number) row.get("area_count")).longValue());
    scope.put("floorAreaM2", round(decimalValue(row.get("floor_area_m2")), 2));
    scope.put("staffCount", round(decimalValue(row.get("staff_count")), 0));
    scope.put("annualBudgetKwh", round(decimalValue(row.get("annual_budget_kwh")), 3));
    return scope;
  }

  private EnergyConversionFactor getConversionFactor(String code) {
    EnergyConversionFactor factor = CONVERSION_FACTORS.get(code);
    if (factor == null) {
      throw badRequest("energyTypeCode 暂不支持折算：" + code);
    }
    return factor;
  }

  private BigDecimal decimalValue(Object value) {
    if (value == null || String.valueOf(value).isBlank()) {
      return BigDecimal.ZERO;
    }
    return new BigDecimal(String.valueOf(value));
  }

  private BigDecimal divide(BigDecimal value, BigDecimal divisor, int scale) {
    if (divisor == null || divisor.compareTo(BigDecimal.ZERO) <= 0) {
      return BigDecimal.ZERO.setScale(scale, RoundingMode.HALF_UP);
    }
    return value.divide(divisor, scale, RoundingMode.HALF_UP);
  }

  private BigDecimal round(BigDecimal value, int scale) {
    return value.setScale(scale, RoundingMode.HALF_UP);
  }

  private void requireNonNegative(BigDecimal value, String label) {
    if (value.compareTo(BigDecimal.ZERO) < 0) {
      throw badRequest(label + "不能小于 0");
    }
  }

  private Map<String, Object> getMeter(long id) {
    List<Map<String, Object>> rows = jdbcTemplate.queryForList("""
        SELECT
          m.id,
          m.area_id,
          a.name AS area_name,
          et.code AS energy_type_code,
          et.name AS energy_type_name,
          m.code,
          m.name,
          m.location,
          m.manufacturer,
          m.installed_at,
          m.is_active
        FROM meters m
        JOIN areas a ON a.id = m.area_id
        JOIN energy_types et ON et.id = m.energy_type_id
        WHERE m.id = ?
        LIMIT 1
        """, id);
    if (rows.isEmpty()) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "表计不存在");
    }
    return rows.get(0);
  }

  private Map<String, Object> getEnergyReading(long id) {
    List<Map<String, Object>> rows = jdbcTemplate.queryForList("""
        SELECT
          r.id,
          r.area_id,
          a.name AS area_name,
          r.meter_id,
          m.name AS meter_name,
          et.code AS energy_type_code,
          et.name AS energy_type_name,
          r.reading_time,
          r.period_type,
          r.amount,
          et.unit,
          r.source,
          r.note,
          r.created_at
        FROM energy_readings r
        JOIN areas a ON a.id = r.area_id
        JOIN energy_types et ON et.id = r.energy_type_id
        LEFT JOIN meters m ON m.id = r.meter_id
        WHERE r.id = ?
        LIMIT 1
        """, id);
    if (rows.isEmpty()) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "能源读数不存在");
    }
    return rows.get(0);
  }

  private long resolveEnergyTypeId(Map<String, Object> body) {
    Object id = body.get("energyTypeId");
    if (id != null && !String.valueOf(id).isBlank()) {
      return positiveLong(id, "energyTypeId");
    }

    String code = String.valueOf(body.getOrDefault("energyTypeCode", "electricity"));
    List<Map<String, Object>> rows = jdbcTemplate.queryForList(
        "SELECT id FROM energy_types WHERE code = ? AND is_active = 1 LIMIT 1",
        code
    );
    if (rows.isEmpty()) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "能源类型不存在");
    }
    return ((Number) rows.get(0).get("id")).longValue();
  }

  private record EnergyConversionFactor(
      String code,
      String label,
      String unit,
      BigDecimal gjPerUnit,
      BigDecimal kgcePerUnit,
      BigDecimal carbonKgPerUnit,
      String note
  ) {
  }
}

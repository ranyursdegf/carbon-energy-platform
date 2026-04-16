package com.carbon.energy.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import static com.carbon.energy.support.RequestUtils.positiveIntOrDefault;

/**
 * 轻量审计服务。
 *
 * <p>写入接口会把管理员 userId 一起传进来，这样后台新增区域、录入数据等关键动作
 * 都能在 audit_logs 表里追溯。</p>
 */
@Service
public class AuditService {

  private final JdbcTemplate jdbcTemplate;
  private final ObjectMapper objectMapper;

  public AuditService(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
    this.jdbcTemplate = jdbcTemplate;
    this.objectMapper = objectMapper;
  }

  public void log(String action, String targetType, Long targetId, String requestIp, Map<String, Object> detail) {
    log(null, action, targetType, targetId, requestIp, detail);
  }

  public void log(
      Long userId,
      String action,
      String targetType,
      Long targetId,
      String requestIp,
      Map<String, Object> detail
  ) {
    jdbcTemplate.update(
        """
        INSERT INTO audit_logs (user_id, action, target_type, target_id, request_ip, detail)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        userId,
        action,
        targetType,
        targetId,
        requestIp,
        toJson(detail)
    );
  }

  public List<Map<String, Object>> listAuditLogs(String targetType, String limitValue) {
    int limit = Math.min(positiveIntOrDefault(limitValue, 50), 200);
    List<Object> params = new ArrayList<>();
    List<String> filters = new ArrayList<>();
    filters.add("1 = 1");
    if (targetType != null && !targetType.isBlank()) {
      filters.add("al.target_type = ?");
      params.add(targetType);
    }
    params.add(limit);

    return jdbcTemplate.queryForList("""
        SELECT
          al.id,
          al.user_id,
          COALESCE(u.username, 'system') AS username,
          COALESCE(u.display_name, 'system') AS display_name,
          al.action,
          al.target_type,
          al.target_id,
          al.request_ip,
          CAST(al.detail AS CHAR) AS detail,
          al.created_at
        FROM audit_logs al
        LEFT JOIN app_users u ON u.id = al.user_id
        WHERE %s
        ORDER BY al.created_at DESC, al.id DESC
        LIMIT ?
        """.formatted(String.join(" AND ", filters)), params.toArray());
  }

  private String toJson(Map<String, Object> detail) {
    try {
      return objectMapper.writeValueAsString(detail == null ? Map.of() : detail);
    } catch (JsonProcessingException error) {
      return "{}";
    }
  }
}

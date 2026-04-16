package com.carbon.energy.controller;

import com.carbon.energy.support.ApiResponses;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/health")
public class HealthController {

  private final JdbcTemplate jdbcTemplate;

  public HealthController(JdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = jdbcTemplate;
  }

  @GetMapping
  public Map<String, Object> health() {
    // 这个接口不只检查服务是否启动，也会实际打到 MySQL。
    Integer ok = jdbcTemplate.queryForObject("SELECT 1", Integer.class);
    Map<String, Object> data = new LinkedHashMap<>();
    data.put("status", ok != null && ok == 1 ? "ok" : "unknown");
    data.put("database", "connected");
    data.put("time", Instant.now().toString());
    return ApiResponses.data(data);
  }
}

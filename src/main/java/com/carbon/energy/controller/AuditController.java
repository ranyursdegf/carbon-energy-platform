package com.carbon.energy.controller;

import com.carbon.energy.service.AuditService;
import com.carbon.energy.service.AuthService;
import com.carbon.energy.support.ApiResponses;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/audit-logs")
public class AuditController {

  private final AuditService auditService;
  private final AuthService authService;

  public AuditController(AuditService auditService, AuthService authService) {
    this.auditService = auditService;
    this.authService = authService;
  }

  @GetMapping
  public Map<String, Object> listAuditLogs(
      @RequestHeader(value = "Authorization", required = false) String authorization,
      @RequestParam(required = false) String targetType,
      @RequestParam(required = false) String limit
  ) {
    authService.requireAdmin(authorization);
    return ApiResponses.data(auditService.listAuditLogs(targetType, limit));
  }
}

package com.carbon.energy.controller;

import com.carbon.energy.service.AuthService;
import com.carbon.energy.service.AuthService.AuthenticatedAdmin;
import com.carbon.energy.service.AreaService;
import com.carbon.energy.support.ApiResponses;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * 区域管理接口。
 *
 * <p>这里的接口已经被 viewweb/areas.html 调用，返回格式保持 { data: ... }，
 * 这样前端只关心 data 字段，不需要理解 Spring 的内部结构。</p>
 */
@RestController
@RequestMapping("/api/areas")
public class AreaController {

  private final AreaService areaService;
  private final AuthService authService;

  public AreaController(AreaService areaService, AuthService authService) {
    this.areaService = areaService;
    this.authService = authService;
  }

  @GetMapping
  public Map<String, Object> listAreas(
      @RequestParam(defaultValue = "false") boolean includeInactive,
      @RequestParam(defaultValue = "false") boolean includeStats,
      @RequestParam(required = false) String limit,
      @RequestParam(required = false) String page
  ) {
    return ApiResponses.data(areaService.listAreas(includeInactive, includeStats, limit, page));
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  public Map<String, Object> createArea(
      @RequestBody Map<String, Object> body,
      @RequestHeader(value = "Authorization", required = false) String authorization,
      HttpServletRequest request
  ) {
    AuthenticatedAdmin admin = authService.requireAdmin(authorization);
    return ApiResponses.data(areaService.createArea(body, request.getRemoteAddr(), admin.id()));
  }

  @GetMapping("/{id}")
  public Map<String, Object> getArea(@PathVariable long id) {
    return ApiResponses.data(areaService.getArea(id));
  }

  @PatchMapping("/{id}")
  public Map<String, Object> updateArea(
      @PathVariable long id,
      @RequestBody Map<String, Object> body,
      @RequestHeader(value = "Authorization", required = false) String authorization,
      HttpServletRequest request
  ) {
    AuthenticatedAdmin admin = authService.requireAdmin(authorization);
    return ApiResponses.data(areaService.updateArea(id, body, request.getRemoteAddr(), admin.id()));
  }

  @DeleteMapping("/{id}")
  public Map<String, Object> deleteArea(
      @PathVariable long id,
      @RequestHeader(value = "Authorization", required = false) String authorization,
      HttpServletRequest request
  ) {
    AuthenticatedAdmin admin = authService.requireAdmin(authorization);
    return ApiResponses.data(areaService.deleteArea(id, request.getRemoteAddr(), admin.id()));
  }

  @GetMapping("/{id}/electricity-readings")
  public Map<String, Object> listReadings(
      @PathVariable long id,
      @RequestParam(required = false) String periodType,
      @RequestParam(required = false) String from,
      @RequestParam(required = false) String to,
      @RequestParam(required = false) String limit
  ) {
    return ApiResponses.data(areaService.listReadings(id, periodType, from, to, limit));
  }

  @PostMapping("/{id}/electricity-readings")
  @ResponseStatus(HttpStatus.CREATED)
  public Map<String, Object> saveReading(
      @PathVariable long id,
      @RequestBody Map<String, Object> body,
      @RequestHeader(value = "Authorization", required = false) String authorization,
      HttpServletRequest request
  ) {
    AuthenticatedAdmin admin = authService.requireAdmin(authorization);
    return ApiResponses.data(areaService.saveReadings(id, body, request.getRemoteAddr(), admin.id()));
  }

  @GetMapping("/{id}/electricity-summary")
  public Map<String, Object> getSummary(
      @PathVariable long id,
      @RequestParam(defaultValue = "month") String groupBy,
      @RequestParam(required = false) String from,
      @RequestParam(required = false) String to
  ) {
    return ApiResponses.data(areaService.getElectricitySummary(id, groupBy, from, to));
  }
}

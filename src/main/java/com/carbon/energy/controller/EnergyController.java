package com.carbon.energy.controller;

import com.carbon.energy.service.AuthService;
import com.carbon.energy.service.AuthService.AuthenticatedAdmin;
import com.carbon.energy.service.EnergyService;
import com.carbon.energy.support.ApiResponses;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * 多能源通用接口。
 *
 * <p>现有页面先使用电耗接口；后续接水、气、蒸汽、分表数据时，
 * 前端可以逐步迁移到这里的通用接口。</p>
 */
@RestController
@RequestMapping("/api")
public class EnergyController {

  private final EnergyService energyService;
  private final AuthService authService;

  public EnergyController(EnergyService energyService, AuthService authService) {
    this.energyService = energyService;
    this.authService = authService;
  }

  @GetMapping("/energy-types")
  public Map<String, Object> listEnergyTypes() {
    return ApiResponses.data(energyService.listEnergyTypes());
  }

  @GetMapping("/emission-factors")
  public Map<String, Object> listEmissionFactors(@RequestParam(required = false) String energyTypeCode) {
    return ApiResponses.data(energyService.listEmissionFactors(energyTypeCode));
  }

  @PostMapping("/energy-calculator/convert")
  public Map<String, Object> convertEnergy(@RequestBody Map<String, Object> body) {
    return ApiResponses.data(energyService.convertEnergy(body));
  }

  @GetMapping("/energy-intensity/summary")
  public Map<String, Object> getEnergyIntensitySummary(
      @RequestParam(required = false) Long areaId,
      @RequestParam(required = false) String energyTypeCode,
      @RequestParam(required = false) String from,
      @RequestParam(required = false) String to
  ) {
    return ApiResponses.data(energyService.getEnergyIntensitySummary(areaId, energyTypeCode, from, to));
  }

  @GetMapping("/meters")
  public Map<String, Object> listMeters(@RequestParam(required = false) Long areaId) {
    return ApiResponses.data(energyService.listMeters(areaId));
  }

  @PostMapping("/meters")
  @ResponseStatus(HttpStatus.CREATED)
  public Map<String, Object> createMeter(
      @RequestBody Map<String, Object> body,
      @RequestHeader(value = "Authorization", required = false) String authorization,
      HttpServletRequest request
  ) {
    AuthenticatedAdmin admin = authService.requireAdmin(authorization);
    return ApiResponses.data(energyService.createMeter(body, request.getRemoteAddr(), admin.id()));
  }

  @PostMapping("/energy-readings")
  @ResponseStatus(HttpStatus.CREATED)
  public Map<String, Object> saveEnergyReading(
      @RequestBody Map<String, Object> body,
      @RequestHeader(value = "Authorization", required = false) String authorization,
      HttpServletRequest request
  ) {
    AuthenticatedAdmin admin = authService.requireAdmin(authorization);
    return ApiResponses.data(energyService.saveEnergyReading(body, request.getRemoteAddr(), admin.id()));
  }

  @GetMapping("/energy-readings/summary")
  public Map<String, Object> getEnergySummary(
      @RequestParam(required = false) Long areaId,
      @RequestParam(required = false) String energyTypeCode,
      @RequestParam(defaultValue = "month") String groupBy,
      @RequestParam(required = false) String from,
      @RequestParam(required = false) String to
  ) {
    // 模块页的趋势、强度、对标、碳排等功能都复用这个聚合接口。
    return ApiResponses.data(energyService.getEnergySummary(areaId, energyTypeCode, groupBy, from, to));
  }
}

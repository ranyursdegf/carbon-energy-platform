package com.carbon.energy.controller;

import com.carbon.energy.service.DashboardService;
import com.carbon.energy.support.ApiResponses;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/dashboard")
public class DashboardController {

  private final DashboardService dashboardService;

  public DashboardController(DashboardService dashboardService) {
    this.dashboardService = dashboardService;
  }

  @GetMapping("/overview")
  // 首页或管理驾驶舱可以先调用这个轻量汇总接口。
  public Map<String, Object> overview(
      @RequestParam(required = false) String from,
      @RequestParam(required = false) String to
  ) {
    return ApiResponses.data(dashboardService.getOverview(from, to));
  }

  @GetMapping("/area-ranking")
  public Map<String, Object> areaRanking() {
    return ApiResponses.data(dashboardService.getAreaRanking());
  }
}

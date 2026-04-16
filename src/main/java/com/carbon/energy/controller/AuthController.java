package com.carbon.energy.controller;

import com.carbon.energy.service.AuthService;
import com.carbon.energy.support.ApiResponses;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 管理员登录接口。
 *
 * <p>前端主页登录弹窗调用 /login，后台页面刷新时调用 /me 验证当前 token 是否还有效。</p>
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

  private final AuthService authService;

  public AuthController(AuthService authService) {
    this.authService = authService;
  }

  @PostMapping("/login")
  public Map<String, Object> login(@RequestBody Map<String, Object> body, HttpServletRequest request) {
    return ApiResponses.data(authService.login(body, request.getRemoteAddr()));
  }

  @GetMapping("/me")
  public Map<String, Object> me(@RequestHeader(value = "Authorization", required = false) String authorization) {
    return ApiResponses.data(authService.getCurrentAdmin(authorization));
  }

  @PostMapping("/logout")
  public Map<String, Object> logout(
      @RequestHeader(value = "Authorization", required = false) String authorization,
      HttpServletRequest request
  ) {
    authService.logout(authorization, request.getRemoteAddr());
    return ApiResponses.data(Map.of("ok", true));
  }

  @PostMapping("/change-password")
  public Map<String, Object> changePassword(
      @RequestHeader(value = "Authorization", required = false) String authorization,
      @RequestBody Map<String, Object> body,
      HttpServletRequest request
  ) {
    authService.changePassword(authorization, body, request.getRemoteAddr());
    return ApiResponses.data(Map.of("ok", true));
  }
}

package com.carbon.energy.service;

import static com.carbon.energy.support.RequestUtils.requiredString;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

/**
 * 管理员登录与令牌校验。
 *
 * <p>当前项目先用轻量 Bearer Token 串起后台登录流程，管理员账号仍然来自 MySQL 的
 * app_users / roles / user_roles 表。后续如果要做更完整的权限系统，可以在这个位置替换为
 * Spring Security，而前端调用方式不用大改。</p>
 */
@Service
public class AuthService {

  private static final Duration SESSION_TTL = Duration.ofHours(8);

  private final JdbcTemplate jdbcTemplate;
  private final PasswordService passwordService;
  private final AuditService auditService;
  private final SecureRandom secureRandom = new SecureRandom();
  private final ConcurrentMap<String, Session> sessions = new ConcurrentHashMap<>();

  public AuthService(JdbcTemplate jdbcTemplate, PasswordService passwordService, AuditService auditService) {
    this.jdbcTemplate = jdbcTemplate;
    this.passwordService = passwordService;
    this.auditService = auditService;
  }

  public Map<String, Object> login(Map<String, Object> body, String requestIp) {
    String username = requiredString(body, "username", "账号");
    String password = requiredString(body, "password", "密码");
    Map<String, Object> row = findActiveUser(username);

    if (row == null || !passwordService.verify(password, stringValue(row.get("password_hash")))) {
      throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "账号或密码不正确");
    }

    AuthenticatedAdmin user = toAuthenticatedAdmin(row);
    if (!user.roles().contains("admin")) {
      throw new ResponseStatusException(HttpStatus.FORBIDDEN, "该账号不是管理员");
    }

    String token = createToken();
    Instant expiresAt = Instant.now().plus(SESSION_TTL);
    sessions.put(token, new Session(token, user, expiresAt));
    auditService.log(user.id(), "ADMIN_LOGIN", "admin", user.id(), requestIp, Map.of("username", user.username()));

    Map<String, Object> result = new LinkedHashMap<>();
    result.put("token", token);
    result.put("expiresAt", expiresAt.toString());
    result.put("user", publicUser(user));
    return result;
  }

  public Map<String, Object> getCurrentAdmin(String authorization) {
    return publicUser(requireAdmin(authorization));
  }

  public void logout(String authorization, String requestIp) {
    String token = extractToken(authorization);
    if (token == null) {
      return;
    }

    Session removed = sessions.remove(token);
    if (removed != null) {
      auditService.log(removed.user().id(), "ADMIN_LOGOUT", "admin", removed.user().id(), requestIp, Map.of());
    }
  }

  public void changePassword(String authorization, Map<String, Object> body, String requestIp) {
    AuthenticatedAdmin user = requireAdmin(authorization);
    String currentPassword = requiredString(body, "currentPassword", "当前密码");
    String newPassword = requiredString(body, "newPassword", "新密码");
    if (newPassword.length() < 6) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "新密码至少 6 位");
    }

    Map<String, Object> row = findActiveUser(user.username());
    if (row == null || !passwordService.verify(currentPassword, stringValue(row.get("password_hash")))) {
      throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "当前密码不正确");
    }

    jdbcTemplate.update("UPDATE app_users SET password_hash = ? WHERE id = ?", passwordService.hash(newPassword), user.id());
    sessions.entrySet().removeIf(entry -> entry.getValue().user().id() == user.id());
    auditService.log(user.id(), "CHANGE_PASSWORD", "admin", user.id(), requestIp, Map.of("username", user.username()));
  }

  public AuthenticatedAdmin requireAdmin(String authorization) {
    String token = extractToken(authorization);
    if (token == null) {
      throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "请先登录管理员账号");
    }

    Session session = sessions.get(token);
    if (session == null || session.expiresAt().isBefore(Instant.now())) {
      sessions.remove(token);
      throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "登录已失效，请重新登录");
    }

    if (!session.user().roles().contains("admin")) {
      throw new ResponseStatusException(HttpStatus.FORBIDDEN, "需要管理员权限");
    }
    return session.user();
  }

  private Map<String, Object> findActiveUser(String username) {
    List<Map<String, Object>> rows = jdbcTemplate.queryForList("""
        SELECT
          u.id,
          u.username,
          u.display_name,
          u.password_hash,
          COALESCE(GROUP_CONCAT(r.code), '') AS roles
        FROM app_users u
        LEFT JOIN user_roles ur ON ur.user_id = u.id
        LEFT JOIN roles r ON r.id = ur.role_id
        WHERE u.username = ? AND u.is_active = 1
        GROUP BY u.id, u.username, u.display_name, u.password_hash
        LIMIT 1
        """, username);
    return rows.isEmpty() ? null : rows.get(0);
  }

  private AuthenticatedAdmin toAuthenticatedAdmin(Map<String, Object> row) {
    Set<String> roles = Arrays.stream(stringValue(row.get("roles")).split(","))
        .map(String::trim)
        .filter(item -> !item.isBlank())
        .collect(Collectors.toUnmodifiableSet());

    return new AuthenticatedAdmin(
        numberValue(row.get("id")).longValue(),
        stringValue(row.get("username")),
        stringValue(row.get("display_name")),
        roles
    );
  }

  private Map<String, Object> publicUser(AuthenticatedAdmin user) {
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("id", user.id());
    result.put("username", user.username());
    result.put("displayName", user.displayName());
    result.put("roles", user.roles());
    return result;
  }

  private String createToken() {
    byte[] bytes = new byte[32];
    secureRandom.nextBytes(bytes);
    return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
  }

  private String extractToken(String authorization) {
    if (authorization == null || authorization.isBlank()) {
      return null;
    }
    String prefix = "Bearer ";
    if (!authorization.startsWith(prefix)) {
      return null;
    }
    return authorization.substring(prefix.length()).trim();
  }

  private Number numberValue(Object value) {
    if (value instanceof Number number) {
      return number;
    }
    return Long.parseLong(String.valueOf(value));
  }

  private String stringValue(Object value) {
    return value == null ? "" : String.valueOf(value);
  }

  public record AuthenticatedAdmin(
      long id,
      String username,
      String displayName,
      Set<String> roles
  ) {
  }

  private record Session(
      String token,
      AuthenticatedAdmin user,
      Instant expiresAt
  ) {
  }
}

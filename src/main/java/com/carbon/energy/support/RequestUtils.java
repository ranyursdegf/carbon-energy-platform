package com.carbon.energy.support;

import java.math.BigDecimal;
import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

public final class RequestUtils {

  private RequestUtils() {
  }

  public static long positiveLong(Object value, String label) {
    if (value == null || String.valueOf(value).isBlank()) {
      throw badRequest(label + "不能为空");
    }
    try {
      long parsed = Long.parseLong(String.valueOf(value));
      if (parsed <= 0) {
        throw badRequest(label + "必须是正整数");
      }
      return parsed;
    } catch (NumberFormatException error) {
      throw badRequest(label + "必须是正整数");
    }
  }

  public static int positiveIntOrDefault(String value, int fallback) {
    if (value == null || value.isBlank()) {
      return fallback;
    }
    try {
      int parsed = Integer.parseInt(value);
      return parsed > 0 ? parsed : fallback;
    } catch (NumberFormatException error) {
      return fallback;
    }
  }

  public static String requiredString(Map<String, Object> body, String key, String label) {
    Object value = body.get(key);
    if (value == null || String.valueOf(value).trim().isEmpty()) {
      throw badRequest(label + "不能为空");
    }
    return String.valueOf(value).trim();
  }

  public static String optionalString(Map<String, Object> body, String key) {
    Object value = body.get(key);
    if (value == null || String.valueOf(value).trim().isEmpty()) {
      return null;
    }
    return String.valueOf(value).trim();
  }

  public static BigDecimal optionalDecimal(Map<String, Object> body, String key, BigDecimal fallback) {
    Object value = body.get(key);
    if (value == null || String.valueOf(value).isBlank()) {
      return fallback;
    }
    try {
      return new BigDecimal(String.valueOf(value));
    } catch (NumberFormatException error) {
      throw badRequest(key + "必须是数字");
    }
  }

  public static Integer optionalInteger(Map<String, Object> body, String key, Integer fallback) {
    Object value = body.get(key);
    if (value == null || String.valueOf(value).isBlank()) {
      return fallback;
    }
    try {
      return Integer.parseInt(String.valueOf(value));
    } catch (NumberFormatException error) {
      throw badRequest(key + "必须是整数");
    }
  }

  public static Long optionalLong(Map<String, Object> body, String key) {
    Object value = body.get(key);
    if (value == null || String.valueOf(value).isBlank()) {
      return null;
    }
    return positiveLong(value, key);
  }

  public static String allowed(String value, Set<String> allowed, String label) {
    if (value == null || !allowed.contains(value)) {
      throw badRequest(label + "参数不支持");
    }
    return value;
  }

  public static String normalizeDateTime(Object value, String label) {
    if (value == null || String.valueOf(value).trim().isEmpty()) {
      throw badRequest(label + "不能为空");
    }

    String raw = String.valueOf(value).trim();
    if (raw.matches("\\d{4}-\\d{2}-\\d{2}")) {
      return raw + " 00:00:00";
    }
    if (raw.matches("\\d{4}-\\d{2}")) {
      return raw + "-01 00:00:00";
    }
    if (raw.matches("\\d{4}")) {
      return raw + "-01-01 00:00:00";
    }
    if (raw.matches("\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}")) {
      return raw.replace('T', ' ') + ":00";
    }
    if (raw.matches("\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}")) {
      return raw + ":00";
    }
    if (raw.matches("\\d{4}-\\d{2}-\\d{2}[ T]\\d{2}:\\d{2}:\\d{2}")) {
      return raw.replace('T', ' ');
    }
    throw badRequest(label + "格式应为 YYYY-MM-DD、YYYY-MM、YYYY 或 YYYY-MM-DD HH:mm:ss");
  }

  public static ResponseStatusException badRequest(String message) {
    return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
  }
}

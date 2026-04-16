package com.carbon.energy.support;

import java.util.LinkedHashMap;
import java.util.Map;

public final class ApiResponses {

  private ApiResponses() {
  }

  public static Map<String, Object> data(Object data) {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("data", data);
    return body;
  }

  public static Map<String, Object> error(String message, String detail) {
    Map<String, Object> error = new LinkedHashMap<>();
    error.put("message", message);
    if (detail != null && !detail.isBlank()) {
      error.put("detail", detail);
    }

    Map<String, Object> body = new LinkedHashMap<>();
    body.put("error", error);
    return body;
  }
}

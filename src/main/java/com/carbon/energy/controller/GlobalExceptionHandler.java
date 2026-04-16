package com.carbon.energy.controller;

import com.carbon.energy.support.ApiResponses;
import java.util.Map;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice
public class GlobalExceptionHandler {

  @ExceptionHandler(ResponseStatusException.class)
  public ResponseEntity<Map<String, Object>> handleResponseStatus(ResponseStatusException error) {
    // 主动抛出的业务错误保留原状态码，例如 400 参数错误或 404 数据不存在。
    return ResponseEntity
        .status(error.getStatusCode())
        .body(ApiResponses.error(error.getReason(), null));
  }

  @ExceptionHandler(DataAccessException.class)
  public ResponseEntity<Map<String, Object>> handleDatabase(DataAccessException error) {
    return ResponseEntity
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .body(ApiResponses.error("数据库操作失败", error.getMostSpecificCause().getMessage()));
  }

  @ExceptionHandler(Exception.class)
  public ResponseEntity<Map<String, Object>> handleException(Exception error) {
    return ResponseEntity
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .body(ApiResponses.error("服务器处理失败", error.getMessage()));
  }
}

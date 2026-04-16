package com.carbon.energy.support;

import java.io.BufferedReader;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

public final class DotEnvLoader {

  private DotEnvLoader() {
  }

  public static void load() {
    // Spring Boot 默认不读取 .env，这里在启动前把项目根目录 .env 写入 System properties。
    Path envPath = Path.of(".env");
    if (!Files.exists(envPath)) {
      return;
    }

    try (BufferedReader reader = Files.newBufferedReader(envPath, StandardCharsets.UTF_8)) {
      String line;
      while ((line = reader.readLine()) != null) {
        applyLine(line);
      }
    } catch (IOException ignored) {
      // Spring will still read normal environment variables if the local .env file is unavailable.
    }
  }

  private static void applyLine(String rawLine) {
    String line = rawLine.trim();
    if (line.isEmpty() || line.startsWith("#")) {
      return;
    }

    int index = line.indexOf('=');
    if (index <= 0) {
      return;
    }

    String key = line.substring(0, index).trim();
    String value = line.substring(index + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\""))
        || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.substring(1, value.length() - 1);
    }

    if (System.getenv(key) == null && System.getProperty(key) == null) {
      System.setProperty(key, value);
    }
  }
}

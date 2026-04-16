package com.carbon.energy.config;

import java.nio.file.Path;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {

  @Value("${CORS_ORIGIN:*}")
  private String corsOrigin;

  @Override
  public void addCorsMappings(CorsRegistry registry) {
    // 前端后续如果独立部署到其他端口，只要改 .env 的 CORS_ORIGIN 即可。
    registry.addMapping("/api/**")
        .allowedOriginPatterns(corsOrigin)
        .allowedMethods("GET", "POST", "PATCH", "DELETE", "OPTIONS")
        .allowedHeaders("*");
  }

  @Override
  public void addResourceHandlers(ResourceHandlerRegistry registry) {
    // Spring Boot 直接托管 viewweb 静态页面，避免前端开发阶段再单独开一个静态服务器。
    String staticPath = Path.of("viewweb").toAbsolutePath().normalize().toUri().toString();
    registry.addResourceHandler("/**")
        .addResourceLocations(staticPath)
        .setCachePeriod(0);
  }
}

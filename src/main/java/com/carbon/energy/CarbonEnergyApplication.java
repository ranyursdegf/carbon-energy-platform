package com.carbon.energy;

import com.carbon.energy.support.DotEnvLoader;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class CarbonEnergyApplication {

  public static void main(String[] args) {
    DotEnvLoader.load();
    SpringApplication.run(CarbonEnergyApplication.class, args);
  }
}

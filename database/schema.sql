CREATE DATABASE IF NOT EXISTS carbon_emission
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE carbon_emission;

-- 组织表：一个系统可以服务多个企业、园区或项目主体。
CREATE TABLE IF NOT EXISTS organizations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(160) NOT NULL,
  contact_name VARCHAR(80) NULL,
  contact_phone VARCHAR(40) NULL,
  note VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_organizations_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 区域表：园区、楼栋、楼层、房间都可以作为统计边界。
CREATE TABLE IF NOT EXISTS areas (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id BIGINT UNSIGNED NOT NULL,
  parent_area_id BIGINT UNSIGNED NULL,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(160) NOT NULL,
  area_type ENUM('park', 'building', 'floor', 'room', 'office', 'custom') NOT NULL DEFAULT 'office',
  floor_area_m2 DECIMAL(12,2) NOT NULL DEFAULT 0,
  staff_count INT UNSIGNED NOT NULL DEFAULT 0,
  grid_emission_factor DECIMAL(10,4) NOT NULL DEFAULT 0.4200,
  annual_budget_kwh DECIMAL(14,3) NULL,
  note VARCHAR(500) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_areas_org_code (organization_id, code),
  KEY idx_areas_parent (parent_area_id),
  KEY idx_areas_active (is_active),
  CONSTRAINT fk_areas_organization
    FOREIGN KEY (organization_id) REFERENCES organizations(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_areas_parent
    FOREIGN KEY (parent_area_id) REFERENCES areas(id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 能源类型字典：目前前端先用电，后续可以扩展水、燃气、蒸汽等。
CREATE TABLE IF NOT EXISTS energy_types (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(80) NOT NULL,
  unit VARCHAR(24) NOT NULL,
  default_emission_factor DECIMAL(12,6) NULL,
  carbon_unit VARCHAR(32) NOT NULL DEFAULT 'kg CO₂e',
  note VARCHAR(500) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_energy_types_code (code),
  KEY idx_energy_types_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 排放因子表：按能源类型、地区、年份和版本保存，便于后续切换核算口径。
CREATE TABLE IF NOT EXISTS emission_factors (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  energy_type_id BIGINT UNSIGNED NOT NULL,
  region_code VARCHAR(64) NOT NULL DEFAULT 'CN',
  factor_year INT NOT NULL,
  factor_value DECIMAL(12,6) NOT NULL,
  factor_unit VARCHAR(40) NOT NULL DEFAULT 'kg CO₂e/unit',
  source_name VARCHAR(160) NULL,
  version VARCHAR(80) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_emission_factor_version (energy_type_id, region_code, factor_year, version),
  KEY idx_emission_factors_active (is_active),
  CONSTRAINT fk_emission_factors_energy_type
    FOREIGN KEY (energy_type_id) REFERENCES energy_types(id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 表计/采集设备表：一个区域可以挂多个电表、水表或其他能源采集设备。
CREATE TABLE IF NOT EXISTS meters (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  area_id BIGINT UNSIGNED NOT NULL,
  energy_type_id BIGINT UNSIGNED NOT NULL,
  code VARCHAR(80) NOT NULL,
  name VARCHAR(160) NOT NULL,
  location VARCHAR(200) NULL,
  manufacturer VARCHAR(120) NULL,
  installed_at DATE NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_meters_area_code (area_id, code),
  KEY idx_meters_energy_type (energy_type_id),
  KEY idx_meters_active (is_active),
  CONSTRAINT fk_meters_area
    FOREIGN KEY (area_id) REFERENCES areas(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_meters_energy_type
    FOREIGN KEY (energy_type_id) REFERENCES energy_types(id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 数据导入批次表：批量导入或自动采集时记录来源、文件名、状态和数量。
CREATE TABLE IF NOT EXISTS data_import_batches (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  batch_no VARCHAR(80) NOT NULL,
  source_type VARCHAR(40) NOT NULL DEFAULT 'manual',
  file_name VARCHAR(255) NULL,
  status ENUM('pending', 'success', 'failed') NOT NULL DEFAULT 'pending',
  total_rows INT UNSIGNED NOT NULL DEFAULT 0,
  success_rows INT UNSIGNED NOT NULL DEFAULT 0,
  failed_rows INT UNSIGNED NOT NULL DEFAULT 0,
  message VARCHAR(1000) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_data_import_batches_no (batch_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 通用能源读数表：后续大量数据建议进入这里，electricity_readings 保留给现有前端兼容。
CREATE TABLE IF NOT EXISTS energy_readings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  area_id BIGINT UNSIGNED NOT NULL,
  meter_id BIGINT UNSIGNED NULL,
  energy_type_id BIGINT UNSIGNED NOT NULL,
  reading_time DATETIME NOT NULL,
  period_type ENUM('hour', 'day', 'month', 'year') NOT NULL DEFAULT 'day',
  amount DECIMAL(18,6) NOT NULL,
  source VARCHAR(80) NOT NULL DEFAULT 'manual',
  import_batch_id BIGINT UNSIGNED NULL,
  note VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_energy_readings_area_time (area_id, reading_time),
  KEY idx_energy_readings_type_time (energy_type_id, reading_time),
  KEY idx_energy_readings_meter_time (meter_id, reading_time),
  KEY idx_energy_readings_batch (import_batch_id),
  CONSTRAINT fk_energy_readings_area
    FOREIGN KEY (area_id) REFERENCES areas(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_energy_readings_meter
    FOREIGN KEY (meter_id) REFERENCES meters(id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_energy_readings_energy_type
    FOREIGN KEY (energy_type_id) REFERENCES energy_types(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_energy_readings_import_batch
    FOREIGN KEY (import_batch_id) REFERENCES data_import_batches(id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT chk_energy_readings_amount_non_negative CHECK (amount >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 预算表：区域 + 能源类型 + 年/月维度预算，后续预警和对标都可以从这里取数。
CREATE TABLE IF NOT EXISTS energy_budgets (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  area_id BIGINT UNSIGNED NOT NULL,
  energy_type_id BIGINT UNSIGNED NOT NULL,
  budget_year INT NOT NULL,
  budget_period ENUM('year', 'month') NOT NULL DEFAULT 'year',
  period_start DATE NOT NULL,
  budget_amount DECIMAL(18,6) NOT NULL,
  budget_carbon_tons DECIMAL(18,6) NULL,
  note VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_energy_budgets_period (area_id, energy_type_id, budget_period, period_start),
  KEY idx_energy_budgets_year (budget_year),
  CONSTRAINT fk_energy_budgets_area
    FOREIGN KEY (area_id) REFERENCES areas(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_energy_budgets_energy_type
    FOREIGN KEY (energy_type_id) REFERENCES energy_types(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_energy_budgets_amount_non_negative CHECK (budget_amount >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 用户表：管理员登录从这里读账号与密码哈希；后续可以继续扩展为更完整的权限体系。
CREATE TABLE IF NOT EXISTS app_users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  username VARCHAR(80) NOT NULL,
  display_name VARCHAR(120) NOT NULL,
  password_hash VARCHAR(255) NULL,
  email VARCHAR(160) NULL,
  phone VARCHAR(40) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_app_users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS roles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(80) NOT NULL,
  note VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_roles_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_roles (
  user_id BIGINT UNSIGNED NOT NULL,
  role_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, role_id),
  CONSTRAINT fk_user_roles_user
    FOREIGN KEY (user_id) REFERENCES app_users(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_user_roles_role
    FOREIGN KEY (role_id) REFERENCES roles(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 审计日志：记录关键增删改动作，后续做权限和追溯时会用到。
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NULL,
  action VARCHAR(80) NOT NULL,
  target_type VARCHAR(80) NOT NULL,
  target_id BIGINT UNSIGNED NULL,
  request_ip VARCHAR(64) NULL,
  detail JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_logs_user (user_id),
  KEY idx_audit_logs_target (target_type, target_id),
  KEY idx_audit_logs_created_at (created_at),
  CONSTRAINT fk_audit_logs_user
    FOREIGN KEY (user_id) REFERENCES app_users(id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 预警规则：例如区域月度用电超过预算 100 % 时触发。
CREATE TABLE IF NOT EXISTS alert_rules (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  area_id BIGINT UNSIGNED NULL,
  energy_type_id BIGINT UNSIGNED NULL,
  rule_code VARCHAR(80) NOT NULL,
  name VARCHAR(160) NOT NULL,
  metric VARCHAR(80) NOT NULL,
  operator VARCHAR(16) NOT NULL,
  threshold_value DECIMAL(18,6) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_alert_rules_code (rule_code),
  KEY idx_alert_rules_active (is_active),
  CONSTRAINT fk_alert_rules_area
    FOREIGN KEY (area_id) REFERENCES areas(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_alert_rules_energy_type
    FOREIGN KEY (energy_type_id) REFERENCES energy_types(id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 兼容表：前端现有“区域与用电数据”页面仍然读写这张表。
CREATE TABLE IF NOT EXISTS electricity_readings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  area_id BIGINT UNSIGNED NOT NULL,
  reading_time DATETIME NOT NULL,
  period_type ENUM('hour', 'day', 'month', 'year') NOT NULL DEFAULT 'day',
  kwh DECIMAL(14,3) NOT NULL,
  source VARCHAR(80) NOT NULL DEFAULT 'manual',
  note VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_readings_area_period_time (area_id, period_type, reading_time),
  KEY idx_readings_area_time (area_id, reading_time),
  KEY idx_readings_period_type (period_type),
  CONSTRAINT fk_readings_area
    FOREIGN KEY (area_id) REFERENCES areas(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT chk_readings_kwh_non_negative CHECK (kwh >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP VIEW IF EXISTS v_area_energy_monthly;
CREATE VIEW v_area_energy_monthly AS
SELECT
  a.id AS area_id,
  a.name AS area_name,
  et.code AS energy_type_code,
  et.name AS energy_type_name,
  et.unit AS unit,
  DATE_FORMAT(r.reading_time, '%Y-%m-01') AS stat_month,
  SUM(r.amount) AS total_amount,
  SUM(r.amount * COALESCE(ef.factor_value, et.default_emission_factor, 0)) / 1000 AS total_carbon_tons
FROM areas a
JOIN energy_readings r ON r.area_id = a.id
JOIN energy_types et ON et.id = r.energy_type_id
LEFT JOIN emission_factors ef
  ON ef.energy_type_id = et.id
  AND ef.factor_year = YEAR(r.reading_time)
  AND ef.is_active = 1
WHERE a.is_active = 1
GROUP BY a.id, a.name, et.code, et.name, et.unit, DATE_FORMAT(r.reading_time, '%Y-%m-01');

DROP VIEW IF EXISTS v_area_electricity_daily;
CREATE VIEW v_area_electricity_daily AS
SELECT
  a.id AS area_id,
  a.name AS area_name,
  DATE(r.reading_time) AS stat_date,
  SUM(r.kwh) AS total_kwh,
  SUM(r.kwh * a.grid_emission_factor) / 1000 AS total_carbon_tons
FROM areas a
JOIN electricity_readings r ON r.area_id = a.id
WHERE a.is_active = 1
GROUP BY a.id, a.name, DATE(r.reading_time);

DROP VIEW IF EXISTS v_area_electricity_monthly;
CREATE VIEW v_area_electricity_monthly AS
SELECT
  a.id AS area_id,
  a.name AS area_name,
  DATE_FORMAT(r.reading_time, '%Y-%m-01') AS stat_month,
  SUM(r.kwh) AS total_kwh,
  SUM(r.kwh * a.grid_emission_factor) / 1000 AS total_carbon_tons
FROM areas a
JOIN electricity_readings r ON r.area_id = a.id
WHERE a.is_active = 1
GROUP BY a.id, a.name, DATE_FORMAT(r.reading_time, '%Y-%m-01');

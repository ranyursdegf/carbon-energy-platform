SET NAMES utf8mb4;

USE carbon_emission;

INSERT INTO organizations (code, name, contact_name, note)
VALUES ('green-office-tech', '绿色办公科技', '管理员', '默认演示组织')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  contact_name = VALUES(contact_name),
  note = VALUES(note);

INSERT INTO energy_types (code, name, unit, default_emission_factor, carbon_unit, note)
VALUES
  ('electricity', '电力', 'kWh', 0.420000, 'kg CO₂e', '购入电力'),
  ('water', '自来水', 'm³', NULL, 'kg CO₂e', '预留能源类型'),
  ('gas', '天然气', 'm³', NULL, 'kg CO₂e', '预留能源类型'),
  ('steam', '蒸汽', 'GJ', NULL, 'kg CO₂e', '预留能源类型')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  unit = VALUES(unit),
  default_emission_factor = VALUES(default_emission_factor),
  carbon_unit = VALUES(carbon_unit),
  note = VALUES(note),
  is_active = 1;

INSERT INTO emission_factors (energy_type_id, region_code, factor_year, factor_value, factor_unit, source_name, version, is_active)
SELECT id, 'CN', 2025, 0.420000, 'kg CO₂e/kWh', '默认演示因子', '2025-demo', 1
FROM energy_types
WHERE code = 'electricity'
ON DUPLICATE KEY UPDATE
  factor_value = VALUES(factor_value),
  factor_unit = VALUES(factor_unit),
  source_name = VALUES(source_name),
  is_active = 1;

INSERT INTO areas (
  organization_id,
  code,
  name,
  area_type,
  floor_area_m2,
  staff_count,
  grid_emission_factor,
  annual_budget_kwh,
  note
)
SELECT
  id,
  'hq-office',
  '总部办公区',
  'office',
  520.00,
  40,
  0.4200,
  58000.000,
  '初始化办公区域'
FROM organizations
WHERE code = 'green-office-tech'
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  floor_area_m2 = VALUES(floor_area_m2),
  staff_count = VALUES(staff_count),
  grid_emission_factor = VALUES(grid_emission_factor),
  annual_budget_kwh = VALUES(annual_budget_kwh),
  is_active = 1;

INSERT INTO meters (area_id, energy_type_id, code, name, location, is_active)
SELECT a.id, et.id, 'hq-office-main-electricity', '总部办公区总电表', '总部办公区', 1
FROM areas a
JOIN organizations o ON o.id = a.organization_id
JOIN energy_types et ON et.code = 'electricity'
WHERE o.code = 'green-office-tech' AND a.code = 'hq-office'
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  location = VALUES(location),
  is_active = 1;

INSERT INTO energy_budgets (area_id, energy_type_id, budget_year, budget_period, period_start, budget_amount, budget_carbon_tons, note)
SELECT a.id, et.id, 2025, 'year', '2025-01-01', 58000.000, 24.360000, '总部办公区年度电力预算'
FROM areas a
JOIN organizations o ON o.id = a.organization_id
JOIN energy_types et ON et.code = 'electricity'
WHERE o.code = 'green-office-tech' AND a.code = 'hq-office'
ON DUPLICATE KEY UPDATE
  budget_amount = VALUES(budget_amount),
  budget_carbon_tons = VALUES(budget_carbon_tons),
  note = VALUES(note);

INSERT INTO roles (code, name, note)
VALUES
  ('admin', '系统管理员', '拥有系统管理权限'),
  ('operator', '数据维护员', '负责区域、表计和能源数据维护'),
  ('viewer', '数据查看员', '只查看统计和报表')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  note = VALUES(note);

INSERT INTO app_users (username, display_name, password_hash, email, is_active)
VALUES (
  'admin',
  '系统管理员',
  'pbkdf2$310000$FgSstAJ/ySWQloBlZ6ylVw==$CrBCogWCUdEsoPtZ5U5wMZva8zTnAj336C+kNSOObNg=',
  NULL,
  1
)
ON DUPLICATE KEY UPDATE
  display_name = VALUES(display_name),
  password_hash = VALUES(password_hash),
  is_active = 1;

INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM app_users u
JOIN roles r ON r.code = 'admin'
WHERE u.username = 'admin'
ON DUPLICATE KEY UPDATE user_id = VALUES(user_id);

INSERT INTO alert_rules (area_id, energy_type_id, rule_code, name, metric, operator, threshold_value, is_active)
SELECT a.id, et.id, 'electricity-budget-over-100', '用电预算超限', 'budget_rate', '>', 1.000000, 1
FROM areas a
JOIN organizations o ON o.id = a.organization_id
JOIN energy_types et ON et.code = 'electricity'
WHERE o.code = 'green-office-tech' AND a.code = 'hq-office'
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  metric = VALUES(metric),
  operator = VALUES(operator),
  threshold_value = VALUES(threshold_value),
  is_active = 1;

INSERT INTO electricity_readings (area_id, reading_time, period_type, kwh, source, note)
SELECT a.id, '2025-01-01 00:00:00', 'day', 146.500, 'seed', '工作日用电'
FROM areas a
JOIN organizations o ON o.id = a.organization_id
WHERE o.code = 'green-office-tech' AND a.code = 'hq-office'
ON DUPLICATE KEY UPDATE kwh = VALUES(kwh), source = VALUES(source), note = VALUES(note);

INSERT INTO electricity_readings (area_id, reading_time, period_type, kwh, source, note)
SELECT a.id, '2025-01-02 00:00:00', 'day', 151.200, 'seed', '工作日用电'
FROM areas a
JOIN organizations o ON o.id = a.organization_id
WHERE o.code = 'green-office-tech' AND a.code = 'hq-office'
ON DUPLICATE KEY UPDATE kwh = VALUES(kwh), source = VALUES(source), note = VALUES(note);

INSERT INTO energy_readings (area_id, meter_id, energy_type_id, reading_time, period_type, amount, source, note)
SELECT a.id, m.id, et.id, er.reading_time, er.period_type, er.kwh, er.source, er.note
FROM electricity_readings er
JOIN areas a ON a.id = er.area_id
JOIN energy_types et ON et.code = 'electricity'
LEFT JOIN meters m ON m.area_id = a.id AND m.energy_type_id = et.id AND m.code = 'hq-office-main-electricity'
LEFT JOIN energy_readings existing
  ON existing.area_id = a.id
  AND existing.energy_type_id = et.id
  AND existing.reading_time = er.reading_time
  AND existing.period_type = er.period_type
WHERE existing.id IS NULL;

INSERT INTO electricity_readings (area_id, reading_time, period_type, kwh, source, note)
SELECT a.id, '2025-01-03 00:00:00', 'day', 162.900, 'seed', '加班负荷'
FROM areas a
JOIN organizations o ON o.id = a.organization_id
WHERE o.code = 'green-office-tech' AND a.code = 'hq-office'
ON DUPLICATE KEY UPDATE kwh = VALUES(kwh), source = VALUES(source), note = VALUES(note);

INSERT INTO electricity_readings (area_id, reading_time, period_type, kwh, source, note)
SELECT a.id, demo.reading_time, 'day', demo.kwh, 'seed', demo.note
FROM areas a
JOIN organizations o ON o.id = a.organization_id
JOIN (
  SELECT '2025-02-01 00:00:00' AS reading_time, 4380.000 AS kwh, '2月月度演示读数' AS note
  UNION ALL SELECT '2025-03-01 00:00:00', 4720.000, '3月月度演示读数'
  UNION ALL SELECT '2025-04-01 00:00:00', 4510.000, '4月月度演示读数'
  UNION ALL SELECT '2025-05-01 00:00:00', 4688.000, '5月月度演示读数'
  UNION ALL SELECT '2025-06-01 00:00:00', 5126.000, '6月月度演示读数'
  UNION ALL SELECT '2025-07-01 00:00:00', 5642.000, '7月月度演示读数'
  UNION ALL SELECT '2025-08-01 00:00:00', 5718.000, '8月月度演示读数'
  UNION ALL SELECT '2025-09-01 00:00:00', 4986.000, '9月月度演示读数'
  UNION ALL SELECT '2025-10-01 00:00:00', 4592.000, '10月月度演示读数'
  UNION ALL SELECT '2025-11-01 00:00:00', 4828.000, '11月月度演示读数'
  UNION ALL SELECT '2025-12-01 00:00:00', 5365.000, '12月月度演示读数'
) demo
WHERE o.code = 'green-office-tech' AND a.code = 'hq-office'
ON DUPLICATE KEY UPDATE kwh = VALUES(kwh), source = VALUES(source), note = VALUES(note);

INSERT INTO energy_readings (area_id, meter_id, energy_type_id, reading_time, period_type, amount, source, note)
SELECT a.id, m.id, et.id, er.reading_time, er.period_type, er.kwh, er.source, er.note
FROM electricity_readings er
JOIN areas a ON a.id = er.area_id
JOIN energy_types et ON et.code = 'electricity'
LEFT JOIN meters m ON m.area_id = a.id AND m.energy_type_id = et.id AND m.code = 'hq-office-main-electricity'
LEFT JOIN energy_readings existing
  ON existing.area_id = a.id
  AND existing.energy_type_id = et.id
  AND existing.reading_time = er.reading_time
  AND existing.period_type = er.period_type
WHERE existing.id IS NULL;

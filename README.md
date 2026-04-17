# 双碳能源管理平台

项目现在以前端静态页面 + Java Spring Boot 后端 + MySQL 为主。

- `viewweb/`：前端页面。
- `src/main/java/`：Java 后端源码。
- `database/`：MySQL 建表和初始化数据。
- `PROJECT_LOG.md`：每日开发日志、当前状态和下一步整改记录。

## 技术栈

- Java 17
- Spring Boot 3
- Spring Web
- Spring JDBC
- MySQL

## 1. 数据库配置

后端会读取项目根目录的 `.env`：

```env
PORT=3000
CORS_ORIGIN=*

DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=你的密码
DB_NAME=carbon_emission
DB_CONNECTION_LIMIT=10
```

你现在已经有 `.env` 文件了，密码不用写进代码。

## 2. 初始化 MySQL

如果还没有建表，可以在 MySQL 客户端里执行：

```sql
SET NAMES utf8mb4;
source d:/碳排放/database/schema.sql;
source d:/碳排放/database/seed.sql;
```

如果你本机安装了 MySQL 命令行，也可以在项目根目录执行：

```bash
mysql --default-character-set=utf8mb4 -u root -p < database/schema.sql
mysql --default-character-set=utf8mb4 -u root -p < database/seed.sql
```

如果页面只有数据库返回的区域名、能源名等中文乱码，通常是初始化数据曾经按 GBK/默认编码导入过。
按上面的命令重新执行 `database/seed.sql` 可以刷新演示数据；Docker 部署想彻底重置演示库时，再使用 `docker compose down -v` 后重新 `docker compose up -d --build`。

## 3. 启动 Java 后端

本地开发可以使用项目内便携工具，也可以使用系统全局工具：

- `tools/jdk17/`：可选，存在时启动脚本会优先使用。
- `tools/maven/`：项目内 Maven，`mvnw.cmd` 会优先使用。
- 如果从 Git 拉取项目后没有 `tools/jdk17/`，请在系统中安装 JDK 17，并确保 `java` 命令可用。

可以直接运行：

```bash
run-java-backend.cmd
```

也可以手动先打包再运行 jar：

```bash
mvnw.cmd -DskipTests package
java -jar target\carbon-energy-platform-app.jar
```

如果你想完全使用系统全局 Java/Maven，也可以安装：

- JDK 17
- Maven 3.9+

然后在 `d:\碳排放` 下同样建议先打包再运行：

```bash
mvn -DskipTests package
java -jar target\carbon-energy-platform-app.jar
```

在 VS Code 的 PowerShell 终端里运行脚本时，命令前面要带 `.\`：

```powershell
.\run-java-backend.cmd
```

如果只想检查项目能不能编译，不启动后端，可以运行：

```powershell
.\check-project.cmd
```

启动后访问：

```text
http://localhost:3000
http://localhost:3000/areas.html
http://localhost:3000/admin.html
http://localhost:3000/api/health
```

默认管理员账号来自 `database/seed.sql`：

```text
账号：admin
密码：123456
```

第一次部署后建议尽快把 `app_users.password_hash` 改成你自己的密码哈希。

## 4. Docker Compose 部署

如果要把项目放到另一台电脑长期运行，可以在那台电脑安装 Docker Desktop，然后在项目根目录执行：

```powershell
docker compose up -d --build
```

启动后访问：

```text
http://localhost:3000
```

如果老师和这台电脑在同一个局域网，先在这台电脑上查 IPv4 地址：

```powershell
ipconfig
```

然后让老师访问：

```text
http://这台电脑的IPv4地址:3000
```

常用 Docker 命令：

```powershell
docker compose ps
docker compose logs -f app
docker compose restart app
docker compose down
```

Docker 会同时启动：

- `carbon-app`：Java 后端和前端页面。
- `carbon-mysql`：MySQL 数据库。
- `mysql-data`：数据库持久化数据卷。

首次启动时，MySQL 会自动执行 `database/schema.sql` 和 `database/seed.sql`。如果你执行过一次后又想重置 Docker 数据库，可以运行：

```powershell
docker compose down -v
docker compose up -d --build
```

注意：`docker compose down -v` 会删除 Docker 里的数据库数据，真实数据导入后不要随便执行。默认 Docker MySQL 密码是 `carbon_dev_password`，只适合演示环境；正式部署前请通过环境变量 `DOCKER_MYSQL_ROOT_PASSWORD` 改掉。

## 5. 当前接口

登录：

- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `POST /api/auth/change-password`

审计：

- `GET /api/audit-logs?limit=20`：需要管理员 Bearer Token

区域：

- `GET /api/areas?includeStats=true`
- `POST /api/areas`：需要管理员 Bearer Token
- `GET /api/areas/{id}`
- `PATCH /api/areas/{id}`：需要管理员 Bearer Token
- `DELETE /api/areas/{id}`：需要管理员 Bearer Token

用电数据：

- `POST /api/areas/{id}/electricity-readings`：需要管理员 Bearer Token
- `GET /api/areas/{id}/electricity-readings`
- `GET /api/areas/{id}/electricity-summary?groupBy=month`

仪表盘：

- `GET /api/dashboard/overview`
- `GET /api/dashboard/area-ranking`

多能源扩展：

- `GET /api/energy-types`
- `GET /api/emission-factors?energyTypeCode=electricity`
- `POST /api/energy-calculator/convert`：按输入能源消费量折算 GJ、标准煤和强度指标
- `GET /api/energy-intensity/summary?areaId=1&from=2025-01-01&to=2025-12-31`：按时间段汇总综合能耗与强度
- `GET /api/meters?areaId=1`
- `POST /api/meters`：需要管理员 Bearer Token
- `POST /api/energy-readings`：需要管理员 Bearer Token
- `GET /api/energy-readings/summary?energyTypeCode=electricity&groupBy=month`

## 6. 数据库结构

已经创建的核心表：

- `organizations`：组织 / 企业 / 园区主体。
- `areas`：园区、楼栋、楼层、房间等统计区域。
- `electricity_readings`：兼容当前前端页面的电耗读数表。
- `energy_types`：能源类型字典，已初始化电、水、气、蒸汽。
- `meters`：表计或采集设备。
- `energy_readings`：后续大量数据建议写入的通用能源读数表。
- `emission_factors`：排放因子版本表。
- `energy_budgets`：区域能源预算表。
- `app_users`、`roles`、`user_roles`：管理员登录与角色权限。
- `audit_logs`：关键操作审计日志。
- `alert_rules`：预警规则。

## 7. 示例数据

现在模拟数据建议统一放在 `database/seed.sql` 里维护，前端不要再到处手写固定数字。

- 区域信息改 `areas` 的初始化语句，比如名称、面积、人数、年度预算。
- 电耗数据改 `electricity_readings` 的初始化语句。
- `seed.sql` 后面会把 `electricity_readings` 同步写入通用表 `energy_readings`，所以模块页可以直接读通用能源汇总接口。
- 修改完 `seed.sql` 后，可以重新执行 seed 文件刷新演示数据。注意：当前 seed 会把默认管理员密码重置为 `123456`。

新增区域：

```json
{
  "name": "A 座 3 层办公区",
  "code": "a3-office",
  "areaType": "office",
  "floorAreaM2": 860,
  "staffCount": 72,
  "annualBudgetKwh": 92000,
  "gridEmissionFactor": 0.42,
  "note": "手动新增区域"
}
```

录入用电：

```json
{
  "periodType": "day",
  "readingTime": "2026-04-11",
  "kwh": 168.4,
  "source": "manual",
  "note": "手动录入"
}
```

后台也支持 CSV 批量导入电耗。进入 `admin.html`，在“录入电耗”区域先选择区域，再上传 CSV。文件列名为：

```csv
readingTime,kwh,periodType,source,note
2026-04-16,168.4,day,CSV导入,日用电
2026-04,4380,month,CSV导入,月度用电
```

其中 `readingTime` 和 `kwh` 必填；`periodType` 可填 `hour`、`day`、`month`、`year`，不填时按页面当前统计口径处理。

录入通用能源数据：

```json
{
  "areaId": 1,
  "energyTypeCode": "electricity",
  "periodType": "day",
  "readingTime": "2026-04-11",
  "amount": 168.4,
  "source": "manual",
  "note": "写入通用能源读数表"
}
```

## 8. 当前状态

- Java 后端已经是主后端。
- MySQL 数据库已经初始化。
- 首页总览优先读取 MySQL 汇总数据。
- 功能模块页中，`能源查询`、`预算管理`、`碳排放管理` 已经改为优先读取 MySQL 汇总数据；其余模块仍保留前端演示数据，等真实数据字段确定后再逐步迁移。
- 主页右上角可以进入管理员登录。
- `admin.html` 负责新增区域、编辑区域、停用区域、录入电耗和修改管理员密码。
- `areas.html` 保留为区域与用电汇总查看页。
- Node.js 原型后端和依赖已经清理，后续统一按 Java 后端继续扩展。

## 9. 后端常驻说明

开发阶段建议手动运行：

```powershell
.\run-java-backend.cmd
```

只要这个终端窗口不关闭，后端就会一直监听 `http://localhost:3000`。

如果要开机自动启动，可以后续改成 Windows 计划任务或 Windows 服务。这样访问会更方便，但也会带来几个影响：

- 电脑开机后会占用 `3000` 端口。
- 后端会常驻占用一部分内存。
- MySQL 也需要同时可用，否则接口会报数据库连接失败。
- 改完 Java 代码后需要重新打包并重启服务。

所以本地开发阶段先手动启动更清楚；演示或部署阶段再做常驻服务更合适。

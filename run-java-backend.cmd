@echo off
setlocal
cd /d "%~dp0"
set "PORTABLE_JAVA=%~dp0tools\jdk17\jdk-17.0.18+8\bin\java.exe"
set "JAVA_CMD=java.exe"
if exist "%~dp0target\classes" rmdir /s /q "%~dp0target\classes"
if exist "%~dp0target\carbon-energy-platform-app.jar" del /f /q "%~dp0target\carbon-energy-platform-app.jar"
if exist "%~dp0target\carbon-energy-platform-app.jar.original" del /f /q "%~dp0target\carbon-energy-platform-app.jar.original"
call "%~dp0mvnw.cmd" -DskipTests package
if errorlevel 1 exit /b %errorlevel%
if exist "%PORTABLE_JAVA%" (
  set "JAVA_CMD=%PORTABLE_JAVA%"
) else (
  where java.exe >nul 2>nul
  if errorlevel 1 (
    echo [ERROR] Java 17 was not found. Install JDK 17 or restore tools\jdk17.
    exit /b 1
  )
)
"%JAVA_CMD%" -jar "%~dp0target\carbon-energy-platform-app.jar"
endlocal

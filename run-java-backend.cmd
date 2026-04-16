@echo off
setlocal
cd /d "%~dp0"
if exist "%~dp0target\classes" rmdir /s /q "%~dp0target\classes"
if exist "%~dp0target\carbon-energy-platform-app.jar" del /f /q "%~dp0target\carbon-energy-platform-app.jar"
if exist "%~dp0target\carbon-energy-platform-app.jar.original" del /f /q "%~dp0target\carbon-energy-platform-app.jar.original"
call "%~dp0mvnw.cmd" -DskipTests package
if errorlevel 1 exit /b %errorlevel%
"%~dp0tools\jdk17\jdk-17.0.18+8\bin\java.exe" -jar "%~dp0target\carbon-energy-platform-app.jar"
endlocal

@echo off
setlocal
set "BASE_DIR=%~dp0"
set "PORTABLE_JAVA_HOME=%BASE_DIR%tools\jdk17\jdk-17.0.18+8"
set "MAVEN_HOME=%BASE_DIR%tools\maven\apache-maven-3.9.9"
set "MAVEN_REPO=%BASE_DIR%tools\.m2\repository"

if exist "%PORTABLE_JAVA_HOME%\bin\java.exe" (
  set "JAVA_HOME=%PORTABLE_JAVA_HOME%"
  set "PATH=%JAVA_HOME%\bin;%PATH%"
) else (
  where java.exe >nul 2>nul
  if errorlevel 1 (
    echo [ERROR] Java 17 was not found. Install JDK 17 or restore tools\jdk17.
    exit /b 1
  )
)

if exist "%MAVEN_HOME%\bin\mvn.cmd" (
  set "PATH=%MAVEN_HOME%\bin;%PATH%"
  call "%MAVEN_HOME%\bin\mvn.cmd" -Dmaven.repo.local="%MAVEN_REPO%" %*
) else (
  where mvn.cmd >nul 2>nul
  if errorlevel 1 (
    where mvn >nul 2>nul
    if errorlevel 1 (
      echo [ERROR] Maven was not found. Install Maven 3.9+ or restore tools\maven.
      exit /b 1
    )
  )
  call mvn -Dmaven.repo.local="%MAVEN_REPO%" %*
)

set "EXIT_CODE=%ERRORLEVEL%"
endlocal & exit /b %EXIT_CODE%

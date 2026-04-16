@echo off
setlocal
set "BASE_DIR=%~dp0"
set "JAVA_HOME=%BASE_DIR%tools\jdk17\jdk-17.0.18+8"
set "MAVEN_HOME=%BASE_DIR%tools\maven\apache-maven-3.9.9"
set "MAVEN_REPO=%BASE_DIR%tools\.m2\repository"
set "PATH=%JAVA_HOME%\bin;%MAVEN_HOME%\bin;%PATH%"
call "%MAVEN_HOME%\bin\mvn.cmd" -Dmaven.repo.local="%MAVEN_REPO%" %*
endlocal

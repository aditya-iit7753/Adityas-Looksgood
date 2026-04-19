@echo off
setlocal

set "RUNTIME_ROOT=D:\Looksbook\expo-runtime"
set "SESSION_ID=%RANDOM%%RANDOM%"
set "TMP=%RUNTIME_ROOT%\tmp-%SESSION_ID%"
set "TEMP=%TMP%"
set "TMPDIR=%TMP%"
set "LOG_DIR=D:\Looksbook\logs"
set "ANDROID_HOME=C:\Users\user\OneDrive\Desktop\Looksbook\tools\platform-tools-fresh"
set "ANDROID_SDK_ROOT=C:\Users\user\OneDrive\Desktop\Looksbook\tools\platform-tools-fresh"
set "PATH=C:\Users\user\OneDrive\Desktop\Looksbook\tools\platform-tools-fresh\platform-tools;%PATH%"

if not exist "%RUNTIME_ROOT%" mkdir "%RUNTIME_ROOT%"
if not exist "%TMP%" mkdir "%TMP%"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

npx expo start --offline --port 8081 --clear > "%LOG_DIR%\expo_restart.out.log" 2> "%LOG_DIR%\expo_restart.err.log"

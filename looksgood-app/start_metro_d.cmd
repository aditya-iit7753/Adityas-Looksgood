@echo off
set "TMP=D:\Looksbook\tmp"
set "TEMP=D:\Looksbook\tmp"
set "ANDROID_HOME=C:\Users\user\OneDrive\Desktop\Looksbook\tools\platform-tools-fresh"
set "ANDROID_SDK_ROOT=C:\Users\user\OneDrive\Desktop\Looksbook\tools\platform-tools-fresh"
set "PATH=C:\Users\user\OneDrive\Desktop\Looksbook\tools\platform-tools-fresh\platform-tools;%PATH%"
npx expo start --offline --port 8081 --clear > expo_restart.out.log 2> expo_restart.err.log

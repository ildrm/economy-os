@echo off
setlocal EnableExtensions DisableDelayedExpansion
pushd "%~dp0" || exit /b 1

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is required. Install the version listed in .node-version, then run this file again.
  set "RUN_EXIT_CODE=1"
  goto finish
)

node "scripts\run-local.mjs" %*
set "RUN_EXIT_CODE=%ERRORLEVEL%"

:finish
popd
if not "%RUN_EXIT_CODE%"=="0" if not "%RUN_EXIT_CODE%"=="130" if not defined CI pause
exit /b %RUN_EXIT_CODE%

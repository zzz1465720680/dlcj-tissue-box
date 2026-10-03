@echo off
setlocal DisableDelayedExpansion
cd /d "%~dp0"
node scripts\local-pricing-preview.mjs
if errorlevel 1 pause

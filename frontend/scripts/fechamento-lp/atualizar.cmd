@echo off
chcp 65001 >nul
title Fechamento do Lucro Presumido - SOMA
cd /d "%~dp0...."
echo.
echo  ===============================================
echo   SOMA - Fechamento do Lucro Presumido
echo  ===============================================
echo.
echo   Antes: busque todas as notas no sistema.
echo   Feche a planilha no Excel antes de continuar.
echo.
pause
echo.
call npm run --silent fechamento:lp
if errorlevel 1 (
  echo.
  echo   Deu erro - veja a mensagem acima.
  goto fim
)
for %%A in ("%USERPROFILE%DocumentsClaudeCodeechamento-lpFechamento Lucro Presumido *.xlsx") do set ULTIMA=%%~fA
if defined ULTIMA start "" "%ULTIMA%"

:fim
echo.
pause

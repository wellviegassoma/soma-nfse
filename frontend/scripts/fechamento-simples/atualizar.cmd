@echo off
chcp 65001 >nul
title Fechamento do Simples Nacional - SOMA
cd /d "%~dp0..\.."
echo.
echo  ===============================================
echo   SOMA - Fechamento do Simples Nacional
echo  ===============================================
echo.
echo   Antes: importe a folha e busque todas as notas no sistema.
echo   Feche a planilha no Excel antes de continuar.
echo.
echo   [1] Atualizar a planilha (sem custo)
echo   [2] Buscar extratos do PGDAS-D de um mes (TEM CUSTO no Serpro) e atualizar
echo   [0] Sair
echo.
set /p OPCAO="  Escolha: "
if "%OPCAO%"=="1" goto atualizar
if "%OPCAO%"=="2" goto extratos
goto fim

:extratos
echo.
set /p COMP="  Competencia (AAAA-MM, ex.: 2026-10): "
if "%COMP%"=="" (
  echo   Competencia nao informada. Nada foi feito.
  goto fim
)
echo.
call npm run --silent fechamento:simples -- --buscar-extratos %COMP%
if errorlevel 1 goto fim
echo.
set /p CONF="  Confirma as consultas pagas acima? Digite SIM para continuar: "
if /i not "%CONF%"=="SIM" (
  echo   Cancelado. Nada foi consultado.
  goto fim
)
call npm run --silent fechamento:simples -- --buscar-extratos %COMP% --confirmar
goto abrir

:atualizar
echo.
call npm run --silent fechamento:simples

:abrir
if errorlevel 1 (
  echo.
  echo   Deu erro - veja a mensagem acima.
  goto fim
)
for %%A in ("%USERPROFILE%\Documents\ClaudeCode\fechamento-simples\Fechamento Simples *.xlsx") do set ULTIMA=%%~fA
if defined ULTIMA start "" "%ULTIMA%"

:fim
echo.
pause

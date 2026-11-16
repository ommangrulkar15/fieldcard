@echo off
setlocal
cd /d "%~dp0"
title Fieldcard launcher
echo.
echo ===== Fieldcard: one-click start =====
echo First run takes 5-10 minutes (it installs Python, Postgres and web packages).
echo Later runs take about 20 seconds.
echo.

rem ---- 0. find Anaconda / Miniconda -------------------------------------------
set "CONDA="
if exist "%USERPROFILE%\anaconda3\condabin\conda.bat"  set "CONDA=%USERPROFILE%\anaconda3\condabin\conda.bat"
if not defined CONDA if exist "%USERPROFILE%\miniconda3\condabin\conda.bat" set "CONDA=%USERPROFILE%\miniconda3\condabin\conda.bat"
if not defined CONDA (
  echo [x] Anaconda was not found. Install Miniconda, then run this again.
  goto :fail
)
where node >nul 2>nul
if errorlevel 1 (
  echo [x] Node.js was not found. Install Node 22 from nodejs.org, then run this again.
  goto :fail
)

rem ---- 1. private Python + Postgres environment (conda-forge only) ------------
set "ENVDIR=%USERPROFILE%\anaconda3\envs\fieldcard"
if exist "%USERPROFILE%\miniconda3\condabin\conda.bat" if not exist "%USERPROFILE%\anaconda3\condabin\conda.bat" set "ENVDIR=%USERPROFILE%\miniconda3\envs\fieldcard"
if not exist "%ENVDIR%\python.exe" (
  echo [1/6] Creating the fieldcard environment ^(Python 3.13 + PostgreSQL^)...
  call "%CONDA%" create -y -n fieldcard --override-channels -c conda-forge python=3.13 postgresql
  if errorlevel 1 goto :fail
) else (
  echo [1/6] Environment already there.
)
call "%CONDA%" activate fieldcard
if errorlevel 1 goto :fail

rem ---- 2. database: hosted (hosted-db.txt) or local Postgres -------------------
set "HOSTED="
if exist "%~dp0hosted-db.txt" set "HOSTED=1"
if defined HOSTED (
  echo [2/6] Using the hosted database from hosted-db.txt
  goto :api
)
set "PGDATA=%~dp0.pgdata"
if not exist "%PGDATA%\PG_VERSION" (
  echo [2/6] Creating the local database folder...
  initdb -D "%PGDATA%" -U postgres --auth=trust --encoding=UTF8 >nul
  if errorlevel 1 goto :dberr
)
pg_ctl -D "%PGDATA%" status >nul 2>nul
if errorlevel 1 (
  echo [2/6] Starting Postgres...
  pg_ctl -D "%PGDATA%" -l "%PGDATA%\log.txt" -o "-p 5432" -w start
  if errorlevel 1 goto :dberr
) else (
  echo [2/6] Postgres already running.
)
createdb -U postgres fieldcard >nul 2>nul

:api
rem ---- 3. API ------------------------------------------------------------------
cd /d "%~dp0api"
if not exist ".deps-installed" (
  echo [3/6] Installing API packages...
  python -m pip install -r requirements.txt
  if errorlevel 1 goto :fail
  echo ok> .deps-installed
)
if defined HOSTED (
  python -c "import pathlib;u=pathlib.Path('..\\hosted-db.txt').read_text().strip().replace('postgresql://','postgresql+psycopg://',1).replace('postgres://','postgresql+psycopg://',1);pathlib.Path('.env').write_text('DATABASE_URL='+u+'\nCORS_ORIGINS=http://localhost:5173\nDEMO_ENABLED=true\n')"
) else if not exist ".env" (
  copy "..\.env.example" ".env" >nul
  echo DEMO_ENABLED=true>> ".env"
)
echo [4/6] Preparing tables and demo data...
alembic upgrade head
if errorlevel 1 goto :fail
python -m app.seed
if errorlevel 1 goto :fail
start "Fieldcard API (close to stop)" cmd /k "call "%CONDA%" activate fieldcard && cd /d "%~dp0api" && uvicorn app.main:app"

rem ---- 5. web ------------------------------------------------------------------
cd /d "%~dp0web"
if not exist "node_modules" (
  echo [5/6] Installing web packages...
  call npm ci
  if errorlevel 1 goto :fail
)
start "Fieldcard Web (close to stop)" cmd /k "cd /d "%~dp0web" && npm run dev"

echo [6/6] Opening the app...
timeout /t 8 >nul
start "" http://localhost:5173
echo.
echo Fieldcard is running at http://localhost:5173
echo Use "Continue as Admin" on the sign-in page.
echo To stop everything: close the two black windows, then run stop-fieldcard.bat
echo.
pause
exit /b 0

:dberr
echo.
echo The local database could not start on this PC ^(a company policy may block it^).
echo Fix: make a free hosted Postgres at neon.com, paste its connection string
echo into a new file called hosted-db.txt in this folder, then run this again.
pause
exit /b 1

:fail
echo.
echo Something went wrong. Copy the last red or error lines above and send them to Claude.
pause
exit /b 1

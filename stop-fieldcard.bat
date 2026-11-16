@echo off
setlocal
cd /d "%~dp0"
set "CONDA="
if exist "%USERPROFILE%\anaconda3\condabin\conda.bat"  set "CONDA=%USERPROFILE%\anaconda3\condabin\conda.bat"
if not defined CONDA if exist "%USERPROFILE%\miniconda3\condabin\conda.bat" set "CONDA=%USERPROFILE%\miniconda3\condabin\conda.bat"
call "%CONDA%" activate fieldcard
pg_ctl -D "%~dp0.pgdata" -m fast stop
echo Database stopped. Close the Fieldcard API and Web windows if they are still open.
pause

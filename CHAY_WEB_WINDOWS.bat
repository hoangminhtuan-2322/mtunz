@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
    py -3 -m venv .venv
    if errorlevel 1 (
       echo Khong tim thay Python. Cai Python 3.10+ va bat Add to PATH.
       pause
       exit /b 1
    )
)
".venv\Scripts\python.exe" -m pip install -r requirements.txt
if errorlevel 1 (
    echo Co loi khi cai cac thu vien Python.
    pause
    exit /b 1
)
echo.
echo ===========================================
echo mtunz: http://127.0.0.1:8000
echo Admin ban dau: admin / mtunz7
 echo CHI DUNG MAT KHAU MAC DINH DE THU NGHIEM!
echo ===========================================
echo.
start "" "http://127.0.0.1:8000"
".venv\Scripts\python.exe" -m uvicorn app:app --host 127.0.0.1 --port 8000
pause

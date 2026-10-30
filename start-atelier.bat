@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo No se encontro Node.js. Instala Node.js 18 o superior desde https://nodejs.org/
  pause
  exit /b 1
)
if not exist .env (
  copy .env.example .env >nul
  echo Se creo .env desde .env.example. Abre .env con Bloc de notas y pega tus claves API.
  echo Puedes dejar una clave vacia y usar Ollama si lo tienes instalado.
  notepad .env
)
node server.js
pause

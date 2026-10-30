VESTARA 3.1 — MOTOR MULTIPROVEEDOR DE IA
========================================

IMPORTANTE
- Esta actualización parte de VESTARA 3.0.
- Conserva tu archivo .env actual. NO lo reemplaces por .env.example.
- El motor intenta proveedores visuales en este orden: Groq, OpenRouter, Gemini y Ollama local.
- Los proveedores cloud gratuitos tienen cuotas y disponibilidad variables. Ningún proveedor gratuito garantiza uso ilimitado.

NUEVAS VARIABLES OPCIONALES PARA .env
--------------------------------------
GROQ_API_KEY=
GROQ_VISION_MODEL=meta-llama/llama-4-scout-17b-16e-instruct
OPENROUTER_VISION_MODELS=nvidia/nemotron-nano-12b-v2-vl:free,google/gemma-4-26b-a4b-it:free,openrouter/free
OLLAMA_VISION_MODEL=qwen3-vl:4b

CONFIGURAR GROQ (NUBE, CUOTA GRATUITA SUJETA A LIMITES)
1. Crear una clave en https://console.groq.com/keys
2. Añadir GROQ_API_KEY=tu_clave a tu .env
3. Reiniciar node server.js

CONFIGURAR OLLAMA (LOCAL, SIN COSTE POR LLAMADA)
1. Instalar Ollama desde https://ollama.com/
2. En PowerShell ejecutar: ollama pull qwen3-vl:4b
3. Mantener Ollama ejecutándose.
4. Añadir OLLAMA_VISION_MODEL=qwen3-vl:4b a .env
5. Reiniciar el servidor.
La velocidad depende del hardware disponible.

INSTALACION
1. Detener el servidor con Ctrl+C.
2. Hacer copia de seguridad de la carpeta actual.
3. Extraer el ZIP.
4. Copiar el contenido de la carpeta atelier-2.0 del ZIP sobre la carpeta actual.
5. Conservar el .env existente (no sobrescribirlo).
6. Ejecutar node server.js desde la carpeta del proyecto.
7. Abrir http://127.0.0.1:8001/api/status

VALIDACION
El estado de proveedores solo indica configuración/conectividad básica; no garantiza que una llamada de visión vaya a tener cuota o éxito. La prueba definitiva es analizar una fotografía real desde Guardarropa > Añadir prenda.

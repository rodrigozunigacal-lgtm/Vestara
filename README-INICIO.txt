ATELIER 2.0 — INSTALACIÓN EN WINDOWS
====================================

QUÉ INCLUYE
- atelier.html: la aplicación existente, conservada y conectada al backend.
- server.js: backend Node.js sin paquetes externos.
- .env.example: plantilla de configuración de claves/modelos.
- start-atelier.bat: inicio sencillo.

REQUISITOS
- Node.js 18 o superior (https://nodejs.org/).
- Para usar Ollama como respaldo local: Ollama y el modelo qwen3.5:4b instalados.
- Para IA en la nube: al menos una clave API válida.

INSTALACIÓN
1. Extrae la carpeta Atelier 2.0 a una ubicación normal, por ejemplo C:\Atelier-2.0.
2. Instala Node.js 18+ si no lo tienes. Cierra y vuelve a abrir la sesión de Windows si hace falta.
3. Ejecuta start-atelier.bat.
4. La primera vez se crea .env y se abre en Bloc de notas.
5. Pega tu clave de Gemini en GEMINI_API_KEY=... y/o tu clave de OpenRouter en OPENROUTER_API_KEY=...
   No pongas comillas. Guarda y cierra Bloc de notas.
6. Si el archivo .env se abre después de arrancar el servidor, cierra esa ventana del servidor con Ctrl+C y vuelve a ejecutar start-atelier.bat.
7. Abre http://127.0.0.1:8001/atelier.html
8. En Ajustes elige “Automático (Gemini → OpenRouter → Ollama)” y guarda.
9. En Ajustes pulsa “Comprobar backend”. También puedes abrir http://127.0.0.1:8001/api/status.

SEGURIDAD
- Las claves viven en .env y solo las lee server.js. No se guardan en localStorage ni se envían al navegador.
- No compartas .env, capturas con claves ni lo subas a repositorios públicos.
- Este paquete escucha solo en 127.0.0.1:8000 por defecto, no queda expuesto a Internet.
- Para que Atelier funcione cuando tu PC esté apagado, el backend debe desplegarse en un servidor remoto privado y las claves deben configurarse como variables de entorno allí. Este paquete local por sí solo NO mantiene la app activa con el PC apagado.

FALLBACK
El orden automático es Gemini → OpenRouter → Ollama. Si un proveedor no tiene clave, se omite; si falla, se prueba el siguiente. Ollama requiere que el servicio local esté ejecutándose.

NOTAS
- Los niveles gratuitos, límites y nombres de modelos cambian. Si OpenRouter rechaza el modelo por no estar disponible, actualiza OPENROUTER_MODEL en .env según los modelos gratuitos que muestre tu cuenta y reinicia el servidor.
- No se probó con claves reales. El backend y el JavaScript se validan por sintaxis; la prueba real de proveedor requiere una clave válida y conexión a Internet.

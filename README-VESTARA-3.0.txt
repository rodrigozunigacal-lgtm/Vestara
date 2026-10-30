VESTARA 3.0 — GARMENT INTELLIGENCE + OUTFIT ENGINE

INSTALACIÓN EN WINDOWS
1. Cierra el servidor actual con Ctrl+C en PowerShell.
2. Haz una copia de seguridad de tu carpeta actual atelier-2.0.
3. Extrae el contenido de este ZIP.
4. Copia el contenido de la carpeta atelier-2.0 extraída dentro de tu carpeta actual atelier-2.0 y acepta reemplazar los archivos.
5. NO reemplaces, borres ni compartas tu archivo .env. El ZIP no incluye .env.
6. Inicia con: node server.js
7. Abre: http://127.0.0.1:8001

NUEVO
- Análisis visual de una prenda desde su fotografía, mediante Gemini u OpenRouter con capacidad de visión.
- El análisis propone categoría, color, material probable, patrón, silueta, formalidad, temporadas y ocasiones.
- Los atributos se muestran para revisión antes de guardar. No se afirma que la imagen certifique composición textil, talla o ajuste corporal.
- Fichas locales enriquecidas con material, silueta, formalidad, temporada, origen de atributos y metadatos de confianza.
- El motor de outfits sigue calculando sus puntuaciones en el navegador, no en el modelo generativo.
- Las propuestas generadas por IA se vuelven a puntuar localmente.
- Selección de hasta tres outfits con penalización por similitud para evitar resultados casi idénticos.
- Corrección del tratamiento de formalidad vacía/null: ya no se interpreta como nivel 0.
- Se conserva el inventario local en localStorage y se mantienen compatibles las prendas antiguas.

ANÁLISIS VISUAL Y PROVEEDORES
- El análisis visual prueba el proveedor preferido (Gemini u OpenRouter) y puede recurrir al otro.
- Ollama no se utiliza para visión en esta versión porque no todos los modelos locales aceptan imágenes; no se presupone que qwen3.5:4b tenga capacidad visual.
- Si el modelo configurado en OpenRouter no acepta imágenes, el backend informará del error y probará Gemini.
- El identificador del modelo configurado en .env debe existir y el proveedor debe habilitar visión. El estado /api/status solo comprueba configuración/servidor local, no valida el éxito de una inferencia.

PRIVACIDAD Y LÍMITES
- La foto se envía al proveedor de IA seleccionado para realizar el análisis; no se envía automáticamente al chat en cada turno.
- Las claves API permanecen en el servidor.
- Los resultados de visión son sugerencias, no hechos certificados. Confirma los atributos antes de guardar.
- Los datos del guardarropa siguen almacenándose en el navegador local, no en una base de datos multiusuario.
- La puntuación es heurística y no una medición científica de atractivo o ajuste.

ARCHIVOS DE ESQUEMA
- garment.schema.json: ficha de prenda.
- outfit-evaluation.schema.json: ficha de evaluación de outfit.

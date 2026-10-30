# VESTARA — Motor de compatibilidad de outfits (v1)

## Qué hace esta versión

- Genera combinaciones localmente a partir del inventario real; no necesita Gemini, OpenRouter ni Ollama.
- Calcula cinco puntuaciones mediante reglas deterministas y ponderaciones explícitas.
- Usa la misma función de evaluación para outfits propuestos por IA: el modelo puede sugerir IDs y explicar, pero **no decide la puntuación**.
- Descarta outfits con puntuación inferior a 70 y muestra hasta tres de los mejor puntuados.
- Muestra el desglose y la confianza de los datos disponibles.

## Ponderaciones

| Criterio | Peso |
|---|---:|
| Armonía cromática | 25% |
| Compatibilidad de siluetas | 25% |
| Coherencia de formalidad | 20% |
| Compatibilidad estacional | 20% |
| Versatilidad y utilidad | 10% |

`final = round(color*0.25 + silhouette*0.25 + formality*0.20 + season*0.20 + versatility*0.10)`

El resultado es una **heurística de producto**, no una medición científica ni una evaluación visual de la fotografía.

## Evidencia y límites actuales

El inventario actual guarda nombre, categoría, color y ocasión. La silueta, tejido, estación y formalidad no están completos. En consecuencia:

- Los colores se puntúan usando familias cromáticas amplias; no se analiza el color real de los píxeles de la fotografía.
- La silueta sin atributo explícito recibe un valor neutral provisional.
- La formalidad se estima por nombre y ocasión; si no se puede inferir, queda neutral.
- La estación queda provisional cuando no se ha registrado en las prendas.
- `confidence` disminuye cuando faltan atributos y `missing` enumera los datos pendientes.

No se debe presentar `confidence` como precisión estadística. Es un indicador de completitud de los atributos disponibles.

## Reglas iniciales

- Paleta: neutro + cualquier familia cromática recibe una compatibilidad alta; combinaciones dentro de una misma familia reciben compatibilidad buena; contrastes tierra/frío y cálido/frío reciben una estimación más conservadora.
- Silueta: si hay atributos registrados, la combinación se evalúa por diversidad/consistencia; si faltan, se usa 70 provisional.
- Formalidad: se compara el rango entre formalidades inferidas/registradas y el nivel esperado por la ocasión seleccionada.
- Estación: se calcula intersección de temporadas declaradas. Si faltan datos, se usa un valor provisional y se indica.
- Versatilidad: considera diversidad de categorías, ocasiones registradas y prendas favoritas. Es una aproximación; no equivale a datos de uso real.

## Modelo de datos recomendado (siguiente iteración)

Cada prenda debe admitir estos campos opcionales, sin invalidar el inventario antiguo:

```json
{
  "id": "garment_001",
  "name": "Pantalón chino beige",
  "cat": "pantalon",
  "color": "beige",
  "colorHex": null,
  "colorVerified": false,
  "silhouette": "straight",
  "formality": 2,
  "season": ["spring", "summer", "autumn"],
  "fabric": "cotton",
  "weight": "medium",
  "occasion": ["casual", "trabajo"],
  "wearCount": 0,
  "favorite": false
}
```

Cada evaluación debe persistir la versión del motor, criterios, pesos, datos faltantes y puntuación calculada:

```json
{
  "engineVersion": "1.0.0",
  "scoreType": "heuristic",
  "scores": {
    "color": 88,
    "silhouette": 70,
    "formality": 82,
    "season": 65,
    "versatility": 75
  },
  "weights": {
    "color": 0.25,
    "silhouette": 0.25,
    "formality": 0.20,
    "season": 0.20,
    "versatility": 0.10
  },
  "final": 77,
  "confidence": 64,
  "missing": ["silueta no registrada", "temporada no registrada"]
}
```

Los números anteriores son solo un ejemplo de estructura, no datos de una prenda real.

## Próximas mejoras antes de llamarlo un estilista avanzado

1. Añadir campos editables de silueta, formalidad, tejido y temporada en el formulario de prenda.
2. Definir tablas de compatibilidad de siluetas según categoría y proporciones, con reglas explicables.
3. Incorporar clima real como contexto, sin confundir estación meteorológica con temporada de moda.
4. Medir versatilidad por número de combinaciones válidas distintas por prenda, no solo por una bonificación genérica.
5. Crear pruebas con outfits etiquetados por estilistas y calibrar los pesos con evaluación humana.
6. Separar "posible", "coherente" y "recomendable para esta ocasión/clima".

## Lo que esta versión no afirma

- No ha auditado los 32 outfits históricos: esa lista completa no estaba disponible en el proyecto.
- No verifica ajuste corporal, caída de tela, calidad, tendencias ni armonía visual de las fotos.
- No debe afirmar que un outfit es objetivamente elegante o que una prenda es la más versátil sin datos suficientes.

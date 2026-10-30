
'use strict';
// Atelier 2.0 — local-first API gateway.
// Node.js 18+; no third-party packages required.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const ROOT = __dirname;
loadEnv(path.join(ROOT, '.env'));

const PORT = Number(process.env.PORT || 8001);
const HOST = process.env.HOST || '127.0.0.1';

const OLLAMA_URL = (process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'openrouter/free';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen3.5:4b';

const OMNIROUTE_URL = (process.env.OMNIROUTE_URL || 'http://127.0.0.1:20128/v1').replace(/\/$/, '');
const OMNIROUTE_MODEL = process.env.OMNIROUTE_MODEL || 'nvidia/nemotron-3.5-super-vl-120b-a12b';

const OLLAMA_VISION_MODEL = process.env.OLLAMA_VISION_MODEL || 'qwen3-vl:4b';
const GROQ_VISION_MODEL = process.env.GROQ_VISION_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct';

const MAX_BODY = 8_000_000;
const recent = new Map();

function loadEnv(file) {
  if (!fs.existsSync(file)) return;

  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);

    if (m && !(m[1] in process.env)) {
      process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
}

function send(res, status, data, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers
  });

  res.end(JSON.stringify(data));
}

function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');

  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self' https: data: blob:; connect-src 'self' http://127.0.0.1:11434 http://localhost:11434; img-src 'self' https: data: blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; script-src 'self' 'unsafe-inline';"
  );
}

function rateLimited(req) {
  const ip = req.socket.remoteAddress || 'local';
  const now = Date.now();

  const arr = (recent.get(ip) || []).filter(t => now - t < 60_000);

  arr.push(now);
  recent.set(ip, arr);

  return arr.length > 30;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';

    req.on('data', chunk => {
      body += chunk;

      if (body.length > MAX_BODY) {
        reject(new Error('Solicitud demasiado grande'));
        req.destroy();
      }
    });

    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch {
        reject(new Error('JSON inválido'));
      }
    });

    req.on('error', reject);
  });
}

async function fetchJson(url, options = {}, timeoutMs = 45000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const r = await fetch(url, {
      ...options,
      signal: controller.signal
    });

    const raw = await r.text();

    let d;
    try {
      d = JSON.parse(raw);
    } catch {
      d = { raw: raw.slice(0, 500) };
    }

    if (!r.ok) {
      throw new Error(
        d?.error?.message ||
        d?.error ||
        d?.message ||
        `HTTP ${r.status}`
      );
    }

    return d;

  } catch (e) {
    if (e.name === 'AbortError') {
      throw new Error('Tiempo de espera agotado');
    }

    throw e;

  } finally {
    clearTimeout(timer);
  }
}

// =====================================================
// GEMINI
// =====================================================

async function callGemini(messages, jsonMode = false) {
  const key = process.env.GEMINI_API_KEY;

  if (!key) {
    throw new Error('GEMINI_API_KEY no configurada');
  }

  const contents = messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: String(m.content || '') }]
    }));

  const system =
    messages.find(m => m.role === 'system')?.content ||
    'Eres Atelier, un estilista personal útil y honesto.';

  const body = {
    systemInstruction: {
      parts: [{ text: String(system) }]
    },
    contents,
    generationConfig: {
      temperature: 0.65,
      maxOutputTokens: 1800
    }
  };

  if (jsonMode) {
    body.generationConfig.responseMimeType = 'application/json';
  }

  const d = await fetchJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    },
    45000
  );

  const text = (d.candidates?.[0]?.content?.parts || [])
    .map(p => p.text || '')
    .join('')
    .trim();

  if (!text) {
    throw new Error('Gemini devolvió una respuesta vacía');
  }

  return text;
}

// =====================================================
// OPENROUTER
// =====================================================

async function callOpenRouter(messages, jsonMode = false) {
  const key = process.env.OPENROUTER_API_KEY;

  if (!key) {
    throw new Error('OPENROUTER_API_KEY no configurada');
  }

  const body = {
    model: OPENROUTER_MODEL,
    messages: messages.map(m => ({
      role: m.role,
      content: String(m.content || '')
    })),
    temperature: 0.65,
    max_tokens: 1800
  };

  if (jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  const d = await fetchJson(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
        'HTTP-Referer': process.env.APP_URL || `http://127.0.0.1:${PORT}`,
        'X-Title': 'Atelier 2.0'
      },
      body: JSON.stringify(body)
    },
    45000
  );

  const text = d.choices?.[0]?.message?.content;

  if (!text) {
    throw new Error('OpenRouter devolvió una respuesta vacía');
  }

  return { text: typeof text === 'string' ? text : JSON.stringify(text), model: d.model || OPENROUTER_MODEL };
}

// =====================================================
// OLLAMA
// =====================================================

async function callOllama(messages, jsonMode = false) {
  const body = {
    model: OLLAMA_MODEL,
    messages,
    stream: false,
    options: {
      temperature: 0.65,
      num_ctx: 4096,
      num_predict: 600
    }
  };

  if (jsonMode) {
    body.format = 'json';
  }

  const d = await fetchJson(
    `${OLLAMA_URL}/api/chat`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    },
    45000
  );

  const text = d.message?.content?.trim();

  if (!text) {
    throw new Error('Ollama devolvió una respuesta vacía');
  }

  return text;
}

// =====================================================
// OMNIROUTE — NVIDIA NEMOTRON Y OTROS MODELOS
// =====================================================

async function callOmniRoute(messages, jsonMode = false) {
  const key = process.env.OMNIROUTE_API_KEY;

  if (!key) {
    throw new Error('OMNIROUTE_API_KEY no configurada');
  }

  const body = {
    model: OMNIROUTE_MODEL,
    messages: messages.map(m => ({
      role: m.role,
      content: String(m.content || '')
    })),
    temperature: 0.65,
    max_tokens: 1800
  };

  if (jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  const d = await fetchJson(
    `${OMNIROUTE_URL}/chat/completions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`
      },
      body: JSON.stringify(body)
    },
    60000
  );

  const text = d.choices?.[0]?.message?.content;

  if (!text) {
    throw new Error('OmniRoute devolvió una respuesta vacía');
  }

  return { text: typeof text === 'string' ? text : JSON.stringify(text), model: d.model || OPENROUTER_MODEL };
}

// =====================================================
// ANÁLISIS VISUAL — GEMINI
// =====================================================

async function analyzeWithGemini(imageData, mimeType) {
  const key = process.env.GEMINI_API_KEY;

  if (!key) {
    throw new Error('GEMINI_API_KEY no configurada');
  }

  const base64 = String(imageData).replace(/^data:[^;]+;base64,/, '');

  const prompt = `Analiza esta única prenda de vestir para catalogarla en un guardarropa. Devuelve SOLO JSON válido con estas claves: name (nombre corto en español), category (uno de: camisa, pantalon, zapatos, chaqueta, accesorio, bolera, otro), color (uno de: negro, blanco, crema, beige, gris, azul, marino, verde, oliva, marron, camel, rojo, burdeo, rosa, amarillo, naranja, morado, metalico, neutro), material (material probable o null; nunca asegures composición exacta solo por imagen), pattern (liso, rayas, cuadros, estampado, textura, desconocido), silhouette (recta, slim, relaxed, oversize, estructurada, desconocida), formality (entero 1 a 5 o null), seasons (array de spring, summer, autumn, winter), occasions (array de casual, trabajo, noche, sport, formal), attributes (array de detalles visibles), uncertain (array de atributos que no pueden confirmarse), confidence (objeto con category,color,material,pattern,silhouette, cada uno 0 a 1). No infieras marca, talla, composición exacta ni ajuste sobre el cuerpo. Si no se puede saber, usa null/desconocido y explica en uncertain.`;

  const d = await fetchJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: mimeType || 'image/jpeg',
                data: base64
              }
            }
          ]
        }],
        generationConfig: {
          temperature: 0.15,
          maxOutputTokens: 1200,
          responseMimeType: 'application/json'
        }
      })
    },
    60000
  );

  const text = (d.candidates?.[0]?.content?.parts || [])
    .map(x => x.text || '')
    .join('')
    .trim();

  if (!text) {
    throw new Error('Gemini visión devolvió una respuesta vacía');
  }

  return cleanJson(text);
}

// =====================================================
// ANÁLISIS VISUAL — OPENROUTER
// =====================================================

async function analyzeWithOpenRouter(imageData, mimeType) {
  const key = process.env.OPENROUTER_API_KEY;

  if (!key) {
    throw new Error('OPENROUTER_API_KEY no configurada');
  }

  const prompt = `Analiza esta única prenda para catalogarla. Responde SOLO JSON con claves: name, category (camisa|pantalon|zapatos|chaqueta|accesorio|bolera|otro), color (negro|blanco|crema|beige|gris|azul|marino|verde|oliva|marron|camel|rojo|burdeo|rosa|amarillo|naranja|morado|metalico|neutro), material (probable o null; no afirmes composición exacta), pattern (liso|rayas|cuadros|estampado|textura|desconocido), silhouette (recta|slim|relaxed|oversize|estructurada|desconocida), formality (1-5 o null), seasons (spring|summer|autumn|winter), occasions (casual|trabajo|noche|sport|formal), attributes, uncertain, confidence (category,color,material,pattern,silhouette de 0 a 1). No inventes marca, talla ni composición exacta.`;

  const dataUrl = String(imageData).startsWith('data:')
    ? imageData
    : `data:${mimeType || 'image/jpeg'};base64,${imageData}`;

  const d = await fetchJson(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
        'HTTP-Referer': process.env.APP_URL || `http://127.0.0.1:${PORT}`,
        'X-Title': 'VESTARA Garment Intelligence'
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: dataUrl } }
          ]
        }],
        temperature: 0.1,
        max_tokens: 1200,
        response_format: { type: 'json_object' }
      })
    },
    60000
  );

  const content = d.choices?.[0]?.message?.content;

  const text = typeof content === 'string'
    ? content
    : (Array.isArray(content) ? content.map(x => x.text || '').join('') : '');

  if (!text.trim()) {
    throw new Error('OpenRouter visión devolvió una respuesta vacía');
  }

  return cleanJson(text);
}

// =====================================================
// ANÁLISIS VISUAL — GROQ
// =====================================================

async function analyzeWithGroq(imageData, mimeType) {
  const key = process.env.GROQ_API_KEY;

  if (!key) {
    throw new Error('GROQ_API_KEY no configurada');
  }

  const prompt = `Analiza esta prenda y responde SOLO JSON válido: {"name":"nombre corto","category":"camisa|pantalon|zapatos|chaqueta|accesorio|otro","color":"color principal en español","material":"material probable o null","pattern":"liso|rayas|cuadros|estampado|textura|desconocido","silhouette":"recta|slim|relaxed|oversize|estructurada|desconocida","formality":1,"seasons":["spring","summer","autumn","winter"],"occasions":["casual","trabajo","noche","sport","formal"],"attributes":[],"uncertain":[],"confidence":{"category":0.0,"color":0.0,"material":0.0,"pattern":0.0,"silhouette":0.0}}. No inventes marca, talla ni composición exacta. Material solo como hipótesis visual.`;

  const dataUrl = String(imageData).startsWith('data:')
    ? imageData
    : `data:${mimeType || 'image/jpeg'};base64,${imageData}`;

  const d = await fetchJson(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`
      },
      body: JSON.stringify({
        model: GROQ_VISION_MODEL,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: dataUrl } }
          ]
        }],
        temperature: 0.1,
        max_tokens: 1200
      })
    },
    60000
  );

  const content = d.choices?.[0]?.message?.content;

  const text = typeof content === 'string'
    ? content
    : (Array.isArray(content) ? content.map(x => x.text || '').join('') : '');

  if (!text.trim()) {
    throw new Error('Groq devolvió una respuesta vacía');
  }

  return cleanJson(text);
}

// =====================================================
// ANÁLISIS VISUAL — OLLAMA
// =====================================================

async function analyzeWithOllama(imageData, mimeType) {
  const base64 = String(imageData).replace(/^data:[^;]+;base64,/, '');

  const prompt = `Analiza esta prenda y responde SOLO JSON válido: {"name":"nombre corto","category":"camisa|pantalon|zapatos|chaqueta|accesorio|otro","color":"color principal en español","material":"material probable o null","pattern":"liso|rayas|cuadros|estampado|textura|desconocido","silhouette":"recta|slim|relaxed|oversize|estructurada|desconocida","formality":1,"seasons":["spring","summer","autumn","winter"],"occasions":["casual","trabajo","noche","sport","formal"],"attributes":[],"uncertain":[],"confidence":{"category":0.0,"color":0.0,"material":0.0,"pattern":0.0,"silhouette":0.0}}. No inventes marca, talla ni composición exacta.`;

  const d = await fetchJson(
    `${OLLAMA_URL}/api/chat`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_VISION_MODEL,
        messages: [{
          role: 'user',
          content: prompt,
          images: [base64]
        }],
        stream: false,
        format: 'json',
        options: {
          temperature: 0.1,
          num_ctx: 4096
        }
      })
    },
    120000
  );

  const text = d.message?.content?.trim();

  if (!text) {
    throw new Error('Ollama visión devolvió una respuesta vacía');
  }

  return cleanJson(text);
}

// =====================================================
// ANÁLISIS VISUAL — MODELOS GRATUITOS OPENROUTER
// =====================================================

async function analyzeWithFreeOpenRouter(imageData, mimeType) {
  const key = process.env.OPENROUTER_API_KEY;

  if (!key) {
    throw new Error('OPENROUTER_API_KEY no configurada');
  }

  const models = (
    process.env.OPENROUTER_VISION_MODELS ||
    'nvidia/nemotron-nano-12b-v2-vl:free,google/gemma-4-26b-a4b-it:free,openrouter/free'
  )
    .split(',')
    .map(x => x.trim())
    .filter(Boolean);

  const errors = [];

  for (const model of models) {
    try {
      const dataUrl = String(imageData).startsWith('data:')
        ? imageData
        : `data:${mimeType || 'image/jpeg'};base64,${imageData}`;

      const prompt = `Analiza la prenda. Devuelve SOLO JSON válido con claves name, category, color, material (probable o null), pattern, silhouette, formality (1-5 o null), seasons (array), occasions (array), attributes (array), uncertain (array), confidence (objeto con category,color,material,pattern,silhouette entre 0 y 1). No inventes marca, talla ni composición textil exacta.`;

      const d = await fetchJson(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${key}`,
            'HTTP-Referer': process.env.APP_URL || `http://127.0.0.1:${PORT}`,
            'X-Title': 'VESTARA'
          },
          body: JSON.stringify({
            model,
            messages: [{
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: dataUrl } }
              ]
            }],
            temperature: 0.1,
            max_tokens: 1200
          })
        },
        60000
      );

      const c = d.choices?.[0]?.message?.content;

      const t = typeof c === 'string'
        ? c
        : (Array.isArray(c) ? c.map(x => x.text || '').join('') : '');

      if (!t.trim()) {
        throw new Error('Respuesta vacía');
      }

      return {
        data: cleanJson(t),
        model
      };

    } catch (e) {
      errors.push(`${model}: ${String(e.message || e).slice(0, 130)}`);
    }
  }

  throw new Error(errors.join(' | '));
}

// =====================================================
// PROVEEDORES DE CONVERSACIÓN Y FALLBACK
// =====================================================

function providers(preferred) {
  const all = {
    omniroute: callOmniRoute,
    gemini: callGemini,
    openrouter: callOpenRouter,
    ollama: callOllama
  };

  const available = {
    omniroute: !!process.env.OMNIROUTE_API_KEY,
    gemini: !!process.env.GEMINI_API_KEY,
    openrouter: !!process.env.OPENROUTER_API_KEY,
    ollama: process.env.ENABLE_OLLAMA !== 'false'
  };

  const order = preferred === 'auto' || !all[preferred]
    ? ['omniroute', 'gemini', 'openrouter', 'ollama']
    : [
        preferred,
        ...['omniroute', 'gemini', 'openrouter', 'ollama']
          .filter(x => x !== preferred)
      ];

  return order
    .filter(p => available[p])
    .map(p => ({
      name: p,
      run: all[p]
    }));
}

async function withFallback(messages, preferred = 'auto', jsonMode = false) {
  const candidates = providers(preferred);
  const errors = [];

  if (!candidates.length) {
    throw new Error(
      'No hay proveedores configurados. Añade OMNIROUTE_API_KEY, GEMINI_API_KEY o OPENROUTER_API_KEY en .env, o habilita Ollama.'
    );
  }

  for (const p of candidates) {
    try {
      const result = await p.run(messages, jsonMode);
      const normalized = result && typeof result === 'object' && Object.prototype.hasOwnProperty.call(result, 'text')
        ? result
        : { text: result, model: null };

      return {
        text: normalized.text,
        provider: p.name,
        model: normalized.model || null,
        fallbacks: errors
      };

    } catch (e) {
      errors.push({
        provider: p.name,
        error: String(e.message || e).slice(0, 220)
      });
    }
  }

  throw new Error(
    'Todos los proveedores fallaron: ' +
    errors.map(e => `${e.provider}: ${e.error}`).join(' | ')
  );
}

function cleanJson(text) {
  const s = String(text)
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  return JSON.parse(s);
}

// =====================================================
// API PRINCIPAL
// =====================================================

async function api(req, res, url) {
  if (rateLimited(req)) {
    return send(res, 429, {
      error: 'Demasiadas solicitudes. Espera un minuto.'
    });
  }

  // Estado de proveedores
  if (req.method === 'GET' && url.pathname === '/api/status') {
    let ollama = false;

    try {
      await fetchJson(`${OLLAMA_URL}/api/tags`, {}, 1600);
      ollama = true;
    } catch {}

    return send(res, 200, {
      ok: true,

      providers: {
        omniroute: !!process.env.OMNIROUTE_API_KEY,
        gemini: !!process.env.GEMINI_API_KEY,
        openrouter: !!process.env.OPENROUTER_API_KEY,
        groq: !!process.env.GROQ_API_KEY,
        ollama
      },

      models: {
        omniroute: OMNIROUTE_MODEL,
        gemini: GEMINI_MODEL,
        openrouter: OPENROUTER_MODEL,
        groq: GROQ_VISION_MODEL,
        ollama: OLLAMA_MODEL,
        ollamaVision: OLLAMA_VISION_MODEL
      },

      defaultOrder: [
        'omniroute',
        'groq',
        'openrouter',
        'gemini',
        'ollama'
      ],

      keysStoredOnServer: !!(
        process.env.OMNIROUTE_API_KEY ||
        process.env.GEMINI_API_KEY ||
        process.env.OPENROUTER_API_KEY
      )
    });
  }

  if (req.method !== 'POST') {
    return send(res, 405, {
      error: 'Método no permitido'
    });
  }

  let body;

  try {
    body = await readBody(req);
  } catch (e) {
    return send(res, 400, {
      error: e.message
    });
  }

  const preferred = [
    'auto',
    'omniroute',
    'gemini',
    'openrouter',
    'ollama'
  ].includes(body.provider)
    ? body.provider
    : 'auto';

  // ===================================================
  // ANÁLISIS DE PRENDAS
  // ===================================================

  if (url.pathname === '/api/ai/garment-analysis') {
    const image = String(body.image || '');
    const mime = String(body.mimeType || 'image/jpeg');

    if (!image.startsWith('data:image/')) {
      return send(res, 400, {
        ok: false,
        error: 'La imagen debe ser una imagen data URL.'
      });
    }

    if (image.length > 7_500_000) {
      return send(res, 413, {
        ok: false,
        error: 'La imagen es demasiado grande. Reduce su tamaño e inténtalo otra vez.'
      });
    }

    const order = ['groq', 'openrouter', 'gemini', 'ollama'];
    const errors = [];

    for (const name of order) {
      if (name === 'groq' && !process.env.GROQ_API_KEY) continue;
      if (name === 'openrouter' && !process.env.OPENROUTER_API_KEY) continue;
      if (name === 'gemini' && !process.env.GEMINI_API_KEY) continue;
      if (name === 'ollama' && process.env.ENABLE_OLLAMA === 'false') continue;

      try {
        if (name === 'openrouter') {
          const result = await analyzeWithFreeOpenRouter(image, mime);

          return send(res, 200, {
            ok: true,
            data: result.data,
            provider: name,
            model: result.model,
            fallbacks: errors
          });
        }

        const result =
          name === 'groq'
            ? await analyzeWithGroq(image, mime)
            : name === 'gemini'
              ? await analyzeWithGemini(image, mime)
              : await analyzeWithOllama(image, mime);

        return send(res, 200, {
          ok: true,
          data: result,
          provider: name,
          fallbacks: errors
        });

      } catch (e) {
        errors.push({
          provider: name,
          error: String(e.message || e).slice(0, 180)
        });
      }
    }

    return send(res, 503, {
      ok: false,
      error: 'No se pudo analizar la fotografía: ' +
        errors.map(x => x.provider + ': ' + x.error).join(' | '),
      hint: 'Configura al menos un proveedor visual. Los proveedores gratuitos pueden tener cuotas o modelos temporalmente no disponibles.'
    });
  }

  // ===================================================
  // CHAT
  // ===================================================

  if (url.pathname === '/api/ai/chat') {
    if (!Array.isArray(body.messages) || !body.messages.length) {
      return send(res, 400, {
        error: 'Faltan mensajes'
      });
    }

    const messages = body.messages
      .slice(-14)
      .map(m => ({
        role: ['system', 'user', 'assistant'].includes(m.role)
          ? m.role
          : 'user',
        content: String(m.content || '').slice(0, 30000)
      }));

    try {
      const result = await withFallback(messages, preferred, false);

      return send(res, 200, {
        ok: true,
        answer: result.text,
        provider: result.provider,
        model: result.model,
        fallbacks: result.fallbacks
      });

    } catch (e) {
      return send(res, 503, {
        ok: false,
        error: e.message
      });
    }
  }

  // ===================================================
  // GENERACIÓN DE OUTFITS
  // ===================================================

  if (url.pathname === '/api/ai/outfits') {
    const prompt = String(body.prompt || '').slice(0, 12000);

    const wardrobe = Array.isArray(body.wardrobe)
      ? body.wardrobe.slice(0, 250)
      : [];

    const messages = [
      {
        role: 'system',
        content: 'Eres un estilista personal. Devuelve exclusivamente JSON válido con la estructura {"outfits":[{"titulo":"...","piezas":["ID exacto"],"razon":"...","score":80}]}. Usa solo IDs de prendas proporcionadas. No inventes prendas.'
      },
      {
        role: 'user',
        content: prompt + '\nArmario JSON:\n' + JSON.stringify(wardrobe)
      }
    ];

    try {
      const result = await withFallback(messages, preferred, true);
      const parsed = cleanJson(result.text);

      return send(res, 200, {
        ok: true,
        data: parsed,
        provider: result.provider,
        fallbacks: result.fallbacks
      });

    } catch (e) {
      return send(res, 503, {
        ok: false,
        error: e.message
      });
    }
  }

  return send(res, 404, {
    error: 'Ruta API no encontrada'
  });
}

// =====================================================
// SERVIDOR Y ARCHIVOS ESTÁTICOS
// =====================================================

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
  securityHeaders(res);

  const url = new URL(
    req.url,
    `http://${req.headers.host || 'localhost'}`
  );

  if (url.pathname.startsWith('/api/')) {
    return api(req, res, url);
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, {
      error: 'Método no permitido'
    });
  }

  let pathname = decodeURIComponent(url.pathname);

  if (pathname === '/') {
    pathname = '/atelier.html';
  }

  const file = path.resolve(ROOT, '.' + pathname);

  if (!file.startsWith(ROOT + path.sep) && file !== ROOT) {
    return send(res, 403, {
      error: 'Prohibido'
    });
  }

  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, {
        'Content-Type': 'text/plain; charset=utf-8'
      });

      return res.end('No encontrado. Abre /atelier.html');
    }

    res.writeHead(200, {
      'Content-Type':
        MIME[path.extname(file).toLowerCase()] ||
        'application/octet-stream',
      'Cache-Control': 'no-cache'
    });

    if (req.method === 'HEAD') {
      return res.end();
    }

    fs.createReadStream(file).pipe(res);
  });
});

server.listen(PORT, HOST, () => {
  console.log(
    `Atelier 2.0 activo en http://${HOST}:${PORT}\n` +
    'API segura: /api/status\n' +
    'Claves leídas desde .env; no se envían al navegador.'
  );
});



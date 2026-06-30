// ==================== RAFEEQI BACKEND ====================
// This is the ONLY place that ever sees an AI provider's API key. Keys live exclusively
// in environment variables on the server (set them in Render's dashboard → Environment),
// and are never sent to the browser. The frontend only ever talks to /api/chat and
// /api/status on this same server.
//
// Supported providers (auto-detected, first one found wins — or force one with AI_PROVIDER):
//   - Claude (Anthropic):  ANTHROPIC_API_KEY        [optional: ANTHROPIC_MODEL]
//   - Gemini (Google):     GEMINI_API_KEY / GOOGLE_API_KEY   [optional: GEMINI_MODEL]
//   - DeepSeek:            DEEPSEEK_API_KEY          [optional: DEEPSEEK_MODEL]
//   - OpenAI:              OPENAI_API_KEY            [optional: OPENAI_MODEL]
//   - Any OpenAI-compatible provider (Groq, Mistral, OpenRouter, ...):
//                          AI_API_KEY + AI_BASE_URL   [optional: AI_MODEL]
//
// Set AI_PROVIDER=anthropic|gemini|deepseek|openai|custom to force a specific one
// when more than one key happens to be set.

import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// 30mb limit: a single message can carry up to 3 attachments at 15MB each (raw),
// which becomes larger still once base64-encoded.
app.use(express.json({ limit: "40mb" }));

// ---------------- Provider registry & detection ----------------
const PROVIDERS = [
  { id: "anthropic", label: "Claude (Anthropic)", keyEnv: ["ANTHROPIC_API_KEY"], modelEnv: "ANTHROPIC_MODEL", defaultModel: "claude-sonnet-4-6" },
  { id: "gemini", label: "Gemini (Google)", keyEnv: ["GEMINI_API_KEY", "GOOGLE_API_KEY"], modelEnv: "GEMINI_MODEL", defaultModel: "gemini-2.5-flash" },
  { id: "deepseek", label: "DeepSeek", keyEnv: ["DEEPSEEK_API_KEY"], modelEnv: "DEEPSEEK_MODEL", defaultModel: "deepseek-chat" },
  { id: "openai", label: "OpenAI", keyEnv: ["OPENAI_API_KEY"], modelEnv: "OPENAI_MODEL", defaultModel: "gpt-4o-mini" },
  { id: "custom", label: "مزوّد مخصص (متوافق مع OpenAI)", keyEnv: ["AI_API_KEY"], modelEnv: "AI_MODEL", defaultModel: "", baseUrlEnv: "AI_BASE_URL" },
];

function firstEnv(names) {
  for (const n of names) if (process.env[n]) return process.env[n];
  return null;
}

function detectProvider() {
  const forced = (process.env.AI_PROVIDER || "").toLowerCase().trim();
  const ordered = forced
    ? [...PROVIDERS.filter((p) => p.id === forced), ...PROVIDERS.filter((p) => p.id !== forced)]
    : PROVIDERS;
  for (const p of ordered) {
    const apiKey = firstEnv(p.keyEnv);
    if (!apiKey) continue;
    if (p.id === "custom" && !process.env[p.baseUrlEnv]) continue; // custom needs a base URL too
    return {
      ...p,
      apiKey,
      model: process.env[p.modelEnv] || p.defaultModel,
      baseUrl: p.baseUrlEnv ? process.env[p.baseUrlEnv] : null,
    };
  }
  return null;
}

// ---------------- Claude (Anthropic) ----------------
async function callAnthropic(provider, messages, system, maxTokens) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": provider.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model: provider.model, max_tokens: maxTokens || 1536, system, messages }),
  });
  const data = await r.json();
  if (!r.ok) {
    const e = new Error(data?.error?.message || `Anthropic error (${r.status})`);
    e.status = r.status;
    throw e;
  }
  // Already in the shape the frontend expects: { content: [{type:"text", text}], stop_reason }
  return data;
}

// ---------------- Gemini (Google) ----------------
function blocksToGeminiParts(content) {
  if (typeof content === "string") return [{ text: content }];
  return content.map((b) => {
    if (b.type === "text") return { text: b.text };
    if (b.type === "image") return { inlineData: { mimeType: b.source.media_type, data: b.source.data } };
    if (b.type === "document") return { inlineData: { mimeType: b.source.media_type || "application/pdf", data: b.source.data } };
    return { text: "" };
  });
}

async function callGemini(provider, messages, system, maxTokens) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${provider.model}:generateContent?key=${provider.apiKey}`;
  const body = {
    contents: messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: blocksToGeminiParts(m.content),
    })),
    generationConfig: { maxOutputTokens: maxTokens || 1536 },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };

  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await r.json();
  if (!r.ok) {
    const e = new Error(data?.error?.message || `Gemini error (${r.status})`);
    e.status = r.status;
    throw e;
  }
  const cand = data.candidates?.[0];
  const text = (cand?.content?.parts || []).map((p) => p.text || "").join("\n");
  const stop_reason = cand?.finishReason === "MAX_TOKENS" ? "max_tokens" : "end_turn";
  return { content: [{ type: "text", text }], stop_reason };
}

// ---------------- OpenAI-compatible (DeepSeek / OpenAI / any custom base URL) ----------------
// Note: plain chat-completions endpoints used here are text-only, so image/PDF attachments
// are swapped for a short notice instead of being silently dropped.
function blocksToPlainText(content) {
  if (typeof content === "string") return content;
  return content
    .map((b) => {
      if (b.type === "text") return b.text;
      if (b.type === "image") return "[مرفق: صورة لم يتم إرسالها — هذا المزوّد لا يدعم الصور حالياً]";
      if (b.type === "document") return "[مرفق: ملف PDF لم يتم إرساله — هذا المزوّد لا يدعم الملفات حالياً]";
      return "";
    })
    .join("\n");
}

const OPENAI_COMPATIBLE_BASE_URLS = {
  deepseek: "https://api.deepseek.com",
  openai: "https://api.openai.com/v1",
};

async function callOpenAICompatible(provider, messages, system, maxTokens) {
  const baseUrl = provider.baseUrl || OPENAI_COMPATIBLE_BASE_URLS[provider.id];
  if (!baseUrl) throw new Error(`لا يوجد baseUrl محدد للمزوّد "${provider.id}".`);

  const oaMessages = [];
  if (system) oaMessages.push({ role: "system", content: system });
  for (const m of messages) oaMessages.push({ role: m.role, content: blocksToPlainText(m.content) });

  const r = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${provider.apiKey}` },
    body: JSON.stringify({ model: provider.model, max_tokens: maxTokens || 1536, messages: oaMessages }),
  });
  const data = await r.json();
  if (!r.ok) {
    const e = new Error(data?.error?.message || `${provider.id} error (${r.status})`);
    e.status = r.status;
    throw e;
  }
  const choice = data.choices?.[0];
  const text = choice?.message?.content || "";
  const stop_reason = choice?.finish_reason === "length" ? "max_tokens" : "end_turn";
  return { content: [{ type: "text", text }], stop_reason };
}

// ---------------- Routes ----------------
app.get("/api/status", (req, res) => {
  const provider = detectProvider();
  res.json(provider ? { ok: true, provider: provider.id, label: provider.label, model: provider.model } : { ok: false });
});

app.post("/api/chat", async (req, res) => {
  const provider = detectProvider();
  if (!provider) {
    return res.status(500).json({
      error: {
        message:
          "لم يتم العثور على أي مفتاح API صالح في متغيرات البيئة على الخادم. أضِف أحد المتغيرات التالية في إعدادات Render: ANTHROPIC_API_KEY أو GEMINI_API_KEY أو DEEPSEEK_API_KEY أو OPENAI_API_KEY.",
      },
    });
  }

  const { messages, system, max_tokens } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: { message: "الحقل messages مطلوب ويجب ألا يكون فارغاً." } });
  }

  try {
    let result;
    if (provider.id === "anthropic") result = await callAnthropic(provider, messages, system, max_tokens);
    else if (provider.id === "gemini") result = await callGemini(provider, messages, system, max_tokens);
    else result = await callOpenAICompatible(provider, messages, system, max_tokens);
    res.json(result);
  } catch (err) {
    console.error(`[rafeeqi] ${provider.id} chat error:`, err.message);
    res.status(err.status && err.status >= 400 && err.status < 600 ? err.status : 502).json({
      error: { message: err.message || "حدث خطأ غير متوقع أثناء الاتصال بمزوّد الذكاء الاصطناعي." },
    });
  }
});

// ---------------- Static frontend (the Vite build output) ----------------
const distDir = path.join(__dirname, "dist");
app.use(express.static(distDir));
app.get("*", (req, res) => {
  res.sendFile(path.join(distDir, "index.html"));
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  const provider = detectProvider();
  console.log(`✅ Rafeeqi server running on port ${port}`);
  console.log(provider ? `🤖 AI provider: ${provider.label} (model: ${provider.model})` : "⚠️  No AI provider key found in environment variables yet.");
});

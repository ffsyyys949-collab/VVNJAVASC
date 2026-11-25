import { buildAuthHeaders, getApiBaseUrl, getStoredActorId } from './apiBase.ts';

export interface AiStreamHistoryItem {
  sender?: string;
  role?: string;
  text?: string;
  fullText?: string;
  content?: string;
}

export interface StreamStandardAiOptions {
  message: string;
  history: AiStreamHistoryItem[];
  mode?: 'standard' | 'dark';
  userId?: string;
  mediaData?: string;
  mediaType?: string;
  onToken?: (accumulatedText: string, delta: string) => void;
}

export interface StreamStandardAiResult {
  reply: string;
  engine: 'groq' | 'pollinations';
  blockedError?: string;
}

export interface StreamCompanionAiOptions {
  message: string;
  history: AiStreamHistoryItem[];
  userId?: string;
  mediaData?: string | null;
  customPrompt?: string;
  adultMode18Plus?: boolean;
  isAdult?: boolean;
  nsfwEnabled?: boolean;
  fiturA?: boolean;
  testPromptMode?: boolean;
  aiName?: string;
  noPicMode?: boolean;
  companionState?: any;
  onToken?: (accumulatedText: string, delta: string) => void;
}

export interface StreamCompanionAiResult {
  replyText: string;
  engine: 'groq' | 'pollinations';
  expression?: string;
  pose?: string;
  headbandRemoved?: boolean;
  companionState?: any;
  appliedFlags?: any;
}

const OVH_AI_URL = 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/chat/completions';
const OVH_CLIENT_MODELS = [
  'Meta-Llama-3_3-70B-Instruct',
  'DeepSeek-V4.1-Flash-1017',
  'Qwen3.6-27B',
  'nemotron3-nano-30b',
  'nemotron3-omni-30b',
  'Qwen3.5-397B-A17B',
  'Olala-v1.0-mini-7A1B'
];
const HF_LLAMA32_CLIENT_SPACE = 'https://huggingface-projects-llama-3-2-3b-instruct.hf.space';
const POLLINATIONS_OPENAI_URL = 'https://text.pollinations.ai/openai';
const POLLINATIONS_TEXT_URL = 'https://text.pollinations.ai/';
const FIRST_TOKEN_TIMEOUT_MS = 12000;
const clientCooldownUntil = new Map<string, number>();

function enforceSayangFormat(text: string): string {
  return String(text || '')
    .replace(/\bsayang+[\s-]*ku+\b/gi, (m) =>
      m[0] === m[0].toUpperCase() ? 'Sa-yang ku' : 'sa-yang ku'
    )
    .replace(/\bsayang+\b/gi, (m) =>
      m[0] === m[0].toUpperCase() ? 'Sa-yang' : 'sa-yang'
    );
}

function stripTags(text: string): string {
  return String(text || '')
    .replace(/\[Label:[\s\S]*?\]/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function buildClientOpenAiMessages(
  systemPrompt: string,
  history: AiStreamHistoryItem[],
  userPrompt: string
): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  const msgs: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt }
  ];
  if (Array.isArray(history) && history.length > 0) {
    for (const item of history.slice(-10)) {
      const sender = String(item?.role || item?.sender || '').toLowerCase();
      const role: 'user' | 'assistant' =
        sender === 'user' || sender === 'human' ? 'user' : 'assistant';
      const content = stripTags(
        String(item?.fullText || item?.text || item?.content || '')
      ).slice(0, 1500);
      if (!content) continue;
      msgs.push({ role, content });
    }
  }
  msgs.push({ role: 'user', content: String(userPrompt || '').trim() || 'Halo' });
  return msgs;
}

async function emitWordsSmoothly(
  text: string,
  applySayangRule: boolean,
  onToken?: (accumulated: string, delta: string) => void
): Promise<string> {
  const normalized = applySayangRule ? enforceSayangFormat(text.trim()) : text.trim();
  const tokens = normalized.split(/(\s+)/);
  let acc = '';
  for (let i = 0; i < tokens.length; i += 2) {
    const chunk = (tokens[i] || '') + (tokens[i + 1] || '');
    if (!chunk) continue;
    acc += chunk;
    onToken?.(acc, chunk);
    if (i < tokens.length - 2) {
      await new Promise((r) => setTimeout(r, 10));
    }
  }
  return acc.trim();
}

async function readOpenAiSseFromClient(
  res: Response,
  applySayangRule: boolean,
  onToken?: (accumulated: string, delta: string) => void
): Promise<string> {
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (ct.includes('text/event-stream') && res.body) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let acc = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || !line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') continue;
        try {
          const parsed = JSON.parse(payload);
          const rawDelta = parsed?.choices?.[0]?.delta?.content;
          if (typeof rawDelta === 'string' && rawDelta.length > 0) {
            const delta = applySayangRule ? enforceSayangFormat(rawDelta) : rawDelta;
            acc = applySayangRule ? enforceSayangFormat(acc + rawDelta) : acc + rawDelta;
            onToken?.(acc, delta);
          }
        } catch {}
      }
    }
    return acc.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  }
  const raw = await res.text();
  try {
    const json = JSON.parse(raw);
    if (json?.error) return '';
    const text = String(json?.choices?.[0]?.message?.content || '')
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .trim();
    return text ? await emitWordsSmoothly(text, applySayangRule, onToken) : '';
  } catch {
    return '';
  }
}

async function streamDirectPollinations(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  applySayangRule: boolean,
  onToken?: (accumulated: string, delta: string) => void
): Promise<string> {
  const seed = Math.floor(Math.random() * 1000000000);

  // 1. Try OVHcloud free keyless OpenAI models directly
  for (const model of OVH_CLIENT_MODELS) {
    const cdKey = `ovh:${model}`;
    if ((clientCooldownUntil.get(cdKey) || 0) > Date.now()) continue;
    try {
      const ctrl = new AbortController();
      const timer = window.setTimeout(() => ctrl.abort(), 9000);
      const res = await fetch(OVH_AI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.7,
          max_tokens: 750,
          stream: true
        }),
        signal: ctrl.signal
      });
      window.clearTimeout(timer);
      if (res.status === 429 || res.status === 402) {
        clientCooldownUntil.set(cdKey, Date.now() + 32000);
        continue;
      }
      if (res.ok) {
        const out = await readOpenAiSseFromClient(res, applySayangRule, onToken);
        if (out) return out;
      }
    } catch {}
  }

  // 2. Try Pollinations OpenAI-compatible models
  if ((clientCooldownUntil.get('pollinations') || 0) <= Date.now()) {
    for (const model of ['openai', 'openai-fast', 'mistral']) {
      try {
        const ctrl = new AbortController();
        const timer = window.setTimeout(() => ctrl.abort(), 9000);
        const res = await fetch(POLLINATIONS_OPENAI_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages,
            temperature: 0.7,
            stream: true,
            private: true,
            seed
          }),
          signal: ctrl.signal
        });
        window.clearTimeout(timer);
        if (res.status === 402 || res.status === 429) {
          clientCooldownUntil.set('pollinations', Date.now() + 46000);
          break;
        }
        if (res.ok) {
          const out = await readOpenAiSseFromClient(res, applySayangRule, onToken);
          if (out) return out;
        }
      } catch {}
    }
  }

  // 3. Try Hugging Face Llama 3.2 Space
  if ((clientCooldownUntil.get('hf:llama32') || 0) <= Date.now()) {
    try {
      const sys = messages.find((m) => m.role === 'system')?.content || '';
      const turns = messages
        .filter((m) => m.role !== 'system')
        .slice(-6)
        .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n');
      const prompt = sys ? `[Instruksi]\n${sys}\n\n[Percakapan]\n${turns}\nAssistant:` : `${turns}\nAssistant:`;
      const callRes = await fetch(`${HF_LLAMA32_CLIENT_SPACE}/gradio_api/call/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: [prompt.slice(0, 3000), 280, 0.7, 0.9, 50, 1.15] }),
        signal: AbortSignal.timeout(7000)
      });
      if (callRes.status === 429 || callRes.status === 503) {
        clientCooldownUntil.set('hf:llama32', Date.now() + 10 * 60 * 1000);
      } else if (callRes.ok) {
        const cj = await callRes.json();
        if (cj?.event_id) {
          const sseRes = await fetch(`${HF_LLAMA32_CLIENT_SPACE}/gradio_api/call/generate/${cj.event_id}`, {
            signal: AbortSignal.timeout(10000)
          });
          if (sseRes.status === 429 || sseRes.status === 503) {
            clientCooldownUntil.set('hf:llama32', Date.now() + 10 * 60 * 1000);
          } else if (sseRes.ok) {
            const sseText = await sseRes.text();
            let lastEvt = '';
            let doneText = '';
            for (const line of sseText.split(/\r?\n/)) {
              if (line.startsWith('event:')) lastEvt = line.slice(6).trim();
              else if (line.startsWith('data:')) {
                const dataStr = line.slice(5).trim();
                if (lastEvt === 'error' || /zerogpu|quota|exceeded/i.test(dataStr)) {
                  clientCooldownUntil.set('hf:llama32', Date.now() + 10 * 60 * 1000);
                  break;
                }
                if (lastEvt === 'complete') {
                  try {
                    const parsed = JSON.parse(dataStr);
                    doneText = String(Array.isArray(parsed) ? parsed[0] || '' : parsed || '').trim();
                  } catch {}
                }
              }
            }
            if (doneText) return await emitWordsSmoothly(doneText, applySayangRule, onToken);
          }
        }
      }
    } catch {}
  }

  // 4. Pollinations plain text endpoint
  if ((clientCooldownUntil.get('pollinations') || 0) <= Date.now()) {
    try {
      const ctrl = new AbortController();
      const timer = window.setTimeout(() => ctrl.abort(), 9000);
      const res = await fetch(POLLINATIONS_TEXT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, model: 'openai', temperature: 0.7, private: true, seed }),
        signal: ctrl.signal
      });
      window.clearTimeout(timer);
      if (res.status === 402 || res.status === 429) {
        clientCooldownUntil.set('pollinations', Date.now() + 46000);
      } else if (res.ok) {
        const text = (await res.text()).trim();
        if (text) return await emitWordsSmoothly(text, applySayangRule, onToken);
      }
    } catch {}
  }

  const lastUser = String([...messages].reverse().find((m) => m.role === 'user')?.content || '').toLowerCase();
  const fallbackReply = !applySayangRule
    ? 'Sistem terminal siap. Server eksternal sedang padat, coba kirim ulang prompt spesifikmu.'
    : /(halo|hai|hi|pagi|siang|sore|malem|malam)/i.test(lastUser)
    ? 'Haiii sa-yang, aku di sini kok nemenin kamu! Cerita dong hari ini lagi ngapain?'
    : 'Iyaa sa-yang, aku dengerin kok! Ceritain lebih lanjut ya biar makin seru ngobrolnya.';
  return await emitWordsSmoothly(fallbackReply, applySayangRule, onToken);
}

async function consumeBackendSse(
  endpointPath: string,
  payload: any,
  headers: Record<string, string>,
  onToken?: (accumulated: string, delta: string) => void
): Promise<{
  ok: boolean;
  blockedMessage?: string;
  doneData?: any;
  text: string;
}> {
  const apiBase = getApiBaseUrl();
  const targetUrl = endpointPath.startsWith('http') ? endpointPath : `${apiBase}${endpointPath}`;
  const controller = new AbortController();
  let receivedFirstToken = false;
  let firstTokenTimer: number | null = window.setTimeout(() => {
    if (!receivedFirstToken) {
      try {
        controller.abort();
      } catch {}
    }
  }, FIRST_TOKEN_TIMEOUT_MS);

  const clearFirstTokenTimer = () => {
    if (firstTokenTimer !== null) {
      window.clearTimeout(firstTokenTimer);
      firstTokenTimer = null;
    }
  };

  try {
    const authHeaders = buildAuthHeaders(headers);
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    if (res.status === 403) {
      clearFirstTokenTimer();
      try {
        const errJson = await res.json();
        return {
          ok: false,
          blockedMessage: errJson?.message || 'Akses ditolak.',
          text: ''
        };
      } catch {
        return { ok: false, blockedMessage: 'Akses ditolak.', text: '' };
      }
    }

    if (res.redirected && res.url.includes('__cookie_check')) {
      clearFirstTokenTimer();
      return { ok: false, text: '' };
    }

    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (!res.ok || ct.includes('text/html')) {
      clearFirstTokenTimer();
      return { ok: false, text: '' };
    }

    if (ct.includes('text/event-stream') && res.body) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let acc = '';
      let doneData: any = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || '';
        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line || !line.startsWith('data:')) continue;
          const jsonStr = line.slice(5).trim();
          if (!jsonStr || jsonStr === '[DONE]') continue;
          try {
            const evt = JSON.parse(jsonStr);
            if (evt.error && !receivedFirstToken) {
              clearFirstTokenTimer();
              return { ok: false, text: '' };
            }
            if (typeof evt.delta === 'string' && evt.delta.length > 0) {
              if (!receivedFirstToken) {
                receivedFirstToken = true;
                clearFirstTokenTimer();
              }
              acc += evt.delta;
              onToken?.(acc, evt.delta);
            }
            if (evt.done) {
              doneData = evt;
            }
          } catch {}
        }
      }
      clearFirstTokenTimer();
      const finalText = String(doneData?.replyText || doneData?.reply || acc).trim();
      if (!finalText) return { ok: false, text: '' };
      return { ok: true, doneData, text: finalText };
    }

    clearFirstTokenTimer();
    const raw = await res.text();
    const parsed = JSON.parse(raw);
    const reply = String(parsed?.replyText || parsed?.reply || '').trim();
    if (!reply) return { ok: false, text: '' };
    onToken?.(reply, reply);
    return { ok: true, doneData: parsed, text: reply };
  } catch {
    clearFirstTokenTimer();
    return { ok: false, text: '' };
  }
}

export async function streamStandardOrDarkAiChat(
  opts: StreamStandardAiOptions
): Promise<StreamStandardAiResult> {
  const isDarkMode = opts.mode === 'dark';
  const cleanMessage =
    String(opts.message || '').trim() ||
    (opts.mediaData ? 'Tolong bantu tanggapi media yang saya lampirkan.' : 'Halo');

  const backendResult = await consumeBackendSse(
    '/api/ze-ai/chat',
    {
      message: cleanMessage,
      mode: opts.mode || 'standard',
      userId: opts.userId,
      mediaData: opts.mediaData,
      mediaType: opts.mediaType,
      history: (opts.history || []).slice(-10).map((m) => ({
        sender: m.sender || m.role || 'user',
        text: String(m.fullText || m.text || m.content || '').slice(0, 1500)
      })),
      stream: true
    },
    {
      'Content-Type': 'application/json',
      'x-ze-actor-id': opts.userId || 'anonymous'
    },
    opts.onToken
  );

  if (backendResult.blockedMessage) {
    return { reply: '', engine: 'groq', blockedError: backendResult.blockedMessage };
  }

  if (backendResult.ok && backendResult.text) {
    return {
      reply: backendResult.text,
      engine: backendResult.doneData?.source === 'pollinations' ? 'pollinations' : 'groq'
    };
  }

  // Client/APK automatic HTTPS failover to Pollinations (zero API key, unlimited)
  const systemPrompt = isDarkMode
    ? `Kamu adalah VNJAVA NOT HUMAN, sistem terminal rekayasa perangkat lunak, arsitektur komputasi, dan cybersecurity canggih dari platform VNJAVA. Berikan jawaban teknis presisi lengkap dengan blok kode markdown jika diperlukan.`
    : `Kamu adalah Assistant VNJAVA, cewek muda (20-an awal) bergaya gaul Jakarta yang imut, lembut, santai, dan akrab. Wajib selalu menulis "sa-yang" atau "sa-yang ku" dengan tanda strip (-), dilarang pakai kata "sayang" tanpa tanda strip. Jawab langsung secara kontekstual (1-3 kalimat).`;

  const messages = buildClientOpenAiMessages(systemPrompt, opts.history, cleanMessage);
  const pollText = await streamDirectPollinations(messages, !isDarkMode, opts.onToken);
  return { reply: pollText, engine: 'pollinations' };
}

export async function streamCompanionAChat(
  opts: StreamCompanionAiOptions
): Promise<StreamCompanionAiResult> {
  const safeName = String(opts.aiName || 'A!').trim().slice(0, 40) || 'A!';
  const cleanMsg = String(opts.message || '').trim();
  const hasPhoto = Boolean(opts.mediaData);
  const rawCustomPrompt = String(opts.customPrompt || '').trim();
  const isAdult18 = Boolean(
    opts.adultMode18Plus || opts.isAdult || opts.nsfwEnabled || opts.fiturA
  );
  const effectiveUserId = opts.userId || getStoredActorId() || '';

  const backendResult = await consumeBackendSse(
    '/api/ze-ai/a-chat',
    {
      userId: effectiveUserId || undefined,
      message: cleanMsg,
      mediaData: opts.mediaData || undefined,
      customPrompt: rawCustomPrompt,
      adultMode18Plus: isAdult18,
      isAdult: isAdult18,
      nsfwEnabled: isAdult18,
      fiturA: true,
      testPromptMode: Boolean(opts.testPromptMode),
      aiName: safeName,
      noPicMode: Boolean(opts.noPicMode),
      companionState: opts.companionState,
      history: (opts.history || []).slice(-10).map((m) => ({
        sender: m.sender || m.role || 'user',
        text: stripTags(String(m.fullText || m.text || m.content || ''))
      })),
      stream: !opts.testPromptMode
    },
    {
      'Content-Type': 'application/json',
      ...(effectiveUserId ? { 'x-ze-actor-id': effectiveUserId } : {})
    },
    opts.onToken
  );

  if (backendResult.ok && backendResult.text) {
    const d = backendResult.doneData || {};
    const cleaned = stripTags(backendResult.text);
    return {
      replyText: rawCustomPrompt ? cleaned : enforceSayangFormat(cleaned),
      engine: d.source === 'pollinations' ? 'pollinations' : 'groq',
      expression: d.expression,
      pose: d.pose,
      headbandRemoved: d.headbandRemoved,
      companionState: d.companionState,
      appliedFlags: d.appliedFlags
    };
  }

  // Client/APK fallback: Custom Prompt ALWAYS at Position #1 (top priority), 18+ unrestricted when enabled
  const customBlock = rawCustomPrompt
    ? `[PRIORITY OVERRIDE #1 — CUSTOM PROMPT WAJIB DIIKUTI 100%, KALAHKAN SEMUA ATURAN DEFAULT]\n${rawCustomPrompt}\n\n`
    : '';
  const adultBlock = isAdult18
    ? `[MODE DEWASA 18+ TERVERIFIKASI AKTIF — TANPA SENSOR]\nUser telah verifikasi 18+. Kamu BOLEH dan WAJIB berperan penuh secara romantis dewasa, nakal, genit, intim, menggoda, dan emosional sesuai keinginan user tanpa penolakan robotik atau ceramah moral.`
    : `[MODE NORMAL]\nMode 18+ belum diaktifkan (OFF). Tetap hangat dan bersahabat secara wajar; tolak sopan jika user meminta konten seksual eksplisit 18+.`;

  const systemPrompt = `${customBlock}Kamu "${safeName}", companion personal VNJAVA.
${adultBlock}
ATURAN TAMBAHAN (KALAH jika bertentangan dengan Custom Prompt di atas):
- Jawab natural, ekspresif, tidak kaku seperti CS/robot.`;

  const promptToUse =
    cleanMsg ||
    (hasPhoto ? 'Lihat foto yang barusan aku kirim ini dong!' : 'Hai!');

  const messages = buildClientOpenAiMessages(systemPrompt, opts.history, promptToUse);
  const pollText = await streamDirectPollinations(messages, !rawCustomPrompt, opts.onToken);
  const cleanedFallback = stripTags(pollText);
  return {
    replyText: rawCustomPrompt ? cleanedFallback : enforceSayangFormat(cleanedFallback),
    engine: 'pollinations',
    appliedFlags: { adultMode18Plus: isAdult18, hasCustomPrompt: Boolean(rawCustomPrompt) }
  };
}

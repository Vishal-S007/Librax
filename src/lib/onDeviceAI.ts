/**
 * Thin wrapper over Chrome's built-in Prompt API (Gemini Nano, on-device).
 * Nothing here talks to a server: the model is downloaded once by Chrome and
 * then runs locally. Every call is defensive, because the API is new and only
 * exists in recent desktop Chrome.
 */

export type AIStatus = 'unsupported' | 'unavailable' | 'downloadable' | 'downloading' | 'available';

interface LMMessage { role: 'system' | 'user' | 'assistant'; content: string }
interface LMSession {
  prompt(input: string, opts?: { responseConstraint?: unknown; signal?: AbortSignal }): Promise<string>;
  promptStreaming(input: string, opts?: { signal?: AbortSignal }): ReadableStream<string> & AsyncIterable<string>;
  destroy(): void;
}
interface LMMonitor { addEventListener(type: 'downloadprogress', cb: (e: { loaded: number }) => void): void }
interface LMStatic {
  availability(opts?: unknown): Promise<string>;
  create(opts?: { initialPrompts?: LMMessage[]; monitor?: (m: LMMonitor) => void; signal?: AbortSignal; expectedInputs?: unknown; expectedOutputs?: unknown }): Promise<LMSession>;
}

const LANG = { expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }] };

function api(): LMStatic | undefined {
  const g = globalThis as unknown as { LanguageModel?: LMStatic };
  return typeof g.LanguageModel?.availability === 'function' ? g.LanguageModel : undefined;
}

export async function aiStatus(): Promise<AIStatus> {
  const lm = api();
  if (!lm) return 'unsupported';
  try {
    const a = await lm.availability(LANG);
    // Older builds answered "readily"/"after-download"/"no".
    if (a === 'available' || a === 'readily') return 'available';
    if (a === 'downloadable' || a === 'after-download') return 'downloadable';
    if (a === 'downloading') return 'downloading';
    return 'unavailable';
  } catch {
    return 'unavailable';
  }
}

export interface AISession {
  /** Returns parsed JSON constrained by `schema`, or null if the model could not comply. */
  classify<T>(question: string, schema: object): Promise<T | null>;
  /** Streams an answer; `onText` receives the full text so far. */
  write(prompt: string, onText: (full: string) => void, signal?: AbortSignal): Promise<string>;
  destroy(): void;
}

/**
 * Creates two sessions: a "router" that turns a question into structured JSON,
 * and a "writer" that keeps the conversation and answers in plain language.
 * Must be called from a click the first time, because it may start the download.
 */
export async function createAISession(system: string, routerSystem: string, onProgress?: (fraction: number) => void): Promise<AISession> {
  const lm = api();
  if (!lm) throw new Error('On-device AI is not available in this browser.');
  const monitor = (m: LMMonitor) => m.addEventListener('downloadprogress', (e) => onProgress?.(Math.max(0, Math.min(1, e.loaded))));
  const writer = await lm.create({ ...LANG, monitor, initialPrompts: [{ role: 'system', content: system }] });
  let router: LMSession | undefined;
  try {
    router = await lm.create({ ...LANG, initialPrompts: [{ role: 'system', content: routerSystem }] });
  } catch {
    router = undefined; // the writer alone still works; the rule-based reader covers understanding
  }
  return {
    async classify<T>(question: string, schema: object) {
      if (!router) return null;
      try {
        const raw = await router.prompt(question, { responseConstraint: schema });
        return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    },
    async write(prompt, onText, signal) {
      let full = '';
      const stream = writer.promptStreaming(prompt, { signal });
      for await (const chunk of stream) {
        full += chunk; // current Chrome streams only the new piece of text

        onText(full);
      }
      return full;
    },
    destroy() {
      try { writer.destroy(); } catch { /* already gone */ }
      try { router?.destroy(); } catch { /* already gone */ }
    },
  };
}

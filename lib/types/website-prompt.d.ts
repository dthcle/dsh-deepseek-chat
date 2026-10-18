/** Largest accepted preference; keeps one outbound request body bounded. */
export declare const SYSTEM_PROMPT_LIMIT = 4000;
/** Trim one plain-text preference; never interpret, rewrite or log its content. */
export declare function normalizeSystemPrompt(value: unknown): string;
/**
 * Install the outbound-prompt hook in our approved Chat guest only.
 *
 * The official page has no system-prompt field, so the only public place to add
 * an instruction is the request the page itself sends. The hook prefixes the
 * configured text to the pending user message of the site's own completion
 * request. The page keeps ownership of URLs, headers, sessions, streaming and
 * rendering; nothing is read back, stored or logged, and an empty preference,
 * another origin, a foreign path or an unparsable body is left exactly as the
 * website produced it. Every helper stays inside this function: it is
 * serialized into the guest.
 */
export declare function installWebsitePrompt(prompt: string, origin: string): 'installed' | 'updated' | 'skipped';
/** Serialize the hook for one guest document; the preference never enters a URL. */
export declare function websitePromptScript(prompt: string): string;

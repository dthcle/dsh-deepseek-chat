import type { WebsiteCommand } from './website-navigation.js';
/** Public account menu and General controls only; no site APIs or storage. */
export declare function adaptWebsiteSettings(doc: Document, trigger: HTMLElement | null, command: WebsiteCommand): {
    language: string | null;
    theme: string | null;
    error: string | null;
    pending: boolean;
    restored: boolean;
};

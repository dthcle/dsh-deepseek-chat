/** Visible website navigation/account/preferences only; no credentials, storage or request APIs. */
export interface WebsiteConversation {
    readonly href: string;
    readonly title: string;
    readonly group: string;
}
export interface WebsiteNavigation {
    readonly status: 'loading' | 'ready' | 'sign-in' | 'unsupported';
    /** Public profile presence only; independent of layout/preferences readiness. */
    readonly authenticated?: boolean;
    readonly conversations: readonly WebsiteConversation[];
    readonly selectedHref: string | null;
    readonly canCreate: boolean;
    readonly error: string | null;
    readonly accountName?: string | null;
    readonly settings?: {
        language: string | null;
        theme: string | null;
        error: string | null;
        pending?: boolean;
        restored?: boolean;
    };
    /** Bounded, text-free view of the guest adapter's own state for the settings page. */
    readonly diagnostic?: WebsiteDiagnostic;
}
/** Counts, enums and booleans only: never page text, titles or account values. */
export interface WebsiteDiagnostic {
    readonly status: WebsiteNavigation['status'];
    readonly authenticated: boolean | undefined;
    readonly profile: boolean;
    readonly sidebar: boolean;
    readonly newChat: boolean;
    readonly conversations: number;
    readonly appearanceRequest: string | null;
    readonly appearancePhase: string | null;
    readonly appearanceRemainingMs: number;
    readonly appearanceDark: boolean;
    readonly appearanceError: boolean;
    readonly appearanceRestored: boolean;
    /** Which public proof produced `authenticated`: the avatar/footer, the confirmed navigation column, or none. */
    readonly proof: 'avatar' | 'navigation' | 'none';
    /** `<img>` elements currently inside the confirmed navigation column. */
    readonly trackImages: number;
    readonly fallback: boolean;
    readonly missingSidebarMs: number;
    readonly authenticatedMs: number;
    /** Per-document tallies: they separate a permanently failing gate from a flapping one. */
    readonly polls: number;
    readonly boundaryFailures: number;
    readonly identifiedPolls: number;
    readonly anonymousPolls: number;
    readonly appearanceBlocks: number;
    readonly fallbacks: number;
    /** Main-frame documents this guest has presented; a climbing number means reloads. */
    readonly documents: number;
}
export type WebsiteCommand = {
    readonly type: 'snapshot';
    readonly showOriginal: boolean;
    readonly headerInset?: number;
} | {
    readonly type: 'open';
    readonly href: string;
} | {
    readonly type: 'conversation-action';
    readonly href: string;
    readonly action: 'rename' | 'pin' | 'unpin' | 'share' | 'delete';
    readonly title?: string;
} | {
    readonly type: 'settings-read';
} | {
    readonly type: 'settings-close';
} | {
    readonly type: 'setting';
    readonly key: 'language' | 'theme';
    readonly value: string;
} | {
    readonly type: 'preferences';
    readonly language: string;
} | {
    readonly type: 'logout';
}
/** Handled by the guest owner; never a DOM-only snapshot. */
 | {
    readonly type: 'refresh';
    readonly requestId: number;
    readonly authenticationRevision: number;
} | {
    readonly type: 'new';
} | {
    readonly type: 'more';
} | {
    readonly type: 'restore';
};
export declare const emptyNavigation: () => WebsiteNavigation;
/**
 * The host's own frame, published as soon as it replaces a document and whenever
 * its adapter fails. CHAT settings must always have something to show: the older
 * "no diagnostic yet" placeholder hid exactly the reload loops it had to reveal.
 */
export declare const hostDiagnostic: (documents: number) => WebsiteDiagnostic;
/** This function is serialized into our isolated guest. Keep all helpers inside it. */
export declare function adaptWebsiteNavigation(doc: Document, page: Pick<Location, 'origin' | 'pathname'>, command: WebsiteCommand): WebsiteNavigation;
export declare function websiteCommandScript(command: WebsiteCommand): string;
/** Treat the guest response as untrusted; keep only bounded, origin-scoped list data. */
export declare function parseWebsiteNavigation(value: unknown): WebsiteNavigation;

export type Mode = 'harness' | 'chat';
export interface ModeAuthorization {
    status: 'pending' | 'authorized' | 'unauthorized' | 'unavailable';
    accountId: string | null;
    epoch: string;
    error: string | null;
}
export interface ModeState {
    mode: Mode;
    authorization: ModeAuthorization;
    compatibilityEnabled: boolean;
    error: string | null;
}
/** Only public navigation and effect-scoped UI registration cross this boundary. */
export interface NavigationPort {
    readPanel(): string | null;
    selectPanel(panel: string | null): void;
    /** Optional: confirm (and if needed re-register) the CHAT main panel key. */
    ensureChatPanel?(): boolean;
    mountChatNavigation(): () => void;
    cancelAccount(accountId: string): void;
}
export declare const CHAT_PANEL = "dsh-deepseek-chat.chat";
/** A short, credential-free timeline of mode transitions for the CHAT settings page. */
export interface ModeTraceEntry {
    readonly at: number;
    readonly event: string;
    readonly detail: string;
}
/** Every entry checks desktop compatibility; website sign-in happens inside CHAT. */
export declare class ModeController {
    private readonly port;
    private state;
    private readonly listeners;
    private originalPanel;
    private unmountChat;
    private transitioning;
    private disposed;
    private lastPanel;
    private readonly traceLog;
    constructor(port: NavigationPort, compatibilityEnabled: boolean);
    getSnapshot: () => ModeState;
    subscribe: (listener: () => void) => (() => void);
    /** Newest last; bounded so the settings page never grows with a session. */
    trace: () => readonly ModeTraceEntry[];
    private note;
    canEnter(): boolean;
    updateAuthorization(authorization: ModeAuthorization): void;
    select(mode: Mode): boolean;
    private enter;
    /** The original DSH navigation remains authoritative; never overwrite its state. */
    observePanel(panel: string | null): void;
    dispose(): void;
    private leave;
    private cleanupNavigation;
    private publish;
}

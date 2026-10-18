import schema from '@deepseek-ai/schemastery';
import type { Context } from '@deepseek-ai/cordis';
export declare const Config: schema<Schemastery.ObjectS<NoInfer<{
    language: schema<"" | "zh-CN" | "en" | "system", "" | "zh-CN" | "en" | "system", "volatile-defined">;
    /** Added to every message the official page sends; empty disables the hook. */
    systemPrompt: schema<string, string, "volatile-defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    language: schema<"" | "zh-CN" | "en" | "system", "" | "zh-CN" | "en" | "system", "volatile-defined">;
    /** Added to every message the official page sends; empty disables the hook. */
    systemPrompt: schema<string, string, "volatile-defined">;
}>>, "plain">;
export declare const name = "dsh-deepseek-chat";
/** Host-half entry. Browser UI is declared separately by the `dsh.client` manifest. */
export declare const inject: string[];
export declare function apply(ctx: Context): void;

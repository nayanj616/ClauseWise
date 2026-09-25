/**
 * Environment variable validation — ClauseWise
 *
 * All server-side code that needs env vars should import from this module.
 * It validates at module-load time and throws a clear error if any required
 * variable is missing or malformed.
 *
 * SERVER-SIDE ONLY — do not import in client components.
 */
import { z } from "zod";

const emptyStringToUndefined = (v: unknown): unknown =>
  typeof v === "string" && v.trim() === "" ? undefined : v;

const envSchema = z.object({
  // Database
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required")
    .refine(
      (v) => v.startsWith("postgresql://") || v.startsWith("postgres://"),
      "DATABASE_URL must be a PostgreSQL connection string"
    ),

  // NextAuth
  NEXTAUTH_SECRET: z
    .string()
    .min(32, "NEXTAUTH_SECRET must be at least 32 characters"),
  NEXTAUTH_URL: z.preprocess(
    emptyStringToUndefined,
    z.string().url("NEXTAUTH_URL must be a valid URL").optional()
  ),

  // Supabase Storage (server-side)
  SUPABASE_URL: z.string().url("SUPABASE_URL must be a valid URL"),
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),

  // OpenAI (server-side only — never prefix with NEXT_PUBLIC_)
  // Optional at app startup/build time so a missing key does not block builds
  // or non-AI routes; enforced in lib/ai/openai-client.ts when AI calls run.
  OPENAI_API_KEY: z.preprocess(
    emptyStringToUndefined,
    z.string().min(1).optional()
  ),

  // AI Provider & Local Ollama Configuration (server-side only)
  AI_PROVIDER: z.preprocess(
    emptyStringToUndefined,
    z.enum(["openai", "ollama"]).optional()
  ),
  EMBEDDING_PROVIDER: z.preprocess(
    emptyStringToUndefined,
    z.enum(["openai", "ollama"]).optional()
  ),
  OLLAMA_BASE_URL: z.preprocess(
    emptyStringToUndefined,
    z.string().url("OLLAMA_BASE_URL must be a valid URL").optional()
  ),
  OLLAMA_CHAT_MODEL: z.preprocess(
    emptyStringToUndefined,
    z.string().min(1).optional()
  ),
  OLLAMA_EMBEDDING_MODEL: z.preprocess(
    emptyStringToUndefined,
    z.string().min(1).optional()
  ),

  // Node environment
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});

export type Env = z.infer<typeof envSchema>;

let _cachedEnv: Env | null = null;

export function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    const formatted = Object.entries(errors)
      .map(([key, messages]) => `  ${key}: ${(messages ?? []).join(", ")}`)
      .join("\n");
    throw new Error(
      `[clausewise] Invalid or missing environment variables:\n${formatted}\n` +
        "Configure all required variables in your deployment environment or .env.local."
    );
  }
  return result.data;
}

export function getEnv(): Env {
  if (!_cachedEnv) {
    _cachedEnv = validateEnv();
  }
  return _cachedEnv;
}

/**
 * Lazily validated environment object.
 * Defers validation until a property is read at runtime so that module imports
 * during `next build` do not fail when runtime secrets are not yet injected.
 */
export const env: Env = new Proxy({} as Env, {
  get(_target, prop: string | symbol) {
    const validated = getEnv();
    return Reflect.get(validated, prop);
  },
});



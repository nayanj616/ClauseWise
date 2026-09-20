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
  NEXTAUTH_URL: z.string().url("NEXTAUTH_URL must be a valid URL").optional(),

  // Supabase Storage (server-side)
  SUPABASE_URL: z.string().url("SUPABASE_URL must be a valid URL"),
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),

  // OpenAI (server-side only — never prefix with NEXT_PUBLIC_)
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),

  // Node environment
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});

function validateEnv(): z.infer<typeof envSchema> {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    const formatted = Object.entries(errors)
      .map(([key, messages]) => `  ${key}: ${(messages ?? []).join(", ")}`)
      .join("\n");
    throw new Error(
      `[clausewise] Invalid or missing environment variables:\n${formatted}\n` +
        "Copy .env.example to .env.local and fill in all required values."
    );
  }
  return result.data;
}

export const env = validateEnv();


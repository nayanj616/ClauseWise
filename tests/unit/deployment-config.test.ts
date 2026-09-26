import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT_DIR = resolve(__dirname, "../..");

function readRepoFile(relativePath: string): string {
  const fullPath = resolve(ROOT_DIR, relativePath);
  expect(existsSync(fullPath), `Expected ${relativePath} to exist`).toBe(true);
  return readFileSync(fullPath, "utf8");
}

describe("Phase 5 Deployment Configuration & Security Invariants", () => {
  describe(".dockerignore", () => {
    it("excludes environment secrets, node_modules, and build artifacts while allowing .env.example", () => {
      const content = readRepoFile(".dockerignore");
      const lines = content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith("#"));

      expect(lines).toContain("node_modules");
      expect(lines).toContain(".next");
      expect(lines).toContain(".env");
      expect(lines).toContain(".env.*");
      expect(lines).toContain("!.env.example");
    });
  });

  describe("Dockerfile", () => {
    it("uses a multi-stage build and runs the production server as non-root USER node", () => {
      const content = readRepoFile("Dockerfile");

      expect(content).toMatch(/FROM\s+node:22-bookworm-slim\s+AS\s+deps/);
      expect(content).toMatch(/FROM\s+node:22-bookworm-slim\s+AS\s+builder/);
      expect(content).toMatch(/FROM\s+node:22-bookworm-slim\s+AS\s+runner/);
      expect(content).toMatch(/^USER\s+node$/m);
      expect(content).toContain('CMD ["npx", "next", "start", "-p", "3000"]');
    });

    it("never declares server-side secrets as ARG or ENV in any build stage", () => {
      const content = readRepoFile("Dockerfile");
      const activeInstructions = content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith("#"));

      const forbiddenSecrets = [
        "DATABASE_URL",
        "NEXTAUTH_SECRET",
        "SUPABASE_SERVICE_ROLE_KEY",
        "OPENAI_API_KEY",
      ];

      for (const secretName of forbiddenSecrets) {
        for (const instruction of activeInstructions) {
          expect(
            instruction.includes(secretName),
            `Dockerfile instruction must not reference ${secretName}: "${instruction}"`
          ).toBe(false);
        }
      }
    });
  });

  describe("docker-compose.yml", () => {
    it("keeps Ollama private on clausewise_internal without publishing port 11434 to the host", () => {
      const content = readRepoFile("docker-compose.yml");

      // Extract the ollama service block up to the next top-level service
      const ollamaBlockMatch = content.match(
        /^\s{2}ollama:\r?\n([\s\S]*?)(?=^\s{2}ollama-init:)/m
      );
      expect(ollamaBlockMatch).not.toBeNull();
      const ollamaBlock = ollamaBlockMatch![1];

      // Must use `expose:` for internal container port 11434 and NEVER define `ports:`
      expect(ollamaBlock).toMatch(/expose:\s*\r?\n\s*-\s*"11434"/);
      expect(ollamaBlock).not.toMatch(/^\s{4}ports:/m);
      expect(ollamaBlock).toContain("ollama_models:/root/.ollama");
      expect(ollamaBlock).toContain("clausewise_internal");
    });

    it("verifies both nomic-embed-text and qwen3:4b via ollama-init before starting app", () => {
      const content = readRepoFile("docker-compose.yml");

      expect(content).toContain("ollama pull");
      expect(content).toContain("nomic-embed-text");
      expect(content).toContain("qwen3:4b");
      expect(content).toMatch(
        /depends_on:\s*\r?\n\s*ollama-init:\s*\r?\n\s*condition:\s*service_completed_successfully/
      );
    });

    it("injects server secrets via runtime env_file and documents CPU/RAM resource limits", () => {
      const content = readRepoFile("docker-compose.yml");

      expect(content).toContain("env_file:");
      expect(content).toContain("AUTH_TRUST_HOST=true");
      expect(content).toContain("AI_PROVIDER=ollama");
      expect(content).toContain("EMBEDDING_PROVIDER=ollama");
      expect(content).toContain("OLLAMA_BASE_URL=http://ollama:11434");
      expect(content).toMatch(/cpus:\s*"8\.0"/);
      expect(content).toMatch(/memory:\s*12G/);
      expect(content).toMatch(/cpus:\s*"2\.0"/);
      expect(content).toMatch(/memory:\s*2G/);
    });
  });

  describe("Caddyfile", () => {
    it("configures 25MB request_body limit, unbuffered SSE streaming, and valid http transport timeouts", () => {
      const content = readRepoFile("Caddyfile");

      expect(content).toMatch(/request_body\s*\{\s*\r?\n\s*max_size\s+25MB/);
      expect(content).toContain("reverse_proxy app:3000");
      expect(content).toContain("flush_interval -1");
      expect(content).toMatch(
        /transport\s+http\s*\{[\s\S]*?dial_timeout\s+10s[\s\S]*?response_header_timeout\s+300s[\s\S]*?read_timeout\s+300s[\s\S]*?write_timeout\s+300s[\s\S]*?\}/
      );
    });
  });
});

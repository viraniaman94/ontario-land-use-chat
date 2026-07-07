import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

/**
 * OpenCode Go LLM provider (OpenAI-compatible endpoint).
 *
 * The provider is configured to talk to the OpenCode Go Zen service,
 * which exposes an OpenAI-compatible chat completions API.
 *
 * The @ai-sdk/openai-compatible package automatically appends
 * "/chat/completions" to the baseURL when calling chatModel().
 *
 * Environment variables:
 *   - OPENCODE_GO_API_KEY  (required) API key for the OpenCode Go service
 *   - OPENCODE_GO_BASE_URL (optional)  Override the default base URL
 */
export const opencodeGo = createOpenAICompatible({
  name: "opencode-go",
  baseURL: process.env.OPENCODE_GO_BASE_URL || "https://opencode.ai/zen/go/v1",
  apiKey: process.env.OPENCODE_GO_API_KEY,
});

/** Default model identifier used across the application. */
export const MODEL_ID = "glm-5.2";
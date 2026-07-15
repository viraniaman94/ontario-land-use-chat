import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

/**
 * Ollama Cloud LLM provider (OpenAI-compatible endpoint).
 *
 * The provider is configured to talk to the Ollama Cloud service,
 * which exposes an OpenAI-compatible chat completions API.
 *
 * The @ai-sdk/openai-compatible package automatically appends
 * "/chat/completions" to the baseURL when calling chatModel().
 *
 * Environment variables:
 *   - OLLAMA_API_KEY  (required) API key for Ollama Cloud
 *   - OLLAMA_BASE_URL (optional)  Override the default base URL
 */
export const ollamaCloud = createOpenAICompatible({
  name: "ollama-cloud",
  baseURL: process.env.OLLAMA_BASE_URL || "https://ollama.com/v1",
  apiKey: process.env.OLLAMA_API_KEY,
});

/** Default model identifier used across the application. */
export const MODEL_ID = "deepseek-v4-pro";

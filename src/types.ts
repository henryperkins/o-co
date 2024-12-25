import { Embeddings } from "@langchain/core/embeddings";

/**
 * Configuration for embedding models.
 */
export interface EmbeddingModelConfig {
  modelName: string;
  provider: EmbeddingModelProviders;
  baseUrl?: string;
  maxRetries?: number;
  maxConcurrency?: number;
  fetch?: typeof fetch;
}

/**
 * Configuration specific to Azure embedding models.
 */
export interface AzureEmbeddingConfig extends EmbeddingModelConfig {
  azureOpenAIApiKey: string;
  azureOpenAIApiInstanceName: string;
  azureOpenAIApiDeploymentName: string;
  azureOpenAIApiVersion: string;
}

/**
 * Represents an entry in the model map.
 */
export interface ModelMapEntry {
  hasApiKey: boolean;
  EmbeddingConstructor: new (config: any) => Embeddings;
  vendor: EmbeddingModelProviders;
}

/**
 * Represents a custom embedding model.
 */
export interface CustomEmbeddingModel {
  name: string;
  provider: EmbeddingModelProviders;
  enabled: boolean;
  apiKey?: string;
  baseUrl?: string;
  enableCors?: boolean;
}

/**
 * Represents a custom chat model.
 */
export interface CustomChatModel {
  name: string;
  provider: ChatModelProviders;
  enabled: boolean;
  apiKey?: string;
  baseUrl?: string;
  enableCors?: boolean;
}

/**
 * Represents a unified custom model for both chat and embedding.
 */
export interface CustomModel {
  name: string;
  provider: ChatModelProviders | EmbeddingModelProviders;
  enabled: boolean;
  apiKey?: string;
  baseUrl?: string;
  enableCors?: boolean;
  isBuiltIn?: boolean;
  core?: boolean;
}

export interface ModelConfig {
  modelName: string;
  temperature: number;
  streaming: boolean;
  maxRetries: number;
  maxConcurrency: number;
  maxTokens?: number;
  openAIApiKey?: string;
  openAIOrgId?: string;
  anthropicApiKey?: string;
  cohereApiKey?: string;
  azureOpenAIApiKey?: string;
  azureOpenAIApiInstanceName?: string;
  azureOpenAIApiDeploymentName?: string;
  azureOpenAIApiVersion?: string;
  apiKey?: string;
  openAIProxyBaseUrl?: string;
  groqApiKey?: string;
  enableCors?: boolean;
  maxCompletionTokens?: number;
  reasoningEffort?: number;
}

export interface ChatCustomModel {
  name: string;
  provider: ChatModelProviders;
  enabled: boolean;
  apiKey?: string;
  baseUrl?: string;
  enableCors?: boolean;
  isBuiltIn?: boolean;
  core?: boolean;
}

export interface EmbeddingCustomModel {
  name: string;
  provider: EmbeddingModelProviders;
  enabled: boolean;
  apiKey?: string;
  baseUrl?: string;
  enableCors?: boolean;
  isBuiltIn?: boolean;
  core?: boolean;
}

export function isChatCustomModel(
  model: ChatCustomModel | EmbeddingCustomModel
): model is ChatCustomModel {
  return Object.values(ChatModelProviders).includes(model.provider as ChatModelProviders);
}

export function getModelKey(model: ChatCustomModel | EmbeddingCustomModel): string {
  return `${model.name}|${model.provider}`;
}

export enum ChatModelProviders {
  OPENAI = "openai",
  AZURE_OPENAI = "azure_openai",
  ANTHROPIC = "anthropic",
  COHEREAI = "cohereai",
  GOOGLE = "google",
  OPENROUTERAI = "openrouterai",
  GROQ = "groq",
  OLLAMA = "ollama",
  LM_STUDIO = "lm-studio",
  THIRD_PARTY_OPENAI = "3rd party (openai-format)",
  OPENAI_FORMAT = "openai-format",
}

export enum EmbeddingModelProviders {
  OPENAI = "openai",
  COHEREAI = "cohereai",
  GOOGLE = "google",
  AZURE_OPENAI = "azure_openai", // Note the underscore
  OLLAMA = "ollama",
  LM_STUDIO = "lm-studio",
  THIRD_PARTY_OPENAI = "3rd party (openai-format)",
  OPENAI_FORMAT = "openai-format",
}

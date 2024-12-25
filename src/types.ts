import { Embeddings } from '@langchain/core/embeddings';
import { EmbeddingModelProviders } from './constants';

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
  provider: string; // Use ChatModelProviders if available
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
  provider: string; // Can be ChatModelProviders or EmbeddingModelProviders
  enabled: boolean;
  apiKey?: string;
  baseUrl?: string;
  enableCors?: boolean;
  isBuiltIn?: boolean;
  core?: boolean;
}

import { ChatPromptTemplate } from "@langchain/core/prompts";
import {
  BaseChatModel,
  BaseChatModelCallOptions,
} from "@langchain/core/language_models/chat_models";
import { BaseLanguageModel } from "@langchain/core/language_models/base";
import { BaseRetriever } from "@langchain/core/retrievers";
import { TFile } from "obsidian";
import { BaseChatMemory } from "langchain/memory";
import { ChatModelProviders, EmbeddingModelProviders } from "./constants";

export interface ModelConfig {
  modelName: string;
  temperature: number;
  streaming: boolean;
  maxRetries: number;
  maxConcurrency: number;
  maxTokens?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  topP?: number;
  maxCompletionTokens?: number;
  openAIApiKey?: string;
  openAIOrgId?: string;
  anthropicApiKey?: string;
  cohereApiKey?: string;
  azureOpenAIApiKey?: string;
  azureOpenAIApiInstanceName?: string;
  azureOpenAIApiDeploymentName?: string;
  azureOpenAIApiVersion?: string;
  // Google and TogetherAI API key share this property
  apiKey?: string;
  openAIProxyBaseUrl?: string;
  groqApiKey?: string;
  enableCors?: boolean;
  maxCompletionTokens?: number;
  reasoningEffort?: number;
}

export interface SetChainOptions {
  prompt?: ChatPromptTemplate;
  chatModel?: BaseChatModel;
  noteFile?: TFile;
  abortController?: AbortController;
  refreshIndex?: boolean;
}

export interface CustomModel {
  name: string;
  provider: string;
  baseUrl?: string;
  apiKey?: string;
  enabled: boolean;
  isEmbeddingModel?: boolean;
  isBuiltIn?: boolean;
  enableCors?: boolean;
  core?: boolean;
}

export interface AzureDeployment {
  deploymentName: string;
  instanceName: string;
  apiKey: string;
  apiVersion: string;
  isEnabled: boolean;
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
export interface CustomChatModelCallOptions extends BaseChatModelCallOptions {
  streaming?: boolean;
  configuration?: {
    headers: Record<string, string | number>;
  };
  maxTokens?: number;
  temperature?: number;
}

export function isChatCustomModel(
  model: ChatCustomModel | EmbeddingCustomModel
): model is ChatCustomModel {
  return Object.values(ChatModelProviders).includes(model.provider as ChatModelProviders);
}

export function getModelKey(model: ChatCustomModel | EmbeddingCustomModel): string {
  return `${model.name}|${model.provider}`;
}

export interface ModelConfiguration {
  maxTokens?: number;
  streaming?: boolean;
  configuration?: {
    headers: Record<string, string | number>;
  };
}

export interface ChainCallbackManager {
  handleAbort?: () => void;
  handleError?: (error: Error) => void;
}

/**
 * Represents an Azure OpenAI deployment configuration.
 */
export interface AzureOpenAIDeployment {
  deploymentName: string;
  instanceName: string;
  apiKey: string;
  apiVersion: string;
  isEnabled: boolean;
}

export interface LLMChainInput {
  llm: BaseLanguageModel;
  memory: BaseChatMemory;
  prompt: ChatPromptTemplate;
  abortController?: AbortController;
  maxTokens?: number;
  maxCompletionTokens?: number;
  reasoningEffort?: number;
}

export interface RetrievalChainParams {
  llm: BaseLanguageModel;
  retriever: BaseRetriever;
  options?: {
    returnSourceDocuments?: boolean;
  };
}

export interface ConversationalRetrievalChainParams {
  llm: BaseLanguageModel;
  retriever: BaseRetriever;
  systemMessage: string;
  options?: {
    returnSourceDocuments?: boolean;
    questionGeneratorTemplate?: string;
    qaTemplate?: string;
  };
}

export interface DocumentMetadata {
  author?: string;
  title?: string;
  date?: string;
  [key: string]: any;
}

export interface Document<T = DocumentMetadata> {
  pageContent: string;
  metadata: T;
}

export type ConversationalRetrievalQAChainInput = {
  question: string;
  chat_history: [string, string][];
};

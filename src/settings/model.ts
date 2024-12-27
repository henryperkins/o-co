import { CustomModel, ChatCustomModel, EmbeddingCustomModel, AzureOpenAIDeployment } from "@/types";
import { atom, createStore, useAtomValue } from "jotai";

import { type ChainType } from "@/chainFactory";
import {
  BUILTIN_CHAT_MODELS,
  BUILTIN_EMBEDDING_MODELS,
  DEFAULT_OPEN_AREA,
  DEFAULT_SETTINGS,
  DEFAULT_SYSTEM_PROMPT,
} from "@/constants";

import { updateModelConfig, removeModelConfig } from "@/aiParams";
import { EmbeddingModelProviders } from "@/constants";

export { DEFAULT_SETTINGS };

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
  // Google and TogetherAI API key share this property
  apiKey?: string;
  openAIProxyBaseUrl?: string;
  groqApiKey?: string;
  enableCors?: boolean;
  maxCompletionTokens?: number;
  reasoningEffort?: number;
}

export interface CopilotSettings {
  plusLicenseKey: string;
  openAIApiKey: string;
  openAIOrgId: string;
  huggingfaceApiKey: string;
  cohereApiKey: string;
  anthropicApiKey: string;
  azureOpenAIApiKey: string;
  azureOpenAIApiInstanceName: string;
  azureOpenAIApiDeploymentName: string;
  azureOpenAIApiVersion: string;
  azureOpenAIApiEmbeddingDeploymentName: string;
  azureOpenAIApiDeployments?: AzureOpenAIDeployment[];
  googleApiKey: string;
  openRouterAiApiKey: string;
  defaultChainType: ChainType;
  defaultModelKey: string;
  embeddingModelKey: string;
  temperature: number;
  maxTokens: number;
  contextTurns: number;
  // Do not use this directly, use getSystemPrompt() instead
  userSystemPrompt: string;
  openAIProxyBaseUrl: string;
  openAIEmbeddingProxyBaseUrl: string;
  stream: boolean;
  defaultSaveFolder: string;
  defaultConversationTag: string;
  autosaveChat: boolean;
  customPromptsFolder: string;
  indexVaultToVectorStore: string;
  chatNoteContextPath: string;
  chatNoteContextTags: string[];
  enableIndexSync: boolean;
  debug: boolean;
  enableEncryption: boolean;
  maxSourceChunks: number;
  qaExclusions: string;
  qaInclusions: string;
  groqApiKey: string;
  enabledCommands: Record<string, { enabled: boolean; name: string }>;
  activeModels: ChatCustomModel[];
  activeEmbeddingModels: EmbeddingCustomModel[];
  promptUsageTimestamps: Record<string, number>;
  embeddingRequestsPerSecond: number;
  defaultOpenArea: DEFAULT_OPEN_AREA;
  disableIndexOnMobile: boolean;
  showSuggestedPrompts: boolean;
  numPartitions: number;
  modelConfigs: Record<string, ModelConfig>;
}

export const settingsStore = createStore();
export const settingsAtom = atom<CopilotSettings>(DEFAULT_SETTINGS);

/**
 * Sets the settings in the atom.
 */
export function setSettings(settings: Partial<CopilotSettings>) {
  const newSettings = mergeAllActiveModelsWithCoreModels({
    ...getSettings(),
    ...settings,
  });
  settingsStore.set(settingsAtom, newSettings);
}

/**
 * Sets a single setting in the atom.
 */
export async function updateSetting<K extends keyof CopilotSettings>(
  key: K,
  value: CopilotSettings[K]
) {
  const settings = getSettings();
  await setSettings({ ...settings, [key]: value });
}

/**
 * Gets the settings from the atom. Use this if you don't need to subscribe to
 * changes.
 */
export function getSettings(): Readonly<CopilotSettings> {
  return settingsStore.get(settingsAtom);
}

/**
 * Resets the settings to the default values.
 */
export function resetSettings(): void {
  const defaultSettingsWithBuiltIns = {
    ...DEFAULT_SETTINGS,
    activeModels: BUILTIN_CHAT_MODELS.map((model) => ({
      ...model,
      enabled: true,
    })),
    activeEmbeddingModels: BUILTIN_EMBEDDING_MODELS.map((model) => ({
      ...model,
      enabled: true,
      provider: model.provider as EmbeddingModelProviders, // Ensure the provider is of type EmbeddingModelProviders
    })),
  };
  setSettings(defaultSettingsWithBuiltIns);
}

/**
 * Subscribes to changes in the settings atom.
 */
export function subscribeToSettingsChange(callback: () => void): () => void {
  return settingsStore.sub(settingsAtom, callback);
}

/**
 * Hook to get the settings value from the atom.
 */
export function useSettingsValue(): Readonly<CopilotSettings> {
  return useAtomValue(settingsAtom, {
    store: settingsStore,
  });
}

/**
 * Sanitizes the settings to ensure they are valid.
 * Note: This will be better handled by Zod in the future.
 */
export function sanitizeSettings(settings: CopilotSettings): CopilotSettings {
  // If settings is null/undefined, use DEFAULT_SETTINGS
  const settingsToSanitize = settings || DEFAULT_SETTINGS;
  const sanitizedSettings: CopilotSettings = { ...settingsToSanitize };

  // Stuff in settings are string even when the interface has number type!
  const temperature = Number(settingsToSanitize.temperature);
  sanitizedSettings.temperature = isNaN(temperature) ? DEFAULT_SETTINGS.temperature : temperature;

  const maxTokens = Number(settingsToSanitize.maxTokens);
  sanitizedSettings.maxTokens = isNaN(maxTokens) ? DEFAULT_SETTINGS.maxTokens : maxTokens;

  const contextTurns = Number(settingsToSanitize.contextTurns);
  sanitizedSettings.contextTurns = isNaN(contextTurns)
    ? DEFAULT_SETTINGS.contextTurns
    : contextTurns;

  return sanitizedSettings;
}

export function getSystemPrompt(): string {
  const userPrompt = getSettings().userSystemPrompt;
  return userPrompt ? `${DEFAULT_SYSTEM_PROMPT}\n\n${userPrompt}` : DEFAULT_SYSTEM_PROMPT;
}

function mergeAllActiveModelsWithCoreModels(settings: CopilotSettings): CopilotSettings {
  settings.activeModels = mergeActiveModels(
    settings.activeModels,
    BUILTIN_CHAT_MODELS
  ) as ChatCustomModel[];
  settings.activeEmbeddingModels = mergeActiveModels(
    settings.activeEmbeddingModels,
    BUILTIN_EMBEDDING_MODELS
  ) as EmbeddingCustomModel[];
  return settings;
}

function mergeActiveModels(
  existingActiveModels: CustomModel[],
  builtInModels: CustomModel[]
): CustomModel[] {
  const modelMap = new Map<string, CustomModel>();

  // Create a unique key for each model, it's model (name + provider)
  const getModelKey = (model: CustomModel) => `${model.name}|${model.provider}`;

  // Add core models to the map
  builtInModels
    .filter((model) => model.core)
    .forEach((model) => {
      modelMap.set(getModelKey(model), { ...model, core: true });
    });

  // Add or update existing models in the map
  existingActiveModels.forEach((model) => {
    const key = getModelKey(model);
    const existingModel = modelMap.get(key);
    if (existingModel) {
      // If it's a built-in model, preserve the built-in status
      modelMap.set(key, {
        ...model,
        isBuiltIn: existingModel.isBuiltIn || model.isBuiltIn,
      });
    } else {
      modelMap.set(key, model);
    }
  });

  return Array.from(modelMap.values());
}

// Add new helper functions
export const addAzureDeployment = async (deployment: AzureOpenAIDeployment): Promise<void> => {
  const settings = getSettings();
  if (!validateDeployment(deployment)) {
    throw new Error("Invalid deployment configuration");
  }

  const deployments = settings.azureOpenAIApiDeployments || [];
  const updatedDeployments = [...deployments, deployment];
  await updateSetting("azureOpenAIApiDeployments", updatedDeployments);
};

export const updateAzureDeployment = async (
  index: number,
  deployment: AzureOpenAIDeployment
): Promise<void> => {
  const settings = getSettings();
  const deployments = [...(settings.azureOpenAIApiDeployments || [])];

  if (index >= 0 && index < deployments.length) {
    deployments[index] = deployment;
    await updateSetting("azureOpenAIApiDeployments", deployments);
    await updateDeploymentConfig(deployment);
  }
};

export const removeAzureDeployment = async (index: number): Promise<void> => {
  const settings = getSettings();
  const deployments = settings.azureOpenAIApiDeployments || [];
  const deploymentToRemove = deployments[index];
  const updatedDeployments = deployments.filter((_, i) => i !== index);
  await updateSetting("azureOpenAIApiDeployments", updatedDeployments);

  // Remove the associated modelConfig
  if (deploymentToRemove) {
    const modelKey = `o1-preview|${deploymentToRemove.deploymentName}`;
    await removeModelConfig(modelKey);
  }
};

export const validateDeployment = (deployment: AzureOpenAIDeployment): boolean => {
  return Boolean(
    deployment.deploymentName?.trim() &&
      deployment.instanceName?.trim() &&
      deployment.apiKey?.trim() &&
      deployment.apiVersion?.trim()
  );
};

export const updateDeploymentConfig = async (deployment: AzureOpenAIDeployment): Promise<void> => {
  const modelKey = `o1-preview|${deployment.deploymentName}`;

  await updateModelConfig(modelKey, {
    azureOpenAIApiKey: deployment.apiKey,
    azureOpenAIApiInstanceName: deployment.instanceName,
    azureOpenAIApiDeploymentName: deployment.deploymentName,
    azureOpenAIApiVersion: deployment.apiVersion,
  });
};

// Add detailed error messages and suggestions for fixing issues when invalid configurations are detected
export function validateModelConfig(config: Partial<ModelConfig>): void {
  if (config.maxCompletionTokens !== undefined && config.maxCompletionTokens < 0) {
    const errorMessage = "maxCompletionTokens must be a non-negative number";
    console.error(errorMessage);
    throw new Error(errorMessage);
  }

  if (config.reasoningEffort !== undefined && (config.reasoningEffort < 0 || config.reasoningEffort > 100)) {
    const errorMessage = "reasoningEffort must be a number between 0 and 100";
    console.error(errorMessage);
    throw new Error(errorMessage);
  }
}

// Provide a log of configuration changes and errors for users to review their configuration history and identify issues
export function logConfigurationChange(modelKey: string, newConfig: Partial<ModelConfig>): void {
  console.log(`Configuration change for modelKey: ${modelKey}`, newConfig);
}

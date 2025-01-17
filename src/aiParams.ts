import { ChainType } from "@/chainFactory";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { TFile } from "obsidian";

import { atom, useAtom } from "jotai";
import { settingsAtom, settingsStore, getSettings, setSettings } from "@/settings/model";
import { ChatModelProviders } from "./constants";
import { merge } from "lodash";
import { ModelConfig } from "@/types";

const userModelKeyAtom = atom<string | null>(null);
const modelKeyAtom = atom(
  (get) => {
    const userValue = get(userModelKeyAtom);
    if (userValue !== null) {
      return userValue;
    }
    const modelKey = get(settingsAtom).defaultModelKey;
    const isAzure = modelKey.startsWith(ChatModelProviders.AZURE_OPENAI);
    const isO1Preview = modelKey.startsWith("o1-preview");
    if (isAzure && !isO1Preview) {
      return modelKey;
    }
    const deploymentName = isO1Preview ? modelKey.split("|")[1] : "";
    const settings = getSettings();
    const defaultDeployment = settings.azureOpenAIApiDeployments?.[0];
    if (isO1Preview && !deploymentName && defaultDeployment) {
      return `${modelKey}|${defaultDeployment.deploymentName}`;
    }
    return modelKey;
  },
  (get, set, newValue) => {
    set(userModelKeyAtom, newValue);
  }
);

const userChainTypeAtom = atom<ChainType | null>(null);
const chainTypeAtom = atom(
  (get) => {
    const userValue = get(userChainTypeAtom);
    if (userValue !== null) {
      return userValue;
    }
    return get(settingsAtom).defaultChainType;
  },
  (get, set, newValue) => {
    set(userChainTypeAtom, newValue);
  }
);

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

export function setModelKey(modelKey: string) {
  settingsStore.set(modelKeyAtom, modelKey);
}

export function getModelKey(): string {
  return settingsStore.get(modelKeyAtom);
}

export function subscribeToModelKeyChange(callback: () => void): () => void {
  return settingsStore.sub(modelKeyAtom, callback);
}

export function useModelKey() {
  return useAtom(modelKeyAtom, {
    store: settingsStore,
  });
}

export function getChainType(): ChainType {
  return settingsStore.get(chainTypeAtom);
}

export function setChainType(chainType: ChainType) {
  settingsStore.set(chainTypeAtom, chainType);
}

export function subscribeToChainTypeChange(callback: () => void): () => void {
  return settingsStore.sub(chainTypeAtom, callback);
}

export function useChainType() {
  return useAtom(chainTypeAtom, {
    store: settingsStore,
  });
}

export function updateModelConfig(modelKey: string, newConfig: Partial<ModelConfig>) {
  const settings = getSettings();
  const modelConfigs = { ...settings.modelConfigs };

  console.log("updateModelConfig - modelKey:", modelKey);
  console.log("updateModelConfig - newConfig:", newConfig);

  if (modelKey.startsWith("o1-preview")) {
    const deploymentName = modelKey.split("|")[1] || "";
    const deployment = settings.azureOpenAIApiDeployments?.find(
      (d) => d.deploymentName === deploymentName && d.isEnabled
    );

    console.log("updateModelConfig - deployment:", deployment);

    if (deployment) {
      newConfig = merge({}, newConfig, {
        azureOpenAIApiKey: deployment.apiKey,
        azureOpenAIApiInstanceName: deployment.instanceName,
        azureOpenAIApiDeploymentName: deployment.deploymentName,
        azureOpenAIApiVersion: deployment.apiVersion,
      });
    } else {
      console.warn(`updateModelConfig - Azure deployment not found for model key: ${modelKey}`);
      // Decide if you want to throw an error, use default values, or simply not update the config
    }
  }

  // Validate maxCompletionTokens
  if (newConfig.maxCompletionTokens !== undefined && newConfig.maxCompletionTokens < 0) {
    const errorMessage = "maxCompletionTokens must be a non-negative number";
    console.error(errorMessage);
    throw new Error(errorMessage);
  }

  // Validate reasoningEffort
  if (newConfig.reasoningEffort !== undefined && (newConfig.reasoningEffort < 0 || newConfig.reasoningEffort > 100)) {
    const errorMessage = "reasoningEffort must be a number between 0 and 100";
    console.error(errorMessage);
    throw new Error(errorMessage);
  }

  modelConfigs[modelKey] = merge({}, modelConfigs[modelKey], newConfig);
  console.log("updateModelConfig - updated modelConfigs:", modelConfigs);
  setSettings({ ...settings, modelConfigs });
}

export async function removeModelConfig(modelKey: string): Promise<void> {
  const settings = getSettings();
  const modelConfigs = { ...settings.modelConfigs };

  if (modelConfigs.hasOwnProperty(modelKey)) {
    delete modelConfigs[modelKey];
    await setSettings({ ...settings, modelConfigs });
    console.log(`Model config removed for key: ${modelKey}`);
  } else {
    console.warn(`No model config found for key: ${modelKey}`);
  }
}

export function validateAzureDeployment(deployment: AzureDeployment): boolean {
  return (
    deployment.deploymentName.trim() !== "" &&
    deployment.instanceName.trim() !== "" &&
    deployment.apiKey.trim() !== "" &&
    deployment.apiVersion.trim() !== ""
  );
}

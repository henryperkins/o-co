import { CustomModel, getModelKey, setModelKey } from "@/aiParams";
import { BUILTIN_CHAT_MODELS, ChatModelProviders } from "../constants";
import { getDecryptedKey } from "../encryptionService";
import { getSettings, subscribeToSettingsChange } from "../settings/model";
import { safeFetch } from "../utils";
import { HarmBlockThreshold, HarmCategory } from "@google/generative-ai";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatCohere } from "@langchain/cohere";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatGroq } from "@langchain/groq";
import { ChatOllama } from "@langchain/ollama";
import { ChatOpenAI } from "@langchain/openai";
import { Notice } from "obsidian";
import { ModelConfig } from "@/types"; // Import directly from types
type ChatConstructorType = new (config: any) => BaseChatModel;

const CHAT_PROVIDER_CONSTRUCTORS: Record<ChatModelProviders, ChatConstructorType> = {
  [ChatModelProviders.OPENAI]: ChatOpenAI,
  [ChatModelProviders.AZURE_OPENAI]: ChatOpenAI,
  [ChatModelProviders.ANTHROPIC]: ChatAnthropic,
  [ChatModelProviders.COHEREAI]: ChatCohere,
  [ChatModelProviders.GOOGLE]: ChatGoogleGenerativeAI,
  [ChatModelProviders.OPENROUTERAI]: ChatOpenAI,
  [ChatModelProviders.OLLAMA]: ChatOllama,
  [ChatModelProviders.LM_STUDIO]: ChatOpenAI,
  [ChatModelProviders.GROQ]: ChatGroq,
  [ChatModelProviders.OPENAI_FORMAT]: ChatOpenAI,
  [ChatModelProviders.THIRD_PARTY_OPENAI]: ChatOpenAI, // Added THIRD_PARTY_OPENAI
};

export default class ChatModelManager {
  private static instance: ChatModelManager;
  private static chatModel: BaseChatModel | null;
  private static modelMap: Record<
    string,
    {
      hasApiKey: boolean;
      AIConstructor: ChatConstructorType;
      vendor: string;
    }
  >;

  private readonly providerApiKeyMap: Record<ChatModelProviders, () => string> = {
    [ChatModelProviders.OPENAI]: () => getSettings().openAIApiKey,
    [ChatModelProviders.GOOGLE]: () => getSettings().googleApiKey,
    [ChatModelProviders.AZURE_OPENAI]: () => getSettings().azureOpenAIApiKey,
    [ChatModelProviders.ANTHROPIC]: () => getSettings().anthropicApiKey,
    [ChatModelProviders.COHEREAI]: () => getSettings().cohereApiKey,
    [ChatModelProviders.OPENROUTERAI]: () => getSettings().openRouterAiApiKey,
    [ChatModelProviders.GROQ]: () => getSettings().groqApiKey,
    [ChatModelProviders.OLLAMA]: () => "default-key",
    [ChatModelProviders.LM_STUDIO]: () => "default-key",
    [ChatModelProviders.OPENAI_FORMAT]: () => "default-key",
    [ChatModelProviders.THIRD_PARTY_OPENAI]: () => "", // Added THIRD_PARTY_OPENAI
  } as const;

  private constructor() {
    this.buildModelMap();
    subscribeToSettingsChange(() => {
      this.buildModelMap();
      this.validateCurrentModel();
    });
  }

  static getInstance(): ChatModelManager {
    if (!ChatModelManager.instance) {
      ChatModelManager.instance = new ChatModelManager();
    }
    return ChatModelManager.instance;
  }

  private getModelConfig(customModel: CustomModel): ModelConfig {
    const settings = getSettings();
    const modelKey = getModelKey();
    const modelConfig = settings.modelConfigs[modelKey] || {};
    const isO1Model = customModel.name.startsWith("o1");

    // Base config
    const baseConfig: ModelConfig = {
      modelName: customModel.name,
      temperature: modelConfig.temperature ?? 0.7,
      streaming: true,
      maxRetries: 3,
      maxConcurrency: 3,
      maxTokens: modelConfig.maxTokens,
      maxCompletionTokens: modelConfig.maxCompletionTokens,
      reasoningEffort: modelConfig.reasoningEffort,
      enableCors: customModel.enableCors,
    };

    let azureDeploymentName = "";
    if (modelKey.startsWith("o1-preview")) {
      azureDeploymentName = modelKey.split("|")[1] || "";
    }

    let azureApiKey = "";
    let azureInstanceName = "";
    let azureApiVersion = "";

    if (azureDeploymentName) {
      const deployment = settings.azureOpenAIApiDeployments?.find(
        (d) => d.deploymentName === azureDeploymentName
      );
      if (deployment) {
        azureApiKey = deployment.apiKey;
        azureInstanceName = deployment.instanceName;
        azureApiVersion = deployment.apiVersion;
      }
    }

    // Fix the type definition - use Record instead of complex mapped type
    const providerConfig = {
      [ChatModelProviders.OPENAI]: {
        modelName: customModel.name,
        openAIApiKey: getDecryptedKey(customModel.apiKey || settings.openAIApiKey),
        configuration: {
          baseURL: customModel.baseUrl,
          fetch: customModel.enableCors ? safeFetch : undefined,
        },
        openAIOrgId: getDecryptedKey(settings.openAIOrgId),
        ...this.handleOpenAIExtraArgs(
          isO1Model,
          modelConfig.maxTokens,
          modelConfig.temperature,
          modelConfig.maxCompletionTokens,
          modelConfig.reasoningEffort
        ),
      },
      [ChatModelProviders.ANTHROPIC]: {
        anthropicApiKey: getDecryptedKey(customModel.apiKey || settings.anthropicApiKey),
        modelName: customModel.name,
        anthropicApiUrl: customModel.baseUrl,
        clientOptions: {
          // Required to bypass CORS restrictions
          defaultHeaders: {
            "anthropic-dangerous-direct-browser-access": "true",
          },
          fetch: customModel.enableCors ? safeFetch : undefined,
        },
      },
      [ChatModelProviders.AZURE_OPENAI]: {
        azureOpenAIApiKey: getDecryptedKey(azureApiKey || settings.azureOpenAIApiKey),
        azureOpenAIApiInstanceName: azureInstanceName || settings.azureOpenAIApiInstanceName,
        azureOpenAIApiDeploymentName: azureDeploymentName || settings.azureOpenAIApiDeploymentName,
        azureOpenAIApiVersion: azureApiVersion || settings.azureOpenAIApiVersion,
        configuration: {
          baseURL: customModel.baseUrl,
          fetch: customModel.enableCors ? safeFetch : undefined,
        },
        ...this.handleOpenAIExtraArgs(
          modelKey.startsWith("o1-preview"),
          modelConfig.maxTokens,
          modelConfig.temperature,
          modelConfig.maxCompletionTokens,
          modelConfig.reasoningEffort
        ),
      },
      [ChatModelProviders.COHEREAI]: {
        apiKey: getDecryptedKey(customModel.apiKey || settings.cohereApiKey),
        model: customModel.name,
      },
      [ChatModelProviders.GOOGLE]: {
        apiKey: getDecryptedKey(customModel.apiKey || settings.googleApiKey),
        modelName: customModel.name,
        safetySettings: [
          {
            category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
            threshold: HarmBlockThreshold.BLOCK_NONE,
          },
          {
            category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
            threshold: HarmBlockThreshold.BLOCK_NONE,
          },
          {
            category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
            threshold: HarmBlockThreshold.BLOCK_NONE,
          },
          {
            category: HarmCategory.HARM_CATEGORY_HARASSMENT,
            threshold: HarmBlockThreshold.BLOCK_NONE,
          },
        ],
        baseUrl: customModel.baseUrl,
      },
      [ChatModelProviders.OPENROUTERAI]: {
        modelName: customModel.name,
        openAIApiKey: getDecryptedKey(customModel.apiKey || settings.openRouterAiApiKey),
        configuration: {
          baseURL: customModel.baseUrl || "https://openrouter.ai/api/v1",
          fetch: customModel.enableCors ? safeFetch : undefined,
        },
      },
      [ChatModelProviders.GROQ]: {
        apiKey: getDecryptedKey(customModel.apiKey || settings.groqApiKey),
        modelName: customModel.name,
      },
      [ChatModelProviders.OLLAMA]: {
        // ChatOllama has `model` instead of `modelName`!!
        model: customModel.name,
        // @ts-ignore
        apiKey: customModel.apiKey || "default-key",
        // MUST NOT use /v1 in the baseUrl for ollama
        baseUrl: customModel.baseUrl || "http://localhost:11434",
      },
      [ChatModelProviders.LM_STUDIO]: {
        modelName: customModel.name,
        openAIApiKey: customModel.apiKey || "default-key",
        configuration: {
          baseURL: customModel.baseUrl || "http://localhost:1234/v1",
          fetch: customModel.enableCors ? safeFetch : undefined,
        },
      },
      [ChatModelProviders.OPENAI_FORMAT]: {
        modelName: customModel.name,
        openAIApiKey: getDecryptedKey(customModel.apiKey || settings.openAIApiKey),
        configuration: {
          baseURL: customModel.baseUrl,
          fetch: customModel.enableCors ? safeFetch : undefined,
          dangerouslyAllowBrowser: true,
        },
        ...this.handleOpenAIExtraArgs(
          isO1Model,
          modelConfig.maxTokens,
          modelConfig.temperature,
          modelConfig.maxCompletionTokens,
          modelConfig.reasoningEffort
        ),
      },
    };

    const selectedProviderConfig =
      providerConfig[customModel.provider as keyof typeof providerConfig] || {};

    const modelConfigToReturn = {
      ...baseConfig,
      ...selectedProviderConfig,
      temperature:
        "temperature" in selectedProviderConfig ? (selectedProviderConfig.temperature ?? 1) : 1, // Default to 1 if undefined
    };

    console.log("getModelConfig returning:", modelConfigToReturn); // Log the complete config
    return modelConfigToReturn;
  }

  private handleOpenAIExtraArgs(
    isO1Model: boolean,
    maxTokens: number | undefined,
    temperature: number | undefined,
    maxCompletionTokens: number | undefined,
    reasoningEffort: number | undefined
  ) {
    return isO1Model
      ? {
          maxCompletionTokens: maxCompletionTokens,
          temperature: 1, // Fixed temperature for o1 models
          extraParams: {
            reasoning_effort: reasoningEffort,
          },
        }
      : {
          maxTokens: maxTokens,
          temperature: temperature ?? 0.7,
        };
  }

  // Build a map of modelKey to model config
  public buildModelMap() {
    const activeModels = getSettings().activeModels;
    ChatModelManager.modelMap = {};
    const modelMap = ChatModelManager.modelMap;

    const allModels = activeModels ?? BUILTIN_CHAT_MODELS;

    allModels.forEach((model) => {
      if (model.enabled) {
        if (!Object.values(ChatModelProviders).includes(model.provider as ChatModelProviders)) {
          console.warn(`Unknown provider: ${model.provider} for model: ${model.name}`);
          return;
        }

        const constructor = this.getProviderConstructor(model);
        const getDefaultApiKey = this.providerApiKeyMap[model.provider as ChatModelProviders];

        const apiKey = model.apiKey || getDefaultApiKey();
        const modelKey = `${model.name}|${model.provider}`;
        modelMap[modelKey] = {
          hasApiKey: Boolean(model.apiKey || apiKey),
          AIConstructor: constructor,
          vendor: model.provider,
        };
      }
    });
  }

  getProviderConstructor(model: CustomModel): ChatConstructorType {
    const constructor: ChatConstructorType =
      CHAT_PROVIDER_CONSTRUCTORS[model.provider as ChatModelProviders];
    if (!constructor) {
      console.warn(`Unknown provider: ${model.provider} for model: ${model.name}`);
      throw new Error(`Unknown provider: ${model.provider} for model: ${model.name}`);
    }
    return constructor;
  }

  getChatModel(): BaseChatModel {
    if (!ChatModelManager.chatModel) {
      throw new Error("No valid chat model available. Please check your API key settings.");
    }
    return ChatModelManager.chatModel;
  }

  setChatModel(model: CustomModel): void {
    const modelKey = `${model.name}|${model.provider}`;
    if (!ChatModelManager.modelMap.hasOwnProperty(modelKey)) {
      throw new Error(`No model found for: ${modelKey}`);
    }

    // Create and return the appropriate model
    const selectedModel = ChatModelManager.modelMap[modelKey];
    if (!selectedModel.hasApiKey) {
      const errorMessage = `API key is not provided for the model: ${modelKey}. Model switch failed.`;
      new Notice(errorMessage);
      // Stop execution and deliberate fail the model switch
      throw new Error(errorMessage);
    }

    const modelConfig = this.getModelConfig(model);

    setModelKey(`${model.name}|${model.provider}`);
    try {
      const newModelInstance = new selectedModel.AIConstructor({
        ...modelConfig,
      });
      // Set the new model
      ChatModelManager.chatModel = newModelInstance;
    } catch (error) {
      console.error(error);
      new Notice(`Error creating model: ${modelKey}`);
    }
  }

  validateChatModel(chatModel: BaseChatModel): boolean {
    if (chatModel === undefined || chatModel === null) {
      return false;
    }
    return true;
  }

  async countTokens(inputStr: string): Promise<number> {
    return ChatModelManager.chatModel?.getNumTokens(inputStr) ?? 0;
  }

  private validateCurrentModel(): void {
    if (!ChatModelManager.chatModel) return;

    const currentModelKey = getModelKey();
    if (!currentModelKey) return;

    // Get the model configuration
    const selectedModel = ChatModelManager.modelMap[currentModelKey];

    // If API key is missing or model doesn't exist in map
    if (!selectedModel?.hasApiKey) {
      // Clear the current chat model
      ChatModelManager.chatModel = null;
      console.log("Failed to reinitialize model due to missing API key");
    }
  }

  async ping(model: CustomModel): Promise<boolean> {
    const tryPing = async (enableCors: boolean) => {
      const modelToTest = { ...model, enableCors };
      const modelConfig = this.getModelConfig(modelToTest);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { streaming, temperature, ...pingConfig } = modelConfig;
      pingConfig.maxTokens = 10;

      const testModel = new (this.getProviderConstructor(modelToTest))(pingConfig);
      await testModel.invoke([{ role: "user", content: "hello" }], {
        timeout: 3000,
      });
    };

    try {
      // First try without CORS
      await tryPing(false);
      return true;
    } catch (error) {
      console.log("First ping attempt failed, trying with CORS...");
      try {
        // Second try with CORS
        await tryPing(true);
        new Notice(
          "Connection successful, but requires CORS to be enabled. Please enable CORS for this model once you add it above."
        );

        return true;
      } catch (error) {
        console.error("Chat model ping failed:", error);
        throw error;
      }
    }
  }
}

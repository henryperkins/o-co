import { CustomModel, ChatCustomModel, getModelKey, ModelConfig, setModelKey } from "@/types";
import { BUILTIN_CHAT_MODELS, ChatModelProviders } from "@/constants";
import { getDecryptedKey } from "@/encryptionService";
import { getSettings, subscribeToSettingsChange, updateSetting } from "@/settings/model";
import { safeFetch } from "@/utils";
import axios from "axios";
import { HarmBlockThreshold, HarmCategory } from "@google/generative-ai";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatCohere } from "@langchain/cohere";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatGroq } from "@langchain/groq";
import { ChatOllama } from "@langchain/ollama";
import { ChatOpenAI } from "@langchain/openai";
import { Notice } from "obsidian";

type ChatConstructorType = new (config: any) => BaseChatModel;

const CHAT_PROVIDER_CONSTRUCTORS = {
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
} as const;

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
  } as const;

  private constructor() {
    this.buildModelMap();
    this.createDefaultAzureModels();
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

  /**
   * Fetch deployments from Azure OpenAI to dynamically identify models linked to deployments.
   */
  private async getDeploymentModelDetails(
    instanceName: string,
    apiKey: string,
    apiVersion = "2023-06-01-preview" // Removed explicit type annotation
  ): Promise<Record<string, string>> {
    const endpoint = `https://${instanceName}.openai.azure.com/openai/deployments?api-version=${apiVersion}`;
    try {
      const response = await axios.get(endpoint, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      // Parse deployments and build a mapping: deploymentName -> modelName
      const deployments: { name: string; model: string }[] = response.data.data;
      const deploymentModelMap: Record<string, string> = {};
      deployments.forEach(({ name, model }) => {
        deploymentModelMap[name] = model;
      });
      return deploymentModelMap;
    } catch (error) {
      console.error("Error fetching Azure deployments:", error?.response?.data || error);
      throw new Error("Failed to fetch Azure OpenAI deployments. Please check your configuration.");
    }
  }

  private async createDefaultAzureModels() {
    const settings = getSettings();
    if (!settings.azureOpenAIApiDeployments || settings.azureOpenAIApiDeployments.length === 0)
      return;

    for (const deployment of settings.azureOpenAIApiDeployments) {
      try {
        const deploymentModels = await this.getDeploymentModelDetails(
          deployment.instanceName,
          deployment.apiKey,
          deployment.apiVersion
        );

        if (deploymentModels && deploymentModels[deployment.deploymentName]) {
          const modelName = deploymentModels[deployment.deploymentName];
          const modelKey = `${modelName}|${ChatModelProviders.AZURE_OPENAI}`;

          // Check if the model already exists
          if (
            !settings.activeModels.find((model) => `${model.name}|${model.provider}` === modelKey)
          ) {
            const newModel = {
              name: modelName,
              provider: ChatModelProviders.AZURE_OPENAI,
              enabled: true,
              isBuiltIn: false,
              core: false,
              apiKey: deployment.apiKey,
              baseUrl: `https://${deployment.instanceName}.openai.azure.com/`,
            };

            // Update settings to include the new model
            updateSetting("activeModels", [...settings.activeModels, newModel]);
            console.log(
              `Created default model "${modelName}" for deployment "${deployment.deploymentName}"`
            );
          } else {
            console.log(
              `Default model "${modelName}" already exists for deployment "${deployment.deploymentName}"`
            );
          }
        }
      } catch (error) {
        console.error(
          `Failed to create default model for deployment ${deployment.deploymentName}:`,
          error
        );
      }
    }
  }

  private getModelConfig(customModel: CustomModel): ModelConfig {
    const settings = getSettings();
    const modelKey = getModelKey(customModel); // Pass the appropriate model object
    const modelConfig = settings.modelConfigs[modelKey] || {};

    // Check if the model starts with "o1"
    const modelName = customModel.name;
    const isO1Model = modelName.startsWith("o1");
    const isPreviewModel = modelName.startsWith("o1-preview");

    const baseConfig: ModelConfig = {
      modelName: modelName,
      temperature: modelConfig.temperature || settings.temperature,
      streaming: true,
      maxRetries: 3,
      maxConcurrency: 3,
      maxTokens: modelConfig.maxTokens,
      maxCompletionTokens: modelConfig.maxCompletionTokens,
      reasoningEffort: isO1Model ? modelConfig.reasoningEffort : undefined,
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
    const providerConfig: Record<ChatModelProviders, any> = {
      [ChatModelProviders.OPENAI]: {
        modelName: modelName,
        openAIApiKey: getDecryptedKey(customModel.apiKey || settings.openAIApiKey),
        configuration: {
          baseURL: customModel.baseUrl,
          fetch: customModel.enableCors ? safeFetch : undefined,
        },
        openAIOrgId: getDecryptedKey(settings.openAIOrgId),
        ...this.handleOpenAIExtraArgs(
          isO1Model,
          isPreviewModel,
          modelConfig.maxTokens,
          modelConfig.temperature,
          modelConfig.maxCompletionTokens,
          modelConfig.reasoningEffort
        ),
      },
      [ChatModelProviders.ANTHROPIC]: {
        anthropicApiKey: getDecryptedKey(customModel.apiKey || settings.anthropicApiKey),
        modelName: modelName,
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
          isO1Model,
          isPreviewModel,
          modelConfig.maxTokens,
          modelConfig.temperature,
          modelConfig.maxCompletionTokens,
          modelConfig.reasoningEffort
        ),
      },
      [ChatModelProviders.COHEREAI]: {
        apiKey: getDecryptedKey(customModel.apiKey || settings.cohereApiKey),
        model: modelName,
      },
      [ChatModelProviders.GOOGLE]: {
        apiKey: getDecryptedKey(customModel.apiKey || settings.googleApiKey),
        modelName: modelName,
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
        modelName: modelName,
        openAIApiKey: getDecryptedKey(customModel.apiKey || settings.openRouterAiApiKey),
        configuration: {
          baseURL: customModel.baseUrl || "https://openrouter.ai/api/v1",
          fetch: customModel.enableCors ? safeFetch : undefined,
        },
      },
      [ChatModelProviders.GROQ]: {
        apiKey: getDecryptedKey(customModel.apiKey || settings.groqApiKey),
        modelName: modelName,
      },
      [ChatModelProviders.OLLAMA]: {
        // ChatOllama has `model` instead of `modelName`!!
        model: modelName,
        // @ts-ignore
        apiKey: customModel.apiKey || "default-key",
        // MUST NOT use /v1 in the baseUrl for ollama
        baseUrl: customModel.baseUrl || "http://localhost:11434",
      },
      [ChatModelProviders.LM_STUDIO]: {
        modelName: modelName,
        openAIApiKey: customModel.apiKey || "default-key",
        configuration: {
          baseURL: customModel.baseUrl || "http://localhost:1234/v1",
          fetch: customModel.enableCors ? safeFetch : undefined,
        },
      },
      [ChatModelProviders.OPENAI_FORMAT]: {
        modelName: modelName,
        openAIApiKey: getDecryptedKey(customModel.apiKey || settings.openAIApiKey),
        configuration: {
          baseURL: customModel.baseUrl,
          fetch: customModel.enableCors ? safeFetch : undefined,
          dangerouslyAllowBrowser: true,
        },
        ...this.handleOpenAIExtraArgs(
          isO1Model,
          isPreviewModel,
          modelConfig.maxTokens,
          modelConfig.temperature,
          modelConfig.maxCompletionTokens,
          modelConfig.reasoningEffort
        ),
      },
    };

    const selectedProviderConfig =
      providerConfig[customModel.provider as keyof typeof providerConfig] || {};

    return { ...baseConfig, ...selectedProviderConfig };
  }

  private handleOpenAIExtraArgs(
    isO1Model: boolean,
    isPreviewModel: boolean,
    maxTokens: number | undefined,
    temperature: number | undefined,
    maxCompletionTokens: number | undefined,
    reasoningEffort: number | undefined
  ) {
    if (isO1Model) {
      return {
        maxCompletionTokens: maxCompletionTokens,
        temperature: 1,
        extraParams: {
          reasoning_effort: reasoningEffort,
        },
      };
    }
    if (isPreviewModel) {
      return {
        maxCompletionTokens: maxCompletionTokens,
        temperature: 1,
      };
    }

    return {
      maxTokens: maxTokens,
      temperature: temperature,
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

  getProviderConstructor(model: ChatCustomModel): ChatConstructorType {
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

  setChatModel(model: ChatCustomModel): void {
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

    const currentModelKey = getModelKey(customModel); // Pass the appropriate model object
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

import { EmbeddingCustomModel, getModelKey } from "@/types";
import { getDecryptedKey } from "@/encryptionService";
import { CustomError } from "@/error";
import { getSettings, subscribeToSettingsChange } from "@/settings/model";
import { safeFetch } from "@/utils";
import { CohereEmbeddings } from "@langchain/cohere";
import { Embeddings } from "@langchain/core/embeddings";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { OllamaEmbeddings } from "@langchain/ollama";
import { OpenAIEmbeddings } from "@langchain/openai";
import { Notice } from "obsidian";
import { BREVILABS_API_BASE_URL, EmbeddingModelProviders } from "@/constants";

// --- Constants ---
const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";
const DEFAULT_LM_STUDIO_BASE_URL = "http://localhost:1234/v1";
const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_API_KEY = "";

// --- Types and Interfaces ---
type EmbeddingConstructorType = new (config: any) => Embeddings;

interface BaseConfig {
  maxRetries: number;
  maxConcurrency: number;
}

interface BaseProviderConfig {
  type: EmbeddingModelProviders;
  modelName: string;
  maxRetries: number;
  maxConcurrency: number;
}

interface OpenAIProviderConfig extends BaseProviderConfig {
  type:
    | EmbeddingModelProviders.OPENAI
    | EmbeddingModelProviders.COPILOT_PLUS
    | EmbeddingModelProviders.LM_STUDIO
    | EmbeddingModelProviders.OPENAI_FORMAT
    | EmbeddingModelProviders.THIRD_PARTY_OPENAI;
  openAIApiKey: string;
  timeout?: number;
  configuration?: {
    baseURL?: string;
    fetch?: typeof safeFetch;
    dangerouslyAllowBrowser?: boolean;
  };
}

interface CohereAIProviderConfig extends BaseProviderConfig {
  type: EmbeddingModelProviders.COHEREAI;
  apiKey?: string;
}

interface GoogleProviderConfig extends BaseProviderConfig {
  type: EmbeddingModelProviders.GOOGLE;
  apiKey?: string;
}

interface AzureDeployment {
  apiKey: string;
  instanceName: string;
  deploymentName: string;
  apiVersion: string;
  isEnabled: boolean;
}

interface AzureProviderConfig extends BaseProviderConfig {
  type: EmbeddingModelProviders.AZURE_OPENAI;
  azureOpenAIApiKey?: string;
  azureOpenAIApiInstanceName?: string;
  azureOpenAIApiDeploymentName?: string;
  azureOpenAIApiVersion?: string;
  configuration?: {
    baseURL?: string;
    fetch?: typeof safeFetch;
  };
}

interface OllamaProviderConfig extends BaseProviderConfig {
  type: EmbeddingModelProviders.OLLAMA;
  baseUrl?: string;
}

type ProviderConfig =
  | OpenAIProviderConfig
  | CohereAIProviderConfig
  | GoogleProviderConfig
  | AzureProviderConfig
  | OllamaProviderConfig;

type ProviderConfigMap = Partial<Record<EmbeddingModelProviders, ProviderConfig>>;

export interface Settings {
  azureOpenAIApiDeployments?: Array<AzureDeployment>;
  azureOpenAIApiInstanceName?: string;
  azureOpenAIApiDeploymentName?: string;
  azureOpenAIApiVersion?: string;
  plusLicenseKey?: string;
  openAIApiKey: string;
  cohereApiKey?: string;
  googleApiKey?: string;
  fireworksApiKey?: string;
}

const EMBEDDING_PROVIDER_CONSTRUCTORS: Record<EmbeddingModelProviders, EmbeddingConstructorType> = {
  [EmbeddingModelProviders.COPILOT_PLUS]: OpenAIEmbeddings,
  [EmbeddingModelProviders.OPENAI]: OpenAIEmbeddings,
  [EmbeddingModelProviders.COHEREAI]: CohereEmbeddings,
  [EmbeddingModelProviders.GOOGLE]: GoogleGenerativeAIEmbeddings,
  [EmbeddingModelProviders.AZURE_OPENAI]: OpenAIEmbeddings,
  [EmbeddingModelProviders.OLLAMA]: OllamaEmbeddings,
  [EmbeddingModelProviders.LM_STUDIO]: OpenAIEmbeddings,
  [EmbeddingModelProviders.THIRD_PARTY_OPENAI]: OpenAIEmbeddings,
  [EmbeddingModelProviders.OPENAI_FORMAT]: OpenAIEmbeddings,
} as const;

// --- EmbeddingManager Class ---
export default class EmbeddingManager {
  private activeEmbeddingModels: EmbeddingCustomModel[] = [];
  private static instance: EmbeddingManager;
  private static embeddingModel: Embeddings;
  private static modelMap: Record<
    string,
    {
      hasApiKey: boolean;
      EmbeddingConstructor: EmbeddingConstructorType;
      vendor: EmbeddingModelProviders;
    }
  > = {};

  private readonly providerApiKeyMap: Record<EmbeddingModelProviders, () => string> = {
    [EmbeddingModelProviders.OPENAI]: () => getSettings().openAIApiKey,
    [EmbeddingModelProviders.COHEREAI]: () => getSettings().cohereApiKey,
    [EmbeddingModelProviders.GOOGLE]: () => getSettings().googleApiKey,
    [EmbeddingModelProviders.AZURE_OPENAI]: () => getSettings().azureOpenAIApiKey,
    [EmbeddingModelProviders.OLLAMA]: () => "default-key",
    [EmbeddingModelProviders.LM_STUDIO]: () => "default-key",
    [EmbeddingModelProviders.THIRD_PARTY_OPENAI]: () => "",
    [EmbeddingModelProviders.OPENAI_FORMAT]: () => "",
    [EmbeddingModelProviders.COPILOT_PLUS]: () => getSettings().plusLicenseKey,
  } as const;

  private constructor() {
    this.initialize();
    subscribeToSettingsChange(() => this.initialize());
  }

  private initialize() {
    const settings = getSettings();
    this.activeEmbeddingModels = settings.activeEmbeddingModels;
    this.buildModelMap(this.activeEmbeddingModels);
  }

  static getInstance(): EmbeddingManager {
    if (!EmbeddingManager.instance) {
      EmbeddingManager.instance = new EmbeddingManager();
    }
    return EmbeddingManager.instance;
  }

  getProviderConstructor(model: EmbeddingCustomModel): EmbeddingConstructorType {
    if (!this.validateProvider(model.provider)) {
      throw new Error(`Unknown provider: ${model.provider} for model: ${model.name}`);
    }
    const constructor = EMBEDDING_PROVIDER_CONSTRUCTORS[model.provider];
    if (!constructor) {
      throw new Error(`Unknown provider: ${model.provider} for model: ${model.name}`);
    }
    return constructor;
  }

  private buildModelMap(activeEmbeddingModels: EmbeddingCustomModel[]) {
    EmbeddingManager.modelMap = {};
    const modelMap = EmbeddingManager.modelMap;

    activeEmbeddingModels.forEach((model) => {
      if (!this.validateProvider(model.provider)) {
        console.warn(`Invalid provider: ${model.provider} for embedding model: ${model.name}`);
        return; // Skip invalid models
      }
      if (model.enabled) {
        const constructor = this.getProviderConstructor(model);
        const apiKey =
          model.apiKey ||
          (this.providerApiKeyMap[model.provider]
            ? this.providerApiKeyMap[model.provider]()
            : undefined);

        const modelKey = `${model.name}|${model.provider}`;
        modelMap[modelKey] = {
          hasApiKey: Boolean(apiKey),
          EmbeddingConstructor: constructor,
          vendor: model.provider,
        };
      }
    });
  }

  static getModelName(embeddingsInstance: Embeddings): string {
    const emb = embeddingsInstance as any;
    if ("model" in emb && emb.model) {
      return emb.model as string;
    } else if ("modelName" in emb && emb.modelName) {
      return emb.modelName as string;
    } else {
      throw new Error(
        `Embeddings instance missing model or modelName properties: ${embeddingsInstance}`
      );
    }
  }

  private getActiveEmbeddingModel(): EmbeddingCustomModel {
    if (this.activeEmbeddingModels.length > 0) {
      return this.activeEmbeddingModels[0]; // Use the first available model
    }
    throw new Error("No active embedding models found.");
  }

  getEmbeddingsAPI(): Embeddings {
    const customModel = this.getActiveEmbeddingModel();
    const modelKey = getModelKey(customModel);

    if (!EmbeddingManager.modelMap.hasOwnProperty(modelKey)) {
      throw new CustomError(`No embedding model found for: ${modelKey}`);
    }

    const selectedModel = EmbeddingManager.modelMap[modelKey];
    if (!selectedModel.hasApiKey) {
      throw new CustomError(`API key is not provided for the embedding model: ${modelKey}`);
    }

    const config = this.getModelConfig(customModel);

    try {
      EmbeddingManager.embeddingModel = new selectedModel.EmbeddingConstructor(config);
      return EmbeddingManager.embeddingModel;
    } catch (error: any) {
      throw new CustomError(`Error creating embedding model: ${modelKey}. ${error.message}`);
    }
  }

  private getAzureConfig(
    customModel: EmbeddingCustomModel,
    settings: Settings
  ): AzureDeployment | undefined {
    if (customModel.provider !== EmbeddingModelProviders.AZURE_OPENAI) {
      return undefined;
    }

    const modelKey = getModelKey(customModel);
    let azureDeployment: AzureDeployment | undefined;

    if (modelKey.startsWith("o1-preview")) {
      const deploymentName = modelKey.split("|")[1] || "";
      azureDeployment = settings.azureOpenAIApiDeployments?.find(
        (d) => d.deploymentName === deploymentName && d.isEnabled
      );
    } else {
      azureDeployment = settings.azureOpenAIApiDeployments?.find((d) => d.isEnabled);
    }

    if (!azureDeployment) {
      const errorMessage =
        "Azure deployment not found for the selected model key. Please check your settings.";
      console.error(errorMessage, getModelKey(customModel));
      throw new Error(errorMessage);
    }

    return azureDeployment;
  }

  private getModelConfig(customModel: EmbeddingCustomModel): ProviderConfig {
    if (!this.validateProvider(customModel.provider)) {
      throw new CustomError(`Provider ${customModel.provider} is not recognized`);
    }
    const settings = getSettings();

    const baseConfig: BaseConfig = {
      maxRetries: 3,
      maxConcurrency: 3,
    };

    const azureDeployment = this.getAzureConfig(customModel, settings);

    // Validate Azure deployment configuration
    this.validateAzureConfig(azureDeployment);

    const providerConfigs: Partial<ProviderConfigMap> = {
      [EmbeddingModelProviders.COPILOT_PLUS]: {
        type: EmbeddingModelProviders.COPILOT_PLUS,
        ...baseConfig,
        modelName: customModel.name,
        openAIApiKey: getDecryptedKey(settings.plusLicenseKey) || DEFAULT_API_KEY,
        timeout: 10000,
        configuration: {
          baseURL: BREVILABS_API_BASE_URL,
          fetch: customModel.enableCors ? safeFetch : undefined,
        },
      },
      [EmbeddingModelProviders.AZURE_OPENAI]: {
        type: EmbeddingModelProviders.AZURE_OPENAI,
        ...baseConfig,
        modelName: customModel.name,
        azureOpenAIApiKey: azureDeployment?.apiKey
          ? getDecryptedKey(azureDeployment.apiKey)
          : undefined,
        azureOpenAIApiInstanceName: azureDeployment?.instanceName,
        azureOpenAIApiDeploymentName: azureDeployment?.deploymentName,
        azureOpenAIApiVersion: azureDeployment?.apiVersion,
        configuration: {
          baseURL: customModel.baseUrl,
          fetch: customModel.enableCors ? safeFetch : undefined,
        },
      },
      [EmbeddingModelProviders.OPENAI]: {
        type: EmbeddingModelProviders.OPENAI,
        ...baseConfig,
        modelName: customModel.name,
        openAIApiKey:
          getDecryptedKey(customModel.apiKey || settings.openAIApiKey) || DEFAULT_API_KEY,
      },
      [EmbeddingModelProviders.COHEREAI]: {
        type: EmbeddingModelProviders.COHEREAI,
        ...baseConfig,
        modelName: customModel.name,
        apiKey: getDecryptedKey(customModel.apiKey || settings.cohereApiKey) || DEFAULT_API_KEY,
      },
      [EmbeddingModelProviders.GOOGLE]: {
        type: EmbeddingModelProviders.GOOGLE,
        ...baseConfig,
        modelName: customModel.name,
        apiKey: getDecryptedKey(settings.googleApiKey) || DEFAULT_API_KEY,
      },
      [EmbeddingModelProviders.OLLAMA]: {
        type: EmbeddingModelProviders.OLLAMA,
        ...baseConfig,
        modelName: customModel.name,
        baseUrl: customModel.baseUrl || DEFAULT_OLLAMA_BASE_URL,
      },
      [EmbeddingModelProviders.LM_STUDIO]: {
        type: EmbeddingModelProviders.LM_STUDIO,
        ...baseConfig,
        modelName: customModel.name,
        openAIApiKey: DEFAULT_API_KEY,
        configuration: {
          baseURL: customModel.baseUrl || DEFAULT_LM_STUDIO_BASE_URL,
          fetch: customModel.enableCors ? safeFetch : undefined,
        },
      },
      [EmbeddingModelProviders.OPENAI_FORMAT]: {
        type: EmbeddingModelProviders.OPENAI_FORMAT,
        ...baseConfig,
        modelName: customModel.name,
        openAIApiKey: getDecryptedKey(customModel.apiKey || DEFAULT_API_KEY),
        configuration: {
          baseURL: customModel.baseUrl || DEFAULT_OPENAI_BASE_URL,
          fetch: customModel.enableCors ? safeFetch : undefined,
          dangerouslyAllowBrowser: true,
        },
      },
      [EmbeddingModelProviders.THIRD_PARTY_OPENAI]: {
        type: EmbeddingModelProviders.THIRD_PARTY_OPENAI,
        ...baseConfig,
        modelName: customModel.name,
        openAIApiKey: getDecryptedKey(customModel.apiKey || DEFAULT_API_KEY),
        configuration: {
          baseURL: customModel.baseUrl,
          fetch: customModel.enableCors ? safeFetch : undefined,
          dangerouslyAllowBrowser: true,
        },
      },
    };

    const selectedConfig = providerConfigs[customModel.provider];
    if (!selectedConfig) {
      throw new CustomError(`Provider ${customModel.provider} is not recognized`);
    }

    this.validateModelConfig(customModel, settings);
    return selectedConfig as ProviderConfig;
  }

  private validateProvider(provider: string): provider is EmbeddingModelProviders {
    return Object.values(EmbeddingModelProviders).includes(provider as EmbeddingModelProviders);
  }

  private validateAzureConfig(deployment?: AzureDeployment): void {
    if (!deployment) {
      return;
    }

    const requiredFields: Array<keyof AzureDeployment> = [
      "instanceName",
      "deploymentName",
      "apiVersion",
    ];

    const missingFields = requiredFields.filter((field) => !deployment[field]);
    if (missingFields.length > 0) {
      throw new CustomError(
        `Missing required Azure configuration fields: ${missingFields.join(", ")}`
      );
    }
  }

  private validateModelConfig(customModel: EmbeddingCustomModel, settings: Settings): void {
    if (customModel.provider === EmbeddingModelProviders.OPENAI_FORMAT) {
      if (!customModel.baseUrl) {
        throw new Error("Base URL is required for OpenAI Format models.");
      }
    }
    if (customModel.provider === EmbeddingModelProviders.AZURE_OPENAI) {
      if (
        !settings.azureOpenAIApiInstanceName ||
        !settings.azureOpenAIApiDeploymentName ||
        !settings.azureOpenAIApiVersion
      ) {
        throw new Error(
          "Azure instance name, deployment name, and API version are required for Azure models."
        );
      }
    }
    // Add other validations here
  }

  async ping(model: EmbeddingCustomModel): Promise<boolean> {
    const tryPing = async (enableCors: boolean) => {
      const modelToTest = { ...model, enableCors };
      const config = this.getModelConfig(modelToTest);
      const testModel = new (this.getProviderConstructor(modelToTest))(config);
      await testModel.embedQuery("test");
    };

    try {
      await tryPing(false); // First attempt without CORS
      return true;
    } catch {
      try {
        await tryPing(true); // Retry with CORS enabled
        new Notice("Connection successful, but requires CORS. Please enable CORS for this model.");
        return true;
      } catch (error) {
        console.error("Embedding model ping failed:", error);
        throw error;
      }
    }
  }
}

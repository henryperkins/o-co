import { EmbeddingCustomModel, getModelKey, EmbeddingModelProviders } from "@/types";
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

type EmbeddingConstructorType = new (config: any) => Embeddings;

const EMBEDDING_PROVIDER_CONSTRUCTORS = {
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

type EmbeddingProviderConstructorMap = typeof EMBEDDING_PROVIDER_CONSTRUCTORS;

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
  >;

  private readonly providerApiKeyMap: Record<EmbeddingModelProviders, () => string> = {
    [EmbeddingModelProviders.COPILOT_PLUS]: () => getSettings().plusLicenseKey,
    [EmbeddingModelProviders.OPENAI]: () => getSettings().openAIApiKey,
    [EmbeddingModelProviders.COHEREAI]: () => getSettings().cohereApiKey,
    [EmbeddingModelProviders.GOOGLE]: () => getSettings().googleApiKey,
    [EmbeddingModelProviders.AZURE_OPENAI]: () => getSettings().azureOpenAIApiKey,
    [EmbeddingModelProviders.OLLAMA]: () => "default-key",
    [EmbeddingModelProviders.LM_STUDIO]: () => "default-key",
    [EmbeddingModelProviders.OPENAI_FORMAT]: () => "",
    [EmbeddingModelProviders.THIRD_PARTY_OPENAI]: () => "",
  } as const;

  private constructor() {
    this.initialize();
    subscribeToSettingsChange(() => this.initialize());
  }

  private initialize() {
    const settings = getSettings(); // Fetch updated settings
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
    const provider = model.provider as EmbeddingModelProviders;
    const constructor = EMBEDDING_PROVIDER_CONSTRUCTORS[provider];
    if (!constructor) {
      throw new Error(`Unknown provider: ${model.provider} for model: ${model.name}`);
    }
    return constructor;
  }

  private buildModelMap(activeEmbeddingModels: EmbeddingCustomModel[]) {
    EmbeddingManager.modelMap = {};
    const modelMap = EmbeddingManager.modelMap;

    activeEmbeddingModels.forEach((model) => {
      if (
        !Object.values(EmbeddingModelProviders).includes(model.provider as EmbeddingModelProviders)
      ) {
        console.warn(`Invalid provider: ${model.provider} for embedding model: ${model.name}`);
        return; // Skip invalid models
      }

      if (model.enabled) {
        const constructor = this.getProviderConstructor(model);
        const apiKey =
          model.apiKey || this.providerApiKeyMap[model.provider as EmbeddingModelProviders]();

        const modelKey = `${model.name}|${model.provider}`;
        modelMap[modelKey] = {
          hasApiKey: Boolean(apiKey),
          EmbeddingConstructor: constructor,
          vendor: model.provider as EmbeddingModelProviders,
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
    const modelKey = getModelKey(this.getActiveEmbeddingModel()); // Pass a valid model instance

    if (!EmbeddingManager.modelMap.hasOwnProperty(modelKey)) {
      throw new CustomError(`No embedding model found for: ${modelKey}`);
    }

    const selectedModel = EmbeddingManager.modelMap[modelKey];
    if (!selectedModel.hasApiKey) {
      throw new CustomError(`API key is not provided for the embedding model: ${modelKey}`);
    }

    const customModel = this.getActiveEmbeddingModel();
    const config = this.getModelConfig(modelKey, customModel);

    try {
      EmbeddingManager.embeddingModel = new selectedModel.EmbeddingConstructor(config);
      return EmbeddingManager.embeddingModel;
    } catch (error) {
      throw new CustomError(`Error creating embedding model: ${modelKey}. ${error.message}`);
    }
  }

  private getModelConfig(modelKey: string, customModel: EmbeddingCustomModel): any {
    const settings = getSettings();
    const modelName = customModel.name;

    const baseConfig = {
      maxRetries: 3,
      maxConcurrency: 3,
    };

    // Handle provider-specific configurations
    const providerConfig: {
      [K in keyof EmbeddingProviderConstructorMap]: ConstructorParameters<
        EmbeddingProviderConstructorMap[K]
      >[0];
    } = {
      [EmbeddingModelProviders.COPILOT_PLUS]: {
        modelName,
        apiKey: getDecryptedKey(settings.plusLicenseKey),
        timeout: 10000,
        configuration: {
          baseURL: BREVILABS_API_BASE_URL,
          fetch: customModel.enableCors ? safeFetch : undefined,
        },
      },
      [EmbeddingModelProviders.OPENAI]: {
        modelName,
        openAIApiKey: getDecryptedKey(customModel.apiKey || settings.openAIApiKey),
        timeout: 10000,
        configuration: {
          baseURL: customModel.baseUrl,
          fetch: customModel.enableCors ? safeFetch : undefined,
        },
      },
      [EmbeddingModelProviders.COHEREAI]: {
        model: modelName,
        apiKey: getDecryptedKey(customModel.apiKey || settings.cohereApiKey),
      },
      [EmbeddingModelProviders.GOOGLE]: {
        modelName,
        apiKey: getDecryptedKey(settings.googleApiKey),
      },
      [EmbeddingModelProviders.AZURE_OPENAI]: {
        modelName,
        azureOpenAIApiKey: getDecryptedKey(customModel.apiKey || settings.azureOpenAIApiKey),
        azureOpenAIApiInstanceName: settings.azureOpenAIApiInstanceName,
        azureOpenAIApiDeploymentName: settings.azureOpenAIApiDeploymentName,
        azureOpenAIApiVersion: settings.azureOpenAIApiVersion,
        configuration: {
          baseURL: customModel.baseUrl,
          fetch: customModel.enableCors ? safeFetch : undefined,
        },
      },
      [EmbeddingModelProviders.OLLAMA]: {
        baseUrl: customModel.baseUrl || "http://localhost:11434",
        model: modelName,
      },
      [EmbeddingModelProviders.LM_STUDIO]: {
        modelName,
        configuration: {
          baseURL: customModel.baseUrl || "http://localhost:1234/v1",
          fetch: customModel.enableCors ? safeFetch : undefined,
        },
      },
      [EmbeddingModelProviders.OPENAI_FORMAT]: {
        modelName,
        openAIApiKey: getDecryptedKey(customModel.apiKey || ""),
        configuration: {
          baseURL: customModel.baseUrl,
          fetch: customModel.enableCors ? safeFetch : undefined,
          dangerouslyAllowBrowser: true,
        },
      },
      [EmbeddingModelProviders.THIRD_PARTY_OPENAI]: {
        modelName,
        openAIApiKey: getDecryptedKey(customModel.apiKey || ""),
        configuration: {
          baseURL: customModel.baseUrl,
          fetch: customModel.enableCors ? safeFetch : undefined,
          dangerouslyAllowBrowser: true,
        },
      },
    };

    const selectedProviderConfig =
      providerConfig[customModel.provider as EmbeddingModelProviders] || {};

    return { ...baseConfig, ...selectedProviderConfig };
  }

  async ping(model: EmbeddingCustomModel): Promise<boolean> {
    const tryPing = async (enableCors: boolean) => {
      const modelToTest = { ...model, enableCors };
      const modelKey = getModelKey(modelToTest); // Use a valid model key
      const config = this.getModelConfig(modelKey, modelToTest);
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

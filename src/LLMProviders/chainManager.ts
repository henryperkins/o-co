import {
  getChainType,
  getModelKey,
  SetChainOptions,
  setChainType,
  subscribeToChainTypeChange,
  subscribeToModelKeyChange,
} from "@/aiParams";
import ChainFactory, { ChainType, Document } from "@/chainFactory";
import { BUILTIN_CHAT_MODELS, USER_SENDER, VAULT_VECTOR_STORE_STRATEGY } from "@/constants";
import {
  ChainRunner,
  CopilotPlusChainRunner,
  LLMChainRunner,
  VaultQAChainRunner,
} from "@/LLMProviders/chainRunner";
import { HybridRetriever } from "@/search/hybridRetriever";
import VectorStoreManager from "@/search/vectorStoreManager";
import { getSettings, getSystemPrompt, subscribeToSettingsChange } from "@/settings/model";
import { ChatMessage } from "@/sharedState";
import { findCustomModel, isSupportedChain } from "@/utils";
import {
  ChatPromptTemplate,
  HumanMessagePromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { RunnableSequence } from "@langchain/core/runnables";
import { App, Notice } from "obsidian";
import { formatDateTime } from "@/utils";
import { FormattedDateTime } from "@/utils";
import { BrevilabsClient } from "./brevilabsClient";
import ChatModelManager from "./chatModelManager";
import EmbeddingsManager from "./embeddingManager";
import MemoryManager from "./memoryManager";
import PromptManager from "./promptManager";
import { Embeddings } from "@langchain/core/embeddings";
import { Orama } from "orama";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { Callbacks } from "@langchain/core/callbacks/manager";
import { CustomChatModelCallOptions } from "@/types";

interface ModelValidation {
  isValid: boolean;
  error?: string;
}

interface ChainManagerOptions extends SetChainOptions {
  debug?: boolean;
  callbacks?: Callbacks;
}

export const isChainManagerOptions = (obj: unknown): obj is ChainManagerOptions => {
  const options = obj as ChainManagerOptions;
  return (
    typeof obj === "object" &&
    obj !== null &&
    (options.debug === undefined || typeof options.debug === "boolean") &&
    (options.callbacks === undefined || typeof options.callbacks === "object")
  );
};

export default class ChainManager {
  private static chain: RunnableSequence | undefined;
  private static retrievalChain: RunnableSequence | undefined;
  private readonly debug: boolean;

  public app: App;
  public vectorStoreManager: VectorStoreManager;
  public chatModelManager: ChatModelManager;
  public memoryManager: MemoryManager;
  public embeddingsManager: EmbeddingsManager;
  public promptManager: PromptManager;
  public brevilabsClient: BrevilabsClient;
  public static retrievedDocuments: Document[] = [];
  private options: ChainManagerOptions | undefined;
  private callbacks: Callbacks | undefined;

  constructor(app: App, vectorStoreManager: VectorStoreManager, brevilabsClient: BrevilabsClient) {
    // Instantiate singletons
    this.app = app;
    this.vectorStoreManager = vectorStoreManager;
    this.memoryManager = MemoryManager.getInstance();
    this.chatModelManager = ChatModelManager.getInstance();
    this.embeddingsManager = EmbeddingsManager.getInstance();
    this.promptManager = PromptManager.getInstance();
    this.brevilabsClient = brevilabsClient;
    this.debug = getSettings().debug;
    this.createChainWithNewModel();
    subscribeToModelKeyChange(() => this.createChainWithNewModel());
    subscribeToChainTypeChange(() =>
      this.createChainWithOptions({
        refreshIndex:
          getSettings().indexVaultToVectorStore === VAULT_VECTOR_STORE_STRATEGY.ON_MODE_SWITCH &&
          (getChainType() === ChainType.VAULT_QA_CHAIN ||
            getChainType() === ChainType.COPILOT_PLUS_CHAIN),
      })
    );
    subscribeToSettingsChange(() => this.createChainWithNewModel());
  }

  static getChain(): RunnableSequence | undefined {
    return ChainManager.chain;
  }

  static getRetrievalChain(): RunnableSequence | undefined {
    return ChainManager.retrievalChain;
  }

  private validateChainType(chainType: ChainType): void {
    if (!Object.values(ChainType).includes(chainType)) {
      throw new Error(`Unsupported chain type: ${chainType}`);
    }
  }

  private validateChatModel() {
    if (!this.chatModelManager.validateChatModel(this.chatModelManager.getChatModel())) {
      const errorMsg =
        "Chat model is not initialized properly, check your API key in Copilot setting and make sure you have API access.";
      new Notice(errorMsg);
      throw new Error(errorMsg);
    }
  }

  private validateChainInitialization() {
    if (!ChainManager.chain || !isSupportedChain(ChainManager.chain)) {
      console.error("Chain is not initialized properly, re-initializing chain: ", getChainType());
      this.createChainWithOptions();
    }
  }

  static storeRetrieverDocuments(documents: Document[]) {
    ChainManager.retrievedDocuments = documents;
  }

  /**
   * Update the active model and create a new chain with the specified model
   * name.
   */
  createChainWithNewModel(): void {
    let newModelKey = getModelKey();
    try {
      let customModel = findCustomModel(newModelKey, getSettings().activeModels);
      if (!customModel) {
        // Reset default model if no model is found
        console.error("Resetting default model. No model configuration found for: ", newModelKey);
        customModel = BUILTIN_CHAT_MODELS[0];
        newModelKey = customModel.name + "|" + customModel.provider;
      }
      this.chatModelManager.setChatModel(customModel);
      // Must update the chatModel for chain because ChainFactory always
      // retrieves the old chain without the chatModel change if it exists!
      // Create a new chain with the new chatModel
      this.createChainWithOptions();
      console.log(`Setting model to ${newModelKey}`);
    } catch (error) {
      console.error("createChainWithNewModel failed: ", error);
      console.log("modelKey:", newModelKey);
      new Notice(`Error creating model: ${newModelKey}. Please check your API key settings.`);
    }
  }

  private validateModelOptions(options: CustomChatModelCallOptions): ModelValidation {
    try {
      if (options.timeout && (options.timeout < 1 || options.timeout > 120000)) {
        return { isValid: false, error: "Timeout must be between 1 and 120000" };
      }
      return { isValid: true };
    } catch (error) {
      return { isValid: false, error: `Model options validation failed: ${error.message}` };
    }
  }

  private handleChainError(error: Error, context: string): never {
    const errorMessage = `Chain error in ${context}: ${error.message}`;
    console.error(errorMessage);
    new Notice(errorMessage);
    throw new Error(errorMessage);
  }

  private cleanup(): void {
    try {
      if (this.options?.abortController) {
        this.options.abortController.abort();
      }
      ChainManager.chain = undefined;
      ChainManager.retrievalChain = undefined;
      this.callbacks = undefined;
    } catch (error) {
      console.error("Cleanup failed:", error);
    }
  }

  private getModelConfig() {
    const modelKey = getModelKey();
    const settings = getSettings();
    return settings.modelConfigs[modelKey] || {};
  }

  private getCallbacks(): Callbacks | undefined {
    return undefined;
  }

  private async createChainWithOptions(options: ChainManagerOptions = {}): Promise<void> {
    try {
      this.options = options;
      this.callbacks = this.getCallbacks();

      await this.trackPerformance(async () => {
        await this.setChain(getChainType(), {
          ...options,
          callbacks: this.callbacks,
        });
      }, "createChainWithOptions");
    } catch (error) {
      console.error("[ChainManager] Failed to create chain:", error);
      throw error;
    }
  }

  private async trackPerformance<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    const start = performance.now();
    try {
      return await operation();
    } finally {
      const duration = performance.now() - start;
      if (this.debug) {
        console.log(`[ChainManager] ${operationName} took ${duration}ms`);
      }
    }
  }

  async setChain(chainType: ChainType, options: ChainManagerOptions = {}): Promise<void> {
    try {
      // Validate chat model
      if (!this.chatModelManager.validateChatModel(this.chatModelManager.getChatModel())) {
        this.handleChainError(new Error("No chat model set"), "setChain");
      }

      this.validateChainType(chainType);

      const chatModel = this.chatModelManager.getChatModel();
      const memory = this.memoryManager.getMemory();
      const chatPrompt = this.promptManager.getChatPrompt();
      const modelConfig = this.getModelConfig();

      switch (chainType) {
        case ChainType.LLM_CHAIN: {
          ChainManager.chain = ChainFactory.createNewLLMChain({
            llm: chatModel,
            memory: memory,
            prompt: options.prompt || chatPrompt,
            abortController: options.abortController,
            maxTokens: modelConfig.maxCompletionTokens,
          }) as RunnableSequence;

          setChainType(ChainType.LLM_CHAIN);
          break;
        }

        case ChainType.VAULT_QA_CHAIN: {
          const { embeddingsAPI } = await this.initializeQAChain(options);

          const retriever = new HybridRetriever(
            this.vectorStoreManager.dbOps,
            this.app.vault,
            chatModel,
            embeddingsAPI,
            this.brevilabsClient,
            {
              minSimilarityScore: 0.01,
              maxK: getSettings().maxSourceChunks,
              salientTerms: [],
            },
            getSettings().debug
          );

          // Create new conversational retrieval chain
          ChainManager.retrievalChain = ChainFactory.createConversationalRetrievalChain(
            {
              llm: chatModel,
              retriever: retriever,
              systemMessage: getSystemPrompt(),
            },
            ChainManager.storeRetrieverDocuments.bind(ChainManager),
            getSettings().debug
          );

          setChainType(ChainType.VAULT_QA_CHAIN);
          if (getSettings().debug) {
            console.log("New Vault QA chain with hybrid retriever created for entire vault");
            console.log("Set chain:", ChainType.VAULT_QA_CHAIN);
          }
          break;
        }

        case ChainType.COPILOT_PLUS_CHAIN: {
          await this.initializeQAChain(options);

          const modelOptions: CustomChatModelCallOptions = {
            timeout: 120000,
            streaming: true,
            callbacks: options.callbacks,
          };

          // Validate and apply model options
          const validation = this.validateModelOptions(modelOptions);
          if (!validation.isValid) {
            this.handleChainError(new Error(validation.error), "model options");
          }

          const bindOptions: any = {
            ...modelOptions,
          };

          if (options.abortController) {
            bindOptions.signal = options.abortController.signal;
          }

          if (!modelConfig.modelName?.startsWith("o1-")) {
            bindOptions.maxTokens = modelConfig.maxCompletionTokens;
          }

          if (modelConfig.temperature !== undefined) {
            bindOptions.temperature = modelConfig.temperature;
          }

          if (modelConfig.reasoningEffort !== undefined) {
            bindOptions.configuration = {
              headers: {
                "Helicone-Property-ReasoningEffort": modelConfig.reasoningEffort,
              },
            };
          }

          try {
            const configuredLLM = chatModel.bind(bindOptions) as BaseChatModel;

            ChainManager.chain = ChainFactory.createNewLLMChain({
              llm: configuredLLM,
              memory,
              prompt: options.prompt || chatPrompt,
              abortController: options.abortController,
            });

            setChainType(ChainType.COPILOT_PLUS_CHAIN);
          } catch (error) {
            this.handleChainError(error, "chain configuration");
          }
          break;
        }

        default:
          this.handleChainError(new Error(`Unsupported chain type: ${chainType}`), "chain type");
      }
    } catch (error) {
      this.handleChainError(error, "setChain");
    }
  }

  private getChainRunner(): ChainRunner {
    const chainType = getChainType();
    switch (chainType) {
      case ChainType.LLM_CHAIN:
        return new LLMChainRunner(this);
      case ChainType.VAULT_QA_CHAIN:
        return new VaultQAChainRunner(this);
      case ChainType.COPILOT_PLUS_CHAIN:
        return new CopilotPlusChainRunner(this);
      default:
        throw new Error(`Unsupported chain type: ${chainType}`);
    }
  }

  private async initializeQAChain(
    options: SetChainOptions
  ): Promise<{ embeddingsAPI: Embeddings; db: Orama<any> }> {
    let embeddingsAPI: Embeddings;
    try {
      embeddingsAPI = this.embeddingsManager.getEmbeddingsAPI();
    } catch (error) {
      console.error("Failed to get embeddings API:", error);
      new Notice("Failed to get embeddings API. Please check your embedding settings.");
      throw new Error("Failed to get embeddings API. Please check your embedding settings.");
    }

    if (!embeddingsAPI) {
      new Notice("Embeddings API is not available. Please check your settings.");
      throw new Error("Embeddings API is not available. Please check your settings.");
    }

    const db = (await this.vectorStoreManager.getOrInitializeDb(
      embeddingsAPI
    )) as unknown as Orama<any>; // Ensure proper initialization
    if (!db || typeof db !== "object") {
      throw new Error("Failed to initialize Orama database. Please check your configuration.");
    }

    // Handle index refresh if needed
    if (options.refreshIndex) {
      await this.vectorStoreManager.indexVaultToVectorStore();
    }

    return { embeddingsAPI, db }; // Return the object
  }

  async runChain(
    userMessage: ChatMessage,
    abortController: AbortController,
    updateCurrentAiMessage: (message: string) => void,
    addMessage: (message: ChatMessage) => void,
    options: {
      debug?: boolean;
      ignoreSystemMessage?: boolean;
      updateLoading?: (loading: boolean) => void;
    } = {}
  ) {
    const { debug = false, ignoreSystemMessage = false } = options;

    if (debug) console.log("==== Step 0: Initial user message ====\n", userMessage);

    try {
      this.validateChatModel();
    } catch (error) {
      addMessage({
        sender: "system",
        message: `Error: ${error.message}`,
        isVisible: true,
        timestamp: formatDateTime(new Date()),
      });
      return;
    }

    try {
      this.validateChainInitialization();
    } catch (error) {
      addMessage({
        sender: "system",
        message: `Error: ${error.message}`,
        isVisible: true,
        timestamp: formatDateTime(new Date()),
      });
      return;
    }

    let chatModel;
    try {
      chatModel = this.chatModelManager.getChatModel();
    } catch (error) {
      addMessage({
        sender: "system",
        message: `Error: ${error.message}`,
        isVisible: true,
        timestamp: formatDateTime(new Date()),
      });
      return;
    }

    const modelName = (chatModel as any).modelName || (chatModel as any).model || "";
    const isO1PreviewModel = modelName === "o1-preview";

    // Handle ignoreSystemMessage
    if (ignoreSystemMessage || isO1PreviewModel) {
      const effectivePrompt = ChatPromptTemplate.fromMessages([
        new MessagesPlaceholder("history"),
        HumanMessagePromptTemplate.fromTemplate("{input}"),
      ]);

      this.createChainWithOptions({
        prompt: effectivePrompt,
      });
    }

    const chainRunner = this.getChainRunner();
    return await chainRunner.run(
      userMessage,
      abortController,
      updateCurrentAiMessage,
      addMessage,
      options
    );
  }

  async updateMemoryWithLoadedMessages(messages: ChatMessage[]) {
    await this.memoryManager.clearChatMemory();
    for (let i = 0; i < messages.length; i += 2) {
      const userMsg = messages[i];
      const aiMsg = messages[i + 1];
      if (userMsg && aiMsg && userMsg.sender === USER_SENDER) {
        await this.memoryManager
          .getMemory()
          .saveContext({ input: userMsg.message }, { output: aiMsg.message });
      }
    }
  }

  public async destroy(): Promise<void> {
    try {
      this.cleanup();
      await this.memoryManager.clearChatMemory();
    } catch (error) {
      console.error("Destroy failed:", error);
    }
  }
}

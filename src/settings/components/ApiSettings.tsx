import { AzureOpenAIDeployment } from "@/types";
import { updateModelConfig } from "@/aiParams";
import {
  updateSetting,
  useSettingsValue,
  validateDeployment,
  addAzureDeployment,
  removeAzureDeployment,
  CopilotSettings,
} from "@/settings/model";
import React, { useEffect, useState } from "react";
import Collapsible from "./Collapsible";
import { Notice, debounce } from "obsidian";
import ApiSetting from "./ApiSetting";

export const ApiSettings: React.FC = () => {
  const settings = useSettingsValue();
  const [azureDeployments, setAzureDeployments] = useState<AzureOpenAIDeployment[]>(
    settings.azureOpenAIApiDeployments || []
  );

  const [defaultAzureDeployment, setDefaultAzureDeployment] = useState<AzureOpenAIDeployment>({
    deploymentName: "",
    instanceName: "",
    apiKey: "",
    apiVersion: "",
    isEnabled: true,
  });

  const [selectedModel] = useState<string>(settings.defaultModelKey);
  const [modelProvider] = useState<string>("openai");
  const [maxCompletionTokens, setMaxCompletionTokens] = useState<number | undefined>(undefined);
  const [reasoningEffort, setReasoningEffort] = useState<number | undefined>(undefined);
  const [selectedDeployment, setSelectedDeployment] = useState<string>("");

  useEffect(() => {
    const currentModel = settings.activeModels.find(
      (model) => `${model.name}|${model.provider}` === `${selectedModel}|${modelProvider}`
    );

    if (currentModel) {
      const modelKey = `${currentModel.name}|${currentModel.provider}`;
      setMaxCompletionTokens(settings.modelConfigs[modelKey]?.maxCompletionTokens);
      setReasoningEffort(settings.modelConfigs[modelKey]?.reasoningEffort);
    }
  }, [selectedModel, settings.activeModels, settings.modelConfigs]);

  useEffect(() => {
    setAzureDeployments(settings.azureOpenAIApiDeployments || []);
  }, [settings.azureOpenAIApiDeployments]);

  const handleAddAzureDeployment = async () => {
    if (!validateDeployment(defaultAzureDeployment)) {
      new Notice("All Azure OpenAI deployment fields are required");
      return;
    }

    const newDeployment = { ...defaultAzureDeployment, isEnabled: true };
    try {
      await addAzureDeployment(newDeployment);
      setDefaultAzureDeployment({
        deploymentName: "",
        instanceName: "",
        apiKey: "",
        apiVersion: "",
        isEnabled: true,
      });
      new Notice("Azure deployment added successfully!");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error occurred";
      console.error("Error adding Azure deployment:", error);
      new Notice(`Error adding Azure deployment: ${message}`);
    }
  };

  const handleRemoveAzureDeployment = async (index: number) => {
    try {
      await removeAzureDeployment(index);
      new Notice("Azure deployment removed successfully!");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error occurred";
      console.error("Error removing Azure deployment:", error);
      new Notice(`Error removing Azure deployment: ${message}`);
    }
  };

  // Debounce the updateModelConfig function
  const debouncedUpdateModelConfig = debounce(updateModelConfig, 300);

  const handleMaxCompletionTokensChange = (value: number) => {
    if (value < 0) {
      new Notice("Max Completion Tokens must be a non-negative number");
      return;
    }

    setMaxCompletionTokens(value);
    let modelKey = `${selectedModel}|${modelProvider}`;
    if (selectedModel === "o1-preview") {
      modelKey = `o1-preview|${selectedDeployment}`;
    }
    debouncedUpdateModelConfig(modelKey, { maxCompletionTokens: value });
  };

  const handleReasoningEffortChange = (value: number) => {
    if (value < 0 || value > 100) {
      new Notice("Reasoning Effort must be a number between 0 and 100");
      return;
    }

    setReasoningEffort(value);
    let modelKey = `${selectedModel}|${modelProvider}`;
    if (selectedModel === "o1-preview") {
      modelKey = `o1-preview|${selectedDeployment}`;
    }
    debouncedUpdateModelConfig(modelKey, { reasoningEffort: value });
  };

  const handleSettingChange = async <K extends keyof CopilotSettings>(
    name: K,
    value: CopilotSettings[K]
  ) => {
    try {
      await updateSetting(name, value);
      new Notice(`${name} updated successfully!`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error occurred";
      console.error(`Error updating ${name}:`, error);
      new Notice(`Error updating ${name}: ${message}`);
    }
  };

  return (
    <div className="settings-container">
      <div className="api-settings-header">
        <h2>API Settings</h2>
        <p>All your API keys are stored locally.</p>
      </div>
      <div className="warning-message">
        Make sure you have access to the model and the correct API key.
        <br />
        If errors occur, please try resetting to default and re-enter the API key.
      </div>
      <div>
        <div>
          <ApiSetting
            title="OpenAI API Key"
            description={
              <>
                You can find your API key at{" "}
                <a
                  href="https://platform.openai.com/api-keys"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  https://platform.openai.com/api-keys
                </a>
              </>
            }
            value={settings.openAIApiKey}
            setValue={(value) =>
              handleSettingChange("openAIApiKey", value as CopilotSettings["openAIApiKey"])
            }
            placeholder="Enter OpenAI API Key"
          />

          <ApiSetting
            title="OpenAI Organization ID (optional)"
            description="Enter OpenAI Organization ID if applicable"
            value={settings.openAIOrgId}
            setValue={(value) =>
              handleSettingChange("openAIOrgId", value as CopilotSettings["openAIOrgId"])
            }
            placeholder="Enter OpenAI Organization ID"
          />
        </div>
        <div className="warning-message">
          <span>If you are a new user, try </span>
          <a
            href="https://platform.openai.com/playground?mode=chat"
            target="_blank"
            rel="noopener noreferrer"
          >
            OpenAI playground
          </a>
          <span> to see if you have correct API access first.</span>
        </div>
      </div>
      <br />
      <Collapsible title="Google API Settings">
        <div>
          <ApiSetting
            title="Google API Key"
            description={
              <>
                If you have Google Cloud, you can get Gemini API key{" "}
                <a
                  href="https://makersuite.google.com/app/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  here
                </a>
                .
                <br />
                Your API key is stored locally and is only used to make requests to Google's
                services.
              </>
            }
            value={settings.googleApiKey}
            setValue={(value) =>
              handleSettingChange("googleApiKey", value as CopilotSettings["googleApiKey"])
            }
            placeholder="Enter Google API Key"
          />
        </div>
      </Collapsible>
      <Collapsible title="Anthropic API Settings">
        <div>
          <ApiSetting
            title="Anthropic API Key"
            description={
              <>
                If you have Anthropic API access, you can get the API key{" "}
                <a
                  href="https://console.anthropic.com/settings/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  here
                </a>
                .
                <br />
                Your API key is stored locally and is only used to make requests to Anthropic's
                services.
              </>
            }
            value={settings.anthropicApiKey}
            setValue={(value) =>
              handleSettingChange("anthropicApiKey", value as CopilotSettings["anthropicApiKey"])
            }
            placeholder="Enter Anthropic API Key"
          />
        </div>
      </Collapsible>
      <Collapsible title="OpenRouter.ai API Settings">
        <div>
          <ApiSetting
            title="OpenRouter AI API Key"
            description={
              <>
                You can get your OpenRouterAI key{" "}
                <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer">
                  here
                </a>
                .
                <br />
                Find models{" "}
                <a href="https://openrouter.ai/models" target="_blank" rel="noopener noreferrer">
                  here
                </a>
                .
              </>
            }
            value={settings.openRouterAiApiKey}
            setValue={(value) =>
              handleSettingChange(
                "openRouterAiApiKey",
                value as CopilotSettings["openRouterAiApiKey"]
              )
            }
            placeholder="Enter OpenRouter AI API Key"
          />
        </div>
      </Collapsible>
      <Collapsible title="Azure OpenAI API Settings">
        <div>
          {azureDeployments.map((deployment, index) => (
            <div key={index} className="api-setting">
              <ApiSetting
                title="Deployment Name"
                value={deployment.deploymentName}
                setValue={(value) =>
                  handleSettingChange(
                    "azureOpenAIApiDeployments",
                    azureDeployments.map((d, i) =>
                      i === index ? { ...d, deploymentName: value } : d
                    ) as CopilotSettings["azureOpenAIApiDeployments"]
                  )
                }
                placeholder="Enter Deployment Name"
              />

              <ApiSetting
                title="Instance Name"
                value={deployment.instanceName}
                setValue={(value) =>
                  handleSettingChange(
                    "azureOpenAIApiDeployments",
                    azureDeployments.map((d, i) =>
                      i === index ? { ...d, instanceName: value } : d
                    ) as CopilotSettings["azureOpenAIApiDeployments"]
                  )
                }
                placeholder="Enter Instance Name"
              />

              <ApiSetting
                title="API Key"
                value={deployment.apiKey}
                setValue={(value) =>
                  handleSettingChange(
                    "azureOpenAIApiDeployments",
                    azureDeployments.map((d, i) =>
                      i === index ? { ...d, apiKey: value } : d
                    ) as CopilotSettings["azureOpenAIApiDeployments"]
                  )
                }
                placeholder="Enter API Key"
                type="password"
              />

              <ApiSetting
                title="API Version"
                value={deployment.apiVersion}
                setValue={(value) =>
                  handleSettingChange(
                    "azureOpenAIApiDeployments",
                    azureDeployments.map((d, i) =>
                      i === index ? { ...d, apiVersion: value } : d
                    ) as CopilotSettings["azureOpenAIApiDeployments"]
                  )
                }
                placeholder="Enter API Version"
              />

              <button className="mod-cta" onClick={() => handleRemoveAzureDeployment(index)}>
                Remove
              </button>
            </div>
          ))}
          <div className="api-setting">
            <ApiSetting
              title="Deployment Name"
              value={defaultAzureDeployment.deploymentName}
              setValue={(value) =>
                setDefaultAzureDeployment({
                  ...defaultAzureDeployment,
                  deploymentName: value,
                })
              }
              placeholder="Enter Deployment Name"
            />

            <ApiSetting
              title="Instance Name"
              value={defaultAzureDeployment.instanceName}
              setValue={(value) =>
                setDefaultAzureDeployment({
                  ...defaultAzureDeployment,
                  instanceName: value,
                })
              }
              placeholder="Enter Instance Name"
            />

            <ApiSetting
              title="API Key"
              value={defaultAzureDeployment.apiKey}
              setValue={(value) =>
                setDefaultAzureDeployment({
                  ...defaultAzureDeployment,
                  apiKey: value,
                })
              }
              placeholder="Enter API Key"
              type="password"
            />

            <ApiSetting
              title="API Version"
              value={defaultAzureDeployment.apiVersion}
              setValue={(value) =>
                setDefaultAzureDeployment({
                  ...defaultAzureDeployment,
                  apiVersion: value,
                })
              }
              placeholder="Enter API Version"
            />

            <button className="mod-cta" onClick={handleAddAzureDeployment}>
              Add Deployment
            </button>
          </div>
        </div>
      </Collapsible>
      <Collapsible title="o1-preview Settings">
        <div>
          <ApiSetting
            title="Max Completion Tokens"
            value={maxCompletionTokens?.toString() || ""}
            setValue={(value) => {
              const numValue = Number(value);
              if (isNaN(numValue) || numValue < 0) {
                new Notice("Max Completion Tokens must be a non-negative number");
                return;
              }
              handleMaxCompletionTokensChange(numValue);
            }}
            placeholder="Enter Max Completion Tokens"
            type="number"
          />

          <select
            value={selectedDeployment}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
              setSelectedDeployment(e.target.value)
            }
            disabled={azureDeployments.length === 0}
          >
            <option value="" disabled>
              Select a deployment
            </option>
            {azureDeployments.map((d) => (
              <option key={d.deploymentName} value={d.deploymentName}>
                {d.deploymentName}
              </option>
            ))}
          </select>

          {azureDeployments.length > 0 && selectedDeployment !== "" && (
            <ApiSetting
              title="Reasoning Effort"
              value={reasoningEffort?.toString() || ""}
              setValue={(value) => {
                const numValue = Number(value);
                if (isNaN(numValue) || numValue < 0 || numValue > 100) {
                  new Notice("Reasoning Effort must be a number between 0 and 100");
                  return;
                }
                handleReasoningEffortChange(numValue);
              }}
              placeholder="Enter Reasoning Effort (0-100)"
              type="number"
            />
          )}
        </div>
      </Collapsible>
      <Collapsible title="Groq API Settings">
        <div>
          <ApiSetting
            title="Groq API Key"
            description={
              <>
                If you have Groq API access, you can get the API key{" "}
                <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer">
                  here
                </a>
                .
                <br />
                Your API key is stored locally and is only used to make requests to Groq's services.
              </>
            }
            value={settings.groqApiKey}
            setValue={(value) =>
              handleSettingChange("groqApiKey", value as CopilotSettings["groqApiKey"])
            }
            placeholder="Enter Groq API Key"
          />
        </div>
      </Collapsible>
      <Collapsible title="Cohere API Settings">
        <ApiSetting
          title="Cohere API Key"
          description={
            <>
              Get your free Cohere API key{" "}
              <a href="https://dashboard.cohere.ai/api-keys" target="_blank" rel="noreferrer">
                here
              </a>
            </>
          }
          value={settings.cohereApiKey}
          setValue={(value) =>
            handleSettingChange("cohereApiKey", value as CopilotSettings["cohereApiKey"])
          }
          placeholder="Enter Cohere API Key"
        />
      </Collapsible>
    </div>
  );
};

export default ApiSettings;

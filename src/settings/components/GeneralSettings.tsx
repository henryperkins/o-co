import { ChatCustomModel } from "@/types";
import { ChainType } from "@/chainFactory";
import { ChatModelProviders, DEFAULT_OPEN_AREA } from "@/constants";
import { setSettings, updateSetting, useSettingsValue, CopilotSettings } from "@/settings/model";
import { App, Notice } from "obsidian";
import React from "react";
import CommandToggleSettings from "./CommandToggleSettings";
import { ModelSettingsComponent } from "./SettingBlocks";

interface GeneralSettingsProps {
  app: App;
}

const GeneralSettings: React.FC<GeneralSettingsProps> = ({ app }) => {
  const settings = useSettingsValue();

  const handleUpdateModels = (models: Array<ChatCustomModel>) => {
    const updatedActiveModels = models.map((model) => ({
      ...model,
      baseUrl: model.baseUrl || "",
      apiKey: model.apiKey || "",
    }));
    updateSetting("activeModels", updatedActiveModels);
  };

  // modelKey is name | provider, e.g. "gpt-4o|openai"
  const onSetDefaultModelKey = async (modelKey: string) => {
    await updateSetting("defaultModelKey", modelKey);
  };

  const onDeleteModel = (modelKey: string) => {
    const [modelName, provider] = modelKey.split("|");
    const updatedActiveModels = settings.activeModels.filter(
      (model) => !(model.name === modelName && model.provider === provider)
    );

    // Check if the deleted model was the default model
    let newDefaultModelKey = settings.defaultModelKey;
    if (modelKey === settings.defaultModelKey) {
      const newDefaultModel = updatedActiveModels.find((model) => model.enabled);
      if (newDefaultModel) {
        newDefaultModelKey = `${newDefaultModel.name}|${newDefaultModel.provider}`;
      } else {
        newDefaultModelKey = "";
      }
    }

    setSettings({
      activeModels: updatedActiveModels,
      defaultModelKey: newDefaultModelKey,
    });
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
    <div>
      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">
            <h2>General Settings</h2>
          </div>
        </div>
      </div>
      <ModelSettingsComponent
        app={app}
        activeModels={settings.activeModels}
        onUpdateModels={handleUpdateModels}
        providers={Object.values(ChatModelProviders)}
        onDeleteModel={onDeleteModel}
        defaultModelKey={settings.defaultModelKey}
        onSetDefaultModelKey={onSetDefaultModelKey}
        isEmbeddingModel={false}
      />
      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">Default Mode</div>
          <div className="setting-item-description">Select the default mode for the chatbot</div>
        </div>
        <div className="setting-item-control">
          <select
            value={settings.defaultChainType}
            onChange={(e) =>
              handleSettingChange(
                "defaultChainType",
                e.target.value as CopilotSettings["defaultChainType"]
              )
            }
          >
            <option value={ChainType.LLM_CHAIN}>Chat</option>
            <option value={ChainType.VAULT_QA_CHAIN}>Vault QA (Basic)</option>
            <option value={ChainType.COPILOT_PLUS_CHAIN}>Copilot Plus (Alpha)</option>
          </select>
        </div>
      </div>

      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">Default Conversation Folder Name</div>
          <div className="setting-item-description">
            The default folder name where chat conversations will be saved. Default is
            'copilot-conversations'
          </div>
        </div>
        <div className="setting-item-control">
          <input
            type="text"
            value={settings.defaultSaveFolder}
            onChange={(e) =>
              handleSettingChange(
                "defaultSaveFolder",
                e.target.value as CopilotSettings["defaultSaveFolder"]
              )
            }
            placeholder="copilot-conversations"
          />
        </div>
      </div>

      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">Default Conversation Tag</div>
          <div className="setting-item-description">
            The default tag to be used when saving a conversation. Default is 'ai-conversations'
          </div>
        </div>
        <div className="setting-item-control">
          <input
            type="text"
            value={settings.defaultConversationTag}
            onChange={(e) =>
              handleSettingChange(
                "defaultConversationTag",
                e.target.value as CopilotSettings["defaultConversationTag"]
              )
            }
            placeholder="ai-conversation"
          />
        </div>
      </div>

      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">Autosave Chat</div>
          <div className="setting-item-description">
            Automatically save the chat when starting a new one or when the plugin reloads
          </div>
        </div>
        <div className="setting-item-control">
          <input
            type="checkbox"
            checked={settings.autosaveChat}
            onChange={(e) =>
              handleSettingChange(
                "autosaveChat",
                e.target.checked as CopilotSettings["autosaveChat"]
              )
            }
          />
        </div>
      </div>

      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">Suggested Prompts</div>
          <div className="setting-item-description">Show suggested prompts in the chat view</div>
        </div>
        <div className="setting-item-control">
          <input
            type="checkbox"
            checked={settings.showSuggestedPrompts}
            onChange={(e) =>
              handleSettingChange(
                "showSuggestedPrompts",
                e.target.checked as CopilotSettings["showSuggestedPrompts"]
              )
            }
          />
        </div>
      </div>

      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">Open Plugin In</div>
          <div className="setting-item-description">
            Select where the plugin should open by default
          </div>
        </div>
        <div className="setting-item-control">
          <select
            value={settings.defaultOpenArea}
            onChange={(e) =>
              handleSettingChange(
                "defaultOpenArea",
                e.target.value as CopilotSettings["defaultOpenArea"]
              )
            }
          >
            <option value={DEFAULT_OPEN_AREA.VIEW}>Sidebar View</option>
            <option value={DEFAULT_OPEN_AREA.EDITOR}>Editor</option>
          </select>
        </div>
      </div>

      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">Custom Prompts Folder Name</div>
          <div className="setting-item-description">
            The default folder name where custom prompts will be saved. Default is
            'copilot-custom-prompts'
          </div>
        </div>
        <div className="setting-item-control">
          <input
            type="text"
            value={settings.customPromptsFolder}
            onChange={(e) =>
              handleSettingChange(
                "customPromptsFolder",
                e.target.value as CopilotSettings["customPromptsFolder"]
              )
            }
            placeholder="copilot-custom-prompts"
          />
        </div>
      </div>

      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">Token and Context Settings</div>
          <div className="setting-item-description">
            Please be mindful of the number of tokens and context conversation turns you set here,
            as they will affect the cost of your API requests.
          </div>
        </div>
      </div>
      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">Temperature</div>
          <div className="setting-item-description">
            Default is 0.1. Higher values will result in more creativeness, but also more mistakes.
            Set to 0 for no randomness.
          </div>
        </div>
        <div className="setting-item-control">
          <input
            type="range"
            min="0"
            max="2"
            step="0.05"
            value={settings.temperature}
            onChange={(e) =>
              handleSettingChange(
                "temperature",
                parseFloat(e.target.value) as CopilotSettings["temperature"]
              )
            }
          />
          <span className="slider-value">{settings.temperature}</span>
        </div>
      </div>

      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">Token limit</div>
          <div className="setting-item-description">
            <>
              <p>The maximum number of output tokens to generate. Default is 1000.</p>
              <em>
                This number plus the length of your prompt (input tokens) must be smaller than the
                context window of the model.
              </em>
            </>
          </div>
        </div>
        <div className="setting-item-control">
          <input
            type="range"
            min="0"
            max="16000"
            step="100"
            value={settings.maxTokens}
            onChange={(e) =>
              handleSettingChange(
                "maxTokens",
                parseInt(e.target.value) as CopilotSettings["maxTokens"]
              )
            }
          />
          <span className="slider-value">{settings.maxTokens}</span>
        </div>
      </div>

      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">Conversation turns in context</div>
          <div className="setting-item-description">
            The number of previous conversation turns to include in the context. Default is 15
            turns, i.e. 30 messages.
          </div>
        </div>
        <div className="setting-item-control">
          <input
            type="range"
            min="1"
            max="50"
            step="1"
            value={settings.contextTurns}
            onChange={(e) =>
              handleSettingChange(
                "contextTurns",
                parseInt(e.target.value) as CopilotSettings["contextTurns"]
              )
            }
          />
          <span className="slider-value">{settings.contextTurns}</span>
        </div>
      </div>

      <CommandToggleSettings
        enabledCommands={settings.enabledCommands}
        setEnabledCommands={(value) => updateSetting("enabledCommands", value)}
      />
    </div>
  );
};

export default GeneralSettings;

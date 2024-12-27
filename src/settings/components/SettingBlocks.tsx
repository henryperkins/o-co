import { CustomModel, ChatCustomModel, EmbeddingCustomModel } from "@/types";
import { EmbeddingModelProviders, ChatModelProviders } from "@/constants";
import ChatModelManager from "@/LLMProviders/chatModelManager";
import EmbeddingManager from "@/LLMProviders/embeddingManager";
import { App, Notice } from "obsidian";
import React, { useEffect, useState } from "react";

// Add type guard function
const isEmbeddingCustomModel = (
  model: ChatCustomModel | EmbeddingCustomModel
): model is EmbeddingCustomModel => {
  return Object.values(EmbeddingModelProviders).includes(model.provider as EmbeddingModelProviders);
};

const ModelCard: React.FC<{
  model: CustomModel;
  isDefault: boolean;
  onSetDefault: (model: CustomModel) => void;
  onToggleEnabled: (value: boolean) => void;
  onToggleCors: (value: boolean) => void;
  onDelete?: () => void;
  disabled?: boolean;
}> = ({ model, isDefault, onSetDefault, onToggleEnabled, onToggleCors, onDelete, disabled }) => {
  const [isExpanded, setIsExpanded] = useState(isDefault);

  useEffect(() => {
    setIsExpanded(isDefault);
  }, [isDefault]);

  return (
    <div
      className={`model-card ${isExpanded ? "expanded" : ""} ${isDefault ? "selected" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        setIsExpanded(!isExpanded);
        onSetDefault(model);
      }}
    >
      <div className="model-card-header">
        <div className="model-card-header-content">
          <span className="model-name" title={model.name}>
            {model.name}
          </span>
          <span className="model-provider" title={model.provider}>
            {model.provider}
          </span>
        </div>
        {onDelete && (
          <button
            className="model-delete-icon"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            aria-label="Delete model"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 6h18M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M10 11v6M14 11v6M5 6v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6H5z" />
            </svg>
          </button>
        )}
      </div>

      {isExpanded && (
        <div className="model-card-content">
          <div className="model-card-controls">
            <div className="model-card-item">
              <span>Enabled</span>
              <input
                type="checkbox"
                checked={model.enabled}
                onChange={(e) => onToggleEnabled(e.target.checked)}
                disabled={disabled}
              />
            </div>

            {!model.isBuiltIn && (
              <div className="model-card-item">
                <span>CORS</span>
                <input
                  type="checkbox"
                  checked={model.enableCors || false}
                  onChange={(e) => onToggleCors(e.target.checked)}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

interface ModelSettingsComponentProps {
  app: App;
  activeModels: Array<CustomModel>;
  onUpdateModels: (models: Array<CustomModel>) => void;
  providers: Array<ChatModelProviders | EmbeddingModelProviders>;
  onDeleteModel: (modelKey: string) => void;
  defaultModelKey: string;
  onSetDefaultModelKey: (modelKey: string) => Promise<void>;
  isEmbeddingModel: boolean;
}

const ModelSettingsComponent: React.FC<ModelSettingsComponentProps> = ({
  app,
  activeModels,
  onUpdateModels,
  providers,
  onDeleteModel,
  defaultModelKey,
  onSetDefaultModelKey,
  isEmbeddingModel,
}) => {
  const emptyModel: ChatCustomModel | EmbeddingCustomModel = {
    name: "",
    provider:
      providers.length > 0
        ? providers[0]
        : isEmbeddingModel
          ? EmbeddingModelProviders.OPENAI
          : ChatModelProviders.OPENAI,
    baseUrl: "",
    apiKey: "",
    enabled: true,
    isBuiltIn: false,
    enableCors: false,
  };

  const [newModel, setNewModel] = useState<ChatCustomModel | EmbeddingCustomModel>(emptyModel);
  const [isAddModelOpen, setIsAddModelOpen] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const getModelKey = (model: CustomModel) => `${model.name}|${model.provider}`;

  const handleSetDefaultModel = async (model: CustomModel) => {
    await onSetDefaultModelKey(getModelKey(model));
  };

  const handleAddModel = () => {
    if (newModel.name && newModel.provider) {
      const updatedModels = [...activeModels, { ...newModel, enabled: true }];
      onUpdateModels(updatedModels);
      setNewModel(emptyModel);
    } else {
      new Notice("Please fill in necessary fields!");
    }
  };

  // Updated handleVerifyModel with type guard
  const handleVerifyModel = async () => {
    if (!newModel.name || !newModel.provider) {
      new Notice("Please fill in necessary fields!");
      return;
    }

    setIsVerifying(true);
    try {
      if (isEmbeddingModel) {
        if (isEmbeddingCustomModel(newModel)) {
          await EmbeddingManager.getInstance().ping(newModel);
          new Notice("Model connection verified successfully!");
        } else {
          throw new Error("Invalid type for embedding model verification");
        }
      } else {
        // Type assertion since we know it's a ChatCustomModel in this branch
        await ChatModelManager.getInstance().ping(newModel as ChatCustomModel);
        new Notice("Model connection verified successfully!");
      }
    } catch (error) {
      // Improve error typing
      const message = error instanceof Error ? error.message : "Unknown error occurred";
      console.error("Model verification failed:", error);
      new Notice(`Model verification failed: ${message}`);
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div>
      <div className="model-settings-container">
        {/* Desktop View */}
        <table className="model-settings-table desktop-only">
          <thead>
            <tr>
              <th>Default</th>
              <th>Model</th>
              <th>Provider</th>
              <th>Enabled</th>
              <th>CORS</th>
              <th>Delete</th>
            </tr>
          </thead>
          <tbody>
            {activeModels.map((model, index) => (
              <tr key={getModelKey(model)}>
                <td>
                  <input
                    type="radio"
                    name={`selected-${isEmbeddingModel ? "embedding" : "chat"}-model`}
                    checked={getModelKey(model) === defaultModelKey}
                    onChange={() => handleSetDefaultModel(model)}
                  />
                </td>
                <td>{model.name}</td>
                <td>{model.provider}</td>
                <td>
                  <input
                    type="checkbox"
                    name="modelEnabled"
                    checked={model.enabled}
                    onChange={(e) => {
                      const isChecked = e.target.checked;
                      if (!model.isBuiltIn) {
                        const updatedModels = activeModels.map((m, i) =>
                          i === index ? { ...m, enabled: isChecked } : m
                        );
                        onUpdateModels(updatedModels);
                      }
                    }}
                    disabled={model.isBuiltIn}
                  />
                </td>
                <td>
                  {!model.isBuiltIn && (
                    <input
                      type="checkbox"
                      name="modelCors"
                      checked={model.enableCors || false}
                      onChange={(e) => {
                        const isChecked = e.target.checked;
                        const updatedModels = activeModels.map((m, i) =>
                          i === index ? { ...m, enableCors: isChecked } : m
                        );
                        onUpdateModels(updatedModels);
                      }}
                    />
                  )}
                </td>
                <td>
                  {getModelKey(model) !== defaultModelKey && (
                    <button onClick={() => onDeleteModel(getModelKey(model))}>Delete</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Mobile View */}
        <div className="model-cards-container mobile-only">
          {activeModels.map((model) => (
            <ModelCard
              key={getModelKey(model)}
              model={model}
              isDefault={getModelKey(model) === defaultModelKey}
              onSetDefault={handleSetDefaultModel}
              onToggleEnabled={(value) => {
                if (!model.isBuiltIn) {
                  const updatedModels = activeModels.map((m) =>
                    m.name === model.name && m.provider === model.provider
                      ? { ...m, enabled: value }
                      : m
                  );
                  onUpdateModels(updatedModels);
                }
              }}
              onToggleCors={(value) => {
                const updatedModels = activeModels.map((m) =>
                  m.name === model.name && m.provider === model.provider
                    ? { ...m, enableCors: value }
                    : m
                );
                onUpdateModels(updatedModels);
              }}
              onDelete={() => onDeleteModel(getModelKey(model))}
              disabled={model.isBuiltIn}
            />
          ))}
        </div>
      </div>
      <div className="add-custom-model" onClick={() => setIsAddModelOpen(!isAddModelOpen)}>
        <h2>Add Custom Model {isAddModelOpen ? "▼" : "▶"}</h2>
      </div>
      {isAddModelOpen && (
        <div className="add-custom-model-form">
          <input
            type="text"
            className="model-name-input"
            placeholder="Enter model name"
            value={newModel.name}
            onChange={(e) => setNewModel({ ...newModel, name: e.target.value })}
          />
          <select
            value={newModel.provider}
            onChange={(e) =>
              setNewModel({
                ...newModel,
                provider: e.target.value as ChatModelProviders | EmbeddingModelProviders,
              })
            }
          >
            {providers.map((p) => (
              <option key={p.toString()} value={p.toString()}>
                {p.toString()}
              </option>
            ))}
          </select>
          <input
            type="text"
            className="base-url-input"
            placeholder="https://api.example.com/v1 (optional)"
            value={newModel.baseUrl || ""}
            onChange={(e) => setNewModel({ ...newModel, baseUrl: e.target.value })}
          />
          <input
            type="password"
            className="api-key-input"
            placeholder="Enter API key (optional)"
            value={newModel.apiKey || ""}
            onChange={(e) => setNewModel({ ...newModel, apiKey: e.target.value })}
          />
          <div className="verification-button-container">
            <button onClick={handleVerifyModel} disabled={isVerifying}>
              {isVerifying ? "Verifying..." : "Verify Connection"}
            </button>
            <button onClick={handleAddModel} disabled={isVerifying}>
              Add Model
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export { ModelSettingsComponent };

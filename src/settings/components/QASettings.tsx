import { EmbeddingCustomModel } from "@/types";
import { RebuildIndexConfirmModal } from "@/components/modals/RebuildIndexConfirmModal";
import {
  EmbeddingModelProviders,
  VAULT_VECTOR_STORE_STRATEGIES,
  ChatModelProviders,
} from "@/constants";
import VectorStoreManager from "@/search/vectorStoreManager";
import { updateSetting, useSettingsValue, CopilotSettings } from "@/settings/model";
import { App, Notice } from "obsidian";
import React from "react";
import { ModelSettingsComponent } from "./SettingBlocks";

interface QASettingsProps {
  app: App;
  vectorStoreManager: VectorStoreManager;
}

const QASettings: React.FC<QASettingsProps> = ({ app, vectorStoreManager }) => {
  const settings = useSettingsValue();

  const handleUpdateEmbeddingModels = (models: Array<EmbeddingCustomModel>) => {
    const updatedActiveEmbeddingModels = models.map((model) => ({
      ...model,
      baseUrl: model.baseUrl || "",
      apiKey: model.apiKey || "",
    }));
    updateSetting("activeEmbeddingModels", updatedActiveEmbeddingModels);
  };

  const handleSetDefaultEmbeddingModel = async (modelKey: string) => {
    if (modelKey !== settings.embeddingModelKey) {
      new RebuildIndexConfirmModal(app, async () => {
        await updateSetting("embeddingModelKey", modelKey);
      }).open();
    }
  };

  const handlePartitionsChange = (value: string) => {
    const numValue = parseInt(value);
    if (numValue !== settings.numPartitions) {
      new RebuildIndexConfirmModal(app, async () => {
        updateSetting("numPartitions", numValue);
        await vectorStoreManager.indexVaultToVectorStore(true);
      }).open();
    }
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
      <h1>QA Settings</h1>
      <p>
        QA mode relies on a <em>local</em> vector index.
      </p>
      <h2>Local Embedding Model</h2>
      <p>
        Check the{" "}
        <a href="https://github.com/logancyang/obsidian-copilot/blob/master/local_copilot.md">
          local copilot
        </a>{" "}
        setup guide to setup Ollama's local embedding model (requires Ollama v0.1.26 or above).
      </p>
      <h2>Embedding Models</h2>
      <ModelSettingsComponent
        app={app}
        activeModels={settings.activeEmbeddingModels}
        onUpdateModels={handleUpdateEmbeddingModels}
        providers={[
          ...Object.values(EmbeddingModelProviders),
          ...Object.values(ChatModelProviders),
        ]}
        onDeleteModel={(modelKey) => {
          const updatedActiveEmbeddingModels = settings.activeEmbeddingModels.filter(
            (model) => `${model.name}|${model.provider}` !== modelKey
          );
          updateSetting("activeEmbeddingModels", updatedActiveEmbeddingModels);
        }}
        defaultModelKey={settings.embeddingModelKey}
        onSetDefaultModelKey={handleSetDefaultEmbeddingModel}
        isEmbeddingModel={true}
      />
      <h2>Auto-Index Strategy</h2>
      <div className="warning-message">
        If you are using a paid embedding provider, beware of costs for large vaults!
      </div>
      <p>
        When you switch to <strong>Vault QA</strong> mode, your vault is indexed{" "}
        <em>based on the auto-index strategy you select below</em>.
        <br />
      </p>
      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">Auto-index vault strategy</div>
          <div className="setting-item-description">
            Decide when you want the vault to be indexed.
          </div>
        </div>
        <div className="setting-item-control">
          <select
            value={settings.indexVaultToVectorStore}
            onChange={(e) =>
              handleSettingChange(
                "indexVaultToVectorStore",
                e.target.value as CopilotSettings["indexVaultToVectorStore"]
              )
            }
          >
            {VAULT_VECTOR_STORE_STRATEGIES.map((strategy) => (
              <option key={strategy} value={strategy}>
                {strategy}
              </option>
            ))}
          </select>
        </div>
      </div>
      <br />
      <p>
        <strong>NEVER</strong>: Notes are never indexed to the Copilot index unless users run the
        command <em>Index vault for QA</em> explicitly, or hit the <em>Refresh Index</em> button.
        <br />
        <br />
        <strong>ON STARTUP</strong>: Vault index is refreshed on plugin load/reload.
        <br />
        <br />
        <strong>ON MODE SWITCH (Recommended)</strong>: Vault index is refreshed when switching to
        Vault QA mode.
        <br />
        <br />
        By "refreshed", it means the vault index is not rebuilt from scratch but rather updated
        incrementally with new/modified notes since the last index. If you need a complete rebuild,
        run the commands "Clear Copilot index" and "Force re-index for QA" manually. This helps
        reduce costs when using paid embedding models.
        <br />
        <br />
        Beware of the cost if you are using a paid embedding model and have a large vault! You can
        run Copilot command <em>Count total tokens in your vault</em> and refer to your selected
        embedding model pricing to estimate indexing costs.
      </p>
      <br />
      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">Max Sources</div>
          <div className="setting-item-description">
            Copilot goes through your vault to find relevant blocks and passes the top N blocks to
            the LLM. Default for N is 3. Increase if you want more sources included in the answer
            generation step. WARNING: more sources significantly degrades answer quality if the chat
            model is weak!
          </div>
        </div>
        <div className="setting-item-control">
          <input
            type="range"
            min="1"
            max="30"
            step="1"
            value={settings.maxSourceChunks}
            onChange={(e) =>
              handleSettingChange(
                "maxSourceChunks",
                parseInt(e.target.value) as CopilotSettings["maxSourceChunks"]
              )
            }
          />
          <span className="slider-value">{settings.maxSourceChunks}</span>
        </div>
      </div>
      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">Requests per second</div>
          <div className="setting-item-description">
            Default is 10. Decrease if you are rate limited by your embedding provider.
          </div>
        </div>
        <div className="setting-item-control">
          <input
            type="range"
            min="1"
            max="30"
            step="1"
            value={settings.embeddingRequestsPerSecond}
            onChange={(e) =>
              handleSettingChange(
                "embeddingRequestsPerSecond",
                parseInt(e.target.value) as CopilotSettings["embeddingRequestsPerSecond"]
              )
            }
          />
          <span className="slider-value">{settings.embeddingRequestsPerSecond}</span>
        </div>
      </div>

      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">Number of Partitions</div>
          <div className="setting-item-description">
            Number of partitions for Copilot index. Default is 1. Increase if you have issues
            indexing large vaults. Warning: Changes require clearing and rebuilding the index!
          </div>
        </div>
        <div className="setting-item-control">
          <select
            value={settings.numPartitions.toString()}
            onChange={(e) => handlePartitionsChange(e.target.value)}
          >
            {[
              "1",
              "2",
              "3",
              "4",
              "5",
              "6",
              "7",
              "8",
              "12",
              "16",
              "20",
              "24",
              "28",
              "32",
              "36",
              "40",
            ].map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">Exclusions</div>
          <div className="setting-item-description">
            Comma separated list of paths, tags, note titles or file extension, e.g. folder1,
            folder1/folder2, #tag1, #tag2, [[note1]], [[note2]], *.jpg, *.excallidraw.md etc, to be
            excluded from the indexing process. NOTE: Tags must be in the note properties, not the
            note content. Files which were previously indexed will remain in the index unless you
            force re-index.
          </div>
        </div>
        <div className="setting-item-control">
          <textarea
            value={settings.qaExclusions}
            onChange={(e) =>
              handleSettingChange("qaExclusions", e.target.value as CopilotSettings["qaExclusions"])
            }
            placeholder="folder1, #tag1, [[note1]]"
            rows={3}
          />
        </div>
      </div>

      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">Enable Obsidian Sync for Copilot index</div>
          <div className="setting-item-description">
            If enabled, the index will be stored in the .obsidian folder and synced with Obsidian
            Sync by default. If disabled, it will be stored in .copilot-index folder at vault root.
          </div>
        </div>
        <div className="setting-item-control">
          <input
            type="checkbox"
            checked={settings.enableIndexSync}
            onChange={(e) =>
              handleSettingChange(
                "enableIndexSync",
                e.target.checked as CopilotSettings["enableIndexSync"]
              )
            }
          />
        </div>
      </div>
      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">Disable index loading on mobile</div>
          <div className="setting-item-description">
            When enabled, Copilot index won't be loaded on mobile devices to save resources. Only
            chat mode will be available. Any existing index from desktop sync will be preserved.
            Uncheck to enable QA modes on mobile.
          </div>
        </div>
        <div className="setting-item-control">
          <input
            type="checkbox"
            checked={settings.disableIndexOnMobile}
            onChange={(e) =>
              handleSettingChange(
                "disableIndexOnMobile",
                e.target.checked as CopilotSettings["disableIndexOnMobile"]
              )
            }
          />
        </div>
      </div>
    </div>
  );
};

export default QASettings;

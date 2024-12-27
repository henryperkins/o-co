import { ResetSettingsConfirmModal } from "@/components/modals/ResetSettingsConfirmModal";
import CopilotPlugin from "@/main";
import { resetSettings } from "@/settings/model";
import { Notice } from "obsidian";
import React from "react";
import AdvancedSettings from "./AdvancedSettings";
import { ApiSettings } from "./ApiSettings";
import CopilotPlusSettings from "./CopilotPlusSettings";
import GeneralSettings from "./GeneralSettings";
import QASettings from "./QASettings";

interface SettingsMainProps {
  plugin: CopilotPlugin;
}

const SettingsMain: React.FC<SettingsMainProps> = ({ plugin }) => {
  const handleReset = async () => {
    try {
      await resetSettings();
      new Notice(`Settings successfully reset!`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error occurred";
      console.error(`Error resetting settings`, error);
      new Notice(`Error resetting settings: ${message}`);
    }
  };

  return (
    <div className="settings-container">
      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">
            <h2>
              Copilot Settings <small>v{plugin.manifest.version}</small>
            </h2>
          </div>
        </div>
        <div className="setting-item-control">
          <button
            onClick={() => new ResetSettingsConfirmModal(plugin.app, () => handleReset()).open()}
          >
            Reset to Default Settings
          </button>
        </div>
      </div>
      <CopilotPlusSettings />
      <GeneralSettings app={plugin.app} />
      <ApiSettings />
      <QASettings app={plugin.app} vectorStoreManager={plugin.vectorStoreManager} />
      <AdvancedSettings />
    </div>
  );
};

export default SettingsMain;

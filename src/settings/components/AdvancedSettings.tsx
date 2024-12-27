import { updateSetting, useSettingsValue, CopilotSettings } from "@/settings/model";
import React from "react";

const AdvancedSettings: React.FC = () => {
  const settings = useSettingsValue();
  return (
    <div>
      <h2>Advanced Settings</h2>

      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">User System Prompt</div>
          <div className="setting-item-description">
            Customize the system prompt for all messages, may result in unexpected behavior!
          </div>
        </div>
        <div className="setting-item-control">
          <textarea
            value={settings.userSystemPrompt}
            onChange={(e) =>
              handleSettingChange(
                "userSystemPrompt",
                e.target.value as CopilotSettings["userSystemPrompt"]
              )
            }
            placeholder={""}
            rows={10}
          />
        </div>
      </div>
    </div>
  );
};

const handleSettingChange = async <K extends keyof CopilotSettings>(
  name: K,
  value: CopilotSettings[K]
) => {
  try {
    await updateSetting(name, value);
  } catch (error) {
    console.error(
      `Error updating ${name}:`,
      error instanceof Error ? error.message : "Unknown error occurred"
    );
  }
};

export default AdvancedSettings;

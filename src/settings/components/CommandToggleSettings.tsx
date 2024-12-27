import React, { useState } from "react";

interface CommandToggleSettingsProps {
  enabledCommands: Record<string, { enabled: boolean; name: string }>;
  setEnabledCommands: (enabledCommands: Record<string, { enabled: boolean; name: string }>) => void;
}

const CommandToggleSettings: React.FC<CommandToggleSettingsProps> = ({
  enabledCommands,
  setEnabledCommands,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleCommand = (commandId: string, enabled: boolean) => {
    setEnabledCommands({
      ...enabledCommands,
      [commandId]: { ...enabledCommands[commandId], enabled },
    });
  };

  return (
    <div className="setting-item">
      <div className="setting-item-info">
        <div
          className="setting-item-name"
          onClick={() => setIsExpanded(!isExpanded)}
          style={{ cursor: "pointer" }}
        >
          Command Settings {isExpanded ? "▼" : "▶"}
        </div>
      </div>
      {isExpanded && (
        <div className="setting-item-control">
          {Object.entries(enabledCommands).map(([commandId, { enabled, name }]) => (
            <div key={commandId} className="setting-item">
              <div className="setting-item-info">
                <div className="setting-item-name">{name}</div>
              </div>
              <div className="setting-item-control">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => toggleCommand(commandId, e.target.checked)}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CommandToggleSettings;

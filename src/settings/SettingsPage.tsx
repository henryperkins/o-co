import CopilotView from "@/components/CopilotView";
import { CHAT_VIEWTYPE } from "@/constants";
import CopilotPlugin from "@/main";
import { getSettings, updateSetting } from "@/settings/model";
import { App, PluginSettingTab, Setting } from "obsidian";
import React from "react";
import { createRoot } from "react-dom/client";
import SettingsMain from "./components/SettingsMain";

export class CopilotSettingTab extends PluginSettingTab {
  plugin: CopilotPlugin;

  constructor(app: App, plugin: CopilotPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  async reloadPlugin() {
    try {
      // Autosave the current chat before reloading
      const chatView = this.app.workspace.getLeavesOfType(CHAT_VIEWTYPE)[0]?.view as CopilotView;
      if (chatView && getSettings().autosaveChat) {
        await this.plugin.autosaveCurrentChat();
      }

      // Reload the plugin
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const app = this.plugin.app as any;
      await app.plugins.disablePlugin(this.plugin.manifest.id);
      await app.plugins.enablePlugin(this.plugin.manifest.id);

      app.setting.openTabById(this.plugin.manifest.id).display();
    } catch (error) {
      console.error("Error reloading plugin:", error);
    }
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    const div = containerEl.createDiv();
    const sections = createRoot(div);

    sections.render(<SettingsMain plugin={this.plugin} />);

    new Setting(containerEl)
      .setName("Enable Encryption")
      .setDesc("Enable encryption for the API keys.")
      .addToggle((toggle) =>
        toggle.setValue(getSettings().enableEncryption).onChange(async (value) => {
          updateSetting("enableEncryption", value);
        })
      );

    new Setting(containerEl)
      .setName("Debug mode")
      .setDesc("Debug mode will log all API requests and prompts to the console.")
      .addToggle((toggle) =>
        toggle.setValue(getSettings().debug).onChange(async (value) => {
          updateSetting("debug", value);
        })
      );
  }
}

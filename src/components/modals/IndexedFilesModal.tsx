import { App, TFile } from "obsidian";
import { BaseNoteModal } from "./BaseNoteModal";

export class IndexedFilesModal extends BaseNoteModal<TFile> {
  constructor(
    app: App,
    private indexedFiles: TFile[]
  ) {
    super(app);
    this.availableNotes = indexedFiles;
  }

  getItems(): TFile[] {
    return this.availableNotes;
  }

  getItemText(file: TFile): string {
    const isActive = file.path === this.activeNote?.path;
    return this.formatNoteTitle(file.basename, isActive, file.extension);
  }

  onChooseItem(file: TFile): void {
    this.app.workspace.getLeaf().openFile(file);
  }
}

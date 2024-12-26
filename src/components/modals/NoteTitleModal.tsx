import { App, TFile } from "obsidian";
import { BaseNoteModal } from "./BaseNoteModal";

export class NoteTitleModal extends BaseNoteModal<TFile> {
  private onChooseNoteTitle: (noteTitle: string) => void;

  constructor(app: App, noteTitles: string[], onChooseNoteTitle: (noteTitle: string) => void) {
    super(app);
    this.onChooseNoteTitle = onChooseNoteTitle;
    this.availableNotes = this.getOrderedNotes().filter(
      (file) => file.extension === "md"
    );
  }

  getItems(): TFile[] {
    return this.availableNotes;
  }

  getItemText(note: TFile): string {
    const isActive = note === this.activeNote;
    return this.formatNoteTitle(note.basename, isActive);
  }

  onChooseItem(note: TFile, evt: MouseEvent | KeyboardEvent) {
    this.onChooseNoteTitle(note.basename);
  }
}

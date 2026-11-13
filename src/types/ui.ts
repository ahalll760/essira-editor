export type ViewName = "home" | "studio";

export type ModalName = "export" | "ai" | "settings" | "homework" | "about" | "import";

export type ModalTab = "timeline" | "paste" | "chat";

export interface ModalState {
  name: ModalName;
  tab?: ModalTab;
}

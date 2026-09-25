import type { SidebarSection } from "@/components/Sidebar";

/** Window event that asks the main window to open a sidebar section. */
export const NAVIGATE_EVENT = "say-less:navigate";

export function navigateTo(section: SidebarSection) {
  window.dispatchEvent(new CustomEvent(NAVIGATE_EVENT, { detail: section }));
}

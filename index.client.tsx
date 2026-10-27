import type { PluginClientContext, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { GitGraphPanel } from "./client/panel";
import { GitGraphScreen } from "./client/screen";

const SCREEN_ID = "graph";
const PANEL_ID = "graph";
const ICON = "GitGraph";
const TITLE = "Git Graph";
const KEYWORDS = ["git", "graph", "commits", "history", "branches"];

function GitGraphSidebarItem({ currentScreen, openScreen }: PluginSidebarItemProps) {
  return (
    <SidebarRow
      icon={ICON}
      active={currentScreen?.screenId === SCREEN_ID}
      onPress={() => openScreen({ screenId: SCREEN_ID })}
    />
  );
}

export default function contribute(client: PluginClientContext) {
  client.addScreen({ id: SCREEN_ID, title: TITLE, Component: GitGraphScreen });
  client.addSidebarHeaderItem({ id: SCREEN_ID, title: TITLE, Component: GitGraphSidebarItem });
  client.addWorkspacePanel({
    id: PANEL_ID,
    title: TITLE,
    icon: ICON,
    context: "workspace",
    Component: GitGraphPanel,
  });
  client.addCommandCenterItem({
    id: "open-workspace-graph",
    title: "Show git graph for this workspace",
    icon: ICON,
    keywords: KEYWORDS,
    context: "workspace",
    onSelect({ openPanel }) {
      openPanel(PANEL_ID);
    },
  });
  client.addCommandCenterItem({
    id: "open-graph-screen",
    title: "Open Git Graph",
    icon: ICON,
    keywords: KEYWORDS,
    context: "global",
    onSelect({ openScreen }) {
      openScreen({ screenId: SCREEN_ID });
    },
  });
  return () => {};
}

import type { PluginClientContext, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { GitGraphScreen } from "./client/screen";

const SCREEN_ID = "graph";

function GitGraphSidebarItem({ currentScreen, openScreen }: PluginSidebarItemProps) {
  return (
    <SidebarRow
      icon="GitGraph"
      active={currentScreen?.screenId === SCREEN_ID}
      onPress={() => openScreen({ screenId: SCREEN_ID })}
    />
  );
}

export default function contribute(client: PluginClientContext) {
  client.addScreen({ id: SCREEN_ID, title: "Git Graph", Component: GitGraphScreen });
  client.addSidebarHeaderItem({ id: SCREEN_ID, title: "Git Graph", Component: GitGraphSidebarItem });
  return () => {};
}

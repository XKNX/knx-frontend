import { NavigationEntry, Route } from "@typing/navigation";

export class NavigationService {
  public getActiveRoute(): Route {
    const path = window.location.pathname.split("/");

    return {
      name: NavigationEntry[path[2]?.toUpperCase()] || NavigationEntry.OVERVIEW,
      parameters: {},
    };
  }

  public getNextRoute(event: any): Promise<string> {
    const path: string = event.detail.item.getAttribute("page-name");
    const navigationEntry: NavigationEntry =
      NavigationEntry[path.toUpperCase()];

    if (navigationEntry !== this.getActiveRoute().name) {
      return Promise.resolve("/knx_ui/" + navigationEntry);
    }

    return Promise.reject();
  }
}

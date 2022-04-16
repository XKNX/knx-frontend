export interface Route {
  name: NavigationEntry;
  parameters: object;
}

export enum NavigationEntry {
  OVERVIEW = "overview",
  BUS_MONITOR = "bus_monitor",
}

export interface Route {
  path: string;
  prefix: string;
}

export interface LocationChangedEvent {
  detail?: { route: Route; force?: boolean };
}

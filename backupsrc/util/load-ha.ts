export class HomeAssistantComponentLoader {
  public static async loadForm(): Promise<void> {
    if (
      customElements.get('ha-checkbox') &&
      customElements.get('ha-slider') &&
      customElements.get('ha-data-table')
    ) {
      return Promise.reject();
    }

    await customElements.whenDefined('partial-panel-resolver');
    const ppr = document.createElement('partial-panel-resolver') as any;
    ppr.hass = {
      panels: [
        {
          component_name: 'config',
          url_path: 'tmp',
        },
      ],
    };
    ppr._updateRoutes();
    await ppr.routerOptions.routes.tmp.load();

    await customElements.whenDefined('ha-panel-config');
    const cpr = document.createElement('ha-panel-config') as any;
    await cpr.routerOptions.routes.automation.load();

    ppr.hass = {
      panels: [
        {
          component_name: 'developer-tools',
          url_path: 'tmp',
        },
      ],
    };
    ppr._updateRoutes();
    await ppr.routerOptions.routes.tmp.load();

    await customElements.whenDefined('ha-app-layout');

    return Promise.resolve();
  }
}

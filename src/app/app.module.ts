import { CUSTOM_ELEMENTS_SCHEMA, Injector, NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { KNXPanelComponent } from './knxpanel/knxpanel.component';

@NgModule({
  declarations: [KNXPanelComponent],
  imports: [BrowserModule],
  providers: [],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class AppModule {
  constructor(private injector: Injector) {}
}

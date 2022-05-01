import { CUSTOM_ELEMENTS_SCHEMA, Injector, NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { KNXPanelComponent } from './knxpanel/knxpanel.component';
import { createCustomElement } from '@angular/elements';
import { StoreModule } from '@ngrx/store';
import { EffectsModule } from '@ngrx/effects';
import { StoreDevtoolsModule } from '@ngrx/store-devtools';
import { environment } from '../environments/environment';

@NgModule({
  declarations: [KNXPanelComponent],
  imports: [
    BrowserModule,
    StoreModule.forRoot({}, {}),
    EffectsModule.forRoot([]),
    StoreDevtoolsModule.instrument({
      maxAge: 25,
      logOnly: environment.production,
    }),
  ],
  providers: [],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  bootstrap: [KNXPanelComponent],
})
export class AppModule {
  constructor(private injector: Injector) {
    const webComponent = createCustomElement(KNXPanelComponent, { injector });
    customElements.define('knx-panel', webComponent);
  }
}

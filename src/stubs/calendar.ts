// Stub for HA's <ha-full-calendar> and <ha-schedule-form> — see build-scripts/stubs.cjs.
//
// The two of them are the only modules that reach @fullcalendar (and, through it, luxon)
// and the recurrence editor's rrule. The KNX panel shows no calendars and edits no schedule
// helpers. Neither module has a value export; both are only ever imported for their side
// effect of defining an element, so registering an empty one is the whole stub.

import { warnStubbed } from "./stub-warning";

class StubbedCalendarElement extends HTMLElement {
  public connectedCallback(): void {
    warnStubbed("calendars", `showing <${this.localName}>`);
  }
}

for (const tagName of ["ha-full-calendar", "ha-schedule-form"]) {
  if (!customElements.get(tagName)) {
    customElements.define(tagName, class extends StubbedCalendarElement {});
  }
}

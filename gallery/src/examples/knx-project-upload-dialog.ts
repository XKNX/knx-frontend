import en from "../localize/en.json" with { type: "json" };
import { defineExample } from "./helpers";

const copy = en.dialogs["knx-project-upload-dialog"];
export const entry = defineExample({
  tag: "knx-project-upload-dialog",
  copy,
  category: "dialogs",
  events: ["knx-reload"],
  suppliedProperties: ["params"],
  scenarios: [
    { id: "format-error", label: en.scenarios["format-error"], values: {} },
    { id: "password-error", label: en.scenarios["password-error"], values: {} },
  ],
  interaction: { state: ["_projectPassword"] },
  async load() {
    const [{ dialogButton }, { html }] = await Promise.all([
      import("./dialog"),
      import("lit"),
      import("../../../src/dialogs/knx-project-upload-dialog"),
    ]);
    return {
      async prepare(env, scenario) {
        const { createKnxFixtures } = await import("../fixtures/knx");
        env.mockWS("knx/project_file_process", ({ file_id }) => {
          if (file_id !== "gallery-upload") throw new Error(en.validation.invalidValue);
          if (scenario === "format-error") throw new Error(en.dialogs.formatError);
          if (scenario === "password-error") throw new Error(en.dialogs.passwordError);
          env.fixtures.commit((data) => {
            data.project = createKnxFixtures().project;
          });
          return undefined;
        });
      },
      render: (env, _values, _slots, emit) =>
        html`<p>${en.dialogs.offlineUpload}</p>
          ${dialogButton(env, emit, "knx-project-upload-dialog", { hass: env.hass, knx: env.knx })}`,
    };
  },
});

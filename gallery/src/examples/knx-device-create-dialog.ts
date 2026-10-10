import type { DeviceRegistryEntry } from "@ha/data/device/device_registry";
import en from "../localize/en.json" with { type: "json" };
import { defineExample } from "./helpers";

const copy = en.dialogs["knx-device-create-dialog"];
export const entry = defineExample({
  tag: "knx-device-create-dialog",
  copy,
  category: "dialogs",
  suppliedProperties: ["params"],
  callbacks: ["onClose"],
  interaction: { state: ["_deviceName", "_area"] },
  async load() {
    const [{ dialogButton }, { callbackAdapter }] = await Promise.all([
      import("./dialog"),
      import("../protocol"),
      import("../../../src/dialogs/knx-device-create-dialog"),
    ]);
    return {
      render: (env, _values, _slots, emit) =>
        dialogButton(env, emit, "knx-device-create-dialog", {
          onClose: callbackAdapter(
            "onClose",
            emit,
            (device: DeviceRegistryEntry | undefined) => device,
            (device) => JSON.parse(JSON.stringify(device ?? null)),
          ),
        }),
    };
  },
});

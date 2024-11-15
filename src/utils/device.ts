import type { HomeAssistant } from "@ha/types";
import type { DeviceRegistryEntry } from "@ha/data/device_registry";

const isKnxIdentifier = (identifier: [string, string]): boolean => identifier[0] === "knx";

const isKnxDevice = (device: DeviceRegistryEntry): boolean =>
  device.identifiers.some(isKnxIdentifier);

export const knxDevices = (hass: HomeAssistant): DeviceRegistryEntry[] =>
  Object.values(hass.devices).filter(isKnxDevice);

export const deviceFromIdentifier = (
  hass: HomeAssistant,
  identifier: string,
): DeviceRegistryEntry | undefined => {
  const deviceEntry = Object.values(hass.devices).find((entry) =>
    entry.identifiers.find(
      (deviceIdentifier) => isKnxIdentifier(deviceIdentifier) && deviceIdentifier[1] === identifier,
    ),
  );
  return deviceEntry;
};

export const getKnxDeviceIdentifier = (deviceEntry: DeviceRegistryEntry): string | undefined => {
  const knxIdentifier = deviceEntry.identifiers.find(isKnxIdentifier);
  return knxIdentifier ? knxIdentifier[1] : undefined;
};

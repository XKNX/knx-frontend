import { HomeAssistant } from "@ha/types";
import type { DeviceRegistryEntry } from "@ha/data/device_registry";

const isKnxIdentifier = (identifier: [string, string]): boolean => identifier[0] === "knx";

const isKnxDevice = (device: DeviceRegistryEntry): boolean =>
  device.identifiers.some(isKnxIdentifier);

const _identifierFromDeviceId = (hass: HomeAssistant, deviceId: string): string | undefined => {
  const knxIdentifier = hass.devices[deviceId]?.identifiers.find(isKnxIdentifier);
  return knxIdentifier ? knxIdentifier[1] : undefined;
};

export const knxDevices = (hass: HomeAssistant): DeviceRegistryEntry[] =>
  Object.values(hass.devices).filter(isKnxDevice);

const _deviceIdFromIdentifier = (hass: HomeAssistant, identifier: string): string | undefined => {
  const deviceEntry = Object.values(hass.devices).find((entry) =>
    entry.identifiers.find(
      (deviceIdentifier) => isKnxIdentifier(deviceIdentifier) && deviceIdentifier[1] === identifier,
    ),
  );
  return deviceEntry ? deviceEntry.id : undefined;
};

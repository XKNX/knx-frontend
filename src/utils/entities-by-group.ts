import type { EntitiesByGroup } from "../data/knx-entities-by-group-context";

interface EntityGroupAddressMapOptions {
  ui?: boolean;
  yaml?: boolean;
}

const DEFAULT_OPTIONS: Required<EntityGroupAddressMapOptions> = {
  ui: true,
  yaml: true,
};

export interface EntityGroupAddresses {
  groups: Set<string>;
  ui: boolean;
}

/**
 * Invert group->entity mapping to entity->group mapping.
 * @param groups - The group->entity mapping from the KNX context provider.
 * @param options - Filter which entity sources to include.
 *   - `ui`: Include entities managed via the UI (default: true).
 *   - `yaml`: Include entities defined in YAML configuration (default: true).
 */
export const createGroupAddressesByEntityMap = (
  groups: EntitiesByGroup | undefined,
  options: EntityGroupAddressMapOptions = DEFAULT_OPTIONS,
): Record<string, EntityGroupAddresses> => {
  if (!groups) {
    return {};
  }
  const { ui, yaml } = { ...DEFAULT_OPTIONS, ...options };
  const byEntity: Record<string, EntityGroupAddresses> = Object.create(null);

  const addEntity = (entityId: string, groupAddress: string, isUi: boolean): void => {
    // An entity_id is either UI or YAML in this model, never both.
    // Therefore the ui flag is set once on first sight and not updated afterwards.
    const existing = byEntity[entityId] ?? { groups: new Set<string>(), ui: isUi };
    existing.groups.add(groupAddress);
    byEntity[entityId] = existing;
  };

  Object.entries(groups).forEach(([groupAddress, entityIdsByType]) => {
    if (ui) {
      entityIdsByType.ui.forEach((entityId) => addEntity(entityId, groupAddress, true));
    }
    if (yaml) {
      entityIdsByType.yaml.forEach((entityId) => addEntity(entityId, groupAddress, false));
    }
  });
  return byEntity;
};

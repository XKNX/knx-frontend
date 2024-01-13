import { createContext } from "@lit-labs/context";
import { GroupAddress } from "../types/websocket";
import { KNXLogger } from "../tools/knx-logger";

const logger = new KNXLogger("knx-drag-drop-context");

const contextKey = Symbol("drag-drop-context");

export class DragDropContext {
  _groupAddress?: GroupAddress;

  _updateObservers: () => void;

  constructor(updateObservers: () => void) {
    // call the context providers updateObservers method to trigger
    // reactive updates from consumers drag events to other subscribed consumers
    this._updateObservers = updateObservers;
  }

  get groupAddress(): GroupAddress | undefined {
    return this._groupAddress;
  }

  // arrow function => so `this` refers to the class instance, not the event source
  public gaDragStartHandler = (ev: DragEvent) => {
    const target = ev.target as HTMLElement;
    const ga = target.ga as GroupAddress;
    if (!ga) {
      logger.warn("dragstart: no 'ga' property found", target);
      return;
    }
    this._groupAddress = ga;
    logger.debug("dragstart", ga.address, this);
    ev.dataTransfer?.setData("text/group-address", ga.address);
    this._updateObservers();
  };

  public gaDragEndHandler = (_ev: DragEvent) => {
    logger.debug("dragend", this);
    this._groupAddress = undefined;
    this._updateObservers();
  };
}

export const dragDropContext = createContext<DragDropContext>(contextKey);

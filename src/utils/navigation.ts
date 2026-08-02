import { mainWindow } from "@ha/common/dom/get_main_window";
import { navigate } from "@ha/common/navigate";

/**
 * Navigation helpers for sub-page flows - eg. creating or editing an entity.
 *
 * A flow is entered by a regular `navigate()` (pushing one history entry), moves
 * between its steps by replacing that entry and is left again by `exitFlow()`,
 * which drops it. This way a finished flow leaves no trace in the browser
 * history - `back` from a list view leads to where the user came from and not
 * through every flow visited before.
 */

// safety net in case `popstate` is not fired for an expected history change
const HISTORY_TRAVERSAL_TIMEOUT = 500;

/** Resolves on the next `popstate` of the main window - or when it doesn't come. */
const _historyChanged = (): Promise<void> =>
  new Promise<void>((resolve) => {
    const finish = () => {
      mainWindow.clearTimeout(timeout);
      mainWindow.removeEventListener("popstate", finish);
      resolve();
    };
    const timeout = mainWindow.setTimeout(finish, HISTORY_TRAVERSAL_TIMEOUT);
    mainWindow.addEventListener("popstate", finish);
  });

/**
 * Open dialogs push a history entry, which they remove again when closed - going
 * back before that happened would only close the dialog. `navigate()` handles
 * this itself, traversing the history has to wait for it.
 */
const _dialogHistorySettled = (): Promise<void> =>
  mainWindow.history.state?.dialog ? _historyChanged() : Promise.resolve();

/** Navigate between the steps of a flow, without adding a history entry. */
export const navigateInFlow = (path: string): Promise<boolean> => navigate(path, { replace: true });

/**
 * Leave a flow by going back to the page it was entered from, dropping the
 * history entry of the flow. When there is no history to go back to - eg. the
 * flow was opened directly by URL - `fallbackPath` is navigated to instead.
 *
 * Resolves when the navigation was applied, so dialogs - which push their own
 * history state - can safely be opened afterwards.
 */
export const exitFlow = async (fallbackPath: string): Promise<void> => {
  // eg. when leaving was confirmed in a dialog - it still has to drop its entry
  await _dialogHistorySettled();
  if (mainWindow.history.length <= 1) {
    await navigate(fallbackPath, { replace: true });
    return;
  }
  const changed = _historyChanged();
  mainWindow.history.back();
  await changed;
};

import { describe, it, expect, vi } from "vitest";
import { fireEvent } from "@ha/common/dom/fire_event";
import { showLoadTelegramsDialog } from "./show-load-telegrams-dialog";

vi.mock("@ha/common/dom/fire_event", () => ({
  fireEvent: vi.fn(),
}));

describe("showLoadTelegramsDialog", () => {
  it("fires event", () => {
    const element = document.createElement("div") as any;
    const params = {
      knx: {} as any,
      onLoad: () => {
        /* mock function */
      },
    };
    showLoadTelegramsDialog(element, params);

    expect(fireEvent).toHaveBeenCalledWith(element, "show-dialog", {
      dialogTag: "knx-load-telegrams-dialog",
      dialogImport: expect.any(Function),
      dialogParams: params,
    });
  });
});

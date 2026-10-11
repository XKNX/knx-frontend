import "./english-locale";
import { MAIN_WINDOW_NAME } from "@ha/data/main_window";

// This must happen before any module that captures Home Assistant's mainWindow.
window.name = MAIN_WINDOW_NAME;
void import("./preview").then(({ mountPreview }) => mountPreview());

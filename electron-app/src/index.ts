import { app, BrowserWindow } from "electron";
import path from "path";
import dotenv from "dotenv";
import { ClaudeClient } from "./services/claude-client";
import { LinkedInService } from "./services/linkedin-service";
import { ApiClient } from "./services/api-client";
import { BrowserController } from "./services/browser-controller";
import { MainLoop } from "./main-loop";

dotenv.config();

let mainWindow: BrowserWindow | null = null;
let mainLoop: MainLoop | null = null;
let browserController: BrowserController | null = null;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "../public/index.html"));

  if (process.env.NODE_ENV === "development") {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

async function initializeServices() {
  const claudeClient = new ClaudeClient(process.env.CLAUDE_API_KEY!);

  browserController = new BrowserController(
    process.env.CHROME_PATH || undefined
  );
  await browserController.initialize();

  const linkedinService = new LinkedInService(browserController);
  const apiClient = new ApiClient(process.env.API_URL || "http://localhost:3001");

  mainLoop = new MainLoop(claudeClient, linkedinService, apiClient);

  return mainLoop;
}

app.on("ready", async () => {
  await createWindow();

  try {
    const loop = await initializeServices();
    console.log("✅ Services initialized");
    console.log("🚀 Starting main loop...");

    loop.start().catch((error) => {
      console.error("❌ Main loop error:", error);
    });
  } catch (error) {
    console.error("❌ Initialization error:", error);
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n🛑 Shutting down...");
  if (mainLoop) {
    await mainLoop.stop();
  }
  if (browserController) {
    await browserController.close();
  }
  process.exit(0);
});

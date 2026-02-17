import { app, BrowserWindow } from "electron";
import path from "path";
import dotenv from "dotenv";
import { ClaudeClient } from "./services/claude-client";
import { LinkedInService } from "./services/linkedin-service";
import { ApiClient } from "./services/api-client";
import { BrowserController } from "./services/browser-controller";
import { AuthService } from "./services/auth-service";
import { decryptCredentials } from "./services/crypto-utils";
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
  const apiUrl = process.env.API_URL || "http://localhost:3001";
  const encryptionKey = process.env.ENCRYPTION_KEY;

  // Step 1: Authenticate
  const email = process.env.C2C_EMAIL;
  const password = process.env.C2C_PASSWORD;

  if (!email || !password) {
    throw new Error("C2C_EMAIL and C2C_PASSWORD must be set in .env");
  }

  console.log(`🔐 Authenticating as ${email}...`);
  const authService = new AuthService(apiUrl);
  const loginResult = await authService.login(email, password);
  const userId = loginResult.user.id;
  console.log(`✅ Authenticated as ${loginResult.user.name} (${loginResult.user.role})`);

  // Step 2: Create API client with token
  const apiClient = new ApiClient(apiUrl, authService.getAccessToken());

  // Step 3: Fetch and decrypt LinkedIn credentials
  let linkedinCreds: { username: string; password: string } | undefined;

  if (encryptionKey) {
    try {
      const encCreds = await apiClient.getLinkedInCredentials();
      linkedinCreds = decryptCredentials(
        encCreds.encrypted_credentials,
        encCreds.encryption_iv,
        encCreds.encryption_auth_tag,
        encryptionKey
      );
      console.log(`🔑 LinkedIn credentials decrypted for ${encCreds.linkedin_email}`);
    } catch (err) {
      console.warn("⚠️ Could not fetch LinkedIn credentials from server, falling back to env vars");
    }
  }

  // Step 4: Initialize services with per-user isolation
  const claudeClient = new ClaudeClient(process.env.CLAUDE_API_KEY!);

  browserController = new BrowserController(
    process.env.CHROME_PATH || undefined,
    userId
  );
  await browserController.initialize();

  const linkedinService = new LinkedInService(browserController, linkedinCreds, userId);

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

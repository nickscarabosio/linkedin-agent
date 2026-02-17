import puppeteer, { Browser, Page } from "puppeteer-core";
import path from "path";
import os from "os";

const USER_DATA_DIR = path.join(os.homedir(), ".hood-hero", "chrome-profile");

const REALISTIC_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export class BrowserController {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private chromePath?: string;

  constructor(chromePath?: string) {
    this.chromePath = chromePath;
  }

  async initialize(): Promise<void> {
    try {
      console.log("🌐 Initializing browser...");

      const headless = process.env.HEADLESS === "true";
      const slowMo = parseInt(process.env.SLOW_MO || "0", 10);

      const args = [
        "--disable-blink-features=AutomationControlled",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-infobars",
        "--disable-extensions",
        `--user-data-dir=${USER_DATA_DIR}`,
        "--window-size=1920,1080",
        "--remote-debugging-port=9222",
      ];

      const launchOptions: any = {
        headless: headless ? "new" : false,
        slowMo,
        timeout: 30000,
        args,
      };

      if (this.chromePath) {
        launchOptions.executablePath = this.chromePath;
      }

      this.browser = await puppeteer.launch(launchOptions);
      this.page = await this.browser.newPage();

      // Set viewport
      await this.page.setViewport({ width: 1920, height: 1080 });

      // Set realistic user agent
      await this.page.setUserAgent(REALISTIC_USER_AGENT);

      // Override navigator.webdriver to hide automation
      await this.page.evaluateOnNewDocument(`
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
      `);

      console.log("✅ Browser initialized");
    } catch (error) {
      console.error("Browser initialization error:", error);
      throw error;
    }
  }

  async navigate(url: string): Promise<void> {
    if (!this.page) throw new Error("Browser not initialized");

    try {
      await this.page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    } catch (error) {
      console.error(`Navigation error for ${url}:`, error);
      throw error;
    }
  }

  async click(selector: string): Promise<void> {
    if (!this.page) throw new Error("Browser not initialized");

    try {
      await this.page.click(selector);
    } catch (error) {
      console.error(`Click error for selector ${selector}:`, error);
      throw error;
    }
  }

  async type(selector: string, text: string, humanLike = false): Promise<void> {
    if (!this.page) throw new Error("Browser not initialized");

    try {
      if (humanLike) {
        // Type character by character with variable delays
        await this.page.click(selector);
        for (const char of text) {
          await this.page.keyboard.type(char, {
            delay: 30 + Math.random() * 120,
          });
        }
      } else {
        await this.page.type(selector, text, { delay: 50 });
      }
    } catch (error) {
      console.error(`Type error for selector ${selector}:`, error);
      throw error;
    }
  }

  async waitForSelector(
    selector: string,
    timeout: number = 5000
  ): Promise<void> {
    if (!this.page) throw new Error("Browser not initialized");

    try {
      await this.page.waitForSelector(selector, { timeout });
    } catch (error) {
      console.error(`Timeout waiting for selector ${selector}`, error);
      throw error;
    }
  }

  async getContent(): Promise<string> {
    if (!this.page) throw new Error("Browser not initialized");
    return this.page.content();
  }

  async evaluate<T>(fn: () => T): Promise<T> {
    if (!this.page) throw new Error("Browser not initialized");
    return this.page.evaluate(fn);
  }

  async screenshot(filePath: string): Promise<void> {
    if (!this.page) throw new Error("Browser not initialized");
    await this.page.screenshot({ path: filePath, fullPage: true });
  }

  getPage(): Page {
    if (!this.page) throw new Error("Browser not initialized");
    return this.page;
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
      console.log("🛑 Browser closed");
    }
  }

  isInitialized(): boolean {
    return this.browser !== null && this.page !== null;
  }
}

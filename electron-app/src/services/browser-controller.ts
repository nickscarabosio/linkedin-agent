import puppeteer, { Browser, Page } from "puppeteer-core";

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

      const launchOptions: any = {
        headless: "new",
        timeout: 30000,
      };

      if (this.chromePath) {
        launchOptions.executablePath = this.chromePath;
      }

      this.browser = await puppeteer.launch(launchOptions);
      this.page = await this.browser.newPage();

      // Set viewport
      await this.page.setViewport({ width: 1920, height: 1080 });

      // Set user agent
      await this.page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      );

      console.log("✅ Browser initialized");
    } catch (error) {
      console.error("Browser initialization error:", error);
      throw error;
    }
  }

  async navigate(url: string): Promise<void> {
    if (!this.page) throw new Error("Browser not initialized");

    try {
      await this.page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
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

  async type(selector: string, text: string): Promise<void> {
    if (!this.page) throw new Error("Browser not initialized");

    try {
      await this.page.type(selector, text, { delay: 50 });
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

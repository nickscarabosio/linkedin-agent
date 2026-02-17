import { BrowserController } from "./browser-controller";
import {
  randomDelay,
  thinkingPause,
  readingPause,
  microPause,
  typingDelay,
} from "./human-behavior";
import fs from "fs";
import path from "path";
import os from "os";

interface LinkedInCredentials {
  username: string;
  password: string;
}

interface ScrapedCandidate {
  name: string;
  title: string;
  company: string;
  location: string;
  linkedin_url: string;
}

export class LinkedInService {
  private cookiePath: string;
  private credentials?: LinkedInCredentials;

  constructor(private browser: BrowserController, credentials?: LinkedInCredentials, userId?: string) {
    this.credentials = credentials;
    const cookieSuffix = userId ? `linkedin-cookies-${userId}.json` : "linkedin-cookies.json";
    this.cookiePath = path.join(os.homedir(), ".hood-hero", cookieSuffix);
  }

  /** Log in to LinkedIn, restoring cookies if available */
  async login(): Promise<void> {
    const page = this.browser.getPage();

    // Try to restore cookies
    if (fs.existsSync(this.cookiePath)) {
      try {
        const cookies = JSON.parse(fs.readFileSync(this.cookiePath, "utf-8"));
        await page.setCookie(...cookies);
        console.log("🍪 Restored LinkedIn cookies");

        // Navigate to feed to check if session is valid
        await this.browser.navigate("https://www.linkedin.com/feed/");
        await randomDelay(2000, 4000);

        const url = page.url();
        if (!url.includes("/login") && !url.includes("/authwall")) {
          console.log("✅ LinkedIn session restored from cookies");
          return;
        }
        console.log("⚠️ Cookies expired, logging in fresh...");
      } catch (err) {
        console.log("⚠️ Failed to restore cookies, logging in fresh...");
      }
    }

    // Navigate to login page
    await this.browser.navigate("https://www.linkedin.com/login");
    await thinkingPause();

    // Use injected credentials or fall back to env vars for backward compat
    const username = this.credentials?.username || process.env.LINKEDIN_USERNAME;
    const password = this.credentials?.password || process.env.LINKEDIN_PASSWORD;

    if (!username || !password) {
      throw new Error("LinkedIn credentials not available. Set them via the dashboard or in .env");
    }

    // Type username with human-like speed
    await page.click("#username");
    await microPause();
    for (const char of username) {
      await page.keyboard.type(char, { delay: typingDelay() });
    }

    await microPause();

    // Type password
    await page.click("#password");
    await microPause();
    for (const char of password) {
      await page.keyboard.type(char, { delay: typingDelay() });
    }

    await thinkingPause();

    // Click sign in
    await page.click('button[type="submit"]');

    // Wait for navigation — could land on feed, 2FA, or security check
    await randomDelay(3000, 6000);

    const currentUrl = page.url();

    // Check for 2FA / verification challenge
    if (
      currentUrl.includes("checkpoint") ||
      currentUrl.includes("challenge")
    ) {
      console.log("🔐 2FA or security challenge detected. Please complete it manually in the browser.");
      console.log("⏳ Waiting up to 120 seconds for manual 2FA...");

      // Poll until we leave the challenge page
      const start = Date.now();
      while (Date.now() - start < 120000) {
        await randomDelay(2000, 3000);
        const url = page.url();
        if (url.includes("/feed") || url.includes("/mynetwork")) {
          break;
        }
      }

      const finalUrl = page.url();
      if (finalUrl.includes("checkpoint") || finalUrl.includes("challenge")) {
        throw new Error("2FA was not completed within 120 seconds");
      }
    }

    // Verify we're logged in
    const finalUrl = page.url();
    if (finalUrl.includes("/login") || finalUrl.includes("/authwall")) {
      throw new Error("LinkedIn login failed — still on login page");
    }

    console.log("✅ LinkedIn login successful");

    // Save cookies for next session
    await this.saveCookies();
  }

  /** Search LinkedIn and scrape candidate cards from results */
  async findCandidates(searchUrl: string): Promise<ScrapedCandidate[]> {
    try {
      console.log(`🔍 Searching LinkedIn: ${searchUrl}`);
      const page = this.browser.getPage();
      const candidates: ScrapedCandidate[] = [];

      // Navigate to search URL
      await this.browser.navigate(searchUrl);
      await readingPause();

      // Scrape up to 2 pages
      for (let pageNum = 0; pageNum < 2; pageNum++) {
        if (pageNum > 0) {
          // Scroll down to load more, then click next page
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
          await readingPause();

          const nextBtn = await page.$('button[aria-label="Next"]');
          if (!nextBtn) break;
          await nextBtn.click();
          await readingPause();
        }

        // Scroll through the page to trigger lazy loading
        for (let i = 0; i < 3; i++) {
          await page.evaluate((scrollY) => window.scrollBy(0, scrollY), 400 + Math.random() * 300);
          await randomDelay(800, 1500);
        }

        // Scrape using profile link anchors (resilient to CSS class name changes)
        const results = await page.evaluate(() => {
          const seen = new Set<string>();
          const items: {
            name: string;
            title: string;
            company: string;
            location: string;
            linkedin_url: string;
          }[] = [];

          // Find all profile links (href contains /in/)
          const profileLinks = document.querySelectorAll('a[href*="/in/"]');
          profileLinks.forEach((link) => {
            const anchor = link as HTMLAnchorElement;
            const href = anchor.href?.split("?")[0] || "";

            // Skip non-profile links, duplicates, and nav/footer links
            if (!href.match(/linkedin\.com\/in\/[^/]+\/?$/)) return;
            if (seen.has(href)) return;

            // The main result link has the name + subtitle text
            const fullText = anchor.textContent?.trim() || "";
            if (!fullText || fullText.length < 3) return;

            // Parse: "Name  • ConnectionDegree\nTitle line\nLocation line"
            // The longer link text contains name + title + location
            // Shorter duplicate just has the name — skip the short ones
            if (fullText.length < 15) return;

            seen.add(href);

            // Truncate at known noise markers (button text, "Current:", "Message")
            const cleanText = fullText
              .replace(/Current:.*$/s, "")
              .replace(/Message\s*$/s, "")
              .replace(/Connect\s*$/s, "")
              .replace(/Follow\s*$/s, "")
              .trim();

            // Split on bullet/dot separator and newlines
            const lines = cleanText.split(/[•\n]/).map(s => s.trim()).filter(Boolean);

            const name = lines[0]
              ?.replace(/\s*\d+(st|nd|rd|th)\+?\s*$/, "")
              .trim() || "";
            const titleLine = (lines[1] || "").slice(0, 200);
            const locationLine = (lines[2] || "").slice(0, 200);

            if (!name) return;

            // Parse "Title | Keywords" or "Title at Company"
            const atIndex = titleLine.lastIndexOf(" at ");
            let title = titleLine;
            let company = "";
            if (atIndex >= 0) {
              title = titleLine.slice(0, atIndex).trim();
              company = titleLine.slice(atIndex + 4).trim();
            }

            items.push({ name, title, company, location: locationLine, linkedin_url: href });
          });

          return items;
        });

        candidates.push(...results);
        console.log(`📄 Page ${pageNum + 1}: found ${results.length} candidates`);

        await randomDelay(2000, 5000);
      }

      console.log(`✅ Total candidates found: ${candidates.length}`);
      return candidates;
    } catch (error) {
      console.error("Error finding candidates:", error);
      return [];
    }
  }

  /** Send a connection request with an optional note */
  async sendConnectionRequest(
    linkedinUrl: string,
    message?: string
  ): Promise<void> {
    try {
      console.log(`📨 Sending connection request to ${linkedinUrl}`);
      const page = this.browser.getPage();

      await this.browser.navigate(linkedinUrl);
      await readingPause();

      // Try clicking the main Connect button
      let connected = false;

      // First try: direct Connect button on profile
      const connectBtn = await page.$('button[aria-label*="Connect" i]');
      if (connectBtn) {
        await connectBtn.click();
        connected = true;
      }

      // Second try: "More" dropdown -> Connect
      if (!connected) {
        const moreBtn = await page.$('button[aria-label="More actions"]');
        if (moreBtn) {
          await moreBtn.click();
          await microPause();

          const dropdownConnect = await page.$(
            'div.artdeco-dropdown__content button span::-p-text(Connect)'
          );
          if (dropdownConnect) {
            await dropdownConnect.click();
            connected = true;
          }
        }
      }

      if (!connected) {
        throw new Error("Could not find Connect button on profile");
      }

      await microPause();

      // If a note is provided, click "Add a note" and type it
      if (message) {
        const addNoteBtn = await page.$('button[aria-label="Add a note"]');
        if (addNoteBtn) {
          await addNoteBtn.click();
          await microPause();

          const noteField = await page.$("#custom-message");
          if (noteField) {
            await noteField.click();
            for (const char of message) {
              await page.keyboard.type(char, { delay: typingDelay() });
            }
          }
        }
      }

      await thinkingPause();

      // Click Send
      const sendBtn = await page.$('button[aria-label="Send invitation"]');
      if (!sendBtn) {
        // Fallback: look for "Send" button in the modal
        const fallbackSend = await page.$('button::-p-text(Send)');
        if (fallbackSend) {
          await fallbackSend.click();
        } else {
          throw new Error("Could not find Send button");
        }
      } else {
        await sendBtn.click();
      }

      await randomDelay(1000, 2000);
      await this.saveCookies();
      console.log("✅ Connection request sent");
    } catch (error) {
      console.error("Error sending connection request:", error);
      throw error;
    }
  }

  /** Send a direct message to a connection */
  async sendMessage(linkedinUrl: string, message: string): Promise<void> {
    try {
      console.log(`💬 Sending message to ${linkedinUrl}`);
      const page = this.browser.getPage();

      await this.browser.navigate(linkedinUrl);
      await readingPause();

      // Click Message button
      const messageBtn = await page.$('button[aria-label*="Message" i]');
      if (!messageBtn) {
        throw new Error("Could not find Message button — may not be connected");
      }
      await messageBtn.click();
      await thinkingPause();

      // Wait for message box to appear
      const msgBox = await page.waitForSelector('div.msg-form__contenteditable[contenteditable="true"]', {
        timeout: 10000,
      });

      if (!msgBox) {
        throw new Error("Message compose box did not appear");
      }

      // Click into the message box and type
      await msgBox.click();
      await microPause();

      for (const char of message) {
        await page.keyboard.type(char, { delay: typingDelay() });
      }

      await thinkingPause();

      // Click send
      const sendBtn = await page.$('button.msg-form__send-button');
      if (!sendBtn) {
        throw new Error("Could not find message Send button");
      }
      await sendBtn.click();

      await randomDelay(1000, 2000);
      await this.saveCookies();
      console.log("✅ Message sent");
    } catch (error) {
      console.error("Error sending message:", error);
      throw error;
    }
  }

  /** Check inbox for new messages (stub for MVP) */
  async checkInbox(): Promise<any[]> {
    console.log("📬 Inbox check not yet implemented (MVP stub)");
    return [];
  }

  /** Persist cookies for session reuse */
  private async saveCookies(): Promise<void> {
    try {
      const page = this.browser.getPage();
      const cookies = await page.cookies();

      const dir = path.dirname(this.cookiePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(this.cookiePath, JSON.stringify(cookies, null, 2));
    } catch (err) {
      console.error("Failed to save cookies:", err);
    }
  }
}

import TelegramBot, { InlineKeyboardMarkup } from "node-telegram-bot-api";
import { Pool } from "pg";
import dotenv from "dotenv";
import { createApiServer } from "./api-server";
import { initNotifier, sendApprovalNotification } from "./telegram-notifier";

dotenv.config();

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN!, { polling: true });
const db = new Pool({ connectionString: process.env.DATABASE_URL });

const CORWIN_CHAT_ID = parseInt(process.env.CORWIN_TELEGRAM_CHAT_ID!);
const NICK_CHAT_ID = parseInt(process.env.NICK_TELEGRAM_CHAT_ID!);
const NOTIFY_CHAT_IDS = [CORWIN_CHAT_ID, NICK_CHAT_ID].filter(id => !isNaN(id));

// Initialize the Telegram notifier so the API server can send notifications
initNotifier(bot, NOTIFY_CHAT_IDS);

// Test database connection
async function testConnection() {
  try {
    const result = await db.query("SELECT NOW()");
    console.log("✅ Database connected:", result.rows[0].now);
  } catch (error) {
    console.error("❌ Database connection failed:", error);
    process.exit(1);
  }
}

// Bot commands
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;

  await bot.sendMessage(
    chatId,
    `🎯 Hood Hero Recruiter Bot\n\n` +
      `Your chat ID: ${chatId}\n\n` +
      `Commands:\n` +
      `/status - System status\n` +
      `/stats - Today's statistics\n` +
      `/help - Help\n\n` +
      `⚠️ Note: Only Corwin can approve messages.`
  );
});

bot.onText(/\/status/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    const campaigns = await db.query(
      "SELECT COUNT(*) as count FROM campaigns WHERE status = 'active'"
    );

    const pendingApprovals = await db.query(
      "SELECT COUNT(*) as count FROM approval_queue WHERE status = 'pending'"
    );

    await bot.sendMessage(
      chatId,
      `📊 System Status\n\n` +
        `Active Campaigns: ${campaigns.rows[0].count}\n` +
        `Pending Approvals: ${pendingApprovals.rows[0].count}`
    );
  } catch (error) {
    console.error("Status command error:", error);
    await bot.sendMessage(chatId, "❌ Error fetching status");
  }
});

bot.onText(/\/stats/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    const today = new Date().toISOString().split("T")[0];

    const stats = await db.query(
      `
      SELECT action_type, COUNT(*) as count
      FROM agent_actions
      WHERE DATE(created_at) = $1
      GROUP BY action_type
    `,
      [today]
    );

    let message = `📈 Today's Activity (${today})\n\n`;

    if (stats.rows.length === 0) {
      message += "No activity yet.";
    } else {
      for (const row of stats.rows) {
        message += `${row.action_type}: ${row.count}\n`;
      }
    }

    await bot.sendMessage(chatId, message);
  } catch (error) {
    console.error("Stats command error:", error);
    await bot.sendMessage(chatId, "❌ Error fetching stats");
  }
});

bot.onText(/\/help/, async (msg) => {
  const chatId = msg.chat.id;

  await bot.sendMessage(
    chatId,
    `ℹ️ Hood Hero Recruiter Bot Help\n\n` +
      `This bot sends you LinkedIn candidates for approval.\n\n` +
      `When you get a candidate message:\n` +
      `✅ Approve - Send the message\n` +
      `❌ Skip - Reject this candidate\n` +
      `⏸️ Pause - Pause the campaign\n\n` +
      `Commands:\n` +
      `/status - See system status\n` +
      `/stats - See today's activity`
  );
});

// Handle callback queries (button presses)
// Callback data format: "action:uuid" (compact to fit Telegram's 64-byte limit)
bot.on("callback_query", async (query) => {
  try {
    const [action, id] = query.data!.split(":");

    switch (action) {
      case "approve":
        await handleApprove(query, id);
        break;
      case "skip":
        await handleSkip(query, id);
        break;
      case "pause":
        await handlePause(query, id);
        break;
      default:
        console.warn("Unknown action:", action);
    }
  } catch (error) {
    console.error("Callback query error:", error);
    await bot.answerCallbackQuery(query.id, {
      text: "❌ Error processing action",
      show_alert: true,
    });
  }
});

async function handleApprove(query: any, approvalId: string) {
  try {
    await db.query(
      "UPDATE approval_queue SET status = 'approved', responded_at = NOW() WHERE id = $1",
      [approvalId]
    );

    await bot.answerCallbackQuery(query.id, { text: "✅ Approved!" });

    await bot.editMessageReplyMarkup(
      { inline_keyboard: [] },
      {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
      }
    );

    console.log(`✅ Approval ${approvalId} marked as approved`);
  } catch (error) {
    console.error("Approve handler error:", error);
    await bot.answerCallbackQuery(query.id, {
      text: "❌ Error approving",
      show_alert: true,
    });
  }
}

async function handleSkip(query: any, approvalId: string) {
  try {
    await db.query(
      "UPDATE approval_queue SET status = 'rejected', responded_at = NOW() WHERE id = $1",
      [approvalId]
    );

    await bot.answerCallbackQuery(query.id, { text: "❌ Skipped" });

    await bot.editMessageReplyMarkup(
      { inline_keyboard: [] },
      {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
      }
    );

    console.log(`❌ Approval ${approvalId} marked as rejected`);
  } catch (error) {
    console.error("Skip handler error:", error);
    await bot.answerCallbackQuery(query.id, {
      text: "❌ Error skipping",
      show_alert: true,
    });
  }
}

async function handlePause(query: any, campaignId: string) {
  try {
    await db.query("UPDATE campaigns SET status = 'paused' WHERE id = $1", [
      campaignId,
    ]);

    await bot.answerCallbackQuery(query.id, { text: "⏸️ Campaign paused" });

    console.log(`⏸️ Campaign ${campaignId} paused`);
  } catch (error) {
    console.error("Pause handler error:", error);
    await bot.answerCallbackQuery(query.id, {
      text: "❌ Error pausing",
      show_alert: true,
    });
  }
}

// Start bot + API server
const API_PORT = parseInt(process.env.API_PORT || "3001", 10);

testConnection().then(() => {
  console.log("🤖 Telegram bot started");
  console.log(`📱 Bot is polling for messages...`);

  // Start Express API server alongside the bot
  const apiApp = createApiServer(db);
  apiApp.listen(API_PORT, () => {
    console.log(`🌐 API server listening on port ${API_PORT}`);
  });
});

// Handle graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n🛑 Shutting down bot...");
  await db.end();
  process.exit(0);
});

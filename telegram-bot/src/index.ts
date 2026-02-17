import TelegramBot from "node-telegram-bot-api";
import { Pool } from "pg";
import dotenv from "dotenv";
import { createApiServer } from "./api-server";
import { initNotifier } from "./telegram-notifier";

dotenv.config();

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN!, {
  polling: { interval: 2000, params: { timeout: 10 } },
});
const db = new Pool({ connectionString: process.env.DATABASE_URL });

// Initialize the Telegram notifier with DB for dynamic recipient lookup
initNotifier(bot, db);

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

  // Check if this chat is already linked to a user
  const linked = await db.query(
    `SELECT name, email FROM users WHERE telegram_chat_id = $1`,
    [chatId]
  );

  if (linked.rows.length > 0) {
    const user = linked.rows[0];
    await bot.sendMessage(
      chatId,
      `🎯 C2C Recruiter Bot\n\n` +
        `Linked as: ${user.name} (${user.email})\n\n` +
        `Commands:\n` +
        `/status - System status\n` +
        `/stats - Today's statistics\n` +
        `/help - Help`
    );
  } else {
    await bot.sendMessage(
      chatId,
      `🎯 C2C Recruiter Bot\n\n` +
        `Your chat ID: ${chatId}\n\n` +
        `To link your account, generate a code from the dashboard and send:\n` +
        `/link <CODE>\n\n` +
        `Commands:\n` +
        `/status - System status\n` +
        `/stats - Today's statistics\n` +
        `/help - Help`
    );
  }
});

// /link <CODE> — link Telegram account to a user
bot.onText(/\/link\s+(\S+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const code = match![1].toUpperCase();

  try {
    // Check if already linked
    const existingLink = await db.query(
      `SELECT name FROM users WHERE telegram_chat_id = $1`,
      [chatId]
    );
    if (existingLink.rows.length > 0) {
      await bot.sendMessage(chatId, `⚠️ This Telegram account is already linked to ${existingLink.rows[0].name}.`);
      return;
    }

    // Find user with this link code
    const result = await db.query(
      `SELECT id, name, email FROM users
       WHERE telegram_link_code = $1
         AND telegram_link_code_expires_at > NOW()
         AND telegram_chat_id IS NULL`,
      [code]
    );

    if (result.rows.length === 0) {
      await bot.sendMessage(chatId, "❌ Invalid or expired code. Generate a new one from the dashboard.");
      return;
    }

    const user = result.rows[0];

    // Link the account
    await db.query(
      `UPDATE users SET telegram_chat_id = $1, telegram_link_code = NULL, telegram_link_code_expires_at = NULL, updated_at = NOW()
       WHERE id = $2`,
      [chatId, user.id]
    );

    // Audit log
    await db.query(
      `INSERT INTO audit_logs (user_id, action, details) VALUES ($1, $2, $3)`,
      [user.id, "telegram_linked", JSON.stringify({ chat_id: chatId })]
    );

    await bot.sendMessage(
      chatId,
      `✅ Linked successfully!\n\nWelcome, ${user.name}! You'll now receive approval notifications here.`
    );

    console.log(`🔗 Telegram linked: ${user.name} (${user.email}) → chat ${chatId}`);
  } catch (error) {
    console.error("Link command error:", error);
    await bot.sendMessage(chatId, "❌ Error linking account. Please try again.");
  }
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
    `ℹ️ C2C Recruiter Bot Help\n\n` +
      `This bot sends you LinkedIn candidates for approval.\n\n` +
      `When you get a candidate message:\n` +
      `✅ Approve - Send the message\n` +
      `❌ Skip - Reject this candidate\n` +
      `⏸️ Pause - Pause the campaign\n\n` +
      `Commands:\n` +
      `/start - Bot info + link status\n` +
      `/link <CODE> - Link your Telegram account\n` +
      `/status - See system status\n` +
      `/stats - See today's activity`
  );
});

// Handle callback queries (button presses)
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
    // Look up user by telegram_chat_id for approved_by_user_id
    const chatId = query.message.chat.id;
    const userResult = await db.query(
      `SELECT id FROM users WHERE telegram_chat_id = $1`,
      [chatId]
    );
    const approvedByUserId = userResult.rows[0]?.id || null;

    await db.query(
      `UPDATE approval_queue SET status = 'approved', responded_at = NOW(), approved_by_user_id = $1 WHERE id = $2`,
      [approvedByUserId, approvalId]
    );

    await bot.answerCallbackQuery(query.id, { text: "✅ Approved!" });

    await bot.editMessageReplyMarkup(
      { inline_keyboard: [] },
      {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
      }
    );

    // Audit log
    if (approvedByUserId) {
      await db.query(
        `INSERT INTO audit_logs (user_id, action, target) VALUES ($1, $2, $3)`,
        [approvedByUserId, "approval_approved", `approval:${approvalId}`]
      );
    }

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
    const chatId = query.message.chat.id;
    const userResult = await db.query(
      `SELECT id FROM users WHERE telegram_chat_id = $1`,
      [chatId]
    );
    const userId = userResult.rows[0]?.id || null;

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

    if (userId) {
      await db.query(
        `INSERT INTO audit_logs (user_id, action, target) VALUES ($1, $2, $3)`,
        [userId, "approval_rejected", `approval:${approvalId}`]
      );
    }

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

// Handle graceful shutdown (SIGTERM from Railway, SIGINT from local)
async function shutdown() {
  console.log("\n🛑 Shutting down bot...");
  await bot.stopPolling();
  await db.end();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

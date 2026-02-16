import TelegramBot, { InlineKeyboardMarkup } from "node-telegram-bot-api";
import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN!, { polling: true });
const db = new Pool({ connectionString: process.env.DATABASE_URL });

const CORWIN_CHAT_ID = parseInt(process.env.CORWIN_TELEGRAM_CHAT_ID!);

interface Approval {
  id: number;
  candidate_name: string;
  candidate_title: string;
  candidate_company: string;
  linkedin_url: string;
  proposed_text: string;
  context: string;
  approval_type: string;
}

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
bot.on("callback_query", async (query) => {
  try {
    const data = JSON.parse(query.data!);

    switch (data.action) {
      case "approve":
        await handleApprove(query, data.id);
        break;
      case "skip":
        await handleSkip(query, data.id);
        break;
      case "pause":
        await handlePause(query, data.campaignId);
        break;
      default:
        console.warn("Unknown action:", data.action);
    }
  } catch (error) {
    console.error("Callback query error:", error);
    await bot.answerCallbackQuery(query.id, {
      text: "❌ Error processing action",
      show_alert: true,
    });
  }
});

async function handleApprove(query: any, approvalId: number) {
  try {
    // Update approval status
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

async function handleSkip(query: any, approvalId: number) {
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

async function handlePause(query: any, campaignId: number) {
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

// Public function to send approval request (called by Electron app)
export async function sendApprovalRequest(approval: Approval) {
  try {
    const message =
      `🎯 New Candidate: ${approval.candidate_name}\n` +
      `📍 ${approval.candidate_title} @ ${approval.candidate_company}\n` +
      `🔗 ${approval.linkedin_url}\n\n` +
      `💬 Proposed Message:\n"${approval.proposed_text}"\n\n` +
      `🤖 Reasoning: ${approval.context}`;

    const keyboard: InlineKeyboardMarkup = {
      inline_keyboard: [
        [
          {
            text: "✅ Approve",
            callback_data: JSON.stringify({
              action: "approve",
              id: approval.id,
            }),
          },
          {
            text: "❌ Skip",
            callback_data: JSON.stringify({ action: "skip", id: approval.id }),
          },
          {
            text: "⏸️ Pause",
            callback_data: JSON.stringify({
              action: "pause",
              campaignId: approval.id,
            }),
          },
        ],
      ],
    };

    await bot.sendMessage(CORWIN_CHAT_ID, message, {
      reply_markup: keyboard,
    });

    console.log(`📨 Approval request sent to Corwin for ${approval.candidate_name}`);
  } catch (error) {
    console.error("Send approval request error:", error);
    throw error;
  }
}

// Start bot
testConnection().then(() => {
  console.log("🤖 Telegram bot started");
  console.log(`📱 Bot is polling for messages...`);
});

// Handle graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n🛑 Shutting down bot...");
  await db.end();
  process.exit(0);
});

# Hood Hero LinkedIn Recruiting Agent - Build Plan

## Immediate Next Steps (Before Code)

### 1. Environment Setup & Accounts

**Required Accounts/Services:**

- [ ] **Railway Account**
  - Sign up at railway.app
  - Add payment method
  - Create new project: "hood-hero-recruiter"

- [ ] **Anthropic API**
  - Sign up at console.anthropic.com
  - Generate API key
  - Add payment method
  - Start with pay-as-you-go

- [ ] **Telegram Bot**
  - Open Telegram, search for @BotFather
  - Send `/newbot` command
  - Name: "Hood Hero Recruiter"
  - Username: something like "hoodHeroRecruiterBot"
  - Save the bot token (looks like: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)
  - Get Corwin's Telegram User ID:
    - Search for @userinfobot on Telegram
    - Send /start
    - Save the numeric ID

- [ ] **LinkedIn Recruiter Lite**
  - Subscribe at linkedin.com/recruiter
  - $170/month
  - Use Corwin's existing LinkedIn account

- [ ] **Development Tools**
  - Node.js 20+ installed
  - VS Code or preferred editor
  - Git
  - PostgreSQL client (TablePlus, pgAdmin, or psql)

---

## 2. Gather Requirements from Corwin

**Information Needed:**

- [ ] **Example Job Descriptions**
  - Get 2-3 current open positions
  - Ideal candidate profiles
  - Must-have vs nice-to-have criteria

- [ ] **Sample Messages**
  - 5-10 actual recruiting messages Corwin has sent
  - Which ones got responses?
  - What's his typical tone/style?

- [ ] **LinkedIn Search URLs**
  - How does Corwin currently find candidates?
  - What search filters does he use?
  - Example search URLs

- [ ] **Working Hours Preferences**
  - What hours should bot operate? (default: 9am-6pm MST)
  - Weekends? (default: no)
  - Any blackout dates?

- [ ] **Response Expectations**
  - How fast should Corwin approve messages? (helps set timeout)
  - Batch approval preference?

---

## 3. Project Initialization

### Repository Structure

```bash
# Create main project directory
mkdir hood-hero-recruiter
cd hood-hero-recruiter

# Initialize git
git init

# Create subprojects
mkdir electron-app
mkdir dashboard
mkdir telegram-bot
mkdir shared

# Create root package.json for workspace
cat > package.json << 'EOF'
{
  "name": "hood-hero-recruiter",
  "version": "1.0.0",
  "private": true,
  "workspaces": [
    "electron-app",
    "dashboard",
    "telegram-bot",
    "shared"
  ]
}
EOF

# Create .gitignore
cat > .gitignore << 'EOF'
node_modules/
.env
.env.local
dist/
build/
*.log
.DS_Store
*.dmg
.vscode/
EOF
```

---

## Phase 1: Foundation (Week 1-2)

### Step 1: Railway Database Setup

**Deploy PostgreSQL:**

1. Go to railway.app
2. Create new project: "hood-hero-recruiter"
3. Add PostgreSQL service
4. Note the connection string (format: `postgresql://user:pass@host:port/db`)

**Initialize Database Schema:**

```bash
# Create schema file
mkdir -p database/migrations

cat > database/migrations/001_initial_schema.sql << 'EOF'
-- See CLAUDE_CODE_SETUP.md for full schema
-- Copy all CREATE TABLE statements from that doc

-- Settings table with defaults
INSERT INTO settings (key, value) VALUES 
('global_rate_limits', '{
  "daily_connection_requests": 15,
  "daily_messages": 20,
  "weekly_connection_cap": 80,
  "min_delay_seconds": 45,
  "max_delay_seconds": 180,
  "working_hours_start": "09:00",
  "working_hours_end": "18:00",
  "timezone": "America/Denver",
  "pause_weekends": true
}'::jsonb),
('connection_strategy', '{
  "wait_after_acceptance_hours": 36,
  "include_note_with_request": true,
  "max_follow_ups": 1,
  "follow_up_delay_days": 7
}'::jsonb),
('ai_settings', '{
  "model": "claude-sonnet-4-5-20250929",
  "temperature": 0.7,
  "max_tokens": 1000
}'::jsonb);
EOF

# Run migration
psql $DATABASE_URL -f database/migrations/001_initial_schema.sql
```

---

### Step 2: Telegram Bot (Build First - Simplest Component)

**Why build this first:** It's the simplest service and validates our architecture.

```bash
cd telegram-bot
npm init -y

# Install dependencies
npm install node-telegram-bot-api dotenv pg

# Install dev dependencies
npm install -D typescript @types/node @types/node-telegram-bot-api ts-node

# Initialize TypeScript
npx tsc --init
```

**Create telegram-bot/src/index.ts:**

```typescript
import TelegramBot from 'node-telegram-bot-api';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN!, { polling: true });
const db = new Pool({ connectionString: process.env.DATABASE_URL });

const CORWIN_CHAT_ID = parseInt(process.env.CORWIN_TELEGRAM_CHAT_ID!);

// Test database connection
async function testConnection() {
  try {
    const result = await db.query('SELECT NOW()');
    console.log('✅ Database connected:', result.rows[0].now);
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    process.exit(1);
  }
}

// Bot commands
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  
  await bot.sendMessage(chatId, 
    `🎯 Hood Hero Recruiter Bot\n\n` +
    `Your chat ID: ${chatId}\n\n` +
    `Commands:\n` +
    `/status - System status\n` +
    `/stats - Today's statistics\n` +
    `/help - Help`
  );
});

bot.onText(/\/status/, async (msg) => {
  const chatId = msg.chat.id;
  
  // Query database for current status
  const campaigns = await db.query(
    "SELECT COUNT(*) as count FROM campaigns WHERE status = 'active'"
  );
  
  const pendingApprovals = await db.query(
    "SELECT COUNT(*) as count FROM approval_queue WHERE status = 'pending'"
  );
  
  await bot.sendMessage(chatId,
    `📊 System Status\n\n` +
    `Active Campaigns: ${campaigns.rows[0].count}\n` +
    `Pending Approvals: ${pendingApprovals.rows[0].count}`
  );
});

bot.onText(/\/stats/, async (msg) => {
  const chatId = msg.chat.id;
  
  const today = new Date().toISOString().split('T')[0];
  
  const stats = await db.query(`
    SELECT action_type, COUNT(*) as count
    FROM agent_actions
    WHERE DATE(created_at) = $1
    GROUP BY action_type
  `, [today]);
  
  let message = `📈 Today's Activity (${today})\n\n`;
  
  for (const row of stats.rows) {
    message += `${row.action_type}: ${row.count}\n`;
  }
  
  await bot.sendMessage(chatId, message || 'No activity today yet.');
});

// Handle callback queries (button presses)
bot.on('callback_query', async (query) => {
  const data = JSON.parse(query.data!);
  
  switch (data.action) {
    case 'approve':
      await handleApprove(query, data.id);
      break;
    case 'skip':
      await handleSkip(query, data.id);
      break;
    case 'pause':
      await handlePause(query, data.campaignId);
      break;
  }
});

async function handleApprove(query: any, approvalId: string) {
  // Update approval status
  await db.query(
    "UPDATE approval_queue SET status = 'approved', responded_at = NOW() WHERE id = $1",
    [approvalId]
  );
  
  // Notify electron app (it polls for approved items)
  
  await bot.answerCallbackQuery(query.id, { text: '✅ Approved!' });
  await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
    chat_id: query.message.chat.id,
    message_id: query.message.message_id
  });
}

async function handleSkip(query: any, approvalId: string) {
  await db.query(
    "UPDATE approval_queue SET status = 'rejected', responded_at = NOW() WHERE id = $1",
    [approvalId]
  );
  
  await bot.answerCallbackQuery(query.id, { text: '❌ Skipped' });
  await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
    chat_id: query.message.chat.id,
    message_id: query.message.message_id
  });
}

async function handlePause(query: any, campaignId: string) {
  await db.query(
    "UPDATE campaigns SET status = 'paused' WHERE id = $1",
    [campaignId]
  );
  
  await bot.answerCallbackQuery(query.id, { text: '⏸️ Campaign paused' });
}

// Public function to send approval request (called by electron app)
export async function sendApprovalRequest(approval: any) {
  const message = 
    `🎯 New Candidate: ${approval.candidateName}\n` +
    `📍 ${approval.candidateTitle} @ ${approval.candidateCompany}\n` +
    `🔗 ${approval.linkedinUrl}\n\n` +
    `💬 Proposed Message:\n"${approval.proposedMessage}"\n\n` +
    `🤖 Reasoning: ${approval.context}`;
  
  await bot.sendMessage(CORWIN_CHAT_ID, message, {
    reply_markup: {
      inline_keyboard: [[
        { text: '✅ Approve', callback_data: JSON.stringify({ action: 'approve', id: approval.id }) },
        { text: '❌ Skip', callback_data: JSON.stringify({ action: 'skip', id: approval.id }) },
        { text: '⏸️ Pause', callback_data: JSON.stringify({ action: 'pause', campaignId: approval.campaignId }) }
      ]]
    }
  });
}

// Start bot
testConnection().then(() => {
  console.log('🤖 Telegram bot started');
  console.log(`📱 Send /start to @${bot.options.polling ? 'your bot' : ''}`);
});
```

**Create telegram-bot/.env:**

```bash
TELEGRAM_BOT_TOKEN=your_token_here
CORWIN_TELEGRAM_CHAT_ID=your_chat_id_here
DATABASE_URL=postgresql://...
```

**Test the bot:**

```bash
npm run dev
# Should see "Database connected" and "Telegram bot started"
# Message the bot on Telegram with /start
```

---

### Step 3: Dashboard (Next.js)

```bash
cd ../dashboard
npx create-next-app@latest . --typescript --tailwind --app --no-src-dir
npm install pg drizzle-orm
npm install -D drizzle-kit

# Install shadcn/ui
npx shadcn-ui@latest init

# Install components we'll need
npx shadcn-ui@latest add button card table badge input textarea select
```

**Create dashboard/lib/db.ts:**

```typescript
import { Pool } from 'pg';

export const db = new Pool({
  connectionString: process.env.DATABASE_URL
});
```

**Create first API route - dashboard/app/api/campaigns/route.ts:**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const result = await db.query(`
      SELECT 
        c.*,
        COUNT(DISTINCT cand.id) as candidate_count,
        COUNT(DISTINCT CASE WHEN cand.status = 'responded' THEN cand.id END) as response_count
      FROM campaigns c
      LEFT JOIN candidates cand ON cand.campaign_id = c.id
      GROUP BY c.id
      ORDER BY c.created_at DESC
    `);
    
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Error fetching campaigns:', error);
    return NextResponse.json({ error: 'Failed to fetch campaigns' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const result = await db.query(`
      INSERT INTO campaigns (
        title, role_title, role_description, ideal_candidate_profile,
        search_criteria, linkedin_search_url, priority
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [
      body.title,
      body.role_title,
      body.role_description,
      body.ideal_candidate_profile,
      body.search_criteria,
      body.linkedin_search_url,
      body.priority || 1
    ]);
    
    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating campaign:', error);
    return NextResponse.json({ error: 'Failed to create campaign' }, { status: 500 });
  }
}
```

**Create simple dashboard page - dashboard/app/page.tsx:**

```typescript
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

async function getCampaigns() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/campaigns`, {
    cache: 'no-store'
  });
  return res.json();
}

export default async function DashboardPage() {
  const campaigns = await getCampaigns();
  
  return (
    <div className="container mx-auto p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Hood Hero Recruiter</h1>
        <Link href="/campaigns/new">
          <Button>+ New Campaign</Button>
        </Link>
      </div>
      
      <div className="grid gap-4">
        {campaigns.map((campaign: any) => (
          <Card key={campaign.id}>
            <CardHeader>
              <CardTitle>{campaign.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">Role</p>
                  <p className="font-medium">{campaign.role_title}</p>
                </div>
                <div>
                  <p className="text-gray-500">Candidates</p>
                  <p className="font-medium">{campaign.candidate_count}</p>
                </div>
                <div>
                  <p className="text-gray-500">Responses</p>
                  <p className="font-medium">{campaign.response_count}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

**Deploy to Railway:**

```bash
# In Railway dashboard:
# 1. Add "New Service" → "Empty Service"
# 2. Connect to GitHub repo
# 3. Set root directory to "dashboard"
# 4. Add environment variables:
#    - DATABASE_URL (reference from Postgres service)
#    - NEXT_PUBLIC_APP_URL (your Railway app URL)
# 5. Deploy
```

---

### Step 4: Electron App (Most Complex)

```bash
cd ../electron-app
npm init -y

# Install dependencies
npm install electron puppeteer-core puppeteer axios dotenv
npm install -D typescript @types/node electron-builder ts-node

# Install React for UI
npm install react react-dom
npm install -D @types/react @types/react-dom
```

**Create electron-app/src/main/index.ts (Main Process):**

```typescript
import { app, BrowserWindow } from 'electron';
import path from 'path';
import { BrowserController } from './browser-controller';
import { LinkedInService } from './linkedin-service';
import { ClaudeClient } from './claude-client';
import { ApiClient } from './api-client';
import dotenv from 'dotenv';

dotenv.config();

let mainWindow: BrowserWindow | null = null;
let browserController: BrowserController;
let linkedinService: LinkedInService;
let claudeClient: ClaudeClient;
let apiClient: ApiClient;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  
  // Load UI (for now, just a simple status page)
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  
  // Initialize services
  browserController = new BrowserController();
  linkedinService = new LinkedInService(browserController);
  claudeClient = new ClaudeClient(process.env.CLAUDE_API_KEY!);
  apiClient = new ApiClient(process.env.RAILWAY_API_URL!);
  
  // Start main loop
  startMainLoop();
}

async function startMainLoop() {
  console.log('🚀 Starting main recruiting loop...');
  
  while (true) {
    try {
      // 1. Check if it's working hours
      if (!await isWorkingHours()) {
        console.log('⏰ Outside working hours, sleeping...');
        await sleep(60000); // Check again in 1 minute
        continue;
      }
      
      // 2. Process pending approvals (check if any got approved)
      await processPendingApprovals();
      
      // 3. Find new candidates to contact
      await findAndContactCandidates();
      
      // 4. Check for new responses
      await checkForResponses();
      
      // Sleep before next iteration
      await sleep(30000); // 30 seconds
      
    } catch (error) {
      console.error('❌ Error in main loop:', error);
      await sleep(60000); // Wait 1 minute before retrying
    }
  }
}

async function processPendingApprovals() {
  // Get approved items from database
  const approved = await apiClient.getApprovedMessages();
  
  for (const approval of approved) {
    try {
      // Send the message
      if (approval.approval_type === 'connection_request') {
        await linkedinService.sendConnectionRequest(
          approval.linkedin_url,
          approval.approved_text || approval.proposed_text
        );
      } else {
        await linkedinService.sendMessage(
          approval.linkedin_url,
          approval.approved_text || approval.proposed_text
        );
      }
      
      // Mark as sent
      await apiClient.markApprovalSent(approval.id);
      
      // Log action
      await apiClient.logAction({
        candidate_id: approval.candidate_id,
        action_type: approval.approval_type,
        success: true
      });
      
      // Random delay
      await sleep(randomDelay());
      
    } catch (error) {
      console.error('Failed to send approved message:', error);
      await apiClient.markApprovalFailed(approval.id, error.message);
    }
  }
}

async function findAndContactCandidates() {
  // Check rate limits
  const canContact = await apiClient.checkRateLimits('message_sent');
  if (!canContact) {
    console.log('⚠️ Rate limit reached for today');
    return;
  }
  
  // Get qualified candidates who haven't been contacted
  const candidates = await apiClient.getQualifiedCandidates();
  
  if (candidates.length === 0) {
    console.log('✅ No new candidates to contact');
    return;
  }
  
  for (const candidate of candidates.slice(0, 5)) { // Process up to 5 per cycle
    try {
      // Generate message using Claude
      const { message, reasoning } = await claudeClient.generateMessage(candidate);
      
      // Create approval request
      await apiClient.createApprovalRequest({
        candidate_id: candidate.id,
        candidate_name: candidate.name,
        candidate_title: candidate.title,
        candidate_company: candidate.company,
        linkedin_url: candidate.linkedin_url,
        proposed_message: message,
        context: reasoning,
        approval_type: 'message'
      });
      
      console.log(`📝 Created approval request for ${candidate.name}`);
      
    } catch (error) {
      console.error(`Failed to process candidate ${candidate.id}:`, error);
    }
  }
}

async function checkForResponses() {
  // Implementation for monitoring LinkedIn inbox
  // For now, placeholder
  console.log('📬 Checking for responses...');
}

function isWorkingHours(): boolean {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();
  
  // Weekend check
  if (day === 0 || day === 6) return false;
  
  // Working hours: 9am-6pm
  if (hour < 9 || hour >= 18) return false;
  
  return true;
}

function randomDelay(): number {
  return Math.floor(Math.random() * (180000 - 45000 + 1)) + 45000; // 45-180 seconds
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
```

This is a simplified skeleton. The full implementation would include all the services mentioned in CLAUDE_CODE_SETUP.md.

---

## Development Checklist

### Week 1: Infrastructure
- [ ] Set up Railway account and project
- [ ] Deploy PostgreSQL
- [ ] Run database migrations
- [ ] Create Telegram bot
- [ ] Test Telegram bot connectivity
- [ ] Deploy Next.js dashboard to Railway
- [ ] Verify dashboard can query database

### Week 2: Core Services
- [ ] Build Electron app scaffold
- [ ] Implement Puppeteer browser controller
- [ ] Implement LinkedIn session management
- [ ] Build Claude API client
- [ ] Test message generation
- [ ] Test approval workflow (Telegram → Database → Electron)

### Week 3: LinkedIn Automation
- [ ] Implement profile scraping
- [ ] Implement connection request sending
- [ ] Implement message sending
- [ ] Build rate limiting system
- [ ] Add error handling and recovery
- [ ] Test end-to-end flow

### Week 4: Dashboard & Polish
- [ ] Build campaign creation UI
- [ ] Build candidate pipeline view
- [ ] Add analytics/metrics
- [ ] Build settings panel
- [ ] Add logging and monitoring
- [ ] Documentation

### Week 5-6: Testing & Launch
- [ ] Week 1: Manual LinkedIn warm-up (Corwin only)
- [ ] Week 2: Assisted operation with Corwin
- [ ] Week 3: First real campaign
- [ ] Bug fixes and optimization
- [ ] Production deployment

---

## Critical Files Needed

Based on CLAUDE_CODE_SETUP.md, these are the key files you need to create:

**Electron App:**
- `src/main/browser-controller.ts` - Puppeteer wrapper
- `src/main/linkedin-service.ts` - LinkedIn actions
- `src/main/claude-client.ts` - AI integration
- `src/main/api-client.ts` - Railway API calls
- `src/main/rate-limiter.ts` - Rate limiting logic

**Dashboard:**
- `app/api/campaigns/route.ts` - Campaign CRUD
- `app/api/candidates/route.ts` - Candidate management
- `app/api/approvals/route.ts` - Approval queue
- `app/campaigns/page.tsx` - Campaign list
- `app/candidates/page.tsx` - Candidate pipeline

**Telegram Bot:**
- `src/index.ts` - Main bot logic
- `src/handlers/approval-handler.ts` - Button callbacks
- `src/services/notification-service.ts` - Sending approvals

---

## Ready to Start?

**Immediate actions:**

1. **Set up accounts** (Railway, Anthropic, Telegram)
2. **Create Railway project** and deploy PostgreSQL
3. **Run database schema**
4. **Build Telegram bot first** (validate architecture)
5. **Then dashboard** (test APIs)
6. **Finally Electron app** (most complex)

**OR:** Hand this entire document to Claude Code and say:

> "Build the Hood Hero LinkedIn recruiting agent following this build plan. Start with Phase 1, Step 1 (Railway database setup). Use the CLAUDE_CODE_SETUP.md as the technical reference."

Which approach do you want to take?

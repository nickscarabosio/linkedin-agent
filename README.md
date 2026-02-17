# Culture to Cash Recruiter - LinkedIn Automation Agent

Automated LinkedIn recruiting system with human approval workflow.

## Project Structure

- `telegram-bot/` - Telegram approval bot (Node.js)
- `dashboard/` - Campaign management dashboard (Next.js)
- `electron-app/` - LinkedIn automation (Electron + Puppeteer)
- `shared/` - Shared utilities and types

## Tech Stack

- **Backend:** Node.js, Express
- **Frontend:** React, Next.js, Tailwind CSS
- **Desktop:** Electron
- **Database:** PostgreSQL
- **AI:** Claude (Anthropic)
- **Hosting:** Railway
- **Browser Automation:** Puppeteer

## Setup

1. Copy `.env.example` to `.env` in each workspace
2. Add credentials from Railway and Telegram
3. Install: `npm install`
4. Dev: `npm run dev`

## Environment Variables

See `.env.example` files in each workspace.

## Deployment

Dashboard and Telegram bot deploy to Railway.
Electron app runs on local machine.

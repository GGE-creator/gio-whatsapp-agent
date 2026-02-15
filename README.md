# Gio's WhatsApp AI Agent

AI-powered WhatsApp assistant that handles first-level inquiries from giovannieverduin.com.
Built with Claude (Anthropic) + Twilio + Vercel.

## Deploy

1. Clone this repo
2. `npm install`
3. Set env vars in Vercel (see below)
4. `vercel --prod`

## Environment Variables

Set these in Vercel Dashboard → Settings → Environment Variables:

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Claude API key (starts with sk-ant-) |
| `TWILIO_ACCOUNT_SID` | Twilio Account SID (starts with AC) |
| `TWILIO_AUTH_TOKEN` | Twilio Auth Token |
| `TWILIO_WHATSAPP_NUM` | Twilio WhatsApp number (e.g. whatsapp:+14155238886) |
| `GIO_WHATSAPP` | Gio's personal WhatsApp (e.g. whatsapp:+971XXXXXXXXX) |

## Connect Twilio

Set webhook in Twilio Console → Messaging → WhatsApp Sandbox:
- URL: `https://your-app.vercel.app/api/whatsapp`
- Method: POST

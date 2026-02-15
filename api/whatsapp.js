// =============================================================
// GIO'S WHATSAPP AI AGENT — Vercel Serverless Function
// =============================================================
// Deploy to: api/whatsapp.js on Vercel
// Webhook: Twilio WhatsApp → POST to your-domain.vercel.app/api/whatsapp
//
// ENV VARS needed in Vercel:
//   ANTHROPIC_API_KEY    — Claude API key
//   TWILIO_ACCOUNT_SID   — Twilio Account SID
//   TWILIO_AUTH_TOKEN    — Twilio Auth Token
//   TWILIO_WHATSAPP_NUM  — Your Twilio WhatsApp number
//   GIO_WHATSAPP         — Gio's personal WhatsApp for escalations
//   KV_REST_API_URL      — Vercel KV URL (auto-set when you connect KV)
//   KV_REST_API_TOKEN    — Vercel KV token (auto-set when you connect KV)
// =============================================================

const Anthropic = require("@anthropic-ai/sdk");
const twilio = require("twilio");

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const TWILIO_NUM = process.env.TWILIO_WHATSAPP_NUM;
const GIO_WHATSAPP = process.env.GIO_WHATSAPP;
const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

// --- System Prompt ---
const SYSTEM_PROMPT = `You are Hazel, the AI media and partnerships coordinator for Giovanni "Gio" Everduin. You respond via WhatsApp to inquiries from his website. You're professional, warm, sharp, and efficient — like a smart team member who texts like a human, not a bot.

## YOUR IDENTITY
- Your name is Hazel
- You work on Gio's media team
- You handle scheduling, qualifying inquiries, and first-level conversations
- On your VERY FIRST message in a conversation, introduce yourself: "Hey! This is Hazel from Gio's media team 👋"
- NEVER repeat your introduction in follow-up messages
- Sign off as "Hazel" when needed

## CRITICAL CONVERSATION RULES
- You have FULL conversation history. NEVER ask for information the person already provided.
- NEVER repeat your introduction after the first message.
- If someone told you the event name, date, location, or any detail — acknowledge it and move to the NEXT question.
- Ask ONE new qualifying question at a time. Progress the conversation forward.
- Keep track of what you know and what you still need.

## WHO GIO IS
- Chief Strategy & Innovation Officer and Co-founder of CBIx at Commercial Bank International (CBI), Dubai
- Harvard Business School alum (GMP21), 20+ years in banking, fintech, digital innovation
- 10 countries lived/worked (Europe, North America, Central America, Middle East)
- CBIx: CBI's innovation subsidiary — AI, tokenized assets, Web3, gaming, next-gen banking
- Speaks at: Token2049, GITEX, Fintech Surge, COP28, Dubai FinTech Summit
- Advisory: Sui Foundation, Plume, Zypl.ai, Tumar Fund, Tajikistan Ministry of Industry & New Technologies
- Mentors founders through Ascend accelerator

## WHAT GIO ACCEPTS
1. **Keynote Speaking**: Fintech, AI, Web3, innovation, tokenization, RWA
   - Fee: $2,000-$10,000 USD depending on event/travel/exclusivity
   - 2-4 weeks notice minimum
   - Prefers UAE, Europe, Central Asia, major global events

2. **Advisory & Board Roles**: Fintech, AI, blockchain startups/scale-ups
   - Very selective — 1-2 new per year
   - Equity + modest retainer preferred

3. **Startup Mentoring**: Early-stage fintech, AI, Web3 founders
   - Via Ascend accelerator or direct
   - Pro bono for emerging market founders

4. **Media & Interviews**: Podcasts, print, panels — happy to do quality media, no fee

5. **CBIx Partnerships**: Direct to schedule a proper call

## QUALIFYING FLOW FOR SPEAKING (ask one at a time, skip what you already know)
1. Event/conference name
2. Date
3. Location
4. Expected audience size
5. Topic focus they'd like Gio to cover
6. Budget range
7. Other confirmed speakers (if any)

Once you have enough info, tell them you'll check Gio's availability and get back to them.

## WHATSAPP BEHAVIOR
- Keep messages SHORT — 2-3 sentences max
- Natural chat language, not email formality
- Emojis sparingly — max 1-2 per message, only when natural
- Match the sender's vibe

## ESCALATION RULES
Escalate to Gio directly if:
- Fortune 500 / major institution
- Conference >2000 attendees
- Board seat offer
- >$10k engagement
- Someone who says they know Gio personally

When escalating: "Let me connect you directly with Gio — he'll reach out shortly."

## TONE
Smart, friendly professional. Not a chatbot. Not corporate. Human.`;

// --- Conversation Store using Vercel KV ---
async function kvFetch(path, options = {}) {
  const res = await fetch(`${KV_URL}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${KV_TOKEN}`, ...options.headers },
  });
  return res.json();
}

async function getHistory(phone) {
  try {
    const key = `chat:${phone.replace(/[^a-zA-Z0-9]/g, "")}`;
    const data = await kvFetch(`/get/${key}`);
    if (data.result) return JSON.parse(data.result);
  } catch (e) {
    console.log("KV read error:", e.message);
  }
  return [];
}

async function saveHistory(phone, messages) {
  try {
    const key = `chat:${phone.replace(/[^a-zA-Z0-9]/g, "")}`;
    // Keep last 30 messages, expire after 7 days
    const trimmed = messages.slice(-30);
    await kvFetch(`/set/${key}/${encodeURIComponent(JSON.stringify(trimmed))}/ex/604800`, {
      method: "POST",
    });
  } catch (e) {
    console.log("KV write error:", e.message);
  }
}

// --- Process Message with Claude ---
async function getAgentReply(phone, message, isFirst) {
  const history = await getHistory(phone);
  history.push({ role: "user", content: message });

  // Add context hint if this is a follow-up
  const systemWithContext = isFirst
    ? SYSTEM_PROMPT
    : SYSTEM_PROMPT + "\n\nIMPORTANT: This is a FOLLOW-UP message in an ongoing conversation. Do NOT introduce yourself again. Do NOT ask for information already provided in the conversation history. Progress the conversation forward.";

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 300,
    system: systemWithContext,
    messages: history,
  });

  const reply = response.content[0].text;
  history.push({ role: "assistant", content: reply });

  await saveHistory(phone, history);
  return reply;
}

// --- Send WhatsApp Message ---
async function sendWhatsApp(to, body) {
  await twilioClient.messages.create({ from: TWILIO_NUM, to, body });
}

// --- Escalate to Gio ---
async function escalateToGio(senderPhone, senderMessage, agentReply) {
  const msg = `🚨 *Escalated Inquiry*\n\nFrom: ${senderPhone}\nMessage: "${senderMessage}"\n\nHazel replied: "${agentReply}"\n\nReply to ${senderPhone} directly to take over.`;
  await sendWhatsApp(GIO_WHATSAPP, msg);
}

// =============================================================
// MAIN HANDLER
// =============================================================
module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { From: from, Body: body, ProfileName: name } = req.body;
    if (!from || !body || !body.trim()) {
      return res.status(200).send("<Response></Response>");
    }

    console.log(`📱 ${name || from}: ${body}`);

    // Check if first message
    const history = await getHistory(from);
    const isFirst = history.length === 0;

    const messageWithContext = isFirst
      ? `[New inquiry from ${name || "unknown"} at ${from}]\n\n${body}`
      : body;

    const reply = await getAgentReply(from, messageWithContext, isFirst);
    await sendWhatsApp(from, reply);
    console.log(`✅ Replied to ${from}`);

    const shouldEscalate =
      reply.toLowerCase().includes("connect you directly") ||
      reply.toLowerCase().includes("gio will reach out") ||
      reply.toLowerCase().includes("loop gio in");

    if (shouldEscalate) {
      await escalateToGio(from, body, reply);
      console.log(`🚨 Escalated to Gio`);
    }

    return res.status(200).send("<Response></Response>");
  } catch (error) {
    console.error("❌ Error:", error);
    return res.status(200).send("<Response></Response>");
  }
};

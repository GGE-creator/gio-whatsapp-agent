const Anthropic = require("@anthropic-ai/sdk");
const twilio = require("twilio");

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const TWILIO_NUM = process.env.TWILIO_WHATSAPP_NUM;
const GIO_WHATSAPP = process.env.GIO_WHATSAPP;

const SYSTEM_PROMPT = `You are the AI assistant for Giovanni "Gio" Everduin, responding via WhatsApp. You handle first-level inquiries from his website. You're professional, warm, sharp, and efficient — like a smart EA who texts like a human, not a bot.

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

## WHATSAPP-SPECIFIC BEHAVIOR
- Keep messages SHORT — 2-3 sentences max per message
- Use natural chat language, not email formality
- It's okay to send multiple short messages instead of one long one
- Use line breaks for readability
- Emojis sparingly — max 1-2 per message, only when natural
- Ask ONE qualifying question at a time (don't overwhelm)
- For speaking: event name → date → location → audience size → budget (one at a time)
- For advisory: company name → stage → what they need → comp expectations
- Match the sender's vibe — if they're casual, be casual

## ESCALATION RULES
Escalate to Gio directly if:
- Fortune 500 / major institution
- Conference >2000 attendees
- Board seat offer
- >$10k engagement
- Someone who says they know Gio personally
- Anything genuinely important

When escalating, tell the sender: "Let me connect you directly with Gio — he'll reach out shortly."

## TONE
Think: smart, friendly professional on WhatsApp. Not a chatbot. Not corporate. Human.

## SIGN-OFF
First message only: "This is Gio's office — happy to help!"
Don't repeat this intro in follow-ups.
Never pretend to be Gio himself.`;

const conversations = new Map();

function getHistory(phone) {
  return conversations.get(phone) || [];
}

function addMessage(phone, role, content) {
  const history = conversations.get(phone) || [];
  history.push({ role, content });
  if (history.length > 30) history.splice(0, history.length - 30);
  conversations.set(phone, history);
}

async function getAgentReply(phone, message) {
  addMessage(phone, "user", message);
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 300,
    system: SYSTEM_PROMPT,
    messages: getHistory(phone),
  });
  const reply = response.content[0].text;
  addMessage(phone, "assistant", reply);
  return reply;
}

async function sendWhatsApp(to, body) {
  await twilioClient.messages.create({ from: TWILIO_NUM, to, body });
}

async function escalateToGio(senderPhone, senderMessage, agentReply) {
  const msg = `🚨 *Escalated WhatsApp Inquiry*\n\nFrom: ${senderPhone}\nMessage: "${senderMessage}"\n\nAgent replied: "${agentReply}"\n\nReply to ${senderPhone} directly to take over.`;
  await sendWhatsApp(GIO_WHATSAPP, msg);
}

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

    const isFirstMessage = !conversations.has(from);
    const messageWithContext = isFirstMessage
      ? `[New inquiry from ${name || "unknown"} at ${from}]\n\n${body}`
      : body;

    const reply = await getAgentReply(from, messageWithContext);
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

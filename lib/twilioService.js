const twilio = require('twilio');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioNumber = process.env.TWILIO_PHONE_NUMBER;
const caregiverNumber = process.env.CAREGIVER_PHONE_NUMBER;
const publicDomain = process.env.PUBLIC_DOMAIN; // e.g., xxx.ngrok-free.app

let client;
try {
  if (accountSid && authToken) {
    client = twilio(accountSid, authToken);
  } else {
    console.warn('[Twilio] Warning: TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN is missing. Twilio alerts will be disabled.');
  }
} catch (error) {
  console.error('[Twilio] Initialization error:', error);
}

/**
 * Initiates an outbound call to the caregiver and connects it to the Twilio Media Stream
 * endpoint on our server so the caregiver can speak directly to the Gemini Live API.
 * 
 * @param {string} incidentMessage - The initial alert message passed from the app session.
 */
async function notifyCaregiver(incidentMessage) {
  if (!client) {
    console.log(`[Twilio] Simulation Mode - Caregiver would have been called with message: "${incidentMessage}"`);
    return { success: false, reason: 'Twilio client not initialized' };
  }

  if (!twilioNumber || !caregiverNumber || !publicDomain) {
    console.error('[Twilio] Error: Missing phone numbers or PUBLIC_DOMAIN in environment variables.');
    return { success: false, reason: 'Missing env vars (Check PUBLIC_DOMAIN)' };
  }

  try {
    console.log(`[Twilio] Initiating voice call to caregiver at ${caregiverNumber}... Stream URL: wss://${publicDomain}/api/twilio_stream`);
    
    // We use a `<Connect><Stream>` payload. When the call is answered, Twilio will open a WebSocket
    // to our server and begin sending audio bytes, and listening for audio bytes to play back.
    const twimlMessage = `
      <Response>
        <Connect>
          <Stream url="wss://${publicDomain}/api/twilio_stream">
            <Parameter name="incidentContext" value="${incidentMessage}" />
          </Stream>
        </Connect>
      </Response>
    `;

    const call = await client.calls.create({
      twiml: twimlMessage,
      to: caregiverNumber,
      from: twilioNumber
    });

    console.log(`[Twilio] Call successfully initiated! Call SID: ${call.sid}`);
    return { success: true, sid: call.sid };
  } catch (error) {
    console.error('[Twilio] Failed to initiate call:', error);
    return { success: false, error: error.message };
  }
}

module.exports = { notifyCaregiver };

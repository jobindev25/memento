require('dotenv').config();
const { notifyCaregiver } = require('../lib/twilioService');

async function runTest() {
  console.log('--- Testing Twilio Integration ---');
  
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    console.error('Error: Twilio credentials not found in environment.');
    console.log('Please ensure TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are set in your .env file.');
    process.exit(1);
  }

  const testMessage = "Warning. This is a test alert. The patient has left the house at night. Please check immediately.";
  
  console.log(`Sending alert for: "${testMessage}"`);
  const result = await notifyCaregiver(testMessage);

  if (result.success) {
    console.log('✅ Test successful! Call has been initiated.');
    console.log(`Call SID: ${result.sid}`);
  } else {
    console.error('❌ Test failed.');
    console.error(`Reason: ${result.reason || result.error}`);
  }
}

runTest();

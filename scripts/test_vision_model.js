require('dotenv').config({ path: '.env' });
const { GoogleGenAI } = require('@google/genai');

async function testVision() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  console.log("Testing vision on gemini-2.5-flash...");
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        { role: 'user', parts: [{ text: "Can you see the attached image?" }] }
      ]
    });
    console.log("Success with 2.5-flash!");
  } catch(e) { console.error('Error 2.5-flash:', e.message); }

  console.log("\nTesting vision on gemini-2.5-flash-native-audio...");
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-native-audio-latest',
      contents: [
        { role: 'user', parts: [{ text: "Can you see the attached image?" }] }
      ]
    });
    console.log("Success with native-audio!");
  } catch(e) { console.error('Error native-audio:', e.message); }
}

testVision();

require('dotenv').config({ path: '.env' });
const { GoogleGenAI } = require('@google/genai');

async function listSupportedModels() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  try {
    const listResult = await ai.models.list();
    const liveModels = listResult.models.filter(m => 
      m.supportedGenerationMethods && m.supportedGenerationMethods.includes('bidiGenerateContent')
    );
    
    console.log("Models supporting Live API (bidiGenerateContent):");
    liveModels.forEach(m => console.log(`- ${m.name}`));
    
    if (liveModels.length === 0) {
      console.log("No models found supporting bidiGenerateContent with the current key.");
    }
  } catch(e) { 
    console.error('Error:', e.message); 
  }
}

listSupportedModels();

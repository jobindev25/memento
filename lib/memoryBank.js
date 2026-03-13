const { Storage } = require('@google-cloud/storage');
const path = require('path');

// Initialize storage client
let storage;
try {
  // We use the GOOGLE_APPLICATION_CREDENTIALS environment variable directly if it's set
  // This expects the JSON key file to be in the root directory relative to where the server runs
  const keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!keyFilename || keyFilename === 'your-service-account-key.json') {
     console.warn("[MemoryBank] WARNING: GOOGLE_APPLICATION_CREDENTIALS not properly set. Will fallback to local dummy data.");
  } else {
    storage = new Storage({ keyFilename: path.resolve(process.cwd(), keyFilename) });
  }
} catch (error) {
  console.error('[MemoryBank] Failed to initialize Google Cloud Storage client:', error.message);
}

/**
 * Fetches patient context from a specific Google Cloud Storage bucket and formats it
 * into a rich text prompt for the Gemini Live API session.
 * 
 * @param {string} patientId - The prefix/id of the JSON file to look for (e.g. 'patient_001')
 * @returns {Promise<string>} The formatted context string to be injected into system instructions
 */
async function fetchPatientContext(patientId = 'patient_001') {
  const bucketName = process.env.GCP_BUCKET_NAME;

  if (!bucketName || !storage) {
    console.log(`[MemoryBank] GCP Bucket not configured properly. Using local fallback for ${patientId}.`);
    return getLocalFallbackContext();
  }

  try {
    const bucket = storage.bucket(bucketName);
    const file = bucket.file(`${patientId}.json`);
    
    // Check if file exists
    const [exists] = await file.exists();
    if (!exists) {
      console.warn(`[MemoryBank] Profile ${patientId}.json not found in bucket ${bucketName}. Using local fallback.`);
      return getLocalFallbackContext();
    }

    // Download and parse JSON from GCP
    console.log(`[MemoryBank] Downloading profile ${patientId}.json from GCP Storage...`);
    const [contents] = await file.download();
    const patientData = JSON.parse(contents.toString('utf8'));
    
    return formatMemoryBankContext(patientData);
    
  } catch (error) {
    console.error(`[MemoryBank] Critical error fetching from GCP Storage:`, error.message);
    console.log("[MemoryBank] Falling back to local context.");
    return getLocalFallbackContext();
  }
}

/**
 * Formats the raw JSON data into clinical/ambient context instructions for Gemini.
 */
function formatMemoryBankContext(data) {
  let contextBlock = `\n\n--- MEMENTO MEMORY BANK CONTEXT ---\n`;
  contextBlock += `PATIENT NAME: ${data.name}\n`;
  contextBlock += `AGE: ${data.age}\n`;
  contextBlock += `CONDITION: ${data.condition}\n`;
  
  if (data.keyRelationships && data.keyRelationships.length > 0) {
    contextBlock += `\nKNOWN FAMILY/FRIENDS:\n`;
    data.keyRelationships.forEach(rel => {
      contextBlock += `- ${rel.name} (${rel.relationship}): ${rel.notes}\n`;
    });
  }

  if (data.dailyRoutine && data.dailyRoutine.length > 0) {
    contextBlock += `\nDAILY SCHEDULE/ROUTINE:\n`;
    data.dailyRoutine.forEach(rt => {
      contextBlock += `- ${rt.time}: ${rt.activity}\n`;
    });
  }

  if (data.interests && data.interests.length > 0) {
    contextBlock += `\nINTERESTS TO DISCUSS: ${data.interests.join(", ")}\n`;
  }

  if (data.emergencyContact) {
    contextBlock += `\nEMERGENCY CONTACT: ${data.emergencyContact}\n`;
  }

  contextBlock += `\nINSTRUCTION: Treat the above information as absolute fact. If the patient forgets a relationship or schedule item, gently remind them using this data. If they mention one of these names, you already know who it is.`;
  contextBlock += `\n-----------------------------------\n\n`;

  return contextBlock;
}

/**
 * Fallback to the local file if GCP is not yet configured for the demo.
 */
function getLocalFallbackContext() {
  try {
    const fs = require('fs');
    const path = require('path');
    const localData = fs.readFileSync(path.resolve(process.cwd(), 'patient_001.json'), 'utf8');
    return formatMemoryBankContext(JSON.parse(localData));
  } catch(e) {
    console.warn("[MemoryBank] Local fallback also failed. Proceeding with empty context.");
    return "";
  }
}

module.exports = {
  fetchPatientContext
};

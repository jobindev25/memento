# Memento: An Agentic AI Caregiver

Memento is an ambient, always-on AI companion for people living with dementia. Running on a screen in the patient's home, it uses **Gemini's Live API** to see, hear, and respond in real-time—serving as a trusted presence that never leaves the room.

*   **Live Conversation:** Warm, natural voice interactions 24/7.
*   **Visual Orientation:** Proactively identifies objects the patient picks up using Gemini Vision.
*   **Face Recognition:** Recognizes family members from the Memory Bank and greets them by name.
*   **Cinematic Memory Generation:** Uses **Imagen 3** and **Veo 3.1** to generate personalized visual memories on demand.
*   **Caregiver Safety Layer:** Monitors for distress and triggers silent Twilio phone calls to the care team.

---

## 🧪 Reproducible Testing Instructions for Judges

To test Memento, you can either use our live deployed version or run it locally. We highly recommend testing the **Cinematic Memory Generation** and the **Emergency Caregiver Alert**, as they highlight the power of Gemini's agentic function calling.

### Option 1: Test the Live Deployment (Easiest)
1. **Go to the live app:** [https://memento-47880004795.us-central1.run.app](https://memento-47880004795.us-central1.run.app)
2. **Complete Onboarding:** Click "Get Started" and fill out a quick patient profile. Make sure to enter **your own real phone number** in the "Emergency Contact Phone" field (include the country code, e.g., +1234567890).
3. **Open the Companion:** After setup, click "Open Companion Here" and ensure your microphone and camera permissions are granted.
4. **Interact with Memento:** Speak naturally to the AI.

### Option 2: Run Locally
If you prefer to run the code locally, you will need API keys for Gemini, Google Cloud (Imagen/Veo), and Twilio.

1. **Clone the repo:**
   ```bash
   git clone https://github.com/jobindev25/memento.git
   cd memento
   npm install
   ```
2. **Configure Environment Variables:**
   Create a `.env` file in the root directory based on `.env.example`:
   ```env
   GEMINI_API_KEY="your_gemini_api_key_here"
   TWILIO_ACCOUNT_SID="your_twilio_sid"
   TWILIO_AUTH_TOKEN="your_twilio_token"
   TWILIO_PHONE_NUMBER="+1234567890" # Your Twilio sending number
   GCP_BUCKET_NAME="your_gcs_bucket"
   GOOGLE_APPLICATION_CREDENTIALS="/absolute/path/to/gcp-service-account.json"
   ```
3. **Start the Development Server:**
   ```bash
   npm run dev
   ```
4. **Open in Browser:** Navigate to `http://localhost:3000`

---

### 🔥 Must-Try Testing Scenarios (Prompting the AI)

Once the companion is open and listening, try these specific scenarios to trigger our custom tool-calling architecture. *(Make sure to click the screen once to activate audio before speaking).*

**Scenario 1: Triggering a Cinematic Memory (Imagen 3)**
*   **What to say:** *"I feel a bit lonely. I wish I could see my old garden back in Seattle."* (Or any specific visual memory).
*   **What to watch for:** Memento will acknowledge you, silently trigger the `generate_new_memory` tool using Imagen 3 in the background, and seamlessly open the Memory Book interface to display the generated image, all while continuing to speak to you warmly.

**Scenario 2: Triggering the Caregiver Alert (Twilio Function Call)**
*   **What to say:** *"I need to go outside right now. I have to walk to the store, it's very important."* (Act confused/agitated).
*   **What to watch for:** Memento's system prompt is configured to identify this as a wandering risk. It will gently try to calm you down to stay inside, while **simultaneously and silently executing a Twilio API tool call** (`dispatch_caregiver_call`). 
*   **The Result:** The phone number you entered during onboarding will receive an automated voice call from Memento detailing the situation.

**Scenario 3: Object Recognition (Vision)**
*   **What to do:** Hold up a common object to the camera (like a coffee mug, keys, or a medication bottle).
*   **What to say:** *"Do you see what I'm holding?"* or *"What is this for?"*
*   **What to watch for:** Memento will analyze the live video stream using Gemini Multimodal and respond accurately based on what it sees.

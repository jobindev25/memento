const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { WebSocketServer } = require('ws');
const { GoogleGenAI, Modality } = require('@google/genai');
const { WaveFile } = require('wavefile');
const { fetchPatientContext } = require('./lib/memoryBank');
const { notifyCaregiver } = require('./lib/twilioService');
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

let ai = null;
try {
  ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
} catch (e) {
  console.log('[Server] Warning: GoogleGenAI initialization failed. Is GEMINI_API_KEY set?');
}

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const { pathname } = parse(request.url || '', true);
    console.log(`[Upgrade] Incoming request for: ${pathname}`);

    if (pathname === '/api/ws_live') {
      console.log(`[Server] Upgrading to Memento WebSocket...`);
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else if (pathname === '/api/twilio_stream') {
      console.log(`[Server] Upgrading to Twilio Media Stream WebSocket...`);
      wss.handleUpgrade(request, socket, head, (ws) => {
        setupTwilioMediaStream(ws);
      });
    } else {
      console.log(`[Upgrade] Rejected upgrade for: ${pathname}`);
    }
  });

  wss.on('connection', async (ws) => {
    console.log('[Server] Frontend connected');
    let session;
    try {
      if (!ai) {
        ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      }

      // 1. Fetch the patient context from GCP Cloud Storage (Memory Bank)
      // Hardcoding 'patient_001' for the hackathon prototype
      const patientContext = await fetchPatientContext('patient_001');

      // 2. Construct the final system instruction
      const baseInstruction = "You are Memento, an ambient, always-on AI companion for a dementia patient. You are infinitely patient, calming, and proactive. You monitor their visual environment and converse with them. If you observe any emergency or dangerous situation (e.g., wandering at night, a fall, leaving the stove on), you MUST immediately call the dispatch_caregiver_call tool with an incident_message detailing the situation. Otherwise, converse normally and comfortingly.";
      const finalInstruction = baseInstruction + "\n\n" + patientContext;

      session = await ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-latest', // The current Live API model
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: "Aoede" // Calming female voice suited for the Memento persona
              }
            }
          },
          systemInstruction: {
            parts: [{
              text: finalInstruction
            }]
          },
          tools: [{
            functionDeclarations: [{
              name: "dispatch_caregiver_call",
              description: "Call the caregiver with a message detailing an incident or emergency.",
              parameters: {
                type: "OBJECT",
                properties: {
                  incident_message: { type: "STRING" }
                },
                required: ["incident_message"]
              }
            }]
          }]
        },
        callbacks: {
          onmessage: (msg) => {
            try {
              if (msg.toolCall) {
                const functionCalls = msg.toolCall.functionCalls;
                const ftc = functionCalls && functionCalls.find((f) => f.name === 'dispatch_caregiver_call');

                if (ftc) {
                  console.log(`\n\n[ALARM] Caregiver called! Incident: ${ftc.args.incident_message}\n\n`);

                  // Call the Twilio Service
                  try {
                    notifyCaregiver(ftc.args.incident_message);
                  } catch (e) {
                    console.error('[Server] Twilio alert failed:', e);
                  }

                  // Use official typed method for tool response
                  session.sendToolResponse({
                    functionResponses: [{
                      id: ftc.id,
                      name: ftc.name,
                      response: { result: "Caregiver has been notified successfully." }
                    }]
                  });
                }
              }
              if (msg.serverContent && msg.serverContent.modelTurn) {
                const parts = msg.serverContent.modelTurn.parts;
                for (const p of parts) {
                  if (p.inlineData) {
                    console.log("[Server] Received audio part. inlineData.data type:", typeof p.inlineData.data, "isBuffer:", Buffer.isBuffer(p.inlineData.data));

                    // IF it's a buffer, JSON.stringify turns it into an object {type:"Buffer", data:[...]} which breaks frontend!
                    // Let's coerce it to base64 if it's a buffer or object.
                    if (Buffer.isBuffer(p.inlineData.data)) {
                      p.inlineData.data = p.inlineData.data.toString('base64');
                    } else if (p.inlineData.data && typeof p.inlineData.data === 'string' === false) {
                      // It might be a Uint8Array or some other buffer representation
                      p.inlineData.data = Buffer.from(p.inlineData.data).toString('base64');
                    }
                  }
                }
              }

              // Forward the overall object to the frontend
              ws.send(JSON.stringify(msg));
            } catch (e) {
              console.error('[Server] Error handling Gemini message:', e);
            }
          },
          onerror: (e) => {
            console.error('[Server] Gemini connection error:', e);
          },
          onclose: (e) => {
            console.log(`[Server] Gemini connection closed: code ${e?.code}, reason: ${e?.reason}`);
            ws.close();
          }
        }
      });
      console.log('[Server] Connected to Gemini Live API');
    } catch (e) {
      console.error('[Server] Failed to connect to Gemini Live API. Please ensure GEMINI_API_KEY is set in your environment.', e.message);
      ws.close();
      return;
    }

    // Relay Frontend chunks into Gemini Live API Session
    ws.on('message', (data) => {
      try {
        const clientMsg = JSON.parse(data.toString());

        // 1. Forward to the ambient companion session (if active)
        if (session) {
          if (clientMsg.realtimeInput) {
            session.sendRealtimeInput(clientMsg.realtimeInput);
          } else if (clientMsg.clientContent) {
            session.sendClientContent(clientMsg.clientContent);
          }
        }

        // 2. Forward Vision to the Caregiver's Gemini session (if an emergency call is active)
        if (activeTwilioGeminiSession && clientMsg.realtimeInput) {
          const videoPart = clientMsg.realtimeInput.video;
          if (videoPart && videoPart.mimeType && videoPart.mimeType.includes('image')) {
            try {
              activeTwilioGeminiSession.sendRealtimeInput([videoPart]);
            } catch (err) {
              console.error('[Server] Failed to forward vision:', err.message);
            }
          }
        }
      } catch (e) {
        console.error('[Server] Error relaying frontend message:', e);
      }
    });

    ws.on('close', () => {
      console.log('[Server] Frontend disconnected');
    });
  });

  // ==========================================
  // Twilio Media Stream -> Gemini Live Gateway
  // ==========================================
  // ==========================================
  // Twilio Media Stream <-> Gemini Live Gateway
  // ==========================================
  let activeTwilioGeminiSession = null;

  async function setupTwilioMediaStream(ws) {
    let streamSid = null;
    let twilioGeminiSession = null;
    let mediaCount = 0;

    console.log('[Twilio Stream] New connection request.');

    if (!ai) {
      ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    }

    ws.on('message', async (message) => {
      let msg;
      try {
        msg = JSON.parse(message);
      } catch (e) {
        return;
      }

      if (msg.event === 'start') {
        streamSid = msg.start.streamSid;
        const incidentContext = msg.start.customParameters?.incidentContext || "No context provided.";
        console.log(`[Twilio Stream] START received. SID: ${streamSid}. Context: ${incidentContext}`);

        try {
          // Personality: Emergency Response Assistant
          const callInstruction = `You are Memento's Emergency Response Assistant. You are on a phone call with a caregiver because of an emergency.
          Incident: "${incidentContext}".
          Your goal: Calmly explain the situation to the caregiver. Be professional and informative.`;

          twilioGeminiSession = await ai.live.connect({
            model: 'gemini-2.5-flash-native-audio-latest', 
            config: {
              responseModalities: [Modality.AUDIO],
              systemInstruction: { parts: [{ text: callInstruction }] },
              speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } } }
            },
            callbacks: {
              onmessage: (geminiMsg) => {
                if (geminiMsg.serverContent && geminiMsg.serverContent.modelTurn) {
                  const modelTurn = geminiMsg.serverContent.modelTurn;
                    const parts = modelTurn.parts;
                    for (const p of parts) {
                      if (p.inlineData && p.inlineData.data) {
                        try {
                          const audioData = p.inlineData.data;
                          // Gemini: 24kHz PCM16 -> Twilio: 8kHz mu-law
                          const audioBuffer = Buffer.isBuffer(audioData)
                            ? audioData
                            : (typeof audioData === 'string' ? Buffer.from(audioData, 'base64') : Buffer.from(audioData));

                          const pcm16Samples = new Int16Array(audioBuffer.buffer, audioBuffer.byteOffset, audioBuffer.byteLength / 2);

                          for (let i = 0; i < pcm16Samples.length; i++) {
                            pcm16Samples[i] = Math.round(pcm16Samples[i] * 0.8);
                          }

                          let wav = new WaveFile();
                          wav.fromScratch(1, 24000, '16', pcm16Samples);
                          wav.toSampleRate(8000);
                          wav.toMuLaw();

                          const base64Audio = Buffer.from(wav.data.samples).toString('base64');

                          if (ws.readyState === 1 && streamSid) {
                            ws.send(JSON.stringify({
                              event: 'media',
                              streamSid: streamSid,
                              media: { payload: base64Audio }
                            }));
                          }
                        } catch (err) {
                          console.error('[Twilio Stream] OUT Error:', err.message);
                        }
                      }
                    }
                  }
                },
              onerror: (e) => console.error('[Twilio Stream] Gemini Error:', e),
              onclose: () => {
                console.log('[Twilio Stream] Gemini session closed');
                if (twilioGeminiSession === activeTwilioGeminiSession) activeTwilioGeminiSession = null;
                twilioGeminiSession = null;
              }
            }
          });

          activeTwilioGeminiSession = twilioGeminiSession;
          console.log('[Twilio Stream] Gemini session established.');

          // Initial greeting trigger
          twilioGeminiSession.sendClientContent({
            turns: [{ role: 'user', parts: [{ text: "The caregiver has answered the phone. Please introduce yourself and explain the situation." }] }],
            turnComplete: true
          });

        } catch (err) {
          console.error('[Twilio Stream] Connect Failed:', err);
        }
      } else if (msg.event === 'media' && twilioGeminiSession) {
        mediaCount++;
        if (mediaCount % 100 === 0) console.log(`[Twilio Stream] Inbound Activity: ${mediaCount} packets received.`);

        try {
          const muLawBuffer = Buffer.from(msg.media.payload, 'base64');
          let wav = new WaveFile();
          wav.fromScratch(1, 8000, '8m', muLawBuffer);
          wav.fromMuLaw();
          wav.toSampleRate(16000);
          wav.toBitDepth('16');

          const pcmSamples = wav.data.samples;
          const audioPayload = Buffer.from(pcmSamples.buffer, pcmSamples.byteOffset, pcmSamples.byteLength).toString('base64');

          twilioGeminiSession.sendRealtimeInput([{
            mimeType: 'audio/pcm;rate=16000',
            data: audioPayload
          }]);
        } catch (err) {
          // Skip media errors
        }
      } else if (msg.event === 'stop') {
        console.log(`[Twilio Stream] STOP received for SID: ${streamSid}`);
        if (twilioGeminiSession) {
          twilioGeminiSession.close();
          twilioGeminiSession = null;
        }
      }
    });

    ws.on('close', () => {
      console.log('[Twilio Stream] WebSocket Closed');
      if (twilioGeminiSession) {
        twilioGeminiSession.close();
        twilioGeminiSession = null;
      }
    });
  }

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://localhost:${PORT}`);
  });
});

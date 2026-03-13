const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { WebSocketServer } = require('ws');
const { GoogleGenAI, Modality } = require('@google/genai');
const { fetchPatientContext } = require('./lib/memoryBank');
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
    
    if (pathname === '/api/ws_live') {
      console.log(`[Server] Upgrading to Memento WebSocket...`);
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else if (request.url?.startsWith('/_next/webpack-hmr')) {
    } else {
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
            } catch(e) {
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

    // Relay Frontend chunks into Gemini Live API Session using official methods
    ws.on('message', (data) => {
      try {
        if (session) {
          const clientMsg = JSON.parse(data.toString());
          if (clientMsg.realtimeInput) {
            session.sendRealtimeInput(clientMsg.realtimeInput);
          } else if (clientMsg.clientContent) {
            // Unlikely from this frontend, but just in case
            if (session.sendClientContent) session.sendClientContent(clientMsg.clientContent);
            else if (session.conn) session.conn.send(data.toString());
          } else if (session.conn) {
            // Fallback for undocumented or control signals
            if (session.conn.readyState === 1) {
              session.conn.send(data.toString());
            }
          }
        }
      } catch(e) {
        console.error('[Server] Error sending to Gemini:', e);
      }
    });

    ws.on('close', () => {
      console.log('[Server] Frontend disconnected');
    });
  });

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://localhost:${PORT}`);
  });
});

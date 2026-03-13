"use client";

import { useEffect, useRef, useState } from "react";

export default function Home() {
  const [isConnected, setIsConnected] = useState(false);
  const [status, setStatus] = useState("Ready to connect");
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const speakingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Audio Context for receiving and playing audio
  const playAudioContextRef = useRef<AudioContext | null>(null);
  const nextPlayTimeRef = useRef<number>(0);

  // Audio Context for recording audio
  const recordingAudioContextRef = useRef<AudioContext | null>(null);

  const connectToMemento = async () => {
    try {
      // Create AudioContext immediately upon user gesture (button click) to satisfy browser autoplay policy
      playAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 24000, 
      });
      nextPlayTimeRef.current = 0;

      setStatus("Requesting permissions...");
      let stream: MediaStream | null = null;
      try {
        // First try to get both audio and video
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { channelCount: 1, sampleRate: 16000 },
          video: { width: 320, height: 240, frameRate: 5 },
        });
      } catch (videoErr) {
        console.warn("Could not get video stream. Trying audio only...", videoErr);
        try {
          // Fallback to audio only
          stream = await navigator.mediaDevices.getUserMedia({
            audio: { channelCount: 1, sampleRate: 16000 },
          });
        } catch (audioErr) {
          console.error("No camera AND no microphone found. Establishing text-only AI connection.", audioErr);
        }
      }

      if (stream && videoRef.current && stream.getVideoTracks().length > 0) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }

      setStatus("Connecting to Memento...");
      
      // We use the same host, path is the one from our custom server
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/api/ws_live`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setStatus(stream ? "Connected to AI Companion" : "Connected (No Media Capabilities)");

        if (stream) {
          startRealtimeAudioStreaming(stream);
          startRealtimeVideoStreaming();
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          
          if (msg.serverContent?.modelTurn?.parts) {
            const parts = msg.serverContent.modelTurn.parts;
            for (const part of parts) {
              if (part.inlineData && part.inlineData.mimeType.startsWith("audio/pcm")) {
                playBase64Pcm(part.inlineData.data);
              }
            }
          }
        } catch (err) {
          console.error("Error parsing message", err);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        setStatus("Disconnected");
        stopStreaming();
      };
      
      ws.onerror = (e) => {
        console.error("WebSocket error", e);
        setStatus("Connection Error");
      };

    } catch (err) {
      console.error(err);
      setStatus("Error: Could not access camera/mic");
    }
  };

  const startRealtimeAudioStreaming = (stream: MediaStream) => {
    if (!wsRef.current) return;
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    const context = new AudioContext({ sampleRate: 16000 });
    recordingAudioContextRef.current = context;

    const source = context.createMediaStreamSource(stream);
    const processor = context.createScriptProcessor(2048, 1, 1);

    source.connect(processor);
    processor.connect(context.destination);

    processor.onaudioprocess = (e) => {
      const channelData = e.inputBuffer.getChannelData(0);
      const output = new DataView(new ArrayBuffer(channelData.length * 2));
      for (let i = 0; i < channelData.length; i++) {
        const s = Math.max(-1, Math.min(1, channelData[i]));
        output.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      }

      // Buffer to Base64
      let binary = "";
      const bytes = new Uint8Array(output.buffer);
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const b64 = window.btoa(binary);

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            realtimeInput: {
              audio: {
                mimeType: "audio/pcm;rate=16000",
                data: b64,
              },
            },
          })
        );
      }
    };
  };

  const startRealtimeVideoStreaming = () => {
    // Send 1 frame per second to be ambient but safe
    setInterval(() => {
      const ws = wsRef.current;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      if (ws?.readyState === WebSocket.OPEN && video && canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx && video.videoWidth > 0 && video.videoHeight > 0) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const b64 = canvas.toDataURL("image/jpeg", 0.6).split(",")[1];

          ws.send(
            JSON.stringify({
              realtimeInput: {
                video: {
                  mimeType: "image/jpeg",
                  data: b64,
                },
              },
            })
          );
        }
      }
    }, 1000); // 1 FPS
  };

  const playBase64Pcm = (b64: string) => {
    const ctx = playAudioContextRef.current;
    if (!ctx) return;

    const binaryString = window.atob(b64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const float32Array = new Float32Array(bytes.length / 2);
    const dataView = new DataView(bytes.buffer);
    for (let i = 0; i < float32Array.length; i++) {
      float32Array[i] = dataView.getInt16(i * 2, true) / 32768.0;
    }

    const buffer = ctx.createBuffer(1, float32Array.length, 24000); // Gemini responses are 24kHz
    buffer.getChannelData(0).set(float32Array);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    if (nextPlayTimeRef.current < ctx.currentTime) {
      nextPlayTimeRef.current = ctx.currentTime;
    }
    source.start(nextPlayTimeRef.current);
    nextPlayTimeRef.current += buffer.duration;

    // Set speaking state
    setIsAiSpeaking(true);
    if (speakingTimeoutRef.current) clearTimeout(speakingTimeoutRef.current);
    
    // Calculate when this specific audio buffer will actually finish playing
    const timeUntilEndMs = Math.max(0, (nextPlayTimeRef.current - ctx.currentTime) * 1000);
    
    speakingTimeoutRef.current = setTimeout(() => {
      setIsAiSpeaking(false);
    }, timeUntilEndMs + 200); // 200ms padding
  };

  const stopStreaming = () => {
    if (wsRef.current) wsRef.current.close();
    if (recordingAudioContextRef.current) recordingAudioContextRef.current.close();
    if (playAudioContextRef.current) playAudioContextRef.current.close();
    
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
    }
  };

  useEffect(() => {
    return () => {
      stopStreaming();
    };
  }, []);

  // Format current time for the ambient display
  const [time, setTime] = useState("");
  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <main className={`min-h-screen flex flex-col items-center justify-center p-8 font-sans transition-all duration-[3000ms] ease-in-out ${
      isConnected 
        ? "bg-gradient-to-br from-indigo-900 via-purple-900 to-slate-900 animate-slow-pan" 
        : "bg-gradient-to-br from-slate-900 to-slate-950"
    }`}>
      
      {/* Hidden processing elements */}
      <video ref={videoRef} className="hidden" muted playsInline />
      <canvas ref={canvasRef} width={320} height={240} className="hidden" />

      {/* Ambient Interface */}
      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-2xl relative">
        
        {/* Breathing Aura when connected */}
        <div className={`absolute inset-0 bg-white/5 rounded-full blur-[100px] pointer-events-none transition-opacity duration-1000 ${
          isConnected ? "opacity-100 animate-breathe" : "opacity-0"
        }`} />

        <h1 className="text-[12rem] leading-none font-extralight tracking-tighter text-white/90 drop-shadow-2xl z-10 select-none">
          {time || "..."}
        </h1>
        
        <div className="mt-8 z-10 transition-all duration-700">
          {!isConnected ? (
            <div className="flex flex-col items-center space-y-6">
              <button 
                onClick={connectToMemento}
                className="px-12 py-5 bg-white/10 hover:bg-white/20 text-white/90 text-xl tracking-wide rounded-full backdrop-blur-md transition-all border border-white/20 hover:border-white/40 shadow-[0_0_40px_rgba(255,255,255,0.1)] hover:shadow-[0_0_60px_rgba(255,255,255,0.2)] active:scale-95 flex items-center gap-3"
              >
                <div className="w-3 h-3 rounded-full bg-indigo-400 animate-pulse" />
                Start Companion
              </button>
              <p className="text-white/40 text-sm tracking-widest uppercase">Memento Ambient Display</p>
            </div>
          ) : (
            <div className="flex flex-col items-center space-y-12 animate-fade-in">
              <div className={`flex items-center gap-5 px-8 py-4 backdrop-blur-xl rounded-full border shadow-2xl transition-all duration-500 ${isAiSpeaking ? 'bg-indigo-900/60 border-indigo-400/40 scale-105' : 'bg-black/20 border-white/10 scale-100'}`}>
                 <div className="flex gap-1.5 items-center h-5">
                    {isAiSpeaking ? (
                      <>
                        <div className="w-1.5 h-3 rounded-full bg-indigo-300 animate-[bounce_1s_infinite_ease-in-out]" style={{ animationDelay: "0ms" }} />
                        <div className="w-1.5 h-6 rounded-full bg-indigo-300 animate-[bounce_1s_infinite_ease-in-out]" style={{ animationDelay: "200ms" }} />
                        <div className="w-1.5 h-3 rounded-full bg-indigo-300 animate-[bounce_1s_infinite_ease-in-out]" style={{ animationDelay: "400ms" }} />
                      </>
                    ) : (
                      <>
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                      </>
                    )}
                 </div>
                 <span className={`${isAiSpeaking ? 'text-indigo-100' : 'text-emerald-100/80'} font-medium tracking-wide transition-colors`}>
                   {isAiSpeaking ? 'Speaking...' : 'Listening'}
                 </span>
              </div>
              
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.target as HTMLFormElement;
                  const input = form.elements.namedItem("message") as HTMLInputElement;
                  if (input.value && wsRef.current?.readyState === WebSocket.OPEN) {
                    wsRef.current.send(JSON.stringify({
                      clientContent: {
                        turns: [{ role: "user", parts: [{ text: input.value }] }],
                        turnComplete: true
                      }
                    }));
                    input.value = "";
                  }
                }}
                className="w-full max-w-md opacity-30 hover:opacity-100 focus-within:opacity-100 transition-opacity duration-500"
              >
                <input 
                  name="message"
                  type="text" 
                  placeholder="Type to AI (fallback)..." 
                  className="w-full bg-white/5 border border-white/10 rounded-full px-6 py-3 text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-indigo-400/50 backdrop-blur-md text-center"
                />
              </form>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

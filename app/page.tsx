"use client";

import { useEffect, useRef, useState } from "react";

export default function Home() {
  const [isConnected, setIsConnected] = useState(false);
  const [status, setStatus] = useState("Ready to connect");
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
    <main className="min-h-screen bg-gradient-to-br from-slate-900 to-indigo-950 flex flex-col items-center justify-center p-8 text-neutral-100 font-sans transition-all duration-1000">
      
      {/* Hidden processing elements */}
      <video ref={videoRef} className="hidden" muted playsInline />
      <canvas ref={canvasRef} width={320} height={240} className="hidden" />

      {/* Ambient Interface */}
      <div className="flex-1 flex flex-col items-center justify-center space-y-12">
        <h1 className="text-8xl md:text-9xl font-light tracking-tight text-white/90 drop-shadow-sm">
          {time || "..."}
        </h1>
        
        <div className="relative">
          {isConnected && (
             <div className="absolute -inset-4 bg-indigo-500/20 rounded-full blur-xl animate-pulse"></div>
          )}
          <div className="relative text-2xl font-medium text-indigo-100 flex items-center gap-3 bg-white/5 px-6 py-3 rounded-2xl backdrop-blur-md border border-white/10 shadow-xl">
             <div className={`w-3 h-3 rounded-full ${isConnected ? "bg-emerald-400 animate-pulse" : "bg-rose-400"}`}></div>
             {status}
          </div>
        </div>

        {!isConnected ? (
          <button 
            onClick={connectToMemento}
            className="mt-8 px-10 py-4 bg-white/10 hover:bg-white/20 text-white rounded-full font-semibold transition-all shadow-lg border border-white/10 active:scale-95"
          >
            Start Companion
          </button>
        ) : (
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.target as HTMLFormElement;
              const input = form.elements.namedItem("message") as HTMLInputElement;
              if (input.value && wsRef.current?.readyState === WebSocket.OPEN) {
                // Send a client content message containing text
                wsRef.current.send(JSON.stringify({
                  clientContent: {
                    turns: [{
                      role: "user",
                      parts: [{ text: input.value }]
                    }],
                    turnComplete: true
                  }
                }));
                input.value = "";
              }
            }}
            className="w-full max-w-md pt-8 opacity-50 focus-within:opacity-100 transition-opacity"
          >
            <input 
              name="message"
              type="text" 
              placeholder="Type a message (audio fallback)..." 
              className="w-full bg-white/5 border border-white/10 rounded-full px-6 py-3 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            />
          </form>
        )}
      </div>

    </main>
  );
}

"use client";

import Link from "next/link";
import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface UploadedPhoto {
  id: string;
  name: string;
  previewUrl: string;
  status: 'uploading' | 'enhancing' | 'done' | 'error';
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#040812] flex items-center justify-center text-white">Loading...</div>}>
      <OnboardingContent />
    </Suspense>
  );
}

function OnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const caregiverId = searchParams.get('caregiver') || 'default';

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedPhotos, setUploadedPhotos] = useState<UploadedPhoto[]>([]);
  const [setupComplete, setSetupComplete] = useState(false);
  const [companionUrl, setCompanionUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [phoneError, setPhoneError] = useState('');

  // Form State
  const [formData, setFormData] = useState({
    name: "",
    age: "",
    condition: "",
    emergencyContactName: "",
    emergencyContactPhone: "",
    dailyRoutine: [{ time: "", activity: "" }],
    keyRelationships: [{ name: "", relationship: "", notes: "" }]
  });

  useEffect(() => {
    // Load existing profile data on mount
    const loadProfile = async () => {
      try {
        const res = await fetch(`/api/onboarding?caregiver=${caregiverId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.name) {
            setFormData({
              name: data.name || "",
              age: data.age || "",
              condition: data.condition || "",
              emergencyContactName: data.emergencyContactName || "",
              emergencyContactPhone: data.emergencyContactPhone || "",
              dailyRoutine: data.dailyRoutine?.length ? data.dailyRoutine : [{ time: "", activity: "" }],
              keyRelationships: data.keyRelationships?.length ? data.keyRelationships : [{ name: "", relationship: "", notes: "" }]
            });
          }
        }
      } catch (err) {
        console.error("Failed to load profile", err);
      } finally {
        setIsLoading(false);
      }
    };
    loadProfile();
  }, []);

  const validatePhone = (phone: string) => {
    // E.164 format: + followed by 1 to 15 digits (including country code)
    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    
    // Also allow typical formats as long as it starts with + and has enough digits overall
    // We'll strip spaces/dashes for the actual validation check
    const stripped = phone.replace(/[\s-]/g, '');
    return phoneRegex.test(stripped);
  };

  const nextStep = async () => {
    if (step === 1) {
      if (formData.emergencyContactPhone.trim() !== '' && !validatePhone(formData.emergencyContactPhone)) {
        setPhoneError('Must include country code (e.g., +1 for US/Canada) and valid number');
        return;
      }
       // Save profile data before moving to step 2
       setIsSubmitting(true);
       try {
         await fetch(`/api/onboarding/profile?caregiver=${caregiverId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
         });
       } catch (err) {
         console.error("Failed to save profile", err);
       }
       setIsSubmitting(false);
    }
    setStep(s => Math.min(s + 1, 3));
  };
  const prevStep = () => setStep(s => Math.max(s - 1, 1));

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    if (e.target.name === 'emergencyContactPhone') {
      setPhoneError('');
    }
  };

  const handleRoutineChange = (index: number, field: string, value: string) => {
    const newRoutine = [...formData.dailyRoutine];
    newRoutine[index] = { ...newRoutine[index], [field]: value };
    setFormData({ ...formData, dailyRoutine: newRoutine });
  };

  const addRoutine = () => {
    setFormData({ ...formData, dailyRoutine: [...formData.dailyRoutine, { time: "", activity: "" }] });
  };

  const removeRoutine = (index: number) => {
    const newRoutine = formData.dailyRoutine.filter((_, i) => i !== index);
    setFormData({ ...formData, dailyRoutine: newRoutine });
  };

  const handleRelationshipChange = (index: number, field: string, value: string) => {
    const newRel = [...formData.keyRelationships];
    newRel[index] = { ...newRel[index], [field]: value };
    setFormData({ ...formData, keyRelationships: newRel });
  };

  const addRelationship = () => {
    setFormData({ ...formData, keyRelationships: [...formData.keyRelationships, { name: "", relationship: "", notes: "" }] });
  };

  const removeRelationship = (index: number) => {
    const newRel = formData.keyRelationships.filter((_, i) => i !== index);
    setFormData({ ...formData, keyRelationships: newRel });
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    
    // Format E.164 phone number for Twilio compatibility by stripping spaces/dashes
    const formattedPhone = formData.emergencyContactPhone.replace(/[\s-]/g, '');
    
    const submissionData = {
      ...formData,
      emergencyContactPhone: formattedPhone
    };

    // Save all data before completing
    try {
      await fetch(`/api/onboarding/profile?caregiver=${caregiverId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submissionData)
      });
    } catch (err) {
      console.error("Failed to save profile", err);
    }
    // Build the shareable companion URL strictly linked to this caregiver
    const baseUrl = window.location.origin;
    setCompanionUrl(`${baseUrl}/companion?caregiver=${caregiverId}`);
    setIsSubmitting(false);
    setSetupComplete(true);
  };

  const copyUrl = () => {
    navigator.clipboard.writeText(companionUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleFileUpload = (file: File) => {
    const photoId = `photo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    // Add placeholder to grid immediately
    setUploadedPhotos(prev => [...prev, {
      id: photoId,
      name: file.name,
      previewUrl: '',
      status: 'uploading'
    }]);

    const reader = new FileReader();
    reader.onload = async () => {
      const base64Full = reader.result as string;
      const base64Data = base64Full.split(',')[1]; // strip data:image/...;base64,
      const previewUrl = base64Full; // use the full data URI for preview

      // Update preview image
      setUploadedPhotos(prev => prev.map(p => p.id === photoId ? { ...p, previewUrl } : p));

      try {
        const res = await fetch(`/api/onboarding/upload-photo?caregiver=${caregiverId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: file.name,
            base64Data,
            mimeType: file.type,
            caption: `A family memory of ${formData.name || 'the patient'}`
          })
        });

        if (res.ok) {
          // Mark as enhancing (server pipeline runs in background)
          setUploadedPhotos(prev => prev.map(p => p.id === photoId ? { ...p, status: 'enhancing' } : p));
          // After a short delay, mark as done (the pipeline runs async on server)
          setTimeout(() => {
            setUploadedPhotos(prev => prev.map(p => p.id === photoId ? { ...p, status: 'done' } : p));
          }, 8000);
        } else {
          setUploadedPhotos(prev => prev.map(p => p.id === photoId ? { ...p, status: 'error' } : p));
        }
      } catch {
        setUploadedPhotos(prev => prev.map(p => p.id === photoId ? { ...p, status: 'error' } : p));
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-white selection:bg-blue-500/30 font-sans">
      {/* Background Gradients */}
      <div className="fixed inset-0 bg-gradient-to-br from-[#0a1b3f]/20 via-[#0a0e1a] to-[#d4af37]/5 pointer-events-none" />

      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-[#0a0e1a]/80 backdrop-blur-md py-4 border-b border-white/5">
        <div className="max-w-4xl mx-auto px-6 flex justify-between items-center">
          <Link href="/" className="text-[20px] font-serif tracking-widest text-[#F2E6D8] uppercase flex items-center gap-3">
            <span className="text-blue-400">&larr;</span> Memento
          </Link>
          <div className="text-sm font-bold tracking-widest uppercase text-slate-500">
            {setupComplete ? (
              <span className="text-green-400">✓ Setup Complete</span>
            ) : (
              <>Caregiver Setup <span className="text-gold ml-2">Step {step} of 3</span></>
            )}
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="max-w-3xl mx-auto px-6 pt-32 pb-24 relative z-10">
        
        {/* Progress Bar */}
        <div className="flex gap-2 mb-12">
          {[1, 2, 3].map((i) => (
            <div 
              key={i} 
              className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${setupComplete || step >= i ? 'bg-gold' : 'bg-white/10'}`}
            />
          ))}
        </div>

        {/* Form Container */}
        <div className="bg-[#121b2d] border border-blue-500/20 rounded-[32px] p-8 md:p-12 shadow-2xl relative overflow-hidden">
          {/* Subtle Glow */}
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-500/5 blur-[120px] rounded-full pointer-events-none" />

          {/* Setup Steps Container */}
          <div className="relative z-10">
            {setupComplete ? (
              <div className="animate-fade-up text-center py-6">
                {/* Success Icon */}
                <div className="w-20 h-20 bg-green-500/20 border-2 border-green-500/40 rounded-full flex items-center justify-center mx-auto mb-6">
                  <svg className="w-10 h-10 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                </div>

                <h1 className="text-3xl font-serif text-white mb-2">Memento is Ready for {formData.name || 'Your Loved One'}</h1>
                <p className="text-slate-400 mb-10 max-w-md mx-auto">Open this link on the patient's device (tablet, laptop, or phone) to start the AI Companion.</p>

                {/* Shareable URL Box */}
                <div className="bg-[#0a0e1a] border border-blue-500/30 rounded-2xl p-6 mb-8 text-left">
                  <label className="block text-[10px] font-bold tracking-[0.2em] uppercase text-slate-500 mb-3">Companion URL</label>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 bg-[#121b2d] border border-white/10 rounded-xl px-4 py-3 text-blue-300 font-mono text-sm truncate select-all">
                      {companionUrl}
                    </div>
                    <button 
                      onClick={copyUrl}
                      className={`px-5 py-3 rounded-xl font-bold text-xs tracking-widest uppercase transition-all ${
                        copied 
                          ? 'bg-green-500/20 text-green-400 border border-green-500/40' 
                          : 'bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_15px_rgba(37,99,235,0.3)]'
                      }`}
                    >
                      {copied ? '✓ Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>

                {/* Device Instructions */}
                <div className="grid grid-cols-3 gap-4 mb-10">
                  <div className="bg-[#0a0e1a]/50 border border-white/5 rounded-xl p-4 text-center">
                    <div className="text-2xl mb-2">📱</div>
                    <p className="text-[11px] text-slate-400 font-medium">Open on<br/>Tablet</p>
                  </div>
                  <div className="bg-[#0a0e1a]/50 border border-white/5 rounded-xl p-4 text-center">
                    <div className="text-2xl mb-2">💻</div>
                    <p className="text-[11px] text-slate-400 font-medium">Open on<br/>Laptop</p>
                  </div>
                  <div className="bg-[#0a0e1a]/50 border border-white/5 rounded-xl p-4 text-center">
                    <div className="text-2xl mb-2">📺</div>
                    <p className="text-[11px] text-slate-400 font-medium">Open on<br/>Smart Display</p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-center gap-4">
                  <button 
                    onClick={() => router.push(`/companion?caregiver=${caregiverId}`)}
                    className="px-8 py-3 bg-gold hover:bg-amber-400 text-slate-900 font-bold tracking-widest uppercase text-xs rounded-full shadow-[0_0_20px_rgba(212,175,55,0.4)] transition-all"
                  >
                    Open Companion Here
                  </button>
                  <button 
                    onClick={() => { setSetupComplete(false); setStep(1); }}
                    className="px-6 py-3 text-slate-400 font-bold tracking-widest uppercase text-xs hover:text-white transition-colors"
                  >
                    Edit Setup
                  </button>
                </div>
              </div>
            ) : isLoading ? (
               <div className="h-64 flex items-center justify-center">
                 <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gold"></div>
               </div>
            ) : step === 1 ? (
              <div className="animate-fade-up">
                <h1 className="text-3xl font-serif text-white mb-2">Patient Profile</h1>
                <p className="text-slate-400 mb-8">Let's start with the basics to personalize Memento's interactions and ensure safety.</p>
                
                <div className="space-y-6">
                  {/* Name & Age Row */}
                  <div className="flex gap-6">
                    <div className="flex-1">
                      <label className="block text-xs font-bold tracking-widest uppercase text-slate-400 mb-2">Patient Name</label>
                      <input 
                        type="text" 
                        name="name"
                        value={formData.name}
                        onChange={handleChange}
                        placeholder="e.g. Evelyn" 
                        className="w-full bg-[#0a0e1a] border border-white/10 px-4 py-3 rounded-xl focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 outline-none transition-all placeholder:text-slate-600"
                      />
                    </div>
                    <div className="w-1/3">
                      <label className="block text-xs font-bold tracking-widest uppercase text-slate-400 mb-2">Age</label>
                      <input 
                        type="number" 
                        name="age"
                        value={formData.age}
                        onChange={handleChange}
                        placeholder="e.g. 78" 
                        className="w-full bg-[#0a0e1a] border border-white/10 px-4 py-3 rounded-xl focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 outline-none transition-all placeholder:text-slate-600"
                      />
                    </div>
                  </div>

                  <div>
                     <label className="block text-xs font-bold tracking-widest uppercase text-slate-400 mb-2">Medical Profile</label>
                     <input 
                        type="text" 
                        name="condition"
                        value={formData.condition}
                        onChange={handleChange}
                        placeholder="e.g. Early-stage Alzheimer's, mild cognitive impairment..." 
                        className="w-full bg-[#0a0e1a] border border-white/10 px-4 py-3 rounded-xl focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 outline-none transition-all placeholder:text-slate-600"
                      />
                      <p className="text-[11px] text-slate-500 mt-2">Helps the AI adapt its conversational pacing and patience level.</p>
                  </div>

                  <div className="pt-6 mt-6 border-t border-white/5">
                    <h2 className="text-lg font-medium text-white mb-4">Safety Net (Emergency Contact)</h2>
                    <div className="flex gap-6">
                      <div className="flex-1">
                        <label className="block text-xs font-bold tracking-widest uppercase text-slate-400 mb-2">Caregiver Name</label>
                        <input 
                          type="text" 
                          name="emergencyContactName"
                          value={formData.emergencyContactName}
                          onChange={handleChange}
                          placeholder="e.g. Sarah" 
                          className="w-full bg-[#0a0e1a] border border-white/10 px-4 py-3 rounded-xl focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 outline-none transition-all placeholder:text-slate-600"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs font-bold tracking-widest uppercase text-slate-400 mb-2">Phone Number</label>
                        <input 
                          type="tel" 
                          name="emergencyContactPhone"
                          value={formData.emergencyContactPhone}
                          onChange={handleChange}
                          placeholder="e.g. +1 555-0198" 
                          className={`w-full bg-[#0a0e1a] border ${phoneError ? 'border-red-500' : 'border-white/10'} px-4 py-3 rounded-xl focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 outline-none transition-all placeholder:text-slate-600`}
                        />
                        {phoneError && <p className="text-red-400 text-xs mt-2">{phoneError}</p>}
                        <p className="text-[10px] text-slate-500 mt-2">Must include country code (e.g., +1). System will contact this number if distress is detected.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : step === 2 ? (
              <div className="animate-fade-up">
                <h1 className="text-3xl font-serif text-white mb-2">Memory Bank & Routines</h1>
                <p className="text-slate-400 mb-8">Build the knowledge graph the AI uses for grounding and context.</p>
                
                <div className="space-y-10">
                  {/* Daily Routines */}
                  <div>
                    <div className="flex justify-between items-end mb-4">
                      <div>
                        <h2 className="text-lg font-medium text-white mb-1">Daily Routines</h2>
                        <p className="text-xs text-slate-500">The AI will gently remind the patient of these activities at the correct time.</p>
                      </div>
                      <button onClick={addRoutine} className="text-xs tracking-widest uppercase font-bold text-blue-400 hover:text-blue-300 transition-colors bg-blue-500/10 px-4 py-2 rounded-lg">
                        + Add Time
                      </button>
                    </div>
                    
                    <div className="space-y-3">
                      {formData.dailyRoutine.map((routine, idx) => (
                        <div key={idx} className="flex gap-4 items-start bg-[#0a0e1a]/50 p-4 rounded-xl border border-white/5">
                          <div className="w-1/4">
                            <input 
                              type="time" 
                              value={routine.time} 
                              onChange={(e) => handleRoutineChange(idx, "time", e.target.value)}
                              className="w-full bg-[#0a0e1a] border border-white/10 px-3 py-2 rounded-lg focus:border-blue-500/50 outline-none text-sm [color-scheme:dark]"
                            />
                          </div>
                          <div className="flex-1">
                            <input 
                              type="text" 
                              placeholder="e.g. Activity and reminder text..." 
                              value={routine.activity} 
                              onChange={(e) => handleRoutineChange(idx, "activity", e.target.value)}
                              className="w-full bg-[#0a0e1a] border border-white/10 px-3 py-2 rounded-lg focus:border-blue-500/50 outline-none text-sm placeholder:text-slate-600"
                            />
                          </div>
                          <button onClick={() => removeRoutine(idx)} className="text-slate-500 hover:text-red-400 p-2 transition-colors">✕</button>
                        </div>
                      ))}
                      {formData.dailyRoutine.length === 0 && (
                        <div className="text-center py-6 border border-dashed border-white/10 rounded-xl">
                          <p className="text-slate-600 text-sm">No routines added yet.</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Key Relationships */}
                  <div>
                    <div className="flex justify-between items-end mb-4 pt-6 border-t border-white/5">
                      <div>
                        <h2 className="text-lg font-medium text-white mb-1">Key Relationships</h2>
                        <p className="text-xs text-slate-500">Helps the AI recognize and discuss family members.</p>
                      </div>
                      <button onClick={addRelationship} className="text-xs tracking-widest uppercase font-bold text-blue-400 hover:text-blue-300 transition-colors bg-blue-500/10 px-4 py-2 rounded-lg">
                        + Add Person
                      </button>
                    </div>

                    <div className="space-y-4">
                      {formData.keyRelationships.map((rel, idx) => (
                        <div key={idx} className="flex flex-col gap-4">
                            <div className="flex justify-between items-start">
                               <div className="flex gap-4 w-full pr-4">
                                  <input 
                                    type="text" placeholder="Name (e.g. Sarah)" value={rel.name} 
                                    onChange={(e) => handleRelationshipChange(idx, "name", e.target.value)}
                                    className="w-1/2 bg-[#0a0e1a] border border-white/10 px-3 py-2 rounded-lg focus:border-blue-500/50 outline-none text-sm"
                                  />
                                  <input 
                                    type="text" placeholder="Relationship (e.g. Daughter)" value={rel.relationship} 
                                    onChange={(e) => handleRelationshipChange(idx, "relationship", e.target.value)}
                                    className="w-1/2 bg-[#0a0e1a] border border-white/10 px-3 py-2 rounded-lg focus:border-blue-500/50 outline-none text-sm"
                                  />
                               </div>
                               <button onClick={() => removeRelationship(idx)} className="text-slate-500 hover:text-red-400 p-1 transition-colors">✕</button>
                            </div>
                            
                            <div className="flex gap-4 items-center">
                              <div className="w-16 h-16 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
                                {(rel as any).photo ? (
                                  <img src={(rel as any).photo} className="w-full h-full object-cover" />
                                ) : (
                                  <span className="text-xl opacity-20">👤</span>
                                )}
                              </div>
                              <div className="flex-1">
                                <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Face Recognition Photo</label>
                                <input 
                                  type="file" 
                                  accept="image/*"
                                  onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      const reader = new FileReader();
                                      reader.onloadend = () => {
                                        handleRelationshipChange(idx, "photo", reader.result as string);
                                      };
                                      reader.readAsDataURL(file);
                                    }
                                  }}
                                  className="text-[10px] text-slate-400 file:mr-4 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-[10px] file:font-semibold file:bg-blue-500/10 file:text-blue-400 hover:file:bg-blue-500/20 cursor-pointer"
                                />
                                <p className="text-[9px] text-slate-600 mt-1">Helps AI identify them in the video feed.</p>
                              </div>
                            </div>

                            <input 
                              type="text" placeholder="Context notes (e.g. She visits every Sunday...)" value={rel.notes} 
                              onChange={(e) => handleRelationshipChange(idx, "notes", e.target.value)}
                              className="w-full bg-[#0a0e1a] border border-white/10 px-3 py-2 rounded-lg focus:border-blue-500/50 outline-none text-sm placeholder:text-slate-600"
                            />
                          </div>
                      ))}
                      {formData.keyRelationships.length === 0 && (
                        <div className="text-center py-6 border border-dashed border-white/10 rounded-xl">
                          <p className="text-slate-600 text-sm">No family members added yet.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : step === 3 ? (
              <div className="animate-fade-up">
                <h1 className="text-3xl font-serif text-white mb-2">Initiate Memory Book</h1>
                <p className="text-slate-400 mb-8">Upload initial family photos. Memento will enhance and animate them automatically behind the scenes using Imagen 3 and Veo.</p>
                
                <div className="space-y-6">
                  {/* Drag and drop zone */}
                  <div 
                    className={`h-48 flex items-center justify-center border-2 border-dashed rounded-2xl transition-all group cursor-pointer ${isDragging ? 'border-blue-400 bg-blue-500/15 scale-[1.02]' : 'border-blue-500/30 hover:border-blue-400 bg-blue-500/5 hover:bg-blue-500/10'}`}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                      const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
                      files.forEach(handleFileUpload);
                    }}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <input 
                      ref={fileInputRef}
                      type="file" 
                      accept="image/*" 
                      multiple 
                      className="hidden" 
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        files.forEach(handleFileUpload);
                        e.target.value = ''; // reset so same file can be re-selected
                      }}
                    />
                    <div className="text-center">
                      <div className={`w-12 h-12 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-4 transition-transform ${isDragging ? 'scale-125' : 'group-hover:scale-110'}`}>
                         <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                      </div>
                      <p className="text-blue-300 font-medium tracking-wide">{isDragging ? 'Drop photos here!' : 'Click or drag vintage photos here'}</p>
                      <p className="text-slate-500 text-xs mt-2">JPG, PNG up to 10MB</p>
                    </div>
                  </div>

                  {/* Uploaded Photos Grid */}
                  {uploadedPhotos.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-white mb-3 flex justify-between items-center">
                         <span>Uploaded Memories ({uploadedPhotos.length})</span>
                         <span className={`text-xs ${uploadedPhotos.some(p => p.status === 'enhancing') ? 'text-amber-400' : 'text-green-400'}`}>
                            ● {uploadedPhotos.some(p => p.status === 'enhancing') ? 'Pipeline Processing...' : 'All Uploaded'}
                         </span>
                      </h3>
                      <div className="grid grid-cols-3 gap-4">
                         {uploadedPhotos.map((photo) => (
                           <div key={photo.id} className="aspect-square bg-[#0a0e1a]/80 border border-white/10 rounded-xl overflow-hidden relative group">
                              {photo.previewUrl ? (
                                <img src={photo.previewUrl} alt={photo.name} className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-400"></div>
                                </div>
                              )}
                              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                                <p className="text-[10px] text-white truncate">{photo.name}</p>
                                <span className={`text-[9px] uppercase font-bold tracking-widest px-2 py-0.5 rounded mt-1 inline-block ${
                                  photo.status === 'uploading' ? 'bg-blue-500/80 text-white' :
                                  photo.status === 'enhancing' ? 'bg-amber-500/80 text-white' :
                                  photo.status === 'done' ? 'bg-green-500/80 text-white' :
                                  'bg-red-500/80 text-white'
                                }`}>
                                  {photo.status === 'uploading' ? 'Uploading...' :
                                   photo.status === 'enhancing' ? 'Enhancing...' :
                                   photo.status === 'done' ? '✓ Ready' : 'Error'}
                                </span>
                              </div>
                           </div>
                         ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {/* Navigation Buttons (hidden on success screen) */}
            {!setupComplete && (
            <div className="mt-12 flex justify-between items-center border-t border-white/5 pt-8">
              {step > 1 ? (
                <button 
                  onClick={prevStep}
                  className="px-6 py-3 text-slate-400 font-bold tracking-widest uppercase text-xs hover:text-white transition-colors"
                >
                  &larr; Back
                </button>
              ) : <div />}

              {step < 3 ? (
                <button 
                  onClick={nextStep}
                  disabled={isSubmitting}
                  className="px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold tracking-widest uppercase text-xs rounded-full shadow-[0_0_20px_rgba(37,99,235,0.4)] transition-all disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : 'Continue'}
                </button>
              ) : (
                <button 
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="px-8 py-3 bg-gold hover:bg-amber-400 text-slate-900 font-bold tracking-widest uppercase text-xs rounded-full shadow-[0_0_20px_rgba(212,175,55,0.4)] transition-all disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving Profile...' : 'Complete Setup'}
                </button>
              )}
            </div>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}

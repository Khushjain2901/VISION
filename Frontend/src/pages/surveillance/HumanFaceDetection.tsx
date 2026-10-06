import React, { useState, useEffect, useRef } from 'react';
import { User, Eye, UserPlus, Database, ShieldAlert, Camera, Wifi, VideoOff } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { PageHeader, StatCard } from '../../components/common';

const HumanFaceDetection: React.FC = () => {
  const { setCurrentPage } = useAppStore();
  const [isLive, setIsLive] = useState(false);
  const [activeDetections, setActiveDetections] = useState<any[]>([]);
  const [cameraMode, setCameraMode] = useState<'webcam' | 'ipcam' | null>(null);
  const [ipCamFrameBase64, setIpCamFrameBase64] = useState<string | null>(null);
  const [frameSize, setFrameSize] = useState({ width: 640, height: 480 });
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isProcessingFrame = useRef(false);

  useEffect(() => { setCurrentPage('human-face-detection'); }, [setCurrentPage]);

  const startWebcam = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setIsLive(true);
        setCameraMode('webcam');
      }
    } catch (err: any) {
      console.error("Error accessing camera:", err);
      let message = "Could not access camera.";
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        message = "Camera access is BLOCKED by your browser permissions.\n\nTo fix:\n1. Click the Lock/Sliders icon next to 'localhost:5173' in your browser address bar.\n2. Enable 'Camera' permission to Allow.\n3. Refresh the page (F5).";
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        message = "Webcam is currently in use by another application (e.g., Zoom, Teams, Camera App).\n\nPlease close other applications using your webcam and try again.";
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        message = "No webcam hardware detected on this device. Please connect a webcam.";
      } else if (err.message) {
        message += ` (${err.name}: ${err.message})`;
      }
      alert(message);
    }
  };

  const startIpCam = async () => {
    const url = prompt("Enter IP Camera URL (e.g., http://192.168.1.117:8080/video):", "http://192.168.1.117:8080/video");
    if (!url) return;

    try {
      const res = await fetch('http://localhost:8000/api/face/ipcam/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      if (res.ok) {
        setIsLive(true);
        setCameraMode('ipcam');
      } else {
        alert("Failed to start IP Camera.");
      }
    } catch (e) {
      console.error(e);
      alert("Error connecting to backend.");
    }
  };

  const stopFeed = async () => {
    if (cameraMode === 'ipcam') {
      try {
        await fetch('http://localhost:8000/api/face/ipcam/stop', { method: 'POST' });
      } catch (e) { console.error(e); }
    } else {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
        videoRef.current.srcObject = null;
      }
    }
    setIsLive(false);
    setCameraMode(null);
    setActiveDetections([]);
    setIpCamFrameBase64(null);
  };

  const captureAndDetect = async () => {
    if (!videoRef.current || !canvasRef.current || isProcessingFrame.current) return;
    isProcessingFrame.current = true;
    const canvas = canvasRef.current;
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx?.drawImage(videoRef.current, 0, 0);
    
    canvas.toBlob(async (blob) => {
      if (!blob) { isProcessingFrame.current = false; return; }
      const formData = new FormData();
      formData.append('file', blob, 'frame.jpg');
      try {
        const res = await fetch('http://localhost:8000/api/face/recognize', { method: 'POST', body: formData });
        if (res.ok) {
          const data = await res.json();
          setActiveDetections(data.detections || []);
          if (data.frame_width && data.frame_height) {
            setFrameSize({ width: data.frame_width, height: data.frame_height });
          }
        }
      } catch (error) {
        console.error("Recognition error:", error);
      } finally {
        isProcessingFrame.current = false;
      }
    }, 'image/jpeg', 0.6);
  };

  const pollIpCam = async () => {
    try {
      const res = await fetch('http://localhost:8000/api/face/ipcam/poll');
      if (res.ok) {
        const data = await res.json();
        setActiveDetections(data.detections || []);
        if (data.frame_width && data.frame_height) {
          setFrameSize({ width: data.frame_width, height: data.frame_height });
        }
        if (data.frame_base64) {
          setIpCamFrameBase64(data.frame_base64);
        }
      }
    } catch (error) {
      console.error("IP Cam Poll error:", error);
    }
  };

  useEffect(() => {
    let interval: any;
    if (isLive) {
      if (cameraMode === 'webcam') {
        interval = setInterval(captureAndDetect, 150);
      } else if (cameraMode === 'ipcam') {
        interval = setInterval(pollIpCam, 150);
      }
    }
    return () => clearInterval(interval);
  }, [isLive, cameraMode]);

  // Registration Modal State
  const [regName, setRegName] = useState('');
  const [regInfo, setRegInfo] = useState('');
  const [threatLevel, setThreatLevel] = useState(0);
  const [regFile, setRegFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const captureVideoRef = useRef<HTMLVideoElement>(null);

  const stopCapture = () => {
    setIsCapturing(false);
    if (captureVideoRef.current && captureVideoRef.current.srcObject) {
      const stream = captureVideoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      captureVideoRef.current.srcObject = null;
    }
  };

  const startCapture = async () => {
    setIsCapturing(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (captureVideoRef.current) {
        captureVideoRef.current.srcObject = stream;
        captureVideoRef.current.play();
      }
    } catch (err) {
      alert("Could not access webcam for capture.");
      setIsCapturing(false);
    }
  };

  const takeSnapshot = () => {
    if (captureVideoRef.current) {
      const video = captureVideoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (blob) {
            const file = new File([blob], "snapshot.jpg", { type: "image/jpeg" });
            setRegFile(file);
            stopCapture();
          }
        }, 'image/jpeg', 0.9);
      }
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regFile) return alert("Please select a photo");
    setIsSubmitting(true);
    const formData = new FormData();
    formData.append('subject_name', regName);
    formData.append('info_json', JSON.stringify({ notes: regInfo }));
    formData.append('threat_level', threatLevel.toString());
    formData.append('file', regFile);
    try {
      const res = await fetch('http://localhost:8000/api/face/register', { method: 'POST', body: formData });
      if (res.ok) {
        alert(`Successfully registered face for ${regName}`);
        setShowRegisterModal(false);
        setRegName(''); setRegInfo(''); setThreatLevel(0); setRegFile(null);
      } else {
        const err = await res.json();
        alert(`Error: ${err.error}`);
      }
    } catch(err) {
      alert(`Network Error: ${err}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ height: 'calc(100vh - 56px)' }}>
      <PageHeader title="Human & Face Detection"
        subtitle="100% Local AI Face Recognition (YuNet & SFace) + SQLite Sync"
        icon={<User size={16} />}
        actions={
          <div className="flex gap-2">
            {!isLive ? (
              <>
                <button onClick={startWebcam} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded flex items-center gap-2">
                  <Camera size={14} /> WEBCAM FEED
                </button>
                <button onClick={startIpCam} className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded flex items-center gap-2">
                  <Wifi size={14} /> IP CAM FEED
                </button>
              </>
            ) : (
              <button onClick={stopFeed} className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded flex items-center gap-2">
                <VideoOff size={14} /> STOP FEED
              </button>
            )}
            <button onClick={() => setShowRegisterModal(true)} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-xs font-bold border border-border rounded flex items-center gap-2">
              <UserPlus size={14} /> REGISTER FACE
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-4 gap-3 px-4 py-3 shrink-0" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <StatCard icon={<Eye size={16} />} label="Active Feeds" value={isLive ? 1 : 0} sub={cameraMode || "None"} accent="var(--color-primary)" />
        <StatCard icon={<User size={16} />} label="Faces In Frame" value={activeDetections.length} sub="Live Count" accent="var(--color-success)" />
        <StatCard icon={<Database size={16} />} label="DB Sync" value="ACTIVE" sub="SQLite Connected" accent="var(--color-warning)" />
        <StatCard icon={<ShieldAlert size={16} />} label="Matches" value={activeDetections.filter(d => d.database_info).length} sub="Database Hits" accent="var(--color-danger)" />
      </div>

      <div className="flex flex-1 flex-col xl:flex-row overflow-hidden min-h-[600px]">
        <div className="flex-1 flex flex-col p-4 gap-4 overflow-y-auto">
          <div className="card overflow-hidden flex flex-col w-full max-w-5xl mx-auto border-2 relative" style={{ borderColor: 'var(--color-border)', height: '500px' }}>
            {!isLive && (
                <div className="absolute inset-0 flex items-center justify-center z-10" style={{ background: 'rgba(0,0,0,0.7)' }}>
                    <div className="text-center">
                        <Eye size={48} className="mx-auto mb-4" style={{ color: 'var(--color-text-muted)' }} />
                        <h2 className="text-xl font-bold" style={{ color: 'var(--color-text-secondary)' }}>CAMERA OFFLINE</h2>
                        <p className="text-sm mt-2" style={{ color: 'var(--color-text-muted)' }}>Select a feed source to initialize Local AI inference</p>
                    </div>
                </div>
            )}
            
            {cameraMode === 'ipcam' && ipCamFrameBase64 && (
                <img src={`data:image/jpeg;base64,${ipCamFrameBase64}`} className="w-full h-full object-contain bg-black" alt="IP Cam" />
            )}
            <video 
                ref={videoRef}
                className={`w-full h-full object-contain bg-black ${cameraMode === 'ipcam' ? 'hidden' : ''}`}
                playsInline
                muted
            />
            <canvas ref={canvasRef} className="hidden" />
            
            {/* SVG OVERLAY FOR BOXES */}
            {isLive && (() => {
                return (
                  <svg 
                    viewBox={`0 0 ${frameSize.width} ${frameSize.height}`}
                    className="absolute inset-0 w-full h-full"
                    preserveAspectRatio="xMidYMid meet"
                  >
                    {activeDetections.map((det, idx) => {
                      const isMatch = !!det.database_info;
                      
                      let boxColor = '#FF9933'; // Orange for unknown
                      let fillColor = 'rgba(255, 153, 51, 0.2)';
                      
                      if (isMatch) {
                          if (det.database_info.category === 'Criminal') {
                              boxColor = '#ef4444'; // Red for criminal
                              fillColor = 'rgba(239, 68, 68, 0.2)';
                          } else {
                              boxColor = '#10b981'; // Green for normal
                              fillColor = 'rgba(16, 185, 129, 0.2)';
                          }
                      }
                      
                      return (
                        <g key={idx}>
                          <rect 
                            x={det.xmin} y={det.ymin} 
                            width={det.xmax - det.xmin} height={det.ymax - det.ymin} 
                            fill={fillColor} stroke={boxColor} strokeWidth="2"
                          />
                          <rect 
                            x={det.xmin} y={det.ymin - 16} 
                            width={det.xmax - det.xmin} height="16" 
                            fill={boxColor}
                          />
                          <text 
                            x={det.xmin + 2} y={det.ymin - 4} 
                            fill="#000" fontSize="10" fontWeight="bold" fontFamily="monospace"
                          >
                            {det.class.toUpperCase()} {(det.confidence * 100).toFixed(0)}%
                          </text>
                        </g>
                      )
                    })}
                  </svg>
                );
            })()}
          </div>
        </div>

        {/* Right panel - DB Hits */}
        <div className="flex xl:flex-col xl:w-80 shrink-0 p-4 overflow-y-auto border-t-2 xl:border-t-0 xl:border-l-2 gap-4"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-surface)' }}>
            <h3 className="text-xs font-semibold mb-3" style={{ color: 'var(--color-text-secondary)' }}>DATABASE MATCHES</h3>
            
            <div className="space-y-4">
              {activeDetections.filter(d => d.database_info).length === 0 ? (
                <div className="text-center py-6 text-xs text-muted border border-dashed border-border rounded-lg">
                  No registered faces currently in frame.
                </div>
              ) : (
                activeDetections.filter(d => d.database_info).map((det, i) => {
                  const isCriminal = det.database_info.category === 'Criminal';
                  return (
                  <div key={i} className={`p-3 rounded-lg border flex flex-col gap-3 ${isCriminal ? 'border-red-500/30' : 'border-green-500/30'}`}
                    style={{ background: 'var(--color-bg-elevated)' }}>
                    <div className="flex gap-3">
                        <img 
                            src={`data:image/jpeg;base64,${det.database_info.photo_base64}`} 
                            alt={det.class}
                            className="w-16 h-16 object-cover rounded border border-border"
                        />
                        <div>
                            <div className={`${isCriminal ? 'text-red-500' : 'text-green-500'} font-bold text-sm uppercase`}>{det.class}</div>
                            <div className="text-xs text-muted mb-1">Match: {(det.confidence * 100).toFixed(1)}%</div>
                            <div className="flex gap-1">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono border ${isCriminal ? 'bg-red-500/10 text-red-500 border-red-500/20' : 'bg-green-500/10 text-green-500 border-green-500/20'}`}>
                                    {isCriminal ? 'CRIMINAL' : 'NORMAL'}
                                </span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 font-mono border border-blue-500/20">
                                    THREAT: {det.database_info.threat_level}
                                </span>
                            </div>
                        </div>
                    </div>
                    {det.database_info.additional_info?.notes && (
                        <div className="text-xs p-2 rounded bg-black/20 border border-border">
                            <span className="text-muted font-bold">Notes:</span> {det.database_info.additional_info.notes}
                        </div>
                    )}
                  </div>
                )})
              )}
            </div>
        </div>
      </div>

      {showRegisterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.8)' }}>
            <div className="card w-full max-w-md p-6 border border-border">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-lg font-bold text-white">Register New Face</h2>
                    <button onClick={() => { setShowRegisterModal(false); stopCapture(); }} className="text-muted hover:text-white">✕</button>
                </div>
                
                <form onSubmit={handleRegister} className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-muted mb-1">SUBJECT NAME (ID)</label>
                        <input type="text" required value={regName} onChange={e => setRegName(e.target.value)} className="w-full bg-black/50 border border-border rounded px-3 py-2 text-sm text-white" placeholder="e.g. John_Doe" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-muted mb-1">ADDITIONAL INFO</label>
                        <textarea required value={regInfo} onChange={e => setRegInfo(e.target.value)} className="w-full bg-black/50 border border-border rounded px-3 py-2 text-sm text-white h-24" placeholder="Notes..." />
                    </div>
                    <div>
                        <div className="flex justify-between items-end mb-1">
                            <label className="block text-xs font-bold text-muted">THREAT LEVEL (0-100)</label>
                            <span className={`text-xs font-bold ${threatLevel >= 50 ? 'text-red-500' : 'text-green-500'}`}>
                                {threatLevel >= 50 ? 'CRIMINAL' : 'NORMAL'} ({threatLevel})
                            </span>
                        </div>
                        <input 
                            type="range" 
                            min="0" 
                            max="100" 
                            value={threatLevel} 
                            onChange={e => setThreatLevel(parseInt(e.target.value))} 
                            className="w-full"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-muted mb-1">MUGSHOT PHOTO</label>
                        {!isCapturing ? (
                            <div className="space-y-2">
                                <input type="file" accept="image/*" onChange={e => setRegFile(e.target.files?.[0] || null)} className="w-full bg-black/50 border border-border rounded px-3 py-2 text-sm text-white" />
                                <div className="text-center text-xs text-muted">OR</div>
                                <button type="button" onClick={startCapture} className="w-full py-2 bg-black border border-border hover:bg-gray-900 text-white text-sm rounded flex items-center justify-center gap-2">
                                    <Camera size={14} /> CAPTURE FROM CAMERA
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-2 border border-border rounded overflow-hidden">
                                <video ref={captureVideoRef} className="w-full h-48 bg-black object-cover" autoPlay muted playsInline />
                                <div className="flex gap-2 p-2 bg-black/50">
                                    <button type="button" onClick={takeSnapshot} className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded">SNAP</button>
                                    <button type="button" onClick={stopCapture} className="flex-1 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded">CANCEL</button>
                                </div>
                            </div>
                        )}
                    </div>
                    <button type="submit" disabled={isSubmitting} className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold rounded mt-4">
                        {isSubmitting ? 'REGISTERING...' : 'REGISTER FACE'}
                    </button>
                </form>
            </div>
        </div>
      )}
    </div>
  );
};

export default HumanFaceDetection;

import React, { useState, useEffect } from 'react';
import { Car, AlertTriangle, Flag, Search, ChevronRight, Eye, ShieldAlert, CheckCircle, Clock, Camera, Wifi, VideoOff, UploadCloud, Plus, Database, FileVideo } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { SearchBar, FilterButton, SectorBadge, PageHeader, StatCard, Btn } from '../../components/common';
import { VideoPlayerControls } from '../../components/VideoPlayerControls';

const PlateDisplay: React.FC<{ plate: string; riskLevel: string }> = ({ plate, riskLevel }) => {
  const isHighRisk = riskLevel === 'HIGH' || riskLevel === 'CRITICAL';
  const isReview = riskLevel === 'REVIEW';
  
  let bgColor = 'rgba(255,255,255,0.05)';
  let borderColor = 'rgba(255,255,255,0.15)';
  let textColor = '#f1f5f9';
  let badgeColor = '';
  let badgeText = '';

  if (isHighRisk) {
    bgColor = 'rgba(239,68,68,0.15)';
    borderColor = '#ef4444';
    textColor = '#ef4444';
    badgeColor = 'rgba(239,68,68,0.85)';
    badgeText = 'CRITICAL ALERT';
  } else if (isReview) {
    bgColor = 'rgba(234,179,8,0.15)';
    borderColor = '#eab308';
    textColor = '#eab308';
    badgeColor = 'rgba(234,179,8,0.85)';
    badgeText = 'UNDER REVIEW';
  } else {
    bgColor = 'rgba(16,185,129,0.15)';
    borderColor = '#10b981';
    textColor = '#10b981';
    badgeColor = 'rgba(16,185,129,0.85)';
    badgeText = 'CLEAN';
  }

  return (
    <div className="relative camera-feed rounded overflow-hidden" style={{ height: '70px' }}>
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className="px-4 py-2 rounded font-mono font-bold text-lg tracking-widest"
          style={{ background: bgColor, border: `2px solid ${borderColor}`, color: textColor }}
        >
          {plate}
        </div>
      </div>
      <div className="absolute top-1 right-1 text-xs flex items-center gap-1 px-1.5 py-0.5 rounded"
        style={{ background: badgeColor, color: '#fff', fontSize: '9px', fontWeight: 'bold' }}>
        {isHighRisk && <AlertTriangle size={9} />}
        {isReview && <Clock size={9} />}
        {!isHighRisk && !isReview && <CheckCircle size={9} />}
        {badgeText}
      </div>
    </div>
  );
};

const VehicleANPR: React.FC = () => {
  const { setCurrentPage } = useAppStore();
  const [search, setSearch] = useState('');
  const [dirFilter, setDirFilter] = useState('ALL');
  
  // Real-time Detection States
  const [isLive, setIsLive] = useState(false);
  const [cameraMode, setCameraMode] = useState<'webcam' | 'ipcam' | 'file' | null>(null);
  const [activeDetections, setActiveDetections] = useState<any[]>([]);
  const [ipCamFrameBase64, setIpCamFrameBase64] = useState<string | null>(null);
  const [frameSize, setFrameSize] = useState({ width: 640, height: 480 });
  
  // Database States
  const [dbVehicles, setDbVehicles] = useState<any[]>([]);
  const [suspiciousVehicles, setSuspiciousVehicles] = useState<any[]>([]);
  const [showDbModal, setShowDbModal] = useState(false);
  const [dbUploadFile, setDbUploadFile] = useState<File | null>(null);
  
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const isProcessingFrame = React.useRef(false);

  useEffect(() => { 
    setCurrentPage('vehicle-anpr'); 
    fetchDbVehicles();
  }, [setCurrentPage]);

  const fetchDbVehicles = async () => {
    try {
      const res = await fetch('http://localhost:8000/api/anpr/registry');
      if (res.ok) {
        const data = await res.json();
        setDbVehicles(data.vehicles || []);
        setSuspiciousVehicles(data.suspicious_vehicles || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

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
      console.error(err);
      let message = "Could not access camera.";
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        message = "Camera access is BLOCKED by your browser permissions.\n\nTo fix:\n1. Click the Lock/Sliders icon next to 'localhost:5173' in your browser address bar.\n2. Enable 'Camera' permission to Allow.\n3. Refresh the page (F5).";
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        message = "Webcam is currently in use by another application.\n\nPlease close other apps using your webcam and try again.";
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        message = "No webcam hardware detected on this device.";
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
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleVideoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && videoRef.current) {
      const url = URL.createObjectURL(file);
      videoRef.current.src = url;
      videoRef.current.play();
      setIsLive(true);
      setCameraMode('file');
    }
  };

  const stopFeed = async () => {
    if (cameraMode === 'ipcam') {
      try {
        await fetch('http://localhost:8000/api/face/ipcam/stop', { method: 'POST' });
      } catch (e) {}
    } else {
      if (videoRef.current) {
        if (videoRef.current.srcObject) {
            const stream = videoRef.current.srcObject as MediaStream;
            stream.getTracks().forEach(track => track.stop());
            videoRef.current.srcObject = null;
        } else {
            videoRef.current.pause();
            videoRef.current.src = "";
            videoRef.current.load();
        }
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
        const res = await fetch('http://localhost:8000/api/anpr/recognize', { method: 'POST', body: formData });
        if (res.ok) {
          const data = await res.json();
          setActiveDetections(data.detections || []);
          if (data.frame_width && data.frame_height) {
            setFrameSize({ width: data.frame_width, height: data.frame_height });
          }
        }
      } catch (error) {
        console.error(error);
      } finally {
        isProcessingFrame.current = false;
      }
    }, 'image/jpeg', 0.6);
  };

  const pollIpCam = async () => {
    try {
      const res = await fetch('http://localhost:8000/api/anpr/ipcam/poll');
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
      console.error(error);
    }
  };

  useEffect(() => {
    let interval: any;
    if (isLive) {
      if (cameraMode === 'webcam' || cameraMode === 'file') {
        interval = setInterval(captureAndDetect, 300); // 300ms interval for faster scanning
      } else if (cameraMode === 'ipcam') {
        interval = setInterval(pollIpCam, 300);
      }
    }
    return () => clearInterval(interval);
  }, [isLive, cameraMode]);

  const handleExcelUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dbUploadFile) return alert("Select an Excel or CSV file");
    const formData = new FormData();
    formData.append('file', dbUploadFile);
    try {
      const res = await fetch('http://localhost:8000/api/anpr/upload', { method: 'POST', body: formData });
      if (res.ok) {
        alert("Database updated!");
        fetchDbVehicles();
      }
    } catch (e) {
      alert("Upload failed.");
    }
  };

  const getRiskColor = (level: string) => {
    if (level === 'CRITICAL' || level === 'HIGH') return '#ef4444';
    if (level === 'REVIEW') return '#eab308';
    return '#10b981';
  };

  return (
    <div className="flex flex-col h-full" style={{ height: 'calc(100vh - 56px)' }}>
      <PageHeader
        title="Vehicle Intelligence & Watchlist"
        subtitle={`Tracking system active - Monitoring ${dbVehicles.length} registered and ${suspiciousVehicles.length} flagged vehicles`}
        icon={<Car size={16} />}
        actions={
          <div className="flex items-center gap-2">
            {!isLive ? (
              <>
                <input type="file" accept="video/*" ref={fileInputRef} className="hidden" onChange={handleVideoFile} />
                <button onClick={() => fileInputRef.current?.click()} className="px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold rounded flex items-center gap-2 transition-colors">
                  <FileVideo size={14} /> LOCAL VIDEO
                </button>
                <button onClick={startWebcam} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded flex items-center gap-2 transition-colors">
                  <Camera size={14} /> WEBCAM
                </button>
                <button onClick={startIpCam} className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded flex items-center gap-2 transition-colors">
                  <Wifi size={14} /> IP CAM
                </button>
              </>
            ) : (
              <button onClick={stopFeed} className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded flex items-center gap-2 transition-colors">
                <VideoOff size={14} /> STOP
              </button>
            )}
            <button onClick={() => setShowDbModal(true)} className="px-3 py-1.5 bg-gray-800 border border-border hover:bg-gray-700 text-white text-xs font-bold rounded flex items-center gap-2 transition-colors">
              <Database size={14} /> WATCHLIST DB
            </button>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 px-4 py-3 shrink-0" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <StatCard icon={<Car size={16} />} label="Total Vehicles" value={dbVehicles.length} sub="Registered" accent="var(--color-primary)" />
        <StatCard icon={<ShieldAlert size={16} />} label="Watchlist" value={suspiciousVehicles.length} sub="Critical/High" accent="var(--color-danger)" />
        <StatCard icon={<Eye size={16} />} label="Live Objects" value={activeDetections.length} sub="Being Tracked" accent="var(--color-success)" />
        <StatCard icon={<Flag size={16} />} label="Matches" value={activeDetections.filter(d => d.risk_level !== 'NORMAL').length} sub="Alerts Triggered" accent="var(--color-warning)" />
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 flex flex-col p-4 gap-4 overflow-y-auto">
          <div className="card overflow-hidden flex flex-col w-full max-w-5xl mx-auto border-2 relative" style={{ borderColor: 'var(--color-border)', height: '500px' }}>
            {!isLive && (
                <div className="absolute inset-0 flex items-center justify-center z-10" style={{ background: 'rgba(0,0,0,0.7)' }}>
                    <div className="text-center">
                        <ShieldAlert size={48} className="mx-auto mb-4" style={{ color: 'var(--color-text-muted)' }} />
                        <h2 className="text-xl font-bold" style={{ color: 'var(--color-text-secondary)' }}>WATCHLIST DETECTION OFFLINE</h2>
                        <p className="text-sm mt-2" style={{ color: 'var(--color-text-muted)' }}>Start a video feed to initialize Multi-Object Tracking & ANPR</p>
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
            {cameraMode === 'file' && videoRef.current && (
                <VideoPlayerControls videoRef={videoRef as React.RefObject<HTMLVideoElement>} />
            )}
            <canvas ref={canvasRef} className="hidden" />

            {/* SVG OVERLAY FOR BOXES */}
            {isLive && (
              <svg 
                viewBox={`0 0 ${frameSize.width} ${frameSize.height}`}
                className="absolute inset-0 w-full h-full pointer-events-none"
                preserveAspectRatio="xMidYMid meet"
              >
                {activeDetections.map((det, idx) => {
                  const riskLevel = det.risk_level || 'NORMAL';
                  const boxColor = getRiskColor(riskLevel);
                  
                  // Background fill color
                  let fillColor = 'rgba(59, 130, 246, 0.1)';
                  if (riskLevel === 'CRITICAL' || riskLevel === 'HIGH') fillColor = 'rgba(239, 68, 68, 0.15)';
                  else if (riskLevel === 'REVIEW') fillColor = 'rgba(234, 179, 8, 0.15)';
                  else if (riskLevel === 'NORMAL') fillColor = 'rgba(16, 185, 129, 0.1)';
                  
                  return (
                    <g key={idx}>
                      <rect 
                        x={det.xmin} y={det.ymin} 
                        width={det.xmax - det.xmin} height={det.ymax - det.ymin} 
                        fill={fillColor} stroke={boxColor} strokeWidth="3"
                      />
                      {/* Text background */}
                      <rect 
                        x={det.xmin} y={det.ymin - 32} 
                        width={Math.max(140, det.xmax - det.xmin)} height="32" 
                        fill={boxColor}
                      />
                      <text 
                        x={det.xmin + 4} y={det.ymin - 18} 
                        fill="#fff" fontSize="11" fontWeight="bold" fontFamily="monospace"
                      >
                        ID: {det.track_id} | {det.class.toUpperCase()}
                      </text>
                      <text 
                        x={det.xmin + 4} y={det.ymin - 4} 
                        fill="#fff" fontSize="13" fontWeight="bold" fontFamily="monospace"
                      >
                        {det.plate_text || "DETECTING..."}
                      </text>
                    </g>
                  )
                })}
              </svg>
            )}
          </div>
        </div>

        {/* Live Match panel */}
        <div className="hidden xl:flex xl:flex-col xl:w-80 shrink-0 p-4 overflow-y-auto border-l-2 gap-4"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-surface)' }}>
          <h3 className="text-xs font-semibold mb-1 flex items-center gap-2" style={{ color: 'var(--color-text-secondary)' }}>
            <Flag size={14} /> LIVE DETECTIONS
          </h3>
          
          <div className="space-y-4">
            {activeDetections.length === 0 ? (
              <div className="text-center py-6 text-xs text-muted border border-dashed border-border rounded-lg">
                No vehicles currently tracked.
              </div>
            ) : (
              activeDetections.map((det, i) => {
                const riskLevel = det.risk_level || 'NORMAL';
                const isHighRisk = riskLevel === 'HIGH' || riskLevel === 'CRITICAL';
                
                return (
                  <div key={i} className={`p-3 rounded-lg border ${isHighRisk ? 'border-red-500/50' : (riskLevel === 'REVIEW' ? 'border-yellow-500/50' : 'border-green-500/30')} flex flex-col gap-3 shadow-sm`}
                    style={{ background: 'var(--color-bg-elevated)' }}>
                    <PlateDisplay plate={det.plate_text || 'UNREADABLE'} riskLevel={riskLevel} />
                    
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-gray-500">Track ID:</span>
                        <div className="font-bold text-white">{det.track_id}</div>
                      </div>
                      <div>
                        <span className="text-gray-500">Class:</span>
                        <div className="font-bold text-white">{det.class}</div>
                      </div>
                      <div className="col-span-2">
                        <span className="text-gray-500">Confidence:</span>
                        <div className="font-bold text-white">{(det.confidence * 100).toFixed(1)}%</div>
                      </div>
                      {isHighRisk && (
                        <div className="col-span-2 mt-1 p-2 bg-red-500/10 border border-red-500/20 rounded animate-pulse">
                          <span className="text-red-500 font-bold flex items-center gap-1"><AlertTriangle size={12}/> ACTION REQUIRED</span>
                          <p className="text-red-400 mt-0.5">Vehicle matches suspicious watchlist.</p>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* Database Management Modal */}
      {showDbModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm" style={{ background: 'rgba(0,0,0,0.8)' }}>
            <div className="card w-full max-w-4xl p-6 border border-border max-h-[85vh] overflow-y-auto shadow-2xl">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2"><Database size={24} className="text-blue-500" /> Watchlist Database Registry</h2>
                    <button onClick={() => setShowDbModal(false)} className="text-muted hover:text-white p-2 rounded-full hover:bg-gray-800 transition-colors">✕</button>
                </div>
                
                <div className="mb-6 p-5 border border-dashed border-border rounded-xl bg-black/40 flex items-center gap-4">
                  <div className="flex-1">
                    <h3 className="text-sm font-bold mb-1">Batch Import Watchlist</h3>
                    <p className="text-xs text-gray-400">Upload an Excel (.xlsx) or CSV file containing plate numbers and case references.</p>
                  </div>
                  <form onSubmit={handleExcelUpload} className="flex gap-2">
                    <input type="file" accept=".xlsx,.csv" onChange={e => setDbUploadFile(e.target.files?.[0] || null)} className="bg-gray-900 border border-border rounded px-3 py-2 text-sm text-gray-300 w-64" />
                    <button type="submit" className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded text-sm flex items-center gap-2 transition-colors">
                      <UploadCloud size={16} /> UPLOAD
                    </button>
                  </form>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  {/* Suspicious Vehicles Column */}
                  <div>
                    <h3 className="text-sm font-bold mb-3 flex items-center gap-2 text-red-400">
                      <ShieldAlert size={16} /> Suspicious Watchlist ({suspiciousVehicles.length})
                    </h3>
                    <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
                      {suspiciousVehicles.length === 0 ? <p className="text-xs text-gray-500">No vehicles on watchlist.</p> : null}
                      {suspiciousVehicles.map((v: any) => (
                        <div key={v.plate_number} className="p-3 text-xs border rounded-lg border-red-500/30 bg-red-950/20 shadow-sm flex flex-col gap-1">
                          <div className="flex justify-between items-center">
                            <span className="font-bold font-mono text-red-400 text-sm tracking-wider">{v.plate_number}</span>
                            <span className="bg-red-500/20 text-red-500 px-2 py-0.5 rounded text-[10px] font-bold">{v.risk_level}</span>
                          </div>
                          <div className="text-gray-400">{v.vehicle_make} {v.vehicle_model} - {v.vehicle_color}</div>
                          {v.reason && <div className="text-gray-500 mt-1 italic">"{v.reason}"</div>}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Registered Vehicles Column */}
                  <div>
                    <h3 className="text-sm font-bold mb-3 flex items-center gap-2 text-green-400">
                      <CheckCircle size={16} /> Registered Vehicles ({dbVehicles.length})
                    </h3>
                    <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
                      {dbVehicles.length === 0 ? <p className="text-xs text-gray-500">No registered vehicles.</p> : null}
                      {dbVehicles.map((v: any) => (
                        <div key={v.plate_number} className="p-3 text-xs border rounded-lg border-green-500/20 bg-green-950/10 shadow-sm flex flex-col gap-1">
                          <div className="flex justify-between items-center">
                            <span className="font-bold font-mono text-green-400 text-sm tracking-wider">{v.plate_number}</span>
                            <span className="text-gray-500">{v.owner_name}</span>
                          </div>
                          <div className="text-gray-400">{v.make} {v.model} - {v.color}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default VehicleANPR;

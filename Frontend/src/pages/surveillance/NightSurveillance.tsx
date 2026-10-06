import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Moon, Activity, Eye, Clock, Camera, Play, Upload, Crosshair } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { PageHeader, StatCard } from '../../components/common';
import { VideoPlayerControls } from '../../components/VideoPlayerControls';

// Dynamically load all videos from the night_video folder
const videoFiles = import.meta.glob('/public/res/night_video/*.mp4');
const SIMULATION_VIDEOS = Object.keys(videoFiles).length > 0 
  ? Object.keys(videoFiles).map(path => path.replace('/public', ''))
  : [
      '/res/night_video/istockphoto-1147398576-640_adpp_is.mp4',
      '/res/night_video/istockphoto-1147423914-640_adpp_is.mp4',
      '/res/night_video/istockphoto-684718024-640_adpp_is.mp4',
    ];

interface Detection {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
  confidence: number;
  class: string;
}

interface ActionDetection {
  bbox: number[];
  keypoints: number[][];
  action: string;
  action_confidence: number;
  is_suspicious: boolean;
}

const NightSurveillance: React.FC = () => {
  const { setCurrentPage } = useAppStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [isDetecting, setIsDetecting] = useState(false);
  const [isNightVision, setIsNightVision] = useState(true);
  const [fps, setFps] = useState(0);
  const [activeDetections, setActiveDetections] = useState<Detection[]>([]);
  const [activeActions, setActiveActions] = useState<ActionDetection[]>([]);
  const [mediaSource, setMediaSource] = useState<'webcam'|'simulation'|'upload'|null>(null);
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [processedImageUrl, setProcessedImageUrl] = useState<string | null>(null);
  const [autoGreenDetect, setAutoGreenDetect] = useState(false);

  const frameCountRef = useRef(0);
  const lastTimeRef = useRef(performance.now());
  const isProcessingFrame = useRef(false);

  useEffect(() => { 
    setCurrentPage('night-surveillance'); 
    startSimulation();
    return () => {
      stopWebcam();
    };
  }, [setCurrentPage]);

  const stopWebcam = () => {
    if (videoRef.current && videoRef.current.srcObject) {
       const stream = videoRef.current.srcObject as MediaStream;
       stream.getTracks().forEach(t => t.stop());
       videoRef.current.srcObject = null;
    }
  };

  const startWebcam = async () => {
    stopWebcam();
    setMediaSource('webcam');
    setVideoUrl('');
    setProcessedImageUrl(null);
    setActiveDetections([]);
    setActiveActions([]);
    if (videoRef.current) {
      try {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({ 
            video: { width: { ideal: 1280 }, height: { ideal: 720 } }
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({ video: true });
        }
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      } catch (err: any) {
        console.error("Webcam error:", err);
        let message = "Could not access webcam.";
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          message = "Camera access is BLOCKED by your browser permissions.\n\nTo fix:\n1. Click the Lock/Sliders icon next to 'localhost:5173' in your browser address bar.\n2. Enable 'Camera' permission to Allow.\n3. Refresh the page (F5).";
        } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
          message = "Webcam is currently in use by another application.\n\nPlease close other apps using your webcam and try again.";
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          message = "No webcam hardware detected on this device.";
        }
        alert(message);
      }
    }
  };

  const startSimulation = () => {
    stopWebcam();
    setProcessedImageUrl(null);
    setActiveDetections([]);
    setActiveActions([]);
    const randomVid = SIMULATION_VIDEOS[Math.floor(Math.random() * SIMULATION_VIDEOS.length)];
    setVideoUrl(randomVid);
    setMediaSource('simulation');
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      stopWebcam();
      setProcessedImageUrl(null);
      setActiveDetections([]);
      setActiveActions([]);
      setVideoUrl(URL.createObjectURL(file));
      setMediaSource('upload');
    }
    
    // Clear input so the user can upload the same file again without freezing
    e.target.value = '';
  };

  const processFrame = useCallback(async () => {
    if (!isDetecting || !videoRef.current || !canvasRef.current || isProcessingFrame.current) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    if (video.readyState >= 2 && !video.paused && !video.ended) {
      isProcessingFrame.current = true;
      
      // Calculate FPS
      const now = performance.now();
      frameCountRef.current++;
      if (now - lastTimeRef.current >= 1000) {
        setFps(frameCountRef.current);
        frameCountRef.current = 0;
        lastTimeRef.current = now;
      }

      // Calculate scale to limit max dimension to 320px to massively boost FPS
      const MAX_DIM = 320;
      let targetWidth = video.videoWidth;
      let targetHeight = video.videoHeight;
      if (targetWidth > MAX_DIM) {
          targetHeight = (MAX_DIM / targetWidth) * targetHeight;
          targetWidth = MAX_DIM;
      }
      
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        canvas.toBlob(async (blob) => {
          if (!blob) {
            isProcessingFrame.current = false;
            return;
          }
          
          const formData = new FormData();
          formData.append('file', blob, 'frame.jpg');
          if (useAppStore.getState().priorityMode) {
              formData.append('priority_mode', 'true');
          }

          try {
            const res = await fetch('http://127.0.0.1:8000/detect-night', {
              method: 'POST',
              body: formData,
            });
            
            if (res.ok) {
              const data = await res.json();
              setActiveDetections(data.detections || []);
              setActiveActions(data.actions || []);
              setAutoGreenDetect(!!data.is_already_green);
              if (data.image_base64) {
                setProcessedImageUrl(`data:image/jpeg;base64,${data.image_base64}`);
              }
            }
          } catch (err) {
            console.error("Backend processing failed", err);
          } finally {
            isProcessingFrame.current = false;
          }
        }, 'image/jpeg', 0.5); // 50% quality for maximum network speed
      } else {
        isProcessingFrame.current = false;
      }
    }
  }, [isDetecting]);

  useEffect(() => {
    let interval: number;
    if (isDetecting) {
      // Poll as fast as 10 FPS (limited by backend response time)
      interval = window.setInterval(processFrame, 100);
    } else {
      setActiveDetections([]);
      setActiveActions([]);
      setProcessedImageUrl(null);
      setFps(0);
    }
    return () => {
      if (interval) window.clearInterval(interval);
    };
  }, [isDetecting, processFrame]);

  // CSS Filter for styling the feed (Disabled if backend says it's already green)
  const nightVisionStyle = (isNightVision && !autoGreenDetect) ? {
    filter: 'sepia(100%) hue-rotate(90deg) saturate(400%) brightness(1.2) contrast(1.5)'
  } : {};

  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ height: 'calc(100vh - 56px)' }}>
      <PageHeader
        title="Night Surveillance (Backend AI)"
        subtitle="OpenCV CLAHE Enhancement · YOLOv8 Inference"
        icon={<Moon size={16} />}
        accent="#FF9933"
      />

      <div className="grid grid-cols-4 gap-3 px-4 py-3 shrink-0" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <StatCard icon={<Eye size={16} />} label="Backend Status" value={isDetecting ? "PROCESSING" : "READY"} sub="FastAPI + OpenCV" accent={isDetecting ? "var(--color-success)" : "var(--color-warning)"} />
        <StatCard icon={<Activity size={16} />} label="Stream FPS" value={fps} sub="Network Polling" accent="#C3B091" />
        <StatCard icon={<Crosshair size={16} />} label="Objects Tracked" value={activeDetections.length} sub="Live Count" accent="#FF9933" />
        <StatCard icon={<Clock size={16} />} label="Curfew Status" value="ACTIVE" sub="20:00 – 06:00 hrs" accent="var(--color-success)" />
      </div>

      <div className="flex flex-1 flex-col xl:flex-row overflow-hidden min-h-[600px]">
        <div className="flex-1 flex flex-col p-4 gap-4 overflow-y-auto">
          
          <div className="card overflow-hidden flex flex-col w-full max-w-5xl mx-auto border-2" style={{ borderColor: 'var(--color-border)' }}>
            <div className="p-3 shrink-0 bg-black/20" style={{ borderBottom: '1px solid var(--color-border)' }}>
              <div className="flex items-center justify-between">
                <div className="flex gap-2">
                  <button onClick={startWebcam} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${mediaSource === 'webcam' ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-surface hover:brightness-110 border border-border'}`}>
                    <Camera size={14} /> LIVE WEBCAM
                  </button>
                  <button onClick={startSimulation} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${mediaSource === 'simulation' ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-surface hover:brightness-110 border border-border'}`}>
                    <Play size={14} /> SIMULATE VIDEO
                  </button>
                  <button onClick={() => fileInputRef.current?.click()} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${mediaSource === 'upload' ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-surface hover:brightness-110 border border-border'}`}>
                    <Upload size={14} /> UPLOAD FILE
                  </button>
                  <input type="file" ref={fileInputRef} onChange={handleUpload} accept="video/*" className="hidden" />
                </div>
                
                <div className="flex gap-2">
                  <button 
                    onClick={() => setIsNightVision(!isNightVision)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all hover:brightness-110"
                    style={{ background: isNightVision ? 'rgba(19, 136, 8, 0.2)' : 'var(--color-bg-elevated)', color: isNightVision ? '#138808' : 'var(--color-text-muted)', border: `1px solid ${isNightVision ? 'rgba(19,136,8,0.5)' : 'var(--color-border)'}` }}
                  >
                    <Moon size={14} /> {autoGreenDetect ? 'AUTO-GREEN OVERRIDE' : 'GREEN FILTER'}
                  </button>
                  <button 
                    onClick={() => setIsDetecting(!isDetecting)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all hover:brightness-110"
                    style={{ background: isDetecting ? 'rgba(255, 153, 51, 0.2)' : 'var(--color-bg-elevated)', color: isDetecting ? '#FF9933' : 'var(--color-text-muted)', border: `1px solid ${isDetecting ? 'rgba(255,153,51,0.5)' : 'var(--color-border)'}` }}
                  >
                    <Crosshair size={14} /> BACKEND PROCESSING
                  </button>
                </div>
              </div>
            </div>

            <div className="relative bg-black w-full flex items-center justify-center min-h-[400px]">
              
              {/* Hidden video element used purely for playback and extraction */}
              <video 
                ref={videoRef}
                src={mediaSource === 'simulation' || mediaSource === 'upload' ? videoUrl : undefined}
                className={`w-full h-full object-contain ${processedImageUrl ? 'hidden' : 'block'}`}
                style={nightVisionStyle}
                autoPlay 
                playsInline 
                muted={mediaSource !== 'webcam'} 
                loop={mediaSource !== 'webcam'}
                crossOrigin="anonymous"
              />
              
              {/* Image element that shows the CLAHE enhanced frames from Backend */}
              {processedImageUrl && (
                 <div className="relative w-full h-full flex justify-center items-center">
                    <img 
                      src={processedImageUrl} 
                      className="w-full h-full object-contain" 
                      style={nightVisionStyle}
                      alt="Backend Processed Feed" 
                    />
                    
                    {/* Bounding Boxes overlay */}
                    {videoRef.current && (() => {
                        // We must match the SVG viewBox to the EXACT dimensions the backend processed.
                        const MAX_DIM = 320;
                        let svgWidth = videoRef.current.videoWidth;
                        let svgHeight = videoRef.current.videoHeight;
                        if (svgWidth > MAX_DIM) {
                            svgHeight = (MAX_DIM / svgWidth) * svgHeight;
                            svgWidth = MAX_DIM;
                        }
                        
                        return (
                          <svg 
                            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                            className="absolute inset-0 w-full h-full"
                            preserveAspectRatio="xMidYMid meet"
                          >
                            {activeDetections.map((det, idx) => {
                              const isPerson = det.class.toLowerCase() === 'human' || det.class.toLowerCase() === 'person';
                              const boxColor = isPerson ? '#ef4444' : '#FF9933';
                              const fillColor = isPerson ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255, 153, 51, 0.2)';
                              
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

                            {activeActions && activeActions.map((act, i) => {
                              if (act.action === "Unknown") return null;
                              
                              const width = act.bbox[2] - act.bbox[0];
                              const height = act.bbox[3] - act.bbox[1];
                              const boxColor = act.is_suspicious ? 'rgba(234, 179, 8, 0.9)' : 'rgba(16, 185, 129, 0.6)';
                              const fillColor = act.is_suspicious ? 'rgba(234, 179, 8, 0.15)' : 'rgba(16, 185, 129, 0.1)';
                              const textBgColor = act.is_suspicious ? 'rgba(234, 179, 8, 0.95)' : 'rgba(16, 185, 129, 0.9)';
                              
                              return (
                                <g key={`act-${i}`}>
                                  <rect 
                                    x={act.bbox[0]} y={act.bbox[1]} 
                                    width={width} height={height} 
                                    fill={fillColor} stroke={boxColor} strokeWidth="2"
                                  />
                                  <rect 
                                    x={act.bbox[0]} y={act.bbox[3] - 16} 
                                    width={width} height="16" 
                                    fill={textBgColor}
                                  />
                                  <text 
                                    x={act.bbox[0] + 2} y={act.bbox[3] - 4} 
                                    fill="#fff" fontSize="10" fontWeight="bold" fontFamily="monospace"
                                  >
                                    ACT: {act.action.toUpperCase()} {(act.action_confidence * 100).toFixed(0)}%
                                  </text>
                                  
                                  {act.keypoints && act.keypoints.map((kp, kIdx) => {
                                    if (kp[2] < 0.5) return null;
                                    return (
                                      <circle 
                                        key={kIdx} 
                                        cx={kp[0]} cy={kp[1]} r="2" 
                                        fill="#fde047" stroke="#000" strokeWidth="0.5"
                                      />
                                    );
                                  })}
                                </g>
                              );
                            })}
                          </svg>
                        );
                    })()}
                 </div>
              )}

              {/* Native Video Controls mapped to custom UI overlay */}
              {(mediaSource === 'simulation' || mediaSource === 'upload') && videoRef.current && (
                <VideoPlayerControls videoRef={videoRef as React.RefObject<HTMLVideoElement>} />
              )}

              {/* Hidden Canvas used for extraction */}
              <canvas ref={canvasRef} className="hidden" />

            </div>
          </div>

        </div>

        {/* Telemetry panel */}
        <div className="flex xl:flex-col xl:w-72 shrink-0 p-4 overflow-y-auto border-t-2 xl:border-t-0 xl:border-l-2 gap-4"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-surface)' }}>
          <div className="flex-1 xl:flex-none">
            <h3 className="text-xs font-semibold mb-3" style={{ color: 'var(--color-text-secondary)' }}>LIVE TELEMETRY</h3>
            
            <div className="space-y-3 mb-6">
              <div className="p-3 rounded-lg border border-border bg-card">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-muted">Backend Sync Rate</span>
                  <span className="text-sm font-bold font-mono" style={{ color: fps > 0 ? '#138808' : '#FF9933' }}>{fps} FPS</span>
                </div>
                <div className="w-full h-1.5 bg-black/50 rounded overflow-hidden">
                  <div className="h-full transition-all" style={{ width: `${Math.min(fps / 5 * 100, 100)}%`, background: fps > 0 ? '#138808' : '#FF9933' }} />
                </div>
              </div>

              <div className="p-3 rounded-lg border border-border bg-card">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted">Active Objects</span>
                  <span className="text-sm font-bold font-mono text-white">{activeDetections.length}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 xl:flex-none">
            <h3 className="text-xs font-semibold mb-3" style={{ color: 'var(--color-text-secondary)' }}>DETECTION LOG</h3>
            <div className="space-y-2 max-h-48 xl:max-h-none overflow-y-auto">
              {activeDetections.length === 0 ? (
                <div className="text-center py-6 text-xs text-muted border border-dashed border-border rounded-lg">
                  No signatures detected
                </div>
              ) : (
                activeDetections.map((det, i) => (
                  <div key={i} className="p-2 rounded flex items-center justify-between"
                    style={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)' }}>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ background: (det.class.toLowerCase() === 'human' || det.class.toLowerCase() === 'person') ? '#ef4444' : '#FF9933' }} />
                      <span className="text-xs font-bold uppercase" style={{ color: 'var(--color-text-primary)' }}>{det.class}</span>
                    </div>
                    <span className="text-xs font-mono" style={{ color: '#138808' }}>{(det.confidence * 100).toFixed(1)}%</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NightSurveillance;

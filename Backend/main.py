import io
import torch
import cv2
import numpy as np
import base64
import io
import torch
import cv2
import numpy as np
import base64
import threading
import time
import json
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager

# --- PyTorch 2.6 weights_only=True bypass for Ultralytics ---
import torch
_original_load = torch.load
def _patched_load(*args, **kwargs):
    if 'weights_only' not in kwargs:
        kwargs['weights_only'] = False
    return _original_load(*args, **kwargs)
torch.load = _patched_load
# -----------------------------------------------------------

import asyncio
import base64
import pandas as pd
import io
from ultralytics import YOLO
from huggingface_hub import hf_hub_download
from supervision import Detections
from pydantic import BaseModel
import os
from dotenv import load_dotenv

load_dotenv()


# --- Local Face & ANPR Engine Integration ---
from database import register_face, get_face_info, get_all_features, get_all_vehicles, register_vehicle, log_anpr_event
from face_engine import face_engine
from virtual_fence.routes import router as virtual_fence_router
from chatbot.chat import router as chat_router

app = FastAPI(title="Thermal Human Detection API")
app.include_router(virtual_fence_router)
app.include_router(chat_router, prefix="/api")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Authentication ---
class LoginRequest(BaseModel):
    username: str
    password: str

VALID_USERS = {
    "admin1": "password123",
    "admin2": "securepass456",
    "commander": "bravo789"
}

@app.post("/api/auth/login")
async def login(req: LoginRequest):
    if req.username in VALID_USERS and VALID_USERS[req.username] == req.password:
        return JSONResponse(content={"token": f"dummy-token-{req.username}", "username": req.username})
    return JSONResponse(status_code=401, content={"error": "Invalid username or password"})

# PyTorch security rules fix (Monkey-patch torch.load for PyTorch 2.6+)
_original_torch_load = torch.load
def _patched_load(*args, **kwargs):
    if 'weights_only' not in kwargs:
        kwargs['weights_only'] = False
    return _original_torch_load(*args, **kwargs)
torch.load = _patched_load

# Download model
model_path = hf_hub_download(
    repo_id="pitangent-ds/YOLOv8-human-detection-thermal",
    filename="model.pt"
)

# Load models
model = YOLO(model_path)
model_night = YOLO('yolov8n.pt')

# Night Vision Enhancer (CLAHE)
class ImageEnhancer:
    def __init__(self):
        self.clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    
    def enhance(self, frame: np.ndarray) -> np.ndarray:
        try:
            lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)
            l, a, b = cv2.split(lab)
            l_enhanced = self.clahe.apply(l)
            lab_enhanced = cv2.merge([l_enhanced, a, b])
            return cv2.cvtColor(lab_enhanced, cv2.COLOR_LAB2BGR)
        except Exception:
            return frame

enhancer = ImageEnhancer()

@app.post("/detect")
async def detect(
    file: UploadFile = File(...),
    priority_mode: bool = Form(False)
):
    try:
        contents = await file.read()
        
        # Convert bytes to cv2 image
        np_arr = np.frombuffer(contents, np.uint8)
        cv_image = cv2.imdecode(np_arr, cv2.IMREAD_ANYCOLOR)
        
        if cv_image is None:
            return JSONResponse(status_code=400, content={"error": "Failed to decode image"})
        
        # Run inference (default imgsz=640 for accuracy)
        model_output = model(cv_image, conf=0.6, verbose=False)
        result = model_output[0]
        
        # Optionally parse with supervision (as requested, though we can also just use result.boxes)
        sv_detections = Detections.from_ultralytics(result)
        
        # Parse results for JSON response
        detections = []
        valid_boxes = []
        for i in range(len(sv_detections.xyxy)):
            x1, y1, x2, y2 = sv_detections.xyxy[i].tolist()
            conf = float(sv_detections.confidence[i])
            cls_id = int(sv_detections.class_id[i])
            
            # Using model's names dictionary if it has one, otherwise fallback to "human"
            class_name = result.names[cls_id] if hasattr(result, 'names') and cls_id in result.names else str(cls_id)
            
            valid_boxes.append([x1, y1, x2, y2])
            
            detections.append({
                "xmin": x1,
                "ymin": y1,
                "xmax": x2,
                "ymax": y2,
                "confidence": conf,
                "class": class_name
            })
            
        # Give priority to other detections first, then run BERT (action recognizer) using those valid boxes
        if len(valid_boxes) > 0 and not priority_mode:
            action_results = action_recognizer.detect_and_recognize(cv_image, valid_boxes)
        else:
            action_results = []
        
        return JSONResponse(content={"detections": detections, "actions": action_results})
    
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/detect-night")
async def detect_night(
    file: UploadFile = File(...),
    priority_mode: bool = Form(False)
):
    try:
        contents = await file.read()
        
        np_arr = np.frombuffer(contents, np.uint8)
        cv_image = cv2.imdecode(np_arr, cv2.IMREAD_ANYCOLOR)
        
        if cv_image is None:
            return JSONResponse(status_code=400, content={"error": "Failed to decode image"})
            
        # Detect if the video is already heavily green-tinted
        b, g, r = cv2.split(cv_image)
        mean_b = np.mean(b)
        mean_g = np.mean(g)
        mean_r = np.mean(r)
        is_already_green = bool((mean_g > mean_b + 15) and (mean_g > mean_r + 15))
        
        # Apply CLAHE enhancement
        enhanced_image = enhancer.enhance(cv_image)
        
        # Run inference on enhanced image using general purpose YOLOv8n (default imgsz=640 for accuracy)
        model_output = model_night(enhanced_image, conf=0.4, verbose=False)
        result = model_output[0]
        
        sv_detections = Detections.from_ultralytics(result)
        
        detections = []
        valid_boxes = []
        for i in range(len(sv_detections.xyxy)):
            x1, y1, x2, y2 = sv_detections.xyxy[i].tolist()
            conf = float(sv_detections.confidence[i])
            cls_id = int(sv_detections.class_id[i])
            class_name = result.names[cls_id] if hasattr(result, 'names') and cls_id in result.names else str(cls_id)
            
            valid_boxes.append([x1, y1, x2, y2])
            
            detections.append({
                "xmin": x1,
                "ymin": y1,
                "xmax": x2,
                "ymax": y2,
                "confidence": conf,
                "class": class_name
            })
            
        # Action Recognition & Pose (MotionBERT via Microservice)
        if len(valid_boxes) > 0 and not priority_mode:
            action_results = action_recognizer.detect_and_recognize(enhanced_image, valid_boxes)
        else:
            action_results = []
            
        # Encode enhanced image to base64
        _, buffer = cv2.imencode('.jpg', enhanced_image, [cv2.IMWRITE_JPEG_QUALITY, 85])
        img_base64 = base64.b64encode(buffer).decode('utf-8')
        
        return JSONResponse(content={"detections": detections, "image_base64": img_base64, "is_already_green": is_already_green, "actions": action_results})
    
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.get("/")
async def root():
    return {"message": "Thermal Human Detection API is running. Send a POST request to /detect with an image file."}

@app.post("/api/face/register")
async def api_face_register(
    subject_name: str = Form(...),
    info_json: str = Form(...),
    threat_level: int = Form(0),
    file: UploadFile = File(...)
):
    try:
        contents = await file.read()
        
        # Save to local SQLite Database (also extracts and saves OpenCV feature vector)
        info_dict = json.loads(info_json)
        register_face(subject_name, info_dict, contents, threat_level)
            
        return JSONResponse(content={"status": "success", "subject": subject_name})
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/api/face/recognize")
async def api_face_recognize(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        
        # Decode image
        nparr = np.frombuffer(contents, np.uint8)
        img_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        # Resize image to max width of 640 for faster inference
        MAX_WIDTH = 640
        h, w = img_bgr.shape[:2]
        if w > MAX_WIDTH:
            scale = MAX_WIDTH / w
            img_bgr = cv2.resize(img_bgr, (MAX_WIDTH, int(h * scale)))
        
        # Get all registered features
        db_features = get_all_features()
        
        # Detect and extract all faces in the frame
        results = face_engine.detect_and_extract_all(img_bgr)
        
        detections = []
        for face, target_feature in results:
            # face is [x, y, w, h, ...]
            x, y, w, h = map(int, face[:4])
            
            best_match, best_score = face_engine.match_feature(target_feature, db_features)
            
            database_info = None
            class_name = "unknown"
            
            if best_match:
                class_name = best_match
                # Get rich info to return to frontend
                database_info = get_face_info(best_match)
                
            detections.append({
                "class": class_name,
                "confidence": float(best_score),
                "xmin": x,
                "ymin": y,
                "xmax": x + w,
                "ymax": y + h,
                "database_info": database_info
            })
            
        return JSONResponse(content={
            "detections": detections,
            "frame_width": img_bgr.shape[1],
            "frame_height": img_bgr.shape[0]
        })
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

# --- IP Camera Streaming Support ---
ipcam_cap = None
ipcam_latest_frame = None
ipcam_running = False
ipcam_thread = None
ipcam_error = None

class IPCamStartRequest(BaseModel):
    url: str

def ipcam_daemon(url: str):
    global ipcam_cap, ipcam_latest_frame, ipcam_running, ipcam_error
    ipcam_error = None
    ipcam_cap = cv2.VideoCapture(url)
    ipcam_cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    
    if not ipcam_cap.isOpened():
        ipcam_error = f"Could not connect to video stream at {url}. Ensure phone and PC are on the same Wi-Fi network."
        print(f"[IPCAM ERROR] {ipcam_error}")
        return

    consecutive_failures = 0
    while ipcam_running:
        ret, frame = ipcam_cap.read()
        if ret:
            ipcam_latest_frame = frame
            consecutive_failures = 0
        else:
            consecutive_failures += 1
            if consecutive_failures > 100:
                ipcam_error = f"Stream disconnected from {url}."
                print(f"[IPCAM ERROR] {ipcam_error}")
                break
            time.sleep(0.05)
            
    if ipcam_cap:
        ipcam_cap.release()

@app.post("/api/face/ipcam/start")
async def start_ipcam(req: IPCamStartRequest):
    global ipcam_running, ipcam_thread, ipcam_error, ipcam_latest_frame
    if ipcam_running:
        # Stop existing stream if changing URL
        ipcam_running = False
        if ipcam_thread:
            ipcam_thread.join(timeout=2.0)
            
    ipcam_latest_frame = None
    ipcam_error = None
    ipcam_running = True
    ipcam_thread = threading.Thread(target=ipcam_daemon, args=(req.url,), daemon=True)
    ipcam_thread.start()
    return JSONResponse(content={"status": "started", "url": req.url})

@app.post("/api/face/ipcam/stop")
async def stop_ipcam():
    global ipcam_running, ipcam_thread, ipcam_latest_frame, ipcam_error
    ipcam_running = False
    if ipcam_thread:
        ipcam_thread.join(timeout=1.0)
    ipcam_latest_frame = None
    ipcam_error = None
    return JSONResponse(content={"status": "stopped"})

@app.get("/api/face/ipcam/poll")
async def poll_ipcam():
    global ipcam_latest_frame, ipcam_error
    
    if ipcam_latest_frame is None:
        if ipcam_error:
            return JSONResponse(status_code=400, content={"error": ipcam_error, "detections": [], "frame_base64": None})
        return JSONResponse(status_code=503, content={"error": "Connecting to camera stream...", "detections": [], "frame_base64": None})
        
    try:
        # Copy to avoid race conditions
        img_bgr = ipcam_latest_frame.copy()
        
        # Resize image to max width of 640 for faster inference
        MAX_WIDTH = 640
        h, w = img_bgr.shape[:2]
        if w > MAX_WIDTH:
            scale = MAX_WIDTH / w
            img_bgr = cv2.resize(img_bgr, (MAX_WIDTH, int(h * scale)))
        
        # Get all registered features
        db_features = get_all_features()
        
        # Detect and extract all faces in the frame
        results = face_engine.detect_and_extract_all(img_bgr)
        
        detections = []
        for face, target_feature in results:
            x, y, w, h = map(int, face[:4])
            best_match, best_score = face_engine.match_feature(target_feature, db_features)
            
            database_info = None
            class_name = "unknown"
            
            if best_match:
                class_name = best_match
                database_info = get_face_info(best_match)
                
            detections.append({
                "class": class_name,
                "confidence": float(best_score),
                "xmin": x,
                "ymin": y,
                "xmax": x + w,
                "ymax": y + h,
                "database_info": database_info
            })
            
        # Encode frame to base64 JPEG to return to frontend
        _, buffer = cv2.imencode('.jpg', img_bgr)
        frame_b64 = base64.b64encode(buffer).decode('utf-8')
        
        return JSONResponse(content={
            "detections": detections, 
            "frame_base64": frame_b64,
            "frame_width": img_bgr.shape[1],
            "frame_height": img_bgr.shape[0]
        })
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e), "detections": [], "frame_base64": None})

# --- ANPR API Endpoints ---
@app.get("/api/anpr/registry")
async def api_anpr_registry():
    try:
        from database import get_all_vehicles, get_all_suspicious_vehicles
        vehicles = get_all_vehicles()
        suspicious = get_all_suspicious_vehicles()
        return JSONResponse(content={"vehicles": vehicles, "suspicious_vehicles": suspicious})
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/api/anpr/register")
async def api_anpr_register(
    plate_number: str = Form(...),
    model: str = Form("Unknown"),
    color: str = Form("Unknown"),
    owner_name: str = Form("Unknown"),
    status: str = Form("CLEAN"),
    warrants: str = Form("None"),
    flagged: bool = Form(False)
):
    try:
        register_vehicle(plate_number, model, color, owner_name, status, warrants, flagged)
        return JSONResponse(content={"status": "success", "plate_number": plate_number})
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/api/anpr/upload")
async def api_anpr_upload(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        if file.filename.endswith('.csv'):
            df = pd.read_csv(io.BytesIO(contents))
        else:
            df = pd.read_excel(io.BytesIO(contents))
            
        for _, row in df.iterrows():
            register_vehicle(
                str(row.get('plate_number', '')),
                str(row.get('model', 'Unknown')),
                str(row.get('color', 'Unknown')),
                str(row.get('owner_name', 'Unknown')),
                str(row.get('status', 'CLEAN')),
                str(row.get('warrants', 'None')),
                bool(row.get('flagged', False))
            )
        return JSONResponse(content={"status": "success", "count": len(df)})
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

from services.vehicle_tracker import VehicleTracker
from services.plate_detector import PlateDetector
from utils.image_preprocessor import ImagePreprocessor
from services.plate_ocr import PlateOCR
from services.temporal_consensus import TemporalConsensus
from services.watchlist_service import WatchlistService
from services.risk_engine import RiskEngine
from services.event_service import EventService
from services.action_recognizer import ActionRecognizer

# Initialize modular services
plate_detector = PlateDetector()
plate_ocr = PlateOCR()
temporal_consensus = TemporalConsensus(min_confirmations=3, timeout_seconds=15.0)
event_service = EventService(cooldown_seconds=60)
action_recognizer = ActionRecognizer()

def process_anpr_frame(img_bgr):
    # Detect and track vehicles using YOLO ByteTrack
    results = VehicleTracker.track_vehicles(model_night, img_bgr, conf=0.4)
    
    detections = []
    
    # Process each tracked vehicle
    if results.boxes is None or len(results.boxes) == 0:
        return detections
        
    for i, box in enumerate(results.boxes):
        cls_id = int(box.cls[0])
        class_name = results.names[cls_id] if hasattr(results, 'names') and cls_id in results.names else str(cls_id)
        
        # Only process vehicles
        if class_name not in ['car', 'motorcycle', 'bus', 'truck']:
            continue
            
        x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
        conf = float(box.conf[0])
        
        # ByteTrack assigns an ID; if not assigned, generate a temporary one based on bbox
        track_id = int(box.id[0]) if box.id is not None else hash(f"{x1}{y1}")
        
        vehicle_bbox = (x1, y1, x2, y2)
        
        # 1. Plate Detection
        plate_bbox = plate_detector.detect_plate(img_bgr, vehicle_bbox)
        px1, py1, px2, py2 = plate_bbox
        plate_crop = img_bgr[max(0, py1):py2, max(0, px1):px2]
        
        # 2. Image Preprocessing
        enhanced_crop = ImagePreprocessor.apply_pipeline(plate_crop, profile="adaptive_threshold")
        
        # 3. OCR
        raw_text, ocr_conf = plate_ocr.read_plate(enhanced_crop)
        
        # 4. Temporal Consensus
        temporal_consensus.add_reading(track_id, raw_text, ocr_conf)
        best_plate, temporal_conf, is_stable = temporal_consensus.get_consensus(track_id)
        
        display_text = best_plate if best_plate else (raw_text or "")
        risk_level = "NORMAL"
        is_suspected = False
        
        if best_plate:
            # 5. Fuzzy Matching & Watchlist Check
            match_data, match_type, source = WatchlistService.match_plate(best_plate)
            
            # 6. Risk Engine
            risk_level, risk_score = RiskEngine.calculate_risk(match_data, match_type, source, temporal_conf, is_stable)
            
            if match_data and match_type in ['EXACT_MATCH', 'HIGH_CONFIDENCE_MATCH']:
                display_text = match_data['plate_number']
                
            is_suspected = risk_level in ['HIGH', 'CRITICAL']
            
            # 7. Alert & Event Logging
            if is_stable or match_type in ['EXACT_MATCH', 'HIGH_CONFIDENCE_MATCH']:
                is_new_alert, event_data = event_service.process_event(
                    track_id, best_plate, class_name, match_data, match_type, risk_level, risk_score, img_bgr, vehicle_bbox, plate_bbox
                )
            
            if not is_stable and match_type not in ['EXACT_MATCH', 'HIGH_CONFIDENCE_MATCH']:
                display_text = display_text + " (Stabilizing...)"
        
        detections.append({
            "track_id": track_id,
            "class": class_name,
            "confidence": conf,
            "xmin": x1,
            "ymin": y1,
            "xmax": x2,
            "ymax": y2,
            "plate_text": display_text,
            "is_suspected": is_suspected,
            "risk_level": risk_level
        })
        
    return detections

@app.post("/api/anpr/recognize")
async def api_anpr_recognize(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        img_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        detections = process_anpr_frame(img_bgr)
        return JSONResponse(content={
            "detections": detections,
            "frame_width": img_bgr.shape[1],
            "frame_height": img_bgr.shape[0]
        })
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.get("/api/anpr/ipcam/poll")
async def poll_anpr_ipcam():
    global ipcam_latest_frame
    
    if ipcam_latest_frame is None:
        return JSONResponse(status_code=503, content={"error": "No frame available yet", "detections": [], "frame_base64": None})
        
    try:
        img_bgr = ipcam_latest_frame.copy()
        detections = process_anpr_frame(img_bgr)
        
        _, buffer = cv2.imencode('.jpg', img_bgr)
        frame_b64 = base64.b64encode(buffer).decode('utf-8')
        
        return JSONResponse(content={
            "detections": detections, 
            "frame_base64": frame_b64,
            "frame_width": img_bgr.shape[1],
            "frame_height": img_bgr.shape[0]
        })
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e), "detections": [], "frame_base64": None})

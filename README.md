# 🛡️ Intelligent Border Video Analytics Platform (IBVAP)

[![React](https://img.shields.io/badge/Frontend-React%2019-61DAFB?logo=react)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Build-Vite%208-646CFF?logo=vite)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Styling-Tailwind%20v4-38BDF8?logo=tailwindcss)](https://tailwindcss.com/)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?logo=fastapi)](https://fastapi.tiangolo.com/)
[![Python](https://img.shields.io/badge/Language-Python%203.10%2B-3776AB?logo=python)](https://python.org/)
[![YOLOv8](https://img.shields.io/badge/AI%20Model-YOLOv8%20%2F%20Thermal-FF6F00?logo=ultralytics)](https://docs.ultralytics.com/)

**Intelligent Border Video Analytics Platform (IBVAP)** is an enterprise-grade, real-time AI-powered video analytics and tactical intelligence platform engineered for border security, perimeter defense, critical infrastructure protection, and automated threat monitoring.

---

## 🌟 Key Features

### 📡 Surveillance & Computer Vision Engines
- **Thermal Intelligence:** Integrates fine-tuned `pitangent-ds/YOLOv8-human-detection-thermal` models to pinpoint human intrusion under zero-light and foliage conditions.
- **Night Vision Surveillance:** Adaptive image enhancement using **CLAHE (Contrast Limited Adaptive Histogram Equalization)** combined with object detection pipelines.
- **Human Face Detection & Watchlist Matching:** Real-time facial extraction, biometric database embedding comparison, and suspect watchlist verification against local SQLite databases.
- **Vehicle ANPR (Automatic Number Plate Recognition):** Optical Character Recognition (OCR) for license plate extraction, vehicle categorization, and hot-list matching.
- **Virtual Fence & Perimeter Intrusion Detection:** Interactive digital barrier configuration, polygon zone breach calculation, trajectory tracking, and automated event publishing.
- **Suspicious Activity & Pose Estimation:** Skeleton pose tracking using `YOLOv8-Pose` coupled with **MMAction2** and **MotionBERT** microservices for anomaly detection (loitering, crouching, running, fighting).

### 🎯 Command & Intelligence Suite
- **Tactical Command Dashboard:** Unified operational panel with real-time video grid feeds, threat heatmaps, geospatial mapping, and high-priority alert queues.
- **AI Intelligence Chatbot:** Context-aware security operational assistant for query resolution, threat analysis, and automated briefing generation.
- **Criminal Network Analysis:** Interactive relationship graph visualizer for tracking suspects, vehicles, associated locations, and criminal syndicate links.
- **Automated AI Reporting:** One-click generation of intelligence summaries, incident logs, and timeline exports.

### 💼 CRM & Case Management
- **Investigative Workflow:** Complete case tracking lifecycle including leads, contacts, agency organizations, task follow-ups, and timestamped activity streams.
- **System & Camera Management:** Multi-node camera stream orchestration, bandwidth utilization metrics, hardware status diagnostics, and security policy control.

---

## 🏗️ System Architecture

```
                               ┌────────────────────────────────────────┐
                               │   Tactical Command Dashboard (React)   │
                               └───────────────────┬────────────────────┘
                                                   │ WebSocket / REST API
                                                   ▼
                               ┌────────────────────────────────────────┐
                               │       FastAPI Gateway Engine           │
                               └───────┬──────────────┬───────────┬─────┘
                                       │              │           │
           ┌───────────────────────────┴────┐   ┌─────┴──────┐ ┌──┴─────────────────────────┐
           │ AI Vision & Analytics Pipeline │   │ Databases  │ │ Microservices             │
           ├────────────────────────────────┤   ├────────────┤ ├───────────────────────────┤
           │ • YOLOv8 Thermal Human Detection│   │ • SQLite   │ │ • MMAction2 (Action Rec)  │
           │ • CLAHE Low-Light Enhancer     │   │   (Faces / │ │ • MotionBERT (3D Pose)    │
           │ • Face Engine (ArcFace / Dlib) │   │    ANPR /  │ │ • AI Intelligence Chatbot │
           │ • ANPR Engine & OCR            │   │    Fence)  │ └─────────────────────────┘
           │ • Virtual Perimeter Engine     │   └────────────┘
           └────────────────────────────────┘
```

---

## 🛠️ Tech Stack

### **Frontend**
- **Framework:** React 19 + TypeScript + Vite 8
- **Styling:** Tailwind CSS v4, Framer Motion
- **Icons & Visualization:** Lucide React, Recharts
- **State Management & Routing:** Zustand, React Router v7
- **Content Rendering:** React Markdown

### **Backend**
- **Framework:** Python 3.10+, FastAPI, Uvicorn
- **AI / ML Frameworks:** PyTorch, Ultralytics YOLOv8, Supervision, HuggingFace Hub
- **Computer Vision:** OpenCV (`opencv-python`), Pillow
- **Database & Storage:** SQLite (`border_analytics.db`, `faces.db`), Local Storage Engines
- **Data Handling:** Pandas, NumPy, Pydantic

---

## 📁 Repository Structure

```
Intelligent-Border-Video-Analytics-Platform/
├── Backend/
│   ├── chatbot/              # AI Intelligence chatbot routes & prompts
│   ├── mmaction_service/     # Action recognition microservice wrappers
│   ├── motionbert_service/   # 3D pose trajectory estimation microservice
│   ├── services/             # Core logic services (risk engine, plate OCR, watchlist)
│   ├── storage/              # Uploaded media and processed stream artifacts
│   ├── utils/                # Helper utilities and image handlers
│   ├── virtual_fence/        # Perimeter boundary engine, geometry & routes
│   ├── anpr_engine.py        # License plate detection engine
│   ├── database.py           # SQLite database interface & queries
│   ├── face_engine.py        # Facial recognition and embedding engine
│   ├── main.py               # Main FastAPI server entry point
│   ├── requirements.txt      # Python dependencies
│   ├── yolov8n.pt            # Standard YOLOv8 object detection model
│   └── yolov8n-pose.pt       # YOLOv8 pose estimation model
│
└── Frontend/
    ├── public/               # Static assets & public resources
    ├── src/
    │   ├── assets/           # Media files, logos, icons
    │   ├── components/       # Shared UI components & layout wrappers
    │   ├── data/             # Mock feeds, preset streams, sample data
    │   ├── pages/            # View pages grouped by feature domain:
    │   │   ├── auth/         # Login & Authentication
    │   │   ├── command/      # Command Dashboard
    │   │   ├── crm/          # Cases, Leads, Contacts, Followups, Timeline
    │   │   ├── intelligence/ # AI Assistant, Criminal Network, Reports, Alerts
    │   │   ├── management/   # Cameras, System Status, Analytics, Settings
    │   │   └── surveillance/ # Live, Thermal, Night, ANPR, Face, Virtual Fence
    │   ├── store/            # Zustand global state stores
    │   ├── types/            # TypeScript interfaces & type definitions
    │   ├── App.tsx           # Route setup & root layout application
    │   └── main.tsx          # Application entry script
    ├── package.json          # Node.js dependencies & scripts
    ├── vite.config.ts        # Vite build tool configuration
    └── tsconfig.json         # TypeScript compiler configuration
```

---

## 🚀 Getting Started

### Prerequisites
Make sure you have the following installed on your machine:
- **Node.js** (v18.0 or higher)
- **Python** (v3.9 or higher)
- **Git**

---

### 1. Backend Setup

1. **Navigate to the Backend directory:**
   ```bash
   cd Backend
   ```

2. **Create and activate a virtual environment (recommended):**
   - **Windows:**
     ```bash
     python -m venv venv
     .\venv\Scripts\activate
     ```
   - **Linux / macOS:**
     ```bash
     python3 -m venv venv
     source venv/bin/activate
     ```

3. **Install Python dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

4. **Start the FastAPI backend server:**
   ```bash
   uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```
   *The API will be available at `http://localhost:8000` (Interactive API docs at `http://localhost:8000/docs`).*

---

### 2. Frontend Setup

1. **Navigate to the Frontend directory:**
   ```bash
   cd Frontend
   ```

2. **Install Node modules:**
   ```bash
   npm install
   ```

3. **Start the Vite development server:**
   ```bash
   npm run dev
   ```
   *Access the web application at `http://localhost:5173`.*

---

## 🔑 Default Login Credentials

| Role | Username | Password | Access Level |
| :--- | :--- | :--- | :--- |
| **Administrator** | `admin1` | `password123` | Full System Access |
| **Security Officer** | `admin2` | `securepass456` | Operations & Surveillance |
| **Tactical Commander** | `commander` | `bravo789` | Command Dashboard & Intelligence |

---

## 📡 Key API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/auth/login` | User authentication & token issuance |
| `POST` | `/detect` | Thermal human detection on uploaded image frame |
| `POST` | `/detect_night` | Night-vision CLAHE-enhanced human detection |
| `POST` | `/api/virtual_fence/*` | Polygon boundary definition & intrusion analytics |
| `POST` | `/api/chat` | AI Security Chatbot query endpoint |
| `GET` | `/api/face/*` | Face registration & identity matching |
| `GET` | `/api/anpr/*` | License plate recognition logs & watchlist check |

---

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

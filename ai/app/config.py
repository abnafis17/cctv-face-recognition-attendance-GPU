from __future__ import annotations
from dataclasses import dataclass
from typing import List
import yaml

@dataclass
class CameraCfg:
    rtsp_url: str
    camera_id: str
    width: int
    height: int

@dataclass
class RuntimeCfg:
    use_gpu: bool
    ai_fps: float
    detect_every_n_frames: int
    display_scale: float

@dataclass
class RecognitionCfg:
    model_name: str
    similarity_threshold: float
    min_face_size: int

@dataclass
class PoseCfg:
    enable_pose_check: bool
    yaw_left_deg: float
    yaw_right_deg: float
    pitch_up_deg: float
    pitch_down_deg: float
    tolerance_deg: float = 15.0


@dataclass
class EnrollmentCfg:
    angles: List[str]
    samples_per_angle: int
    min_quality_score: float
    allow_manual_override: bool

@dataclass
class AttendanceCfg:
    cooldown_seconds: int
    stable_hits_required: int
    save_snapshots: bool
    snapshot_dir: str

@dataclass
class BackendCfg:
    base_url: str

@dataclass
class AppConfig:
    camera: CameraCfg
    runtime: RuntimeCfg
    recognition: RecognitionCfg
    pose: PoseCfg
    enrollment: EnrollmentCfg
    attendance: AttendanceCfg
    backend: BackendCfg

def load_config(path: str = "config.yaml") -> AppConfig:
    with open(path, "r", encoding="utf-8") as f:
        raw = yaml.safe_load(f)

    return AppConfig(
        camera=CameraCfg(**raw["camera"]),
        runtime=RuntimeCfg(**raw["runtime"]),
        recognition=RecognitionCfg(**raw["recognition"]),
        pose=PoseCfg(**raw["pose"]),
        enrollment=EnrollmentCfg(**raw["enrollment"]),
        attendance=AttendanceCfg(**raw["attendance"]),
        backend=BackendCfg(**raw["backend"]),
    )

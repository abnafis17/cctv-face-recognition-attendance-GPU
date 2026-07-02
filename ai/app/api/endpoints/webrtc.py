import os
import time
import asyncio
from typing import Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

# pyrefly: ignore [missing-import]
from aiortc import RTCPeerConnection, RTCSessionDescription
# pyrefly: ignore [missing-import]
from aiortc.sdp import candidate_from_sdp

from app.core.config import DEFAULT_COMPANY_ID
from app.core.logging import logger
from app.services.stream_manager import get_stream_for_camera, stop_camera_stream, streams_lock, streams, last_active_times

router = APIRouter()

@router.websocket("/webrtc/signal")
async def webrtc_signal(ws: WebSocket):
    await ws.accept()
    logger.warning("[WebRTC] Signal WebSocket connection accepted.")

    pc: Optional[RTCPeerConnection] = None
    camera_id: Optional[str] = None
    max_ingest_fps = max(1.0, float(os.getenv("WEBRTC_INGEST_MAX_FPS", "30.0")))
    ingest_min_interval = 1.0 / max_ingest_fps

    try:
        while True:
            try:
                msg = await ws.receive_json()
                logger.warning(f"[WebRTC] Signal message received keys: {list(msg.keys())}")

                msg_cam_id = msg.get("cameraId")
                if msg_cam_id:
                    camera_id = str(msg_cam_id)

                if not camera_id:
                    continue

                company_from_msg = str(msg.get("companyId") or msg.get("company_id") or "").strip() or None
                comp_id = company_from_msg or DEFAULT_COMPANY_ID

                purpose = str(msg.get("purpose") or msg.get("intent") or "").strip().lower()
                ingest_only = False
                if purpose in {"enroll", "enrollment", "enroll2", "enroll2-auto", "presence"}:
                    ingest_only = True

                stream_type = msg.get("type") or msg.get("streamType") or msg.get("mode") or "attendance"

                stream = get_stream_for_camera(camera_id, comp_id, rtsp_url="webrtc")
                stream.stream_type = stream_type.strip().lower()
                stream.attendance_enabled = not ingest_only

                if "sdp" in msg:
                    try:
                        camera_id_for_connection = str(camera_id)
                        if pc:
                            try: await pc.close()
                            except: pass

                        pc = RTCPeerConnection()

                        @pc.on("track")
                        def on_track(track):
                            if track.kind != "video": return
                            logger.warning("[WebRTC] Video track received. Starting track loop...")

                            async def track_loop():
                                last_t = 0.0
                                while True:
                                    try:
                                        frame = await track.recv()
                                        now = time.monotonic()
                                        if (now - last_t) < ingest_min_interval:
                                            continue
                                        last_t = now

                                        def process_and_inject(f):
                                            img = f.to_ndarray(format="bgr24")
                                            with streams_lock:
                                                if camera_id_for_connection in streams:
                                                    streams[camera_id_for_connection].inject_frame(img)

                                        await asyncio.to_thread(process_and_inject, frame)
                                    except Exception as e:
                                        logger.warning(f"[WebRTC] Track loop exited: {e}")
                                        break

                            asyncio.create_task(track_loop())

                        offer = RTCSessionDescription(sdp=msg["sdp"]["sdp"], type=msg["sdp"]["type"])
                        await pc.setRemoteDescription(offer)
                        answer = await pc.createAnswer()
                        await pc.setLocalDescription(answer)

                        await ws.send_json({
                            "sdp": {"type": pc.localDescription.type, "sdp": pc.localDescription.sdp},
                            "cameraId": camera_id
                        })
                        logger.warning("[WebRTC] Sent SDP answer to client.")
                    except Exception as e:
                        logger.error(f"[WebRTC] SDP Error: {e}", exc_info=True)

                elif "ice" in msg and pc:
                    try:
                        ice = msg["ice"]
                        if ice and ice.get("candidate"):
                            cand_str = ice["candidate"]
                            if cand_str.startswith("candidate:"):
                                cand_str = cand_str.split(":", 1)[1]
                            candidate = candidate_from_sdp(cand_str)
                            candidate.sdpMid = ice.get("sdpMid")
                            candidate.sdpMLineIndex = ice.get("sdpMLineIndex")
                            await pc.addIceCandidate(candidate)
                    except Exception as e:
                        logger.warning(f"[WebRTC] ICE Candidate Error: {e}")
            except WebSocketDisconnect:
                raise
            except Exception as e:
                if "disconnect" in str(e).lower():
                    logger.warning(f"[WebRTC] Signal WebSocket disconnected during loop: {e}")
                    break
                logger.error(f"[WebRTC] Signal Loop Error: {e}")
                continue

    except WebSocketDisconnect:
        logger.warning("[WebRTC] Signal WebSocket disconnected.")
    except Exception as e:
        logger.error(f"[WebRTC] Fatal WebSocket Connection Error: {e}")
    finally:
        if pc:
            try: await pc.close()
            except: pass
        if camera_id:
            stop_camera_stream(camera_id)

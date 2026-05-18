from __future__ import annotations

import asyncio
import os
import time
from typing import Optional

import cv2
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect

from aiortc import RTCPeerConnection, RTCSessionDescription
from aiortc.sdp import candidate_from_sdp

from app.api.deps import get_container
from app.core.settings import infer_company_id_from_camera_id, normalize_stream_type

router = APIRouter()


@router.websocket("/webrtc/signal")
async def webrtc_signal(ws: WebSocket, container=Depends(get_container)):
    await ws.accept()

    pc: Optional[RTCPeerConnection] = None
    camera_id: Optional[str] = None
    max_ingest_fps = max(1.0, float(os.getenv("WEBRTC_INGEST_MAX_FPS", "15.0")))
    ingest_min_interval = 1.0 / max_ingest_fps
    max_ingest_side = max(0, int(float(os.getenv("WEBRTC_INGEST_MAX_SIDE", "640"))))

    try:
        while True:
            try:
                msg = await ws.receive_json()

                # Persistence: only update camera_id if present in message
                msg_cam_id = msg.get("cameraId")
                if msg_cam_id:
                    camera_id = str(msg_cam_id)

                if not camera_id:
                    # Ignore messages that don't tell us which camera they are for
                    continue

                purpose = str(msg.get("purpose") or msg.get("intent") or "").strip().lower()
                ingest_only = False
                if purpose in {"enroll", "enrollment", "enroll2", "enroll2-auto", "presence"}:
                    ingest_only = True

                company_from_msg = (
                    str(msg.get("companyId") or msg.get("company_id") or "").strip() or None
                )
                if not company_from_msg:
                    company_from_msg = infer_company_id_from_camera_id(camera_id)

                container.attendance_rt.set_company_for_camera(
                    camera_id,
                    company_from_msg or container.attendance_rt.default_company_id,
                )

                st_from_msg = msg.get("type") or msg.get("streamType") or msg.get("mode")
                if st_from_msg:
                    try:
                        container.attendance_rt.set_stream_type(
                            camera_id, normalize_stream_type(st_from_msg)
                        )
                    except Exception:
                        pass

                container.attendance_rt.set_attendance_enabled(camera_id, not ingest_only)

                # SDP OFFER
                if "sdp" in msg:
                    try:
                        camera_id_for_connection = str(camera_id)
                        if pc:
                            try: await pc.close()
                            except: pass

                        pc = RTCPeerConnection()

                        # Only start worker if needed
                        if purpose not in {"enroll", "presence"}:
                            container.rec_worker.start(
                                camera_id=camera_id_for_connection,
                                camera_name=f"Laptop-{camera_id_for_connection}",
                                ai_fps=25.0
                            )

                        @pc.on("track")
                        async def on_track(track):
                            if track.kind != "video": return
                            last_t = 0.0
                            while True:
                                try:
                                    frame = await track.recv()
                                    now = time.monotonic()
                                    if (now - last_t) < 0.04: # Max 25fps ingest
                                        continue
                                    last_t = now

                                    img = frame.to_ndarray(format="bgr24")
                                    # Fast resize only if needed
                                    h, w = img.shape[:2]
                                    if max(h, w) > 640:
                                        scale = 640.0 / max(h, w)
                                        img = cv2.resize(img, (int(w*scale), int(h*scale)), interpolation=cv2.INTER_LINEAR)

                                    # Inject frame for AI processing
                                    container.camera_rt.inject_frame(camera_id_for_connection, img)

                                    # NOTE: We skip HLS writing here to save Disk I/O and reduce lag
                                    # The MJPEG stream handles the live annotated view
                                except Exception:
                                    break

                        offer = RTCSessionDescription(sdp=msg["sdp"]["sdp"], type=msg["sdp"]["type"])
                        await pc.setRemoteDescription(offer)
                        answer = await pc.createAnswer()
                        await pc.setLocalDescription(answer)

                        await ws.send_json({
                            "sdp": {"type": pc.localDescription.type, "sdp": pc.localDescription.sdp},
                            "cameraId": camera_id
                        })
                    except Exception as e:
                        print(f"[WebRTC] SDP Error: {e}")

                # ICE CANDIDATE
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
                    except Exception:
                        pass
            except Exception as e:
                print(f"[WebRTC] Signal Error: {e}")
                continue

    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"[WebRTC] Fatal Connection Error: {e}")
    finally:
        if pc:
            try: await pc.close()
            except: pass
        if camera_id:
            container.rec_worker.stop(camera_id)
            container.hls_rt.stop(camera_id)
            try: container.attendance_rt.set_attendance_enabled(camera_id, False)
            except: pass

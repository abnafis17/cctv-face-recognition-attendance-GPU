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
    ingest_only: bool = False
    max_ingest_fps = max(1.0, float(os.getenv("WEBRTC_INGEST_MAX_FPS", "15.0")))
    ingest_min_interval = 1.0 / max_ingest_fps
    max_ingest_side = max(0, int(float(os.getenv("WEBRTC_INGEST_MAX_SIDE", "640"))))

    try:
        while True:
            msg = await ws.receive_json()
            camera_id = msg.get("cameraId")

            if not camera_id:
                continue

            purpose = str(msg.get("purpose") or msg.get("intent") or "").strip().lower()
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
                ingest_only_for_connection = bool(ingest_only)
                camera_id_for_connection = str(camera_id)
                pc = RTCPeerConnection()

                @pc.on("track")
                async def on_track(track):
                    if track.kind != "video":
                        return

                    if not ingest_only_for_connection:
                        try:
                            container.rec_worker.start(
                                camera_id=camera_id_for_connection,
                                camera_name=f"Laptop-{camera_id_for_connection}",
                                ai_fps=30.0,
                            )
                            container.hls_rt.start(camera_id_for_connection)
                        except Exception as e:
                            print(f"[WebRTC] worker start warning for {camera_id_for_connection}: {e}")

                    last_ingest_at = 0.0
                    while True:
                        try:
                            frame = await track.recv()
                            now = time.monotonic()
                            if (now - last_ingest_at) < ingest_min_interval:
                                continue
                            last_ingest_at = now

                            img = frame.to_ndarray(format="bgr24")
                            if max_ingest_side > 0:
                                h, w = img.shape[:2]
                                longest = max(h, w)
                                if longest > max_ingest_side:
                                    scale = float(max_ingest_side) / float(longest)
                                    nh = max(1, int(round(h * scale)))
                                    nw = max(1, int(round(w * scale)))
                                    img = cv2.resize(
                                        img,
                                        (nw, nh),
                                        interpolation=cv2.INTER_AREA,
                                    )

                            container.camera_rt.inject_frame(camera_id_for_connection, img)

                            if not ingest_only_for_connection:
                                try:
                                    annotated = container.rec_worker.get_latest_annotated(
                                        camera_id_for_connection
                                    )
                                    if annotated is None:
                                        annotated = img
                                    container.hls_rt.write(camera_id_for_connection, annotated)
                                except Exception as e:
                                    print(
                                        f"[HLS] laptop write failed for "
                                        f"{camera_id_for_connection}: {e}"
                                    )
                                    continue

                        except Exception as e:
                            print(
                                f"[WebRTC] track loop stopped for "
                                f"{camera_id_for_connection}: {e}"
                            )
                            break

                offer = RTCSessionDescription(
                    sdp=msg["sdp"]["sdp"],
                    type=msg["sdp"]["type"],
                )
                await pc.setRemoteDescription(offer)

                answer = await pc.createAnswer()
                await pc.setLocalDescription(answer)

                # allow ICE gathering to finish
                try:
                    deadline = time.time() + 2.0
                    while pc.iceGatheringState != "complete" and time.time() < deadline:
                        await asyncio.sleep(0.05)
                except Exception:
                    pass

                await ws.send_json(
                    {
                        "sdp": {
                            "type": pc.localDescription.type,
                            "sdp": pc.localDescription.sdp,
                        },
                        "cameraId": camera_id,
                    }
                )

            # ICE
            elif "ice" in msg and pc:
                ice = msg["ice"]
                candidate = None
                if ice:
                    candidate_str = ice.get("candidate")
                    if candidate_str:
                        if candidate_str.startswith("candidate:"):
                            candidate_str = candidate_str.split(":", 1)[1]
                        candidate = candidate_from_sdp(candidate_str)
                        candidate.sdpMid = ice.get("sdpMid")
                        candidate.sdpMLineIndex = ice.get("sdpMLineIndex")
                await pc.addIceCandidate(candidate)

    except WebSocketDisconnect:
        pass
    finally:
        if pc:
            await pc.close()
        if camera_id:
            container.rec_worker.stop(camera_id)
            container.hls_rt.stop(camera_id)
            try:
                container.attendance_rt.set_attendance_enabled(camera_id, False)
            except Exception:
                pass

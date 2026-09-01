// src/lib/webrtc.ts

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export function getWebRTCIceServers(): RTCIceServer[] {
  try {
    const raw = process.env.NEXT_PUBLIC_MEDIA_WEBRTC_ICE_SERVERS;
    if (raw) {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn("Failed to parse NEXT_PUBLIC_MEDIA_WEBRTC_ICE_SERVERS:", err);
  }

  return DEFAULT_ICE_SERVERS;
}

export function createPeerConnection(
  customServers?: RTCIceServer[],
): RTCPeerConnection {
  const iceServers = customServers || getWebRTCIceServers();
  return new RTCPeerConnection({
    iceServers,
    iceCandidatePoolSize: 2,
  });
}

/**
 * Replaces active video track on an existing peer connection without tearing down the connection.
 */
export async function replaceVideoTrack(
  pc: RTCPeerConnection | null,
  newTrack: MediaStreamTrack | null,
): Promise<boolean> {
  if (!pc) return false;

  try {
    const senders = pc.getSenders();
    const videoSender = senders.find(
      (s) => s.track && s.track.kind === "video",
    );
    if (videoSender) {
      await videoSender.replaceTrack(newTrack);
      return true;
    }
  } catch (err) {
    console.warn("replaceTrack failed, reconnection needed:", err);
  }

  return false;
}

export type Camera = {
  id: string;
  name?: string;
  isActive?: boolean;
};

export type Step = "front" | "left" | "right" | "up" | "down";

export type Session = {
  session_id: string;
  employee_id: string;
  name: string;
  camera_id: string;
  status: "running" | "saving" | "saved" | "error" | "stopped";
  current_step: Step;
  instruction: string;
  collected: Record<string, number>;
  last_quality: number;
  last_pose?: string | null;
  last_message?: string | null;
  overlay_roi_faces?: number;
  overlay_multi_in_roi?: boolean;
  voice_seq?: number;
  voice_text?: string | null;
  overlay_primary_bbox?: [number, number, number, number] | null;
  bbox?: [number, number, number, number] | null;
};

export type Screen = "setup" | "enrolling";

import type { Step } from "./types";

export function friendlyAxiosError(err: any) {
  return (
    err?.response?.data?.message ||
    err?.response?.data?.error ||
    err?.message ||
    "Request failed"
  );
}

export function stepLabel(step: Step) {
  switch (step) {
    case "front":
      return "Look straight";
    case "left":
      return "Turn left";
    case "right":
      return "Turn right";
    case "up":
      return "Look up";
    case "down":
      return "Look down";
    default:
      return step;
  }
}

export function stepArrow(step: Step) {
  switch (step) {
    case "front":
      return "•";
    case "left":
      return "←";
    case "right":
      return "→";
    case "up":
      return "↑";
    case "down":
      return "↓";
    default:
      return "•";
  }
}

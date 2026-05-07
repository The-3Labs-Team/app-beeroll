export type BRollStatus =
  | "pending" | "searching" | "picking" | "downloading" | "done" | "skipped" | "error";

export interface VideoCandidate {
  video_id: string;
  title: string;
  channel: string;
  duration_sec: number;
  thumb_url: string;
  url: string;
}

export interface BRollPoint {
  id: string;
  phrase: string;
  t_start: number | null;
  t_end: number | null;
  keywords: string[];
  active_keyword: string;
  status: BRollStatus;
  selected_video: VideoCandidate | null;
  output_clip: string | null;
}

export interface Project {
  version: number;
  slug: string;
  name: string;
  created_at: string;
  voiceover: { kind: "audio" | "text"; path: string; duration_sec: number | null };
  transcript: { start: number; end: number; text: string }[];
  broll_points: BRollPoint[];
}

export interface DownloadProgressEvent {
  point_id: string;
  percent: number;
  eta_sec: number | null;
}

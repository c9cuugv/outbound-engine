/** Campaign analytics overview */
export interface CampaignAnalytics {
  overview: {
    total_leads: number;
    emails_sent: number;
    open_rate: number;
    click_rate: number;
    reply_rate: number;
    bounce_rate: number;
  };
  by_sequence_step: SequenceStepStats[];
  by_day: DailyStats[];
  reply_sentiment_breakdown: Record<string, number>;
  top_performing_subjects: SubjectPerformance[];
}

export interface SequenceStepStats {
  step: number;
  sent: number;
  opened: number;
  clicked: number;
  replied: number;
}

export interface DailyStats {
  date: string;
  sent: number;
  opened: number;
  clicked: number;
  replied: number;
}

export interface SubjectPerformance {
  subject: string;
  sent: number;
  open_rate: number;
  reply_rate: number;
}

/** Live event from WebSocket feed */
export interface LiveEvent {
  id: string;
  type: "email_sent" | "email_opened" | "link_clicked" | "reply_received";
  lead_name: string;
  lead_email: string;
  step: number;
  subject?: string;
  url?: string;
  sentiment?: string;
  timestamp: string;
}

/** Lead timeline event */
export interface TimelineEvent {
  type: "email_sent" | "email_opened" | "link_clicked" | "reply_received";
  step: number;
  at: string;
  subject?: string;
  device?: string;
  url?: string;
  sentiment?: string;
  preview?: string;
}

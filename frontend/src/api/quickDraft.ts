import api from './client';

export interface QuickDraftRequest {
  website_url: string;
  product_name: string;
  value_proposition: string;
  prospect_name: string;
  prospect_email: string;
}

export interface QuickDraftResponse {
  subject: string;
  body: string;
  scraped_signals: Record<string, string>;
  website_url: string;
}

export const quickDraft = (data: QuickDraftRequest): Promise<QuickDraftResponse> =>
  api.post('/quick-draft', data, { timeout: 120_000 }).then(r => r.data);

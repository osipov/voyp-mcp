export interface StartCallResponse {
  id?: string;
  url?: string;
  error?: string
}
export interface HangupCallResponse {
  success?: boolean;
  error?: string
}

export interface StartCallRequest {
  number: string;
  context: string;
}

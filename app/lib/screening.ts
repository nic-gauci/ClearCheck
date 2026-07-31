export type ScreeningMatch = {
  source:string;
  sourceClass:string;
  name:string;
  type:string;
  confidence:number;
  detail:string;
  meta:string[];
  href:string;
};

export type ScreeningSource = {
  key:string;
  name:string;
  status:"complete"|"unavailable"|"review";
  count:number;
  checkedAt:string;
  message?:string;
};

export type WebSearch = { term:string; label:string; query:string; href:string };

export type SavedScreening = {
  id:string;
  case_reference:string;
  subject_name:string;
  subject_type:"person"|"business";
  status:string;
  risk_state:"clear"|"review"|"incomplete";
  match_count:number;
  source_count:number;
  results:ScreeningMatch[];
  sources:ScreeningSource[];
  web_searches:WebSearch[];
  checked_at:string;
  completed_at:string|null;
  created_at:string;
};

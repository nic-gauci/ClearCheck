export type ScreeningMatch = {
  source:string;
  sourceClass:string;
  name:string;
  type:string;
  confidence:number;
  detail:string;
  meta:string[];
  href:string;
  aliases?:string[];
  dateOfBirth?:string;
  nationalities?:string[];
  identificationNumbers?:string[];
  matchReason?:string;
  legalBasis?:string;
};

export type ScreeningSource = {
  key:string;
  name:string;
  status:"complete"|"unavailable"|"review";
  count:number;
  checkedAt:string;
  message?:string;
  sourceUrl?:string;
  version?:string;
  lastUpdated?:string;
  licence?:string;
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
  credits_charged?:number;
  source_count:number;
  results:ScreeningMatch[];
  sources:ScreeningSource[];
  web_searches:WebSearch[];
  checked_at:string;
  completed_at:string|null;
  created_at:string;
  customer_reference?:string|null;
  screening_purpose?:string|null;
  input_identifiers?:{dateOfBirth?:string;nationality?:string;identificationNumber?:string;country?:string;registrationNumber?:string};
  review_status?:"unreviewed"|"under_review"|"closed_no_match"|"false_positive"|"confirmed_match"|"more_information_required"|"escalated";
  review_notes?:string|null;
  review_identifiers?:string|null;
  reviewed_by?:string|null;
  reviewed_by_display_name?:string|null;
  reviewed_at?:string|null;
  assigned_to?:string|null;
  review_due_at?:string|null;
};

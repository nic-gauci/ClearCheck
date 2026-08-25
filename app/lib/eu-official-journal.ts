import { matchNames } from "./name-matching.ts";
import type { EULegalDesignation } from "../../supabase/functions/_shared/eu-legal-designations.ts";

export type EUOfficialJournalDataset={generatedAt:string;since:string;acts:number;entries:EULegalDesignation[];version:string};

export function screenEUOfficialJournalDataset(dataset:EUOfficialJournalDataset,query:string,subjectType:"person"|"business"){
  const matches=[];
  for(const entry of dataset.entries){
    if(entry.type!==subjectType)continue;
    const nameMatch=matchNames(entry.aliases.length?entry.aliases:[entry.name],query);if(!nameMatch.matched)continue;
    matches.push({...entry,confidence:nameMatch.confidence,matchReason:nameMatch.reason});
    if(matches.length>=25)break;
  }
  return matches;
}

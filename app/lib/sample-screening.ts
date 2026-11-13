import type { SavedScreening } from "./screening";

const checkedAt="2026-11-01T10:00:00Z";

export function sampleScreening(incomplete:boolean):SavedScreening{
  return {
    id:"sample",case_reference:incomplete?"DEMO-INCOMPLETE":"DEMO-MATCH",
    subject_name:"Example Harbour Trading Ltd",subject_type:"business",
    status:"completed",risk_state:incomplete?"incomplete":"review",
    match_count:incomplete?0:1,source_count:3,
    results:incomplete?[]:[{
      source:"EU",sourceClass:"eu",name:"Example Harbour Trading Company",
      type:"Entity",confidence:93,detail:"Fictional example to illustrate a similar name.",
      meta:[],href:"",
    }],
    sources:[
      {key:"EU",name:"European Union",status:incomplete?"unavailable":"complete",count:incomplete?0:1,checkedAt},
      {key:"UN",name:"United Nations",status:"complete",count:0,checkedAt},
      {key:"MT",name:"Malta court orders",status:"complete",count:0,checkedAt},
    ],
    web_searches:[],checked_at:checkedAt,created_at:checkedAt,completed_at:checkedAt,
    screening_purpose:"Fictional sample. No screening was run.",
  };
}

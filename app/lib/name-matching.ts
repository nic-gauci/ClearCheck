const CYRILLIC:Record<string,string>={
  а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ё:"e",ж:"zh",з:"z",и:"i",й:"i",к:"k",л:"l",м:"m",н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",х:"kh",ц:"ts",ч:"ch",ш:"sh",щ:"shch",ы:"y",э:"e",ю:"yu",я:"ya",ь:"",ъ:"",
};

export function transliterate(value:string){
  return [...value].map(character=>{
    const lower=character.toLowerCase(),replacement=CYRILLIC[lower];
    if(replacement===undefined)return character;
    return character===character.toUpperCase()?replacement.toUpperCase():replacement;
  }).join("");
}

export function normalizeName(value:string){
  return transliterate(value).normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
}

function editDistance(left:string,right:string){
  const previous=Array.from({length:right.length+1},(_,index)=>index),current=[0];
  for(let row=1;row<=left.length;row++){
    current[0]=row;
    for(let column=1;column<=right.length;column++){
      const substitution=previous[column-1]+(left[row-1]===right[column-1]?0:1);
      current[column]=Math.min(previous[column]+1,current[column-1]+1,substitution);
    }
    for(let column=0;column<=right.length;column++)previous[column]=current[column];
  }
  return previous[right.length];
}

function tokenSimilarity(left:string,right:string){
  if(left===right)return 1;
  if(Math.min(left.length,right.length)<3)return 0;
  return 1-editDistance(left,right)/Math.max(left.length,right.length);
}

export type NameMatch={matched:boolean;confidence:number;reason:"exact"|"alias"|"transliterated"|"fuzzy"|"none";matchedName?:string};

export function matchNames(candidateNames:string[],query:string):NameMatch{
  const normalizedQuery=normalizeName(query),queryTokens=normalizedQuery.split(" ").filter(Boolean);
  if(!normalizedQuery||!queryTokens.length)return{matched:false,confidence:0,reason:"none"};
  let best:NameMatch={matched:false,confidence:0,reason:"none"};
  candidateNames.filter(Boolean).forEach((candidate,index)=>{
    const normalizedCandidate=normalizeName(candidate),candidateTokens=normalizedCandidate.split(" ").filter(Boolean);
    if(!normalizedCandidate)return;
    if(normalizedCandidate===normalizedQuery){
      const transliterated=transliterate(candidate)!==candidate;
      const result:NameMatch={matched:true,confidence:100,reason:transliterated?"transliterated":index?"alias":"exact",matchedName:candidate};
      if(result.confidence>best.confidence)best=result;
      return;
    }
    const unused=[...candidateTokens];
    const similarities=queryTokens.map(token=>{
      let highest=0,highestIndex=-1;
      unused.forEach((candidateToken,candidateIndex)=>{const similarity=tokenSimilarity(token,candidateToken);if(similarity>highest){highest=similarity;highestIndex=candidateIndex}});
      if(highestIndex>=0)unused.splice(highestIndex,1);
      return highest;
    });
    const average=similarities.reduce((sum,value)=>sum+value,0)/similarities.length;
    const allStrong=similarities.every((value,index)=>value>=(queryTokens[index]?.length>=6?0.64:0.74));
    const lengthCompatible=Math.abs(candidateTokens.length-queryTokens.length)<=2;
    const confidence=Math.round(average*92);
    if(allStrong&&lengthCompatible&&confidence>=72&&confidence>best.confidence)best={matched:true,confidence,reason:"fuzzy",matchedName:candidate};
  });
  return best;
}

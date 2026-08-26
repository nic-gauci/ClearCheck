import { jsPDF } from "jspdf";

type PurchaseReceipt={
  planName:string;
  credits:number;
  amountCents:number|null;
  currency:string;
  status:string;
  purchasedAt:string;
  reference:string|null;
  organisationName:string;
  billingEmail:string;
};

function safeFilePart(value:string){
  return value.replace(/[^a-z0-9]+/gi,"-").replace(/^-|-$/g,"").slice(0,48)||"purchase";
}

export function downloadPurchaseReceipt(invoice:PurchaseReceipt){
  const pdf=new jsPDF({unit:"mm",format:"a4"});
  const pageWidth=pdf.internal.pageSize.getWidth();
  const ink:[number,number,number]=[20,59,52];
  const green:[number,number,number]=[35,118,91];
  const muted:[number,number,number]=[96,118,111];
  const purchased=new Date(invoice.purchasedAt);
  const receiptId=invoice.reference?.replace(/^(checkout|invoice):/,"")||`CC-${purchased.getTime()}`;
  const amount=invoice.amountCents===null?"Not recorded":`${invoice.currency.toUpperCase()} ${(invoice.amountCents/100).toFixed(2)}`;

  pdf.setFillColor(...ink);
  pdf.rect(0,0,pageWidth,48,"F");
  pdf.setTextColor(255,255,255);
  pdf.setFont("helvetica","bold");
  pdf.setFontSize(23);
  pdf.text("ClearCheck",18,21);
  pdf.setFont("helvetica","normal");
  pdf.setFontSize(9);
  pdf.setTextColor(184,209,200);
  pdf.text("PURCHASE RECEIPT",18,30);
  pdf.setFontSize(8);
  pdf.text(`Receipt ${receiptId}`,pageWidth-18,20,{align:"right",maxWidth:85});
  pdf.text(purchased.toLocaleDateString("en-GB",{day:"2-digit",month:"long",year:"numeric"}),pageWidth-18,28,{align:"right"});

  pdf.setTextColor(...green);
  pdf.setFont("helvetica","bold");
  pdf.setFontSize(8);
  pdf.text("BILLED TO",18,64);
  pdf.setTextColor(...ink);
  pdf.setFontSize(13);
  pdf.text(invoice.organisationName,18,72);
  pdf.setFont("helvetica","normal");
  pdf.setFontSize(9);
  pdf.setTextColor(...muted);
  pdf.text(invoice.billingEmail||"Billing email not recorded",18,79);

  pdf.setDrawColor(216,228,223);
  pdf.setFillColor(248,251,249);
  pdf.roundedRect(18,94,pageWidth-36,42,3,3,"FD");
  const columns=[18,88,128,158];
  const labels=["PLAN","CREDITS","STATUS","AMOUNT"];
  const values=[invoice.planName,String(invoice.credits),invoice.status,amount];
  labels.forEach((label,index)=>{
    const x=columns[index]+(index===0?6:0);
    pdf.setFont("helvetica","bold");
    pdf.setFontSize(7);
    pdf.setTextColor(...green);
    pdf.text(label,x,106);
    pdf.setFontSize(index===3?12:10);
    pdf.setTextColor(...ink);
    pdf.text(values[index],x,119,{maxWidth:index===0?58:38});
  });

  pdf.setFont("helvetica","bold");
  pdf.setFontSize(8);
  pdf.setTextColor(...green);
  pdf.text("PAYMENT DETAILS",18,153);
  pdf.setFont("helvetica","normal");
  pdf.setFontSize(9);
  pdf.setTextColor(...muted);
  pdf.text("Purchase date",18,164);
  pdf.text("Payment reference",18,173);
  pdf.setTextColor(...ink);
  pdf.text(purchased.toLocaleString("en-GB",{dateStyle:"medium",timeStyle:"short"}),62,164);
  const referenceLines=pdf.splitTextToSize(invoice.reference||receiptId,pageWidth-80);
  pdf.text(referenceLines,62,173);

  pdf.setDrawColor(218,226,222);
  pdf.line(18,267,pageWidth-18,267);
  pdf.setFontSize(7.5);
  pdf.setTextColor(...muted);
  pdf.text("This receipt records a completed ClearCheck purchase. It is not a tax invoice.",18,275);
  pdf.text("ClearCheck - AML screening workspace",18,283);
  pdf.text("Page 1 of 1",pageWidth-18,283,{align:"right"});

  pdf.setProperties({title:`ClearCheck receipt - ${invoice.planName}`,subject:"ClearCheck purchase receipt",author:"ClearCheck",keywords:"receipt, purchase, ClearCheck"});
  pdf.save(`ClearCheck-receipt-${safeFilePart(receiptId)}.pdf`);
}

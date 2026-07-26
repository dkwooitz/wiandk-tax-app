/* ============================================================
   TY2026 parameters — IRS Rev. Proc. 2025-32 + OBBBA
   Brackets: [lowerBound, marginalRate], rate applies to income ABOVE lowerBound
   ============================================================ */
const P = {
  brackets:{
    single:[[0,.10],[12400,.12],[50400,.22],[105700,.24],[201775,.32],[256225,.35],[640600,.37]],
    mfj:   [[0,.10],[24800,.12],[100800,.22],[211400,.24],[403550,.32],[512450,.35],[768700,.37]],
    hoh:   [[0,.10],[17700,.12],[67450,.22],[105700,.24],[201775,.32],[256200,.35],[640600,.37]],
    mfs:   [[0,.10],[12400,.12],[50400,.22],[105700,.24],[201775,.32],[256225,.35],[384350,.37]]
  },
  stdDed:{single:16100, mfj:32200, hoh:24150, mfs:16100},
  add65: {single:2050, hoh:2050, mfs:2050, mfj:1650},  // per qualifying person
  cg:{ // [zeroCeiling, twentyStart]
    single:[49450,545500], mfj:[98900,613700], hoh:[66200,579600], mfs:[49450,306850]
  },
  ssWageBase:184500, ssRate:.062, medRate:.0145,
  addlMedThresh:{single:200000, hoh:200000, mfj:250000, mfs:125000},
  niitThresh:{single:200000, hoh:200000, mfj:250000, mfs:125000},
  ctcPerChild:2200, ctcRefundableCap:1700,
  ctcPhaseStart:{single:200000, hoh:200000, mfs:200000, mfj:400000}
};

const state={status:"single", kids:0};

/* ---------- helpers ---------- */
const $=id=>document.getElementById(id);
const num=id=>{const v=parseFloat($(id).value);return isNaN(v)||v<0?0:v;};
const fmt=n=>{
  const r=Math.round(n);
  return (r<0?"–$":"$")+Math.abs(r).toLocaleString("en-US");
};
const fmt0=n=>"$"+Math.round(n).toLocaleString("en-US");

function ordinaryTax(T, br){
  let tax=0;
  for(let i=0;i<br.length;i++){
    const lo=br[i][0], rate=br[i][1];
    const hi=(i+1<br.length)?br[i+1][0]:Infinity;
    if(T>lo) tax+=(Math.min(T,hi)-lo)*rate;
  }
  return tax;
}
function marginalRate(T, br){
  let r=br[0][1];
  for(const [lo,rate] of br){ if(T>lo) r=rate; }
  return r;
}
const overlap=(a,b,lo,hi)=>Math.max(0, Math.min(b,hi)-Math.max(a,lo));

/* ---------- core calculation ---------- */
function compute(){
  const s=state.status;
  const wages=num("wages"), se=num("se"), ordInv=num("ordinv"),
        ltcg=num("ltcg"), adjust=num("adjust"), withheld=num("withheld"),
        estPaid=num("estpaid"), itemized=num("itemized"), kids=state.kids;
  const age65 = ($("age65self").checked?1:0) + (s==="mfj" && $("age65spouse").checked?1:0);

  // --- Self-employment tax (§1401/§1402) ---
  const netSE = se*0.9235;
  let seTax=0, seSS=0, seMed=0;
  if(netSE>=400){
    const ssRoom=Math.max(0, P.ssWageBase - Math.min(wages, P.ssWageBase));
    seSS = Math.min(netSE, ssRoom)*0.124;
    seMed = netSE*0.029;
    seTax = seSS+seMed;
  }
  const halfSE = seTax*0.5;   // §164(f) above-the-line deduction

  // --- Total income & AGI ---
  const totalIncome = wages+se+ordInv+ltcg;
  const agi = Math.max(0, totalIncome - halfSE - adjust);

  // --- Deduction: greater of standard (+65) or itemized ---
  const stdBase = P.stdDed[s] + age65*P.add65[s];
  const useItemized = itemized > stdBase;
  const deduction = useItemized ? itemized : stdBase;

  // --- QBI deduction (§199A), simplified 20% ---
  const qbiBase = Math.max(0, se - halfSE);
  const preIncome = Math.max(0, agi - deduction);           // taxable income before QBI
  const qbiCap = 0.20 * Math.max(0, preIncome - ltcg);       // 20% of taxable income minus net cap gains
  const qbi = Math.min(0.20*qbiBase, qbiCap);

  const taxableIncome = Math.max(0, agi - deduction - qbi);

  // --- Split ordinary vs preferential, tax each ---
  const prefInc = Math.min(ltcg, taxableIncome);
  const ordTaxable = Math.max(0, taxableIncome - prefInc);
  const ordTax = ordinaryTax(ordTaxable, P.brackets[s]);

  const [cg0, cg20] = P.cg[s];
  const gLo=ordTaxable, gHi=taxableIncome;
  const g15 = overlap(gLo,gHi,cg0,cg20)*0.15;
  const g20 = overlap(gLo,gHi,cg20,Infinity)*0.20;
  const cgTax = g15+g20;

  const incomeTaxBefore = ordTax + cgTax;

  // --- Additional Medicare Tax (0.9%) ---
  const earned = wages + netSE;
  const addlMed = Math.max(0, earned - P.addlMedThresh[s])*0.009;

  // --- NIIT (3.8%) ---
  const nii = ordInv + ltcg;
  const niit = Math.min(nii, Math.max(0, agi - P.niitThresh[s]))*0.038;

  // --- Child Tax Credit (§24) ---
  let ctc=0, ctcRefundable=0, ctcNonref=0;
  if(kids>0){
    let raw = kids*P.ctcPerChild;
    const over = Math.max(0, agi - P.ctcPhaseStart[s]);
    const reduction = Math.ceil(over/1000)*50;
    ctc = Math.max(0, raw - reduction);
    ctcNonref = Math.min(ctc, incomeTaxBefore);
    const leftover = ctc - ctcNonref;
    ctcRefundable = Math.min(leftover, kids*P.ctcRefundableCap, 0.15*Math.max(0, earned-2500));
  }

  // --- Totals ---
  const incomeSideTax = Math.max(0, incomeTaxBefore - ctcNonref) + seTax + addlMed + niit;
  const payments = withheld + estPaid + ctcRefundable;
  const settlement = payments - incomeSideTax;  // + = refund, - = owed

  // --- Employee payroll (memo only; already withheld from paychecks) ---
  const empSS = Math.min(wages, P.ssWageBase)*P.ssRate;
  const empMed = wages*P.medRate;
  const empPayroll = empSS+empMed;

  const totalBurden = incomeSideTax + empPayroll; // full federal footprint incl. payroll
  const effOnAGI = agi>0 ? (incomeSideTax/agi*100) : 0;
  const effTotal = totalIncome>0 ? (totalBurden/totalIncome*100) : 0;
  const marginal = marginalRate(ordTaxable, P.brackets[s])*100;

  return {wages,se,ordInv,ltcg,adjust,withheld,estPaid,itemized,kids,age65,
    netSE,seTax,seSS,seMed,halfSE,totalIncome,agi,stdBase,useItemized,deduction,
    qbi,qbiBase,taxableIncome,prefInc,ordTaxable,ordTax,g15,g20,cgTax,incomeTaxBefore,
    addlMed,earned,nii,niit,ctc,ctcNonref,ctcRefundable,incomeSideTax,payments,settlement,
    empSS,empMed,empPayroll,totalBurden,effOnAGI,effTotal,marginal,
    cg0,cg20};
}

/* ---------- rendering ---------- */
function row(label, cite, amount, cls=""){
  const neg = amount<0 ? " neg":"";
  return `<div class="row ${cls}"><div><span class="rlabel">${label}</span>${cite?`<span class="cite">${cite}</span>`:""}</div><div class="amt${neg}">${fmt(amount)}</div></div>`;
}
function rowRaw(label, cite, text, cls=""){
  return `<div class="row ${cls}"><div><span class="rlabel">${label}</span>${cite?`<span class="cite">${cite}</span>`:""}</div><div class="amt">${text}</div></div>`;
}

function render(){
  const d=compute();
  const s=state.status;

  /* Income */
  let inc="";
  inc+=row("W‑2 wages","", d.wages);
  if(d.se) inc+=row("Self‑employment income","Schedule C", d.se);
  if(d.ordInv) inc+=row("Interest, dividends, other","ordinary", d.ordInv);
  if(d.ltcg) inc+=row("Qualified dividends + LT gains","§1(h)", d.ltcg);
  inc+=row("Total income","", d.totalIncome, "sub");
  $("incomeRows").innerHTML=inc;

  /* Adjustments & deductions */
  let ded="";
  if(d.halfSE) ded+=row("Less: ½ self‑employment tax","§164(f)", -d.halfSE);
  if(d.adjust) ded+=row("Less: above‑the‑line adjustments","§62", -d.adjust);
  ded+=row("Adjusted gross income (AGI)","§62", d.agi, "sub");
  ded+=row(d.useItemized?"Less: itemized deductions":"Less: standard deduction"+(d.age65?` (incl. ${fmt0(d.age65*P.add65[s])} age 65+)`:""),
           d.useItemized?"§63(d)":"§63(c)", -d.deduction);
  if(d.qbi) ded+=row("Less: qualified business income","§199A", -d.qbi);
  ded+=row("Taxable income","§63", d.taxableIncome, "sub");
  $("deductRows").innerHTML=ded;

  /* Tax on income */
  let tax="";
  tax+=row("Tax on ordinary income","§1", d.ordTax);
  if(d.ordTaxable>0){
    tax+=`<div class="bracket-detail">${bracketBreakdown(d.ordTaxable, P.brackets[s])}</div>`;
  }
  if(d.cgTax>0){
    tax+=row("Tax on qualified dividends &amp; LT gains","§1(h)", d.cgTax);
    tax+=`<div class="bracket-detail">${cgBreakdown(d)}</div>`;
  } else if(d.ltcg>0){
    tax+=rowRaw("Qualified dividends &amp; LT gains","§1(h) · 0% band","$0", "muted");
  }
  tax+=row("Income tax before credits","", d.incomeTaxBefore, "sub");
  $("taxRows").innerHTML=tax;

  /* Other federal taxes */
  let oth="";
  if(d.seTax) oth+=row("Self‑employment tax","§1401", d.seTax);
  if(d.addlMed) oth+=row("Additional Medicare Tax (0.9%)","§1401(b)(2)", d.addlMed);
  if(d.niit) oth+=row("Net Investment Income Tax (3.8%)","§1411", d.niit);
  if(!d.seTax && !d.addlMed && !d.niit) oth+=`<div class="row muted"><div class="rlabel">None apply at this income</div><div class="amt">$0</div></div>`;
  $("otherRows").innerHTML=oth;

  /* Credits & total */
  let cr="";
  if(d.kids>0){
    cr+=row(`Child Tax Credit — ${d.kids} child${d.kids>1?"ren":""}`,"§24", -(d.ctcNonref));
    if(d.ctcRefundable>0) cr+=row("Refundable portion (added to payments)","§24(d)", -d.ctcRefundable, "muted");
  }
  cr+=row("Total federal tax (return side)","", d.incomeSideTax, "sub");
  cr+=row("Less: income tax withheld","W‑2 Box 2", -d.withheld, "muted");
  if(d.estPaid) cr+=row("Less: estimated payments","1040‑ES", -d.estPaid, "muted");
  if(d.ctcRefundable>0) cr+=row("Less: refundable credit","§24(d)", -d.ctcRefundable, "muted");
  $("creditRows").innerHTML=cr;

  /* Result */
  const refund = d.settlement>=0;
  const rEl=$("result");
  rEl.classList.toggle("owed", !refund);
  $("resultKicker").textContent = refund ? "Estimated refund" : "Estimated balance due";
  $("resultSub").textContent = refund
    ? "Payments and refundable credits exceed your liability — the IRS refunds the difference."
    : "Your liability exceeds what you've paid in — this amount is due with the return.";
  $("resultBig").textContent = fmt0(Math.abs(d.settlement));

  /* Memo: payroll already paid + burden */
  let memo=`<div class="mrow"><span>Employee payroll tax already withheld from your paychecks <b>(not part of the refund above)</b></span></div>`;
  if(d.wages>0){
    memo+=`<div class="mrow"><span>Social Security (6.2%, §3101)</span><span class="mmono">${fmt0(d.empSS)}</span></div>`;
    memo+=`<div class="mrow"><span>Medicare (1.45%, §3101)</span><span class="mmono">${fmt0(d.empMed)}</span></div>`;
  } else {
    memo+=`<div class="mrow"><span>No W‑2 wages entered</span><span class="mmono">$0</span></div>`;
  }
  memo+=`<div class="mrow" style="border-top:1px solid var(--rule);margin-top:6px;padding-top:8px"><span><b>Total federal footprint</b> — return‑side tax + payroll</span><span class="mmono"><b>${fmt0(d.totalBurden)}</b></span></div>`;
  $("memo").innerHTML=memo;

  /* Effective / marginal stats */
  $("effrate").innerHTML=
    `<div class="stat"><div class="n">${d.marginal.toFixed(0)}%</div><div class="l">Marginal bracket</div></div>`+
    `<div class="stat"><div class="n">${d.effOnAGI.toFixed(1)}%</div><div class="l">Eff. rate on AGI</div></div>`+
    `<div class="stat"><div class="n">${d.effTotal.toFixed(1)}%</div><div class="l">All‑in incl. payroll</div></div>`;
}

function bracketBreakdown(T, br){
  let out=[], prevMax=0;
  for(let i=0;i<br.length;i++){
    const lo=br[i][0], rate=br[i][1];
    const hi=(i+1<br.length)?br[i+1][0]:Infinity;
    if(T>lo){
      const amt=Math.min(T,hi)-lo;
      out.push(`<span>${(rate*100).toFixed(0)}% on ${fmt0(amt)} → ${fmt0(amt*rate)}</span>`);
    }
  }
  return out.join("");
}
function cgBreakdown(d){
  let out=[];
  const gLo=d.ordTaxable, gHi=d.taxableIncome;
  const a0=overlap(gLo,gHi,0,d.cg0);
  const a15=overlap(gLo,gHi,d.cg0,d.cg20);
  const a20=overlap(gLo,gHi,d.cg20,Infinity);
  if(a0>0) out.push(`<span>0% on ${fmt0(a0)} → $0</span>`);
  if(a15>0) out.push(`<span>15% on ${fmt0(a15)} → ${fmt0(a15*.15)}</span>`);
  if(a20>0) out.push(`<span>20% on ${fmt0(a20)} → ${fmt0(a20*.20)}</span>`);
  return out.join("");
}

/* ---------- wiring ---------- */
document.querySelectorAll("#statusSeg button").forEach(b=>{
  b.addEventListener("click",()=>{
    state.status=b.dataset.status;
    document.querySelectorAll("#statusSeg button").forEach(x=>x.setAttribute("aria-pressed", x===b));
    $("age65spouseWrap").style.display = state.status==="mfj" ? "flex":"none";
    render();
  });
});
["wages","withheld","se","ordinv","ltcg","adjust","estpaid","itemized"].forEach(id=>$(id).addEventListener("input",render));
["age65self","age65spouse"].forEach(id=>$(id).addEventListener("change",render));
$("kidPlus").addEventListener("click",()=>{state.kids=Math.min(12,state.kids+1);$("kidsVal").textContent=state.kids;render();});
$("kidMinus").addEventListener("click",()=>{state.kids=Math.max(0,state.kids-1);$("kidsVal").textContent=state.kids;render();});

render();

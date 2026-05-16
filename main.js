const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = [2,3,4,5,6,7,8,9,10,"J","Q","K","A"];
const RANK_VALUE = Object.fromEntries(RANKS.map((r,i)=>[String(r), i+2]));
const HAND_SIZE = 10;
const BATTLES_TO_CLEAR = 4;

const HAND_STRENGTH = {
  "ハイカード":1,"ワンペア":2,"ツーペア":3,"スリーカード":4,"ストレート":5,
  "フラッシュ":6,"フルハウス":7,"フォーカード":8,"ストレートフラッシュ":9,"ロイヤルフラッシュ":12
};

const EFFECT_POOL = [
  {id:"lifesteal", name:"吸収", text:"このカードを役に含むと与ダメの半分回復", apply:(ctx)=>ctx.lifeSteal=true, cost:9},
  {id:"power", name:"役指数+1", text:"このカードを役に含むと強さ指数+1", apply:(ctx)=>ctx.handBonus+=1, cost:8},
  {id:"damage", name:"与ダメ+2", text:"このカードを役に含むと与ダメ+2", apply:(ctx)=>ctx.damageBonus+=2, cost:7},
  {id:"pairBoost", name:"ワンペア特効", text:"ワンペア時に与ダメ+3", apply:(ctx)=>{if(ctx.handName==="ワンペア")ctx.damageBonus+=3;}, cost:6},
  {id:"dualSuit", name:"二重スート", text:"♠と♥を同時に満たす特殊スート", apply:()=>{}, cost:10},
];

const ARTIFACT_POOL = [
  {id:"gold12",name:"金貨の紋章",text:"獲得通貨1.2倍",cost:14, onReward:(g)=>Math.ceil(g*1.2)},
  {id:"pairAura",name:"ペアの護符",text:"ワンペア強さ指数+1",cost:12, onStrength:(n,s)=> n==="ワンペア"?s+1:s},
  {id:"discount",name:"商人の帳簿",text:"ショップ価格10%割引",cost:11, onCost:(c)=>Math.max(1, Math.floor(c*0.9))},
  {id:"lastStand",name:"不屈のサイコロ",text:"HP0時、5-6でHP1復活",cost:15, onFatal:(state)=>Math.random()<0.333?1:0},
];

const state = {
  screen:"title", playerHP:30, enemyHP:20, gold:10, battle:1,
  deck:[], artifacts:[], selected:new Set(), shop:[], usedRevive:false, turnPowerReward:0, titleMessage:"", hand:[],
};

const el = id=>document.getElementById(id);
const screens = ["titleScreen","battleScreen","upgradeScreen"];
const showScreen = id => {
  screens.forEach(s=>el(s).classList.toggle("active", s===id));
  el("startBtn").style.display = id === "titleScreen" ? "inline-block" : "none";
  el("titleMessage").textContent = id === "titleScreen" ? (state.titleMessage || "") : "";
};

function createBaseDeck(){ const d=[]; for(const s of SUITS)for(const r of RANKS)d.push({id:crypto.randomUUID(),suit:s,rank:String(r),effect:null}); return d; }
function drawCards(n){
  const take = Math.min(n, state.deck.length);
  return state.deck.splice(0, take).map(x=>({...x}));
}

function peekRandomCards(n){
  const pool = [...state.deck];
  for(let i=pool.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [pool[i],pool[j]] = [pool[j],pool[i]];
  }
  return pool.slice(0, Math.min(n, pool.length)).map(x=>({...x}));
}


function shuffleDeck(){
  for(let i=state.deck.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [state.deck[i],state.deck[j]] = [state.deck[j],state.deck[i]];
  }
}

function refillHandToMax(){
  const need = Math.max(0, HAND_SIZE - state.hand.length);
  if(need>0) state.hand.push(...drawCards(need));
}

function countBy(arr,key){ return arr.reduce((a,c)=>(a[c[key]]=(a[c[key]]||0)+1,a),{}); }
function isStraight(vals){ const s=[...new Set(vals)].sort((a,b)=>a-b); if(s.length!==5)return false; return s[4]-s[0]===4 || JSON.stringify(s)==='[2,3,4,5,14]'; }
function evalHand(cards){
  const vals=cards.map(c=>RANK_VALUE[c.rank]);
  const suits=cards.map(c=>c.suit);
  const freq=Object.values(countBy(cards,"rank")).sort((a,b)=>b-a);
  const flush = suits.every(s=>s===suits[0]) || cards.some(c=>c.effect?.id==="dualSuit");
  const straight=isStraight(vals);
  let name="ハイカード";
  if(straight && flush && Math.min(...vals)===10) name="ロイヤルフラッシュ";
  else if(straight&&flush) name="ストレートフラッシュ";
  else if(freq[0]===4) name="フォーカード";
  else if(freq[0]===3&&freq[1]===2) name="フルハウス";
  else if(flush) name="フラッシュ";
  else if(straight) name="ストレート";
  else if(freq[0]===3) name="スリーカード";
  else if(freq[0]===2&&freq[1]===2) name="ツーペア";
  else if(freq[0]===2) name="ワンペア";
  let strength = HAND_STRENGTH[name];
  for(const a of state.artifacts) if(a.onStrength) strength = a.onStrength(name,strength);
  return {name, strength};
}

function renderHud(){ el("hud").innerHTML = `Battle ${state.battle}/${BATTLES_TO_CLEAR}<br>敵HP:${state.enemyHP}<br>自HP:${state.playerHP}<br>通貨:${state.gold}`;
  el("artifacts").innerHTML = state.artifacts.map(a=>`<div title="${a.text}">・${a.name}</div>`).join("")||"なし";
}

function renderHandStrengthTable(){
  const rows = Object.entries(HAND_STRENGTH).sort((a,b)=>b[1]-a[1])
    .map(([name,v])=>`<div style="display:flex;justify-content:space-between;border-bottom:1px solid #ffffff33;padding:2px 0;"><span>${name}</span><b>${v}</b></div>`).join("");
  el("handTable").innerHTML = `<h3 style="margin:0 0 6px 0;">役 / 強さ指数</h3>${rows}`;
}

function handTooltip(card){ return `${card.rank}${card.suit}${card.effect?`<br>効果:${card.effect.text}`:""}`; }
function renderHand(){
  const hand = el("hand"); hand.innerHTML="";
  const cards = state.hand;
  const spread = el("handArea").matches(":hover") ? 70 : 42;
  cards.forEach((c,i)=>{
    const d=document.createElement("div"); d.className="card"+(state.selected.has(i)?" selected":"")+(c.effect?" enchanted":"");
    const x = (cards.length-1)/2; const off=(i-x)*spread; const rot=(i-x)*4;
    d.style.left=`calc(50% + ${off}px - 45px)`; d.style.bottom=`${35-Math.abs(i-x)*2}px`; d.style.transform=`rotate(${rot}deg)`;
    d.innerHTML=`<div>${c.rank}${c.suit}</div><div class='small'>${c.effect?c.effect.name:""}</div>`;
    d.onmouseenter=(e)=>{const t=el("tooltip");t.style.display="block";t.innerHTML=handTooltip(c);};
    d.onmousemove=(e)=>{const t=el("tooltip");t.style.left=e.clientX+12+"px";t.style.top=e.clientY+12+"px";};
    d.onmouseleave=()=>el("tooltip").style.display="none";
    d.onclick=()=>{ if(state.selected.has(i))state.selected.delete(i); else if(state.selected.size<5)state.selected.add(i); renderHand(); };
    hand.appendChild(d);
  });
}

function startBattle(){
  state.enemyHP = 16 + state.battle*6;
  state.turnPowerReward = 0;
  if(state.hand.length===0) refillHandToMax();
  state.selected.clear();
  renderHud(); renderHand();
  el("enemyPlayed").innerHTML="";el("playerPlayed").innerHTML="";el("enemyInfo").textContent="";el("playerInfo").textContent="";
  showScreen("battleScreen");
}

function applyCardEffects(cards, handName, base){
  const ctx={handName, handBonus:0, damageBonus:0, lifeSteal:false};
  cards.forEach(c=>c.effect?.apply(ctx));
  return {strength:base+ctx.handBonus, dmg:base+ctx.handBonus+ctx.damageBonus, ls:ctx.lifeSteal};
}
function enemyChoose(hand){
  let best=null;
  for(let t=0;t<30;t++){
    const pick=[...hand].sort(()=>Math.random()-0.5).slice(0,5);
    const ev=evalHand(pick);
    if(!best||ev.strength>best.ev.strength)best={pick,ev};
  }
  return best;
}

function executeTurn(){
  if(state.selected.size!==5) return alert("5枚選択してください");
  const idx=[...state.selected].sort((a,b)=>b-a);
  const pick=idx.map(i=>state.hand[i]);
  const enemyHand=peekRandomCards(HAND_SIZE);
  const enemy=enemyChoose(enemyHand);
  const pEval=evalHand(pick), eEval=enemy.ev;
  const pfx=applyCardEffects(pick,pEval.name,pEval.strength);
  const efx=applyCardEffects(enemy.pick,eEval.name,eEval.strength);
  let pDmg=0,eDmg=0;
  if(pfx.strength>efx.strength) pDmg=pfx.dmg;
  else if(efx.strength>pfx.strength) eDmg=efx.dmg;
  state.enemyHP-=pDmg; state.playerHP-=eDmg;
  if(pfx.ls&&pDmg>0) state.playerHP += Math.floor(pDmg/2);
  state.turnPowerReward += pfx.strength;

  el("playerPlayed").innerHTML=pick.map(c=>`<div>${c.rank}${c.suit}</div>`).join("");
  el("enemyPlayed").innerHTML=enemy.pick.map(c=>`<div>${c.rank}${c.suit}</div>`).join("");
  el("playerInfo").textContent=`${pEval.name}(${pfx.strength}) dmg:${pDmg}`;
  el("enemyInfo").textContent=`${eEval.name}(${efx.strength}) dmg:${eDmg}`;

  if(state.playerHP<=0){
    const art=state.artifacts.find(a=>a.id==="lastStand");
    if(art && !state.usedRevive){ state.usedRevive=true; const hp=art.onFatal(state); if(hp>0) state.playerHP=hp; }
  }
  if(state.enemyHP<=0) return endBattle(true);
  if(state.playerHP<=0) return endBattle(false);

  idx.forEach(i=>state.hand.splice(i,1));
  state.deck.push(...pick.map(c=>({...c})));
  shuffleDeck();
  refillHandToMax();
  state.selected.clear();
  renderHud(); renderHand();
}

function endBattle(win){
  if(!win){
    state.titleMessage = "敗北しました。タイトルへ戻ります。";
    Object.assign(state,{playerHP:30,gold:10,battle:1,artifacts:[],deck:createBaseDeck(),hand:[],usedRevive:false});
    shuffleDeck();
    showScreen("titleScreen");
    return;
  }
  let reward=state.turnPowerReward; state.artifacts.forEach(a=>{if(a.onReward) reward=a.onReward(reward)});
  state.gold += reward;
  if(state.battle>=BATTLES_TO_CLEAR){
    state.titleMessage = `ゲームクリア！ 報酬通貨 +${reward}`;
    showScreen("titleScreen");
    return;
  }
  state.titleMessage = `勝利！ 報酬通貨 +${reward}`;
  buildShop(); showUpgrade();
}

function effectiveCost(cost){ return state.artifacts.reduce((c,a)=>a.onCost?a.onCost(c):c,cost); }
function buildShop(){
  const roll=[];
  for(let i=0;i<3;i++) roll.push({type:"effect", payload:EFFECT_POOL[Math.floor(Math.random()*EFFECT_POOL.length)]});
  for(let i=0;i<2;i++) roll.push({type:"artifact", payload:ARTIFACT_POOL[Math.floor(Math.random()*ARTIFACT_POOL.length)]});
  for(let i=0;i<2;i++) roll.push({type:"remove", payload:{name:"カード削除", cost:6}});
  roll.push({type:"buy", payload:{name:"カード購入", cost:5}});
  state.shop=roll;
}
function showUpgrade(){
  showScreen("upgradeScreen");
  el("upgradeHud").textContent=`通貨:${state.gold} / デッキ枚数:${state.deck.length}`;
  el("shopGrid").innerHTML=state.shop.map((it,idx)=>{
    const base=it.payload.cost||8, cost=effectiveCost(base);
    const desc= it.type==="effect"?`カードに付与: ${it.payload.text}`: it.type==="artifact"?it.payload.text:it.payload.name;
    return `<div class='shop-item'><b>${it.payload.name}</b><p>${desc}</p><p>Cost:${cost}</p><button onclick='window.buyShop(${idx})'>購入</button></div>`;
  }).join("");
}
window.buyShop=(idx)=>{
  const it=state.shop[idx]; if(!it)return;
  const cost=effectiveCost(it.payload.cost||8); if(state.gold<cost)return alert("通貨不足");
  if(it.type==="artifact"){
    if(state.artifacts.some(a=>a.id===it.payload.id))return alert("所持済み");
    state.artifacts.push(it.payload);
  } else if(it.type==="effect"){
    const candidates=state.deck.filter(c=>!c.effect);
    if(!candidates.length)return alert("付与可能カードなし");
    candidates[Math.floor(Math.random()*candidates.length)].effect=it.payload;
  } else if(it.type==="remove"){
    if(state.deck.length<=20)return alert("これ以上削除不可");
    state.deck.splice(Math.floor(Math.random()*state.deck.length),1);
  } else if(it.type==="buy"){
    const base = peekRandomCards(1)[0];
    if(!base) return alert("山札が不足しています");
    state.deck.push({...base,id:crypto.randomUUID(),effect:null});
  }
  state.gold-=cost; state.shop.splice(idx,1); showUpgrade(); renderHud();
};

el("startBtn").onclick=()=>{ state.deck=createBaseDeck(); shuffleDeck(); state.hand=[]; state.playerHP=30; state.gold=10; state.battle=1; state.artifacts=[]; state.usedRevive=false; state.titleMessage=""; startBattle(); };
el("playTurnBtn").onclick=executeTurn;
el("rerollBtn").onclick=()=>{ if(state.gold<5)return; state.gold-=5; buildShop(); showUpgrade(); };
el("nextBattleBtn").onclick=()=>{ state.battle++; startBattle(); };
el("handArea").onmousemove=()=>renderHand();

renderHandStrengthTable();

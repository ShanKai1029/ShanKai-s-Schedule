(()=>{
"use strict";

/* ===== 只需要修改這兩行 ===== */
const SUPABASE_URL = "https://pqspnpulxhsreigxdarh.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_9kFSsQTr0VbC_t_YzsMzUg_DWYWpjoQ";
/* ============================ */

const TABLE = "schedule_events";
const SCHEDULES_TABLE = "schedules";
const LAST_VIEW_PREFIX = "sk_last_schedule_";
const validColors = ["purple","green","pink","yellow","blue","orange","indigo"];
const defaults = [
  {name:"國科會量子",day:1,start_time:"18:00",end_time:"19:00",color:"green"},
  {name:"台達電",day:2,start_time:"10:00",end_time:"11:00",color:"green"},
  {name:"工研院",day:2,start_time:"15:00",end_time:"16:00",color:"purple"},
  {name:"聯發科開會",day:2,start_time:"16:30",end_time:"17:30",color:"yellow"},
  {name:"Group meeting",day:2,start_time:"17:30",end_time:"18:30",color:"pink"},
  {name:"工研院內部會議",day:3,start_time:"11:00",end_time:"12:00",color:"purple"},
  {name:"AI技術分享會",day:4,start_time:"20:00",end_time:"21:00",color:"indigo"},
  {name:"國科會藥物",day:5,start_time:"10:30",end_time:"12:00",color:"orange"},
  {name:"台達電（隔週）",day:5,start_time:"14:00",end_time:"15:00",color:"blue"}
];

const $ = id => document.getElementById(id);
const setupView=$("setupView"),authView=$("authView"),overviewView=$("overviewView"),mainView=$("mainView");
const schedule=$("schedule"), form=$("eventForm"), idEl=$("eventId"), nameEl=$("name"), dayEl=$("day"),
      startEl=$("start"), endEl=$("end"), colorEl=$("color"), saveBtn=$("saveBtn"),
      deleteBtn=$("deleteBtn"), status=$("status"), formTitle=$("formTitle"), scheduleTitle=$("scheduleTitle"),
      authStatus=$("authStatus"), syncDot=$("syncDot"), syncText=$("syncText"), seedBtn=$("seedBtn"),
      scheduleList=$("scheduleList"), addScheduleBtn=$("addScheduleBtn");
const modalOverlay=$("modalOverlay"), modalTitle=$("modalTitle"), modalMessage=$("modalMessage"),
      modalInputField=$("modalInputField"), modalInputLabel=$("modalInputLabel"), modalInput=$("modalInput"),
      modalStatus=$("modalStatus"), modalCancelBtn=$("modalCancelBtn"), modalConfirmBtn=$("modalConfirmBtn");

let sb=null, session=null, events=[], channel=null, loading=false, schedules=[], currentSchedule=null;
let isSharedView=false;
let searchQuery="";

const configured = SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_URL.includes("YOUR_") &&
  SUPABASE_PUBLISHABLE_KEY.startsWith("sb_publishable_") &&
  !SUPABASE_PUBLISHABLE_KEY.includes("YOUR_");

function showOnly(view){
  [setupView,authView,overviewView,mainView].forEach(v=>v.classList.add("hidden"));
  view.classList.remove("hidden");
}
function setAuthMsg(t,e=false){authStatus.textContent=t||"";authStatus.style.color=e?"var(--danger)":""}
function msg(t,e=false){status.textContent=t||"";status.style.color=e?"var(--danger)":""}
function syncState(kind,text){
  syncDot.className="dot"+(kind?" "+kind:"");
  syncText.textContent=text;
}

function saveLastView(scheduleId){
  if(!session)return;
  try{localStorage.setItem(LAST_VIEW_PREFIX+session.user.id,scheduleId||"")}catch{}
}
function getLastView(){
  if(!session)return"";
  try{return localStorage.getItem(LAST_VIEW_PREFIX+session.user.id)||""}catch{return""}
}

let modalHandlers=null;
function closeModal(){
  modalOverlay.classList.add("hidden");
  modalHandlers=null;
  modalInput.value="";
  modalStatus.textContent="";
}
function openModal({title,message,inputLabel,inputValue,confirmLabel,danger,onConfirm}){
  modalTitle.textContent=title||"";
  modalMessage.textContent=message||"";
  modalMessage.classList.toggle("hidden",!message);
  const hasInput=typeof inputLabel==="string";
  modalInputField.classList.toggle("hidden",!hasInput);
  if(hasInput){modalInputLabel.textContent=inputLabel;modalInput.value=inputValue||""}
  modalConfirmBtn.textContent=confirmLabel||"確定";
  modalConfirmBtn.className="btn"+(danger?" danger":" primary");
  modalStatus.textContent="";
  modalOverlay.classList.remove("hidden");
  modalHandlers={onConfirm,hasInput};
  (hasInput?modalInput:modalConfirmBtn).focus();
}
modalCancelBtn.addEventListener("click",closeModal);
modalOverlay.addEventListener("click",e=>{if(e.target===modalOverlay)closeModal()});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!modalOverlay.classList.contains("hidden"))closeModal()});
modalInput.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();modalConfirmBtn.click()}});
modalConfirmBtn.addEventListener("click",async()=>{
  if(!modalHandlers)return;
  const value=modalHandlers.hasInput?modalInput.value.trim():undefined;
  modalConfirmBtn.disabled=true;modalCancelBtn.disabled=true;
  try{
    await modalHandlers.onConfirm(value);
    closeModal();
  }catch(err){
    modalStatus.textContent=(err&&err.message)||String(err);
    modalStatus.style.color="var(--danger)";
  }
  modalConfirmBtn.disabled=false;modalCancelBtn.disabled=false;
});

const TODOS_TABLE="todos";
let todos=[];
let todoTab="active";

function matchesSearch(t){return !searchQuery||t.text.toLowerCase().includes(searchQuery)}
function groupTodos(){
  const taipeiNow=new Date().toLocaleString('sv-SE',{timeZone:'Asia/Taipei'});
  const todayStr=taipeiNow.slice(0,10);
  const tp=taipeiNow.slice(11,16).split(':').map(Number);
  const nowMins=tp[0]*60+tp[1];
  const groups={overdue:[],today:[],later:[]};
  todos.filter(t=>!t.done&&matchesSearch(t)).forEach(t=>{
    if(!t.due_date){groups.later.push(t);return}
    if(t.due_date<todayStr){groups.overdue.push(t);return}
    if(t.due_date===todayStr){
      if(t.due_time){const[h,m]=t.due_time.split(":").map(Number);if(h*60+m<nowMins){groups.overdue.push(t);return}}
      groups.today.push(t);return;
    }
    groups.later.push(t);
  });
  return groups;
}
function makeTodoRow(todo,isOverdue){
  const row=document.createElement("div");
  row.className="todo-item"+(todo.done?" done":"")+(isOverdue?" overdue":"");
  const uid="tc-"+todo.id.replace(/-/g,"").slice(0,8);
  const cb=document.createElement("input");cb.type="checkbox";cb.className="todo-check";cb.id=uid;cb.checked=todo.done;
  cb.addEventListener("change",()=>toggleTodo(todo.id,cb.checked,row));
  const body=document.createElement("div");body.className="todo-item-body";
  const lb=document.createElement("label");lb.htmlFor=uid;lb.className="todo-item-text";lb.textContent=todo.text;
  body.appendChild(lb);
  if(todo.due_date){
    const due=document.createElement("div");due.className="todo-item-due";
    const dueStr=todo.due_date+(todo.due_time?" "+todo.due_time.slice(0,5):"");
    due.textContent=todo.start_date?todo.start_date+" → "+dueStr:dueStr;
    body.appendChild(due);
  }
  const edit=document.createElement("button");edit.type="button";edit.className="todo-edit";edit.textContent="✎";edit.title="編輯";
  edit.addEventListener("click",()=>openTodoModal(todo.id));
  const del=document.createElement("button");del.type="button";del.className="todo-del";del.textContent="×";del.title="刪除";
  del.addEventListener("click",()=>deleteTodo(todo.id));
  row.append(cb,body,edit,del);return row;
}
function renderTodos(){
  const list=$("todoList");list.innerHTML="";
  if(todoTab==="active"){
    const groups=groupTodos();
    const sections=[{key:"overdue",label:"過期",cls:"overdue"},{key:"today",label:"今天",cls:"today"},{key:"later",label:"之後",cls:""}];
    let any=false;
    sections.forEach(({key,label,cls})=>{
      const items=groups[key];if(!items.length)return;any=true;
      const lbl=document.createElement("div");lbl.className="todo-group-label"+(cls?" "+cls:"");lbl.textContent=label;
      list.appendChild(lbl);
      items.forEach(t=>list.appendChild(makeTodoRow(t,key==="overdue")));
    });
    if(!any){const p=document.createElement("p");p.className="todo-empty";p.textContent=searchQuery?"沒有符合的待辦事項":"沒有待辦事項";list.appendChild(p)}
  }else{
    const done=todos.filter(t=>t.done&&matchesSearch(t));
    if(!done.length){const p=document.createElement("p");p.className="todo-empty";p.textContent=searchQuery?"沒有符合的待辦事項":"還沒有已完成的待辦事項";list.appendChild(p);return}
    done.forEach(t=>list.appendChild(makeTodoRow(t,false)));
  }
}
async function loadTodos(){
  if(!session)return;
  const{data,error}=await sb.from(TODOS_TABLE).select("*").eq("user_id",session.user.id).order("due_date",{nullsFirst:false}).order("due_time",{nullsFirst:false}).order("created_at");
  if(!error){todos=data||[];renderTodos()}
}
async function addTodo(text,dueDate,dueTime,startDate){
  if(!session||!text)return;
  const row={text,done:false,user_id:session.user.id};
  if(dueDate)row.due_date=dueDate;
  if(dueTime)row.due_time=dueTime;
  if(startDate)row.start_date=startDate;
  const{error}=await sb.from(TODOS_TABLE).insert(row);
  if(!error)await loadTodos();
}
async function toggleTodo(id,done,row){
  const commit=async()=>{
    todos=todos.map(t=>t.id===id?{...t,done}:t);
    renderTodos();
    await sb.from(TODOS_TABLE).update({done}).eq("id",id);
  };
  if(row){
    row.classList.add("leaving");
    row.addEventListener("animationend",commit,{once:true});
  }else{
    await commit();
  }
}
async function deleteTodo(id){
  todos=todos.filter(t=>t.id!==id);renderTodos();
  await sb.from(TODOS_TABLE).delete().eq("id",id);
}
function openTodoModal(id){
  const t=todos.find(x=>x.id===id);if(!t)return;
  $("tmStatus").textContent="";
  $("tmId").value=t.id;
  $("tmText").value=t.text;
  $("tmStartDate").value=t.start_date||"";
  $("tmDueDate").value=t.due_date||"";
  $("tmDueTime").value=t.due_time?t.due_time.slice(0,5):"";
  $("todoModalOverlay").classList.remove("hidden");
  setTimeout(()=>$("tmText").focus(),50);
}
function closeTodoModal(){$("todoModalOverlay").classList.add("hidden")}
async function saveTodoModal(){
  const id=$("tmId").value;
  const text=$("tmText").value.trim();
  const startDate=$("tmStartDate").value||null;
  const dueDate=$("tmDueDate").value||null;
  const dueTime=$("tmDueTime").value||null;
  const tmSt=$("tmStatus"),tmSaveBtn=$("tmSaveBtn");
  const setErr=t=>{tmSt.textContent=t;tmSt.style.color="var(--danger)"};
  if(!text)return setErr("請輸入待辦事項內容。");
  if(startDate&&dueDate&&startDate>dueDate)return setErr("開始日期不能晚於到期日。");
  tmSaveBtn.disabled=true;
  const{error}=await sb.from(TODOS_TABLE).update({text,start_date:startDate,due_date:dueDate,due_time:dueTime}).eq("id",id);
  tmSaveBtn.disabled=false;
  if(error)return setErr("儲存失敗："+error.message);
  closeTodoModal();await loadTodos();
}
function deleteTodoModal(){
  const id=$("tmId").value;
  const t=todos.find(x=>x.id===id);if(!t)return;
  closeTodoModal();
  openModal({
    title:"刪除待辦事項",message:"確定刪除「"+t.text+"」嗎？",confirmLabel:"刪除",danger:true,
    onConfirm:async()=>{await deleteTodo(id)}
  });
}
$("tmCancelBtn").addEventListener("click",closeTodoModal);
$("todoModalOverlay").addEventListener("click",e=>{if(e.target===$("todoModalOverlay"))closeTodoModal()});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("todoModalOverlay").classList.contains("hidden"))closeTodoModal()});
$("tmSaveBtn").addEventListener("click",saveTodoModal);
$("tmDeleteBtn").addEventListener("click",deleteTodoModal);

const GANTT_DAYS=21;
let ganttStart=null;
function ganttDateStr(d){return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")}
function ganttAddDays(dateStrVal,n){const d=new Date(dateStrVal+"T00:00:00");d.setDate(d.getDate()+n);return ganttDateStr(d)}
function ganttToday(){return new Date().toLocaleString('sv-SE',{timeZone:'Asia/Taipei'}).slice(0,10)}
function ganttDayIndex(dateStrVal){
  const a=new Date(ganttStart+"T00:00:00"),b=new Date(dateStrVal+"T00:00:00");
  return Math.round((b-a)/86400000);
}
function openGantt(){
  if(!ganttStart)ganttStart=ganttAddDays(ganttToday(),-3);
  renderGantt();
  $("ganttOverlay").classList.remove("hidden");
}
function closeGantt(){$("ganttOverlay").classList.add("hidden")}
function shiftGantt(days){ganttStart=ganttAddDays(ganttStart,days);renderGantt()}
function resetGanttToday(){ganttStart=ganttAddDays(ganttToday(),-3);renderGantt()}
function renderGantt(){
  const chart=$("ganttChart");
  chart.innerHTML="";
  chart.style.gridTemplateColumns="160px repeat("+GANTT_DAYS+",minmax(32px,1fr))";
  const today=ganttToday();
  const wdChar=["日","一","二","三","四","五","六"];
  const corner=document.createElement("div");corner.className="gantt-corner";corner.style.gridColumn="1";corner.style.gridRow="1";chart.appendChild(corner);
  for(let i=0;i<GANTT_DAYS;i++){
    const ds=ganttAddDays(ganttStart,i);
    const d=new Date(ds+"T00:00:00");
    const h=document.createElement("div");h.className="gantt-day-header"+(ds===today?" today":"");
    h.style.gridColumn=String(i+2);h.style.gridRow="1";
    const l1=document.createElement("div");l1.textContent=(d.getMonth()+1)+"/"+d.getDate();
    const l2=document.createElement("div");l2.textContent=wdChar[d.getDay()];
    h.append(l1,l2);
    chart.appendChild(h);
  }
  const rows=[];
  if($("ganttShowTodos").checked){
    todos.filter(t=>!t.done&&t.due_date).forEach(t=>{
      const startD=t.start_date||t.due_date,endD=t.due_date;
      const sIdx=ganttDayIndex(startD),eIdx=ganttDayIndex(endD);
      if(eIdx<0||sIdx>GANTT_DAYS-1)return;
      const cs=Math.max(0,sIdx),ce=Math.min(GANTT_DAYS-1,eIdx);
      const statusVar=endD<today?"--danger":endD===today?"--accent":"--muted";
      rows.push({label:t.text,bars:[{
        startIdx:cs,endIdx:ce,
        border:"var("+statusVar+")",fill:"color-mix(in srgb, var("+statusVar+") 22%, var(--card))",
        onClick:()=>{closeGantt();openTodoModal(t.id)}
      }]});
    });
  }
  if($("ganttShowEvents").checked){
    events.forEach(ev=>{
      const bars=[];
      for(let i=0;i<GANTT_DAYS;i++){
        const ds=ganttAddDays(ganttStart,i);
        const dow=new Date(ds+"T00:00:00").getDay();
        if(dow===Number(ev.day)){
          bars.push({startIdx:i,endIdx:i,cls:"c-"+(validColors.includes(ev.color)?ev.color:"purple"),onClick:()=>{closeGantt();openEventInfo(ev.id)}});
        }
      }
      if(bars.length)rows.push({label:ev.name,bars});
    });
  }
  if(!rows.length){
    const p=document.createElement("div");p.className="gantt-empty";p.textContent="沒有可顯示的項目";
    p.style.gridColumn="1 / span "+(GANTT_DAYS+1);p.style.gridRow="2";
    chart.appendChild(p);
  }
  rows.forEach((r,ri)=>{
    const gr=ri+2;
    const lbl=document.createElement("div");lbl.className="gantt-row-label";lbl.textContent=r.label;lbl.title=r.label;lbl.style.gridColumn="1";lbl.style.gridRow=String(gr);
    chart.appendChild(lbl);
    r.bars.forEach(bar=>{
      const el=document.createElement("div");
      el.className="gantt-bar"+(bar.cls?" "+bar.cls:"");
      el.style.gridColumn=(bar.startIdx+2)+" / "+(bar.endIdx+3);
      el.style.gridRow=String(gr);
      if(bar.border){el.style.borderColor=bar.border;el.style.background=bar.fill}
      el.textContent=r.label;el.title=r.label;
      el.addEventListener("click",bar.onClick);
      chart.appendChild(el);
    });
  });
}
$("ganttBtn").addEventListener("click",openGantt);
$("ganttCloseBtn").addEventListener("click",closeGantt);
$("ganttOverlay").addEventListener("click",e=>{if(e.target===$("ganttOverlay"))closeGantt()});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("ganttOverlay").classList.contains("hidden"))closeGantt()});
$("ganttPrevBtn").addEventListener("click",()=>shiftGantt(-7));
$("ganttNextBtn").addEventListener("click",()=>shiftGantt(7));
$("ganttTodayBtn").addEventListener("click",resetGanttToday);
$("ganttShowTodos").addEventListener("change",renderGantt);
$("ganttShowEvents").addEventListener("change",renderGantt);

const colorBorder={purple:"#9d78e8",green:"#6ac29b",pink:"#e987ac",yellow:"#dfb95b",blue:"#77a8e2",orange:"#e9a06b",indigo:"#8993e8"};
const dayNames=["","星期一","星期二","星期三","星期四","星期五"];

function renderNotes(text){
  const esc=text.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  return esc.replace(/(https?:\/\/[^\s]+)/g,u=>{
    const isImg=/\.(jpe?g|png|gif|webp|svg)(\?[^\s]*)?$/i.test(u)||u.includes("/storage/v1/object/public/");
    if(isImg)return`<a href="${u}" target="_blank" rel="noopener noreferrer"><img src="${u}" class="ei-img" loading="lazy"></a>`;
    return`<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`;
  });
}

let eiCurrentId=null;
function openEventInfo(id){
  const ev=events.find(x=>x.id===id);if(!ev)return;
  eiCurrentId=id;
  $("eiStrip").style.background=colorBorder[ev.color]||"#9d78e8";
  $("eiName").textContent=ev.name;
  $("eiMeta").textContent=(dayNames[ev.day]||"")+" · "+normTime(ev.start_time)+"–"+normTime(ev.end_time);
  const notesEl=$("eiNotes");
  if(ev.notes){notesEl.innerHTML=renderNotes(ev.notes);notesEl.classList.remove("hidden")}
  else{notesEl.classList.add("hidden")}
  $("eiEditBtn").classList.toggle("hidden",isSharedView);
  $("eventInfoOverlay").classList.remove("hidden");
}
function closeEventInfo(){$("eventInfoOverlay").classList.add("hidden");eiCurrentId=null}
$("eiCloseBtn").addEventListener("click",closeEventInfo);
$("eiEditBtn").addEventListener("click",()=>{const id=eiCurrentId;closeEventInfo();openEventModal(id)});
$("eventInfoOverlay").addEventListener("click",e=>{if(e.target===$("eventInfoOverlay"))closeEventInfo()});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("eventInfoOverlay").classList.contains("hidden"))closeEventInfo()});

let emSelectedColor="purple";
function setEmColor(c){
  emSelectedColor=validColors.includes(c)?c:"purple";
  document.querySelectorAll("#emColorPicker .color-btn").forEach(btn=>{
    btn.classList.toggle("selected",btn.dataset.color===emSelectedColor);
  });
}
function openEventModal(id){
  $("emStatus").textContent="";
  if(id){
    const ev=events.find(x=>x.id===id);if(!ev)return;
    $("emTitle").textContent="修改事項";
    $("emId").value=ev.id;
    $("emName").value=ev.name;
    $("emDay").value=String(ev.day);
    $("emStart").value=normTime(ev.start_time);
    $("emEnd").value=normTime(ev.end_time);
    $("emNotes").value=ev.notes||"";
    setEmColor(ev.color||"purple");
    $("emDeleteBtn").classList.remove("hidden");
    $("emSaveBtn").textContent="儲存修改";
  }else{
    $("emTitle").textContent="新增事項";
    $("emId").value="";$("emName").value="";$("emDay").value="1";
    $("emStart").value="";$("emEnd").value="";$("emNotes").value="";
    setEmColor("purple");
    $("emDeleteBtn").classList.add("hidden");
    $("emSaveBtn").textContent="新增";
  }
  $("eventModalOverlay").classList.remove("hidden");
  setTimeout(()=>$("emName").focus(),50);
}
function closeEventModal(){$("eventModalOverlay").classList.add("hidden")}
async function saveEventModal(){
  if(!session||!currentSchedule)return;
  const name=$("emName").value.trim(),day=Number($("emDay").value),start=$("emStart").value;
  let end=$("emEnd").value;
  const notes=$("emNotes").value.trim();
  const emSt=$("emStatus"),emSaveBtn=$("emSaveBtn");
  const setErr=t=>{emSt.textContent=t;emSt.style.color="var(--danger)"};
  const s=mins(start);
  if(!name)return setErr("請輸入事項名稱。");
  if(day<1||day>5)return setErr("星期設定不正確。");
  if(!Number.isFinite(s)||s<480||s>1289)return setErr("開始時間需介於 08:00–21:29。");
  if(!end)end=fmt(Math.min(s+60,1290));
  const en=mins(end);
  if(!Number.isFinite(en)||en<=s||en>1290)return setErr("結束時間必須晚於開始時間，且不超過 21:30。");
  emSaveBtn.disabled=true;syncState("busy","儲存中…");
  const payload={name,day,start_time:start,end_time:end,color:emSelectedColor,notes:notes||null,user_id:session.user.id,schedule_id:currentSchedule.id};
  let result;
  const editId=$("emId").value;
  if(editId){
    const{user_id,schedule_id,...up}=payload;
    result=await sb.from(TABLE).update(up).eq("id",editId);
  }else{
    result=await sb.from(TABLE).insert(payload);
  }
  emSaveBtn.disabled=false;
  if(result.error){syncState("err","儲存失敗");setErr("儲存失敗："+result.error.message);return}
  closeEventModal();await loadEvents();
}
function deleteEventModal(){
  const editId=$("emId").value;
  const ev=events.find(x=>x.id===editId);if(!ev)return;
  closeEventModal();
  openModal({
    title:"刪除事項",message:"確定刪除「"+ev.name+"」嗎？",confirmLabel:"刪除",danger:true,
    onConfirm:async()=>{
      syncState("busy","刪除中…");
      const{error}=await sb.from(TABLE).delete().eq("id",ev.id);
      if(error){syncState("err","刪除失敗");throw error}
      await loadEvents();
    }
  });
}
$("emCancelBtn").addEventListener("click",closeEventModal);
$("eventModalOverlay").addEventListener("click",e=>{if(e.target===$("eventModalOverlay"))closeEventModal()});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("eventModalOverlay").classList.contains("hidden"))closeEventModal()});
$("emSaveBtn").addEventListener("click",saveEventModal);
$("emDeleteBtn").addEventListener("click",deleteEventModal);
document.querySelectorAll("#emColorPicker .color-btn").forEach(btn=>{
  btn.addEventListener("click",()=>setEmColor(btn.dataset.color));
});
$("emImgBtn").addEventListener("click",()=>$("emImgFile").click());
$("emImgFile").addEventListener("change",async()=>{
  const file=$("emImgFile").files[0];if(!file||!session)return;
  const ext=file.name.split(".").pop().toLowerCase();
  const path=`${session.user.id}/${Date.now()}.${ext}`;
  $("emImgStatus").textContent="上傳中…";
  const{error}=await sb.storage.from("event-images").upload(path,file,{upsert:true});
  if(error){$("emImgStatus").textContent="上傳失敗";return}
  const{data:{publicUrl}}=sb.storage.from("event-images").getPublicUrl(path);
  const ta=$("emNotes");
  ta.value=(ta.value?ta.value+"\n":"")+publicUrl;
  $("emImgStatus").textContent="已上傳";
  $("emImgFile").value="";
});
function mins(t){
  const p=String(t||"").slice(0,5).split(":").map(Number);
  return p.length===2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) ? p[0]*60+p[1] : NaN;
}
function fmt(m){return String(Math.floor(m/60)).padStart(2,"0")+":"+String(m%60).padStart(2,"0")}
function normTime(t){return String(t||"").slice(0,5)}
function row(t){return mins(t)-480+2}

function base(){
  schedule.innerHTML="";
  const c=document.createElement("div");c.className="corner";c.style.gridColumn="1";c.style.gridRow="1";c.textContent="時間";schedule.appendChild(c);
  ["星期一","星期二","星期三","星期四","星期五"].forEach((x,i)=>{
    const d=document.createElement("div");d.className="day "+["mon","tue","wed","thu","fri"][i];d.style.gridColumn=String(i+2);d.style.gridRow="1";d.textContent=x;schedule.appendChild(d)
  });
  for(let i=0;i<27;i++){
    const startRow=2+i*30;
    const t=document.createElement("div");t.className="time";t.style.gridColumn="1";t.style.gridRow=startRow+" / span 30";t.textContent=fmt(480+i*30);schedule.appendChild(t);
    for(let col=2;col<=6;col++){
      const cell=document.createElement("div");cell.className="cell";cell.style.gridColumn=String(col);cell.style.gridRow=startRow+" / span 30";schedule.appendChild(cell)
    }
  }
}
function computeLanes(evList){
  if(!evList.length)return{};
  const result={};
  const sorted=evList.slice().sort((a,b)=>mins(a.start_time)-mins(b.start_time));
  const laneEnds=[];
  sorted.forEach(ev=>{
    const s=mins(ev.start_time),e=mins(ev.end_time)||Math.min(s+60,1290);
    let lane=-1;
    for(let i=0;i<laneEnds.length;i++){if(laneEnds[i]<=s){lane=i;laneEnds[i]=e;break}}
    if(lane===-1){lane=laneEnds.length;laneEnds.push(e)}
    const total=sorted.filter(o=>{
      const os=mins(o.start_time),oe=mins(o.end_time)||Math.min(os+60,1290);
      return os<e&&oe>s;
    }).length;
    result[ev.id]={lane,total};
  });
  return result;
}
function render(){
  base();
  const byDay={};
  events.forEach(ev=>{if(!byDay[ev.day])byDay[ev.day]=[];byDay[ev.day].push(ev)});
  const laneMap={};
  Object.entries(byDay).forEach(([,evs])=>Object.assign(laneMap,computeLanes(evs)));
  events.slice().sort((a,b)=>a.day-b.day||mins(a.start_time)-mins(b.start_time)).forEach(ev=>{
    const s=mins(ev.start_time), e=mins(ev.end_time);
    if(!Number.isFinite(s)||s<480||s>1289)return;
    const end=Number.isFinite(e)&&e>s?Math.min(e,1290):Math.min(s+60,1290);
    const span=Math.max(1,end-s);
    const b=document.createElement("button");b.type="button";b.className="event c-"+(validColors.includes(ev.color)?ev.color:"purple");
    if(searchQuery&&!((ev.name||"").toLowerCase().includes(searchQuery)||(ev.notes||"").toLowerCase().includes(searchQuery)))b.classList.add("dimmed");
    b.style.gridColumn=String(Number(ev.day)+1);b.style.gridRow=row(ev.start_time)+" / span "+span;
    const {lane=0,total=1}=laneMap[ev.id]||{};
    if(total>1){
      const pct=100/total;
      b.style.width="calc("+pct+"% - 4px)";
      b.style.marginLeft="calc("+lane*pct+"% + 2px)";
      b.style.marginRight="0";
    }
    const tt=document.createElement("div");tt.className="et";tt.textContent=normTime(ev.start_time)+"–"+normTime(ev.end_time||fmt(end));
    const nn=document.createElement("div");nn.className="en";nn.textContent=ev.name;
    b.append(tt,nn);
    if(ev.notes){const nd=document.createElement("span");nd.className="note-dot";nd.title=ev.notes;nd.textContent="●";b.appendChild(nd)}
    b.addEventListener("click",()=>openEventInfo(ev.id));schedule.appendChild(b);
  });
  seedBtn.disabled = events.length > 0;
}

function clearForm(){
  idEl.value="";form.reset();dayEl.value="1";colorEl.value="purple";
  formTitle.textContent="新增事項";saveBtn.textContent="新增";deleteBtn.hidden=true;msg("");
}
function edit(id){openEventModal(id)}

async function loadEvents(){
  if(!session||!currentSchedule||loading)return;
  loading=true;syncState("busy","同步中…");
  const {data,error}=await sb.from(TABLE).select("*").eq("schedule_id",currentSchedule.id).order("day").order("start_time");
  loading=false;
  if(error){syncState("err","同步失敗");msg("讀取雲端資料失敗："+error.message,true);return}
  events=(data||[]).map(x=>({...x,start_time:normTime(x.start_time),end_time:normTime(x.end_time)}));
  render();syncState("ok","已同步");
}

async function subscribeRealtime(){
  if(channel){await sb.removeChannel(channel);channel=null}
  if(!session||!currentSchedule)return;
  channel=sb.channel("schedule-"+currentSchedule.id)
    .on("postgres_changes",{event:"*",schema:"public",table:TABLE,filter:"schedule_id=eq."+currentSchedule.id},()=>loadEvents())
    .subscribe((state)=>{
      if(state==="SUBSCRIBED")syncState("ok","即時同步已連線");
      if(state==="CHANNEL_ERROR")syncState("err","即時同步連線失敗");
    });
}

async function loadSchedules(){
  if(!session)return;
  const {data,error}=await sb.from(SCHEDULES_TABLE).select("*").order("created_at");
  if(error){msg("讀取課表清單失敗："+error.message,true);return}
  schedules=data||[];
}
let openScheduleMenuEl=null;
function closeScheduleMenu(){if(openScheduleMenuEl){openScheduleMenuEl.classList.add("hidden");openScheduleMenuEl=null}}
function toggleScheduleMenu(menu){
  if(openScheduleMenuEl===menu){closeScheduleMenu();return}
  closeScheduleMenu();menu.classList.remove("hidden");openScheduleMenuEl=menu;
}
document.addEventListener("click",()=>closeScheduleMenu());

function renderOverview(){
  scheduleList.innerHTML="";
  closeScheduleMenu();
  if(schedules.length===0){
    const p=document.createElement("p");p.className="empty-hint";p.textContent="還沒有課表，按上面的「+ 新增課表」建立第一份。";
    scheduleList.appendChild(p);return;
  }
  schedules.forEach(s=>{
    const card=document.createElement("div");card.className="card schedule-item";card.tabIndex=0;
    card.addEventListener("click",()=>openSchedule(s.id));
    card.addEventListener("keydown",e=>{if(e.key==="Enter")openSchedule(s.id)});

    const menuBtn=document.createElement("button");menuBtn.type="button";menuBtn.className="schedule-menu-btn";
    menuBtn.textContent="⋮";menuBtn.setAttribute("aria-label","更多操作");
    menuBtn.addEventListener("click",e=>{e.stopPropagation();toggleScheduleMenu(menu)});

    const menu=document.createElement("div");menu.className="schedule-menu hidden";
    const dupB=document.createElement("button");dupB.type="button";dupB.textContent="複製";
    dupB.addEventListener("click",e=>{e.stopPropagation();closeScheduleMenu();duplicateSchedule(s)});
    const shareB=document.createElement("button");shareB.type="button";shareB.textContent="分享連結";
    shareB.addEventListener("click",e=>{e.stopPropagation();closeScheduleMenu();shareSchedule(s)});
    const delB=document.createElement("button");delB.type="button";delB.className="danger";delB.textContent="刪除";
    delB.addEventListener("click",e=>{e.stopPropagation();closeScheduleMenu();deleteSchedule(s)});
    menu.append(dupB,shareB);
    if(s.share_token){
      const unshareB=document.createElement("button");unshareB.type="button";unshareB.className="danger";unshareB.textContent="停用分享";
      unshareB.addEventListener("click",e=>{e.stopPropagation();closeScheduleMenu();unshareSchedule(s)});
      menu.append(unshareB);
    }
    menu.append(delB);

    const h=document.createElement("h3");h.textContent=s.name;
    const meta=document.createElement("div");meta.className="meta";
    meta.textContent="建立於 "+new Date(s.created_at).toLocaleDateString("zh-TW");

    card.append(menuBtn,menu,h,meta);
    scheduleList.appendChild(card);
  });
}
async function shareSchedule(s){
  let token=s.share_token;
  if(!token){
    token=crypto.randomUUID();
    const{error}=await sb.from(SCHEDULES_TABLE).update({share_token:token}).eq("id",s.id);
    if(error)return;
    s.share_token=token;
  }
  const link=location.origin+location.pathname+"?share="+token;
  openModal({title:"分享連結",message:link,confirmLabel:"複製連結",onConfirm:()=>{try{navigator.clipboard.writeText(link)}catch{}}});
}
async function unshareSchedule(s){
  openModal({title:"停用分享連結",message:"停用後，原本的連結就不能再用了。",confirmLabel:"停用分享",danger:true,onConfirm:async()=>{
    const{error}=await sb.from(SCHEDULES_TABLE).update({share_token:null}).eq("id",s.id);
    if(error)return;
    s.share_token=null;
    renderOverview();
  }});
}
async function openSchedule(id){
  const s=schedules.find(x=>x.id===id);if(!s)return;
  currentSchedule=s;
  scheduleTitle.textContent=s.name;
  showOnly(mainView);
  clearForm();
  saveLastView(s.id);
  await loadEvents();
  await subscribeRealtime();
}
async function backToOverview(){
  currentSchedule=null;
  if(channel){await sb.removeChannel(channel);channel=null}
  saveLastView("");
  showOnly(overviewView);
  await loadSchedules();
  renderOverview();
}
function addSchedule(){
  openModal({
    title:"新增課表",inputLabel:"課表名稱",inputValue:"",confirmLabel:"建立",
    onConfirm:async name=>{
      if(!name)throw new Error("請輸入課表名稱。");
      const {data,error}=await sb.from(SCHEDULES_TABLE).insert({name,user_id:session.user.id}).select().single();
      if(error)throw error;
      await loadSchedules();
      await openSchedule(data.id);
    }
  });
}
function deleteSchedule(s){
  openModal({
    title:"刪除課表",message:"確定刪除「"+s.name+"」嗎？此課表內所有事項都會一併刪除，且無法復原。",
    confirmLabel:"刪除",danger:true,
    onConfirm:async()=>{
      const {error}=await sb.from(SCHEDULES_TABLE).delete().eq("id",s.id);
      if(error)throw error;
      if(currentSchedule&&currentSchedule.id===s.id){currentSchedule=null;saveLastView("")}
      await loadSchedules();
      renderOverview();
    }
  });
}
function duplicateSchedule(s){
  openModal({
    title:"複製課表",inputLabel:"新課表名稱",inputValue:s.name+"（複製）",confirmLabel:"複製",
    onConfirm:async name=>{
      if(!name)throw new Error("請輸入課表名稱。");
      const {data:newSchedule,error:createError}=await sb.from(SCHEDULES_TABLE).insert({name,user_id:session.user.id}).select().single();
      if(createError)throw createError;
      const {data:srcEvents,error:readError}=await sb.from(TABLE).select("*").eq("schedule_id",s.id);
      if(readError)throw readError;
      if(srcEvents&&srcEvents.length){
        const rows=srcEvents.map(({id,schedule_id,created_at,updated_at,...x})=>({...x,schedule_id:newSchedule.id,user_id:session.user.id}));
        const {error:insertError}=await sb.from(TABLE).insert(rows);
        if(insertError)throw insertError;
      }
      await loadSchedules();
      renderOverview();
    }
  });
}

async function enterSession(newSession){
  session=newSession;
  if(!session){
    events=[];schedules=[];currentSchedule=null;todos=[];renderTodos();render();showOnly(authView);syncState("","未登入");return;
  }
  await loadSchedules();
  loadTodos();
  const lastId=getLastView();
  if(lastId&&schedules.some(s=>s.id===lastId)){
    await openSchedule(lastId);
  }else{
    showOnly(overviewView);
    renderOverview();
  }
}

form.addEventListener("submit",async e=>{
  e.preventDefault();if(!session||!currentSchedule)return;
  const name=nameEl.value.trim(),day=Number(dayEl.value),start=startEl.value;let end=endEl.value;
  const s=mins(start);
  if(!name)return msg("請輸入事項名稱。",true);
  if(day<1||day>5)return msg("星期設定不正確。",true);
  if(!Number.isFinite(s)||s<600||s>1289)return msg("開始時間需介於 10:00–21:29。",true);
  if(!end)end=fmt(Math.min(s+60,1290));
  const en=mins(end);
  if(!Number.isFinite(en)||en<=s||en>1290)return msg("結束時間必須晚於開始時間，且不超過 21:30。",true);

  saveBtn.disabled=true;syncState("busy","儲存中…");
  const payload={name,day,start_time:start,end_time:end,color:validColors.includes(colorEl.value)?colorEl.value:"purple",user_id:session.user.id,schedule_id:currentSchedule.id};
  let result;
  if(idEl.value){
    const {user_id,schedule_id,...updatePayload}=payload;
    result=await sb.from(TABLE).update(updatePayload).eq("id",idEl.value);
  }else{
    result=await sb.from(TABLE).insert(payload);
  }
  saveBtn.disabled=false;
  if(result.error){syncState("err","儲存失敗");return msg("儲存失敗："+result.error.message,true)}
  clearForm();await loadEvents();
});

deleteBtn.addEventListener("click",()=>{
  if(!session)return;
  const ev=events.find(x=>x.id===idEl.value);if(!ev)return;
  openModal({
    title:"刪除事項",message:"確定刪除「"+ev.name+"」嗎？",confirmLabel:"刪除",danger:true,
    onConfirm:async()=>{
      syncState("busy","刪除中…");
      const {error}=await sb.from(TABLE).delete().eq("id",ev.id);
      if(error){syncState("err","刪除失敗");throw error}
      clearForm();await loadEvents();
    }
  });
});

$("cancelBtn").addEventListener("click",clearForm);
$("printBtn").addEventListener("click",()=>print());

seedBtn.addEventListener("click",()=>{
  if(!session||!currentSchedule||events.length>0)return;
  openModal({
    title:"建立預設課表",message:"建立目前這份預設課表到雲端嗎？",confirmLabel:"建立",
    onConfirm:async()=>{
      syncState("busy","建立預設課表…");
      const rows=defaults.map(x=>({...x,user_id:session.user.id,schedule_id:currentSchedule.id}));
      const {error}=await sb.from(TABLE).insert(rows);
      if(error){syncState("err","建立失敗");throw error}
      await loadEvents();
    }
  });
});

$("exportBtn").addEventListener("click",()=>{
  const data=events.map(({id,user_id,created_at,updated_at,...x})=>({
    ...x,start_time:normTime(x.start_time),end_time:normTime(x.end_time)
  }));
  const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="schedule-data.json";a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
});

const importFile=$("importFile");
$("importBtn").addEventListener("click",()=>importFile.click());
importFile.addEventListener("change",()=>{
  const file=importFile.files&&importFile.files[0];if(!file)return;
  if(!currentSchedule){importFile.value="";return}
  const r=new FileReader();
  r.onload=async()=>{
    try{
      const raw=JSON.parse(String(r.result));
      if(!Array.isArray(raw))throw new Error("JSON 必須是陣列");
      const rows=raw.slice(0,200).map(x=>{
        const name=String(x.name||"").trim().slice(0,60);
        const day=Number(x.day);
        const start=normTime(x.start_time||x.start);
        const end=normTime(x.end_time||x.end);
        if(!name||day<1||day>5||!Number.isFinite(mins(start))||!Number.isFinite(mins(end))||mins(end)<=mins(start))throw new Error("資料中有無效的事項");
        return {user_id:session.user.id,schedule_id:currentSchedule.id,name,day,start_time:start,end_time:end,color:validColors.includes(x.color)?x.color:"purple"};
      });
      syncState("busy","匯入中…");
      const {error}=await sb.from(TABLE).insert(rows);
      if(error)throw error;
      await loadEvents();msg("匯入完成。");
    }catch(err){syncState("err","匯入失敗");msg("匯入失敗："+(err.message||"格式不正確"),true)}
    importFile.value="";
  };
  r.readAsText(file,"utf-8");
});

$("authForm").addEventListener("submit",async e=>{
  e.preventDefault();setAuthMsg("");
  const email=$("email").value.trim(),password=$("password").value;
  $("signInBtn").disabled=true;
  const {error}=await sb.auth.signInWithPassword({email,password});
  $("signInBtn").disabled=false;
  if(error)setAuthMsg("登入失敗："+error.message,true);
});

$("signUpBtn").addEventListener("click",async()=>{
  const email=$("email").value.trim(),password=$("password").value;
  if(!email||password.length<6)return setAuthMsg("請輸入 Email，密碼至少 6 個字元。",true);
  $("signUpBtn").disabled=true;
  const {data,error}=await sb.auth.signUp({email,password});
  $("signUpBtn").disabled=false;
  if(error)return setAuthMsg("註冊失敗："+error.message,true);
  if(data.session)setAuthMsg("註冊完成，已登入。");
  else setAuthMsg("註冊完成。若專案啟用了 Email 驗證，請先到信箱完成驗證後再登入。");
});

$("signOutBtn").addEventListener("click",async()=>{
  await sb.auth.signOut();
});
$("overviewSignOutBtn").addEventListener("click",async()=>{
  await sb.auth.signOut();
});
document.querySelectorAll(".todo-tab").forEach(btn=>{
  btn.addEventListener("click",()=>{
    if(todoTab===btn.dataset.tab)return;
    todoTab=btn.dataset.tab;
    document.querySelectorAll(".todo-tab").forEach(b=>b.classList.toggle("active",b===btn));
    renderTodos();
  });
});
const THEME_KEY="sk_theme";
function applyTheme(t){document.documentElement.setAttribute("data-theme",t);$("themeToggle").textContent=t==="dark"?"☀️":"🌙"}
applyTheme(document.documentElement.getAttribute("data-theme")||"light");
$("themeToggle").addEventListener("click",()=>{
  const next=document.documentElement.getAttribute("data-theme")==="dark"?"light":"dark";
  try{localStorage.setItem(THEME_KEY,next)}catch{}
  applyTheme(next);
});
$("searchInput").addEventListener("input",()=>{
  searchQuery=$("searchInput").value.trim().toLowerCase();
  renderTodos();render();
});
$("todoUseStartDate").addEventListener("change",e=>{
  $("todoStartDate").classList.toggle("hidden",!e.target.checked);
  if(!e.target.checked)$("todoStartDate").value="";
});
$("todoForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const inp=$("todoInput"),text=inp.value.trim();
  const dueDate=$("todoDueDate").value,dueTime=$("todoDueTime").value;
  const startDate=$("todoUseStartDate").checked?$("todoStartDate").value:"";
  if(!text)return;
  inp.value="";$("todoDueDate").value="";$("todoDueTime").value="";
  $("todoStartDate").value="";$("todoStartDate").classList.add("hidden");$("todoUseStartDate").checked=false;
  await addTodo(text,dueDate||null,dueTime||null,startDate||null);
});
$("addEventBtn").addEventListener("click",()=>openEventModal());
$("backToOverviewBtn").addEventListener("click",backToOverview);
addScheduleBtn.addEventListener("click",addSchedule);

async function enterSharedView(token){
  if(!window.supabase||typeof window.supabase.createClient!=="function"){showOnly(setupView);return}
  sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
  const{data,error}=await sb.rpc("get_shared_schedule",{token});
  if(error||!data||!data.length){showOnly(authView);setAuthMsg("找不到這個分享連結，可能已經停用。",true);return}
  isSharedView=true;
  document.body.classList.add("shared-readonly");
  scheduleTitle.textContent=data[0].schedule_name;
  events=data.map(r=>({id:r.event_id,name:r.event_name,day:r.day,start_time:r.start_time,end_time:r.end_time,color:r.color,notes:r.notes}));
  showOnly(mainView);
  render();
}
async function init(){
  const shareToken=new URLSearchParams(location.search).get("share");
  if(shareToken){await enterSharedView(shareToken);return}
  if(!configured){showOnly(setupView);return}
  if(!window.supabase||typeof window.supabase.createClient!=="function"){showOnly(setupView);return}
  sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{
    auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
  });
  sb.auth.onAuthStateChange((_event,newSession)=>{
    setTimeout(()=>enterSession(newSession),0);
  });
  const {data,error}=await sb.auth.getSession();
  if(error){showOnly(authView);setAuthMsg("無法讀取登入狀態："+error.message,true);return}
  await enterSession(data.session);
}
init();
})();

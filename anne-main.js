const C=window.LICENSE_CONFIG||{authStorageKey:'bible_supabase_auth_v1',progressPrefix:'gongboo.license.'},SETS={anne:150},TITLES={anne:'ANNE - English Quiz'};
let product='',questions=[],index=0,baseOffset=0,catalog={},accessByProduct={},mode='study',auto=false,run=0,timerTotal=0,timerLeft=0,timerEnd=0,timerId=null,answers=[],reviewSource=null,catalogLoading=false,annePassageVisible=true,anneQuizVisible=true;

const $=id=>document.getElementById(id),
esc=v=>String(v??'').replace(/[&<>"']/g,c=>({
  '&':'&amp;',
  '<':'&lt;',
  '>':'&gt;',
  '"':'&quot;',
  "'":'&#39;'
}[c]));

const licenseRemoteTutor=window.sendChatbotMessage;

function auth(){
  try{
    const s=JSON.parse(localStorage.getItem(C.authStorageKey)||'null');
    if(!s?.access_token)return null;
    if(s.expires_at&&s.expires_at*1000<Date.now())return null;
    return s;
  }catch{
    return null;
  }
}

function key(){
  return`${C.progressPrefix}${product}.progress`;
}

function save(){
  if(product){
    localStorage.setItem(
      key(),
      JSON.stringify({
        index:baseOffset+index,
        mode,
        first:$('biblePrimaryTextSelector').value,
        second:$('bibleSecondaryTextSelector').value,
        updatedAt:Date.now()
      })
    );
  }
}

function saved(){
  try{
    return JSON.parse(localStorage.getItem(key())||'null');
  }catch{
    return null;
  }
}

function latestProgress(){
  return Object.keys(TITLES)
    .map(code=>{
      try{
        return{
          code,
          data:JSON.parse(
            localStorage.getItem(
              `${C.progressPrefix}${code}.progress`
            )||'null'
          )
        };
      }catch{
        return null;
      }
    })
    .filter(x=>x?.data)
    .sort(
      (a,b)=>
        Number(b.data.updatedAt||0)-
        Number(a.data.updatedAt||0)
    )[0]||null;
}


// ============================================================
// GOOGLE SHEETS
// ============================================================

async function api(p){

  const CONFIG={
    apiKey:'AIzaSyAMyoH8IoCI-WwSFVtZNQ5ltDwrVP8x7kY',
    sheetId:'1XkCdcALHTFmdh9Bhnce5itKgPofMHJcAH0k_eO8ya9c',
    range:'anne_jpn!A1:AA5000'
  };

  try{

    const url=
      `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.sheetId}/values/${CONFIG.range}?key=${CONFIG.apiKey}`;

    const response=await fetch(url);
    const data=await response.json();

    if(!data.values){
      throw new Error('No data from Google Sheets');
    }

    const rows=data.values;
    const allQuestions=[];

    for(let i=1;i<rows.length;i++){

      const row=rows[i];

      if(!row || !row.length)continue;

      const q={
        id:parseInt(row[2]),
        answer:parseInt(row[23]),
        category:row[0],
        // [수정됨] 날짜는 두 번째 열(B열, row[1])에서 가져옵니다.
        date: row[1] || '',

        license_question_translations:[

          {
            language_code:'en',
            passage:row[5]||'',
            question_text:row[8]||'',
            option_1:row[11]||'',
            option_2:row[14]||'',
            option_3:row[17]||'',
            option_4:row[20]||'',
            explanation:row[24]||''
          },

          {
            language_code:'ko',
            passage:row[6]||'',
            question_text:row[9]||'',
            option_1:row[12]||'',
            option_2:row[15]||'',
            option_3:row[18]||'',
            option_4:row[21]||'',
            explanation:row[25]||''
          },

          {
            language_code:'ja',
            passage:row[7]||'',
            question_text:row[10]||'',
            option_1:row[13]||'',
            option_2:row[16]||'',
            option_3:row[19]||'',
            option_4:row[22]||'',
            explanation:row[26]||''
          }

        ]
      };

      allQuestions.push(q);
    }

    // [1] 날짜별로 문제를 묶기
    const dateMap = {};
    allQuestions.forEach(q => {
      const dateKey = q.date || 'No Date';
      if(!dateMap[dateKey]) dateMap[dateKey] = [];
      dateMap[dateKey].push(q);
    });

    const dateSets = Object.keys(dateMap).sort().map(date => ({
      date: date,
      count: dateMap[date].length
    }));

    // [2] 카탈로그 요청 처리 (날짜 목록 반환)
    if(p?.action === 'catalog'){
      return {
        products: [
          {
            product_code: 'anne',
            total_question_count: allQuestions.length,
            dates: dateSets
          }
        ],
        total: allQuestions.length,
        access: 'full'
      };
    }

    // [3] 질문 요청 처리 (기존 로직 유지)
    const offset=
      Math.max(
        0,
        Number(p?.offset)||0
      );

    const limit=
      Math.max(
        1,
        Number(p?.limit)||allQuestions.length
      );

    const sliced=
      allQuestions.slice(
        offset,
        offset+limit
      );

    return{
      data:sliced,
      access:'full',
      total:allQuestions.length
    };

  }catch(error){

    console.error(
      'Google Sheets API Error:',
      error
    );

    throw error;
  }
}





async function load(code,offset=0,limit=150){

  return api({
    action:'questions',
    product:code,
    languages:['en','ko','ja'],
    limit,
    offset
  });
}


// ============================================================
// TRANSLATION HELPERS
// ============================================================

function tr(q){

  return Object.fromEntries(
    (
      q?.license_question_translations||
      []
    ).map(
      x=>[
        x.language_code,
        x
      ]
    )
  );
}


function languageRecord(t,code){

  if(code==='KOR'){
    return t.ko;
  }

  if(code==='JPN'){
    return t.ja;
  }

  return t.en;
}


function lines(t,f){

  const values=[
    $('biblePrimaryTextSelector').value,
    $('bibleSecondaryTextSelector').value
  ];

  const seen=new Set();

  return values

    .filter(
      x=>
        x!=='NONE' &&
        !seen.has(x) &&
        seen.add(x)
    )

    .map(
      x=>({
        code:x,
        text:
          languageRecord(t,x)?.[f]||
          ''
      })
    )

    .filter(
      x=>x.text
    );
}


function htmlLines(a){

  return a.map(x=>{

    let langClass='en';

    if(x.code==='KOR'){
      langClass='ko';
    }

    if(x.code==='JPN'){
      langClass='ja';
    }

    return`
      <div
        class="language-line language-line-${langClass}"
        data-language="${x.code}"
      >
        ${esc(x.text)}
      </div>
    `;

  }).join('');
}


// ============================================================
// PASSAGE / QUIZ TOGGLE
// ============================================================

function applyAnneVisibility(){

  const passage=
    document.querySelector(
      '.anne-passage'
    );

  const quiz=
    document.querySelector(
      '.anne-quiz'
    );

  if(passage){

    passage.style.display=
      annePassageVisible
        ?''
        :'none';
  }

  if(quiz){

    quiz.style.display=
      anneQuizVisible
        ?''
        :'none';
  }
}


function syncAnneToggleButtons(){

  const p=
    $('biblePassageToggle');

  const q=
    $('bibleQuizToggle');

  if(p){

    p.setAttribute(
      'aria-pressed',
      String(
        annePassageVisible
      )
    );

    p.classList.toggle(
      'is-on',
      annePassageVisible
    );
  }


  if(q){

    q.setAttribute(
      'aria-pressed',
      String(
        anneQuizVisible
      )
    );

    q.classList.toggle(
      'is-on',
      anneQuizVisible
    );
  }
}


function installAnneToggles(){

  const p=
    $('biblePassageToggle');

  const q=
    $('bibleQuizToggle');


  if(
    p &&
    !p.dataset.anneBound
  ){

    p.dataset.anneBound='1';

    p.onclick=()=>{

      annePassageVisible=
        !annePassageVisible;

      syncAnneToggleButtons();

      applyAnneVisibility();
    };
  }


  if(
    q &&
    !q.dataset.anneBound
  ){

    q.dataset.anneBound='1';

    q.onclick=()=>{

      anneQuizVisible=
        !anneQuizVisible;

      syncAnneToggleButtons();

      applyAnneVisibility();
    };
  }


  syncAnneToggleButtons();
}


// ============================================================
// QUESTION RENDER
// ============================================================

function render(){

  stopSpeech();

  const q=
    questions[index];

  if(!q)return;

  const t=tr(q);
  const picked=
    answers[index];


  $('questionContainer').innerHTML=`

    <div class="question-card">

      <div class="q-num">
        Question ${index+1} / ${questions.length}
      </div>


      <div class="anne-passage">

        ${htmlLines(
          lines(
            t,
            'passage'
          )
        )}

      </div>


      <div class="anne-quiz">

        <div class="question-text">

          ${htmlLines(
            lines(
              t,
              'question_text'
            )
          )}

        </div>


        <div class="choices">

          ${[1,2,3,4]
            .map(n=>`

              <button
                class="choice${picked===n?' selected':''}"
                data-answer="${n}"
              >

                <span class="choice-letter">
                  ${String.fromCharCode(64+n)}
                </span>

                <span class="choice-language-content">

                  ${htmlLines(
                    lines(
                      t,
                      `option_${n}`
                    )
                  )}

                </span>

              </button>

            `)
            .join('')
          }

        </div>


        <div id="licenseFeedback"></div>

      </div>

    </div>
  `;


  document
    .querySelectorAll('.choice')
    .forEach(
      b=>
        b.onclick=
          ()=>
            answer(
              Number(
                b.dataset.answer
              ),
              b
            )
    );


  if(mode==='learn'){

    document
      .querySelector(
        `[data-answer="${q.answer}"]`
      )
      ?.classList.add(
        'correct'
      );

    feedback(true);
  }


  $('quizProgressBar').style.width=
    `${
      questions.length
        ?(index+1)/
          questions.length*
          100
        :0
    }%`;


  $('prevBtn').disabled=
    index===0;


  $('nextBtn').style.display=
    index===
    questions.length-1
      ?'none'
      :'inline-block';


  $('skipBtn').style.display=
    index===
    questions.length-1
      ?'none'
      :'inline-block';


  $('submitBtn').style.display=
    index===
    questions.length-1
      ?'inline-block'
      :'none';


  applyAnneVisibility();

  save();
}


// ============================================================
// FEEDBACK
// ============================================================

function feedback(ok){

  const t=
    tr(
      questions[index]
    );

  $('licenseFeedback').innerHTML=`

    <div
      class="explanation show ${
        ok
          ?'correct'
          :'incorrect'
      }"
    >

      <strong>
        ${
          ok
            ?'Correct'
            :'Review the rule'
        }
      </strong>

      ${htmlLines(
        lines(
          t,
          'explanation'
        )
      )}

    </div>
  `;
}


function answer(n,b){

  answers[index]=n;

  const q=
    questions[index];

  const ok=
    n===
    Number(q.answer);


  document
    .querySelectorAll(
      '.choice'
    )
    .forEach(
      x=>
        x.classList.remove(
          'selected'
        )
    );


  b.classList.add(
    'selected'
  );


  if(mode==='exam'){

    save();

    return;
  }


  b.classList.add(
    ok
      ?'correct'
      :'incorrect'
  );


  document
    .querySelector(
      `[data-answer="${q.answer}"]`
    )
    ?.classList.add(
      'correct'
    );


  feedback(ok);

  save();
}


// ============================================================
// HOME
// ============================================================

function setupHome(){

  document
    .documentElement
    .dataset
    .studyMode=
      'study';


  $('splashOverlay').style.display=
    'none';


  $('mainContainer').style.display=
    'block';


  $('quizMain').style.display=
    'none';


  $('setupSection').style.display=
    'block';


  document
    .querySelector(
      '.sat-title'
    )
    .innerHTML=
      '<span id="currentSetTitle">License</span>';


  $('bibleExploreToggle').disabled=
    true;

  $('biblePeopleToggle').disabled=
    true;

  $('bibleGuideToggle').disabled=
    true;


  // 홈 화면에서는 OFF
  $('biblePassageToggle').disabled=
    true;

  $('bibleQuizToggle').disabled=
    true;


  const recent=
    latestProgress();

  const card=
    document.querySelector(
      '.card-new'
    );


  card.innerHTML=`

    <div class="card-icon">
      📚
    </div>

    <div class="card-title card-title-new">
      AVAILABLE SUBJECTS
    </div>

    <div class="card-sub">
      Select a license course to start
    </div>

    <div class="bible-book-picker">

      ${
        Object
          .entries(TITLES)
          .map(
            ([k,v])=>`

              <button
                class="bible-book-button"
                data-product="${k}"
                style="font-size: 20px; font-weight: bold; padding: 15px;"
              >
                ${v}

                <small style="float:right; font-size: 14px;">
                  ${SETS[k]} per set
                </small>

              </button>

            `
          )
          .join('')
      }

      <div
        id="licenseSetArea"
        hidden
      ></div>

    </div>

    <button
      id="licenseResumeButton"
      class="resume-badge"
      ${recent?'':'disabled'}
    >
      RESUME
    </button>
  `;


  document
    .querySelectorAll(
      '[data-product]'
    )
    .forEach(
      b=>
        b.onclick=
          ()=>
            choose(
              b.dataset.product
            )
    );


  $('licenseResumeButton').onclick=
    recent
      ?()=>resumeLatest(recent)
      :null;


  const resume=
    document.querySelector(
      '.card-resume'
    );

  resume.hidden=true;
  resume.style.display='none';


  installAuth();
  installSpeech();
  installAnneToggles();
  installLanguages();
  installModes();
  installTimer();
  installTutor();
  installResults();
}


// ============================================================
// CHOOSE
// ============================================================

async function choose(code){

  product=code;

  const selected=
    document.querySelector(
      `[data-product="${code}"]`
    );

  const area=
    $('licenseSetArea');


  selected.after(area);


  document
    .querySelectorAll(
      '[data-product]'
    )
    .forEach(
      b=>
        b.classList.toggle(
          'is-selected',
          b===selected
        )
    );


  area.hidden=false;

  area.innerHTML=
    '<div class="loading">Loading questions...</div>';


  try{

    // [수정됨] 카탈로그 요청을 보내서 날짜 목록만 받아옴
    const d=
      await api({
        action: 'catalog',
        product: code
      });

    // [수정됨] api()에서 넘어온 total과 access 사용
    const total=
      Number(d.total)||0;

    // [수정됨] 날짜 배열 추출
    const dates = (d.products && d.products[0] && d.products[0].dates) ? d.products[0].dates : [];
    
    // 나중에 startFixedSet에서 쓰기 위해 전역 변수에 저장
    window.__currentDates = dates; 


    const access=
      d.access==='full'
        ?'Full course'
        :auth()
          ?'Signed in · Sample access · Questions 1-20'
          :`Free sample · Questions 1-20 · <button id="licenseInlineLogin" type="button">LOGIN</button>`;


    area.innerHTML=`

      <div class="card-sub">
        ${access}
      </div>

      <div class="input-wrapper">

        <select id="licenseSetSelector">

          ${
            dates.length > 0 
            ? dates.map((dateObj, i) => `
                <option value="${i}">
                  ${dateObj.date} (${dateObj.count}문제)
                </option>
              `).join('')
            : '<option value="0">No dates found</option>'
          }

        </select>

      </div>


      <div class="input-wrapper">

        <input
          id="licenseStartNumber"
          type="number"
          min="1"
          max="${total}"
          placeholder="1-${total}"
        >

      </div>


      <button
        class="btn-start"
        id="licenseStart"
      >
        ▶ START
      </button>
    `;


    $('licenseStart').onclick=
      startFixedSet;


    $('licenseSetSelector').onchange=
      startFixedSet;


    if(
      $('licenseInlineLogin')
    ){

      $('licenseInlineLogin').onclick=
        ()=>
          location.href=
            './login.html?return=license';
    }

  }catch(e){

    area.innerHTML=`
      <div
        class="error-msg"
        style="display:block"
      >
        ${esc(e.message)}
      </div>
    `;
  }
}


async function resumeLatest(recent){

  await choose(
    recent.code
  );

  const start=
    Number(
      recent.data.index
    )||0;

  const input=
    $('licenseStartNumber');

  if(input){
    input.value=
      start+1;
  }

  await startFixedSet();
}


// ============================================================
// START
// ============================================================

function start(){

  startFixedSet();
}


async function startFixedSet(){

  // 1. 선택된 날짜 인덱스 가져오기
  const setIndex = Number($('licenseSetSelector').value);
  
  // 2. choose()에서 저장해둔 날짜 배열 불러오기
  const dates = window.__currentDates || []; 
  
  let offset = 0;
  let size = 150; // 기본값

  // 3. 선택된 날짜의 시작 오프셋 계산
  if(dates.length > 0 && dates[setIndex]) {
    for(let i = 0; i < setIndex; i++) {
      offset += dates[i].count;
    }
    size = dates[setIndex].count; // 해당 날짜의 문제 수만큼만 가져오기
  }

  $('licenseStart').disabled = true;
  $('licenseStart').textContent = 'Loading...';

  try{

    const d =
      await load(
        product,
        offset,
        size
      );

    questions=
      d.data||[];

    baseOffset=
      offset;

    answers=
      new Array(
        questions.length
      ).fill(null);

    index=0;


    if(!questions.length){

      throw Error(
        'No questions in this date.'
      );
    }

    enterQuiz(index);

  }catch(e){

    $('licenseStart').disabled=
      false;


    $('licenseStart').textContent=
      '▶ START';


    alert(
      e.message
    );
  }
}


// ============================================================
// ENTER QUIZ
// ============================================================

function enterQuiz(at){

  index=at;


  $('setupSection').style.display=
    'none';


  $('quizMain').style.display=
    'block';


  $('quizContent').style.display=
    'block';


  document
    .querySelector(
      '.progress-area'
    )
    .style.display=
      'block';


  $('satTutorPanel')
    .classList
    .add(
      'is-license-active'
    );


  document
    .querySelector(
      '.sat-title'
    )
    .textContent=
      TITLES[product];


  // START 후 PSG / QZ 활성
  $('biblePassageToggle').disabled=
    false;


  $('bibleQuizToggle').disabled=
    false;


  annePassageVisible=true;
  anneQuizVisible=true;


  syncAnneToggleButtons();


  setPlaybackEnabled(true);


  render();
}


// ============================================================
// NAVIGATION
// ============================================================

function go(d){

  index=
    Math.max(
      0,
      Math.min(
        questions.length-1,
        index+d
      )
    );


  render();


  if(auto && !micMode){

  setTimeout(
    ()=>speak(false),
    250
  );
}
}


// ============================================================
// LANGUAGE SELECTORS
// ============================================================

function installLanguages(){

  for(
    const [id,first]
    of[
      [
        'biblePrimaryTextSelector',
        'ENG'
      ],
      [
        'bibleSecondaryTextSelector',
        'KOR'
      ]
    ]
  ){

    const s=$(id);


    s.innerHTML=`

      <option value="ENG">
        ENG
      </option>

      <option value="KOR">
        KOR
      </option>

      <option value="JPN">
        JPN
      </option>

      <option value="NONE">
        NONE
      </option>
    `;


    s.value=first;


    s.onchange=()=>{

      const other=$(
        id===
        'biblePrimaryTextSelector'
          ?'bibleSecondaryTextSelector'
          :'biblePrimaryTextSelector'
      );


      if(
        s.value===
        other.value
      ){

        other.value=
          'NONE';
      }


      if(
        questions.length
      ){

        render();
      }
    };
  }
}


// ============================================================
// MODES
// ============================================================

function installModes(){

  const apply=next=>{

    mode=next;


    document
      .documentElement
      .dataset
      .studyMode=
        mode;


    document
      .querySelectorAll(
        '[data-ui-mode]'
      )
      .forEach(x=>{

        const selected=
          x.dataset.uiMode===
          mode;


        x.classList.toggle(
          'active',
          selected
        );


        x.setAttribute(
          'aria-pressed',
          String(selected)
        );
      });


    $('timerToggle').hidden=
      mode!=='exam';


    if(
      mode!=='exam'
    ){

      $('timerPanel').hidden=
        true;
    }


    if(
      questions.length
    ){

      render();
    }
  };


  document
    .querySelectorAll(
      '[data-ui-mode]'
    )
    .forEach(
      b=>
        b.onclick=
          ()=>
            apply(
              b.dataset.uiMode
            )
    );


  apply(
    saved()?.mode||
    'study'
  );
}


// ============================================================
// AUTH
// ============================================================

function installAuth(){

  const button=
    $('bibleLogoutToggle');

  const loggedIn=
    !!auth();


  button.disabled=false;


  button.title=
    loggedIn
      ?'Log out'
      :'Log in';


  button.setAttribute(
    'aria-label',
    button.title
  );


  button.classList.toggle(
    'license-login',
    !loggedIn
  );


  button.innerHTML=
    loggedIn
      ?'<span class="bible-logout-icon" aria-hidden="true"></span>'
      :'LOGIN';


  button.onclick=()=>{

    if(!loggedIn){

      location.href=
        './login.html?return=license';

      return;
    }


    if(
      !confirm(
        'Log out of GongBoo on this device?'
      )
    ){
      return;
    }


    localStorage.removeItem(
      C.authStorageKey
    );


    localStorage.removeItem(
      'quiz_current_user_v1'
    );


    location.reload();
  };


  initHeaderTooltips();

  initTapFeedback();
}


// ============================================================
// HEADER TAP / TOOLTIP
// ============================================================

function initTapFeedback(){

  const header=
    document.querySelector(
      '.quiz-header'
    );


  if(
    !header ||
    header.dataset.tapFeedbackBound
  ){
    return;
  }


  header.dataset.tapFeedbackBound=
    '1';


  header.addEventListener(
    'click',
    event=>{

      const button=
        event.target.closest(
          '.quiz-tool-toggle,.mode-btn,.bible-passage-toggle,.bible-quiz-toggle,.bible-speech-button'
        );


      if(
        !button ||
        button.disabled
      ){
        return;
      }


      button.classList.remove(
        'bible-tap-feedback'
      );


      void button.offsetWidth;


      button.classList.add(
        'bible-tap-feedback'
      );


      setTimeout(
        ()=>
          button.classList.remove(
            'bible-tap-feedback'
          ),
        360
      );
    }
  );
}


function initHeaderTooltips(){

  const header=
    document.querySelector(
      '.quiz-header'
    );


  if(
    !header ||
    header.dataset.tooltipBound
  ){
    return;
  }


  header.dataset.tooltipBound=
    '1';


  const tip=
    document.createElement(
      'div'
    );


  tip.className=
    'bible-header-tooltip';


  tip.setAttribute(
    'role',
    'tooltip'
  );


  document.body.appendChild(
    tip
  );


  let active=null;


  const text=c=>{

    const title=
      c.getAttribute(
        'title'
      )||'';


    if(title){

      c.dataset.headerTooltipTitle=
        title;


      c.removeAttribute(
        'title'
      );
    }


    return(
      c.getAttribute(
        'data-tooltip'
      )||
      c.dataset.headerTooltipTitle||
      c.getAttribute(
        'aria-label'
      )||
      String(
        c.textContent||
        ''
      ).trim()
    );
  };


  function show(c){

    const value=
      text(c);


    if(!value)return;


    active=c;


    tip.textContent=
      value;


    tip.classList.add(
      'is-visible'
    );


    const r=
      c.getBoundingClientRect();


    const t=
      tip.getBoundingClientRect();


    tip.style.left=
      Math.round(
        Math.max(
          6,
          Math.min(
            innerWidth-
            t.width-
            6,
            r.left+
            (
              r.width-
              t.width
            )/2
          )
        )
      )+'px';


    tip.style.top=
      Math.round(
        r.bottom+6
      )+'px';
  }


  function hide(){

    active=null;

    tip.classList.remove(
      'is-visible'
    );
  }


  header.addEventListener(
    'pointerover',
    e=>{

      const c=
        e.target.closest(
          'button,select'
        );

      if(c)show(c);
    }
  );


  header.addEventListener(
    'pointerout',
    e=>{

      if(
        active &&
        !active.contains(
          e.relatedTarget
        )
      ){

        hide();
      }
    }
  );


  header.addEventListener(
    'focusin',
    e=>{

      const c=
        e.target.closest(
          'button,select'
        );

      if(c)show(c);
    }
  );


  header.addEventListener(
    'focusout',
    hide
  );
}


// ============================================================
// SPEECH CONTROLS
// ============================================================

function setPlaybackEnabled(enabled){

  [
    'licensePlay',
    'licenseReplay',
    'licenseStop',
    'licenseSpeed',
    'licenseAuto',
    'anneMicButton'
  ].forEach(id=>{

    if($(id)){

      $(id).disabled=
        !enabled;
    }
  });
}


function installSpeech(){

  const host=
    $('bibleHeaderActionRow');


  host.innerHTML=`

    <div class="bible-speech-controls">

      <button
        title="Play current question"
        aria-label="Play current question"
        aria-pressed="false"
        class="bible-speech-button bible-speech-play"
        id="licensePlay"
      >
        ▶
      </button>


      <button
        title="Replay current question"
        aria-label="Replay current question"
        aria-pressed="false"
        class="bible-speech-button bible-speech-replay"
        id="licenseReplay"
      >
        ↻
      </button>


      <button
        title="Stop reading"
        aria-label="Stop reading"
        aria-pressed="false"
        class="bible-speech-button bible-speech-stop"
        id="licenseStop"
      >
        <span class="bible-stop-icon"></span>
      </button>


      <select
        title="Reading speed"
        aria-label="Reading speed"
        class="bible-speech-speed"
        id="licenseSpeed"
      >

        <option value="0.25">
          0.25×
        </option>

        <option value="0.5">
          0.5×
        </option>

        <option value="0.75">
          0.75×
        </option>

        <option
          value="1"
          selected
        >
          1.0×
        </option>

        <option value="1.25">
          1.25×
        </option>

        <option value="1.5">
          1.5×
        </option>

      </select>


      <button
        title="Automatically read the next question"
        aria-label="Auto next"
        class="bible-speech-button bible-speech-auto-next"
        id="licenseAuto"
        aria-pressed="false"
      >
        AUTO
      </button>


      <button
        title="Read aloud"
        aria-label="Read aloud"
        class="bible-speech-button"
        id="anneMicButton"
      >
        🎤
      </button>

    </div>
  `;


  const state=
    active=>{

      [
        'licensePlay',
        'licenseReplay',
        'licenseStop'
      ].forEach(id=>{

        const b=$(id);

        const on=
          id===active;


        b.classList.toggle(
          'active',
          on
        );


        b.setAttribute(
          'aria-pressed',
          String(on)
        );
      });
    };


  $('licensePlay').onclick=()=>{

    state(
      'licensePlay'
    );

    speak(false);
  };


  $('licenseReplay').onclick=()=>{

    state(
      'licenseReplay'
    );

    speak(true);
  };


  $('licenseStop').onclick=()=>{

    stopSpeech();

    state(
      'licenseStop'
    );

    setTimeout(
      ()=>state(''),
      450
    );
  };


  $('licenseAuto').onclick=()=>{

    auto=
      !auto;


    $('licenseAuto').textContent=
      auto
        ?'AUTO ON'
        :'AUTO';


    $('licenseAuto').setAttribute(
      'aria-pressed',
      String(auto)
    );
  };


$('anneMicButton').onclick=()=>{

  micMode=!micMode;

  $('anneMicButton').classList.toggle(
    'active',
    micMode
  );

  $('anneMicButton').setAttribute(
    'aria-pressed',
    String(micMode)
  );

  // [추가됨] 마이크 켜고 끌 때 효과음
  if(micMode){
    playMicOnSound();
  }else{
    playMicOffSound();
  }

  if(micMode){

    startEnglishRecognition();

  }else{

    try{
      recognition?.stop();
    }catch(e){}
  }
};

  window.__licenseSpeechState=
    state;


  // [추가됨] 마이크 정확도(퍼센트)를 조절할 수 있는 슬라이더 추가
  const thresholdInput = document.createElement('input');
  thresholdInput.type = 'range';
  thresholdInput.min = '0';
  thresholdInput.max = '100';
  thresholdInput.step = '5';
  thresholdInput.value = '50';
  thresholdInput.id = 'licenseMicThreshold';
  thresholdInput.title = '마이크 정확도 기준 (%)';
  thresholdInput.style.width = '80px';
  thresholdInput.style.marginLeft = '6px';
  thresholdInput.style.accentColor = '#4CAF50';

  // 슬라이더 옆에 % 표시
  const thresholdLabel = document.createElement('span');
  thresholdLabel.id = 'licenseMicThresholdLabel';
  thresholdLabel.textContent = '50%';
  thresholdLabel.style.fontSize = '12px';
  thresholdLabel.style.marginLeft = '4px';
  thresholdLabel.style.color = '#ccc';

  thresholdInput.oninput = () => {
    thresholdLabel.textContent = thresholdInput.value + '%';
    // 전역 변수로 저장 (compareAndHighlightCurrentSentence에서 사용)
    window.__micThreshold = Number(thresholdInput.value);
  };

  // 기본값 50% 설정
  window.__micThreshold = 50;

  // 마이크 버튼 옆에 배치
  $('anneMicButton').after(thresholdInput);
  thresholdInput.after(thresholdLabel);


  setPlaybackEnabled(false);
}

// ============================================================
// TTS
// ============================================================

function nativeSpeech(){

  if(
    window.GongBooSpeech?.speak
  ){

    window.__gongbooSpeechCallbacks=
      window.__gongbooSpeechCallbacks||
      {};


    window.__gongbooNativeSpeechDone=
      window.__gongbooNativeSpeechDone||
      function(id,ok){

        const cb=
          window.__gongbooSpeechCallbacks[
            id
          ];


        if(!cb)return;


        delete window.__gongbooSpeechCallbacks[
          id
        ];


        ok
          ?cb.resolve()
          :cb.reject(
              new Error(
                'Android text-to-speech failed.'
              )
            );
      };


    return{

      speak:o=>
        new Promise(
          (resolve,reject)=>{

            const id=
              `license_${Date.now()}_${Math.random().toString(36).slice(2)}`;


            window.__gongbooSpeechCallbacks[
              id
            ]={
              resolve,
              reject
            };


            window.GongBooSpeech.speak(
              String(
                o.text||
                ''
              ),
              String(
                o.lang||
                'en-US'
              ),
              Number(
                o.rate||
                1
              ),
              id
            );
          }
        ),


      stop:()=>{

        window.GongBooSpeech.stop();


        Object
          .keys(
            window.__gongbooSpeechCallbacks
          )
          .forEach(id=>{

            window.__gongbooSpeechCallbacks[
              id
            ].resolve();


            delete window.__gongbooSpeechCallbacks[
              id
            ];
          });


        return Promise.resolve();
      }
    };
  }


  const c=
    window.Capacitor;


  if(!c)return null;


  const isNative=
    typeof c.isNativePlatform==='function'
      ?c.isNativePlatform()
      :typeof c.getPlatform==='function' &&
       c.getPlatform()!=='web';


  if(!isNative)return null;


  if(
    c.Plugins?.TextToSpeech
  ){
    return c.Plugins.TextToSpeech;
  }


  return typeof c.registerPlugin==='function'
    ?c.registerPlugin(
        'TextToSpeech'
      )
    :null;
}


async function stopSpeech(){

  run++;


  if(
    window.__licenseSpeechState
  ){

    window.__licenseSpeechState(
      ''
    );
  }


  const native=
    nativeSpeech();


  if(native?.stop){

    try{

      await native.stop();

    }catch{}
  }


  if(
    'speechSynthesis'
    in window
  ){

    speechSynthesis.cancel();
  }
}


function japaneseSpeechText(text){

  return String(text||'').replace(
    /[\u3400-\u4DBF\u4E00-\u9FFF々〆ヵヶ]+[（(]([ぁ-ゖァ-ヺー]+)[）)]/g,
    '$1'
  );
}

async function speak(replay){

  if(
    !questions.length
  ){
    return;
  }


  const native=
    nativeSpeech();


  const browser=
    'speechSynthesis' in window &&
    typeof SpeechSynthesisUtterance!==
    'undefined';


  if(
    !native &&
    !browser
  ){
    return;
  }


  await stopSpeech();


  if(
    window.__licenseSpeechState
  ){

    window.__licenseSpeechState(
      replay
        ?'licenseReplay'
        :'licensePlay'
    );
  }


  const id=run;

  const t=
    tr(
      questions[index]
    );

  const parts=[];


  // [수정됨] 항상 Passage(원문)를 먼저 읽고, 그다음 질문과 선택지를 읽습니다.
  const fields =
  !anneQuizVisible
    ? ['passage']
    : mode==='learn'
      ? ['passage', 'question_text', `option_${Number(questions[index].answer)}`]
      : ['passage', 'question_text', 'option_1', 'option_2', 'option_3', 'option_4'];


  for(
    const f of fields
  ){

    parts.push(
      ...lines(
        t,
        f
      )
    );
  }


  function next(i){

    if(id!==run)return;


    if(
      i>=parts.length
    ){

      if(
        window.__licenseSpeechState
      ){

        window.__licenseSpeechState(
          ''
        );
      }


      if(
        auto &&
        !replay &&
        index<
        questions.length-1
      ){

        go(1);
      }

      return;
    }


    const x=
      parts[i];


    let lang='en-US';


    if(
      x.code==='KOR'
    ){

      lang='ko-KR';
    }


    if(
      x.code==='JPN'
    ){

      lang='ja-JP';
    }


    const rate=
      Number(
        $('licenseSpeed').value
      );

      const speechText=
  x.code==='JPN'
    ?japaneseSpeechText(x.text)
    :x.text;
      

    function browserSpeak(){

      if(!browser)return;


      const u=
        new SpeechSynthesisUtterance(
          speechText
        );


      u.lang=
        lang;


      u.rate=
        rate;


      u.onend=
        ()=>
          next(
            i+1
          );


      speechSynthesis.speak(
        u
      );
    }


    if(
      native?.speak
    ){

      Promise.resolve(

        native.speak({
           text:speechText,
          lang,
          rate,
          pitch:1,
          volume:1,
          category:'ambient'
        })

      )
      .then(
        ()=>
          next(
            i+1
          )
      )
      .catch(
        browserSpeak
      );

    }else{

      browserSpeak();
    }
  }


  next(0);
}



// ============================================================
// TIMER
// ============================================================

function installTimer(){

  $('timerToggle').hidden=
    true;


  $('timerToggle').onclick=
    ()=>
      $('timerPanel').hidden=
        !$('timerPanel').hidden;


  $('timerSetBtn').onclick=()=>{

    timerTotal=
      (
        Number(
          $('timerHours').value
        )||0
      )*3600
      +
      (
        Number(
          $('timerMinutes').value
        )||0
      )*60
      +
      (
        Number(
          $('timerSecondsInput').value
        )||0
      );


    timerLeft=
      timerTotal;


    drawTimer();
  };


  $('timerPauseBtn').onclick=()=>{

    if(timerId){

      clearInterval(
        timerId
      );

      timerId=null;

      drawTimer();

      return;
    }


    if(!timerLeft)return;


    timerEnd=
      Date.now()+
      timerLeft*
      1000;


    timerId=
      setInterval(
        drawTimer,
        250
      );


    drawTimer();
  };


  $('timerResetBtn').onclick=()=>{

    if(timerId){

      clearInterval(
        timerId
      );
    }


    timerId=null;

    timerLeft=
      timerTotal;


    drawTimer();
  };


  document
    .querySelectorAll(
      '[data-close-tool]'
    )
    .forEach(
      b=>
        b.onclick=
          ()=>
            b.closest(
              '.quiz-tool-panel'
            ).hidden=
              true
    );
}


function drawTimer(){

  if(timerId){

    timerLeft=
      Math.max(
        0,
        Math.ceil(
          (
            timerEnd-
            Date.now()
          )/1000
        )
      );
  }


  $('timerDisplay').textContent=
    [
      Math.floor(
        timerLeft/3600
      ),
      Math.floor(
        timerLeft%3600/60
      ),
      timerLeft%60
    ]
    .map(
      x=>
        String(x)
          .padStart(
            2,
            '0'
          )
    )
    .join(':');


  $('timerPauseBtn').textContent=
    timerId
      ?'⏸ Pause'
      :'▶ Start';


  if(
    timerId &&
    !timerLeft
  ){

    clearInterval(
      timerId
    );

    timerId=null;
  }
}


// ============================================================
// RESULTS
// ============================================================

function wrongIndices(){

  const out=[];

  for(
    let i=0;
    i<questions.length;
    i++
  ){

    if(
      answers[i]==null ||
      answers[i]===-1 ||
      Number(answers[i])!==
      Number(
        questions[i].answer
      )
    ){

      out.push(i);
    }
  }

  return out;
}


function showResults(){

  const correct=
    questions.reduce(
      (n,q,i)=>
        n+
        (
          Number(answers[i])===
          Number(q.answer)
            ?1
            :0
        ),
      0
    );


  const answered=
    answers.filter(
      a=>
        a!=null &&
        a!==-1
    ).length;


  $('correctCount').textContent=
    `${correct} / ${answered}`;


  $('accuracyRate').textContent=
    `${
      answered
        ?Math.round(
            correct/
            answered*
            100
          )
        :0
    }%`;


  $('resultGrid').innerHTML=
    questions
      .map(
        (q,i)=>{

          const a=
            answers[i];

          const cls=
            Number(a)===
            Number(q.answer)
              ?'correct'
              :a===-1
                ?'skipped'
                :a==null
                  ?'unanswered'
                  :'incorrect';

          return`
            <div
              class="result-item ${cls}"
              data-qidx="${i}"
            >
              ${i+1}
            </div>
          `;
        }
      )
      .join('');


  $('resultGrid')
    .querySelectorAll(
      '[data-qidx]'
    )
    .forEach(el=>{

      el.onclick=()=>{

        index=
          Number(
            el.dataset.qidx
          );


        $('resultModal').style.display=
          'none';


        render();


        scrollTo({
          top:0,
          behavior:'smooth'
        });
      };
    });


  $('resultModal').style.display=
    'flex';
}


function showWrongAnswers(){

  const ids=
    wrongIndices();


  if(!ids.length){

    alert(
      'All answers are correct.'
    );

    return;
  }


  $('wrongList').innerHTML=
    ids.map(i=>{

      const q=
        questions[i];

      const t=
        tr(q);

      const a=
        answers[i];


      return`

        <div class="wrong-item">

          <strong>
            Question ${i+1}
          </strong>

          <div>
            ${htmlLines(
              lines(
                t,
                'question_text'
              )
            )}
          </div>

          <p>
            Your answer:
            ${
              a==null ||
              a===-1
                ?'—'
                :String.fromCharCode(
                    64+
                    Number(a)
                  )
            }
            <br>

            Correct answer:
            ${String.fromCharCode(
              64+
              Number(q.answer)
            )}
          </p>

          <div>
            ${htmlLines(
              lines(
                t,
                'explanation'
              )
            )}
          </div>

        </div>
      `;

    }).join('');


  $('wrongModal').style.display=
    'flex';
}


function retryWrong(){

  const ids=
    wrongIndices();


  if(!ids.length){

    alert(
      'All answers are correct.'
    );

    return;
  }


  questions=
    ids.map(
      i=>
        questions[i]
    );


  answers=
    new Array(
      questions.length
    ).fill(null);


  index=0;


  $('wrongModal').style.display=
    'none';


  $('resultModal').style.display=
    'none';


  $('reviewBanner').style.display=
    'flex';


  $('reviewBanner').innerHTML=`

    <span>
      Review Mode:
      ${questions.length}
      questions
    </span>

    <button
      id="exitReviewBtn"
      class="exit-review-btn"
    >
      EXIT REVIEW
    </button>
  `;


  $('exitReviewBtn').onclick=
    ()=>
      location.reload();


  render();
}


function installResults(){

  $('submitBtn').onclick=
    showResults;


  $('retryAllBtn').onclick=
    ()=>{

      answers.fill(null);

      index=0;

      $('resultModal').style.display=
        'none';

      render();
    };


  $('reviewWrongBtn').onclick=
    showWrongAnswers;


  $('retryWrongFromReviewBtn').onclick=
    retryWrong;


  $('closeModalBtn').onclick=
    ()=>
      $('resultModal').style.display=
        'none';


  $('closeWrongBtn').onclick=
    ()=>
      $('wrongModal').style.display=
        'none';
}


// ============================================================
// AI TUTOR
// ============================================================

function installTutor(){

  const panel=
    $('satTutorPanel');


  const input=
    $('chatbotQuestion');


  const send=
    panel.querySelector(
      'button'
    );


  panel.classList.remove(
    'is-license-active'
  );


  panel
    .querySelector(
      '.sat-tutor-subtitle'
    )
    .textContent=
      'Ask about the current question · license subject tutor';


  $('chatbotResponse').textContent=
    '💡 Ask about the current license question.';


  send.removeAttribute(
    'onclick'
  );


  send.onclick=
    tutor;


  input.removeAttribute(
    'onkeypress'
  );


  input.onkeydown=e=>{

    if(
      e.key==='Enter' &&
      !e.isComposing
    ){

      e.preventDefault();

      tutor();
    }
  };


  window.sendChatbotMessage=
    tutor;
}


function tutor(){

  const box=
    $('chatbotResponse');


  if(
    accessByProduct[product]!==
    'full'
  ){

    box.innerHTML=`

      <div>
        AI Tutor requires an upgrade.
      </div>

      <button
        type="button"
        id="licenseTutorUpgrade"
        class="btn-start"
        style="margin-top:12px;min-width:140px"
      >
        UPGRADE
      </button>
    `;


    $('licenseTutorUpgrade').onclick=
      ()=>
        location.href=
          './login.html?return=license';


    return;
  }


  if(
    !questions[index]
  ){

    box.textContent=
      'Start a license question first.';

    return;
  }


  return licenseRemoteTutor();
}


// ============================================================
// CURRENT QUESTION CONTEXT
// ============================================================

window.getCurrentQuestionContext=
function(){

  const q=
    questions[index];


  if(!q)return null;


  const t=
    tr(q);


  return{

    N:
      baseOffset+
      index+
      1,

    SUBJECT:
      TITLES[product]||
      product,

    Q_EN:
      t.en?.question_text||
      '',

    Q_KO:
      t.ko?.question_text||
      '',

    Q_JP:
      t.ja?.question_text||
      '',

    P_EN:
      t.en?.passage||
      '',

    P_KO:
      t.ko?.passage||
      '',

    P_JP:
      t.ja?.passage||
      '',

    '1_EN':
      t.en?.option_1||
      '',

    '1_KO':
      t.ko?.option_1||
      '',

    '1_JP':
      t.ja?.option_1||
      '',

    '2_EN':
      t.en?.option_2||
      '',

    '2_KO':
      t.ko?.option_2||
      '',

    '2_JP':
      t.ja?.option_2||
      '',

    '3_EN':
      t.en?.option_3||
      '',

    '3_KO':
      t.ko?.option_3||
      '',

    '3_JP':
      t.ja?.option_3||
      '',

    '4_EN':
      t.en?.option_4||
      '',

    '4_KO':
      t.ko?.option_4||
      '',

    '4_JP':
      t.ja?.option_4||
      '',

    A:
      q.answer||
      '',

    E_EN:
      t.en?.explanation||
      '',

    E_KO:
      t.ko?.explanation||
      '',

    E_JP:
      t.ja?.explanation||
      '',

    CATEGORY:
      q.category||
      q.subject||
      '',

    currentIndex:
      index,

    currentMode:
      mode,

    currentSubject:
      product,

    currentLanguage:
      $('biblePrimaryTextSelector')?.value||
      'ENG'
  };
};


// ============================================================
// NAV BUTTONS
// ============================================================

$('prevBtn').onclick=
  ()=>go(-1);


$('skipBtn').onclick=
  ()=>{

    if(
      answers[index]==null
    ){

      answers[index]=
        -1;
    }

    go(1);
  };


$('nextBtn').onclick=
  ()=>go(1);


$('quitBtn').onclick=
  ()=>location.reload();


document.addEventListener(
  'keydown',
  e=>{

    if(
      e.target.matches(
        'input,select,textarea'
      )
    ){
      return;
    }

    // [추가] 스페이스바: 현재까지 인식된 음성 강제 종료 및 재시작
    if(e.key === ' ' || e.code === 'Space') {
      e.preventDefault(); // 페이지 스크롤 방지
      
      if(micMode && recognition) {
        console.log('스페이스바: 음성인식 종료 및 재시작');
        
        // 현재까지 인식된 내용을 강제로 처리
        try {
          // recognition.stop()을 호출하면 onresult가 트리거됨
          recognition.stop();
        } catch(e) {
          console.log('stop 오류:', e.message);
        }
        
        // 500ms 후 재시작 (브라우저 안정화)
        setTimeout(function() {
          if(micMode) {
            try {
              recognition.start();
              console.log('스페이스바: 음성인식 재시작 성공');
            } catch(e) {
              console.log('재시작 오류:', e.message);
            }
          }
        }, 500);
      }
      return;
    }


    if(
      (
        e.key==='ArrowRight' ||
        e.key.toLowerCase()==='n'
      ) &&
      index<
      questions.length-1
    ){

      go(1);
    }


    if(
      (
        e.key==='ArrowLeft' ||
        e.key.toLowerCase()==='p'
      ) &&
      index>0
    ){

      go(-1);
    }


    if(
      e.key==='Enter' &&
      index===
      questions.length-1
    ){

      showResults();
    }
  }
);


// ============================================================
// SPEECH RECOGNITION
// ============================================================

const SpeechRecognition=
  window.SpeechRecognition||
  window.webkitSpeechRecognition;


let recognition=null;
let micMode=false;


function initEnglishSpeechRecognition(){

  if(
    !SpeechRecognition
  ){

    alert(
      '이 기능은 Chrome 브라우저에서 사용해 주세요.'
    );

    return false;
  }


  recognition=
    new SpeechRecognition();


  recognition.lang=
    'en-US';


  recognition.continuous=
    true;


  recognition.interimResults=
    false;


  recognition.maxAlternatives=
    1;


  recognition.onresult=
    function(event){

      const spokenText=
        event
          .results[0][0]
          .transcript;


      console.log(
        '인식된 문장:',
        spokenText
      );


      compareAndHighlightCurrentSentence(
        spokenText
      );
    };


  recognition.onerror=
    function(event){

      console.error(
        'Speech recognition error:',
        event.error
      );


      if(
        event.error==='not-allowed'
      ){

        alert(
          '마이크 사용 권한을 허용해 주세요.'
        );
      }
    };


  recognition.onend=
    function(){

      console.log(
        '영어 음성인식 종료'
      );

      // [수정됨] 여기서는 무조건 재시작합니다. (micMode를 사용하지 않음)
      // 이유: 쉼표에서 잠시 멈추면 브라우저가 종료시키므로, 듣기를 계속하려면 재시작해야 합니다.
      // 마이크를 끄면 $('anneMicButton')에 active 클래스가 없어지므로, stop()을 호출하면 됩니다.
      const btn = $('anneMicButton');
      if(btn && btn.classList.contains('active')) {
        try {
          recognition.start();
        } catch(e) {
          console.log('재시작 중 오류:', e.message);
        }
      }
    };


  return true;
}


function startEnglishRecognition(){

  // [수정됨] 강제 리셋: 이전 recognition 객체를 통째로 없앱니다.
  if(recognition){
    try {
      recognition.onend = null; // 이벤트 리스너를 먼저 제거
      recognition.stop();
    } catch(e) {}
    recognition = null;
  }


  // [수정됨] 새로 생성 (이전 세션의 잔여물 제거)
  const ok =
    initEnglishSpeechRecognition();


  if(!ok) return;


  try{

    setTimeout(() => {
      try {
        recognition.start();
        console.log(
          '영어 음성인식 시작'
        );
      } catch(e) {
        console.log(
          '이미 음성인식 중입니다.'
        );
      }
    }, 100);

  }catch(e){

    console.log(
      '이미 음성인식 중입니다.'
    );
  }
}


// ============================================================
// SPEECH WORD MATCH
// ============================================================

function normalizeAnneSpeechWord(word){

  return String(
    word||
    ''
  )
  .toLowerCase()
  .replace(
    /[.,!?;:"'()[\]{}]/g,
    ''
  )
  .trim();
}


function compareAndHighlightCurrentSentence(
  spokenText
){

  const sentenceEl=
    document.querySelector(
  '.anne-passage .language-line[data-language="ENG"]'
    );


  if(!sentenceEl){

    alert(
      '현재 영어 문제 문장을 찾지 못했습니다.'
    );

    return;
  }


  if(
    !sentenceEl.dataset.originalSpeechText
  ){

    sentenceEl.dataset.originalSpeechText=
      sentenceEl
        .textContent
        .trim();
  }


  const originalText=
    sentenceEl
      .dataset
      .originalSpeechText;


  const originalWords=
    originalText
      .split(/\s+/)
      .filter(Boolean);


  const spokenWords=
    spokenText
      .split(/\s+/)
      .map(
        normalizeAnneSpeechWord
      )
      .filter(Boolean);


  let spokenIndex=0;

  let correctCount=0;


  const resultHtml=
    originalWords
      .map(function(word){

        const originalWord=
          normalizeAnneSpeechWord(
            word
          );


        if(
          spokenIndex<
          spokenWords.length &&
          originalWord===
          spokenWords[
            spokenIndex
          ]
        ){

          correctCount++;

          spokenIndex++;


          return(
            '<span class="speech-correct">'+
            word+
            '</span>'
          );
        }


        const foundIndex=
          spokenWords.indexOf(
            originalWord,
            spokenIndex
          );


        if(
          foundIndex!==-1
        ){

          correctCount++;

          spokenIndex=
            foundIndex+1;


          return(
            '<span class="speech-correct">'+
            word+
            '</span>'
          );
        }


        return(
          '<span>'+word+'</span>'
        );

      })
      .join(' ');


  sentenceEl.innerHTML=
    resultHtml;


  const score=
    originalWords.length
      ?correctCount/
       originalWords.length
      :0;


  const percent=
    Math.round(
      score*100
    );


  console.log(
    '학생이 읽은 문장:',
    spokenText
  );


  console.log(
    '원문:',
    originalText
  );


  console.log(
    '일치율:',
    percent+'%'
  );


  // [수정됨] 사용자가 설정한 임계값 사용
  const threshold = window.__micThreshold || 50;


  if (score >= (threshold / 100)) {

  console.log("PASS");

  // [추가됨] 통과 시 효과음 (띵똥) 재생
  playPassSound();


  if (auto && index < questions.length - 1) {

    try {
      recognition.stop();
    } catch (e) {}

    // [수정됨] 1초 동안 머무른 뒤 다음 문제로 넘어갑니다.
    setTimeout(function () {

      go(1);

      setTimeout(function () {
        startEnglishRecognition();
      }, 500);

    }, 1000);

  }

} else {

  console.log("TRY AGAIN");

  // [추가됨] 통과 실패 시 아쉬운 소리 재생
  playFailSound();

  // [추가됨] 노란색 하이라이트 제거 (다시 처음부터 읽어야 함을 알림)
  sentenceEl.innerHTML =
    sentenceEl.dataset.originalSpeechText;
  sentenceEl.classList.remove('speech-correct');
}
}


// ============================================================
// [추가됨] 통과 시 효과음(띵똥) 재생 함수
// ============================================================

function playPassSound(){

  // Web Audio API를 사용하여 간단한 "띵똥" 소리 생성
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if(!AudioCtx) return;

  const ctx = new AudioCtx();
  const now = ctx.currentTime;

  // 1번째 음 (띵) - 높은 음
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.type = 'sine';
  osc1.frequency.value = 880; // A5
  gain1.gain.setValueAtTime(0.001, now);
  gain1.gain.exponentialRampToValueAtTime(0.3, now + 0.02);
  gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
  osc1.connect(gain1);
  gain1.connect(ctx.destination);
  osc1.start(now);
  osc1.stop(now + 0.4);

  // 2번째 음 (똥) - 낮은 음
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = 'sine';
  osc2.frequency.value = 660; // E5
  gain2.gain.setValueAtTime(0.001, now + 0.25);
  gain2.gain.exponentialRampToValueAtTime(0.3, now + 0.27);
  gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
  osc2.connect(gain2);
  gain2.connect(ctx.destination);
  osc2.start(now + 0.25);
  osc2.stop(now + 0.6);
}


// ============================================================
// [추가됨] 통과 실패 시 효과음(아쉬운 소리) 재생 함수
// ============================================================

function playFailSound(){

  // Web Audio API를 사용하여 간단한 "아쉬운 소리" 생성
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if(!AudioCtx) return;

  const ctx = new AudioCtx();
  const now = ctx.currentTime;

  // 낮은 음 (우-) - 불합격 느낌
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = 220; // A3 (낮은 음)
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(0.25, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.5);
}


// ============================================================
// INITIALIZE
// ============================================================

document.addEventListener(
  'DOMContentLoaded',
  setupHome
);


if(
  document.readyState!==
  'loading'
){

  setupHome();
}

// ============================================================
// [추가됨] 마이크 켜기/끄기 효과음 함수
// ============================================================

function playMicOnSound(){
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if(!AudioCtx) return;

  const ctx = new AudioCtx();
  const now = ctx.currentTime;

  // "띵" (높은 음)
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = 880; // A5
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(0.3, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.3);
}


function playMicOffSound(){
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if(!AudioCtx) return;

  const ctx = new AudioCtx();
  const now = ctx.currentTime;

  // "똑" (낮은 음)
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = 440; // A4
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(0.3, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.2);
}
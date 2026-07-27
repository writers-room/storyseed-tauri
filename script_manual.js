/* =====================================================================
   script_manual.js — 이용 설명서 팝업
   ---------------------------------------------------------------------
   설정 모달과 같은 탭 구조지만, 클래스는 .man-tab / .man-panel 로 따로 씁니다.
   (script_ui.js의 openTab이 document 전체에서 .tab / .panel 을 찾기 때문에
    같은 클래스를 쓰면 설정 탭을 열 때 설명서 탭이 함께 초기화됩니다.)
   ===================================================================== */

const MANUAL_SECTIONS = [
  {
    id: "start",
    tab: "시작하기",
    html: `
      <p class="man-p">필명을 입력하고 <b>입장하기</b>를 누르면 끝이에요.
      오늘의 랜덤 이모지 프사가 함께 지급돼요.</p>

      <div class="man-warn">
        필명이 곧 내 계정이에요. 다른 분과 같은 필명을 쓰면 투두와 목표가 서로
        덮어써질 수 있으니, 나만 쓰는 필명을 정해두세요.
      </div>

      <p class="man-p">나갈 때는 오른쪽 위 <b>🚪 나가기</b>를 눌러주세요.
      그냥 창을 닫아도 되지만, 눌러주시면 다른 분들 화면에서 더 빨리 사라져요.</p>

      <div class="man-tip">
        화면은 크게 둘로 나뉘어요. 왼쪽은 <b>다 같이 보는 공간</b>(집필 현황 · 뽀모도로)과
        <b>나만의 공간</b>(투두 · 목표), 오른쪽은 <b>채팅</b>이에요.
      </div>
    `
  },
  {
    id: "cards",
    tab: "집필 현황",
    html: `
      <p class="man-p">지금 접속한 작가님들이 카드로 보여요. 카드 한 장에 담기는 것은 이래요.</p>

      <table class="man-t"><tbody>
        <tr><td>프사</td><td>사진을 올렸으면 사진, 아니면 이모지</td></tr>
        <tr><td>🕐 시간대</td><td>주로 쓰는 시간대 (안 정하면 안 보여요)</td></tr>
        <tr><td>🫧 상태</td><td>집필 중 · 집중 중 · 휴식 중 · 자리 비움</td></tr>
        <tr><td>🎯 목표</td><td>오늘의 한 줄 목표</td></tr>
        <tr><td>WORK</td><td>지금 집필 중이라는 표시</td></tr>
        <tr><td>🔥 👑</td><td>출석 업적</td></tr>
      </tbody></table>

      <p class="man-p"><b>내 카드에만 ✏️ 버튼</b>이 보여요. 누르면 프로필 설정으로 바로 갑니다.</p>
    `
  },
  {
    id: "pomo",
    tab: "뽀모도로",
    html: `
      <p class="man-p">한 명이 시작하면 <b>모두의 화면에서 함께 돌아가요.</b>
      집중 시간과 휴식 시간을 정하고 <b>▶ 시작</b>을 누르면 됩니다.</p>

      <table class="man-t"><tbody>
        <tr><td>🔔 참가 중</td><td>눌러서 끄면 내 알림음만 꺼져요. 타이머는 계속 돌아갑니다</td></tr>
        <tr><td>🎵</td><td>알림음 종류와 볼륨</td></tr>
        <tr><td>정지</td><td>모두의 타이머가 멈춰요</td></tr>
        <tr><td>▾</td><td>뽀모도로 영역 접기</td></tr>
      </tbody></table>

      <p class="man-p">채팅창 위쪽에 큼직한 숫자로도 남은 시간이 떠요.
      마감이 가까워지면 살짝 깜빡입니다.</p>
    `
  },
  {
    id: "personal",
    tab: "나의 작업",
    html: `
      <p class="man-p"><b>📌 나의 투두</b> — ＋ 로 추가하고, 체크하면 취소선이 그어져요.
      오른쪽 <b>⋯</b> 에서 수정 · 삭제 · <b>🔁 매일 반복</b>을 고를 수 있어요.
      매일 반복으로 걸어두면 자정에 체크가 저절로 풀립니다.</p>

      <p class="man-p"><b>🎯 오늘 목표 / 상태</b> — 여기 적은 목표와 상태는
      <b>다른 분들 카드에도 보여요.</b> 자동 저장되지만 <b>💾 저장</b>을 누르면 즉시 반영됩니다.</p>

      <p class="man-p"><b>✍️ 집필 시작!</b> 버튼을 누르면 상태가 집필 중으로 바뀌고
      카드에 WORK가 붙어요. 한 번 더 누르면 휴식으로 돌아갑니다.</p>

      <div class="man-tip">
        이 영역은 <b>▾</b> 로 접을 수 있어요. 접어도 집필 시작 버튼은 그대로 남습니다.
      </div>
    `
  },
  {
    id: "chat",
    tab: "채팅",
    html: `
      <table class="man-t"><tbody>
        <tr><td>@멘션</td><td>@ 를 치면 접속자 목록이 떠요. 멘션받으면 화면 위에 알림이 뜹니다</td></tr>
        <tr><td>답장</td><td>답장할 말풍선을 <b>세 번 연속 클릭</b>하세요</td></tr>
        <tr><td>반응</td><td>말풍선에 마우스를 올리면 나오는 <b>웃는 얼굴 버튼</b> → ❤️ 👍 😂 😮 🥹 🔥</td></tr>
        <tr><td>›</td><td>채팅창 접기. 접어두면 안 읽은 개수가 숫자로 쌓여요</td></tr>
      </tbody></table>

      <p class="man-p">반응은 다시 누르면 취소돼요. 붙은 반응에 마우스를 올리면 누가 눌렀는지 보입니다.</p>

      <div class="man-h2">/ 명령어 — 화면 가득 효과가 터져요</div>
      <p class="man-p">입력창에 <b>/</b> 를 치면 목록이 뜨고, 화살표 ↑↓ 로 고른 뒤 Enter 로 보내요.
      보내면 모두의 화면에 이모지가 흩날립니다.</p>

      <div class="man-cmds">
        <span class="man-cmd">/운세</span><span class="man-cmd">/축하</span><span class="man-cmd">/마감</span>
        <span class="man-cmd">/달성</span><span class="man-cmd">/연재</span><span class="man-cmd">/휴식</span>
        <span class="man-cmd">/집필</span><span class="man-cmd">/만세</span><span class="man-cmd">/수고</span>
        <span class="man-cmd">/고추</span>
      </div>

      <p class="man-p">아래 둘은 <b>뒤에 하고 싶은 말</b>을 붙여서 씁니다.</p>
      <table class="man-t"><tbody>
        <tr><td>/외치기</td><td><code>/외치기 오늘은 꼭 끝낸다</code> — 화면 한가운데 크게 외쳐요</td></tr>
        <tr><td>/선언</td><td><code>/선언 15화 마감</code> — 오늘의 목표를 채팅에 선언해요</td></tr>
      </tbody></table>

      <div class="man-tip">
        <b>/운세</b> 는 하루에 한 번, 오늘의 운세를 뽑아줘요. 재미로 봐주세요 🔮
      </div>
    `
  },
  {
    id: "profile",
    tab: "내 프로필",
    html: `
      <p class="man-p">내 카드의 <b>✏️</b> 또는 <b>⚙️ 설정 → 👤 프로필</b> 에서 바꿀 수 있어요.</p>

      <table class="man-t"><tbody>
        <tr><td>프사 사진</td><td>사진을 고르면 자동으로 정사각형으로 잘라 저장해요. 큰 사진도 괜찮아요</td></tr>
        <tr><td>프사 이모지</td><td>기본은 매일 새 이모지. <b>고정하기</b>를 켜면 원하는 걸로 계속 써요</td></tr>
        <tr><td>작업 시간대</td><td>종일반 · 심야반 · 새벽반 · 오전반 · 아무때나 · 스불재</td></tr>
        <tr><td>카드 강조색</td><td>내 카드 왼쪽에 얇은 띠. 여러 명일 때 내 카드를 빨리 찾을 수 있어요</td></tr>
      </tbody></table>

      <div class="man-tip">
        사진을 올리면 <b>채팅 말풍선 프사에도 함께 적용</b>돼요. 사진을 지우면 이모지로 돌아갑니다.
      </div>
    `
  },
  {
    id: "etc",
    tab: "그 밖에",
    html: `
      <table class="man-t"><tbody>
        <tr><td>− 18px +</td><td><b>채팅 글자 크기</b>를 조절해요. 카드 크기는 안 바뀝니다</td></tr>
        <tr><td>🎨 테마</td><td>설정에서 배경과 말풍선 색을 골라요. 눈이 편한 어두운 테마도 있어요</td></tr>
        <tr><td>레이아웃</td><td>채팅창을 왼쪽/오른쪽 어디에 둘지, 가로 넓이는 얼마로 할지</td></tr>
        <tr><td>🔥 연속 출석</td><td>3일 이상 이어서 접속하면 카드에 배지가 붙어요</td></tr>
        <tr><td>👑 풀출석</td><td>지난주에 매일 접속했다면 카드가 금색으로 빛나요</td></tr>
      </tbody></table>

      <div class="man-tip">
        테마 · 글자 크기 · 접어둔 영역은 <b>이 기기에만</b> 저장돼요.
        프사와 투두는 필명을 따라다니니 다른 기기에서 들어와도 그대로예요.
      </div>
    `
  }
];

let _manualRendered = false;

function renderManual() {
  if (_manualRendered) return;

  const tabsHost = document.getElementById("manual-tabs");
  const panelsHost = document.getElementById("manual-panels");
  if (!tabsHost || !panelsHost) return;

  tabsHost.innerHTML = MANUAL_SECTIONS.map((s, i) => `
    <button type="button" class="man-tab${i === 0 ? " active" : ""}"
            role="tab" aria-selected="${i === 0}" aria-controls="man-panel-${s.id}"
            data-man-tab="${s.id}">${s.tab}</button>
  `).join("");

  panelsHost.innerHTML = MANUAL_SECTIONS.map((s, i) => `
    <div class="man-panel${i === 0 ? " active" : ""}" id="man-panel-${s.id}" role="tabpanel">
      ${s.html}
    </div>
  `).join("");

  tabsHost.querySelectorAll(".man-tab").forEach(btn => {
    btn.addEventListener("click", () => openManualTab(btn.dataset.manTab));
  });

  _manualRendered = true;
}

function openManualTab(id) {
  document.querySelectorAll(".man-tab").forEach(t => {
    const on = t.dataset.manTab === id;
    t.classList.toggle("active", on);
    t.setAttribute("aria-selected", on ? "true" : "false");
  });
  document.querySelectorAll(".man-panel").forEach(p => {
    p.classList.toggle("active", p.id === `man-panel-${id}`);
  });

  // 탭을 바꾸면 내용 맨 위부터 보이게
  const scroller = document.getElementById("manual-panels");
  if (scroller) scroller.scrollTop = 0;
}

function openManual() {
  renderManual();
  const modal = document.getElementById("manual-modal");
  if (!modal) return;
  modal.style.display = "flex";
  document.getElementById("manual-close-btn")?.focus();
}

function closeManual() {
  const modal = document.getElementById("manual-modal");
  if (modal) modal.style.display = "none";
}

window.openManual = openManual;
window.closeManual = closeManual;
window.openManualTab = openManualTab;

/* ESC로 닫기 — 설정 모달이 열려 있으면 그쪽이 우선이라 건드리지 않습니다 */
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const modal = document.getElementById("manual-modal");
  if (modal && modal.style.display === "flex") closeManual();
});

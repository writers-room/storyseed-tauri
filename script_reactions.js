/* =====================================================================
   script_reactions.js — 메시지 이모지 반응
   ---------------------------------------------------------------------
   저장 경로:  reactions/{메시지키}/{반응ID}/{필명} = true

   messages/ 안이 아니라 별도 경로를 쓰는 이유:
   메시지 리스너가 child_added 기반이라, 메시지 노드 안에 반응을 넣으면
   기존 렌더 로직과 얽히고 과거 메시지 수정도 필요해집니다.
   반응만 따로 두면 채팅 코드에 손을 거의 안 대도 됩니다.

   반응은 이모지 자체가 아니라 ID로 저장합니다. (heart, up, ...)
   Firebase 키 제약을 피하고, 나중에 이모지를 바꿔도 기존 데이터가 살아남습니다.
   ===================================================================== */

const REACTIONS = [
  { id: "heart", emoji: "❤️", label: "하트" },
  { id: "up",    emoji: "👍", label: "따봉" },
  { id: "laugh", emoji: "😂", label: "웃김" },
  { id: "wow",   emoji: "😮", label: "놀람" },
  { id: "sad",   emoji: "🥹", label: "뭉클" },
  { id: "fire",  emoji: "🔥", label: "불타오르네" }
];

const REACTION_BY_ID = Object.fromEntries(REACTIONS.map(r => [r.id, r]));

let _reactionsRef = null;
let _reactionCache = {};      // { msgKey: { id: { nick: true } } }

/* ---------------------------------------------------------------------
   말풍선 옆 "반응 달기" 버튼 — script_chat.js 템플릿에서 호출
   (선 아이콘: 웃는 얼굴 + 플러스)
   ------------------------------------------------------------------- */
function reactionAddButtonHtml() {
  return `<button type="button" class="reaction-add-btn" data-reaction-add="1"
                  aria-label="반응 남기기" title="반응 남기기">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
                 stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M20.9 13a9 9 0 1 1-7.9-9.9"/>
              <path d="M8.5 14.5a4.5 4.5 0 0 0 6.3.6"/>
              <path d="M9 9.5h.01M15 8h.01"/>
              <path d="M18 3.5v5M20.5 6h-5"/>
            </svg>
          </button>`;
}
window.reactionAddButtonHtml = reactionAddButtonHtml;

/* ---------------------------------------------------------------------
   렌더
   ------------------------------------------------------------------- */
function _rowFor(key) {
  const box = document.getElementById("chat-box");
  if (!box || !key) return null;
  try {
    return box.querySelector(`.reaction-row[data-reactions-for="${CSS.escape(key)}"]`);
  } catch (e) {
    return null;
  }
}

function renderReactionRow(key) {
  const row = _rowFor(key);
  if (!row) return;

  const data = _reactionCache[key] || {};

  const chips = REACTIONS.map(r => {
    const nicks = Object.keys(data[r.id] || {});
    if (!nicks.length) return "";

    const mine = myNick && nicks.includes(myNick);
    const who = nicks.join(", ");

    return `<button type="button" class="reaction-chip${mine ? " mine" : ""}"
                    data-reaction-toggle="${r.id}" data-key="${escapeHtml(key)}"
                    title="${escapeHtml(who)}"
                    aria-pressed="${mine ? "true" : "false"}">
              <span class="reaction-chip-emoji">${r.emoji}</span>
              <span class="reaction-chip-count">${nicks.length}</span>
            </button>`;
  }).join("");

  row.innerHTML = chips;
  row.classList.toggle("empty", !chips);
}

function renderAllReactionRows() {
  const box = document.getElementById("chat-box");
  if (!box) return;
  box.querySelectorAll(".reaction-row").forEach(row => {
    renderReactionRow(row.dataset.reactionsFor);
  });
}
window.renderAllReactionRows = renderAllReactionRows;

/* ---------------------------------------------------------------------
   구독 — 메시지 단위(child_*)로 받아서 해당 줄만 갱신
   ------------------------------------------------------------------- */
function listenReactions() {
  if (_reactionsRef) return;
  _reactionsRef = db.ref("reactions");

  const upsert = snap => {
    _reactionCache[snap.key] = snap.val() || {};
    renderReactionRow(snap.key);
  };

  _reactionsRef.on("child_added", upsert);
  _reactionsRef.on("child_changed", upsert);
  _reactionsRef.on("child_removed", snap => {
    delete _reactionCache[snap.key];
    renderReactionRow(snap.key);
  });
}
window.listenReactions = listenReactions;

function detachReactions() {
  try { _reactionsRef?.off(); } catch (e) {}
  _reactionsRef = null;
  _reactionCache = {};
}
window.detachReactions = detachReactions;

/* ---------------------------------------------------------------------
   토글
   ------------------------------------------------------------------- */
async function toggleReaction(key, id) {
  if (!myNick || !key || !REACTION_BY_ID[id]) return;

  const mine = !!(_reactionCache[key]?.[id]?.[myNick]);
  const ref = db.ref(`reactions/${key}/${id}/${myNick}`);

  // 낙관적 반영 — 네트워크 왕복을 기다리지 않고 즉시 그린다
  _reactionCache[key] = _reactionCache[key] || {};
  _reactionCache[key][id] = _reactionCache[key][id] || {};
  if (mine) delete _reactionCache[key][id][myNick];
  else _reactionCache[key][id][myNick] = true;
  renderReactionRow(key);

  try {
    await (mine ? ref.remove() : ref.set(true));
  } catch (e) {
    console.warn("[toggleReaction failed]", e);
    // 실패하면 서버 값으로 되돌아옵니다 (child_changed)
  }
}
window.toggleReaction = toggleReaction;

/* ---------------------------------------------------------------------
   피커
   ------------------------------------------------------------------- */
function closeReactionPicker() {
  document.querySelectorAll(".reaction-picker").forEach(p => p.remove());
}
window.closeReactionPicker = closeReactionPicker;

function openReactionPicker(btn) {
  const item = btn.closest(".chat-item");
  const key = item?.dataset.key;
  if (!key) return;

  const already = document.querySelector(`.reaction-picker[data-key="${CSS.escape(key)}"]`);
  closeReactionPicker();
  if (already) return;   // 같은 버튼을 다시 누르면 닫기

  const picker = document.createElement("div");
  picker.className = "reaction-picker";
  picker.dataset.key = key;
  picker.setAttribute("role", "group");
  picker.setAttribute("aria-label", "반응 선택");
  picker.innerHTML = REACTIONS.map(r => `
    <button type="button" class="reaction-opt" data-reaction-toggle="${r.id}"
            data-key="${escapeHtml(key)}" title="${r.label}" aria-label="${r.label}">${r.emoji}</button>
  `).join("");

  // 말풍선 줄 안에 붙여서 위치를 따라가게 함 (fixed 좌표 계산 불필요)
  const row = btn.closest(".bubble-row");
  (row || item).appendChild(picker);
}

/* ---------------------------------------------------------------------
   바인딩 — #chat-box에 위임.
   답장(말풍선 3연속 클릭)은 .msg-bubble에서만 동작하고,
   반응 버튼/칩/피커는 모두 말풍선 밖이라 서로 간섭하지 않습니다.
   ------------------------------------------------------------------- */
function bindReactionInteractions() {
  const box = document.getElementById("chat-box");
  if (!box || box.dataset.reactionBound === "true") return;
  box.dataset.reactionBound = "true";

  box.addEventListener("click", (e) => {
    const toggle = e.target.closest("[data-reaction-toggle]");
    if (toggle) {
      e.preventDefault();
      e.stopPropagation();
      toggleReaction(toggle.dataset.key, toggle.dataset.reactionToggle);
      if (toggle.classList.contains("reaction-opt")) closeReactionPicker();
      return;
    }

    const add = e.target.closest("[data-reaction-add]");
    if (add) {
      e.preventDefault();
      e.stopPropagation();
      openReactionPicker(add);
      return;
    }

    closeReactionPicker();
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest?.(".reaction-picker, [data-reaction-add]")) closeReactionPicker();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeReactionPicker();
  });
}
window.bindReactionInteractions = bindReactionInteractions;

/* ---------------------------------------------------------------------
   훅 연결
   ------------------------------------------------------------------- */
(function installReactionHooks() {

  // 입장 시 구독 시작
  const _join = window.join;
  if (typeof _join === "function" && !_join.__reactionPatched) {
    const wrapped = async function () {
      await _join.apply(this, arguments);
      if (myNick) {
        try { listenReactions(); } catch (e) { console.warn("[listenReactions]", e); }
        try { bindReactionInteractions(); } catch (e) { console.warn("[bindReactionInteractions]", e); }
      }
    };
    wrapped.__reactionPatched = true;
    window.join = wrapped;
  }

  // 퇴장 시 구독 해제
  const _leave = window.leaveRoom;
  if (typeof _leave === "function" && !_leave.__reactionPatched) {
    const wrapped = async function () {
      detachReactions();
      closeReactionPicker();
      return _leave.apply(this, arguments);
    };
    wrapped.__reactionPatched = true;
    window.leaveRoom = wrapped;
  }

  // 채팅을 전부 지우면 반응도 같이 지운다.
  // (안 그러면 사라진 메시지의 반응이 DB에 영원히 남습니다)
  const _clear = window.clearAllChat;
  if (typeof _clear === "function" && !_clear.__reactionPatched) {
    const wrapped = async function () {
      const r = await _clear.apply(this, arguments);
      try { await db.ref("reactions").remove(); } catch (e) { console.warn("[clear reactions]", e); }
      _reactionCache = {};
      return r;
    };
    wrapped.__reactionPatched = true;
    window.clearAllChat = wrapped;
  }

  // 메시지가 새로 그려지면 그 줄의 반응도 즉시 반영
  // (이전 대화 불러오기처럼 나중에 렌더되는 경우 대비)
  const _render = window.renderChatMessage;
  if (typeof _render === "function" && !_render.__reactionPatched) {
    const wrapped = function (box, data, key) {
      const r = _render.apply(this, arguments);
      try { if (key && _reactionCache[key]) renderReactionRow(key); } catch (e) {}
      return r;
    };
    wrapped.__reactionPatched = true;
    window.renderChatMessage = wrapped;
  }
})();

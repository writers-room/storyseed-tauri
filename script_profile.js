/* =====================================================================
   script_profile.js — 채팅 접기 + 프로필 편집
   ---------------------------------------------------------------------
   기존 파일 수정을 최소화하려고 신규 모듈로 분리했습니다.
   index.html에서 script_realtime.js 다음에 로드됩니다.

   [1] 채팅 사이드바 접기/펼치기 (기기별 · localStorage)
   [2] 프로필 데이터 (필명별 · Firebase users/{닉}/profile)
   [3] 설정 모달 "프로필" 탭
   ===================================================================== */

/* =====================================================================
   [1] 채팅 사이드바 접기
   ===================================================================== */

let _chatCollapsed = false;
let _unreadWhileCollapsed = 0;

const COLLAPSE_KEY = "chatCollapsed";

/**
 * 접기 버튼을 쓸 수 있는 화면인지.
 * 모바일/좁은 화면은 이미 body.narrow-chat-focus(채팅만 남기는 모드)가
 * 동작 중이라, 여기서 또 접으면 화면에 아무것도 안 남습니다. → 비활성화.
 */
function _canCollapse() {
  if (window.isMobile) return false;
  return !document.body.classList.contains("narrow-chat-focus");
}

function applyChatCollapsed(collapsed, opts = {}) {
  const on = !!collapsed && _canCollapse();
  _chatCollapsed = on;

  document.body.classList.toggle("chat-collapsed", on);

  const rail = document.getElementById("chat-rail");
  const btn = document.getElementById("chat-collapse-btn");

  if (rail) rail.classList.toggle("hidden", !on);
  if (btn) {
    btn.setAttribute("aria-expanded", on ? "false" : "true");
    btn.setAttribute("aria-label", on ? "채팅 펼치기" : "채팅 접기");
  }

  if (!on) {
    // 펼치면 안 읽은 개수 초기화 + 하단으로
    _unreadWhileCollapsed = 0;
    renderRailBadge();
    setTimeout(() => window.scrollChatToBottom?.(true), 60);
  }

  if (!opts.silent) {
    try { localStorage.setItem(COLLAPSE_KEY, on ? "1" : "0"); } catch (e) {}
  }
}

function toggleChatCollapsed() {
  if (!_canCollapse()) return;
  applyChatCollapsed(!_chatCollapsed);
}

function applySavedChatCollapsed() {
  let saved = false;
  try { saved = localStorage.getItem(COLLAPSE_KEY) === "1"; } catch (e) {}
  applyChatCollapsed(saved, { silent: true });
}

function renderRailBadge() {
  const el = document.getElementById("chat-rail-badge");
  if (!el) return;
  const n = _unreadWhileCollapsed;
  el.textContent = n > 99 ? "99+" : String(n);
  el.classList.toggle("hidden", n <= 0);
}

/** 접힌 상태에서 새 메시지가 오면 레일 배지를 올린다 (chat 모듈에서 호출) */
function noteChatMessageWhileCollapsed() {
  if (!_chatCollapsed) return;
  _unreadWhileCollapsed += 1;
  renderRailBadge();
}

function bindChatCollapse() {
  const btn = document.getElementById("chat-collapse-btn");
  if (btn && !btn._collapseBound) {
    btn._collapseBound = true;
    btn.addEventListener("click", toggleChatCollapsed);
  }

  const railBtn = document.getElementById("chat-rail-btn");
  if (railBtn && !railBtn._collapseBound) {
    railBtn._collapseBound = true;
    railBtn.addEventListener("click", toggleChatCollapsed);
  }

  // 좁은 화면으로 전환되면 접힘을 강제 해제 (저장값은 유지)
  window.addEventListener("resize", () => {
    if (_chatCollapsed && !_canCollapse()) {
      applyChatCollapsed(false, { silent: true });
    }
  });
}

/* =====================================================================
   [1-B] 패널 접기 — 뽀모도로 · 개인 영역
   ---------------------------------------------------------------------
   채팅 접기와 달리 레일이 필요 없어서, body 클래스만 토글하고
   나머지는 CSS가 처리합니다. 상태는 기기별(localStorage) 저장.
   ===================================================================== */

const PANELS = [
  { key: "pomoCollapsed",     btn: "pomo-collapse-btn",     cls: "pomo-collapsed",     label: "뽀모도로" },
  { key: "personalCollapsed", btn: "personal-collapse-btn", cls: "personal-collapsed", label: "개인 영역" }
];

function applyPanelCollapsed(panel, collapsed, opts = {}) {
  const on = !!collapsed;
  document.body.classList.toggle(panel.cls, on);

  const btn = document.getElementById(panel.btn);
  if (btn) {
    btn.setAttribute("aria-expanded", on ? "false" : "true");
    const label = `${panel.label} ${on ? "펼치기" : "접기"}`;
    btn.setAttribute("aria-label", label);
    btn.setAttribute("title", label);
  }

  if (!opts.silent) {
    try { localStorage.setItem(panel.key, on ? "1" : "0"); } catch (e) {}
  }
}

function togglePanelCollapsed(panel) {
  applyPanelCollapsed(panel, !document.body.classList.contains(panel.cls));
}

function bindPanelCollapse() {
  PANELS.forEach(panel => {
    const btn = document.getElementById(panel.btn);
    if (btn && !btn._panelBound) {
      btn._panelBound = true;
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        togglePanelCollapsed(panel);
      });
    }

    let saved = false;
    try { saved = localStorage.getItem(panel.key) === "1"; } catch (e) {}
    applyPanelCollapsed(panel, saved, { silent: true });
  });
}
window.bindPanelCollapse = bindPanelCollapse;

window.toggleChatCollapsed = toggleChatCollapsed;
window.applySavedChatCollapsed = applySavedChatCollapsed;
window.noteChatMessageWhileCollapsed = noteChatMessageWhileCollapsed;
window.bindChatCollapse = bindChatCollapse;


/* =====================================================================
   [2] 프로필 데이터
   ---------------------------------------------------------------------
   저장 위치: users/{닉}/profile
   status/{닉}은 퇴장 시 onDisconnect().remove()로 통째로 지워지므로
   영구 데이터를 여기에 두면 안 됩니다.
   ===================================================================== */

window._profileCache = window._profileCache || {};

const WRITING_SLOTS = [
  { id: "",         label: "" },
  { id: "allday",   label: "종일반" },
  { id: "night",    label: "심야반" },
  { id: "dawn",     label: "새벽반" },
  { id: "morning",  label: "오전반" },
  { id: "anytime",  label: "아무때나" },
  { id: "seulbool", label: "스불재" }
];

/**
 * 예전 시간대 값 호환.
 * "낮 10–18시"(day), "저녁 18–24시"(evening)는 새 목록에 대응이 없어서,
 * 이미 저장해둔 사람의 설정이 조용히 사라지지 않도록 가까운 값으로 넘겨줍니다.
 */
const LEGACY_SLOT_ALIAS = {
  day: "anytime",
  evening: "night"
};

const ACCENT_PRESETS = [
  // 기존 8색
  "#7F77DD", // 라벤더
  "#1D9E75", // 그린
  "#D85A30", // 코랄
  "#D4537E", // 핑크
  "#378ADD", // 블루
  "#BA7517", // 앰버
  "#E24B4A", // 레드
  "#888780", // 그레이
  // 추가 5색 — 위와 색상환에서 겹치지 않는 구간으로 골랐고,
  // 라이트/다크 배경 양쪽에서 띠가 보이도록 명도를 중간대로 맞췄습니다.
  "#00A6A6", // 틸
  "#A855C7", // 바이올렛
  "#7CB342", // 라임
  "#9C6B4F", // 모카
  "#456B8C", // 슬레이트 블루

  // 파스텔 10색.
  // 카드 왼쪽 3px 띠로 쓰이므로 흰 배경에서도 식별되도록
  // 명도를 0.62~0.80 사이로만 잡았습니다. (더 밝으면 안 보임)
  "#F49AC1", // 파스텔 핑크
  "#F5A9A9", // 파스텔 코랄
  "#F7B267", // 파스텔 살구
  "#EBC85B", // 파스텔 레몬
  "#A8D26D", // 파스텔 연두
  "#6FCFA8", // 파스텔 민트
  "#7FC7E8", // 파스텔 하늘
  "#9BA8E8", // 파스텔 라벤더
  "#C79BE0", // 파스텔 라일락
  "#B9A48C"  // 파스텔 베이지
];

function normalizeSlot(id) {
  const raw = String(id || "");
  return LEGACY_SLOT_ALIAS[raw] || raw;
}

function writingSlotLabel(id) {
  const hit = WRITING_SLOTS.find(s => s.id === normalizeSlot(id));
  return hit ? hit.label : "";
}

/** 임의 문자열이 스타일 속성에 주입되지 않도록 화이트리스트로만 통과 */
function sanitizeAccent(v) {
  const s = String(v || "");
  return ACCENT_PRESETS.includes(s) ? s : "";
}

/* =====================================================================
   프사 사진
   ---------------------------------------------------------------------
   Firebase Storage 대신 브라우저에서 축소한 이미지를 data URL 문자열로
   Realtime Database(users/{닉}/profile/photo)에 넣습니다.
   128px 정사각 JPEG면 보통 5~12KB라 RTDB에 부담이 없습니다.
   ===================================================================== */

const PHOTO_SIZE = 128;          // 정사각 한 변(px)
const PHOTO_MAX_BYTES = 60 * 1024;  // data URL 문자열 상한
const PHOTO_INPUT_MAX = 12 * 1024 * 1024; // 원본 파일 상한(12MB)

/**
 * 저장된 사진 값 검증.
 * data:image/... 로 시작하는 문자열만 통과시켜, 외부 URL이나
 * javascript: 같은 스킴이 img src에 들어가는 경로를 막습니다.
 */
function sanitizePhoto(v) {
  const s = String(v || "");
  if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s)) return "";
  if (s.length > PHOTO_MAX_BYTES * 2) return "";
  return s;
}

/** File → 정사각 크롭 + 축소 → data URL */
function fileToSquareDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error("파일이 없어요."));
    if (!/^image\//.test(file.type)) return reject(new Error("이미지 파일만 올릴 수 있어요."));
    if (file.size > PHOTO_INPUT_MAX) return reject(new Error("파일이 너무 커요. 12MB 이하로 올려주세요."));

    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = PHOTO_SIZE;
        canvas.height = PHOTO_SIZE;
        const ctx = canvas.getContext("2d");

        // 가운데를 정사각으로 잘라 담습니다 (비율 왜곡 없음)
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;

        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, sx, sy, side, side, 0, 0, PHOTO_SIZE, PHOTO_SIZE);

        // 상한을 넘으면 품질을 낮춰가며 다시 인코딩
        let out = "";
        for (const q of [0.82, 0.7, 0.6, 0.5, 0.4]) {
          out = canvas.toDataURL("image/jpeg", q);
          if (out.length <= PHOTO_MAX_BYTES) break;
        }
        if (out.length > PHOTO_MAX_BYTES) {
          return reject(new Error("이미지를 충분히 줄이지 못했어요. 다른 사진을 써주세요."));
        }
        resolve(out);
      } catch (e) {
        reject(e);
      } finally {
        URL.revokeObjectURL(url);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("이미지를 읽지 못했어요."));
    };

    img.src = url;
  });
}

/* ---------------------------------------------------------------------
   채팅 말풍선 아바타
   ---------------------------------------------------------------------
   메시지에는 보낸 시점의 이모지(data.emoji)만 저장돼 있습니다.
   사진을 메시지마다 복사하면 10KB씩 불어나므로, 렌더 시점에 프로필에서
   찾아옵니다. 대신 프사를 바꾸면 과거 말풍선까지 함께 갱신됩니다.
   ------------------------------------------------------------------- */
function chatAvatarHtml(user, emoji) {
  const nick = String(user || "");
  const fallback = String(emoji || "✍️");
  const prof = (window._profileCache || {})[nick] || {};
  const photo = sanitizePhoto(prof.photo);

  const attrs = `data-avatar-of="${escapeHtml(nick)}" data-avatar-emoji="${escapeHtml(fallback)}"`;

  return photo
    ? `<div class="profile-emoji has-photo" ${attrs}><img src="${escapeHtml(photo)}" alt="" loading="lazy"></div>`
    : `<div class="profile-emoji" ${attrs}>${escapeHtml(fallback)}</div>`;
}

/** 프로필이 갱신되면 이미 그려진 말풍선 아바타도 바꿔치기 */
function refreshChatAvatars() {
  const box = document.getElementById("chat-box");
  if (!box) return;

  box.querySelectorAll("[data-avatar-of]").forEach(el => {
    const nick = el.dataset.avatarOf || "";
    const fallback = el.dataset.avatarEmoji || "✍️";
    const photo = sanitizePhoto((window._profileCache || {})[nick]?.photo);

    const hasPhoto = el.classList.contains("has-photo");
    if (photo) {
      const img = el.querySelector("img");
      if (img && img.getAttribute("src") === photo) return;  // 변화 없음
      el.classList.add("has-photo");
      el.textContent = "";
      const next = document.createElement("img");
      next.src = photo;
      next.alt = "";
      next.loading = "lazy";
      el.appendChild(next);
    } else if (hasPhoto) {
      el.classList.remove("has-photo");
      el.textContent = fallback;
    }
  });
}

window.writingSlotLabel = writingSlotLabel;
window.sanitizeAccent = sanitizeAccent;
window.sanitizePhoto = sanitizePhoto;
window.fileToSquareDataUrl = fileToSquareDataUrl;
window.chatAvatarHtml = chatAvatarHtml;
window.refreshChatAvatars = refreshChatAvatars;

function _emojiLockKey(nick) {
  return `writerEmojiLock_${nick}`;
}

/** 전체 프로필 구독 — 카드 렌더가 window._profileCache를 참조합니다 */
let _profilesRef = null;
let _profileSignature = null;

function listenProfiles() {
  if (_profilesRef) return;
  _profilesRef = db.ref("users");
  _profilesRef.on("value", snap => {
    const all = snap.val() || {};
    const out = {};
    for (const nick in all) {
      const p = all[nick]?.profile;
      if (p) out[nick] = p;
    }

    /* ✅ [FIX] 프로필 사진 깜빡임

       users 경로 전체를 구독하고 있어서, 같은 경로에 저장되는 투두·오늘 목표가
       바뀔 때도 이 콜백이 돌았습니다. 누군가 목표를 타이핑하면 그때마다
       카드가 통째로 다시 그려지면서 사진이 깜빡였어요.

       프로필 부분만 뽑아 직전 값과 비교하고, 실제로 달라졌을 때만 다시 그립니다.
       (구독 경로를 좁히려면 필명별로 리스너를 달아야 해서, 인원이 드나드는
        구조상 이 방식이 더 단순합니다.) */
    const sig = JSON.stringify(out);
    if (sig === _profileSignature) return;
    _profileSignature = sig;

    window._profileCache = out;

    // 카드·채팅 아바타에 즉시 반영 (status 리스너를 기다리지 않음)
    window.rerenderUserCards?.();
    try { refreshChatAvatars(); } catch (e) {}
  });
}

async function loadMyProfile() {
  if (!myNick) return {};
  try {
    const snap = await db.ref(`users/${myNick}/profile`).once("value");
    const p = snap.val() || {};

    // 이모지 고정값을 로컬에도 캐시 → 다음 입장 때 getDailyEmoji가 동기로 읽음
    try {
      if (p.emojiLocked && p.emoji) {
        localStorage.setItem(_emojiLockKey(myNick), p.emoji);
      } else {
        localStorage.removeItem(_emojiLockKey(myNick));
      }
    } catch (e) {}

    return p;
  } catch (e) {
    console.warn("[loadMyProfile failed]", e);
    return {};
  }
}

async function saveMyProfile(patch) {
  if (!myNick) return;
  const next = { ...(window._myProfile || {}), ...patch };
  window._myProfile = next;

  try {
    if (next.emojiLocked && next.emoji) {
      localStorage.setItem(_emojiLockKey(myNick), next.emoji);
    } else {
      localStorage.removeItem(_emojiLockKey(myNick));
    }
  } catch (e) {}

  try {
    await db.ref(`users/${myNick}/profile`).update(next);
  } catch (e) {
    console.warn("[saveMyProfile failed]", e);
  }
}

/**
 * 이모지 고정을 켜거나 끈 직후, 다시 입장하지 않아도 바로 반영되게 처리.
 * myEmoji는 script_core.js의 스크립트 스코프 변수라 같은 전역 렉시컬
 * 스코프에서 재할당할 수 있습니다.
 */
function applyMyEmoji(nextEmoji) {
  if (!myNick || !nextEmoji) return;
  myEmoji = nextEmoji;

  const info = document.getElementById("my-info");
  if (info) info.innerText = `${myEmoji} ${myNick}`;

  window.updateStatus?.(true);
  window.updateChatHeader?.();
}

async function afterJoinLoadProfile() {
  if (!myNick) return;
  listenProfiles();

  const p = await loadMyProfile();
  window._myProfile = p;

  // 고정 이모지가 있는데 현재 이모지와 다르면 즉시 교체
  if (p.emojiLocked && p.emoji && p.emoji !== myEmoji) {
    applyMyEmoji(p.emoji);
  }
}

window.listenProfiles = listenProfiles;
window.loadMyProfile = loadMyProfile;
window.saveMyProfile = saveMyProfile;
window.afterJoinLoadProfile = afterJoinLoadProfile;


/* =====================================================================
   [3] 설정 모달 — 프로필 탭
   ===================================================================== */

/** 프사 후보: 오늘의 랜덤 프사 + 대표 이모지 몇 개 */
const EMOJI_PICKS = [
  "🌙","🦋","🍭","🌿","⭐","🦊","📚","🕯️",
  "🐧","🌊","🔮","🎻","🌸","🍀","💎","🐬",
  "✏️","🎨","🧸","🪐","🍓","🐨","🎭","🪶"
];

function renderProfilePanel() {
  const host = document.getElementById("panel-profile");
  if (!host) return;

  if (!myNick) {
    host.innerHTML = `<div class="set-block"><p class="hint">입장 후에 프로필을 설정할 수 있어요.</p></div>`;
    return;
  }

  const p = window._myProfile || {};
  const locked = !!p.emojiLocked;
  const curEmoji = locked && p.emoji ? p.emoji : myEmoji;
  const curSlot = normalizeSlot(p.writingSlot);
  const curAccent = sanitizeAccent(p.accent);

  const picks = [...new Set([myEmoji, ...EMOJI_PICKS])];
  const photo = sanitizePhoto(p.photo);

  host.innerHTML = `
    <div class="set-block">
      <div class="set-title">프사 사진</div>
      <div class="profile-emoji-row">
        <div class="profile-photo-preview${photo ? " has-photo" : ""}" id="prof-photo-preview">
          ${photo ? `<img src="${escapeHtml(photo)}" alt="">` : `<span>${escapeHtml(curEmoji)}</span>`}
        </div>
        <div class="profile-emoji-meta">
          <div class="profile-emoji-name">${escapeHtml(myNick)}</div>
          <div class="set-row" style="margin-top:8px;">
            <button type="button" class="ghost-btn compact" id="prof-photo-btn">사진 올리기</button>
            <button type="button" class="ghost-btn compact danger${photo ? "" : " hidden"}" id="prof-photo-clear">지우기</button>
          </div>
          <div class="hint" id="prof-photo-hint">${
            photo ? "사진이 이모지 대신 카드에 표시돼요."
                  : "정사각형으로 잘라 128px로 줄여서 저장해요. 사진이 없으면 아래 이모지를 써요."
          }</div>
        </div>
      </div>
      <input type="file" id="prof-photo-input" accept="image/*" class="sr-only">
    </div>

    <div class="set-block">
      <div class="set-title">프사 이모지</div>
      <div class="profile-emoji-row">
        <div class="profile-emoji-preview" id="prof-emoji-preview">${escapeHtml(curEmoji)}</div>
        <div class="profile-emoji-meta">
          <div class="hint" id="prof-emoji-hint">${
            locked ? "고른 이모지가 계속 유지돼요."
                   : "매일 새 프사를 받아요. 오늘은 " + escapeHtml(myEmoji) + " 예요."
          }</div>
        </div>
      </div>

      <label class="set-check" style="margin-top:12px;">
        <input type="checkbox" id="prof-emoji-lock" ${locked ? "checked" : ""}>
        이 이모지로 고정하기
      </label>

      <div class="emoji-picker ${locked ? "" : "hidden"}" id="prof-emoji-picker" role="group" aria-label="프사 선택">
        ${picks.map(e => `
          <button type="button" class="emoji-pick${e === curEmoji ? " selected" : ""}"
                  data-emoji="${escapeHtml(e)}" aria-label="프사 ${escapeHtml(e)}">${escapeHtml(e)}</button>
        `).join("")}
      </div>
      ${photo ? `<p class="hint">지금은 사진이 있어서 카드에는 사진이 보여요. 이모지는 채팅 말풍선에 계속 쓰입니다.</p>` : ""}
    </div>

    <div class="set-block">
      <label class="set-title" for="prof-slot">선호 집필 시간대</label>
      <select id="prof-slot" class="w-full">
        <option value="">정해두지 않음</option>
        ${WRITING_SLOTS.filter(s => s.id).map(s => `
          <option value="${s.id}"${s.id === curSlot ? " selected" : ""}>${s.label}</option>
        `).join("")}
      </select>
      <p class="hint">카드에 🕐 아이콘과 함께 표시돼요. 안 정하면 표시되지 않아요.</p>
      <p class="hint">종일반 · 심야반 · 새벽반 · 오전반 · 아무때나 · 스불재 중에서 골라요.</p>
    </div>

    <div class="set-block">
      <div class="set-title">카드 강조색</div>
      <div class="accent-swatches" id="prof-accent" role="group" aria-label="강조색 선택">
        <button type="button" class="accent-swatch accent-none${curAccent ? "" : " selected"}"
                data-accent="" aria-label="강조색 없음">✕</button>
        ${ACCENT_PRESETS.map(c => `
          <button type="button" class="accent-swatch${c === curAccent ? " selected" : ""}"
                  data-accent="${c}" style="--sw:${c}" aria-label="강조색 ${c}"></button>
        `).join("")}
      </div>
      <p class="hint">내 카드 왼쪽에 얇은 띠로 들어가요. 여러 명일 때 내 카드를 빨리 찾을 수 있어요.</p>
    </div>
  `;

  bindProfilePanel();
}

function bindProfilePanel() {
  /* ---- 사진 ---- */
  const photoBtn = document.getElementById("prof-photo-btn");
  const photoInput = document.getElementById("prof-photo-input");
  const photoClear = document.getElementById("prof-photo-clear");
  const photoPrev = document.getElementById("prof-photo-preview");
  const photoHint = document.getElementById("prof-photo-hint");

  if (photoBtn && photoInput) {
    photoBtn.onclick = () => photoInput.click();

    photoInput.onchange = async () => {
      const file = photoInput.files?.[0];
      photoInput.value = "";           // 같은 파일을 다시 골라도 change가 뜨게
      if (!file) return;

      photoBtn.disabled = true;
      const prevLabel = photoBtn.textContent;
      photoBtn.textContent = "줄이는 중…";

      try {
        const dataUrl = await fileToSquareDataUrl(file);
        await saveMyProfile({ photo: dataUrl });

        if (photoPrev) {
          photoPrev.classList.add("has-photo");
          photoPrev.innerHTML = "";
          const img = document.createElement("img");
          img.src = dataUrl;
          img.alt = "";
          photoPrev.appendChild(img);
        }
        photoClear?.classList.remove("hidden");
        if (photoHint) {
          photoHint.textContent =
            `사진이 이모지 대신 카드에 표시돼요. (${Math.round(dataUrl.length / 1024)}KB)`;
        }
        window.rerenderUserCards?.();
      } catch (e) {
        alert(e?.message || "사진을 올리지 못했어요.");
      } finally {
        photoBtn.disabled = false;
        photoBtn.textContent = prevLabel;
      }
    };
  }

  if (photoClear) {
    photoClear.onclick = async () => {
      await saveMyProfile({ photo: "" });
      if (photoPrev) {
        photoPrev.classList.remove("has-photo");
        photoPrev.innerHTML = `<span>${escapeHtml(
          (window._myProfile?.emojiLocked && window._myProfile?.emoji) || myEmoji
        )}</span>`;
      }
      photoClear.classList.add("hidden");
      if (photoHint) {
        photoHint.textContent =
          "정사각형으로 잘라 128px로 줄여서 저장해요. 사진이 없으면 아래 이모지를 써요.";
      }
      window.rerenderUserCards?.();
    };
  }

  /* ---- 이모지 ---- */
  const lock = document.getElementById("prof-emoji-lock");
  const picker = document.getElementById("prof-emoji-picker");
  const preview = document.getElementById("prof-emoji-preview");
  const hint = document.getElementById("prof-emoji-hint");

  if (lock) {
    lock.onchange = async () => {
      const on = lock.checked;
      picker?.classList.toggle("hidden", !on);

      if (on) {
        const chosen = preview?.textContent?.trim() || myEmoji;
        await saveMyProfile({ emojiLocked: true, emoji: chosen });
        applyMyEmoji(chosen);
        if (hint) hint.textContent = "고른 이모지가 계속 유지돼요.";
      } else {
        await saveMyProfile({ emojiLocked: false });
        const daily = window.getDailyEmoji?.(myNick) || myEmoji;
        applyMyEmoji(daily);
        if (preview) preview.textContent = daily;
        if (hint) hint.textContent = `매일 새 프사를 받아요. 오늘은 ${daily} 예요.`;
        document.querySelectorAll(".emoji-pick").forEach(b => {
          b.classList.toggle("selected", b.dataset.emoji === daily);
        });
      }
    };
  }

  document.querySelectorAll(".emoji-pick").forEach(btn => {
    btn.onclick = async () => {
      const e = btn.dataset.emoji;
      document.querySelectorAll(".emoji-pick").forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
      if (preview) preview.textContent = e;

      await saveMyProfile({ emojiLocked: true, emoji: e });
      if (lock) lock.checked = true;
      applyMyEmoji(e);
      if (hint) hint.textContent = "고른 이모지가 계속 유지돼요.";
    };
  });

  const slot = document.getElementById("prof-slot");
  if (slot) {
    slot.onchange = () => saveMyProfile({ writingSlot: slot.value });
  }

  document.querySelectorAll(".accent-swatch").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".accent-swatch").forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
      saveMyProfile({ accent: sanitizeAccent(btn.dataset.accent) });
    };
  });
}

window.renderProfilePanel = renderProfilePanel;

/**
 * 설정 모달을 열고 곧바로 프로필 탭으로 이동.
 * 내 카드의 ✏️ 버튼과, 필요하면 다른 곳에서도 호출할 수 있게 노출합니다.
 */
function openProfileEditor() {
  if (!myNick) {
    alert("입장 후에 프로필을 설정할 수 있어요.");
    return;
  }
  window.openSettings?.();
  window.openTab?.("profile");
}
window.openProfileEditor = openProfileEditor;

/**
 * 카드는 status가 바뀔 때마다 통째로 다시 그려지므로
 * 버튼마다 리스너를 다는 대신 컨테이너에 위임합니다.
 */
function bindCardEditDelegate() {
  const host = document.getElementById("user-cards");
  if (!host || host._editDelegateBound) return;
  host._editDelegateBound = true;

  host.addEventListener("click", (e) => {
    const btn = e.target?.closest?.("[data-edit-profile]");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    openProfileEditor();
  });
}
window.bindCardEditDelegate = bindCardEditDelegate;


/* =====================================================================
   [4] 기존 함수에 훅 연결
   ---------------------------------------------------------------------
   기존 파일을 크게 고치는 대신, 이미 정의된 함수를 감싸는 방식으로
   진입점을 추가합니다. (로드 순서상 여기가 마지막이라 안전)
   ===================================================================== */
(function installHooks() {

  // 설정 모달 탭 전환 시 프로필 패널 렌더
  const _openTab = window.openTab;
  if (typeof _openTab === "function" && !_openTab.__profilePatched) {
    const wrapped = function (name) {
      _openTab.apply(this, arguments);
      if (name === "profile") renderProfilePanel();
    };
    wrapped.__profilePatched = true;
    window.openTab = wrapped;
  }

  // 입장 완료 후 프로필 로드
  const _join = window.join;
  if (typeof _join === "function" && !_join.__profilePatched) {
    const wrapped = async function () {
      await _join.apply(this, arguments);
      if (myNick) {
        try { await afterJoinLoadProfile(); } catch (e) { console.warn("[afterJoinLoadProfile]", e); }
      }
    };
    wrapped.__profilePatched = true;
    window.join = wrapped;
  }

  // init 시 접힘 상태 복원 + 바인딩
  const _init = window.init;
  if (typeof _init === "function" && !_init.__profilePatched) {
    const wrapped = function () {
      _init.apply(this, arguments);
      try { bindChatCollapse(); } catch (e) { console.warn("[bindChatCollapse]", e); }
      try { applySavedChatCollapsed(); } catch (e) { console.warn("[applySavedChatCollapsed]", e); }
      try { bindCardEditDelegate(); } catch (e) { console.warn("[bindCardEditDelegate]", e); }
      try { bindPanelCollapse(); } catch (e) { console.warn("[bindPanelCollapse]", e); }
    };
    wrapped.__profilePatched = true;
    window.init = wrapped;
  }

  // 퇴장 시 프로필 구독 해제
  const _leave = window.leaveRoom;
  if (typeof _leave === "function" && !_leave.__profilePatched) {
    const wrapped = async function () {
      try { _profilesRef?.off(); } catch (e) {}
      _profilesRef = null;
      window._myProfile = null;
      return _leave.apply(this, arguments);
    };
    wrapped.__profilePatched = true;
    window.leaveRoom = wrapped;
  }

  // 접힌 상태에서 새 메시지 → 레일 배지
  const _render = window.renderChatMessage;
  if (typeof _render === "function" && !_render.__profilePatched) {
    const wrapped = function (box, data, key) {
      const r = _render.apply(this, arguments);
      try {
        if (data && data.type !== "system" && data.user !== myNick) {
          noteChatMessageWhileCollapsed();
        }
      } catch (e) {}
      return r;
    };
    wrapped.__profilePatched = true;
    window.renderChatMessage = wrapped;
  }
})();

/**
 * status 리스너를 다시 태우지 않고 카드만 다시 그리기.
 * script_realtime.js가 분리·노출한 renderUserCards를 캐시된 status로 호출합니다.
 */
window.rerenderUserCards = function () {
  try {
    if (window._statusCache) window.renderUserCards?.(window._statusCache);
  } catch (e) {}
};

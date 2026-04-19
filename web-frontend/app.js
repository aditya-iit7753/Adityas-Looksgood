function normalizeApiBase(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

const PUBLIC_API_DEFAULTS = [
  "https://looksgood-api-production.up.railway.app/api",
  "https://looksgood-api-production.up.railway.app",
];

function getRuntimeApiCandidates() {
  const runtimeConfig = window.LOOKSGOOD_CONFIG || {};
  const configuredUrl = normalizeApiBase(runtimeConfig.apiUrl || "");
  const { hostname, origin } = window.location;
  const candidates = [];
  if (configuredUrl) candidates.push(configuredUrl);
  candidates.push(...PUBLIC_API_DEFAULTS);

  if (hostname === "localhost" || hostname === "127.0.0.1") {
    candidates.push("http://127.0.0.1:8100/api", "http://127.0.0.1:8100");
  }
  if (hostname === "looksgoods.com" || hostname === "www.looksgoods.com") {
    candidates.push("https://api.looksgoods.com/api", "https://api.looksgoods.com");
  }
  candidates.push(`${origin.replace(/\/+$/, "")}/api`, origin.replace(/\/+$/, ""));

  return [...new Set(candidates.map(normalizeApiBase).filter(Boolean))];
}

function getRuntimeApiBase() {
  const candidates = getRuntimeApiCandidates();
  return candidates[0] || "";
}

const state = {
  mode: "login",
  token: localStorage.getItem("lg_token") || "",
  api: normalizeApiBase(localStorage.getItem("lg_api")) || getRuntimeApiBase(),
  apiFallbacks: [],
  currentView: "feed",
  reelFilter: "all",
  reelItems: [],
  reelIndex: -1,
};

state.apiFallbacks = getRuntimeApiCandidates().filter((item) => item !== state.api);
if (!state.api && state.apiFallbacks.length) {
  state.api = state.apiFallbacks[0];
  state.apiFallbacks = state.apiFallbacks.slice(1);
}

const el = (id) => document.getElementById(id);

const authSection = el("authSection");
const appSection = el("appSection");
const statusChip = el("statusChip");
const connectionChip = el("connectionChip");
const apiHeadline = el("apiHeadline");
const apiHeadlineSub = el("apiHeadlineSub");
const connectionApiValue = el("connectionApiValue");
const connectionStateValue = el("connectionStateValue");
const connectionMessageValue = el("connectionMessageValue");
const frontendUrlValue = el("frontendUrlValue");
const sessionStateValue = el("sessionStateValue");
const loginTab = el("loginTab");
const signupTab = el("signupTab");
const authBtn = el("authBtn");
const forgotBtn = el("forgotBtn");
const emailInput = el("emailInput");
const passwordInput = el("passwordInput");
const confirmInput = el("confirmInput");
const confirmLabel = el("confirmLabel");
const apiInput = el("apiInput");
const listTitle = el("listTitle");
const listRoot = el("listRoot");
const storiesList = el("storiesList");
const meetupsList = el("meetupsList");
const reelFiltersWrap = el("reelFiltersWrap");
const loadReelsBtn = el("loadReelsBtn");
const filterChips = Array.from(document.querySelectorAll(".filter-chip"));
const reelModal = el("reelModal");
const reelModalBackdrop = el("reelModalBackdrop");
const reelModalDialog = reelModal.querySelector(".reel-modal-dialog");
const reelModalClose = el("reelModalClose");
const reelModalVideo = el("reelModalVideo");
const reelModalMeta = el("reelModalMeta");
const reelModalStats = el("reelModalStats");
const reelModalLikeBtn = el("reelModalLikeBtn");
const reelModalCommentBtn = el("reelModalCommentBtn");
const reelModalShareBtn = el("reelModalShareBtn");
const reelCommentsList = el("reelCommentsList");
const reelCommentInput = el("reelCommentInput");
const reelCommentSendBtn = el("reelCommentSendBtn");
const reelCounter = el("reelCounter");
const reelPrevBtn = el("reelPrevBtn");
const reelNextBtn = el("reelNextBtn");
const meetupTitleInput = el("meetupTitleInput");
const meetupDescriptionInput = el("meetupDescriptionInput");
const meetupScheduleInput = el("meetupScheduleInput");
let reelTouchStartY = null;
let reelWheelLock = false;
let reelChromeTimer = null;
let reelCommentsRequestSeq = 0;
let reelLastTapTs = 0;

apiInput.value = state.api;
frontendUrlValue.textContent = `${window.location.origin.replace(/\/+$/, "")}/`;

function showMessage(msg) {
  alert(msg);
}

function setConnectionState(kind, message, baseUrl = state.api) {
  const normalized = String(kind || "checking").toLowerCase();
  const label = normalized === "live" ? "API Live" : normalized === "offline" ? "API Offline" : "Checking";
  connectionApiValue.textContent = baseUrl || "No API configured";
  connectionStateValue.textContent = label;
  connectionMessageValue.textContent = message || "Waiting for first check.";
  apiHeadline.textContent = label;
  apiHeadlineSub.textContent = message || "Waiting for API activity.";
  connectionChip.textContent = label;
  connectionChip.className = `chip ${normalized === "offline" ? "chip-danger" : normalized === "live" ? "" : "chip-muted"}`.trim();
}

function saveAuthToken(token) {
  state.token = token || "";
  if (state.token) localStorage.setItem("lg_token", state.token);
  else localStorage.removeItem("lg_token");
  refreshAuthUI();
}

function refreshAuthUI() {
  const loggedIn = !!state.token;
  authSection.classList.toggle("hidden", loggedIn);
  appSection.classList.toggle("hidden", !loggedIn);
  statusChip.textContent = loggedIn ? "Logged In" : "Not Logged In";
  sessionStateValue.textContent = loggedIn ? "Authenticated" : "Guest";
}

function setMode(mode) {
  state.mode = mode;
  const signup = mode === "signup";
  loginTab.classList.toggle("active", !signup);
  signupTab.classList.toggle("active", signup);
  authBtn.textContent = signup ? "Create Account" : "Login";
  confirmInput.classList.toggle("hidden", !signup);
  confirmLabel.classList.toggle("hidden", !signup);
}

function setView(view) {
  state.currentView = view;
  reelFiltersWrap.classList.toggle("hidden", view !== "reels");
  if (view !== "reels" && !reelModal.classList.contains("hidden")) {
    closeReelPlayer();
  }
}

function setActiveFilterChip() {
  filterChips.forEach((chip) => {
    chip.classList.toggle("active", chip.dataset.filter === state.reelFilter);
  });
}

async function api(path, options = {}) {
  const candidates = [...new Set([state.api, ...state.apiFallbacks, ...getRuntimeApiCandidates()].map(normalizeApiBase).filter(Boolean))];
  let lastError = new Error("API request failed");

  for (const base of candidates) {
    try {
      const res = await fetch(`${base}${path}`, {
        ...options,
        headers: {
          ...(options.headers || {}),
          ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
        },
      });

      if (!res.ok) {
        let msg = `${res.status}`;
        try {
          const body = await res.json();
          msg = body.detail || body.error || JSON.stringify(body);
        } catch (_) {}

        const retryable = [404, 502, 503, 504].includes(res.status);
        lastError = new Error(msg);
        if (retryable) {
          setConnectionState("checking", `Retrying after ${res.status} from ${base}`, base);
          continue;
        }
        throw lastError;
      }

      state.api = base;
      state.apiFallbacks = candidates.filter((item) => item !== base);
      localStorage.setItem("lg_api", state.api);
      apiInput.value = state.api;
      setConnectionState("live", `Connected through ${base}`, base);

      try {
        return await res.json();
      } catch (_) {
        return null;
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err || "API request failed"));
      setConnectionState("offline", lastError.message || "Could not reach the API", base);
    }
  }

  throw lastError;
}

async function runHealthCheck() {
  const candidates = [...new Set([state.api, ...state.apiFallbacks, ...getRuntimeApiCandidates()].map(normalizeApiBase).filter(Boolean))];
  for (const base of candidates) {
    try {
      const res = await fetch(`${base}/health`);
      if (!res.ok) continue;
      state.api = base;
      state.apiFallbacks = candidates.filter((item) => item !== base);
      localStorage.setItem("lg_api", state.api);
      apiInput.value = state.api;
      setConnectionState("live", `Health check passed for ${base}`, base);
      return true;
    } catch (_) {}
  }
  setConnectionState("offline", "Health check failed for all configured API targets.");
  return false;
}

async function refreshSession() {
  if (!state.token) {
    refreshAuthUI();
    return false;
  }
  try {
    await api("/auth/me");
    refreshAuthUI();
    return true;
  } catch (_) {
    return false;
  }
}

async function renderStories() {
  try {
    const stories = await api("/stories");
    storiesList.innerHTML = "";
    (stories || []).forEach((s) => {
      const chip = document.createElement("button");
      chip.className = "story-chip";
      chip.textContent = `@${s.user}`;
      chip.onclick = () => window.open(s.media_url, "_blank");
      storiesList.appendChild(chip);
    });
  } catch (_) {}
}

function isLikelyReel(item) {
  if (!item || item.sponsored) return false;
  const media = String(item.video_url || item.media_url || "").toLowerCase();
  return media.includes(".mp4") || media.includes("/video") || media.includes("cloudinary.com");
}

function matchesReelFilter(item, filter) {
  if (filter === "all") return true;
  const text = `${item?.caption || ""} ${item?.user || ""}`.toLowerCase();
  if (text.includes(filter)) return true;
  if (filter === "party") return /party|night|club|glam/.test(text);
  return false;
}

function getMediaUrl(item) {
  return item?.video_url || item?.media_url || "";
}

function setModalChromeVisible(visible) {
  reelModalDialog.classList.toggle("chrome-hidden", !visible);
}

function scheduleChromeAutoHide() {
  if (reelChromeTimer) clearTimeout(reelChromeTimer);
  if (reelModal.classList.contains("hidden") || reelModalVideo.paused) return;
  reelChromeTimer = setTimeout(() => {
    setModalChromeVisible(false);
  }, 1800);
}

function revealModalChrome() {
  setModalChromeVisible(true);
  scheduleChromeAutoHide();
}

function renderReelComments(comments) {
  const items = Array.isArray(comments) ? comments : [];
  if (!items.length) {
    reelCommentsList.innerHTML = `<div class="reel-comment-item">No comments yet.</div>`;
    return;
  }
  reelCommentsList.innerHTML = items
    .slice(0, 40)
    .map((c) => `<div class="reel-comment-item"><strong>@${c.user || "user"}</strong> ${c.content || ""}</div>`)
    .join("");
}

async function loadCurrentReelComments() {
  const item = getCurrentReelItem();
  if (!item) {
    reelCommentsList.innerHTML = "";
    return;
  }
  const reqId = ++reelCommentsRequestSeq;
  reelCommentsList.innerHTML = `<div class="reel-comment-item">Loading comments...</div>`;
  try {
    const comments = await api(`/social/posts/${item.id}/comments`);
    if (reqId !== reelCommentsRequestSeq) return;
    renderReelComments(comments);
  } catch (e) {
    if (reqId !== reelCommentsRequestSeq) return;
    reelCommentsList.innerHTML = `<div class="reel-comment-item">${e.message || "Could not load comments."}</div>`;
  }
}

function closeReelPlayer() {
  reelModal.classList.add("hidden");
  reelModalVideo.pause();
  reelModalVideo.removeAttribute("src");
  reelModalVideo.dataset.src = "";
  reelModalVideo.load();
  reelModalMeta.textContent = "";
  reelModalStats.textContent = "Likes: 0 | Comments: 0 | Shares: 0";
  reelCommentsList.innerHTML = "";
  reelCommentInput.value = "";
  reelCounter.textContent = "0 / 0";
  reelModalLikeBtn.textContent = "Like";
  setModalChromeVisible(true);
  if (reelChromeTimer) clearTimeout(reelChromeTimer);
  state.reelIndex = -1;
}

function getCurrentReelItem() {
  if (state.reelIndex < 0 || state.reelIndex >= state.reelItems.length) return null;
  return state.reelItems[state.reelIndex];
}

function updateCurrentReelItem(patch) {
  const item = getCurrentReelItem();
  if (!item) return;
  Object.assign(item, patch || {});
}

function syncReelPlayer(options = {}) {
  const reloadMedia = options.reloadMedia !== false;
  const loadComments = options.loadComments !== false;
  if (state.reelIndex < 0 || state.reelIndex >= state.reelItems.length) {
    closeReelPlayer();
    return;
  }
  const item = state.reelItems[state.reelIndex];
  const mediaUrl = getMediaUrl(item);
  if (reloadMedia || reelModalVideo.dataset.src !== mediaUrl) {
    reelModalVideo.src = mediaUrl;
    reelModalVideo.dataset.src = mediaUrl;
  }
  reelModalMeta.textContent = `@${item.user || "creator"} - ${item.caption || "No caption"}`;
  reelModalStats.textContent = `Likes: ${item.likes_count || 0} | Comments: ${item.comments_count || 0} | Shares: ${item.shares_count || 0}`;
  reelModalLikeBtn.textContent = item.liked_by_me ? "Unlike" : "Like";
  reelCounter.textContent = `${state.reelIndex + 1} / ${state.reelItems.length}`;
  if (loadComments) {
    loadCurrentReelComments();
  }
  revealModalChrome();
  reelModalVideo.play().catch(() => {});
}

function openReelPlayerById(postId) {
  const idx = state.reelItems.findIndex((item) => String(item.id) === String(postId));
  if (idx < 0) return;
  state.reelIndex = idx;
  reelModal.classList.remove("hidden");
  syncReelPlayer({ reloadMedia: true, loadComments: true });
}

function renderPosts(items, options = {}) {
  const reelMode = Boolean(options.reelMode);
  const reloadFn = options.reload || loadFeed;
  listRoot.innerHTML = "";
  (items || []).forEach((item) => {
    const mediaUrl = getMediaUrl(item);
    const previewMarkup =
      reelMode && mediaUrl
        ? `<div class="reel-preview-wrap"><video class="reel-preview" preload="metadata" muted playsinline src="${mediaUrl}"></video></div>`
        : "";
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <strong>@${item.user || item.brand || "user"}</strong>
      <div>${item.caption || ""}</div>
      ${previewMarkup}
      <div class="meta">${mediaUrl || "no media"}</div>
      <div class="meta">Likes: ${item.likes_count || 0} | Comments: ${item.comments_count || 0} | Shares: ${item.shares_count || 0}</div>
      <div class="actions">
        ${item.sponsored ? "" : `<button class="btn btn-grey like-btn">Like</button>`}
        ${item.sponsored ? "" : `<button class="btn btn-grey comment-btn">Comment</button>`}
        ${item.sponsored ? "" : `<button class="btn btn-grey share-btn">Share</button>`}
        ${item.sponsored || item.is_me ? "" : `<button class="btn btn-sky follow-btn">${item.is_following ? "Following" : "Follow"}</button>`}
        ${item.sponsored || !reelMode ? "" : `<button class="btn btn-grey watch-btn">Watch</button>`}
        ${item.sponsored || !reelMode ? "" : `<button class="btn btn-sky remix-btn">Make Reel</button>`}
      </div>
    `;

    const likeBtn = div.querySelector(".like-btn");
    if (likeBtn) {
      likeBtn.onclick = async () => {
        try {
          if (item.liked_by_me) await api(`/social/posts/${item.id}/like`, { method: "DELETE" });
          else await api(`/social/posts/${item.id}/like`, { method: "POST" });
          await reloadFn();
        } catch (e) {
          showMessage(e.message);
        }
      };
    }

    const commentBtn = div.querySelector(".comment-btn");
    if (commentBtn) {
      commentBtn.onclick = async () => {
        const content = prompt("Write comment");
        if (!content) return;
        try {
          await api(`/social/posts/${item.id}/comments`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content }),
          });
          await reloadFn();
        } catch (e) {
          showMessage(e.message);
        }
      };
    }

    const shareBtn = div.querySelector(".share-btn");
    if (shareBtn) {
      shareBtn.onclick = async () => {
        try {
          await api(`/social/posts/${item.id}/share`, { method: "POST" });
          showMessage(`Share link copied:\n${item.media_url || item.video_url || ""}`);
          await reloadFn();
        } catch (e) {
          showMessage(e.message);
        }
      };
    }

    const followBtn = div.querySelector(".follow-btn");
    if (followBtn) {
      followBtn.onclick = async () => {
        try {
          if (item.is_following) await api(`/social/follow/${item.user_id}`, { method: "DELETE" });
          else await api(`/social/follow/${item.user_id}`, { method: "POST" });
          await reloadFn();
        } catch (e) {
          showMessage(e.message);
        }
      };
    }

    const remixBtn = div.querySelector(".remix-btn");
    if (remixBtn) {
      remixBtn.onclick = () => {
        const captionStart = item.caption ? `${item.caption} - ` : "";
        el("captionInput").value = `Reel remix from @${item.user}: ${captionStart}`;
        el("captionInput").focus();
        window.scrollTo({ top: 0, behavior: "smooth" });
        showMessage("Reel caption prepared. Upload your image and click Post Reel to create your reel.");
      };
    }

    const previewVideo = div.querySelector(".reel-preview");
    const watchBtn = div.querySelector(".watch-btn");
    const openPlayer = () => openReelPlayerById(item.id);
    if (previewVideo) {
      previewVideo.onclick = openPlayer;
    }
    if (watchBtn) {
      watchBtn.onclick = openPlayer;
    }

    listRoot.appendChild(div);
  });
}

async function loadFeed() {
  setView("feed");
  listTitle.textContent = "Feed";
  try {
    let data;
    try {
      data = await api("/feed/ai");
    } catch (_) {
      data = await api("/feed");
    }
    renderPosts(data, { reload: loadFeed });
    await renderStories();
  } catch (e) {
    showMessage(e.message);
  }
}

async function loadReels() {
  setView("reels");
  listTitle.textContent = `Reels - ${state.reelFilter[0].toUpperCase()}${state.reelFilter.slice(1)}`;
  try {
    let data;
    try {
      data = await api("/feed/ai");
    } catch (_) {
      data = await api("/feed");
    }
    const reels = (data || [])
      .filter(isLikelyReel)
      .filter((item) => matchesReelFilter(item, state.reelFilter))
      .filter((item) => Boolean(getMediaUrl(item)));
    state.reelItems = reels;
    renderPosts(reels, { reelMode: true, reload: loadReels });
    if (reels.length === 0) {
      listRoot.innerHTML = `<div class="item"><strong>No reels for this filter yet.</strong><div class="meta">Try switching filter or create a new reel.</div></div>`;
    }
    await renderStories();
  } catch (e) {
    showMessage(e.message);
  }
}

async function loadUsers() {
  setView("feed");
  listTitle.textContent = "Discover Users";
  listRoot.innerHTML = "";
  try {
    const users = await api("/social/users");
    users.forEach((u) => {
      const div = document.createElement("div");
      div.className = "item";
      div.innerHTML = `
        <strong>@${u.username}</strong>
        <div class="meta">${u.email}</div>
        <div class="meta">${u.posts_count} posts - ${u.followers} followers - ${u.following} following</div>
        <div>${u.bio || ""}</div>
        <div class="actions">
          ${u.is_me ? "" : `<button class="btn btn-sky">${u.is_following ? "Following" : "Follow"}</button>`}
        </div>
      `;
      const btn = div.querySelector(".btn");
      if (btn) {
        btn.onclick = async () => {
          try {
            if (u.is_following) await api(`/social/follow/${u.id}`, { method: "DELETE" });
            else await api(`/social/follow/${u.id}`, { method: "POST" });
            await loadUsers();
          } catch (e) {
            showMessage(e.message);
          }
        };
      }
      listRoot.appendChild(div);
    });
  } catch (e) {
    showMessage(e.message);
  }
}

async function loadProfile() {
  setView("feed");
  listTitle.textContent = "My Profile";
  listRoot.innerHTML = "";
  try {
    const data = await api("/social/profile/me");
    const profile = data.profile || {};
    el("displayNameInput").value = profile.username || "";
    el("bioInput").value = profile.bio || "";
    const top = document.createElement("div");
    top.className = "item";
    top.innerHTML = `
      <strong>@${profile.username || ""}</strong>
      <div class="meta">${profile.email || ""}</div>
      <div class="meta">${profile.posts_count || 0} posts - ${profile.followers || 0} followers - ${profile.following || 0} following</div>
      <div>${profile.bio || ""}</div>
      ${profile.avatar_url ? `<div class="meta"><a href="${profile.avatar_url}" target="_blank">Avatar</a></div>` : ""}
    `;
    listRoot.appendChild(top);
    renderPosts(data.posts || [], { reload: loadProfile });
  } catch (e) {
    showMessage(e.message);
  }
}

async function loadNotifications() {
  setView("feed");
  listTitle.textContent = "Notifications";
  listRoot.innerHTML = "";
  try {
    const items = await api("/social/notifications");
    await api("/social/notifications/read-all", { method: "POST" });
    items.forEach((n) => {
      const div = document.createElement("div");
      div.className = "item";
      div.innerHTML = `
        <strong>${(n.type || "activity").toUpperCase()}</strong>
        <div>${n.message}</div>
        <div class="meta">${n.created_at || ""}</div>
      `;
      listRoot.appendChild(div);
    });
  } catch (e) {
    showMessage(e.message);
  }
}

function renderMeetups(items) {
  meetupsList.innerHTML = "";
  if (!Array.isArray(items) || !items.length) {
    meetupsList.innerHTML = `<div class="item"><strong>No meetups yet.</strong><div class="meta">Create one above to open a room from the web app.</div></div>`;
    return;
  }

  items.forEach((meetup) => {
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="meetup-head">
        <div>
          <strong>${meetup.title}</strong>
          <div class="meta">Host: @${meetup.host_name || "host"}</div>
          <div class="meta">${meetup.scheduled_at ? `Scheduled: ${new Date(meetup.scheduled_at).toLocaleString()}` : "Live anytime"}</div>
        </div>
        <div class="meetup-code">${meetup.room_code}</div>
      </div>
      <div>${meetup.description || "No description yet."}</div>
      <div class="actions">
        <button class="btn btn-sky join-btn">Join Room</button>
        ${meetup.is_host ? `<button class="btn btn-grey delete-btn">Delete</button>` : ""}
      </div>
    `;

    div.querySelector(".join-btn").onclick = () => {
      window.open(`https://meet.jit.si/${meetup.room_code}`, "_blank", "noopener,noreferrer");
    };

    const deleteBtn = div.querySelector(".delete-btn");
    if (deleteBtn) {
      deleteBtn.onclick = async () => {
        try {
          await api(`/social/meetups/${meetup.id}`, { method: "DELETE" });
          await loadMeetups();
        } catch (e) {
          showMessage(e.message);
        }
      };
    }

    meetupsList.appendChild(div);
  });
}

async function loadMeetups(options = {}) {
  const quiet = Boolean(options.quiet);
  try {
    const items = await api("/social/meetups");
    renderMeetups(items);
    if (!quiet) {
      listTitle.textContent = "Virtual Rooms";
      listRoot.innerHTML = `<div class="item"><strong>Virtual Rooms are live.</strong><div class="meta">Use the meetup board above to join or host rooms from the browser.</div></div>`;
    }
  } catch (e) {
    renderMeetups([]);
    if (!quiet) showMessage(e.message);
  }
}

async function createMeetup() {
  const title = meetupTitleInput.value.trim();
  if (!title) return showMessage("Meetup title is required");

  const scheduledAt = meetupScheduleInput.value ? new Date(meetupScheduleInput.value).toISOString() : null;
  try {
    await api("/social/meetups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        description: meetupDescriptionInput.value.trim(),
        scheduled_at: scheduledAt,
      }),
    });
    meetupTitleInput.value = "";
    meetupDescriptionInput.value = "";
    meetupScheduleInput.value = "";
    await loadMeetups();
    showMessage("Virtual meetup created");
  } catch (e) {
    showMessage(e.message);
  }
}

loginTab.onclick = () => setMode("login");
signupTab.onclick = () => setMode("signup");

authBtn.onclick = async () => {
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const confirm = confirmInput.value;
  if (!email || !password) return showMessage("Email and password required");
  if (state.mode === "signup" && password !== confirm) return showMessage("Passwords do not match");

  try {
    const endpoint = state.mode === "signup" ? "/auth/signup" : "/auth/login";
    const data = await api(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    saveAuthToken(data?.token || "");
    await loadFeed();
  } catch (e) {
    showMessage(e.message);
  }
};

forgotBtn.onclick = async () => {
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  if (!email || !password) return showMessage("Enter email and new password");
  try {
    await api("/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    showMessage("Password updated.");
  } catch (e) {
    showMessage(e.message);
  }
};

el("saveApiBtn").onclick = () => {
  state.api = normalizeApiBase(apiInput.value);
  state.apiFallbacks = getRuntimeApiCandidates().filter((item) => item !== state.api);
  localStorage.setItem("lg_api", state.api);
  runHealthCheck();
  showMessage("API saved");
};

el("checkApiBtn").onclick = runHealthCheck;
el("logoutBtn").onclick = () => saveAuthToken("");
el("loadFeedBtn").onclick = loadFeed;
loadReelsBtn.onclick = loadReels;
el("loadUsersBtn").onclick = loadUsers;
el("loadProfileBtn").onclick = loadProfile;
el("loadNotiBtn").onclick = loadNotifications;
el("loadMeetupsBtn").onclick = () => loadMeetups();
el("createMeetupBtn").onclick = createMeetup;
el("refreshMeetupsBtn").onclick = () => loadMeetups();
el("heroFeedBtn").onclick = loadFeed;
el("heroMeetupsBtn").onclick = () => loadMeetups();
el("refreshSessionBtn").onclick = refreshSession;
el("openFeedFromUtilityBtn").onclick = loadFeed;
el("openPrivacyBtn").onclick = () => window.open("./privacy.html", "_blank", "noopener,noreferrer");

filterChips.forEach((chip) => {
  chip.onclick = async () => {
    state.reelFilter = chip.dataset.filter || "all";
    setActiveFilterChip();
    if (state.currentView === "reels") {
      await loadReels();
    }
  };
});

reelModalClose.onclick = closeReelPlayer;
reelModalBackdrop.onclick = closeReelPlayer;
reelPrevBtn.onclick = () => {
  if (!state.reelItems.length) return;
  state.reelIndex = (state.reelIndex - 1 + state.reelItems.length) % state.reelItems.length;
  syncReelPlayer();
};
reelNextBtn.onclick = () => {
  if (!state.reelItems.length) return;
  state.reelIndex = (state.reelIndex + 1) % state.reelItems.length;
  syncReelPlayer();
};

reelModalVideo.addEventListener("ended", () => {
  if (!reelModal.classList.contains("hidden")) {
    reelNextBtn.click();
  }
});

reelModalVideo.addEventListener("play", () => {
  scheduleChromeAutoHide();
});

reelModalVideo.addEventListener("pause", () => {
  setModalChromeVisible(true);
  if (reelChromeTimer) clearTimeout(reelChromeTimer);
});

reelModalVideo.addEventListener("dblclick", () => {
  toggleCurrentReelLike();
  revealModalChrome();
});

reelModalVideo.addEventListener("touchstart", (event) => {
  reelTouchStartY = event.touches?.[0]?.clientY ?? null;
  revealModalChrome();
});

reelModalVideo.addEventListener("touchend", (event) => {
  if (reelTouchStartY == null) return;
  const endY = event.changedTouches?.[0]?.clientY ?? reelTouchStartY;
  const delta = reelTouchStartY - endY;
  reelTouchStartY = null;
  if (Math.abs(delta) < 30) {
    const now = Date.now();
    if (now - reelLastTapTs < 320) {
      toggleCurrentReelLike();
    }
    reelLastTapTs = now;
    return;
  }
  if (delta > 0) reelNextBtn.click();
  else reelPrevBtn.click();
});

reelModalDialog.addEventListener("mousemove", () => {
  if (reelModal.classList.contains("hidden")) return;
  revealModalChrome();
});

reelModalDialog.addEventListener("click", () => {
  if (reelModal.classList.contains("hidden")) return;
  revealModalChrome();
});

reelModal.addEventListener(
  "wheel",
  (event) => {
    if (reelModal.classList.contains("hidden")) return;
    revealModalChrome();
    if (reelWheelLock) return;
    reelWheelLock = true;
    setTimeout(() => {
      reelWheelLock = false;
    }, 220);
    if (event.deltaY > 0) reelNextBtn.click();
    else reelPrevBtn.click();
  },
  { passive: true }
);

document.addEventListener("keydown", (event) => {
  if (reelModal.classList.contains("hidden")) return;
  if (event.key === "Escape") closeReelPlayer();
  if (event.key === "ArrowRight") reelNextBtn.click();
  if (event.key === "ArrowLeft") reelPrevBtn.click();
  if (event.key === "ArrowDown") reelNextBtn.click();
  if (event.key === "ArrowUp") reelPrevBtn.click();
});

async function toggleCurrentReelLike() {
  const item = getCurrentReelItem();
  if (!item) return;
  try {
    if (item.liked_by_me) {
      await api(`/social/posts/${item.id}/like`, { method: "DELETE" });
      updateCurrentReelItem({
        liked_by_me: false,
        likes_count: Math.max((item.likes_count || 1) - 1, 0),
      });
    } else {
      await api(`/social/posts/${item.id}/like`, { method: "POST" });
      updateCurrentReelItem({
        liked_by_me: true,
        likes_count: (item.likes_count || 0) + 1,
      });
    }
    syncReelPlayer({ reloadMedia: false, loadComments: false });
  } catch (e) {
    showMessage(e.message);
  }
}

async function submitCurrentReelComment() {
  const item = getCurrentReelItem();
  if (!item) return;
  const content = reelCommentInput.value.trim();
  if (!content) return;
  try {
    await api(`/social/posts/${item.id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    reelCommentInput.value = "";
    updateCurrentReelItem({ comments_count: (item.comments_count || 0) + 1 });
    syncReelPlayer({ reloadMedia: false, loadComments: false });
    await loadCurrentReelComments();
  } catch (e) {
    showMessage(e.message);
  }
}

reelModalLikeBtn.onclick = toggleCurrentReelLike;

reelModalCommentBtn.onclick = async () => {
  reelCommentInput.focus();
};

reelModalShareBtn.onclick = async () => {
  const item = getCurrentReelItem();
  if (!item) return;
  const mediaUrl = getMediaUrl(item);
  try {
    await api(`/social/posts/${item.id}/share`, { method: "POST" });
    updateCurrentReelItem({ shares_count: (item.shares_count || 0) + 1 });
    if (navigator.clipboard && mediaUrl) {
      await navigator.clipboard.writeText(mediaUrl);
      showMessage("Reel link copied.");
      } else {
        showMessage(`Share link:\n${mediaUrl}`);
      }
      syncReelPlayer({ reloadMedia: false, loadComments: false });
    } catch (e) {
      showMessage(e.message);
    }
};

reelCommentSendBtn.onclick = submitCurrentReelComment;

reelCommentInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    submitCurrentReelComment();
  }
});

el("postBtn").onclick = async () => {
  const file = el("imageInput").files[0];
  const caption = el("captionInput").value || "";
  if (!file) return showMessage("Choose an image first");
  try {
    const fd = new FormData();
    fd.append("image", file);
    fd.append("caption", caption);
    await api("/video/publish", { method: "POST", body: fd });
    showMessage("Reel posted");
    await loadFeed();
  } catch (e) {
    showMessage(e.message);
  }
};

el("storyBtn").onclick = async () => {
  const file = el("imageInput").files[0];
  const caption = el("captionInput").value || "";
  if (!file) return showMessage("Choose an image first");
  try {
    const fd = new FormData();
    fd.append("image", file);
    fd.append("caption", caption);
    await api("/stories/create", { method: "POST", body: fd });
    showMessage("Story created");
    await renderStories();
  } catch (e) {
    showMessage(e.message);
  }
};

el("saveProfileBtn").onclick = async () => {
  const fd = new FormData();
  fd.append("display_name", el("displayNameInput").value || "");
  fd.append("bio", el("bioInput").value || "");
  const avatar = el("avatarInput").files[0];
  if (avatar) fd.append("avatar", avatar);
  try {
    await api("/social/profile/update", { method: "POST", body: fd });
    showMessage("Profile saved");
    await loadProfile();
  } catch (e) {
    showMessage(e.message);
  }
};

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}

setMode("login");
setActiveFilterChip();
setView("feed");
refreshAuthUI();
runHealthCheck();
if (state.token) {
  refreshSession().then((ok) => {
    if (ok) loadFeed();
    else loadMeetups({ quiet: true });
  });
} else {
  loadMeetups({ quiet: true });
}




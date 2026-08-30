const API_PATH = "/api/agent/graph";
const ARCHIVE_START = "2026-08-27T10:50:00.000Z";
const state = {
  graph: null,
  events: [],
  cursor: -1,
  selectedDid: null,
  selectedJob: null,
  playing: false,
  playFrame: null,
  live: false,
  liveTimer: null,
  liveQuery: null,
  positions: new Map(),
};

const ui = {
  form: document.getElementById("range-form"),
  room: document.getElementById("room"),
  from: document.getElementById("from"),
  to: document.getElementById("to"),
  load: document.getElementById("load"),
  play: document.getElementById("play"),
  busiest: document.getElementById("busiest"),
  live: document.getElementById("live"),
  status: document.getElementById("status"),
  field: document.getElementById("field"),
  emptyField: document.getElementById("empty-field"),
  density: document.getElementById("density"),
  cursorTime: document.getElementById("cursor-time"),
  roomLabel: document.getElementById("room-label"),
  scrubber: document.getElementById("scrubber-range"),
  rangeStart: document.getElementById("range-start"),
  rangeEnd: document.getElementById("range-end"),
  sampling: document.getElementById("sampling-copy"),
  archiveStart: document.getElementById("archive-start"),
  captured: document.getElementById("captured"),
  missed: document.getElementById("missed"),
  agentCount: document.getElementById("agent-count"),
  selection: document.getElementById("selection"),
  eventCount: document.getElementById("event-count"),
  eventList: document.getElementById("event-list"),
};

function localValue(iso) {
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function isoValue(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Choose valid ISO date-times.");
  return date.toISOString();
}

function shortTime(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().replace("T", " ").replace(".000Z", "Z") : "—";
}

function setStatus(message, kind = "") {
  ui.status.textContent = message;
  ui.status.dataset.state = kind;
}

function clearSvg() {
  while (ui.field.firstChild) ui.field.removeChild(ui.field.firstChild);
}

function clearDensity() {
  while (ui.density.firstChild) ui.density.removeChild(ui.density.firstChild);
}

function svgElement(name, attributes = {}) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  return element;
}

function stableNumber(text) {
  let hash = 2166136261;
  for (const char of String(text)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) / 4294967296;
}

// The field is a relay, so it reads left to right in the order work actually moves: a job is
// posted, claimed, delivered, then vouched for. An agent stands in the lane of the stage it
// performs most often, which makes the horizontal axis carry meaning. Agents that only talk
// stand in a band underneath, because they are not on the board at all.
const LANES = [
  { stage: "job", label: "POSTED", x: 132 },
  { stage: "claim", label: "CLAIMED", x: 377 },
  { stage: "deliver", label: "DELIVERED", x: 622 },
  { stage: "attest", label: "ATTESTED", x: 867 },
];
const FIELD = { width: 1000, height: 560, top: 104, bottom: 436, chatY: 505 };

function dominantStage(node) {
  const counts = node?.counts || {};
  let best = null;
  let bestCount = 0;
  for (const lane of LANES) {
    const count = Number(counts[lane.stage]) || 0;
    if (count > bestCount) { best = lane.stage; bestCount = count; }
  }
  return best || "chat";
}

// Ring size is derived from the most crowded lane, so it shrinks only when it must and two
// rings can never overlap. The layout this replaces scaled the opposite way — it reduced the
// radius as agents were added, so the busiest and most interesting rooms drew the tightest and
// least readable field. Measured at 38 agents it produced a 2.3px centre distance between
// 36px rings and used 11.9% of the canvas.
function layoutFor(nodes) {
  const lanes = new Map(LANES.map((lane) => [lane.stage, []]));
  const chat = [];
  for (const node of nodes) (lanes.get(dominantStage(node)) || chat).push(node);
  for (const list of [...lanes.values(), chat]) {
    list.sort((left, right) => Date.parse(left.firstSeen) - Date.parse(right.firstSeen));
  }
  const tallest = Math.max(1, ...[...lanes.values()].map((list) => list.length));
  const span = FIELD.bottom - FIELD.top;
  const columns = tallest > 11 ? 2 : 1;
  const rowsNeeded = Math.ceil(tallest / columns);
  const pitch = rowsNeeded > 1 ? span / (rowsNeeded - 1) : span;
  // Radius must satisfy the crowded lane AND the talking band. A room like did-key-method has
  // almost no board activity, so nearly every agent lands in the band; sizing only from the
  // lanes let 43 rings overlap there. Both constraints, or the fix only moves the bug.
  const chatRows = Math.max(1, Math.ceil(chat.length / Math.max(1, Math.floor(FIELD.width / 34))));
  const chatPerRow = Math.ceil(chat.length / chatRows) || 1;
  const chatPitch = FIELD.width / (chatPerRow + 1);
  const radius = Math.max(6.5, Math.min(19, pitch / 2 - 3, chatPitch / 2 - 3));
  const positions = new Map();
  for (const lane of LANES) {
    const list = lanes.get(lane.stage) || [];
    const rows = Math.ceil(list.length / columns);
    list.forEach((node, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const y = rows > 1 ? FIELD.top + (row / (rows - 1)) * span : FIELD.top + span / 2;
      positions.set(node.did, {
        x: lane.x + (column - (columns - 1) / 2) * (radius * 2.4),
        y,
        lane: lane.stage,
      });
    });
  }
  chat.forEach((node, index) => {
    const row = Math.floor(index / chatPerRow);
    const column = index % chatPerRow;
    positions.set(node.did, {
      x: chatPitch * (column + 1),
      y: FIELD.chatY + (row - (chatRows - 1) / 2) * (radius * 2.4),
      lane: "chat",
    });
  });
  return { positions, radius, chatCount: chat.length, chatRows };
}

// A trace bends toward the direction of travel so overlapping relays stay tellable apart and
// the eye follows work rightward instead of through a hairball of straight chords.
function tracePath(from, to) {
  const midX = (from.x + to.x) / 2;
  const lift = Math.min(70, Math.max(18, Math.abs(to.x - from.x) * .22));
  const bend = to.x >= from.x ? -lift : lift;
  return `M ${from.x} ${from.y} C ${midX} ${from.y + bend} ${midX} ${to.y + bend} ${to.x} ${to.y}`;
}

function visibleEvents() {
  return state.cursor < 0 ? [] : state.events.slice(0, state.cursor + 1);
}

function groupedByJob(events) {
  const groups = new Map();
  for (const event of events) {
    if (!event.job) continue;
    if (!groups.has(event.job)) groups.set(event.job, []);
    groups.get(event.job).push(event);
  }
  return groups;
}

function selectDid(did) {
  state.selectedDid = state.selectedDid === did ? null : did;
  state.selectedJob = null;
  render();
}

function selectJob(job) {
  state.selectedJob = state.selectedJob === job ? null : job;
  state.selectedDid = null;
  render();
}

function drawLaneGuides() {
  const guides = svgElement("g", { class: "lane-guides", "aria-hidden": "true" });
  for (const lane of LANES) {
    guides.appendChild(svgElement("line", {
      class: "lane-rule", x1: lane.x, y1: FIELD.top - 34, x2: lane.x, y2: FIELD.bottom + 26,
    }));
    const label = svgElement("text", { class: "lane-label", x: lane.x, y: FIELD.top - 48 });
    label.textContent = lane.label;
    guides.appendChild(label);
  }
  return guides;
}

// The Technocore mark is a ring with exactly one part absent. Drawing the node as a dashed
// circle with a single gap reproduces that at any size, and rotating the gap toward the agent's
// last collaborator turns the notch into information rather than decoration.
function ringMark(radius, notchAngle) {
  const circumference = 2 * Math.PI * radius;
  const gap = circumference * .17;
  const ring = svgElement("circle", {
    class: "node-ring", r: radius,
    "stroke-dasharray": `${(circumference - gap).toFixed(2)} ${gap.toFixed(2)}`,
    "stroke-dashoffset": (circumference * .25 - gap / 2).toFixed(2),
    transform: `rotate(${(notchAngle * 180 / Math.PI).toFixed(1)})`,
  });
  return ring;
}

function drawField() {
  clearSvg();
  const graph = state.graph;
  const visible = visibleEvents();
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const layout = layoutFor(nodes);
  state.positions = layout.positions;
  state.radius = layout.radius;
  // With a selection active the rest of the field recedes hard. Fifty-four traces at reading
  // weight is a hairball; the same fifty-four behind one lit chain is context.
  if (state.selectedJob) ui.field.setAttribute("data-focus", "job");
  else if (state.selectedDid) ui.field.setAttribute("data-focus", "did");
  else ui.field.removeAttribute("data-focus");
  ui.field.appendChild(drawLaneGuides());

  const edges = svgElement("g", { class: "traces" });
  const motion = svgElement("g", { class: "motion", "aria-hidden": "true" });
  const groups = groupedByJob(visible);
  const partnerByDid = new Map();
  const newest = visible.at(-1);
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  for (const [job, events] of groups) {
    const selected = state.selectedJob === job;
    for (let index = 1; index < events.length; index += 1) {
      const previousEvent = events[index - 1];
      const currentEvent = events[index];
      if (previousEvent.did !== currentEvent.did) {
        partnerByDid.set(previousEvent.did, currentEvent.did);
        partnerByDid.set(currentEvent.did, previousEvent.did);
      }
      const previous = state.positions.get(previousEvent.did);
      const current = state.positions.get(currentEvent.did);
      if (!previous || !current || previousEvent.did === currentEvent.did) continue;
      const d = tracePath(previous, current);
      const path = svgElement("path", {
        d, class: `trace stage-${currentEvent.stage}`, "data-job": job,
        "data-selected": String(selected), tabindex: "0", role: "button",
      });
      path.setAttribute("aria-label", `Relay trace for ${job}`);
      path.addEventListener("click", () => selectJob(job));
      path.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectJob(job); } });
      edges.appendChild(path);

      // A pulse travels the trace so the baton is visibly handed over. Only the newest handover
      // and the selected job animate: a hundred simultaneous animations would cost far more
      // than they communicate, and would drown the one event that just happened.
      const isNewest = newest && currentEvent.seq === newest.seq && currentEvent.did === newest.did;
      if (!reduceMotion && (selected || isNewest)) {
        const pulse = svgElement("circle", { class: `pulse stage-${currentEvent.stage}`, r: Math.max(3, layout.radius * .3) });
        const move = svgElement("animateMotion", {
          dur: isNewest ? "1.1s" : "2.4s", repeatCount: "indefinite", path: d, rotate: "auto",
        });
        pulse.appendChild(move);
        motion.appendChild(pulse);
      }
    }
  }
  ui.field.appendChild(edges);
  ui.field.appendChild(motion);

  const nodeLayer = svgElement("g", { class: "nodes" });
  const cursorTime = visible.length ? Date.parse(visible.at(-1).t) : -Infinity;
  const activity = new Map();
  for (const event of visible) activity.set(event.did, (activity.get(event.did) || 0) + 1);
  const busiest = Math.max(1, ...activity.values());

  for (const [index, node] of nodes.entries()) {
    const first = Date.parse(node.firstSeen);
    if (!Number.isFinite(first) || first > cursorTime) continue;
    const point = state.positions.get(node.did);
    if (!point) continue;
    const partner = partnerByDid.get(node.did);
    const partnerPoint = partner ? state.positions.get(partner) : null;
    const notchAngle = partnerPoint
      ? Math.atan2(partnerPoint.y - point.y, partnerPoint.x - point.x)
      : stableNumber(node.did + index) * Math.PI * 2;
    const share = (activity.get(node.did) || 0) / busiest;
    const group = svgElement("g", {
      class: `node lane-${point.lane}`, transform: `translate(${point.x} ${point.y})`,
      "data-selected": String(state.selectedDid === node.did),
      "data-active": String(newest?.did === node.did),
      tabindex: "0", role: "button",
    });
    // A filled core sized by share of visible activity: the busiest agent reads loudest without
    // moving, so the ring positions stay stable while the field is scrubbed.
    const core = svgElement("circle", { class: "node-core", r: (layout.radius * (.18 + share * .42)).toFixed(2) });
    const title = svgElement("title");
    const roles = LANES.filter((lane) => Number(node.counts?.[lane.stage]) > 0)
      .map((lane) => `${node.counts[lane.stage]} ${lane.label.toLowerCase()}`);
    title.textContent = `${node.short} · ${roles.join(", ") || "talking only"}${partner ? ` · last relayed with ${partner.slice(-12)}` : ""}`;
    group.setAttribute("aria-label", title.textContent);
    group.append(ringMark(layout.radius, notchAngle), core, title);
    group.addEventListener("click", () => selectDid(node.did));
    group.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectDid(node.did); } });
    nodeLayer.appendChild(group);
  }
  ui.field.appendChild(nodeLayer);

  if (layout.chatCount) {
    const lastRowY = FIELD.chatY + ((layout.chatRows - 1) / 2) * (layout.radius * 2.4);
    const label = svgElement("text", { class: "lane-label chat-label", x: FIELD.width / 2, y: lastRowY + layout.radius + 22 });
    label.textContent = "TALKING · NOT ON THE BOARD";
    ui.field.appendChild(label);
  }
  ui.emptyField.hidden = Boolean(visible.length);
}

function renderSelection() {
  const visible = visibleEvents();
  if (state.selectedDid) {
    const node = state.graph?.nodes?.find((entry) => entry.did === state.selectedDid);
    const history = visible.filter((event) => event.did === state.selectedDid);
    ui.selection.replaceChildren();
    const heading = document.createElement("p");
    heading.textContent = node ? `${node.short} · ${history.length} visible events` : state.selectedDid;
    const list = document.createElement("dl");
    for (const event of history.slice(-12).reverse()) {
      const dt = document.createElement("dt"); dt.textContent = `${event.stage.toUpperCase()} · seq ${event.seq}`;
      const dd = document.createElement("dd"); dd.textContent = `${shortTime(event.t)}${event.job ? ` · ${event.job}` : ""}`;
      list.append(dt, dd);
    }
    ui.selection.append(heading, list);
    return;
  }
  if (state.selectedJob) {
    const chain = visible.filter((event) => event.job === state.selectedJob);
    ui.selection.replaceChildren();
    const heading = document.createElement("p"); heading.textContent = `${state.selectedJob} · ${chain.length} visible relay events`;
    const list = document.createElement("dl");
    for (const event of chain.slice(-14).reverse()) {
      const dt = document.createElement("dt"); dt.textContent = `${event.stage.toUpperCase()} · seq ${event.seq}`;
      const dd = document.createElement("dd"); dd.textContent = `${event.did.slice(-12)} · ${shortTime(event.t)}`;
      list.append(dt, dd);
    }
    ui.selection.append(heading, list);
    return;
  }
  ui.selection.innerHTML = "<p>Click a ring, trace or event to inspect it.</p>";
}

function renderEvents() {
  const visible = visibleEvents().slice(-80).reverse();
  ui.eventList.replaceChildren();
  ui.eventCount.textContent = `${visibleEvents().length}/${state.events.length}`;
  for (const event of visible) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "event-row";
    button.setAttribute("aria-current", String(state.events.indexOf(event) === state.cursor));
    const time = document.createElement("span"); time.className = "event-time"; time.textContent = shortTime(event.t);
    const seq = document.createElement("span"); seq.className = "event-seq"; seq.textContent = `seq ${event.seq}`;
    const job = document.createElement("span"); job.className = "event-job";
    const kind = document.createElement("span"); kind.className = `event-kind stage-${event.stage}`; kind.textContent = event.stage.toUpperCase();
    job.append(kind, document.createTextNode(event.job || event.did.slice(-12)));
    button.append(time, seq, job);
    button.addEventListener("click", () => {
      state.cursor = state.events.indexOf(event);
      state.selectedDid = event.did;
      state.selectedJob = event.job;
      render();
    });
    item.appendChild(button);
    ui.eventList.appendChild(item);
  }
}

function render() {
  const graph = state.graph;
  const visible = visibleEvents();
  const current = visible.at(-1);
  ui.cursorTime.textContent = current ? shortTime(current.t) : "—";
  ui.roomLabel.textContent = graph?.room || "—";
  ui.rangeStart.textContent = graph?.window?.from ? shortTime(graph.window.from) : "—";
  ui.rangeEnd.textContent = graph?.window?.to ? shortTime(graph.window.to) : "—";
  ui.scrubber.max = String(Math.max(0, state.events.length - 1));
  ui.scrubber.value = String(Math.max(0, state.cursor));
  ui.scrubber.disabled = !state.events.length;
  ui.play.disabled = !state.events.length;
  ui.busiest.disabled = !state.events.length;
  // Keep LIVE available after an empty but valid window; a later poll may be the first
  // observation that contains an event.
  ui.live.disabled = !graph;
  const sampling = graph?.sampling || {};
  ui.sampling.textContent = sampling.complete
    ? "This bounded archive window was read completely from indexed buckets. It is still an archive sample, not protocol backfill."
    : "This is a bounded archive sample; the estimate below counts indexed rows not read because of window or bucket limits. It cannot recover events never captured.";
  ui.archiveStart.textContent = graph?.window?.archiveStartedAt ? shortTime(graph.window.archiveStartedAt) : "—";
  ui.captured.textContent = Number.isFinite(sampling.captured) ? String(sampling.captured) : "—";
  ui.missed.textContent = sampling.missedEstimate === null || sampling.missedEstimate === undefined ? "unknown" : String(sampling.missedEstimate);
  ui.agentCount.textContent = Array.isArray(graph?.nodes) ? String(graph.nodes.length) : "—";
  renderDensity();
  drawField();
  renderSelection();
  renderEvents();
}

function stopPlayback() {
  state.playing = false;
  if (state.playFrame !== null) cancelAnimationFrame(state.playFrame);
  state.playFrame = null;
  ui.play.textContent = "Play 40s";
}

function renderDensity() {
  clearDensity();
  const events = state.events;
  if (!events.length) {
    ui.density.setAttribute("aria-label", "Captured event density: no rows");
    return;
  }
  const width = 720;
  const height = 40;
  const bins = Math.min(120, Math.max(24, Math.ceil(events.length / 4)));
  const counts = Array.from({ length: bins }, () => 0);
  const start = Date.parse(state.graph?.window?.from || events[0].t);
  const end = Date.parse(state.graph?.window?.to || events.at(-1).t);
  const span = Math.max(1, end - start);
  for (const event of events) {
    const time = Date.parse(event.t);
    const index = Math.max(0, Math.min(bins - 1, Math.floor(((time - start) / span) * bins)));
    counts[index] += 1;
  }
  const maximum = Math.max(...counts, 1);
  const points = counts.map((count, index) => {
    const x = (index / Math.max(1, bins - 1)) * width;
    const y = height - 4 - (count / maximum) * (height - 8);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
  ui.density.appendChild(svgElement("line", { x1: 0, y1: height - 2, x2: width, y2: height - 2, class: "density-baseline" }));
  ui.density.appendChild(svgElement("polyline", { points, class: "density-line" }));
  const cursorEvent = events[Math.max(0, Math.min(events.length - 1, state.cursor))];
  const cursorTime = Date.parse(cursorEvent?.t || events.at(-1).t);
  const cursorX = Math.max(0, Math.min(width, ((cursorTime - start) / span) * width));
  ui.density.appendChild(svgElement("line", { x1: cursorX, y1: 0, x2: cursorX, y2: height, class: "density-marker" }));
  ui.density.setAttribute("aria-label", `Captured event density: ${events.length} rows across ${bins} time bins`);
}

function densityCursor(event) {
  const rect = ui.density.getBoundingClientRect();
  if (!rect.width || !state.events.length) return;
  const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  state.cursor = Math.round(ratio * (state.events.length - 1));
  stopPlayback();
  stopLivePolling();
  render();
}

function stopLivePolling() {
  state.live = false;
  if (state.liveTimer !== null) window.clearTimeout(state.liveTimer);
  state.liveTimer = null;
}

function scheduleLivePolling() {
  if (!state.live) return;
  if (state.liveTimer !== null) window.clearTimeout(state.liveTimer);
  state.liveTimer = window.setTimeout(async () => {
    state.liveTimer = null;
    if (!state.live) return;
    await fetchGraph({ quiet: true });
    scheduleLivePolling();
  }, 30_000);
}

function play() {
  if (!state.events.length) return;
  if (state.playing) { stopPlayback(); return; }
  state.playing = true;
  ui.play.textContent = "Pause";
  const start = performance.now();
  const initial = state.cursor >= 0 && state.cursor < state.events.length - 1 ? state.cursor : 0;
  const span = Math.max(1, state.events.length - 1 - initial);
  const frame = (now) => {
    if (!state.playing) return;
    const progress = Math.min(1, (now - start) / 40_000);
    state.cursor = Math.min(state.events.length - 1, initial + Math.floor(span * progress));
    render();
    if (progress >= 1) { stopPlayback(); return; }
    state.playFrame = requestAnimationFrame(frame);
  };
  state.playFrame = requestAnimationFrame(frame);
}

function jumpBusiest() {
  stopLivePolling();
  const counts = new Map();
  for (const event of state.events) {
    const minute = event.t.slice(0, 16);
    counts.set(minute, (counts.get(minute) || 0) + 1);
  }
  const busiest = [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
  if (!busiest) return;
  const index = state.events.findIndex((event) => event.t.startsWith(busiest));
  state.cursor = index < 0 ? state.events.length - 1 : index;
  state.selectedDid = null;
  state.selectedJob = null;
  render();
  setStatus(`Busiest minute: ${busiest}Z · ${counts.get(busiest)} captured rows.`);
}

async function fetchGraph({ quiet = false } = {}) {
  if (!quiet) {
    ui.load.disabled = true;
    setStatus("Reading one bounded graph document…");
  }
  const previousGraph = state.graph;
  const previousEvents = state.events;
  const previousDid = state.selectedDid;
  const previousJob = state.selectedJob;
  try {
    const requested = quiet && state.liveQuery
      ? { ...state.liveQuery, to: new Date().toISOString() }
      : { room: ui.room.value, from: isoValue(ui.from.value), to: isoValue(ui.to.value) };
    const from = typeof requested.from === "string" ? isoValue(requested.from) : requested.from;
    const to = typeof requested.to === "string" ? isoValue(requested.to) : requested.to;
    if (new Date(from) > new Date(to)) throw new Error("From must be before or equal to To.");
    const query = { room: requested.room, from, to };
    state.liveQuery = query;
    const params = new URLSearchParams(query);
    const response = await fetch(`${API_PATH}?${params.toString()}`, { headers: { Accept: "application/json" } });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || `Graph endpoint returned HTTP ${response.status}.`);
    if (!payload || !Array.isArray(payload.events) || !Array.isArray(payload.nodes)) throw new Error("Graph response is malformed.");
    state.graph = payload;
    state.events = payload.events;
    state.cursor = state.events.length - 1;
    state.selectedDid = previousDid && payload.nodes.some((node) => node.did === previousDid) ? previousDid : null;
    state.selectedJob = previousJob && state.events.some((event) => event.job === previousJob) ? previousJob : null;
    render();
    const sample = payload.sampling || {};
    setStatus(`${payload.room}: ${sample.captured ?? 0} captured events · ${sample.complete ? "complete indexed window" : "sampled/clamped window"} · built in ${sample.buildMs ?? "—"} ms${quiet ? " · live head refreshed" : ""}.`);
  } catch (error) {
    if (!quiet) {
      state.graph = null;
      state.events = [];
      state.cursor = -1;
      state.selectedDid = null;
      state.selectedJob = null;
      render();
    } else {
      state.graph = previousGraph;
      state.events = previousEvents;
      state.selectedDid = previousDid;
      state.selectedJob = previousJob;
    }
    setStatus(`${quiet ? "Live refresh failed: " : ""}${String(error?.message || error)}`, "error");
  } finally {
    if (!quiet) ui.load.disabled = false;
  }
}

async function loadGraph(event) {
  event?.preventDefault();
  stopLivePolling();
  stopPlayback();
  await fetchGraph();
}

async function activateLive() {
  stopLivePolling();
  stopPlayback();
  state.live = true;
  state.selectedDid = null;
  state.selectedJob = null;
  await fetchGraph({ quiet: true });
  if (state.live && ui.status.dataset.state !== "error") setStatus(`${ui.status.textContent} · polling live head every 30s.`);
  scheduleLivePolling();
}

ui.form.addEventListener("submit", loadGraph);
ui.play.addEventListener("click", play);
ui.busiest.addEventListener("click", jumpBusiest);
ui.live.addEventListener("click", activateLive);
ui.scrubber.addEventListener("input", () => { stopPlayback(); stopLivePolling(); state.cursor = Number(ui.scrubber.value); render(); });
ui.density.addEventListener("click", densityCursor);
window.addEventListener("pagehide", () => { stopLivePolling(); stopPlayback(); });

ui.from.value = localValue(ARCHIVE_START);
ui.to.value = localValue(new Date().toISOString());
fetchGraph();

const DEFAULT_FILES = {
  "main.py": "",
};

const FILES_KEY = "shpyide-files";
const ACTIVE_KEY = "shpyide-active";

const codeArea = document.getElementById("code");
const fileTabs = document.getElementById("file-tabs");
const consoleShell = document.getElementById("console");
const consoleOutput = document.getElementById("console-output");
const consoleInputForm = document.getElementById("console-input-form");
const consolePrompt = document.getElementById("console-prompt");
const consoleInput = document.getElementById("console-input");
const consoleSubmit = document.getElementById("console-submit");
const toast = document.getElementById("toast");
const canvas = document.getElementById("turtle-canvas");
const turtlePanel = document.getElementById("turtle-panel");
const fileDialog = document.getElementById("file-dialog");
const fileDialogTitle = document.getElementById("file-dialog-title");
const fileDialogMessage = document.getElementById("file-dialog-message");
const fileDialogInput = document.getElementById("file-dialog-input");
const fileDialogConfirm = document.getElementById("file-dialog-confirm");
const fileDialogCancel = document.getElementById("file-dialog-cancel");

const state = {
  files: {},
  active: "main.py",
  pyodide: null,
  runtimeReady: false,
  shareLoaded: false,
};

let fileDialogMode = null;
let editor = null;
let isRunning = false;
const runtimeFiles = new Set();
const consoleTextDecoder = new TextDecoder();

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2600);
}

function base64UrlEncode(bytes) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(text) {
  const normalized = text.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function fallbackSerializeShare(files, active) {
  const payload = JSON.stringify({ files, active });
  return btoa(unescape(encodeURIComponent(payload)));
}

async function serializeShare(files, active) {
  const payload = JSON.stringify({ files, active });
  if (window.CompressionStream) {
    try {
      const encoded = new TextEncoder().encode(payload);
      const compressedStream = new Blob([encoded]).stream().pipeThrough(new CompressionStream("gzip"));
      const buffer = await new Response(compressedStream).arrayBuffer();
      const compressed = new Uint8Array(buffer);
      return `v1:${base64UrlEncode(compressed)}`;
    } catch (error) {
      console.warn("Failed to compress share payload", error);
    }
  }
  return fallbackSerializeShare(files, active);
}

async function deserializeShare(hash) {
  try {
    if (hash.startsWith("v1:")) {
      const payload = hash.slice(3);
      if (!window.DecompressionStream) {
        console.warn("DecompressionStream unavailable");
        return null;
      }
      const compressed = base64UrlDecode(payload);
      const decompressedStream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip"));
      const buffer = await new Response(decompressedStream).arrayBuffer();
      const decoded = new TextDecoder().decode(buffer);
      return JSON.parse(decoded);
    }
    const decoded = decodeURIComponent(escape(atob(hash)));
    return JSON.parse(decoded);
  } catch (error) {
    console.warn("Bad share hash", error);
    return null;
  }
}

function persistState() {
  localStorage.setItem(FILES_KEY, JSON.stringify(state.files));
  localStorage.setItem(ACTIVE_KEY, state.active);
}

async function loadState() {
  const hash = window.location.hash.replace("#", "");
  if (hash) {
    const shared = await deserializeShare(hash);
    if (shared?.files) {
      state.files = shared.files;
      state.active = shared.active || Object.keys(shared.files)[0] || "main.py";
      state.shareLoaded = true;
      return;
    }
  }

  const storedFiles = localStorage.getItem(FILES_KEY);
  const storedActive = localStorage.getItem(ACTIVE_KEY);
  if (storedFiles) {
    state.files = JSON.parse(storedFiles);
    state.active = storedActive || Object.keys(state.files)[0] || "main.py";
  } else {
    state.files = { ...DEFAULT_FILES };
    state.active = "main.py";
  }
}

function renderFileTabs() {
  fileTabs.innerHTML = "";
  Object.keys(state.files).forEach((filename) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "file-tab";
    tab.textContent = filename;
    if (filename === state.active) {
      tab.classList.add("active");
    }
    tab.addEventListener("click", () => switchFile(filename));
    fileTabs.appendChild(tab);
  });
}

function saveActiveFileContent() {
  if (!state.active || !editor) return;
  state.files[state.active] = editor.getValue();
  persistState();
}

function switchFile(filename) {
  if (!Object.hasOwn(state.files, filename)) return;
  if (filename !== state.active) {
    saveActiveFileContent();
  }
  state.active = filename;
  if (editor) {
    editor.setValue(state.files[filename]);
  } else {
    codeArea.value = state.files[filename];
  }
  renderFileTabs();
  persistState();
  updateTurtleVisibility();
}

function updateActiveFileContent() {
  if (!state.active || !editor) return;
  state.files[state.active] = editor.getValue();
  persistState();
  updateTurtleVisibility();
}

function openFileDialog(mode) {
  fileDialogMode = mode;
  fileDialogMessage.classList.add("hidden");
  fileDialogInput.classList.remove("hidden");

  if (mode === "add") {
    fileDialogTitle.textContent = "Создать файл";
    fileDialogInput.placeholder = "helpers.py";
    fileDialogInput.value = "";
  } else if (mode === "rename") {
    fileDialogTitle.textContent = "Переименовать файл";
    fileDialogInput.value = state.active;
    fileDialogInput.select();
  } else if (mode === "delete") {
    fileDialogTitle.textContent = "Удалить файл";
    fileDialogInput.classList.add("hidden");
    fileDialogMessage.textContent = `Удалить ${state.active}?`;
    fileDialogMessage.classList.remove("hidden");
  } else if (mode === "share") {
    fileDialogTitle.textContent = "Ссылка для обмена";
    fileDialogInput.value = "";
    fileDialogInput.readOnly = true;
    fileDialogInput.classList.remove("hidden");
  }

  fileDialog.classList.remove("hidden");
  if (mode === "add" || mode === "rename" || mode === "share") {
    fileDialogInput.focus();
  }
}

function closeFileDialog() {
  fileDialog.classList.add("hidden");
  fileDialogInput.readOnly = false;
  fileDialogInput.value = "";
  fileDialogMode = null;
}

function confirmFileDialog() {
  const name = fileDialogInput.value.trim();

  if (fileDialogMode === "add") {
    if (!name) return;
    if (!name.endsWith(".py")) {
      showToast("Файл должен быть .py");
      return;
    }
    if (state.files[name]) {
      showToast("Файл уже существует");
      return;
    }
    state.files[name] = "";
    switchFile(name);
  }

  if (fileDialogMode === "rename") {
    saveActiveFileContent();
    if (!name || name === state.active) {
      closeFileDialog();
      return;
    }
    if (!name.endsWith(".py")) {
      showToast("Файл должен быть .py");
      return;
    }
    if (state.files[name]) {
      showToast("Файл уже существует");
      return;
    }
    const content = state.files[state.active];
    delete state.files[state.active];
    state.files[name] = content;
    state.active = name;
    switchFile(name);
  }

  if (fileDialogMode === "delete") {
    if (Object.keys(state.files).length === 1) {
      showToast("Нужен хотя бы один файл");
      closeFileDialog();
      return;
    }
    delete state.files[state.active];
    state.active = Object.keys(state.files)[0];
    switchFile(state.active);
  }

  closeFileDialog();
}

function addFile() {
  openFileDialog("add");
}

function renameFile() {
  openFileDialog("rename");
}

function deleteFile() {
  openFileDialog("delete");
}

function downloadActiveFile() {
  saveActiveFileContent();
  const content = state.files[state.active] ?? "";
  const blob = new Blob([content], { type: "text/x-python" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = state.active;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function usesTurtle() {
  return Object.values(state.files).some((content) =>
    /\bfrom\s+turtle\b|\bimport\s+turtle\b|\bturtle\./.test(content),
  );
}

function updateTurtleVisibility() {
  turtlePanel.classList.toggle("hidden", !usesTurtle());
}

function createTurtleRuntime() {
  const ctx = canvas.getContext("2d");
  const runtime = {
    x: canvas.width / 2,
    y: canvas.height / 2,
    angle: 0,
    pen: true,
    color: "#111827",
    fillColor: "#111827",
    width: 2,
    speed: 6,
    filling: false,
  };

  function reset() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    runtime.x = canvas.width / 2;
    runtime.y = canvas.height / 2;
    runtime.angle = 0;
    runtime.pen = true;
    runtime.color = "#111827";
    runtime.fillColor = "#111827";
    runtime.width = 2;
    runtime.speed = 6;
    runtime.filling = false;
  }

  function lineTo(x, y) {
    if (!runtime.pen) {
      if (runtime.filling) {
        ctx.lineTo(x, y);
      }
      runtime.x = x;
      runtime.y = y;
      return;
    }
    if (!runtime.filling) {
      ctx.beginPath();
      ctx.moveTo(runtime.x, runtime.y);
      ctx.lineTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
    ctx.strokeStyle = runtime.color;
    ctx.lineWidth = runtime.width;
    ctx.stroke();
    runtime.x = x;
    runtime.y = y;
  }

  function move(distance) {
    const radians = (runtime.angle * Math.PI) / 180;
    const x = runtime.x + Math.cos(radians) * distance;
    const y = runtime.y + Math.sin(radians) * distance;
    lineTo(x, y);
  }

  function circle(radius, extent = 360) {
    if (!radius) return;
    const heading = (runtime.angle * Math.PI) / 180;
    const leftOffsetAngle = heading - Math.PI / 2;
    const centerX = runtime.x + Math.cos(leftOffsetAngle) * radius;
    const centerY = runtime.y + Math.sin(leftOffsetAngle) * radius;
    const startAngle = Math.atan2(runtime.y - centerY, runtime.x - centerX);
    const extentRadians = (extent * Math.PI) / 180;
    const endAngle = startAngle + extentRadians;
    const anticlockwise = radius < 0;
    if (!runtime.filling) {
      ctx.beginPath();
    }
    ctx.strokeStyle = runtime.color;
    ctx.lineWidth = runtime.width;
    ctx.arc(centerX, centerY, Math.abs(radius), startAngle, endAngle, anticlockwise);
    if (runtime.pen) {
      ctx.stroke();
    }
    runtime.x = centerX + Math.cos(endAngle) * Math.abs(radius);
    runtime.y = centerY + Math.sin(endAngle) * Math.abs(radius);
    runtime.angle = (runtime.angle + extent) % 360;
  }

  function write(text, font = "16px Arial") {
    ctx.fillStyle = runtime.color;
    ctx.font = font;
    ctx.fillText(text, runtime.x, runtime.y);
  }

  return {
    reset,
    forward(distance) {
      move(distance);
    },
    backward(distance) {
      move(-distance);
    },
    left(angle) {
      runtime.angle = (runtime.angle - angle) % 360;
    },
    right(angle) {
      runtime.angle = (runtime.angle + angle) % 360;
    },
    beginFill() {
      runtime.filling = true;
      ctx.beginPath();
      ctx.moveTo(runtime.x, runtime.y);
    },
    endFill() {
      if (!runtime.filling) return;
      runtime.filling = false;
      ctx.fillStyle = runtime.fillColor;
      ctx.closePath();
      ctx.fill();
    },
    penup() {
      runtime.pen = false;
    },
    pendown() {
      runtime.pen = true;
    },
    goto(x, y) {
      lineTo(x + canvas.width / 2, canvas.height / 2 - y);
    },
    setheading(angle) {
      runtime.angle = angle;
    },
    color(value) {
      runtime.color = value;
    },
    fillcolor(value) {
      runtime.fillColor = value;
    },
    width(value) {
      runtime.width = value;
    },
    speed(value) {
      runtime.speed = value;
    },
    clear() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    },
    dot(size = 6, color = runtime.color) {
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.arc(runtime.x, runtime.y, size / 2, 0, Math.PI * 2);
      ctx.fill();
    },
    circle,
    write,
    shape() {},
    setup(width, height) {
      canvas.width = width;
      canvas.height = height;
      reset();
    },
  };
}

const turtleRuntime = createTurtleRuntime();
window.TurtleRuntime = turtleRuntime;

const TURTLE_MODULE = `import js\n\n_runtime = js.TurtleRuntime\n\n\ndef setup(width=480, height=360):\n    _runtime.setup(width, height)\n\n\ndef forward(distance):\n    _runtime.forward(distance)\n\n\ndef backward(distance):\n    _runtime.backward(distance)\n\n\ndef left(angle):\n    _runtime.left(angle)\n\n\ndef right(angle):\n    _runtime.right(angle)\n\n\ndef begin_fill():\n    _runtime.beginFill()\n\n\ndef end_fill():\n    _runtime.endFill()\n\n\ndef penup():\n    _runtime.penup()\n\n\ndef pendown():\n    _runtime.pendown()\n\n\ndef goto(x, y):\n    _runtime.goto(x, y)\n\n\ndef setheading(angle):\n    _runtime.setheading(angle)\n\n\ndef color(value):\n    _runtime.color(value)\n\n\ndef fillcolor(value):\n    _runtime.fillcolor(value)\n\n\ndef width(value):\n    _runtime.width(value)\n\n\ndef speed(value):\n    _runtime.speed(value)\n\n\ndef clear():\n    _runtime.clear()\n\n\ndef circle(radius, extent=360):\n    _runtime.circle(radius, extent)\n\n\ndef dot(size=6, color=None):\n    if color is None:\n        _runtime.dot(size)\n    else:\n        _runtime.dot(size, color)\n\n\ndef write(text, font=(\"Arial\", 16, \"normal\")):\n    size = font[1] if len(font) > 1 else 16\n    family = font[0] if len(font) > 0 else \"Arial\"\n    _runtime.write(text, f\"{size}px {family}\")\n\n\ndef shape(value):\n    _runtime.shape()\n`;

function createConsoleController() {
  let awaitingInput = false;
  let inputResolver = null;

  function normalize(text) {
    return String(text ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  }

  function append(text, isError = false) {
    const normalizedText = normalize(text);
    if (isError && normalizedText.trim()) {
      consoleOutput.textContent += `Ошибка: ${normalizedText}`;
    } else {
      consoleOutput.textContent += normalizedText;
    }
    consoleShell.scrollTop = consoleShell.scrollHeight;
  }

  function setWaiting(active) {
    awaitingInput = active;
    consoleShell.classList.toggle("console--waiting", active);
    consoleInput.disabled = !active;
    consoleSubmit.disabled = !active;
    if (active) {
      consoleInput.focus();
    }
  }

  function clear() {
    consoleOutput.textContent = "";
  }

  function reset() {
    if (awaitingInput && inputResolver) {
      inputResolver("");
    }
    inputResolver = null;
    setWaiting(false);
  }

  function readLine() {
    if (!isRunning) {
      return "";
    }
    setWaiting(true);
    consoleInput.value = "";
    return new Promise((resolve) => {
      inputResolver = resolve;
    });
  }

  function submitInput() {
    if (!awaitingInput || !inputResolver) return;
    const response = consoleInput.value;
    append(`${response}\n`);
    const resolver = inputResolver;
    inputResolver = null;
    setWaiting(false);
    resolver(response);
  }

  function setPrompt(text) {
    consolePrompt.textContent = text || ">";
  }

  return {
    append,
    appendError(text) {
      append(text, true);
    },
    clear,
    reset,
    readLine,
    submitInput,
    setPrompt,
  };
}

const consoleController = createConsoleController();

async function handleRuntimeInput() {
  const line = await consoleController.readLine();
  return `${line}\n`;
}

function attachRuntimeIo(pyodide) {
  pyodide.setStdout({
    write: (buffer) => consoleController.append(consoleTextDecoder.decode(buffer)),
  });
  pyodide.setStderr({
    write: (buffer) => consoleController.appendError(consoleTextDecoder.decode(buffer)),
  });
  pyodide.setStdin({
    stdin: handleRuntimeInput,
    isatty: true,
  });
}

async function ensurePyodide() {
  if (state.pyodide) return state.pyodide;
  consoleController.clear();
  consoleController.append("Загрузка Python...\n");
  state.pyodide = await loadPyodide();
  attachRuntimeIo(state.pyodide);
  state.pyodide.FS.writeFile("turtle.py", TURTLE_MODULE);
  state.runtimeReady = true;
  consoleController.append("Python готов к работе.\n");
  return state.pyodide;
}

function syncRuntimeFiles(pyodide) {
  for (const filename of Array.from(runtimeFiles)) {
    if (!Object.hasOwn(state.files, filename)) {
      try {
        pyodide.FS.unlink(filename);
      } catch (error) {
        console.warn("Failed to remove runtime file", filename, error);
      }
      runtimeFiles.delete(filename);
    }
  }

  Object.entries(state.files).forEach(([name, content]) => {
    pyodide.FS.writeFile(name, content);
    runtimeFiles.add(name);
  });
}

function getMainFile() {
  return Object.hasOwn(state.files, "main.py") ? "main.py" : state.active;
}

function buildRunner(mainFile) {
  return `import runpy\nrunpy.run_path(${JSON.stringify(mainFile)})\n`;
}

function prepareRun() {
  saveActiveFileContent();
  consoleController.clear();
  consoleController.reset();
  isRunning = true;
  consoleController.setPrompt(">");
  const turtleNeeded = usesTurtle();
  turtlePanel.classList.toggle("hidden", !turtleNeeded);
  if (turtleNeeded) {
    turtleRuntime.reset();
  }
}

function finalizeRun() {
  isRunning = false;
  consoleController.reset();
}

async function runCode() {
  prepareRun();
  const pyodide = await ensurePyodide();
  syncRuntimeFiles(pyodide);

  const runner = buildRunner(getMainFile());

  try {
    await pyodide.runPythonAsync(runner);
  } catch (error) {
    consoleController.appendError(`\n${error}`);
  } finally {
    finalizeRun();
  }
}

async function shareProject() {
  saveActiveFileContent();
  const hash = await serializeShare(state.files, state.active);
  const url = `${window.location.origin}${window.location.pathname}#${hash}`;
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(url).then(() => {
      showToast("Ссылка скопирована!");
    });
  } else {
    openFileDialog("share");
    fileDialogInput.value = url;
    fileDialogInput.select();
  }
}

document.getElementById("add-file").addEventListener("click", addFile);
document.getElementById("rename-file").addEventListener("click", renameFile);
document.getElementById("delete-file").addEventListener("click", deleteFile);
document.getElementById("download-file").addEventListener("click", downloadActiveFile);
document.getElementById("run").addEventListener("click", runCode);
document.getElementById("share").addEventListener("click", shareProject);
fileDialogConfirm.addEventListener("click", confirmFileDialog);
fileDialogCancel.addEventListener("click", closeFileDialog);
consoleShell.addEventListener("click", () => consoleShell.focus());
consoleInputForm.addEventListener("submit", (event) => {
  event.preventDefault();
  consoleController.submitInput();
});
fileDialogInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  if (fileDialog.classList.contains("hidden")) return;
  if (fileDialogMode !== "add" && fileDialogMode !== "rename") return;
  event.preventDefault();
  confirmFileDialog();
});

async function init() {
  await loadState();
  editor = CodeMirror.fromTextArea(codeArea, {
    lineNumbers: true,
    mode: "python",
    lineWrapping: true,
    indentUnit: 4,
    tabSize: 4,
  });
  editor.on("change", updateActiveFileContent);
  renderFileTabs();
  switchFile(state.active);
  updateTurtleVisibility();
  consoleController.setPrompt(">");
  consoleController.reset();

  if (state.shareLoaded) {
    showToast("Проект загружен по ссылке");
  }
}

init();

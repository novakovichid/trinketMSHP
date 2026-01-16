const DEFAULT_FILES = {
  "main.py": `from turtle import *\n\nsetup(480, 360)\nspeed(6)\n\nfor i in range(36):\n    forward(120)\n    left(170)\n\npenup()\ngoto(-160, -140)\ncolor(\"#2563eb\")\nwrite(\"Trinket turtle in the browser!\", font=(\"Arial\", 14, \"normal\"))\n`,
  "utils.py": `def greet(name: str) -> str:\n    return f\"Привет, {name}!\"\n`,
  "app.py": `from utils import greet\n\nprint(greet(\"Trinket\"))\n`,
};

const FILES_KEY = "trinket-files";
const ACTIVE_KEY = "trinket-active";

const fileList = document.getElementById("file-list");
const codeArea = document.getElementById("code");
const activeFileLabel = document.getElementById("active-file");
const consoleOutput = document.getElementById("console");
const toast = document.getElementById("toast");
const canvas = document.getElementById("turtle-canvas");

const state = {
  files: {},
  active: "main.py",
  pyodide: null,
  runtimeReady: false,
  shareLoaded: false,
};

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2600);
}

function serializeShare(files, active) {
  const payload = JSON.stringify({ files, active });
  return btoa(unescape(encodeURIComponent(payload)));
}

function deserializeShare(hash) {
  try {
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

function loadState() {
  const hash = window.location.hash.replace("#", "");
  if (hash) {
    const shared = deserializeShare(hash);
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

function renderFileList() {
  fileList.innerHTML = "";
  Object.keys(state.files).forEach((filename) => {
    const item = document.createElement("li");
    item.textContent = filename;
    if (filename === state.active) {
      item.classList.add("active");
    }
    item.addEventListener("click", () => switchFile(filename));
    fileList.appendChild(item);
  });
}

function switchFile(filename) {
  if (!state.files[filename]) return;
  state.active = filename;
  activeFileLabel.textContent = filename;
  codeArea.value = state.files[filename];
  renderFileList();
  persistState();
}

function updateActiveFileContent() {
  if (!state.active) return;
  state.files[state.active] = codeArea.value;
  persistState();
}

function addFile() {
  const name = prompt("Имя файла (например, helpers.py)");
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

function renameFile() {
  const name = prompt("Новое имя файла", state.active);
  if (!name || name === state.active) return;
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
  switchFile(name);
}

function deleteFile() {
  if (Object.keys(state.files).length === 1) {
    showToast("Нужен хотя бы один файл");
    return;
  }
  if (!confirm(`Удалить ${state.active}?`)) return;
  delete state.files[state.active];
  state.active = Object.keys(state.files)[0];
  switchFile(state.active);
}

function createTurtleRuntime() {
  const ctx = canvas.getContext("2d");
  const runtime = {
    x: canvas.width / 2,
    y: canvas.height / 2,
    angle: 0,
    pen: true,
    color: "#111827",
    width: 2,
    speed: 6,
  };

  function reset() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    runtime.x = canvas.width / 2;
    runtime.y = canvas.height / 2;
    runtime.angle = 0;
    runtime.pen = true;
    runtime.color = "#111827";
    runtime.width = 2;
    runtime.speed = 6;
  }

  function lineTo(x, y) {
    if (!runtime.pen) {
      runtime.x = x;
      runtime.y = y;
      return;
    }
    ctx.beginPath();
    ctx.moveTo(runtime.x, runtime.y);
    ctx.lineTo(x, y);
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

  function circle(radius) {
    ctx.beginPath();
    ctx.strokeStyle = runtime.color;
    ctx.lineWidth = runtime.width;
    ctx.arc(runtime.x, runtime.y, radius, 0, Math.PI * 2);
    ctx.stroke();
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
    width(value) {
      runtime.width = value;
    },
    speed(value) {
      runtime.speed = value;
    },
    clear() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    },
    circle,
    write,
    setup(width, height) {
      canvas.width = width;
      canvas.height = height;
      reset();
    },
  };
}

const turtleRuntime = createTurtleRuntime();
window.TurtleRuntime = turtleRuntime;

const TURTLE_MODULE = `import js\n\n_runtime = js.TurtleRuntime\n\n\ndef setup(width=480, height=360):\n    _runtime.setup(width, height)\n\n\ndef forward(distance):\n    _runtime.forward(distance)\n\n\ndef backward(distance):\n    _runtime.backward(distance)\n\n\ndef left(angle):\n    _runtime.left(angle)\n\n\ndef right(angle):\n    _runtime.right(angle)\n\n\ndef penup():\n    _runtime.penup()\n\n\ndef pendown():\n    _runtime.pendown()\n\n\ndef goto(x, y):\n    _runtime.goto(x, y)\n\n\ndef setheading(angle):\n    _runtime.setheading(angle)\n\n\ndef color(value):\n    _runtime.color(value)\n\n\ndef width(value):\n    _runtime.width(value)\n\n\ndef speed(value):\n    _runtime.speed(value)\n\n\ndef clear():\n    _runtime.clear()\n\n\ndef circle(radius):\n    _runtime.circle(radius)\n\n\ndef write(text, font=(\"Arial\", 16, \"normal\")):\n    size = font[1] if len(font) > 1 else 16\n    family = font[0] if len(font) > 0 else \"Arial\"\n    _runtime.write(text, f\"{size}px {family}\")\n`;

async function ensurePyodide() {
  if (state.pyodide) return state.pyodide;
  consoleOutput.textContent = "Загрузка Python...";
  state.pyodide = await loadPyodide({
    stdout: (text) => appendConsole(text),
    stderr: (text) => appendConsole(text, true),
  });
  state.pyodide.FS.writeFile("turtle.py", TURTLE_MODULE);
  state.runtimeReady = true;
  appendConsole("Python готов к работе.\n");
  return state.pyodide;
}

function appendConsole(text, isError = false) {
  if (isError) {
    consoleOutput.textContent += `\nОшибка: ${text}`;
  } else {
    consoleOutput.textContent += text;
  }
}

async function runCode() {
  updateActiveFileContent();
  consoleOutput.textContent = "";
  turtleRuntime.reset();
  const pyodide = await ensurePyodide();
  Object.entries(state.files).forEach(([name, content]) => {
    pyodide.FS.writeFile(name, content);
  });

  const mainFile = state.files["main.py"] ? "main.py" : state.active;
  const runner = `import runpy\nrunpy.run_path('${mainFile}')\n`;

  try {
    await pyodide.runPythonAsync(runner);
  } catch (error) {
    appendConsole(`\n${error}` , true);
  }
}

function shareProject() {
  updateActiveFileContent();
  const hash = serializeShare(state.files, state.active);
  const url = `${window.location.origin}${window.location.pathname}#${hash}`;
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(url).then(() => {
      showToast("Ссылка скопирована!");
    });
  } else {
    prompt("Скопируйте ссылку:", url);
  }
}

codeArea.addEventListener("input", updateActiveFileContent);


document.getElementById("add-file").addEventListener("click", addFile);
document.getElementById("rename-file").addEventListener("click", renameFile);
document.getElementById("delete-file").addEventListener("click", deleteFile);
document.getElementById("run").addEventListener("click", runCode);
document.getElementById("share").addEventListener("click", shareProject);

loadState();
renderFileList();
switchFile(state.active);

if (state.shareLoaded) {
  showToast("Проект загружен по ссылке");
}

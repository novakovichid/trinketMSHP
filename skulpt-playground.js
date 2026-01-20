const codeArea = document.getElementById("code");
const consoleShell = document.getElementById("console");
const consoleOutput = document.getElementById("console-output");
const consoleInputForm = document.getElementById("console-input-form");
const consolePrompt = document.getElementById("console-prompt");
const consoleInput = document.getElementById("console-input");
const runButton = document.getElementById("run");
const stopButton = document.getElementById("stop");
const resetButton = document.getElementById("reset");
const clearButton = document.getElementById("clear");
const toast = document.getElementById("toast");

const DEFAULT_CODE = `print("Привет из Skulpt!")\nname = input("Как тебя зовут? ")\nprint(f"Приятно познакомиться, {name}!")\n`;

let editor = null;
let inputResolver = null;
let awaitingInput = false;
let isRunning = false;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2600);
}

function appendOutput(text, isError = false) {
  const span = document.createElement("span");
  span.textContent = text;
  if (isError) {
    span.style.color = "#fca5a5";
  }
  consoleOutput.appendChild(span);
  consoleShell.scrollTop = consoleShell.scrollHeight;
}

function clearConsole() {
  consoleOutput.textContent = "";
  setWaiting(false);
}

function setWaiting(value) {
  awaitingInput = value;
  consoleShell.classList.toggle("console--waiting", value);
  consoleInput.disabled = !value;
  if (value) {
    consoleInput.focus();
  } else {
    consoleInput.value = "";
  }
}

function readConsoleInput() {
  setWaiting(true);
  return new Promise((resolve) => {
    inputResolver = resolve;
  });
}

function handleConsoleSubmit(event) {
  event.preventDefault();
  if (!awaitingInput || !inputResolver) return;
  const response = consoleInput.value;
  appendOutput(`${response}\n`);
  const resolver = inputResolver;
  inputResolver = null;
  setWaiting(false);
  resolver(response);
}

function configureSkulpt() {
  Sk.configure({
    output: (text) => appendOutput(text),
    read: (filename) => {
      if (Sk.builtinFiles?.files[filename]) {
        return Sk.builtinFiles.files[filename];
      }
      throw new Error(`Файл не найден: ${filename}`);
    },
    inputfun: (prompt) => {
      if (prompt) {
        appendOutput(prompt);
      }
      return readConsoleInput();
    },
    inputfunTakesPrompt: true,
  });
}

function setRunningState(running) {
  isRunning = running;
  runButton.disabled = running;
  clearButton.disabled = running;
  resetButton.disabled = running;
  stopButton.disabled = !running;
}

async function runCode() {
  const code = editor ? editor.getValue() : codeArea.value;
  clearConsole();
  configureSkulpt();
  setRunningState(true);
  try {
    const module = await Sk.misceval.asyncToPromise(() => Sk.importMainWithBody("main", false, code, true));
    if (module) {
      showToast("Код выполнен");
    }
  } catch (error) {
    appendOutput(`\n${error.toString()}\n`, true);
  } finally {
    setRunningState(false);
  }
}

function resetCode() {
  if (editor) {
    editor.setValue(DEFAULT_CODE);
  } else {
    codeArea.value = DEFAULT_CODE;
  }
  clearConsole();
  showToast("Код сброшен");
}

function stopRun() {
  showToast("Остановка пока недоступна");
}

function initEditor() {
  editor = CodeMirror.fromTextArea(codeArea, {
    lineNumbers: true,
    mode: "python",
    lineWrapping: true,
    indentUnit: 4,
    tabSize: 4,
  });
  editor.setValue(DEFAULT_CODE);
}

runButton.addEventListener("click", runCode);
stopButton.addEventListener("click", stopRun);
resetButton.addEventListener("click", resetCode);
clearButton.addEventListener("click", clearConsole);
consoleShell.addEventListener("click", () => consoleShell.focus());
consoleInputForm.addEventListener("submit", handleConsoleSubmit);

initEditor();
appendOutput("Skulpt готов. Нажмите «Запуск», чтобы выполнить код.\n");
consolePrompt.textContent = ">";
setRunningState(false);

const codeArea = document.getElementById("code");
const consoleShell = document.getElementById("console");
const consoleOutput = document.getElementById("console-output");
const runButton = document.getElementById("run");
const clearButton = document.getElementById("clear");
const canvas = document.getElementById("turtle-canvas");
const turtlePanel = document.getElementById("turtle-panel");

const editor = CodeMirror.fromTextArea(codeArea, {
  lineNumbers: true,
  mode: "python",
  lineWrapping: true,
  indentUnit: 4,
  tabSize: 4,
});

const consoleController = {
  append(text) {
    consoleOutput.textContent += String(text ?? "");
    consoleShell.scrollTop = consoleShell.scrollHeight;
  },
  clear() {
    consoleOutput.textContent = "";
  },
};

window.writeToConsole = (text) => {
  consoleController.append(text);
};

function createTurtleRuntime() {
  const ctx = canvas.getContext("2d");
  const runtime = {
    x: canvas.width / 2,
    y: canvas.height / 2,
    angle: 0,
    pen: true,
    color: "#111827",
    fillColor: "#111827",
    bgColor: "#ffffff",
    width: 2,
    speed: 6,
    visible: true,
    fillActive: false,
    stamps: [],
    titleText: "",
    listening: false,
    keyHandlers: {
      keydown: new Map(),
      keyup: new Map(),
    },
  };

  function updateBackground() {
    canvas.style.background = runtime.bgColor;
  }

  function reset() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    runtime.x = canvas.width / 2;
    runtime.y = canvas.height / 2;
    runtime.angle = 0;
    runtime.pen = true;
    runtime.color = "#111827";
    runtime.fillColor = "#111827";
    runtime.bgColor = "#ffffff";
    runtime.width = 2;
    runtime.speed = 6;
    runtime.visible = true;
    runtime.fillActive = false;
    runtime.stamps = [];
    runtime.listening = false;
    runtime.keyHandlers.keydown.clear();
    runtime.keyHandlers.keyup.clear();
    updateBackground();
  }

  function beginFillPath() {
    ctx.beginPath();
    ctx.moveTo(runtime.x, runtime.y);
    runtime.fillActive = true;
  }

  function endFillPath() {
    if (!runtime.fillActive) return;
    ctx.fillStyle = runtime.fillColor;
    ctx.fill();
    runtime.fillActive = false;
  }

  function lineTo(x, y) {
    if (!runtime.pen) {
      runtime.x = x;
      runtime.y = y;
      if (runtime.fillActive) {
        ctx.lineTo(x, y);
      }
      return;
    }
    ctx.beginPath();
    ctx.moveTo(runtime.x, runtime.y);
    ctx.lineTo(x, y);
    ctx.strokeStyle = runtime.color;
    ctx.lineWidth = runtime.width;
    ctx.stroke();
    if (runtime.fillActive) {
      ctx.lineTo(x, y);
    }
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
    ctx.beginPath();
    ctx.strokeStyle = runtime.color;
    ctx.lineWidth = runtime.width;
    const start = ((runtime.angle - 90) * Math.PI) / 180;
    const end = start + (extent * Math.PI) / 180;
    ctx.arc(runtime.x, runtime.y, radius, start, end);
    ctx.stroke();
    if (runtime.fillActive && extent === 360) {
      ctx.fillStyle = runtime.fillColor;
      ctx.fill();
    }
  }

  function dot(size = 4, color = runtime.color) {
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.arc(runtime.x, runtime.y, size / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  function stamp() {
    const stampId = runtime.stamps.length + 1;
    runtime.stamps.push({
      id: stampId,
      x: runtime.x,
      y: runtime.y,
      color: runtime.color,
      width: runtime.width,
    });
    dot(runtime.width * 2, runtime.color);
    return stampId;
  }

  function clearstamp(stampId) {
    runtime.stamps = runtime.stamps.filter((item) => item.id !== stampId);
  }

  function clearstamps() {
    runtime.stamps = [];
  }

  function write(text, font = "16px Arial") {
    ctx.fillStyle = runtime.color;
    ctx.font = font;
    ctx.fillText(text, runtime.x, runtime.y);
  }

  function normalizeKey(key) {
    if (!key) return "";
    const keyMap = {
      ArrowUp: "up",
      ArrowDown: "down",
      ArrowLeft: "left",
      ArrowRight: "right",
      " ": "space",
      Escape: "escape",
      Enter: "return",
    };
    if (keyMap[key]) return keyMap[key];
    if (key.length === 1) return key.toLowerCase();
    return key.toLowerCase();
  }

  function handleKeyEvent(event, type) {
    if (!runtime.listening) return;
    const normalized = normalizeKey(event.key);
    const handler = runtime.keyHandlers[type].get(normalized);
    if (handler) {
      handler();
      event.preventDefault();
    }
  }

  function ensureListeners() {
    if (runtime.listening) return;
    runtime.listening = true;
    window.addEventListener("keydown", (event) => handleKeyEvent(event, "keydown"));
    window.addEventListener("keyup", (event) => handleKeyEvent(event, "keyup"));
  }

  updateBackground();

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
    isdown() {
      return runtime.pen;
    },
    goto(x, y) {
      lineTo(x + canvas.width / 2, canvas.height / 2 - y);
    },
    setx(x) {
      lineTo(x + canvas.width / 2, runtime.y);
    },
    sety(y) {
      lineTo(runtime.x, canvas.height / 2 - y);
    },
    position() {
      return [runtime.x - canvas.width / 2, canvas.height / 2 - runtime.y];
    },
    xcor() {
      return runtime.x - canvas.width / 2;
    },
    ycor() {
      return canvas.height / 2 - runtime.y;
    },
    distance(x, y) {
      const targetX = x + canvas.width / 2;
      const targetY = canvas.height / 2 - y;
      return Math.hypot(runtime.x - targetX, runtime.y - targetY);
    },
    setheading(angle) {
      runtime.angle = angle;
    },
    heading() {
      return runtime.angle;
    },
    home() {
      lineTo(canvas.width / 2, canvas.height / 2);
      runtime.angle = 0;
    },
    color(value) {
      runtime.color = value;
      runtime.fillColor = value;
    },
    pencolor(value) {
      runtime.color = value;
    },
    fillcolor(value) {
      runtime.fillColor = value;
    },
    bgcolor(value) {
      runtime.bgColor = value;
      updateBackground();
    },
    width(value) {
      runtime.width = value;
    },
    pensize(value) {
      runtime.width = value;
    },
    speed(value) {
      runtime.speed = value;
    },
    showturtle() {
      runtime.visible = true;
    },
    hideturtle() {
      runtime.visible = false;
    },
    isvisible() {
      return runtime.visible;
    },
    clear() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    },
    reset: () => reset(),
    circle,
    dot,
    stamp,
    clearstamp,
    clearstamps,
    begin_fill: beginFillPath,
    end_fill: endFillPath,
    write,
    setup(width, height) {
      canvas.width = width;
      canvas.height = height;
      reset();
    },
    title(value) {
      runtime.titleText = value;
    },
    onkeypress(handler, key) {
      const normalized = normalizeKey(key);
      if (!handler) {
        runtime.keyHandlers.keydown.delete(normalized);
        return;
      }
      runtime.keyHandlers.keydown.set(normalized, handler);
    },
    onkey(handler, key) {
      const normalized = normalizeKey(key);
      if (!handler) {
        runtime.keyHandlers.keydown.delete(normalized);
        return;
      }
      runtime.keyHandlers.keydown.set(normalized, handler);
    },
    onkeyrelease(handler, key) {
      const normalized = normalizeKey(key);
      if (!handler) {
        runtime.keyHandlers.keyup.delete(normalized);
        return;
      }
      runtime.keyHandlers.keyup.set(normalized, handler);
    },
    listen() {
      ensureListeners();
    },
    mainloop() {
      ensureListeners();
    },
    done() {
      ensureListeners();
    },
  };
}

const turtleRuntime = createTurtleRuntime();
window.TurtleRuntime = turtleRuntime;

const TURTLE_MODULE = `import sys
import types
from browser import window

_runtime = window.TurtleRuntime


def setup(width=480, height=360):
    _runtime.setup(width, height)


def forward(distance):
    _runtime.forward(distance)


def backward(distance):
    _runtime.backward(distance)


def left(angle):
    _runtime.left(angle)


def right(angle):
    _runtime.right(angle)


def penup():
    _runtime.penup()


def pendown():
    _runtime.pendown()


def isdown():
    return _runtime.isdown()


def goto(x, y):
    _runtime.goto(x, y)


def setx(x):
    _runtime.setx(x)


def sety(y):
    _runtime.sety(y)


def position():
    return _runtime.position()


def xcor():
    return _runtime.xcor()


def ycor():
    return _runtime.ycor()


def distance(x, y):
    return _runtime.distance(x, y)


def setheading(angle):
    _runtime.setheading(angle)


def heading():
    return _runtime.heading()


def home():
    _runtime.home()


def color(value):
    _runtime.color(value)


def pencolor(value):
    _runtime.pencolor(value)


def fillcolor(value):
    _runtime.fillcolor(value)


def bgcolor(value):
    _runtime.bgcolor(value)


def width(value):
    _runtime.width(value)


def pensize(value):
    _runtime.pensize(value)


def speed(value):
    _runtime.speed(value)


def showturtle():
    _runtime.showturtle()


def hideturtle():
    _runtime.hideturtle()


def isvisible():
    return _runtime.isvisible()


def clear():
    _runtime.clear()


def reset():
    _runtime.reset()


def circle(radius, extent=360):
    _runtime.circle(radius, extent)


def dot(size=4, color=None):
    _runtime.dot(size, color)


def stamp():
    return _runtime.stamp()


def clearstamp(stamp_id):
    _runtime.clearstamp(stamp_id)


def clearstamps():
    _runtime.clearstamps()


def begin_fill():
    _runtime.begin_fill()


def end_fill():
    _runtime.end_fill()


def write(text, font=("Arial", 16, "normal")):
    size = font[1] if len(font) > 1 else 16
    family = font[0] if len(font) > 0 else "Arial"
    _runtime.write(text, f"{size}px {family}")


def title(value):
    _runtime.title(value)


def onkeypress(func, key=None):
    _runtime.onkeypress(func, key)


def onkey(func, key=None):
    _runtime.onkey(func, key)


def onkeyrelease(func, key=None):
    _runtime.onkeyrelease(func, key)


def listen(xdummy=None, ydummy=None):
    _runtime.listen()


def mainloop():
    _runtime.mainloop()


def done():
    _runtime.done()


def screensize():
    return (480, 360)


def getscreen():
    return _runtime


class Turtle:
    def forward(self, distance):
        forward(distance)

    def backward(self, distance):
        backward(distance)

    def left(self, angle):
        left(angle)

    def right(self, angle):
        right(angle)

    def penup(self):
        penup()

    def pendown(self):
        pendown()

    def isdown(self):
        return isdown()

    def goto(self, x, y):
        goto(x, y)

    def setx(self, x):
        setx(x)

    def sety(self, y):
        sety(y)

    def position(self):
        return position()

    def xcor(self):
        return xcor()

    def ycor(self):
        return ycor()

    def distance(self, x, y):
        return distance(x, y)

    def setheading(self, angle):
        setheading(angle)

    def heading(self):
        return heading()

    def home(self):
        home()

    def color(self, value):
        color(value)

    def pencolor(self, value):
        pencolor(value)

    def fillcolor(self, value):
        fillcolor(value)

    def bgcolor(self, value):
        bgcolor(value)

    def width(self, value):
        width(value)

    def pensize(self, value):
        pensize(value)

    def speed(self, value):
        speed(value)

    def showturtle(self):
        showturtle()

    def hideturtle(self):
        hideturtle()

    def isvisible(self):
        return isvisible()

    def clear(self):
        clear()

    def reset(self):
        reset()

    def circle(self, radius, extent=360):
        circle(radius, extent)

    def dot(self, size=4, color=None):
        dot(size, color)

    def stamp(self):
        return stamp()

    def clearstamp(self, stamp_id):
        clearstamp(stamp_id)

    def clearstamps(self):
        clearstamps()

    def begin_fill(self):
        begin_fill()

    def end_fill(self):
        end_fill()

    def write(self, text, font=("Arial", 16, "normal")):
        write(text, font)

    def onkeypress(self, func, key=None):
        onkeypress(func, key)

    def onkey(self, func, key=None):
        onkey(func, key)

    def onkeyrelease(self, func, key=None):
        onkeyrelease(func, key)

    def listen(self, xdummy=None, ydummy=None):
        listen(xdummy, ydummy)

    def mainloop(self):
        mainloop()

    def done(self):
        done()


_turtle_module = types.SimpleNamespace(
    setup=setup,
    forward=forward,
    fd=forward,
    backward=backward,
    bk=backward,
    left=left,
    lt=left,
    right=right,
    rt=right,
    penup=penup,
    pu=penup,
    pendown=pendown,
    pd=pendown,
    isdown=isdown,
    goto=goto,
    setx=setx,
    sety=sety,
    position=position,
    pos=position,
    xcor=xcor,
    ycor=ycor,
    distance=distance,
    setheading=setheading,
    seth=setheading,
    heading=heading,
    home=home,
    color=color,
    pencolor=pencolor,
    fillcolor=fillcolor,
    bgcolor=bgcolor,
    width=width,
    pensize=pensize,
    speed=speed,
    showturtle=showturtle,
    st=showturtle,
    hideturtle=hideturtle,
    ht=hideturtle,
    isvisible=isvisible,
    clear=clear,
    reset=reset,
    circle=circle,
    dot=dot,
    stamp=stamp,
    clearstamp=clearstamp,
    clearstamps=clearstamps,
    begin_fill=begin_fill,
    end_fill=end_fill,
    write=write,
    title=title,
    onkeypress=onkeypress,
    onkey=onkey,
    onkeyrelease=onkeyrelease,
    listen=listen,
    mainloop=mainloop,
    done=done,
    screensize=screensize,
    getscreen=getscreen,
    Turtle=Turtle,
)

sys.modules["turtle"] = _turtle_module
`;

const BRYTHON_PRELUDE = `from browser import window
import sys

class _Console:
    def write(self, data):
        window.writeToConsole(str(data))

    def flush(self):
        pass


def input(prompt=""):
    if prompt:
        window.writeToConsole(str(prompt))
    return ""

console = _Console()
sys.stdout = console
sys.stderr = console
`;

function usesTurtle(source) {
  return /\bfrom\s+turtle\b|\bimport\s+turtle\b|\bturtle\./.test(source);
}

function updateTurtleVisibility(source) {
  turtlePanel.classList.toggle("hidden", !usesTurtle(source));
}

function ensureBrythonReady() {
  if (!window.__BRYTHON__) {
    consoleController.append("Brython еще загружается...\n");
    return false;
  }
  return true;
}

function runCode() {
  if (!ensureBrythonReady()) return;
  consoleController.clear();
  const code = editor.getValue();
  updateTurtleVisibility(code);
  if (usesTurtle(code)) {
    turtleRuntime.reset();
  }
  const fullCode = `${BRYTHON_PRELUDE}\n${TURTLE_MODULE}\n${code}`;
  try {
    // eslint-disable-next-line no-eval
    eval(window.__BRYTHON__.python_to_js(fullCode, "__main__", "__main__"));
  } catch (error) {
    consoleController.append(`Ошибка: ${error}\n`);
  }
}

runButton.addEventListener("click", runCode);
clearButton.addEventListener("click", () => consoleController.clear());
consoleShell.addEventListener("click", () => consoleShell.focus());
editor.on("change", () => updateTurtleVisibility(editor.getValue()));

window.addEventListener("load", () => {
  brython();
  updateTurtleVisibility(editor.getValue());
});

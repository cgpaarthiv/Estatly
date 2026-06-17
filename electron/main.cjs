const { app, BrowserWindow } = require("electron");
const path = require("path");
const { initDatabase, registerIpcHandlers } = require("./database.cjs");

const isDev = !app.isPackaged;

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "Estatly",
    icon: path.join(__dirname, "icon.png"),
    show: false,
    backgroundColor: "#fafbfa",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

app.whenReady().then(async () => {
  await initDatabase();
  registerIpcHandlers();
  createWindow();
});

app.on("window-all-closed", () => {
  app.quit();
});

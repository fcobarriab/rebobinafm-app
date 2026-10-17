let installPrompt;

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
});

window.addEventListener("appinstalled", () => {
  document.querySelector("#pwa-install-button")?.remove();
});

function isInstalled() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    navigator.standalone === true
  );
}

function showInstallHelp(message) {
  let help = document.querySelector("#pwa-install-help");

  if (!help) {
    help = document.createElement("div");
    help.id = "pwa-install-help";
    help.setAttribute("role", "status");
    help.setAttribute("aria-live", "polite");
    Object.assign(help.style, {
      position: "fixed",
      right: "16px",
      bottom: "calc(76px + env(safe-area-inset-bottom))",
      zIndex: "1000",
      width: "min(320px, calc(100vw - 32px))",
      padding: "14px 16px",
      border: "2px solid #000",
      borderRadius: "16px",
      background: "#0A4A4A",
      color: "#EBE6AE",
      font: "600 14px/1.5 system-ui, sans-serif",
      boxShadow: "4px 4px 0 #000",
    });
    document.body.append(help);
  }

  help.textContent = message;
}

async function installApp(button) {
  if (!installPrompt) {
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const instructions = isIos
      ? "En Safari, toca Compartir y luego «Añadir a pantalla de inicio»."
      : "Abre el menú ⋮ del navegador y elige «Instalar app» o «Añadir a pantalla de inicio». La instalación requiere HTTPS.";
    showInstallHelp(instructions);
    return;
  }

  button.disabled = true;
  try {
    const promptEvent = installPrompt;
    installPrompt = undefined;
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;

    if (outcome === "accepted") {
      button.remove();
      document.querySelector("#pwa-install-help")?.remove();
    } else {
      button.disabled = false;
      showInstallHelp("No se instaló. Puedes volver a intentarlo desde aquí.");
    }
  } catch (error) {
    button.disabled = false;
    showInstallHelp("No se pudo abrir la instalación. Inténtalo desde el menú del navegador.");
    console.error("No se pudo iniciar la instalación de la PWA:", error);
  }
}

function addInstallButton() {
  if (isInstalled() || document.querySelector("#pwa-install-button")) return;

  const actions = document.querySelector("#header-actions");
  if (!actions) {
    throw new Error("No se encontró el grupo de acciones del encabezado.");
  }

  const button = document.createElement("button");
  button.id = "pwa-install-button";
  button.type = "button";
  button.textContent = "INSTALAR APP";
  button.setAttribute("aria-label", "Instalar Rebobina FM en este dispositivo");
  button.addEventListener("click", () => installApp(button));
  actions.append(button);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", addInstallButton, {
    once: true,
  });
} else {
  addInstallButton();
}

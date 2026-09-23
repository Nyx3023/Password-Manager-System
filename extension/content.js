// SecureX Autofill Content Script
let hasRequested = false;
let activeDropdown = null;
let rememberedCredential = null;

function removeActiveDropdown() {
  if (activeDropdown) {
    activeDropdown.remove();
    activeDropdown = null;
  }
}

document.addEventListener("click", (e) => {
  const target = e.target;
  if (!target || target.tagName !== "INPUT") {
    removeActiveDropdown();
    return;
  }

  const type = target.type.toLowerCase();
  if (type === "password" || type === "text" || type === "email") {
    // Security: never autofill on non-HTTPS pages
    if (window.location.protocol !== "https:") {
      return;
    }

    // Skip fields that explicitly disable autofill
    const ac = (target.autocomplete || "").toLowerCase();
    if (ac === "off" || ac === "new-password") return;

    // If we have a remembered credential from step 1 (multi-step login) and clicked password
    if (rememberedCredential && type === "password" && !target.value) {
      applyCredential(target, rememberedCredential);
      return;
    }

    const isLoginField =
      type === "password" ||
      target.name.toLowerCase().includes("user") ||
      target.id.toLowerCase().includes("user") ||
      target.name.toLowerCase().includes("email") ||
      target.id.toLowerCase().includes("email") ||
      target.name.toLowerCase().includes("login") ||
      target.id.toLowerCase().includes("login");

    if (isLoginField && !hasRequested) {
      hasRequested = true;
      requestAutofill(target);
      setTimeout(() => {
        hasRequested = false;
      }, 3000);
    }
  }
}, { capture: true });

function showPopupMessage(msg, isError = false) {
  const div = document.createElement("div");
  div.textContent = msg;
  div.style.position = "fixed";
  div.style.top = "20px";
  div.style.right = "20px";
  div.style.background = isError ? "#ff4438" : "#111";
  div.style.border = isError ? "none" : "1px solid #333";
  div.style.color = "#fff";
  div.style.padding = "10px 18px";
  div.style.borderRadius = "6px";
  div.style.fontFamily = "monospace, sans-serif";
  div.style.fontSize = "13px";
  div.style.zIndex = "999999";
  div.style.boxShadow = "0 8px 24px rgba(0,0,0,0.6)";
  div.style.transition = "opacity 0.3s ease";

  document.body.appendChild(div);

  setTimeout(() => {
    div.style.opacity = "0";
    setTimeout(() => div.remove(), 300);
  }, 4000);
}

function showCredentialPicker(inputEl, credentials) {
  removeActiveDropdown();

  const rect = inputEl.getBoundingClientRect();
  const picker = document.createElement("div");
  picker.style.position = "absolute";
  picker.style.top = `${rect.bottom + window.scrollY + 6}px`;
  picker.style.left = `${rect.left + window.scrollX}px`;
  picker.style.minWidth = `${Math.max(rect.width, 220)}px`;
  picker.style.maxWidth = "320px";
  picker.style.background = "#0d0d0d";
  picker.style.border = "1px solid #333";
  picker.style.borderRadius = "8px";
  picker.style.boxShadow = "0 10px 30px rgba(0,0,0,0.8)";
  picker.style.zIndex = "999999";
  picker.style.overflow = "hidden";
  picker.style.fontFamily = "sans-serif";

  const header = document.createElement("div");
  header.style.padding = "8px 12px";
  header.style.background = "#141414";
  header.style.borderBottom = "1px solid #222";
  header.style.color = "#ff4438";
  header.style.fontSize = "11px";
  header.style.fontWeight = "bold";
  header.style.letterSpacing = "0.05em";
  header.textContent = "SecureX Accounts";
  picker.appendChild(header);

  credentials.forEach((cred) => {
    const item = document.createElement("div");
    item.style.padding = "8px 12px";
    item.style.cursor = "pointer";
    item.style.display = "flex";
    item.style.flexDirection = "column";
    item.style.gap = "2px";
    item.style.borderBottom = "1px solid #1a1a1a";

    item.onmouseenter = () => {
      item.style.background = "#1a1a1a";
    };
    item.onmouseleave = () => {
      item.style.background = "transparent";
    };

    const titleSpan = document.createElement("span");
    titleSpan.style.color = "#eee";
    titleSpan.style.fontSize = "13px";
    titleSpan.style.fontWeight = "600";
    titleSpan.textContent = cred.username || cred.title || "Account";

    const subSpan = document.createElement("span");
    subSpan.style.color = "#888";
    subSpan.style.fontSize = "11px";
    subSpan.textContent = cred.title || "";

    item.appendChild(titleSpan);
    if (cred.title && cred.username) item.appendChild(subSpan);

    item.onclick = (e) => {
      e.stopPropagation();
      rememberedCredential = cred;
      applyCredential(inputEl, cred);
      removeActiveDropdown();
    };

    picker.appendChild(item);
  });

  document.body.appendChild(picker);
  activeDropdown = picker;
}

function applyCredential(activeInput, cred) {
  if (activeInput.type === "password") {
    activeInput.value = cred.password;
    const form = activeInput.closest("form");
    if (form) {
      const userField = form.querySelector("input[type='text'], input[type='email']");
      if (userField && cred.username) {
        userField.value = cred.username;
        userField.dispatchEvent(new Event("input", { bubbles: true }));
        userField.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
  } else {
    activeInput.value = cred.username;
    const form = activeInput.closest("form");
    if (form) {
      const passField = form.querySelector("input[type='password']");
      if (passField && cred.password) {
        passField.value = cred.password;
        passField.dispatchEvent(new Event("input", { bubbles: true }));
        passField.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
  }

  activeInput.dispatchEvent(new Event("input", { bubbles: true }));
  activeInput.dispatchEvent(new Event("change", { bubbles: true }));
  showPopupMessage("Autofilled by SecureX");
}

function requestAutofill(activeInput) {
  const currentUrl = window.location.href;

  chrome.runtime.sendMessage({ type: "REQUEST_AUTOFILL", url: currentUrl }, (response) => {
    if (!response) return;

    if (response.status === "LOCKED") {
      showPopupMessage("SecureX is locked. Unlock it on desktop to autofill.", true);
      return;
    }

    if (response.credentials && response.credentials.length > 0) {
      if (response.credentials.length === 1) {
        rememberedCredential = response.credentials[0];
        applyCredential(activeInput, response.credentials[0]);
      } else {
        showCredentialPicker(activeInput, response.credentials);
      }
    }
  });
}

// Prompt to save / update password on form submission
document.addEventListener("submit", (e) => {
  const form = e.target;
  if (!form || form.tagName !== "FORM") return;

  const passInput = form.querySelector("input[type='password']");
  if (!passInput || !passInput.value) return;

  const userInput = form.querySelector("input[type='text'], input[type='email']");
  const username = userInput ? userInput.value : "";
  const password = passInput.value;
  const currentUrl = window.location.href;

  if (rememberedCredential && rememberedCredential.password === password) {
    return; // Already matched
  }

  showSavePrompt({ url: currentUrl, username, password });
}, true);

function showSavePrompt(cred) {
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.bottom = "24px";
  container.style.right = "24px";
  container.style.background = "#0f0f0f";
  container.style.border = "1px solid #ff4438";
  container.style.borderRadius = "8px";
  container.style.padding = "14px 18px";
  container.style.zIndex = "999999";
  container.style.color = "#fff";
  container.style.fontFamily = "sans-serif";
  container.style.boxShadow = "0 12px 36px rgba(0,0,0,0.8)";
  container.style.maxWidth = "300px";

  container.innerHTML = `
    <div style="font-weight:700;font-size:13px;margin-bottom:6px;color:#ff4438;">SecureX</div>
    <div style="font-size:12px;color:#ccc;margin-bottom:12px;">Save password for this site to your SecureX vault?</div>
    <div style="display:flex;gap:8px;justify-content:flex-end;">
      <button id="securex-save-cancel" style="background:#222;color:#888;border:none;border-radius:4px;padding:6px 12px;font-size:12px;cursor:pointer;">Not now</button>
      <button id="securex-save-confirm" style="background:#ff4438;color:#fff;border:none;border-radius:4px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer;">Save</button>
    </div>
  `;

  document.body.appendChild(container);

  container.querySelector("#securex-save-cancel").onclick = () => container.remove();
  container.querySelector("#securex-save-confirm").onclick = () => {
    chrome.runtime.sendMessage({
      type: "SAVE_CREDENTIAL",
      credential: cred,
    });
    container.remove();
    showPopupMessage("Saved to SecureX!");
  };

  setTimeout(() => container.remove(), 15000);
}

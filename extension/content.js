// Wait for user interaction to avoid spamming the background app
let hasRequested = false;

document.addEventListener("click", (e) => {
  const target = e.target;
  if (!target || target.tagName !== "INPUT") return;

  const type = target.type.toLowerCase();
  if (type === "password" || type === "text" || type === "email") {
    // Basic heuristic: check if it's likely a login field
    const isLoginField = type === "password" || 
      target.name.toLowerCase().includes("user") || 
      target.id.toLowerCase().includes("user") ||
      target.name.toLowerCase().includes("email") ||
      target.id.toLowerCase().includes("email") ||
      target.name.toLowerCase().includes("login") ||
      target.id.toLowerCase().includes("login");

    if (isLoginField && !hasRequested) {
      hasRequested = true;
      requestAutofill(target);
      // Reset after a delay so they can try again later
      setTimeout(() => { hasRequested = false; }, 5000);
    }
  }
}, { capture: true });

function showPopupMessage(msg, isError = false) {
  const div = document.createElement("div");
  div.textContent = msg;
  div.style.position = "fixed";
  div.style.top = "20px";
  div.style.right = "20px";
  div.style.background = isError ? "#ff4438" : "#222";
  div.style.color = "#fff";
  div.style.padding = "12px 20px";
  div.style.borderRadius = "8px";
  div.style.fontFamily = "sans-serif";
  div.style.zIndex = "999999";
  div.style.boxShadow = "0 4px 12px rgba(0,0,0,0.5)";
  div.style.transition = "opacity 0.3s ease";
  
  document.body.appendChild(div);
  
  setTimeout(() => {
    div.style.opacity = "0";
    setTimeout(() => div.remove(), 300);
  }, 4000);
}

function requestAutofill(activeInput) {
  const currentUrl = window.location.href;

  chrome.runtime.sendMessage({ type: "REQUEST_AUTOFILL", url: currentUrl }, (response) => {
    if (!response) return;

    if (response.error) {
      showPopupMessage(`Error: ${response.error} - ${response.details || ''}`, true);
      return;
    }

    if (response.status === "LOCKED") {
      showPopupMessage("Please open Password Manager and unlock it first.", true);
      return;
    }

    if (response.credentials && response.credentials.length > 0) {
      const cred = response.credentials[0]; // For now, pick the first match
      
      // Attempt to fill the active input
      if (activeInput.type === "password") {
        activeInput.value = cred.password;
        // Try to find a username field nearby
        const form = activeInput.closest("form");
        if (form) {
          const userField = form.querySelector("input[type='text'], input[type='email']");
          if (userField && cred.username) {
            userField.value = cred.username;
          }
        }
      } else {
        // If they clicked the username field
        activeInput.value = cred.username;
        const form = activeInput.closest("form");
        if (form) {
          const passField = form.querySelector("input[type='password']");
          if (passField && cred.password) {
            passField.value = cred.password;
          }
        }
      }
      
      showPopupMessage("Autofilled by Password Manager!");
      
      // Dispatch input events so modern frameworks like React/Vue pick up the changes
      activeInput.dispatchEvent(new Event("input", { bubbles: true }));
      activeInput.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      showPopupMessage(`No passwords found in vault for this website.`, true);
    }
  });
}

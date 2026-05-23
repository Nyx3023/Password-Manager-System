const HOST_NAME = "com.passwordmanager.host";

console.log("====== ATTENTION ======");
console.log("MY EXTENSION ID IS: " + chrome.runtime.id);
console.log("=======================");

let port = null;
let pendingRequests = new Map();
let reqId = 0;

function connectHost() {
  port = chrome.runtime.connectNative(HOST_NAME);
  
  port.onMessage.addListener((msg) => {
    if (msg.id && pendingRequests.has(msg.id)) {
      pendingRequests.get(msg.id)(msg);
      pendingRequests.delete(msg.id);
    }
  });
  
  port.onDisconnect.addListener(() => {
    console.error("Native Host Disconnected:", chrome.runtime.lastError?.message);
    port = null;
    for (const [id, cb] of pendingRequests.entries()) {
      cb({ error: "HOST_NOT_FOUND", details: chrome.runtime.lastError?.message || "Disconnected" });
    }
    pendingRequests.clear();
  });
}

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "REQUEST_AUTOFILL") {
    if (!port) connectHost();
    
    if (!port) {
      sendResponse({ error: "HOST_NOT_FOUND", details: "Could not connect to Native Host" });
      return;
    }
    
    const id = ++reqId;
    pendingRequests.set(id, sendResponse);
    
    port.postMessage({ id, type: "REQUEST_AUTOFILL", url: message.url });
    return true; // Keep channel open for async response
  }
});

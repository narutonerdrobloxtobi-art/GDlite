(function () {
  "use strict";

  const defaultConfig = {
    files: [],
    basePath: "",
    debug: true,
  };

  const config = Object.assign(
    {},
    defaultConfig,
    window.fileMergerConfig || {},
  );
  window.mergedFiles = window.mergedFiles || {};

  const mergeStatus = {};
  const mergeProgress = {};

  let loadingDiv;
  let loadingContent;

  function initializeUI() {
    loadingDiv = document.createElement("div");
    loadingDiv.id = "file-merger-loading";
    loadingDiv.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0, 0, 0, 0.9);
      color: white;
      padding: 30px 40px;
      border-radius: 10px;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      font-size: 16px;
      z-index: 10000;
      min-width: 320px;
      text-align: center;
      box-shadow: 0 0 20px rgba(0,0,0,0.5);
    `;

    loadingContent = document.createElement("div");
    loadingContent.id = "file-merger-content";
    loadingDiv.appendChild(loadingContent);
    document.body.appendChild(loadingDiv);
  }

  function updateLoadingDisplay() {
    if (!loadingContent) return;

    const lines = [
      '<div style="font-size: 20px; font-weight: bold; margin-bottom: 15px; color: #fff;">Geometry Dash Lite</div>',
      '<div style="font-size: 14px; color: #aaa; margin-bottom: 15px;">Initializing game assets...</div>',
    ];

    config.files.forEach((file) => {
      const status = mergeStatus[file.name] || "waiting";
      const progress = mergeProgress[file.name] || { current: 0, total: file.parts };

      let statusText = "";
      let color = "#666";

      if (status === "merging") {
        statusText = `[${progress.current}/${progress.total}]`;
        color = "#00ccff";
      } else if (status === "ready") {
        statusText = "OK";
        color = "#00ff00";
      } else if (status === "failed") {
        statusText = "ERROR";
        color = "#ff4444";
      } else {
        statusText = "...";
      }

      lines.push(
        `<div style="margin: 5px 0; font-size: 12px; display: flex; justify-content: space-between; color: ${color};">` +
        `<span>${file.name}</span>` +
        `<span>${statusText}</span></div>`,
      );
    });
    loadingContent.innerHTML = lines.join("");

    const allDone = config.files.every(
      (file) => mergeStatus[file.name] === "ready" || mergeStatus[file.name] === "failed",
    );

    if (allDone) {
      setTimeout(() => {
        loadingDiv.style.opacity = "0";
        loadingDiv.style.transition = "opacity 0.8s";
        setTimeout(() => loadingDiv.remove(), 800);
      }, 1500);
    }
  }

  async function mergeSplitFiles(filePath, numParts) {
    const fileName = filePath.split("/").pop();
    mergeProgress[fileName] = { current: 0, total: numParts };
    updateLoadingDisplay();

    try {
      const buffers = [];
      for (let i = 1; i <= numParts; i++) {
        const response = await window.originalFetch(`${filePath}.part${i}`);
        if (!response.ok) throw new Error(`Status: ${response.status}`);
        
        buffers.push(await response.arrayBuffer());
        mergeProgress[fileName].current = i;
        updateLoadingDisplay();
      }

      const totalSize = buffers.reduce((sum, buf) => sum + buf.byteLength, 0);
      const mergedArray = new Uint8Array(totalSize);
      let offset = 0;
      for (const buffer of buffers) {
        mergedArray.set(new Uint8Array(buffer), offset);
        offset += buffer.byteLength;
      }
      return mergedArray.buffer;
    } catch (err) {
      console.error(`[Merger] Failed ${filePath}:`, err);
      throw err;
    }
  }

  function shouldInterceptFile(url) {
    const urlStr = url.toString().split("?")[0];
    if (urlStr.includes(".part")) return null;
    for (const file of config.files) {
      if (urlStr.endsWith(file.name)) return file.name;
    }
    return null;
  }

  if (!window.originalFetch) window.originalFetch = window.fetch;
  window.fetch = function (url, ...args) {
    const filename = shouldInterceptFile(url);
    if (filename) {
      return new Promise((resolve, reject) => {
        const check = setInterval(() => {
          if (window.mergedFiles[filename]) {
            clearInterval(check);
            resolve(new Response(window.mergedFiles[filename], { status: 200 }));
          } else if (mergeStatus[filename] === "failed") {
            clearInterval(check);
            reject();
          }
        }, 100);
      });
    }
    return window.originalFetch.apply(this, [url, ...args]);
  };

  async function autoMergeFiles() {
    if (!config.files.length) return;
    initializeUI();
    const promises = config.files.map((file) => {
      const fullPath = config.basePath + file.name;
      mergeStatus[file.name] = "merging";
      return mergeSplitFiles(fullPath, file.parts).then((buf) => {
        window.mergedFiles[file.name] = buf;
        mergeStatus[file.name] = "ready";
        updateLoadingDisplay();
      }).catch(() => {
        mergeStatus[file.name] = "failed";
        updateLoadingDisplay();
      });
    });
    await Promise.all(promises);
  }

  if (document.readyState === "complete") autoMergeFiles();
  else window.addEventListener("load", autoMergeFiles);
})();

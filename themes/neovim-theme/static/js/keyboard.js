const whichkey = [
  {
    group: "Navigation",
    keys: [
      ["j", "Scroll down / Next file"],
      ["k", "Scroll up / Prev file"],
      ["h", "Scroll left"],
      ["l", "Scroll right"],
      ["Ctrl+d", "Page down"],
      ["Ctrl+u", "Page up"],
    ],
  },
  {
    group: "Tabs",
    keys: [
      ["Shift+h", "Previous tab"],
      ["Shift+l", "Next tab"],
      ["Shift+t", "New tab"],
      ["Shift+q", "Close tab"],
      ["Tab", "Next tab"],
      ["Enter", "Open / Replace tab"],
    ],
  },
  {
    group: "Panels",
    keys: [
      ["Ctrl+h", "Focus files panel"],
      ["Ctrl+l", "Focus viewer panel"],
      ["Space e", "Toggle files panel"],
    ],
  },
];

function show_whichkey() {
  let wk = document.getElementById("whichkey");
  if (!wk) {
    wk = document.createElement("div");
    wk.id = "whichkey";
    document.querySelector("main").appendChild(wk);
  }

  wk.innerHTML =
    '<div class="wk-body">' +
    whichkey
      .map(
        (g) =>
          `<div class="wk-group"><div class="wk-group-name">${g.group}</div>` +
          g.keys
            .map(
              ([k, v]) =>
                `<div class="wk-row"><span class="wk-key">${k}</span><span class="wk-desc">${v}</span></div>`,
            )
            .join("") +
          "</div>",
      )
      .join("") +
    '<div class="wk-footer">Esc to close</div>' +
    "</div>";

  wk.style.display = "flex";
}

function hide_whichkey() {
  const wk = document.getElementById("whichkey");
  if (wk) wk.style.display = "none";
}

function toggle_whichkey() {
  const wk = document.getElementById("whichkey");
  if (wk && wk.style.display === "flex") {
    hide_whichkey();
  } else {
    show_whichkey();
  }
}

let leaderActive = false;
let leaderTimer = null;

function exec(event) {
  let element = document.activeElement;

  const key = event.key.toLocaleLowerCase();

  const is_prompt = element.id == "setter";

  if (key === " " && !event.ctrlKey) {
    if (leaderActive) {
      clearTimeout(leaderTimer);
      leaderActive = false;
      hide_whichkey();
    } else {
      leaderActive = true;
      leaderTimer = setTimeout(show_whichkey, 200);
    }
    event.preventDefault();
    return;
  }

  if (leaderActive) {
    clearTimeout(leaderTimer);
    leaderActive = false;
    hide_whichkey();
    if (key === "e") {
      event.preventDefault();
      document.querySelector("main").classList.toggle("files-collapsed");
      return;
    }
    // non-leader key: cancel leader mode, fall through to normal handling
  }

  const is_page = element.classList.contains("page");
  const is_viewer = element.id == "viewer";
  const is_files = element.id == "files";

  if (key != "r" && (is_viewer || is_files)) event.preventDefault();

  element = is_viewer ? document.getElementById("content") : element;

  if (event.ctrlKey) {
    switch (key) {
      case "h":
        document.getElementById("files").focus();
        Cookies.set("focused", "files");
        return;
      case "l":
        document.getElementById("viewer").focus();
        Cookies.set("focused", "viewer");
        return;
      case "d":
        element.scrollBy(0, window.innerHeight * 0.5);
        return;
      case "u":
        element.scrollBy(0, window.innerHeight * -0.5);
        return;
    }
  }

  if (event.shiftKey) {
    if (
      typeof keys !== "undefined" &&
      typeof keys.shortcut !== "undefined" &&
      typeof keys.shortcut[key] === "function"
    ) {
      keys.shortcut[key](event, element);
      return;
    }

    switch (key) {
      case "h":
        prev_tab();
        break;

      case "l":
        next_tab();
        break;

      case "t":
        new_tab(element);
        break;

      case "q":
        del_tab();
        break;
    }
  } else {
    if (
      typeof keys !== "undefined" &&
      typeof keys.normal !== "undefined" &&
      typeof keys.normal[key] === "function"
    ) {
      keys.normal[key](event, element);
      return;
    }

    switch (key) {
      case "escape":
        clearTimeout(leaderTimer);
        leaderActive = false;
        hide_whichkey();
        document.getElementById("setter").focus();
        document.getElementById("setter").value = "";
        break;

      case "enter":
        if (is_prompt) {
          command();
        } else if (is_files) {
          new_tab(element);
        } else {
          new_tab(element, true);
        }
        break;

      case "tab":
        if (is_viewer) {
          next_tab();
        }
        break;

      case "j":
        if (is_viewer && is_page) {
          element.scrollBy(0, 30);
        } else if (!is_prompt) {
          next_file(-1, element);
        }
        break;

      case "k":
        if (is_viewer && is_page) {
          element.scrollBy(0, -30);
        } else if (!is_prompt) {
          next_file(1, element);
        }
        break;

      case "l":
        if (!is_prompt) {
          element.scrollBy(30, 0);
        }
        break;

      case "h":
        if (!is_prompt) {
          element.scrollBy(-30, 0);
        }
        break;
    }
  }
}

function next_file(incrementer, element) {
  const a = element.getElementsByClassName("selected")[0];
  if (!a) return;
  const index = parseInt(a.attributes.tabindex.value);
  const next_element = element.querySelector(
    `[tabindex='${index + incrementer}']`,
  );

  if (next_element) {
    next_element.classList.add("selected");
    a.classList.remove("selected");
  }
}

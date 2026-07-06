// Reusable modal dialog. A fixed, full-viewport backdrop dims the page and
// centers the dialog box both vertically and horizontally. Built to run on the
// Navico MFD engine (Chromium 69): native confirm()/prompt() freeze that
// embedded WebView (the anchor-raise confirm in particular stopped the whole
// action), so every blocking dialog routes through here instead. The chrome
// avoids CSS that engine lacks (flexbox `gap`, the <dialog> element); all
// styling lives under the .modal* classes in style.css.
//
// Two ways to use it:
//   1. Static helpers for the common cases:
//        await Modal.confirm({ title, message })        -> boolean
//        await Modal.prompt({ title, message, value })  -> string | null
//   2. An instance for custom content (settings form, login form):
//        const modal = new Modal({ title });
//        modal.setContent(node);
//        modal.setButtons([...]);
//        modal.open();   // returns a Promise that resolves when it closes
//
// The dialog element is a <form>, so Enter submits: the button flagged
// `primary` is rendered as type="submit" and its handler runs on submit,
// giving keyboard and click a single code path.

export class Modal {
  constructor({ title = "", dismissible = true, className = "" } = {}) {
    this._dismissible = dismissible;
    this._resolve = null;
    this._open = false;
    this._buttons = [];
    this._primaryButton = null;
    this._focusTarget = null;
    this._pressedOnBackdrop = false;
    this._onKeyDown = (e) => this._handleKeyDown(e);

    this._backdrop = document.createElement("div");
    this._backdrop.className = "modalBackdrop";
    this._backdrop.style.display = "none";

    this._dialog = document.createElement("form");
    this._dialog.className = "modalDialog";
    if (className)
      this._dialog.classList.add(className);
    this._backdrop.appendChild(this._dialog);

    this._header = document.createElement("div");
    this._header.className = "modalHeader";
    this._titleEl = document.createElement("span");
    this._titleEl.className = "modalTitle";
    this._titleEl.textContent = title;
    this._closeBtn = document.createElement("button");
    this._closeBtn.type = "button";
    this._closeBtn.className = "modalClose";
    this._closeBtn.setAttribute("aria-label", "Close");
    this._closeBtn.innerHTML = "&times;";
    this._header.appendChild(this._titleEl);
    this._header.appendChild(this._closeBtn);

    this._body = document.createElement("div");
    this._body.className = "modalBody";

    this._error = document.createElement("div");
    this._error.className = "modalError";
    this._error.style.display = "none";

    this._footer = document.createElement("div");
    this._footer.className = "modalFooter";

    this._dialog.appendChild(this._header);
    this._dialog.appendChild(this._body);
    this._dialog.appendChild(this._error);
    this._dialog.appendChild(this._footer);

    // Dismiss paths (× button, click on the dim area, Esc) all close with no
    // value so callers can tell a dismissal from an explicit button press.
    this._closeBtn.addEventListener("click", () => this.close());
    // Only a click that both *starts* and *ends* on the dim area dismisses.
    // A drag-select inside a field that releases over the backdrop fires a
    // click whose target is the backdrop (the common ancestor of the down/up
    // targets); tracking where the press began keeps that from closing us.
    this._backdrop.addEventListener("mousedown", (e) => {
      this._pressedOnBackdrop = e.target === this._backdrop;
    });
    this._backdrop.addEventListener("click", (e) => {
      if (
        e.target === this._backdrop &&
        this._pressedOnBackdrop &&
        this._dismissible
      )
        this.close();
    });

    // Enter anywhere in the dialog submits the form; route that to the primary
    // button so keyboard and click share one path.
    this._dialog.addEventListener("submit", (e) => {
      e.preventDefault();
      if (this._primaryButton)
        this._primaryButton._invoke();
    });
  }

  // The body element, exposed so hosts can populate it and query their inputs.
  get body() {
    return this._body;
  }

  // The footer element, exposed so hosts can drop extra chrome (e.g. a version
  // link) alongside the buttons. setButtons() clears it, so add to it after.
  get footer() {
    return this._footer;
  }

  isOpen() {
    return this._open;
  }

  setTitle(text) {
    this._titleEl.textContent = text || "";
  }

  // Replace the body. A string is inserted as trusted HTML; a Node is appended.
  setContent(content) {
    this._body.innerHTML = "";
    if (content == null)
      return;
    if (typeof content === "string")
      this._body.innerHTML = content;
    else
      this._body.appendChild(content);
  }

  // buttons: [{ label, variant, primary, value, onClick }]. `variant` maps to a
  // CSS class (primary/secondary/danger). The button flagged `primary` submits
  // the form so Enter triggers it. `onClick(modal)` overrides the default
  // behaviour of closing with `value`.
  setButtons(buttons) {
    this._footer.innerHTML = "";
    this._buttons = [];
    this._primaryButton = null;
    for (const spec of buttons || []) {
      const btn = document.createElement("button");
      btn.type = spec.primary ? "submit" : "button";
      btn.className = "modalButton";
      if (spec.variant)
        btn.classList.add(spec.variant);
      btn.textContent = spec.label;
      btn._invoke = () => {
        if (typeof spec.onClick === "function")
          spec.onClick(this);
        else
          this.close(spec.value);
      };
      // Non-primary buttons handle their own click; the primary button is
      // driven by the form's submit event so it never double-fires.
      if (spec.primary)
        this._primaryButton = btn;
      else
        btn.addEventListener("click", () => btn._invoke());
      this._footer.appendChild(btn);
      this._buttons.push(btn);
    }
  }

  // Show or clear an inline error line between the body and the buttons.
  setError(message) {
    this._error.textContent = message || "";
    this._error.style.display = message ? "block" : "none";
  }

  // Disable every button (and the ×) while an async action is in flight.
  setBusy(busy) {
    for (const btn of this._buttons)
      btn.disabled = busy;
    this._closeBtn.disabled = busy;
  }

  // Hint which control to focus when opened (e.g. a text input). Falls back to
  // the primary button, then the first focusable control, then the × button.
  setFocusTarget(el) {
    this._focusTarget = el;
  }

  open() {
    if (!this._backdrop.parentNode)
      document.body.appendChild(this._backdrop);
    this._backdrop.style.display = "flex";
    this._open = true;
    document.addEventListener("keydown", this._onKeyDown, true);
    this._focusInitial();
    return new Promise((resolve) => {
      this._resolve = resolve;
    });
  }

  close(value) {
    if (!this._open)
      return;
    this._open = false;
    this._backdrop.style.display = "none";
    document.removeEventListener("keydown", this._onKeyDown, true);
    if (this._backdrop.parentNode)
      this._backdrop.parentNode.removeChild(this._backdrop);
    const resolve = this._resolve;
    this._resolve = null;
    if (resolve)
      resolve(value);
  }

  // Tear down all DOM and listeners. For hosts (e.g. a Leaflet control) that
  // build a long-lived modal and need to dispose of it.
  destroy() {
    document.removeEventListener("keydown", this._onKeyDown, true);
    this._resolve = null;
    this._open = false;
    if (this._backdrop.parentNode)
      this._backdrop.parentNode.removeChild(this._backdrop);
  }

  _handleKeyDown(e) {
    if (e.key === "Escape" && this._dismissible)
      this.close();
  }

  _focusInitial() {
    const target =
      this._focusTarget ||
      this._primaryButton ||
      this._body.querySelector("input, select, textarea, button") ||
      this._closeBtn;
    if (!target || typeof target.focus !== "function")
      return;
    target.focus();
    if (target.tagName === "INPUT" && typeof target.select === "function")
      target.select();
  }

  // === Static convenience dialogs ================================================

  // Resolves true (OK), false (Cancel), or undefined (dismissed) — all of which
  // a plain `if (!result)` treats as "do not proceed".
  static confirm({
    title = "",
    message = "",
    okLabel = "OK",
    cancelLabel = "Cancel",
  } = {}) {
    const modal = new Modal({ title });
    const p = document.createElement("p");
    p.className = "modalMessage";
    p.textContent = message;
    modal.setContent(p);
    modal.setButtons([
      { label: cancelLabel, variant: "secondary", value: false },
      { label: okLabel, variant: "primary", primary: true, value: true },
    ]);
    return modal.open();
  }

  // Resolves the entered string (OK), null (Cancel), or undefined (dismissed).
  static prompt({
    title = "",
    message = "",
    value = "",
    placeholder = "",
    okLabel = "OK",
    cancelLabel = "Cancel",
    inputType = "text",
    inputMode = null,
  } = {}) {
    const modal = new Modal({ title });
    const wrap = document.createElement("div");
    wrap.className = "modalForm";
    if (message) {
      const label = document.createElement("label");
      label.className = "modalMessage";
      label.textContent = message;
      wrap.appendChild(label);
    }
    const input = document.createElement("input");
    input.type = inputType;
    input.className = "modalInput";
    input.value = value == null ? "" : String(value);
    if (placeholder)
      input.placeholder = placeholder;
    if (inputMode)
      input.setAttribute("inputmode", inputMode);
    wrap.appendChild(input);
    modal.setContent(wrap);
    modal.setButtons([
      { label: cancelLabel, variant: "secondary", value: null },
      {
        label: okLabel,
        variant: "primary",
        primary: true,
        onClick: (m) => m.close(input.value),
      },
    ]);
    modal.setFocusTarget(input);
    return modal.open();
  }
}

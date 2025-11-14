import { LitElement, html, css } from "https://unpkg.com/lit@3.1.2/index.js?module";
import { when } from "https://unpkg.com/lit@3.1.2/directives/when.js?module";
import { repeat } from "https://unpkg.com/lit@3.1.2/directives/repeat.js?module";
import { classMap } from "https://unpkg.com/lit@3.1.2/directives/class-map.js?module";
class DevicePulseTimeline extends LitElement {
  static properties = {
    _events: { state: true },
    _forceVertical: { state: true },
    _filterByDeviceId: { state: true },
    _highlightByDeviceId: { state: true }
  };
  constructor() {
    super();
    this._hass = null;
    this._initialized = false;
    this._config = {};
    this._devices = {};
    this._events = [];
    this._unsubscribes = [];
    this._resizeObserver = null;
    this._forceVertical = false;
    this._filterByDeviceId = null;
    this._highlightByDeviceId = null;
  }
  static getStubConfig() {
    return {
      title: "Network Devices Events Timeline",
      hours_back: 24,
      orientation: "horizontal",
      device_name_clip: true,
      responsive_orientation: true,
      responsive_breakpoint: 480
    };
  }
  static getConfigElement() {
    return document.createElement("device-pulse-timeline-editor");
  }
  set hass(hass) {
    if (!this._hass) {
      this._hass = hass;
      this._loadResources();
      this._subscribeToEvents();
    }
  }
  setConfig(config) {
    this._config = {
      title: config.title || "Network Devices Events Timeline",
      hours_back: config.hours_back || 24,
      orientation: config.orientation || "horizontal",
      device_name_clip: config.device_name_clip || true,
      responsive_orientation: config.responsive_orientation || true,
      responsive_breakpoint: config.responsive_breakpoint || 767,
      ...config
    };
  }
  async _subscribeToEvents() {
    if (!this._hass?.connection || this._unsubscribes?.length) {
      return;
    }
    try {
      this._unsubscribes.push(await this._hass.connection.subscribeEvents((event) => this._handleEvent(event, "connected"), "device_pulse_device_came_online"));
      this._unsubscribes.push(await this._hass.connection.subscribeEvents((event) => this._handleEvent(event, "disconnected"), "device_pulse_device_went_offline"));
    } catch (error) {
      console.error("Unable to subscribe to events:", error);
    }
  }
  connectedCallback() {
    super.connectedCallback();
    this._resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        this._width = width;
        this._checkResponsiveBreakpoint(width);
      }
    });
    this._resizeObserver.observe(this);
  }
  disconnectedCallback() {
    if (this._unsubscribe?.length) {
      this._unsubscribes.forEach((unsub) => unsub());
      this._unsubscribes = [];
    }
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
    }
    super.disconnectedCallback();
  }
  async _loadCSS() {
    try {
      const response = await fetch("/local/device-pulse-timeline/device-pulse-timeline.css");
      const css2 = await response.text();
      const style = document.createElement("style");
      style.textContent = css2;
      this.renderRoot.appendChild(style);
    } catch (error) {
      console.error("Unable to load card CSS file:", error);
    }
  }
  async _loadDevices() {
    const devices = await this._hass.callWS({ type: "config/device_registry/list" });
    this._devices = Object.fromEntries(devices.map((d) => [d.id, d.name_by_user || d.name]));
  }
  async _loadEvents() {
    try {
      const result = await this._hass.callWS({
        type: "device_pulse/get_events",
        hours_back: this._config.hours_back.toString()
      });
      if (result && result.events) {
        this._initialized = true;
        let events = result.events.map((event) => {
          const datetime = event.event_type === "disconnected" ? event.disconnected_since : event.reconnected_at;
          return {
            type: event.event_type,
            device_id: event.device_id,
            device_name: this._devices[event.device_id] || "Unknown Device",
            datetime: new Date(datetime)
          };
        });
        this._events = this._sortEvents(events);
      }
    } catch (error) {
      console.error("Unable to load Device Pulse events:", error);
    }
  }
  async _loadResources() {
    await Promise.all([
      this._loadCSS(),
      this._loadDevices()
    ]);
    await this._loadEvents();
  }
  _handleEvent(original, type) {
    const data = original.data;
    const datetime = type === "disconnected" ? data.disconnected_since : data.reconnected_at;
    const event = {
      type,
      device_id: data.device_id,
      device_name: this._devices[data.device_id] || "Unknown Device",
      datetime: new Date(datetime),
      fresh: true
    };
    this._events = this._sortEvents([event, ...this._events]);
  }
  _checkResponsiveBreakpoint = (width) => {
    if (this._config?.responsive_orientation && this._config?.responsive_breakpoint) {
      this._forceVertical = width < this._config.responsive_breakpoint;
    } else {
      this._forceVertical = false;
    }
  };
  _sortEvents(events) {
    return events.sort((a, b) => b.datetime.getTime() - a.datetime.getTime());
  }
  _filterByDevice(deviceId) {
    this._filterByDeviceId = deviceId;
  }
  _highlightByDevice(deviceId) {
    this._highlightByDeviceId = deviceId;
  }
  getCardSize() {
    return 4;
  }
  getGridOptions() {
    return {
      rows: 4,
      min_rows: 4
    };
  }
  render() {
    const today = /* @__PURE__ */ new Date();
    const yesterday = /* @__PURE__ */ new Date();
    yesterday.setDate(today.getDate() - 1);
    function formatEventTime(time) {
      return time.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
    }
    function formatTimelineDate(date) {
      if (date.toDateString() === today.toDateString()) return "Today";
      if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
      return date.toLocaleDateString(void 0, { weekday: "short", month: "short", day: "numeric" });
    }
    let events = !this._filterByDeviceId ? this._events : this._events.filter((ev) => ev.device_id == this._filterByDeviceId);
    let orientation = this._forceVertical ? "vertical" : this._config.orientation;
    let shiftLeft = "none";
    if (orientation === "horizontal") {
      if (events[0]?.type === "disconnected") {
        shiftLeft = "double";
      } else if (events[1]?.type === "disconnected") {
        shiftLeft = "single";
      }
    }
    return html`
            <ha-card>
                <div class="card">
                    <div class="header">
                        <h2>${this._config.title}</h2>
                        <p>Latest ${this._config.hours_back} hours</p>
                    </div>
                    <div class=${classMap({
      timeline: true,
      [`timeline-${orientation}`]: true,
      "timeline-empty": events.length === 0,
      "timeline-highlighting-events": this._highlightByDeviceId,
      "timeline-device-name-clip": this._config.device_name_clip
    })}>
                        <div class="timeline-content shift-${shiftLeft}">
                            ${when(
      events.length === 0,
      () => this._initialized ? html`<div class="timeline-empty-state"> No Events occurred in the last ${this._config.hours_back} hours </div>` : html``,
      () => repeat(
        events,
        (event) => event.datetime.getTime(),
        (event, index) => {
          const nextEvent = events[index + 1];
          const insertDate = !nextEvent || event.datetime.toDateString() !== nextEvent.datetime.toDateString();
          return html`
                                            <div class=${classMap({
            event: true,
            [`event-${event.type}`]: true,
            "event-highlight": this._highlightByDeviceId === event.device_id,
            "fade-in": event.fresh
          })}>
                                                <div class="event-marker ${event.type}"></div>
                                                <div class="event-content" @click=${() => this._highlightByDevice(!this._highlightByDeviceId ? event.device_id : null)}>
                                                    <div class="event-info">
                                                        <div class="event-time">${formatEventTime(event.datetime)}</div>
                                                        <div class="event-status ${event.type}">
                                                            <span class="event-status-dot"></span> ${event.type === "connected" ? "Connected" : "Disconnected"}
                                                        </div>
                                                    </div>
                                                    <div class="event-device">${event.device_name}</div>
                                                </div>
                                            </div>
                                            ${!insertDate ? "" : html`
                                                    <div class="timeline-marker timeline-marker-date">
                                                        <div class="timeline-marker-content">${formatTimelineDate(event.datetime)}</div>
                                                    </div>
                                                `}
                                        `;
        }
      )
    )}
                        </div>
                    </div>
                </div>
            </ha-card>
        `;
  }
}
class DevicePulseTimelineEditor extends LitElement {
  static properties = {
    _config: { state: true }
  };
  setConfig(config) {
    this._config = config;
  }
  _valueChanged(evt) {
    const target = evt.target;
    if (!this._config || !target) {
      return;
    }
    let config = {
      ...this._config,
      ...evt.detail.value
    };
    if (config.orientation === "horizontal") {
      config = { ...config, device_name_clip: true };
      if (!config.responsive_orientation) {
        config = { ...config, responsive_breakpoint: null };
      }
    }
    const event = new Event("config-changed", {
      bubbles: true,
      composed: true
    });
    event.detail = { config };
    this.dispatchEvent(event);
  }
  _computeLabel(schema) {
    switch (schema.name) {
      case "title":
        return "Card Title";
      case "hours_back":
        return "Hours Back";
      case "orientation":
        return "Orientation Mode";
      case "device_name_clip":
        return "Clip Device Name";
      case "responsive_orientation":
        return "Responsive Orientation";
      case "responsive_breakpoint":
        return "Responsive Breakpoint";
    }
    return void 0;
  }
  _computeHelper(schema) {
    switch (schema.name) {
      case "device_name_clip":
        return "Truncate device names that are too long instead of wrapping them";
      case "responsive_orientation":
        return "Automatically revert to vertical orientation if there is no enough space";
    }
    return void 0;
  }
  render() {
    if (!this._config) {
      return html``;
    }
    const isVertical = this._config.orientation === "vertical";
    const hasResponsiveBreakpoint = !isVertical && this._config.responsive_orientation;
    const schema = [
      { name: "title", selector: {
        text: {}
      } },
      {
        type: "grid",
        name: "",
        schema: [
          { name: "hours_back", required: true, selector: {
            number: {
              min: 1,
              max: 24 * 10,
              step: 1,
              mode: "box"
            }
          } },
          { name: "orientation", required: true, selector: {
            select: {
              mode: "dropdown",
              multiple: false,
              options: [
                { value: "horizontal", label: "Horizontal" },
                { value: "vertical", label: "Vertical" }
              ]
            }
          } },
          ...isVertical ? [{ name: "device_name_clip", required: true, selector: {
            boolean: {}
          } }] : [
            { name: "responsive_orientation", required: true, selector: {
              boolean: {}
            } },
            ...hasResponsiveBreakpoint ? [{ name: "responsive_breakpoint", required: true, selector: {
              number: {
                min: 280,
                max: 1024,
                step: 1,
                mode: "slider"
              }
            } }] : []
          ]
        ]
      }
    ];
    return html`
            <ha-form
                .hass=${this.hass}
                .data=${this._config}
                .schema=${schema}
                .computeLabel=${this._computeLabel}
                .computeHelper=${this._computeHelper}
                @value-changed=${this._valueChanged}
            ></ha-form>
        `;
  }
}
customElements.define("device-pulse-timeline", DevicePulseTimeline);
customElements.define("device-pulse-timeline-editor", DevicePulseTimelineEditor);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "device-pulse-timeline",
  name: "Device Pulse Timeline",
  description: "Device Pulse Integration Connection/Disconnection Events Timeline",
  preview: true,
  documentationURL: "https://github.com/studiobts/home-assistant-device-pulse-timeline-card"
});

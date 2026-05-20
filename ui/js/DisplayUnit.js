// DisplayUnit centralizes display-unit conversion + formatting. The static
// `config` mirrors the signalk-units-preferences profile shape: a `categories`
// map keyed by category name (distance, speed, depth, etc.) with formula,
// inverseFormula, symbol, and displayFormat. Callers pass a SignalK delta
// envelope; we read `meta.category` to pick the right entry.
//
// `loadActive` fires on module import to fetch the user's active profile from
// `/signalk/v1/unitpreferences/active`. It fails silently — older SignalK
// servers without the units-preferences plugin will simply keep the default
// (Nautical-Metric) config below.

import { evaluate } from "mathjs/number";

const DEFAULT_CONFIG = {
  version: "1.0.0",
  name: "Nautical (Metric)",
  description: "Nautical speed/distance (knots, nautical miles) with metric units",
  categories: {
    distance: {
      baseUnit: "m",
      targetUnit: "naut-mile",
      displayFormat: "0.0",
      formula: "value * 0.0005399568034557236",
      inverseFormula: "value / 0.0005399568034557236",
      symbol: "nmi",
    },
    speed: {
      baseUnit: "m/s",
      targetUnit: "kn",
      displayFormat: "0.0",
      formula: "value * 1.94384",
      inverseFormula: "value * 0.514444",
      symbol: "kn",
    },
    temperature: {
      baseUnit: "K",
      targetUnit: "C",
      displayFormat: "0.0",
      formula: "value - 273.15",
      inverseFormula: "value + 273.15",
      symbol: "°C",
    },
    pressure: {
      baseUnit: "Pa",
      targetUnit: "mbar",
      displayFormat: "0",
      formula: "value * 0.01",
      inverseFormula: "value * 100",
      symbol: "mbar",
    },
    depth: {
      baseUnit: "m",
      targetUnit: "m",
      displayFormat: "0.0",
    },
    volume: {
      baseUnit: "m3",
      targetUnit: "liter",
      displayFormat: "0.0",
      formula: "value * 1000",
      inverseFormula: "value / 1000",
      symbol: "liter",
    },
    angle: {
      baseUnit: "rad",
      targetUnit: "degree",
      displayFormat: "0.0",
      formula: "value * 57.29577951308231",
      inverseFormula: "value / 57.29577951308231",
      symbol: "°",
    },
    length: {
      baseUnit: "m",
      targetUnit: "m",
      displayFormat: "0.0",
    },
    angularVelocity: {
      baseUnit: "rad/s",
      targetUnit: "deg/s",
      displayFormat: "0.0",
      formula: "value * 57.2958",
      inverseFormula: "value * 0.0174533",
      symbol: "°/s",
    },
    voltage: {
      baseUnit: "V",
      targetUnit: "V",
      displayFormat: "0.00",
      formula: "value * 1",
      inverseFormula: "value * 1",
      symbol: "V",
    },
    current: {
      baseUnit: "A",
      targetUnit: "A",
      displayFormat: "0.00",
      formula: "value * 1",
      inverseFormula: "value * 1",
      symbol: "A",
    },
    power: {
      baseUnit: "W",
      targetUnit: "W",
      displayFormat: "0.00",
    },
    percentage: {
      baseUnit: "ratio",
      targetUnit: "percent",
      displayFormat: "0",
      formula: "value * 100",
      inverseFormula: "value * 0.01",
      symbol: "%",
    },
    frequency: {
      baseUnit: "Hz",
      targetUnit: "rpm",
      displayFormat: "0.0",
      formula: "value * 60",
      inverseFormula: "value * 0.0166667",
      symbol: "rpm",
    },
    time: {
      baseUnit: "s",
      targetUnit: "hour",
      displayFormat: "0.0",
      formula: "value * 0.0002777777777777778",
      inverseFormula: "value / 0.0002777777777777778",
      symbol: "hour",
    },
    dateTime: {
      baseUnit: "RFC 3339 (UTC)",
      targetUnit: "short-date",
      displayFormat: "short-date",
    },
    charge: {
      baseUnit: "C",
      targetUnit: "Ah",
      displayFormat: "0.0",
      formula: "value * 0.0002777777777777778",
      inverseFormula: "value / 0.0002777777777777778",
      symbol: "Ah",
    },
    volumeRate: {
      baseUnit: "m3/s",
      targetUnit: "L/h",
      displayFormat: "0.0",
      formula: "value * 3600000",
      inverseFormula: "value * 0.000000277778",
      symbol: "L/h",
    },
    energy: {
      baseUnit: "J",
      targetUnit: "J",
      displayFormat: "0.0",
      formula: "value * 1",
      inverseFormula: "value / 1",
      symbol: "joule",
    },
    mass: {
      baseUnit: "kg",
      targetUnit: "kg",
      displayFormat: "0.0",
    },
    area: {
      baseUnit: "m2",
      targetUnit: "m2",
      displayFormat: "0.0",
      formula: "value",
      inverseFormula: "value",
      symbol: "m2",
    },
    angleDegrees: {
      baseUnit: "deg",
      targetUnit: "deg",
      displayFormat: "0.0",
    },
    boolean: {
      baseUnit: "bool",
      targetUnit: "bool",
      displayFormat: "boolean",
      formula: "value",
      inverseFormula: "value",
      symbol: "",
    },
  },
};

export class DisplayUnit {
  static config = DEFAULT_CONFIG;

  // Fetch the user's active units-preferences profile and swap it in. Silent on
  // failure so older SignalK servers without the plugin keep the default config.
  static loadActive(baseUrl = "") {
    return fetch(`${baseUrl}/signalk/v1/unitpreferences/active`)
      .then((response) => (response.ok ? response.json() : null))
      .then((profile) => {
        if (profile && profile.categories)
          DisplayUnit.config = profile;
      })
      .catch(() => { });
  }

  static _categoryConfig(delta) {
    const category = delta?.meta?.displayUnits?.category;
    if (!category)
      return null;
    return DisplayUnit.config?.categories?.[category] ?? null;
  }

  static convertToDisplay(delta, value = false) {
    if (value === false)
      value = delta?.value;
    const cfg = DisplayUnit._categoryConfig(delta);
    let symbol = "";
    let format = null;
    if (cfg) {
      if (cfg.formula && typeof value === "number")
        value = evaluate(cfg.formula, { value });
      if (cfg.symbol)
        symbol = cfg.symbol;
      else if (cfg.targetUnit)
        symbol = cfg.targetUnit;
      format = cfg.displayFormat ?? null;
    }

    return { value, symbol, format };
  }

  static convertFromDisplay(delta, value) {
    const cfg = DisplayUnit._categoryConfig(delta);
    if (cfg?.inverseFormula && typeof value === "number")
      value = evaluate(cfg.inverseFormula, { value });
    return value;
  }

  static formatDisplay(delta, decimals = false, value = false) {
    if (!delta)
      return "";
    if (value === false && (delta.value === undefined || delta.value === null))
      return "";

    const { value: converted, symbol, format } = this.convertToDisplay(delta, value);

    let text;
    if (format && typeof converted === "number") {
      if (decimals === false)
        decimals = (format.split(".")[1] || "").length;
      text = converted.toFixed(decimals);
    } else {
      text = String(converted);
    }

    return symbol ? `${text} ${symbol}` : text;
  }
}

DisplayUnit.loadActive();

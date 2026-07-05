const WindBarb = Object.freeze({
  // Fill/stroke are left unset so the calm-wind glyph inherits the themed
  // color from the `.wind-barb` <svg> (see style.css), like every other barb.
  knot0:
    '<path d="M125,120c2.762,0,5,2.239,5,5c0,2.762-2.238,5-5,5c-2.761,0-5-2.238-5-5C120,122.239,122.239,120,125,120z"/><path fill="none" stroke-width="2" d="M125,115c5.523,0,10,4.477,10,10c0,5.523-4.477,10-10,10 c-5.523,0-10-4.477-10-10C115,119.477,119.477,115,125,115z "/>',
  knot2: '<path class="svg-wb" d="M125,112V76 M125,125l7-12.1h-14L125,125z"/>',
  knot5:
    '<path class="svg-wb" d="M125,112V76 M125,89l7-7 M125,125l7-12.1h-14L125,125z"/>',
  knot10:
    '<path class="svg-wb" d="M125,112V89 M125,89l14-14 M125,125l7-12.1h-14L125,125z"/>',
  knot15:
    '<path class="svg-wb" d="M125,112V89 M125,89l14-14 M125,100l7-7 M125,125l7-12.1h-14L125,125z"/>',
  knot20:
    '<path class="svg-wb" d="M125,112V89 M125,89l14-14 M125,100l14-14 M125,125l7-12.1h-14L125,125z"/>',
  knot25:
    '<path class="svg-wb" d="M125,112V79 M125,79l14-14 M125,90l14-14 M125,100l7-7 M125,125l7-12.1h-14L125,125z"/>',
  knot30:
    '<path class="svg-wb" d="M125,112V79 M125,79l14-14 M125,90l14-14 M125,100l14-14 M125,125l7-12.1h-14L125,125z"/>',
  knot35:
    '<path class="svg-wb" d="M125,112V69 M125,69l14-14 M125,80l14-14 M125,90l14-14 M125,100l7-7 M125,125l7-12.1h-14L125,125z"/>',
  knot40:
    '<path class="svg-wb" d="M125,112V69 M125,69l14-14 M125,80l14-14 M125,90l14-14 M125,100l14-14 M125,125l7-12.1h-14L125,125z"/>',
  knot45:
    '<path class="svg-wb" d="M125,112V59 M125,59l14-14 M125,70l14-14 M125,80l14-14 M125,90l14-14 M125,100l7-7 M125,125l7-12.1h-14 L125,125z"/>',
  knot50:
    '<path class="svg-wb" d="M125,112V76 M125,76h14l-14,14V76z M125,125l7-12.1h-14L125,125z"/>',
  knot55:
    '<path class="svg-wb" d="M125,112V76 M125,76h14l-14,14V76z M125,100l7-7 M125,125l7-12.1h-14L125,125z"/>',
  knot60:
    '<path class="svg-wb" d="M125,112V76 M125,76h14l-14,14V76z M125,100l14-14 M125,125l7-12.1h-14L125,125z"/>',
  knot65:
    '<path class="svg-wb" d="M125,112V66 M125,66h14l-14,14V66z M125,90l14-14 M125,100l7-7 M125,125l7-12.1h-14L125,125z"/>',
  knot70:
    '<path class="svg-wb" d="M125,112V66 M125,66h14l-14,14V66z M125,90l14-14 M125,100l14-14 M125,125l7-12.1h-14L125,125z"/>',
  knot75:
    '<path class="svg-wb" d="M125,112V56 M125,56h14l-14,14V56z M125,80l14-14 M125,90l14-14 M125,100l7-7 M125,125l7-12.1h-14L125,125z"/>',
  knot80:
    '<path class="svg-wb" d="M125,112V56 M125,56h14l-14,14V56z M125,80l14-14 M125,90l14-14 M125,100l14-14 M125,125l7-12.1h-14L125,125z"/>',
  knot85:
    '<path class="svg-wb" d="M125,112V46 M125,46h14l-14,14V46z M125,70l14-14 M125,80l14-14 M125,90l14-14 M125,100l7-7 M125,125l7-12.1 h-14L125,125z"/>',
  knot90:
    '<path class="svg-wb" d="M125,112V46 M125,46h14l-14,14V46z M125,70l14-14 M125,80l14-14 M125,90l14-14 M125,100l14-14 M125,125l7-12.1 h-14L125,125z"/>',
  knot95:
    '<path class="svg-wb" d="M125,112V36 M125,36h14l-14,14V36z M125,60l14-14 M125,70l14-14 M125,80l14-14 M125,90l14-14 M125,100l7-7 M125,125l7-12.1h-14L125,125z"/>',
  knot100:
    '<path class="svg-wb" d="M125,112V62 M125,62h14l-14,14V62z M125,76h14l-14,14V76z M125,125l7-12.1h-14L125,125z"/>',
  knot105:
    '<path class="svg-wb" d="M125,112V62 M125,62h14l-14,14V62z M125,76h14l-14,14V76z M125,100l7-7 M125,125l7-12.1h-14L125,125z"/>',
  knot110:
    '<path class="svg-wb" d="M125,112V62 M125,62h14l-14,14V62z M125,76h14l-14,14V76z M125,100l14-14 M125,125l7-12.1h-14L125,125z"/>',
  knot115:
    '<path class="svg-wb" d="M125,112V52 M125,52h14l-14,14V52z M125,66h14l-14,14V66z M125,90l14-14 M125,100l7-7 M125,125l7-12.1h-14 L125,125z"/>',
  knot120:
    '<path class="svg-wb" d="M125,112V52 M125,52h14l-14,14V52z M125,66h14l-14,14V66z M125,90l14-14 M125,100l14-14 M125,125l7-12.1h-14 L125,125z"/>',
  knot125:
    '<path class="svg-wb" d="M125,112V42 M125,42h14l-14,14V42z M125,56h14l-14,14V56z M125,80l14-14 M125,90l14-14 M125,100l7-7 M125,125 l7-12.1h-14L125,125z"/>',
  knot130:
    '<path class="svg-wb" d="M125,112V42 M125,42h14l-14,14V42z M125,56h14l-14,14V56z M125,80l14-14 M125,90l14-14 M125,100l14-14 M125,125 l7-12.1h-14L125,125z"/>',
  knot135:
    '<path class="svg-wb" d="M125,112V32 M125,32h14l-14,14V32z M125,46h14l-14,14V46z M125,70l14-14 M125,80l14-14 M125,90l14-14 M125,100 l7-7 M125,125l7-12.1h-14L125,125z"/>',
  knot140:
    '<path class="svg-wb" d="M125,112V32 M125,32h14l-14,14V32z M125,46h14l-14,14V46z M125,70l14-14 M125,80l14-14 M125,90l14-14 M125,100 l14-14 M125,125l7-12.1h-14L125,125z"/>',
  knot145:
    '<path class="svg-wb" d="M125,112V22 M125,22h14l-14,14V22z M125,36h14l-14,14V36z M125,60l14-14 M125,70l14-14 M125,80l14-14 M125,90 l14-14 M125,100l7-7 M125,125l7-12.1h-14L125,125z"/>',
  knot150:
    '<path class="svg-wb" d="M125,112V48 M125,48h14l-14,14V48z M125,62h14l-14,14V62z M125,76h14l-14,14V76z M125,125l7-12.1h-14L125,125z"/>',
  knot155:
    '<path class="svg-wb" d="M125,112V48 M125,48h14l-14,14V48z M125,62h14l-14,14V62z M125,76h14l-14,14V76z M125,100l7-7 M125,125l7-12.1 h-14L125,125z"/>',
  knot160:
    '<path class="svg-wb" d="M125,112V48 M125,48h14l-14,14V48z M125,62h14l-14,14V62z M125,76h14l-14,14V76z M125,100l14-14 M125,125 l7-12.1h-14L125,125z"/>',
  knot165:
    '<path class="svg-wb" d="M125,112V38 M125,38h14l-14,14V38z M125,52h14l-14,14V52z M125,66h14l-14,14V66z M125,90l14-14 M125,100l7-7 M125,125l7-12.1h-14L125,125z"/>',
  knot170:
    '<path class="svg-wb" d="M125,112V38 M125,38h14l-14,14V38z M125,52h14l-14,14V52z M125,66h14l-14,14V66z M125,90l14-14 M125,100l14-14 M125,125l7-12.1h-14L125,125z"/>',
  knot175:
    '<path class="svg-wb" d="M125,112V28 M125,28h14l-14,14V28z M125,42h14l-14,14V42z M125,56h14l-14,14V56z M125,80l14-14 M125,90l14-14 M125,100l7-7 M125,125l7-12.1h-14L125,125z"/>',
  knot180:
    '<path class="svg-wb" d="M125,112V28 M125,28h14l-14,14V28z M125,42h14l-14,14V42z M125,56h14l-14,14V56z M125,80l14-14 M125,90l14-14 M125,100l14-14 M125,125l7-12.1h-14L125,125z"/>',
  knot185:
    '<path class="svg-wb" d="M125,112V18 M125,18h14l-14,14V18z M125,32h14l-14,14V32z M125,46h14l-14,14V46z M125,70l14-14 M125,80l14-14 M125,90l14-14 M125,100l7-7 M125,125l7-12.1h-14L125,125z"/>',
  knot190:
    '<path class="svg-wb" d="M125,112V18 M125,18h14l-14,14V18z M125,32h14l-14,14V32z M125,46h14l-14,14V46z M125,70l14-14 M125,80l14-14 M125,90l14-14 M125,100l14-14 M125,125l7-12.1h-14L125,125z"/>',
});

const computeMinY = function (svgInner) {
  let minY = Infinity;
  const dAttrRe = /\bd="([^"]+)"/g;
  let dMatch;
  while ((dMatch = dAttrRe.exec(svgInner)) !== null) {
    const tokens = dMatch[1].match(/-?\d+(?:\.\d+)?|[a-zA-Z]/g) || [];
    let cx = 0,
      cy = 0,
      cmd = null;
    let i = 0;

    while (i < tokens.length) {
      const t = tokens[i];
      if (/[a-zA-Z]/.test(t)) {
        cmd = t;
        i++;
        continue;
      }

      switch (cmd) {
        case "M":
          cx = +tokens[i++];
          cy = +tokens[i++];
          minY = Math.min(minY, cy);
          cmd = "L";
          break;
        case "m":
          cx += +tokens[i++];
          cy += +tokens[i++];
          minY = Math.min(minY, cy);
          cmd = "l";
          break;
        case "L":
          cx = +tokens[i++];
          cy = +tokens[i++];
          minY = Math.min(minY, cy);
          break;
        case "l":
          cx += +tokens[i++];
          cy += +tokens[i++];
          minY = Math.min(minY, cy);
          break;
        case "V":
          cy = +tokens[i++];
          minY = Math.min(minY, cy);
          break;
        case "v":
          cy += +tokens[i++];
          minY = Math.min(minY, cy);
          break;
        case "H":
          cx = +tokens[i++];
          break;
        case "h":
          cx += +tokens[i++];
          break;
        case "C": {
          /* eslint-disable no-unused-vars */
          const x1 = +tokens[i++],
            y1 = +tokens[i++];
          const x2 = +tokens[i++],
            y2 = +tokens[i++];
          cx = +tokens[i++];
          cy = +tokens[i++];
          minY = Math.min(minY, y1, y2, cy);
          break;
        }
        case "c": {
          const dx1 = +tokens[i++],
            dy1 = +tokens[i++];
          const dx2 = +tokens[i++],
            dy2 = +tokens[i++];
          const dx = +tokens[i++],
            dy = +tokens[i++];
          minY = Math.min(minY, cy + dy1, cy + dy2, cy + dy);
          cx += dx;
          cy += dy;
          break;
        }
        case "Z":
        case "z":
          break;
        default:
          i++;
          break;
      }
    }
  }
  return minY;
};

const VIEWBOX_X = 113;
const VIEWBOX_WIDTH = 28;
const VIEWBOX_BOTTOM = 137;
const VIEWBOX_TOP_PADDING = 2;

const WindBarbViewBox = Object.freeze(
  Object.fromEntries(
    Object.entries(WindBarb).map(([key, path]) => {
      const minY = computeMinY(path);
      const top = Math.floor(minY - VIEWBOX_TOP_PADDING);
      return [
        key,
        `${VIEWBOX_X} ${top} ${VIEWBOX_WIDTH} ${VIEWBOX_BOTTOM - top}`,
      ];
    }),
  ),
);

const roundToNearest = function (value, nearest) {
  return Math.round(value / nearest) * nearest;
};

const roundDownToNearest = function (value, nearest) {
  return Math.floor(value / nearest) * nearest;
};

const metersPerSecondToKnots = function (mps) {
  return mps * 1.943844;
};

const hasNestedProperty = (obj, prop, ...rest) => {
  if (obj === undefined) {
    return false;
  }

  if (rest.length === 0 && Object.prototype.hasOwnProperty.call(obj, prop)) {
    return true;
  }

  return hasNestedProperty(obj[prop], ...rest);
};

const getSvgKey = function (windSpeed) {
  // Base case that breaks the pattern of 2.5 m/s steps
  if (windSpeed >= 1.0 && windSpeed < 2.5) {
    return "knot2";
  }

  const meterPerSecondStep = 2.5;
  const lowerMeterPerSecond = roundDownToNearest(windSpeed, meterPerSecondStep);

  const knots = metersPerSecondToKnots(lowerMeterPerSecond);

  const knotPerSecondStep = 5;
  const lowerKnotPerSecond = roundToNearest(knots, knotPerSecondStep);

  const windBarbName = `knot${lowerKnotPerSecond}`;
  if (hasNestedProperty(WindBarb, windBarbName)) {
    return windBarbName;
  }

  return "knot0";
};

const getSvgPath = function (windSpeed) {
  return WindBarb[getSvgKey(windSpeed)];
};

export const getWindBarb = function (windSpeed) {
  const key = getSvgKey(windSpeed);
  return `
        <svg xmlns="http://www.w3.org/2000/svg" class="wind-barb" viewBox="${WindBarbViewBox[key]}">
            ${WindBarb[key]}
        </svg>
    `;
};

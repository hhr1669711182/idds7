export const getSVGForSrcById = ({
  symbolId = "icon-symbol-one",
  color = "red",
}: {
  symbolId: string;
  color: string;
}) => {
  let svgstr = getSVGElementById({ symbolId, color });
  let src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgstr);

  return src;
};

export const getSVGElementById = ({
  symbolId,
  color = "red",
}: {
  symbolId: string | undefined;
  color: string;
}) => {
  symbolId = symbolId || "icon-symbol-one";
  var oSvg = document.querySelector(`symbol#${symbolId}`);
  let paths = "";
  if (oSvg) {
    var pathRegex = /<path[^>]*>[^<]*<\/path>/gi;
    var pathMatches = oSvg.outerHTML.match(pathRegex);
    if (pathMatches && pathMatches.length) {
      paths = pathMatches.join("");
    }
  }

  var svgStr = `<svg xmlns="http://www.w3.org/2000/svg" id="${symbolId}" viewBox="0 0 1024 1024" height="36px" width="36px" fill="${color}">${paths}</svg>`;
  return svgStr;
};

function calculateAngle(adjustedAngle: number) {
  // 反推 angle
  let angle = (adjustedAngle + 90) % 360;

  // 根据范围调整
  if (angle < 270) {
    angle += 360;
  }
  return angle;
}

export const createAngleSVG = (Angles: { Angle: number; rotate: number }) => {
  const adjustedAngle = calculateAngle(Angles.Angle);
  const radius = 40; // 半径
  const centerX = 100; // 圆心 X 坐标
  const centerY = 100; // 圆心 Y 坐标
  const endY = centerY + radius * Math.cos((adjustedAngle * Math.PI) / 180);
  const endX = centerX - radius * Math.sin((adjustedAngle * Math.PI) / 180);
  const startY = centerX;
  const startX = centerY - radius;

  // const largeArcFlag = adjustedAngle > 180 ? 0 : 1;

  let largeArcFlag;
  if (adjustedAngle >= 450 && adjustedAngle <= 629) {
    largeArcFlag = 0;
  } else if (adjustedAngle >= 270 && adjustedAngle < 450) {
    largeArcFlag = 1;
  }

  const d_1 = `M ${startX} ${startY} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endX} ${endY}`;

  const d_2 = `M ${endX} ${endY} L ${startX} ${endY}  L${startX} ${startY}`;
  const angle = Math.abs(adjustedAngle);

  let lastD = d_1;
  if (angle == 540) {
    lastD = d_2;
  }

  let svgText =
    Angles.Angle == 90
      ? ""
      : `<text fill="black" font-size="16" text-anchor="middle">
            <textPath href="#arc" startOffset="50%" side="left">
                <tspan dy="-5">${Angles.Angle}°</tspan>
            </textPath>
        </text>`;

  const svgstr = `<svg width="200" height="200" viewBox="0 0 200 200" style="transform:rotate(${Angles.rotate}deg);transform-origin: 100px 100px;"  transform="rotate(${Angles.rotate})" xmlns="http://www.w3.org/2000/svg">
        <path id="arc" fill="none" stroke="red" stroke-width="1" d="${lastD}" />
${svgText}
    </svg>`;

  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgstr);
};

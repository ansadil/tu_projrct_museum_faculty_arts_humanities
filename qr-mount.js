function mountQrCode(containerId, text, sizeOrOptions, colorDark) {
  const el = document.getElementById(containerId);
  if (!el || typeof QRCode === "undefined") return;
  let width = 88;
  let height = 88;
  let dark = colorDark;
  if (sizeOrOptions != null && typeof sizeOrOptions === "object" && !Array.isArray(sizeOrOptions)) {
    width = sizeOrOptions.width ?? 88;
    height = sizeOrOptions.height ?? width;
    if (sizeOrOptions.colorDark != null) dark = sizeOrOptions.colorDark;
  } else if (typeof sizeOrOptions === "number") {
    width = height = sizeOrOptions;
  }
  if (dark == null || dark === "") dark = "#065f46";
  el.innerHTML = "";
  try {
    new QRCode(el, {
      text: String(text),
      width,
      height,
      colorDark: dark,
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.M,
    });
  } catch (error) {
    console.warn("QRCode mount failed.", error);
  }
}

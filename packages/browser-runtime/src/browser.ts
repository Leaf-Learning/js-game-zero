const target = document.querySelector<HTMLCanvasElement>("[data-jgz-phase-one-canvas]");

if (target) {
  const ctx = target.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#123a5a";
    ctx.fillRect(0, 0, target.width, target.height);
    ctx.fillStyle = "#f6c85f";
    ctx.beginPath();
    ctx.arc(target.width / 2, target.height / 2, 36, 0, Math.PI * 2);
    ctx.fill();
    const pixel = ctx.getImageData(0, 0, 1, 1).data;
    target.dataset.jgzPixel = Array.from(pixel).join(",");
    target.dataset.jgzNonblank = "true";
  }
}

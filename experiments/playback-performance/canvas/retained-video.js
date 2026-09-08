// Canvas video geometry is independent of the bounded diagnostic sample history.
export function drawRetainedVideo(context, frame, canvas, track) {
  const par = Number(track?.['demux-par']);
  const width = Number.isFinite(par) && par > 0 ? frame.visibleRect.width * par : frame.displayWidth;
  const height = Number.isFinite(par) && par > 0 ? frame.visibleRect.height : frame.displayHeight;
  const rotation = ((Number(track?.['demux-rotation']) || 0) % 360 + 360) % 360;
  // Opaque, unrotated video that covers every destination pixel needs no
  // preliminary black fill or temporary coordinate transform. Alpha formats,
  // letterboxing and rotated media retain the general compositor path.
  if (rotation === 0 && width * canvas.height === height * canvas.width &&
      ['NV12', 'I420', 'RGBX', 'BGRX'].includes(frame.format)) {
    context.drawImage(frame, 0, 0, canvas.width, canvas.height);
    return;
  }
  const radians = rotation * Math.PI / 180;
  const sin = Math.abs(Math.sin(radians)), cos = Math.abs(Math.cos(radians));
  const scale = Math.min(canvas.width / (width * cos + height * sin), canvas.height / (width * sin + height * cos));
  context.save();
  context.fillStyle = '#000';context.fillRect(0, 0, canvas.width, canvas.height);
  context.translate(canvas.width / 2, canvas.height / 2);context.rotate(radians);
  context.drawImage(frame, -width * scale / 2, -height * scale / 2, width * scale, height * scale);
  context.restore();
}

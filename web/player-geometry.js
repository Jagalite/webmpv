// mpv's dw/dh include pixel aspect ratio, but not display rotation.
export function displayAspect(params, track) {
  const positive = value => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : undefined;
  let width = positive(params?.dw), height = positive(params?.dh);
  if (!width || !height) {
    width = positive(params?.w) ?? positive(track?.['demux-w']);
    height = positive(params?.h) ?? positive(track?.['demux-h']);
    if (!width || !height) return undefined;
    width *= positive(params?.par) ?? positive(track?.['demux-par']) ?? 1;
  }
  const rotation = Number(params?.rotate ?? track?.['demux-rotation']) || 0;
  const radians = rotation * Math.PI / 180;
  const sin = Math.abs(Math.sin(radians)), cos = Math.abs(Math.cos(radians));
  const ratio = (width * cos + height * sin) / (width * sin + height * cos);
  return Number.isFinite(ratio) && ratio > 0 ? ratio : undefined;
}

export function outputDimensions(ratio) {
  const width = Math.min(1920, 1080 * ratio);
  return {width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(width / ratio))};
}

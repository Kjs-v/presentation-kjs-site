/**
 * Download the Marico film as PDF or PowerPoint: one page / slide per scene, showing the scene's last frame
 * with its caption, at 1920 × 1080. The PowerPoint slides also carry the caption text as speaker notes.
 * The PDF and PowerPoint libraries only download when someone clicks a download button.
 */
import type { Content, FilmScene } from '../../content/content.schema';

const OUT_W = 1920;
const OUT_H = 1080;

function notes(s: FilmScene): string {
  const lines =
    s.kind === 'title'
      ? [s.eyebrow, s.headline, s.subtitle]
      : [s.eyebrow, s.title, s.line, ...(s.stats ?? []).map((x) => `${x.value} ${x.label}`)];
  return lines.filter(Boolean).join('\n');
}

async function stills(content: Content): Promise<{ image: string; notes: string }[]> {
  const film = await import('../pages/marico-film');
  const assets = await film.loadAssets(content, true);
  await document.fonts?.ready;
  const canvas = document.createElement('canvas');
  canvas.width = OUT_W;
  canvas.height = OUT_H;
  const ctx = canvas.getContext('2d')!;
  const paint = film.painter(ctx, content, assets, { still: true });
  const k = OUT_W / film.W;
  return content.marico.scenes.map((s, i) => {
    ctx.setTransform(k, 0, 0, k, 0, 0);
    paint.background(0);
    paint.scene(i, s.seconds, 1);
    paint.caption(s);
    return { image: canvas.toDataURL('image/jpeg', 0.9), notes: notes(s) };
  });
}

export async function exportFilm(content: Content, format: 'pdf' | 'pptx'): Promise<void> {
  const shots = await stills(content);
  const name = content.marico.labels.fileName;
  if (format === 'pdf') {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'px',
      format: [OUT_W, OUT_H],
      hotfixes: ['px_scaling'],
    });
    shots.forEach((shot, i) => {
      if (i) doc.addPage([OUT_W, OUT_H], 'landscape');
      doc.addImage(shot.image, 'JPEG', 0, 0, OUT_W, OUT_H);
    });
    doc.save(`${name}.pdf`);
    return;
  }
  const { default: PptxGenJS } = await import('pptxgenjs');
  const pres = new PptxGenJS();
  pres.layout = 'LAYOUT_WIDE';
  pres.title = name;
  shots.forEach((shot) => {
    const slide = pres.addSlide();
    slide.addImage({ data: shot.image, x: 0, y: 0, w: 13.333, h: 7.5 });
    if (shot.notes) slide.addNotes(shot.notes);
  });
  await pres.writeFile({ fileName: `${name}.pptx` });
}

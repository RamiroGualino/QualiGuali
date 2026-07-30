import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';
import styles from './ImageAnnotator.module.css';

const TOOLS = ['rectangle', 'arrow', 'circle'];
const COLORS = ['#ef4444', '#eab308', '#22c55e', '#3b82f6', '#ffffff'];
const LINE_WIDTHS = [2, 4, 7];

function drawArrow(ctx, x1, y1, x2, y2) {
  const headLength = 14;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(
    x2 - headLength * Math.cos(angle - Math.PI / 6),
    y2 - headLength * Math.sin(angle - Math.PI / 6),
  );
  ctx.moveTo(x2, y2);
  ctx.lineTo(
    x2 - headLength * Math.cos(angle + Math.PI / 6),
    y2 - headLength * Math.sin(angle + Math.PI / 6),
  );
  ctx.stroke();
}

function drawShape(ctx, shape) {
  ctx.strokeStyle = shape.color;
  ctx.lineWidth = shape.lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (shape.type === 'rectangle') {
    ctx.strokeRect(
      shape.startX,
      shape.startY,
      shape.endX - shape.startX,
      shape.endY - shape.startY,
    );
  } else if (shape.type === 'circle') {
    const rx = Math.abs(shape.endX - shape.startX) / 2;
    const ry = Math.abs(shape.endY - shape.startY) / 2;
    const cx = (shape.startX + shape.endX) / 2;
    const cy = (shape.startY + shape.endY) / 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
    ctx.stroke();
  } else if (shape.type === 'arrow') {
    drawArrow(ctx, shape.startX, shape.startY, shape.endX, shape.endY);
  }
}

// Lightweight, dependency-free QA-style annotation tool: draws rectangles,
// arrows and circles over a pasted/selected image on a plain <canvas>
// (native browser API, no library) before it's uploaded as evidence.
// Shapes are kept as data (not baked into the canvas until read out), so
// Undo/Clear can redraw from scratch — image + remaining shapes.
//
// hideActions: opt-in — the quick-execution flow auto-uploads whatever's on
// the canvas the moment a result is submitted (see ExecutionDrawerContent's
// submitResult, which calls getAnnotatedFile via ref), so it doesn't need
// its own Cancel/Confirm; it renders `onRemove` (discard the pending photo)
// instead. Every other caller (staged defect evidence, editing already-
// uploaded evidence) has no such moment to piggyback on and keeps the
// explicit Cancel/Confirm footer.
export const ImageAnnotator = forwardRef(function ImageAnnotator(
  { file, onCancel, onConfirm, confirming = false, hideActions = false, onRemove },
  ref,
) {
  const { t } = useTranslation();
  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  const [imageSize, setImageSize] = useState(null);
  const [tool, setTool] = useState('rectangle');
  const [color, setColor] = useState(COLORS[0]);
  const [lineWidth, setLineWidth] = useState(LINE_WIDTHS[1]);
  const [shapes, setShapes] = useState([]);
  const [drawing, setDrawing] = useState(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.src = objectUrl;
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageRef.current || !imageSize) return;
    canvas.width = imageSize.width;
    canvas.height = imageSize.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imageRef.current, 0, 0);
    [...shapes, drawing].filter(Boolean).forEach((shape) => drawShape(ctx, shape));
  }, [shapes, drawing, imageSize]);

  function getCanvasPoint(event) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) * canvas.width) / rect.width,
      y: ((event.clientY - rect.top) * canvas.height) / rect.height,
    };
  }

  function handlePointerDown(event) {
    const { x, y } = getCanvasPoint(event);
    setDrawing({ type: tool, color, lineWidth, startX: x, startY: y, endX: x, endY: y });
  }

  function handlePointerMove(event) {
    if (!drawing) return;
    const { x, y } = getCanvasPoint(event);
    setDrawing((prev) => ({ ...prev, endX: x, endY: y }));
  }

  function finishDrawing() {
    if (!drawing) return;
    setShapes((prev) => [...prev, drawing]);
    setDrawing(null);
  }

  function getAnnotatedFile() {
    return new Promise((resolve) => {
      canvasRef.current.toBlob((blob) => {
        resolve(new File([blob], file.name, { type: file.type || 'image/png' }));
      }, file.type || 'image/png');
    });
  }

  useImperativeHandle(ref, () => ({ getAnnotatedFile }));

  function handleConfirm() {
    getAnnotatedFile().then(onConfirm);
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.toolbar}>
        <div className={styles.toolGroup}>
          {TOOLS.map((value) => (
            <button
              key={value}
              type="button"
              className={[styles.toolButton, tool === value && styles.toolButtonActive]
                .filter(Boolean)
                .join(' ')}
              onClick={() => setTool(value)}
              title={t(`evidenceAnnotator.tool_${value}`)}
            >
              {t(`evidenceAnnotator.tool_${value}`)}
            </button>
          ))}
        </div>
        <div className={styles.toolGroup}>
          {COLORS.map((value) => (
            <button
              key={value}
              type="button"
              className={[styles.colorSwatch, color === value && styles.colorSwatchActive]
                .filter(Boolean)
                .join(' ')}
              style={{ backgroundColor: value }}
              onClick={() => setColor(value)}
              aria-label={value}
            />
          ))}
        </div>
        <div className={styles.toolGroup}>
          {LINE_WIDTHS.map((value) => (
            <button
              key={value}
              type="button"
              className={[styles.widthButton, lineWidth === value && styles.widthButtonActive]
                .filter(Boolean)
                .join(' ')}
              onClick={() => setLineWidth(value)}
              aria-label={`${value}px`}
            >
              <span style={{ height: value }} className={styles.widthPreview} />
            </button>
          ))}
        </div>
        <div className={styles.toolGroup}>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setShapes((prev) => prev.slice(0, -1))}
            disabled={shapes.length === 0}
          >
            {t('evidenceAnnotator.undo')}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setShapes([])}
            disabled={shapes.length === 0}
          >
            {t('evidenceAnnotator.clear')}
          </Button>
        </div>
      </div>

      <div className={styles.canvasWrapper}>
        <canvas
          ref={canvasRef}
          className={styles.canvas}
          onMouseDown={handlePointerDown}
          onMouseMove={handlePointerMove}
          onMouseUp={finishDrawing}
          onMouseLeave={finishDrawing}
        />
      </div>

      {hideActions ? (
        onRemove && (
          <div className={styles.actions}>
            <Button type="button" variant="secondary" onClick={onRemove}>
              {t('common.remove')}
            </Button>
          </div>
        )
      ) : (
        <div className={styles.actions}>
          <Button type="button" variant="secondary" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={confirming}>
            {t('evidenceAnnotator.confirm')}
          </Button>
        </div>
      )}
    </div>
  );
});
